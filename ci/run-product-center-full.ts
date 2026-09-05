import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(__dirname, '..');
const project = path.join(root, 'projects/project-a/Merchant Center UITest');
const out = path.join(root, 'output/ci');
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

function main(): void {
  fs.mkdirSync(out, { recursive: true });
  const indexPath = path.join(root, 'projects/project-a/Merchant Center Info/00-待转换测试方案/已完成/index.json');
  const completedIndex = readJson<{ cases: Array<{ caseId: string }> }>(indexPath);
  const plannedCaseIds = [...new Set(completedIndex.cases.map((item) => item.caseId))].sort();
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
  const commonEnv = { ...runtimeEnv, CI: 'true', BUILD_NUMBER: build, REQUEST_ID: requestId, PC_SOURCE_GOVERNED_RUN_ID: runId };

  const planExit = run(['scripts/build-product-center-source-governed-execution-plan.ts'], project, commonEnv);
  if (planExit !== 0) throw new Error(`source-governed-plan-failed:${planExit}`);
  if (process.argv.includes('--plan-only')) {
    const plan = readJson<any>(path.join(root, 'projects/project-a/deliverables/product-center-source-governance/execution-plan.json'));
    process.stdout.write(`${JSON.stringify({ plannedCaseCount: plannedCaseIds.length, sourceGovernance: plan.summary }, null, 2)}\n`);
    return;
  }
  const sourceExit = run(['scripts/run-product-center-source-governed.ts', '--execute'], project, commonEnv);
  const sourceResultPath = path.join(root, 'projects/project-a/deliverables/product-center-source-governance/execution-result.json');
  const sourceResult = fs.existsSync(sourceResultPath) ? readJson<any>(sourceResultPath) : null;

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
  const selectedCaseIds = [...new Set(caseAudit.map((item) => item.caseId))].sort();
  const classifiedExclusions = plannedCaseIds.filter((caseId) => !selectedCaseIds.includes(caseId));
  const terminalCaseIds = caseAudit.filter((item) => ['passed', 'failed', 'skipped'].includes(item.status)).map((item) => item.caseId).sort();
  const duplicateCaseIds = selectedCaseIds.filter((caseId, index) => caseAudit.findIndex((item) => item.caseId === caseId) !== index);
  const auditReportExit = run(['scripts/build-product-center-audit-report.ts'], project, commonEnv);
  const auditSource = path.join(project, 'deliverables/product-center-audit');
  const auditTarget = path.join(out, 'product-center-audit');
  fs.rmSync(auditTarget, { recursive: true, force: true });
  copyTree(auditSource, auditTarget);

  const allureRoots = [
    ...fs.globSync(path.join(project, 'output/allure/source-governed', runId, '**/allure-results')),
    ...fs.globSync(path.join(out, 'business', `${runId}-*`, 'allure-results')),
  ];
  const allureCount = collectAllure(allureRoots, path.join(out, 'allure-results'));
  const sourceSummary = sourceResult?.summary ?? {};
  const fullPass = sourceExit === 0 && seasoningExit === 0 && auditReportExit === 0
    && selectedCaseIds.length === plannedCaseIds.length - classifiedExclusions.length
    && classifiedExclusions.length === 9 && terminalCaseIds.length === selectedCaseIds.length
    && duplicateCaseIds.length === 0 && sourceResult?.status === 'passed'
    && seasoningEnvelope?.publicReceiptAccepted === true && allureCount > 0;
  const envelope = {
    schemaVersion: 1,
    kind: 'governed-business-full-product-center',
    gitSha: require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    buildNumber: build, requestId, runId,
    selectedCaseIds, terminalCaseIds,
    selectionFingerprint: require('../tap/src/ci/transport-contract.cjs').selectionFingerprint(selectedCaseIds),
    plannedCaseIds, plannedCaseCount: plannedCaseIds.length,
    classifiedExclusions, classifiedExclusionCount: classifiedExclusions.length,
    duplicateCaseIds, caseAudit,
    publicReceiptAccepted: fullPass,
    receiptAudit: { status: fullPass ? 'complete' : 'incomplete', selected: selectedCaseIds.length, received: terminalCaseIds.length, cases: caseAudit },
    status: terminalCaseIds.length === selectedCaseIds.length ? (fullPass ? 'completed' : 'completed-with-findings') : 'blocked',
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
