import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertSystemTestOptimizationGate, type SystemTestOptimizationPlan } from '../../../Test Automation Platform/src/governance/system-test-optimization-gate';
import { buildProductCenterProjectOptimizationCases } from '../adapters/product-center/product-center-project-optimization';
import type {
  ProjectRemediationOptimizationCase,
  ProjectRemediationOptimizationPlan,
} from '../../../Test Automation Platform/src/governance/project-remediation-optimization';
import type { ProjectRemediationScopeArtifact } from '../../../Test Automation Platform/src/governance/project-remediation-scope';
import { runProductCenterSourceGoverned } from './run-product-center-source-governed';
import { assertExecutionIntentCheckpointState, assertExecutionIntentCompletion, assertExecutionIntentContract, type ExecutionIntent } from '../../../Test Automation Platform/src/governance/execution-intent';
import { fingerprintImplementationSources } from '../../../Test Automation Platform/src/automation/system-test/system-test-implementation-fingerprint';
import { inspectSystemTestRepairAttemptState } from '../../../Test Automation Platform/src/automation/system-test/system-test-repair-attempt-guard';
import { buildProductCenterGroupCaseFingerprintManifest } from '../utils/product-center-group-case-fingerprint';
import {
  buildProductCenterCanaryCheckpointMetadata,
  buildProductCenterCanaryExecutionIntent,
} from '../adapters/product-center/product-center-execution-intent';
import { resolveProductCenterSourceTerminalCaseIds } from '../adapters/product-center/product-center-source-terminal-receipts';
import { resolveProductCenterSeasoningTerminalCaseIds } from '../adapters/product-center/product-center-seasoning-terminal-receipts';

type CanaryCheckpoint = {
  schemaVersion: '1.0.0';
  runId: string;
  planFingerprint: string;
  status: 'running' | 'completed-with-findings' | 'completed' | 'blocked';
  completedModules: string[];
  moduleExitCodes: Record<string, number>;
  executionIntentFingerprint?: string;
  selectedFingerprint?: string;
  terminalCaseIds?: string[];
  incompleteCaseIds?: string[];
  skippedPassedCaseIds?: string[];
  deferredCaseIds?: string[];
  reason?: string;
  updatedAt: string;
};

const projectRoot = path.resolve(__dirname, '..');
const planArgument = argument('plan');
if (!planArgument) throw new Error('OPTIMIZATION_PLAN_REQUIRED_BEFORE_BROWSER');
const planPath = path.resolve(projectRoot, planArgument);
const scopePath = path.resolve(projectRoot, 'deliverables/system-test-platform/product-center-remediation-scope.json');
const checkpointPath = path.resolve(projectRoot, argument('checkpoint')
  ?? 'deliverables/system-test-platform/product-center-canary-checkpoint.json');
const plan = readJson<ProjectRemediationOptimizationPlan>(planPath);
const scope = readJson<ProjectRemediationScopeArtifact>(scopePath);
if (!plan.changeId || plan.scopeTotal !== scope.cases.length || !plan.selectionFingerprint) {
  throw new Error('OPTIMIZATION_PLAN_METADATA_REQUIRED');
}
if (!Array.isArray(plan.candidateCanaryCaseIds) || !plan.caseDecisions) {
  throw new Error('PROJECT_CANARY_REVALIDATION_DECISIONS_REQUIRED');
}
const cases = buildProductCenterProjectOptimizationCases({ projectRoot, scope });
const requestedModules = argument('modules')
  ?.split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const requestedCaseIds = argument('case-ids')
  ?.split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const knownModules = new Set(Object.keys(plan.moduleSummary));
if (requestedModules?.some((module) => !knownModules.has(module))) {
  throw new Error(`PROJECT_CANARY_MODULE_UNKNOWN:${requestedModules.filter((module) => !knownModules.has(module)).join(',')}`);
}
const moduleScopedCanaryCaseIds = plan.canaryCaseIds.filter((caseId) => {
  if (!requestedModules || requestedModules.length === 0) return true;
  const module = cases.find((item) => item.caseId === caseId)?.module;
  return module !== undefined && requestedModules.includes(module);
});
if (requestedCaseIds) {
  const canarySet = new Set(plan.canaryCaseIds);
  const invalidCaseIds = requestedCaseIds.filter((caseId) => !canarySet.has(caseId));
  if (invalidCaseIds.length > 0) throw new Error(`PROJECT_CANARY_CASE_NOT_IN_CANARY:${invalidCaseIds.join(',')}`);
  const outsideModules = requestedCaseIds.filter((caseId) => !moduleScopedCanaryCaseIds.includes(caseId));
  if (outsideModules.length > 0) throw new Error(`PROJECT_CANARY_CASE_OUTSIDE_MODULE_SCOPE:${outsideModules.join(',')}`);
}
const selectedCanaryCaseIds = requestedCaseIds ?? moduleScopedCanaryCaseIds;
const caseById = new Map(cases.map((item) => [item.caseId, item]));
const acceptedFindingCaseIds = new Set(plan.acceptedFindingCaseIds ?? []);
const actionableCanaryCaseIds = selectedCanaryCaseIds.filter((caseId) => (
  !acceptedFindingCaseIds.has(caseId)
));
const sentinelCaseIds = new Set(plan.sentinelCaseIds ?? []);
const runtimeImplementationFingerprints = buildRuntimeImplementationFingerprints(projectRoot, cases);
const seasoningDiagnosis = ensureSeasoningRepairDiagnosis(
  projectRoot,
  selectedCanaryCaseIds.filter((caseId) => caseById.get(caseId)?.module === 'seasoning'),
);
const sourceDiagnosis = ensureSourceGovernedRepairDiagnosis(
  projectRoot,
  actionableCanaryCaseIds.filter((caseId) => caseById.get(caseId)?.module !== 'seasoning'),
);
const diagnosedSourceCaseIds = new Set(sourceDiagnosis.supersededCaseIds);
const repairStates = actionableCanaryCaseIds.map((caseId) => {
  const item = caseById.get(caseId);
  if (!item) throw new Error(`PROJECT_CANARY_CASE_NOT_IN_ADAPTER:${caseId}`);
  return {
    caseId,
    state: inspectSystemTestRepairAttemptState({
      ledgerPath: repairLedgerPath(projectRoot, item.module),
      applicationId: applicationIdForModule(item.module),
      caseId,
      caseFingerprint: item.caseFingerprint,
      implementationFingerprint: runtimeImplementationFingerprints.get(caseId) ?? item.implementationFingerprint,
    }),
  };
});
const skippedPassedCaseIds = repairStates.filter((item) => item.state.currentImplementationPassed).map((item) => item.caseId);
const deferredCaseIds = repairStates.filter((item) => (
  !item.state.currentImplementationPassed
    && item.state.currentImplementationDeterministicFailure
    && !sentinelCaseIds.has(item.caseId)
    && !diagnosedSourceCaseIds.has(item.caseId)
    && !seasoningDiagnosis.supersededCaseIds.includes(item.caseId)
)).map((item) => item.caseId);
const selectedCaseIds = actionableCanaryCaseIds.filter((caseId) => (
  !skippedPassedCaseIds.includes(caseId) && !deferredCaseIds.includes(caseId)
));
const runId = argument('run-id') ?? `product-center-canary-${timestamp()}`;
const seasoningIds = selectedCaseIds.filter((caseId) => caseById.get(caseId)?.module === 'seasoning');
const sourceIds = selectedCaseIds.filter((caseId) => caseById.get(caseId)?.module !== 'seasoning');
const sourceDiagnosisPath = sourceDiagnosis.path;
const activeCanaryPartitions = [...new Set(selectedCaseIds
  .map((caseId) => caseById.get(caseId)?.module)
  .filter((module): module is string => Boolean(module)))];
const executionIntent: ExecutionIntent = buildProductCenterCanaryExecutionIntent({
  runId,
  plan,
  cases,
  selectedCaseIds,
  canaryPartitionKeys: activeCanaryPartitions,
});
const checkpointMetadata = buildProductCenterCanaryCheckpointMetadata(executionIntent);
if (selectedCaseIds.length === 0) {
  const reason = deferredCaseIds.length > 0
    ? `REPAIR_GUARD_DEFERRED:${deferredCaseIds.join(',')}`
    : 'CANARY_NO_ACTIONABLE_CASES';
  const checkpoint: CanaryCheckpoint = {
    schemaVersion: '1.0.0', runId, planFingerprint: plan.fingerprint, status: 'blocked',
    completedModules: [], moduleExitCodes: {}, terminalCaseIds: [], incompleteCaseIds: [],
    ...checkpointMetadata, skippedPassedCaseIds, deferredCaseIds, reason, updatedAt: new Date().toISOString(),
  };
  writeJson(checkpointPath, checkpoint);
  process.stdout.write(`${JSON.stringify({ runId, status: 'blocked', requestedCaseCount: selectedCanaryCaseIds.length, skippedPassedCaseIds, deferredCaseIds, browserStarted: false, checkpoint: checkpointPath })}\n`);
  process.exit(2);
}
try {
  assertExecutionIntentContract({ intent: executionIntent });
  assertSystemTestOptimizationGate({ plan, requestedCaseIds: selectedCaseIds, stage: 'canary' });
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  const checkpoint: CanaryCheckpoint = {
    schemaVersion: '1.0.0',
    runId,
    planFingerprint: plan.fingerprint,
    status: 'blocked',
    completedModules: [],
    moduleExitCodes: {},
    terminalCaseIds: [],
    incompleteCaseIds: [...selectedCaseIds].sort(), skippedPassedCaseIds, deferredCaseIds,
    ...checkpointMetadata,
    reason,
    updatedAt: new Date().toISOString(),
  };
  writeJson(checkpointPath, checkpoint);
  process.stdout.write(`${JSON.stringify({ runId, status: 'blocked', reason, browserStarted: false, checkpoint: checkpointPath })}\n`);
  process.exit(2);
}
if (selectedCaseIds.length === 0) throw new Error('PROJECT_CANARY_SELECTION_EMPTY');
if (selectedCaseIds.some((caseId) => !caseById.has(caseId))) throw new Error('PROJECT_CANARY_CASE_NOT_IN_ADAPTER');

const sourceGovernedPlan = readJson<{ revalidation: { selectedCaseIds: string[] } }>(path.resolve(projectRoot, '../deliverables/product-center-source-governance/execution-plan.json'));
const sourceGovernedIds = new Set(sourceGovernedPlan.revalidation.selectedCaseIds);
const missingSourceIds = sourceIds.filter((caseId) => !sourceGovernedIds.has(caseId));
if (missingSourceIds.length > 0) throw new Error(`PROJECT_CANARY_SOURCE_PLAN_MISSING:${missingSourceIds.join(',')}`);

let checkpoint: CanaryCheckpoint;
try {
  checkpoint = readCheckpoint(runId, plan.fingerprint, executionIntent);
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  const blockedCheckpoint: CanaryCheckpoint = {
    schemaVersion: '1.0.0', runId, planFingerprint: plan.fingerprint, status: 'blocked',
    completedModules: [], moduleExitCodes: {}, terminalCaseIds: [], incompleteCaseIds: [...selectedCaseIds].sort(), skippedPassedCaseIds, deferredCaseIds, ...checkpointMetadata, reason, updatedAt: new Date().toISOString(),
  };
  writeJson(checkpointPath, blockedCheckpoint);
  process.stdout.write(`${JSON.stringify({ runId, status: 'blocked', reason, browserStarted: false, checkpoint: checkpointPath })}\n`);
  process.exit(2);
}
const failures: string[] = [];
const modules: Array<{ id: string; caseIds: string[]; execute: () => number }> = [
  { id: 'seasoning', caseIds: seasoningIds, execute: () => runSeasoning(seasoningIds, runId, seasoningDiagnosis.path) },
  { id: 'source-governed', caseIds: sourceIds, execute: () => runSourceGoverned(sourceIds, runId, sourceDiagnosisPath) },
];
const terminalCaseIds = new Set<string>();
for (const module of modules) {
  const priorExitCode = checkpoint.moduleExitCodes[module.id];
  if (priorExitCode === undefined) continue;
  for (const caseId of terminalCaseIdsFor(module.id, module.caseIds, runId, priorExitCode)) terminalCaseIds.add(caseId);
}
checkpoint.terminalCaseIds = [...terminalCaseIds].sort();
checkpoint.incompleteCaseIds = selectedCaseIds.filter((caseId) => !terminalCaseIds.has(caseId)).sort();

for (const module of modules) {
  if (module.caseIds.length === 0 || (checkpoint.completedModules.includes(module.id)
    && module.caseIds.every((caseId) => terminalCaseIds.has(caseId)))) continue;
  const exitCode = module.execute();
  checkpoint.moduleExitCodes[module.id] = exitCode;
  if (exitCode === 0 || exitCode === 1) checkpoint.completedModules.push(module.id);
  for (const caseId of terminalCaseIdsFor(module.id, module.caseIds, runId, exitCode)) terminalCaseIds.add(caseId);
  checkpoint.terminalCaseIds = [...terminalCaseIds].sort();
  checkpoint.incompleteCaseIds = selectedCaseIds.filter((caseId) => !terminalCaseIds.has(caseId)).sort();
  checkpoint.skippedPassedCaseIds = skippedPassedCaseIds;
  checkpoint.deferredCaseIds = deferredCaseIds;
  if (exitCode !== 0) failures.push(`${module.id}:${exitCode}`);
  checkpoint.status = exitCode === 2 || checkpoint.incompleteCaseIds.length > 0
    ? 'blocked'
    : failures.length > 0 ? 'completed-with-findings' : 'running';
  checkpoint.updatedAt = new Date().toISOString();
  writeJson(checkpointPath, checkpoint);
}
const blocked = Object.values(checkpoint.moduleExitCodes).some((exitCode) => exitCode === 2);
const incomplete = selectedCaseIds.some((caseId) => !terminalCaseIds.has(caseId));
checkpoint.incompleteCaseIds = selectedCaseIds.filter((caseId) => !terminalCaseIds.has(caseId)).sort();
checkpoint.skippedPassedCaseIds = skippedPassedCaseIds;
checkpoint.deferredCaseIds = deferredCaseIds;
checkpoint.status = blocked || incomplete ? 'blocked' : failures.length > 0 ? 'completed-with-findings' : 'completed';
assertExecutionIntentCompletion({ intent: executionIntent, status: checkpoint.status, terminalCaseIds: [...terminalCaseIds] });
checkpoint.updatedAt = new Date().toISOString();
writeJson(checkpointPath, checkpoint);
  process.stdout.write(`${JSON.stringify({ runId, status: checkpoint.status, selectedCaseCount: selectedCaseIds.length, modules: requestedModules ?? 'all', moduleExitCodes: checkpoint.moduleExitCodes, checkpoint: checkpointPath })}\n`);
if (failures.length > 0) process.exitCode = 1;

function runSeasoning(caseIds: readonly string[], runLabel: string, repairDiagnosisPath: string): number {
  const args = [
    require.resolve('tsx/cli'),
    '../../Test Automation Platform/scripts/run-system-test-flow.ts',
    '--plan=systems/merchant-center-product-center-seasoning/test-plan.json',
    '--manifest=systems/merchant-center-product-center-seasoning/manifest.json',
    '--execute',
    `--flow-id=${runLabel}-seasoning`,
    `--optimization-plan=${path.relative(projectRoot, planPath).replaceAll(path.sep, '/')}`,
    '--optimization-stage=canary',
    `--additional-reporter=${path.resolve(projectRoot, 'reporters/product-center-system-allure.reporter.ts').replaceAll(path.sep, '/')}`,
    `--repair-diagnosis=${path.relative(projectRoot, repairDiagnosisPath).replaceAll(path.sep, '/')}`,
    '--audit-event-log=output/audit/product-center-project-canary-events.jsonl',
  ];
  const selectionPath = path.join(projectRoot, 'systems/merchant-center-product-center-seasoning/execution-selection.json');
  const original = readJson<{ selectedCaseIds?: string[] }>(selectionPath);
  writeJson(selectionPath, { selectedCaseIds: [...caseIds] });
  try {
    const result = spawnSync(process.execPath, args, { cwd: projectRoot, env: process.env, stdio: 'inherit', shell: false });
    return result.status ?? 1;
  } finally {
    writeJson(selectionPath, original);
  }
}

function ensureSeasoningRepairDiagnosis(rootDir: string, caseIds: readonly string[]): {
  path: string;
  supersededCaseIds: string[];
} {
  const diagnosisPath = path.join(rootDir, 'deliverables/system-test-platform/product-center-seasoning-canary-repair-diagnosis.json');
  const selected = new Set(caseIds);
  const ledgerPath = repairLedgerPath(rootDir, 'seasoning');
  const ledger = fs.existsSync(ledgerPath)
    ? readJson<{ entries?: Array<{ caseId: string; cycles?: Array<{ attempts?: Array<{ attemptId: string; status: string; invalidated?: boolean }> }> }> }>(ledgerPath)
    : { entries: [] };
  const supersededAttempts: string[] = [];
  const supersededCaseIds: string[] = [];
  for (const entry of ledger.entries ?? []) {
    if (!selected.has(entry.caseId)) continue;
    const latest = entry.cycles?.flatMap((cycle) => cycle.attempts ?? [])
      .filter((attempt) => !attempt.invalidated)
      .at(-1);
    if (latest?.status === 'failed') {
      supersededAttempts.push(latest.attemptId);
      supersededCaseIds.push(entry.caseId);
    }
  }
  writeJson(diagnosisPath, {
    schemaVersion: '1.0.0',
    applicationId: 'merchant-center',
    caseIds: [...caseIds].sort(),
    rootCause: '公共 runner 修复了同批 case 的门禁隔离；本诊断仅允许当前调味 canary 中已有失败收据的用例开启新修复周期。',
    correctiveAction: '逐条运行当前 canary，用当前 caseFingerprint、implementationFingerprint、业务操作、断言、清理和 Allure 收据重新验证；失败按真实分类保留。',
    evidenceRefs: [
      'Test Automation Platform/scripts/run-system-test.ts',
      'Merchant Center UITest/scripts/run-product-center-project-canary.ts',
      'Merchant Center UITest/output/system-test/merchant-center-product-center-seasoning/repair-attempt-ledger.json',
    ],
    supersedesAttemptIds: [...new Set(supersededAttempts)].sort(),
  });
  return { path: diagnosisPath, supersededCaseIds: [...new Set(supersededCaseIds)].sort() };
}

function runSourceGoverned(caseIds: readonly string[], runLabel: string, repairDiagnosisPath: string): number {
  const previousRunId = process.env.PC_SOURCE_GOVERNED_RUN_ID;
  process.env.PC_SOURCE_GOVERNED_RUN_ID = `project-canary-${runLabel}`;
  try {
    return runProductCenterSourceGoverned({ execute: true, caseIds, repairDiagnosisPath });
  } finally {
    if (previousRunId === undefined) delete process.env.PC_SOURCE_GOVERNED_RUN_ID;
    else process.env.PC_SOURCE_GOVERNED_RUN_ID = previousRunId;
  }
}

function ensureSourceGovernedRepairDiagnosis(rootDir: string, caseIds: readonly string[]): {
  path: string;
  supersededCaseIds: string[];
} {
  const diagnosisPath = path.join(rootDir, 'deliverables/system-test-platform/product-center-source-canary-repair-diagnosis.json');
  const supersededAttempts = findSourceCanarySupersededAttempts(rootDir, caseIds);
  writeJson(diagnosisPath, {
    schemaVersion: '1.0.0',
    applicationId: 'merchant-center-product-center',
    caseIds: [...caseIds].sort(),
    rootCause: '当前优化计划已将所选 source-governed 用例判定为需要当前指纹收据；历史失败只作为诊断输入，不能替代本轮 sentinel 结果。',
    correctiveAction: '使用当前定向复核路由执行所选用例，保留业务失败、自动化失败或环境失败的真实分类，并以当前用例和实现指纹生成标准收据。',
    evidenceRefs: [
      'Merchant Center UITest/scripts/run-product-center-project-canary.ts',
      'Merchant Center UITest/scripts/run-product-center-source-governed.ts',
      'Merchant Center UITest/utils/product-center-auth-batch-session.ts',
      'Merchant Center UITest/output/product-center-source-governed-project-canary-product-center-all-landed-canary-20260830-v2-reports.json',
      'Merchant Center UITest/output/system-test-repair/product-center/repair-attempt-ledger.json',
    ],
    supersedesAttemptIds: supersededAttempts.map((item) => item.attemptId),
  });
  return {
    path: diagnosisPath,
    supersededCaseIds: supersededAttempts.map((item) => item.caseId),
  };
}

function findSourceCanarySupersededAttempts(rootDir: string, caseIds: readonly string[]): Array<{
  caseId: string;
  attemptId: string;
}> {
  const ledger = readJson<{
    entries: Array<{
      caseId: string;
      cycles: Array<{ attempts: Array<{ attemptId: string; runId: string; status: string; invalidated?: boolean }> }>;
    }>;
  }>(path.join(rootDir, 'output/system-test-repair/product-center/repair-attempt-ledger.json'));
  const selected = new Set(caseIds);
  const result: Array<{ caseId: string; attemptId: string }> = [];
  for (const entry of ledger.entries) {
    if (!selected.has(entry.caseId)) continue;
    const latest = entry.cycles.flatMap((cycle) => cycle.attempts)
      .filter((attempt) => !attempt.invalidated)
      .at(-1);
    if (!latest || latest.status !== 'failed') continue;
    if (sentinelCaseIds.has(entry.caseId)) {
      result.push({ caseId: entry.caseId, attemptId: latest.attemptId });
      continue;
    }
    const reportNames = ['group', 'item', 'remaining'].map((runnerId) => (
      path.join(rootDir, `output/product-center-${runnerId}-source-governed-${latest.runId}.json`)
    ));
    if (reportNames.some((reportPath) => reportContainsAuthStateMissing(reportPath, entry.caseId))) {
      result.push({ caseId: entry.caseId, attemptId: latest.attemptId });
    }
  }
  return result;
}

function reportContainsAuthStateMissing(reportPath: string, caseId: string): boolean {
  if (!fs.existsSync(reportPath)) return false;
  const document = readJson<{ suites?: unknown[] }>(reportPath);
  let matched = false;
  const visit = (suites: readonly unknown[]): void => {
    for (const rawSuite of suites) {
      const suite = rawSuite as { suites?: unknown[]; specs?: Array<{ title?: string; tests?: unknown[] }> };
      for (const spec of suite.specs ?? []) {
        for (const rawTest of spec.tests ?? []) {
          const test = rawTest as {
            annotations?: Array<{ type?: string; description?: string }>;
            results?: Array<{ error?: { message?: string }; errors?: Array<{ message?: string }> }>;
          };
          const annotatedCaseId = test.annotations?.find((item) => (
            ['canonical-case-id', 'group-case-id', 'case-id'].includes(item.type ?? '')
          ))?.description;
          if (annotatedCaseId !== caseId && !String(spec.title ?? '').includes(caseId)) continue;
          const messages = (test.results ?? []).flatMap((result) => [
            result.error?.message,
            ...(result.errors ?? []).map((error) => error.message),
          ]).filter((message): message is string => Boolean(message));
          if (messages.some((message) => /Error reading storage state[\s\S]*ENOENT[\s\S]*auth-state\.json/i.test(message))) {
            matched = true;
          }
        }
      }
      visit(suite.suites ?? []);
    }
  };
  visit(document.suites ?? []);
  return matched;
}

function terminalCaseIdsFor(moduleId: string, caseIds: readonly string[], runLabel: string, exitCode: number): string[] {
  if (exitCode === 2) return [];
  if (moduleId === 'seasoning') {
    return resolveProductCenterSeasoningTerminalCaseIds({
      projectRoot,
      flowId: `${runLabel}-seasoning`,
      selectedCaseIds: caseIds,
      currentCases: caseIds.flatMap((caseId) => {
        const current = caseById.get(caseId);
        return current ? [{
          caseId,
          caseFingerprint: current.caseFingerprint,
          implementationFingerprint: runtimeImplementationFingerprints.get(caseId) ?? current.implementationFingerprint,
        }] : [];
      }),
    });
  }
  if (moduleId !== 'source-governed') return [];
  const manifestPath = path.join(projectRoot, `output/product-center-source-governed-project-canary-${runLabel}-reports.json`);
  return resolveProductCenterSourceTerminalCaseIds({ projectRoot, manifestPath, selectedCaseIds: caseIds });
}

function readCheckpoint(runLabel: string, fingerprint: string, intent: ExecutionIntent): CanaryCheckpoint {
  if (fs.existsSync(checkpointPath)) {
    const prior = readJson<CanaryCheckpoint>(checkpointPath);
    if (prior.runId === runLabel && prior.planFingerprint === fingerprint) {
      if (!prior.executionIntentFingerprint || !prior.selectedFingerprint || !Array.isArray(prior.terminalCaseIds) || !Array.isArray(prior.incompleteCaseIds)) {
        throw new Error('EXECUTION_INTENT_CHECKPOINT_METADATA_MISSING');
      }
      assertExecutionIntentContract({
        intent,
        checkpoint: { intentFingerprint: prior.executionIntentFingerprint, selectedFingerprint: prior.selectedFingerprint },
      });
      assertExecutionIntentCheckpointState({
        intent,
        terminalCaseIds: prior.terminalCaseIds,
        incompleteCaseIds: prior.incompleteCaseIds,
      });
      return prior;
    }
  }
  return { schemaVersion: '1.0.0', runId: runLabel, planFingerprint: fingerprint, status: 'running', completedModules: [], moduleExitCodes: {}, terminalCaseIds: [], incompleteCaseIds: [...intent.selectedCaseIds].sort(), ...buildProductCenterCanaryCheckpointMetadata(intent), updatedAt: new Date().toISOString() };
}
function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function writeJson(filePath: string, value: unknown): void { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); fs.renameSync(`${filePath}.tmp`, filePath); }
function argument(name: string): string | undefined { const prefix = `--${name}=`; return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length); }
function timestamp(): string { return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }

function buildRuntimeImplementationFingerprints(
  rootDir: string,
  optimizationCases: readonly ProjectRemediationOptimizationCase[],
): Map<string, string> {
  const result = new Map(optimizationCases.map((item) => [item.caseId, item.implementationFingerprint]));
  const groupBindingsPath = path.join(rootDir, 'contracts/product-center/group/product-center-group-bindings.json');
  if (fs.existsSync(groupBindingsPath)) {
    const groupBindings = readJson<{ cases: Array<{
      caseId: string;
      handlerId: string | null;
      generationAllowed: boolean;
      bindingFingerprint: string;
    }> }>(groupBindingsPath);
    for (const item of buildProductCenterGroupCaseFingerprintManifest(rootDir, groupBindings.cases).cases) {
      result.set(item.caseId, item.implementationFingerprint);
    }
  }
  for (const item of optimizationCases) {
    if (item.module === 'image' || item.module === 'tag') {
      const sources = ['tests/generated/product-center-legacy-remaining.generated.spec.ts'];
      if (['TC-TAG-DESC-014', 'TC-TAG-STAT-013', 'TC-TAG-BDG-009'].includes(item.caseId)) {
        sources.push('pages/sidebar.page.ts', 'pages/product-center/tag-management.page.ts');
      }
      result.set(item.caseId, fingerprintImplementationSources(rootDir, sources).fingerprint);
    }
  }
  return result;
}

function repairLedgerPath(rootDir: string, module: string): string {
  return module === 'seasoning'
    ? path.join(rootDir, 'output/system-test/merchant-center-product-center-seasoning/repair-attempt-ledger.json')
    : path.join(rootDir, 'output/system-test-repair/product-center/repair-attempt-ledger.json');
}

function applicationIdForModule(module: string): string {
  return module === 'seasoning' ? 'merchant-center' : 'merchant-center-product-center';
}

function readObservedProductFindingCaseIds(rootDir: string): Set<string> {
  const bindingsPath = path.join(rootDir, 'contracts/product-center/group/product-center-group-bindings.json');
  const bindings = readJson<{ cases?: Array<{ caseId?: string; blockClassification?: string }> }>(bindingsPath);
  return new Set((bindings.cases ?? [])
    .filter((item) => item.blockClassification === 'observed-product-drift' && item.caseId)
    .map((item) => item.caseId as string));
}
