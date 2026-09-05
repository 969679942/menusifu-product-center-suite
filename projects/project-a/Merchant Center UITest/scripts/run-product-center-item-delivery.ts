import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type Stage = { id: string; npmScript: string; live?: boolean };
type StageState = { id: string; state: 'pending' | 'passed' | 'failed'; durationMs: number; diagnostic?: string };

const projectRoot = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const resume = args.has('--resume');
const fullLive = args.has('--full-live');
const preserveWorkspace = args.has('--preserve-workspace');
const checkpointPath = path.join(projectRoot, 'output/product-center-item-delivery-checkpoint.json');
const inputFingerprint = fingerprintInputs([
  path.resolve(projectRoot, '..', 'Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品.xmind'),
  path.resolve(projectRoot, '..', 'Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md'),
  path.join(projectRoot, 'output/product-center-item-213-failures/failure-pack.md'),
  path.join(projectRoot, 'scripts/build-product-center-item-rule-registry.ts'),
  path.join(projectRoot, 'scripts/build-product-center-item-final-release.ts'),
  path.join(projectRoot, 'scripts/build-product-center-business-rule-event-ledger.ts'),
  path.join(projectRoot, 'adapters/product-center/product-center-business-rule-event-adapter.ts'),
  path.join(projectRoot, 'contracts/product-center/business-rules/product-center-business-rule-landing-history.json'),
  path.resolve(projectRoot, '../..', 'Test Automation Platform/src/automation/system-test/business-rule-change-event.ts'),
  path.join(projectRoot, 'utils/product-center-item-test-plan-rules.ts'),
  path.join(projectRoot, 'contracts/product-center/business-rules/product-center-item-candidate-rules.json'),
  path.join(projectRoot, 'contracts/product-center/reviews/product-center-item-rule-confirmations.json'),
]);
const stages: Stage[] = [
  { id: 'manual-rule-import', npmScript: 'import:product-center:item-manual-decisions' },
  { id: 'xmind-rebuild', npmScript: 'build:product-center:item-xmind-rebuild' },
  { id: 'full-review', npmScript: 'build:product-center:item-full-review' },
  { id: 'formal-conversion', npmScript: 'run:product-center:item-formal-full-conversion' },
  { id: 'automation-generation', npmScript: 'generate:product-center:item-216-spec' },
  { id: 'authoritative-release-prep', npmScript: 'build:product-center:item-final-release' },
  { id: 'rule-governance', npmScript: 'build:product-center:item-rule-registry' },
  { id: 'authoritative-release', npmScript: 'build:product-center:item-final-release' },
  { id: 'business-rule-evaluation', npmScript: 'build:product-center:business-rule-evaluate-release' },
  { id: 'runtime-projection', npmScript: 'generate:product-center:item-216-spec' },
  { id: 'typecheck', npmScript: 'typecheck' },
  { id: 'release-contracts', npmScript: 'test:product-center:item-final-release' },
  ...(fullLive ? [{ id: 'live-213', npmScript: 'test:product-center:item-213', live: true }] : []),
  ...(preserveWorkspace ? [] : [{ id: 'workspace-cleanup', npmScript: 'clean:workspace' }]),
];
const prior = resume && fs.existsSync(checkpointPath)
  ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as { inputFingerprint: string; stages: StageState[] }
  : undefined;
const reusable = prior?.inputFingerprint === inputFingerprint
  ? new Set(prior.stages.filter((item) => item.state === 'passed').map((item) => item.id))
  : new Set<string>();
const states: StageState[] = [];
for (const stage of stages) {
  if (reusable.has(stage.id)) {
    states.push({ id: stage.id, state: 'passed', durationMs: 0, diagnostic: 'reused-by-matching-input-fingerprint' });
    continue;
  }
  const startedAt = Date.now();
  const npmCli = process.env.npm_execpath;
  const executable = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const commandArgs = npmCli ? [npmCli, 'run', stage.npmScript] : ['run', stage.npmScript];
  const result = spawnSync(executable, commandArgs, {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const durationMs = Date.now() - startedAt;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    states.push({
      id: stage.id,
      state: 'failed',
      durationMs,
      diagnostic: redact(result.error?.message || result.stderr || result.stdout || `exit=${result.status}`),
    });
    writeCheckpoint('failed', states);
    process.exitCode = result.status ?? 1;
    break;
  }
  states.push({ id: stage.id, state: 'passed', durationMs });
  writeCheckpoint('running', states);
}
if (states.length === stages.length && states.every((item) => item.state === 'passed')) {
  writeCheckpoint('completed', states);
  process.stdout.write(`商品 213 一键交付完成：${path.relative(projectRoot, checkpointPath)}\n`);
}

function writeCheckpoint(status: 'running' | 'completed' | 'failed', stageStates: StageState[]): void {
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  const value = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-delivery-checkpoint',
    generatedAt: new Date().toISOString(),
    status,
    inputFingerprint,
    mode: fullLive ? 'full-live' : 'static-release',
    stages: stages.map((stage) => stageStates.find((item) => item.id === stage.id) ?? { id: stage.id, state: 'pending', durationMs: 0 }),
    safety: {
      liveBusinessWritesEnabled: fullLive,
      nonIdempotentReplayPolicy: 'runner-server-id-reconciliation-required',
      cleanupPolicy: 'finally-and-ui-api-zero-residue',
      workspaceCleanupEnabled: !preserveWorkspace,
      secretsPersisted: false,
    },
  };
  const temporaryPath = `${checkpointPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, checkpointPath);
}

function fingerprintInputs(filePaths: string[]): string {
  const hash = createHash('sha256');
  for (const filePath of filePaths) {
    hash.update(filePath);
    hash.update(fs.readFileSync(filePath));
  }
  return hash.digest('hex');
}

function redact(value: string): string {
  return value
    .replace(/(authorization|cookie|token|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 2_000);
}
