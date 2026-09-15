import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type Stage = { id: string; npmScript: string; live?: boolean };
type StageState = { id: string; state: 'pending' | 'passed' | 'blocked' | 'failed'; durationMs: number; diagnostic?: string };

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
  path.join(projectRoot, 'contracts/product-center/test-cases/canonical/product-center-item-current-receipt-contract.json'),
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
const preflightInputs = [
  {
    relativePath: 'output/product-center-item-213-failures/failure-pack.md',
    stageId: 'manual-rule-import',
    reason: '人工决策和运行失败分类的权威输入',
  },
  {
    relativePath: 'contracts/product-center/test-cases/canonical/product-center-item-current-receipt-contract.json',
    stageId: 'authoritative-release-prep',
    reason: '逐案当前身份、上下文、操作和断言收据合同；历史整改汇总不能授权发布',
  },
  {
    relativePath: 'deliverables/system-test-platform/execution-index.json',
    stageId: 'formal-conversion',
    reason: '当前逐案执行索引和标准收据来源',
  },
];
const prior = resume && fs.existsSync(checkpointPath)
  ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as { inputFingerprint: string; stages: StageState[] }
  : undefined;
const reusable = prior?.inputFingerprint === inputFingerprint
  ? new Set(prior.stages.filter((item) => item.state === 'passed').map((item) => item.id))
  : new Set<string>();
const states: StageState[] = [];
const missingPreflightInputs = preflightInputs
  .filter((item) => !fs.existsSync(path.join(projectRoot, item.relativePath)))
  .map((item) => ({ ...item, absolutePath: path.join(projectRoot, item.relativePath) }));
if (missingPreflightInputs.length > 0) {
  const diagnostic = {
    schemaVersion: '1.0.0',
    reportId: 'product-center-item-delivery-preflight',
    generatedAt: new Date().toISOString(),
    status: 'blocked',
    code: 'ITEM_DELIVERY_PREFLIGHT_INPUTS_MISSING',
    scope: 'static-release-preflight',
    missingInputs: missingPreflightInputs.map((item) => ({
      path: item.relativePath,
      stageId: item.stageId,
      reason: item.reason,
    })),
    guardrails: {
      businessExecutionStarted: false,
      liveBusinessWritesEnabled: false,
      existingPassedCasesInvalidated: false,
      secretsPersisted: false,
    },
  };
  const diagnosticPath = path.join(projectRoot, 'output/governance/product-center-item-delivery-preflight.blocked.json');
  fs.mkdirSync(path.dirname(diagnosticPath), { recursive: true });
  fs.writeFileSync(diagnosticPath, `${JSON.stringify(diagnostic, null, 2)}\n`, 'utf8');
  states.push({ id: 'manual-rule-import', state: 'blocked', durationMs: 0, diagnostic: JSON.stringify(diagnostic) });
  writeCheckpoint('blocked', states);
  process.stdout.write(`${JSON.stringify(diagnostic)}\n`);
  process.exitCode = 1;
}
if (missingPreflightInputs.length > 0) {
  process.exit();
}
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
    const diagnosticOutput = redact(result.error?.message || result.stderr || result.stdout || `exit=${result.status}`);
    const blocked = hasStructuredBlockedDiagnostic(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
    states.push({
      id: stage.id,
      state: blocked ? 'blocked' : 'failed',
      durationMs,
      diagnostic: diagnosticOutput,
    });
    writeCheckpoint(blocked ? 'blocked' : 'failed', states);
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

function writeCheckpoint(status: 'running' | 'completed' | 'blocked' | 'failed', stageStates: StageState[]): void {
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
    if (!fs.existsSync(filePath)) {
      // Missing upstream evidence must remain visible in the input identity so
      // resume cannot silently reuse a checkpoint created with different inputs.
      hash.update('MISSING_INPUT');
      continue;
    }
    hash.update(fs.readFileSync(filePath));
  }
  return hash.digest('hex');
}

function redact(value: string): string {
  return value
    .replace(/(authorization|cookie|token|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 2_000);
}

function hasStructuredBlockedDiagnostic(output: string): boolean {
  return output.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false;
    try {
      const value = JSON.parse(trimmed) as { status?: unknown };
      return value.status === 'blocked';
    } catch {
      return false;
    }
  });
}
