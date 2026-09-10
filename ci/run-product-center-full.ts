import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertExecutionIntentCompletion } from '../Test Automation Platform/src/governance/execution-intent';
import { buildProductCenterFullRegressionExecutionIntent } from '../projects/project-a/Merchant Center UITest/adapters/product-center/product-center-execution-intent';

const root = path.resolve(__dirname, '..');
const project = path.join(root, 'projects/project-a/Merchant Center UITest');
const defaultOut = path.join(root, 'output/ci');
const out = process.env.PC_CI_OUTPUT_DIR ? path.resolve(process.env.PC_CI_OUTPUT_DIR) : defaultOut;
if (!out.startsWith(path.resolve(root, 'output') + path.sep)) throw new Error('ci-output-outside-workspace-output');
const build = process.env.BUILD_NUMBER ?? 'local';
const requestId = process.env.REQUEST_ID ?? `local-${Date.now()}`;
const runId = `jenkins-${build}-${requestId}`;
const secretEnv = process.env.MC_RUNTIME_ENV;

function run(command: string[], cwd = project, env: NodeJS.ProcessEnv = process.env): number {
  const result = spawnSync(process.execPath, [path.join(project, 'node_modules/tsx/dist/cli.mjs'), ...command], {
    cwd, env, stdio: 'inherit', shell: false,
  });
  return result.status ?? 1;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as T;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function copyTree(source: string, target: string): void {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name), to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) {
      if (fs.existsSync(to)) throw new Error(`full-regression-artifact-collision:${entry.name}`);
      fs.copyFileSync(from, to);
    }
  }
}

function collectAllure(sourceRoots: string[], target: string): number {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  let count = 0;
  for (const rootPath of sourceRoots) {
    if (!fs.existsSync(rootPath)) continue;
    for (const file of fs.readdirSync(rootPath)) {
      const from = path.join(rootPath, file);
      if (!fs.statSync(from).isFile()) continue;
      const to = path.join(target, file);
      if (fs.existsSync(to)) throw new Error(`duplicate-allure-result:${file}`);
      fs.copyFileSync(from, to); count += 1;
    }
  }
  return count;
}

function findAllureResultDirs(rootPath: string): string[] {
  const found: string[] = [];
  if (!fs.existsSync(rootPath)) return found;
  const visit = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (!entry.isDirectory()) continue;
      if (entry.name === 'allure-results') found.push(full);
      else visit(full);
    }
  };
  visit(rootPath);
  return found;
}

function main(): void {
  fs.mkdirSync(out, { recursive: true });
  const indexPath = path.join(root, 'projects/project-a/Merchant Center Info/00-待转换测试方案/已完成/index.json');
  const completedIndex = readJson<{ cases: Array<{ caseId: string; module: string }> }>(indexPath);
  // Jenkins passes the runtime file as one masked parameter.  The source-governed
  // Playwright setup reads the individual variables, so expand only the permitted
  // MC_/PLAYWRIGHT_ keys in memory and never print or persist their values.
  const runtimeEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const line of (process.env.MC_RUNTIME_ENV ?? '').split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^(MC_|PLAYWRIGHT_)/.test(key)) continue;
    runtimeEnv[key] = line.slice(separator + 1);
  }
  const commonEnv = {
    ...runtimeEnv,
    CI: 'true',
    BUILD_NUMBER: build,
    REQUEST_ID: requestId,
    RUN_SCOPE: 'full-regression',
    PC_SOURCE_GOVERNED_RUN_ID: runId,
  };

  const planExit = run(['scripts/build-product-center-source-governed-execution-plan.ts'], project, commonEnv);
  if (planExit !== 0) throw new Error(`source-governed-plan-failed:${planExit}`);
  const sourcePlan = readJson<{
    planFingerprint: string;
    revalidation: {
      selectedCaseIds: string[];
      runners: Array<{ runnerId: string; selectedCaseIds: string[] }>;
    };
    tasks: Array<{ caseId: string; module: string; action: string; reason: string; blockCode?: string | null }>;
  }>(path.join(root, 'projects/project-a/deliverables/product-center-source-governance/execution-plan.json'));
  const seasoningManifest = readJson<{ cases: Array<{ caseId: string }> }>(path.join(project, 'systems/merchant-center-product-center-seasoning/manifest.json'));
  const gitSha = require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  // Freeze and validate the complete executable selection before authentication
  // or browser startup. Missing formal cases need an explicit project
  // classification; absence from a runner is never treated as an exclusion.
  const executionIntent = buildProductCenterFullRegressionExecutionIntent({
    runId: process.env.INTENT_ID ?? runId,
    scopeFingerprint: require('node:crypto').createHash('sha256')
      .update(JSON.stringify({ gitSha, sourcePlanFingerprint: sourcePlan.planFingerprint, formalCases: completedIndex.cases }))
      .digest('hex'),
    formalCases: completedIndex.cases,
    sourcePlan,
    seasoningCaseIds: seasoningManifest.cases.map((item) => item.caseId),
  });
  const selectedIntentCaseIds = [...executionIntent.selectedCaseIds];
  const classifiedExclusions = [...executionIntent.classifiedExclusionCaseIds];
  const plannedCaseIds = [...executionIntent.formalScopeCaseIds];
  writeJson(path.join(out, 'execution-intent.json'), { ...executionIntent, schemaVersion: 1, kind: 'full-regression', runId,
    gitSha,
    buildNumber: build, requestId, runScope: process.env.RUN_SCOPE ?? 'full-regression',
    formalScopeCaseIds: plannedCaseIds, formalScopeCaseCount: plannedCaseIds.length,
    executionEligibleCaseIds: executionIntent.plannedCaseIds,
    selectedCaseIds: selectedIntentCaseIds, classifiedExclusions });
  if (process.argv.includes('--plan-only')) {
    const plan = readJson<any>(path.join(root, 'projects/project-a/deliverables/product-center-source-governance/execution-plan.json'));
    process.stdout.write(`${JSON.stringify({ plannedCaseCount: plannedCaseIds.length, sourceGovernance: plan.summary }, null, 2)}\n`);
    return;
  }
  const sourceExit = run(['scripts/run-product-center-source-governed.ts', '--execute'], project, commonEnv);
  const sourceResultPath = path.join(root, 'projects/project-a/deliverables/product-center-source-governance/execution-result.json');
  const sourceResultCandidate = fs.existsSync(sourceResultPath) ? readJson<any>(sourceResultPath) : null;
  const sourceResult = sourceResultCandidate?.runId === runId ? sourceResultCandidate : null;

  const seasoningEnv = { ...commonEnv, RUN_SCOPE: 'full-regression', ...(secretEnv ? { MC_RUNTIME_ENV: secretEnv } : {}) };
  const seasoningExit = run(['../../../ci/run-pilot.ts'], project, seasoningEnv);
  const seasoningEnvelopePath = path.join(out, 'result-envelope.json');
  const seasoningEnvelope = fs.existsSync(seasoningEnvelopePath) ? readJson<any>(seasoningEnvelopePath) : null;

  const sourceCases = (sourceResult?.executionCases ?? []).map((item: any) => ({
    caseId: item.caseId,
    status: item.status,
    accepted: item.status === 'passed',
    source: 'source-governed',
  }));
  const seasoningCases = (seasoningEnvelope?.caseAudit ?? []).map((item: any) => ({
    caseId: item.caseId,
    status: item.status,
    accepted: item.accepted === true,
    source: 'seasoning',
  }));
  const caseAudit = [...sourceCases, ...seasoningCases];
  const selectedCaseIds = selectedIntentCaseIds;
  const terminalCaseIds = [...new Set(caseAudit.filter((item) => ['passed', 'failed', 'skipped'].includes(item.status)).map((item) => item.caseId))].sort();
  const auditCounts = new Map<string, number>();
  for (const item of caseAudit) auditCounts.set(item.caseId, (auditCounts.get(item.caseId) ?? 0) + 1);
  const duplicateCaseIds = selectedCaseIds.filter((caseId) => (auditCounts.get(caseId) ?? 0) > 1);
  const auditReportExit = run(['scripts/build-product-center-audit-report.ts'], project, commonEnv);
  const auditSource = path.join(project, 'deliverables/product-center-audit');
  const auditTarget = path.join(out, 'product-center-audit');
  fs.rmSync(auditTarget, { recursive: true, force: true });
  copyTree(auditSource, auditTarget);

  const allureRoots = [
    ...findAllureResultDirs(path.join(project, 'output/allure/source-governed', runId)),
    ...findAllureResultDirs(path.join(out, 'business'))
      .filter((directory) => path.basename(path.dirname(directory)).startsWith(`${runId}-`)),
  ];
  const allureCount = collectAllure(allureRoots, path.join(out, 'allure-results'));
  const sourceSummary = sourceResult?.summary ?? {};
  const fullPass = sourceExit === 0 && seasoningExit === 0 && auditReportExit === 0
    && selectedCaseIds.length + classifiedExclusions.length === plannedCaseIds.length
    && terminalCaseIds.length === selectedCaseIds.length
    && duplicateCaseIds.length === 0 && sourceResult?.status === 'passed'
    && seasoningEnvelope?.publicReceiptAccepted === true && allureCount > 0;
  const completionStatus = terminalCaseIds.length === selectedCaseIds.length
    ? (fullPass ? 'completed' : 'completed-with-findings')
    : 'blocked';
  assertExecutionIntentCompletion({ intent: executionIntent, status: completionStatus, terminalCaseIds });
  const envelope = {
    schemaVersion: 1,
    kind: 'governed-business-full-product-center',
    gitSha: require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    buildNumber: build, requestId, intentId: process.env.INTENT_ID ?? null, runScope: process.env.RUN_SCOPE ?? 'full-regression', runId,
    selectedCaseIds, terminalCaseIds,
    selectionFingerprint: require('../tap/src/ci/transport-contract.cjs').selectionFingerprint(selectedCaseIds),
    plannedCaseIds, plannedCaseCount: plannedCaseIds.length,
    classifiedExclusions, classifiedExclusionCount: classifiedExclusions.length,
    duplicateCaseIds, caseAudit,
    publicReceiptAccepted: fullPass,
    receiptAudit: { status: fullPass ? 'complete' : 'incomplete', selected: selectedCaseIds.length, received: terminalCaseIds.length, cases: caseAudit },
    status: completionStatus,
    selected: selectedCaseIds.length,
    executed: terminalCaseIds.length,
    notRun: selectedCaseIds.length - terminalCaseIds.length,
    passed: caseAudit.filter((item) => item.status === 'passed' && item.accepted).length,
    failed: caseAudit.filter((item) => item.status === 'failed').length,
    skipped: caseAudit.filter((item) => item.status === 'skipped').length,
    exitCode: fullPass ? 0 : 1,
    sourceGoverned: { exitCode: sourceExit, summary: sourceSummary, resultPath: 'product-center-audit/source-execution-result.json' },
    seasoning: { exitCode: seasoningExit, envelope: seasoningEnvelope },
    auditReport: { exitCode: auditReportExit, path: 'product-center-audit/product-center-audit-report.json' },
    allure: { resultCount: allureCount, path: 'allure-results' },
  };
  if (sourceResult) writeJson(path.join(out, 'product-center-audit', 'source-execution-result.json'), sourceResult);
  writeJson(path.join(out, 'full-regression-audit.json'), envelope);
  writeJson(path.join(out, 'result-envelope.json'), envelope);
  process.exitCode = fullPass ? 0 : 1;
}

try { main(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); process.exitCode = 2; }
