import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterGroupCaseFingerprintManifest,
  selectImpactedProductCenterGroupCases,
  type ProductCenterGroupCaseFingerprintBinding,
  type ProductCenterGroupCaseFingerprintManifest,
} from '../utils/product-center-group-case-fingerprint';
import { buildProductCenterGroupExecutionRefinements } from './build-product-center-group-execution-refinements';

type BaselineReport = {
  caseExecutionManifest: ProductCenterGroupCaseFingerprintManifest;
  runs: Array<{ jsonFile: string }>;
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const deliverableRoot = path.join(workspaceRoot, 'deliverables/product-center-group');
const baselineReportPath = path.join(deliverableRoot, 'runtime-report.json');
const bindingsPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json');

async function main(): Promise<void> {
  if (!fs.existsSync(baselineReportPath)) throw new Error('缺少商品中心组正式基线报告，首次必须执行完整运行。');
  const baseline = readJson<BaselineReport>(baselineReportPath);
  if (baseline.caseExecutionManifest?.schemaVersion !== '1.0.0') {
    throw new Error('正式基线报告缺少用例级执行指纹，必须先用当前完整证据重建报告。');
  }
  const bindings = readJson<{ cases: ProductCenterGroupCaseFingerprintBinding[] }>(bindingsPath).cases;
  const current = buildProductCenterGroupCaseFingerprintManifest(projectRoot, bindings);
  const impact = selectImpactedProductCenterGroupCases(current, baseline.caseExecutionManifest);
  const refinementLedger = buildProductCenterGroupExecutionRefinements();
  const refinementRerunCaseIds = refinementLedger.rerunRequired.map((item) => String(item.caseId));
  const selectedCaseIds = [...new Set([...impact.selectedCaseIds, ...refinementRerunCaseIds])].sort();
  const selectedCaseIdSet = new Set(selectedCaseIds);
  const reusedCaseIds = current.cases
    .map((item) => item.caseId)
    .filter((caseId) => !selectedCaseIdSet.has(caseId));
  const impactReasonCaseIds = new Set(impact.reasons.map((item) => item.caseId));
  const reasons = [
    ...impact.reasons,
    ...refinementRerunCaseIds
      .filter((caseId) => !impactReasonCaseIds.has(caseId))
      .map((caseId) => ({
        caseId,
        reason: 'execution-refinement-evidence-incomplete',
        previousFingerprint: baseline.caseExecutionManifest.cases.find((item) => item.caseId === caseId)?.fingerprint ?? null,
        currentFingerprint: current.cases.find((item) => item.caseId === caseId)?.fingerprint ?? null,
      })),
  ];
  const generatedAt = new Date().toISOString();
  const plan = {
    schemaVersion: '1.0.0',
    generatedAt,
    baselineReport: relativeWorkspace(baselineReportPath),
    totalExecutable: current.cases.length,
    selected: selectedCaseIds.length,
    reused: reusedCaseIds.length,
    selectedCaseIds,
    reasons,
    executionRequired: selectedCaseIds.length > 0,
  };
  writeJson(path.join(deliverableRoot, 'impact-run-plan.json'), plan);
  if (process.argv.includes('--plan-only') || impact.selectedCaseIds.length === 0) {
    process.stdout.write(`${JSON.stringify(plan)}\n`);
    return;
  }

  const runLabel = `impact-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const baselineCopyPath = path.join(projectRoot, 'output', `product-center-group-${runLabel}-baseline-report.json`);
  fs.copyFileSync(baselineReportPath, baselineCopyPath);
  const runExitCode = await runNode([
    path.join(projectRoot, 'node_modules/tsx/dist/cli.mjs'),
    'scripts/run-product-center-group-batches.ts',
  ], {
    ...process.env,
    PC_GROUP_CASE_IDS: selectedCaseIds.join(','),
    PC_GROUP_BATCH_LABEL: runLabel,
    PC_GROUP_BUILD_REPORT: 'false',
  });
  if (runExitCode !== 0) throw new Error(`受影响用例执行失败：exit=${runExitCode}`);

  const schedulerPath = path.join(projectRoot, 'output', `product-center-group-${runLabel}-scheduler.json`);
  const scheduler = readJson<{ status: string; mergedJsonFile: string | null }>(schedulerPath);
  if (scheduler.status !== 'completed' || !scheduler.mergedJsonFile) {
    throw new Error(`受影响用例调度未完成：${JSON.stringify(scheduler)}`);
  }
  const baselineJsonFiles = baseline.runs.map((run) => projectRelative(run.jsonFile));
  const reportArguments = [
    path.join(projectRoot, 'node_modules/tsx/dist/cli.mjs'),
    'scripts/build-product-center-group-final-report.ts',
    ...baselineJsonFiles.flatMap((jsonFile) => ['--json', jsonFile]),
    '--json', scheduler.mergedJsonFile,
    '--reuse-report', path.relative(projectRoot, baselineCopyPath),
  ];
  const reportExitCode = await runNode(reportArguments, process.env);
  if (reportExitCode !== 0) throw new Error(`受影响用例证据合并失败：exit=${reportExitCode}`);
  process.stdout.write(`${JSON.stringify({ ...plan, runLabel, mergedJsonFile: scheduler.mergedJsonFile })}\n`);
}

function projectRelative(workspaceRelativePath: string): string {
  const absolutePath = path.resolve(workspaceRoot, workspaceRelativePath);
  const relativePath = path.relative(projectRoot, absolutePath);
  if (relativePath.startsWith('..')) throw new Error(`基线证据不在测试项目内：${workspaceRelativePath}`);
  return relativePath;
}

function runNode(args: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...args], {
      cwd: projectRoot,
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (exitCode) => resolve(exitCode ?? 1));
  });
}

function relativeWorkspace(filePath: string): string {
  return path.relative(workspaceRoot, filePath).replaceAll(path.sep, '/');
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
