import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertSystemTestOptimizationGate } from '../../../Test Automation Platform/src/governance/system-test-optimization-gate';
import { appendSystemTestRepairTelemetry } from '../../../Test Automation Platform/src/automation/system-test/system-test-repair-telemetry';
import { assertSelectionMatchesPlan } from '../../../Test Automation Platform/src/automation/system-test/system-test-revalidation-policy';
import { issueSystemTestExecutionGrant, revokeSystemTestExecutionGrant } from '../../../Test Automation Platform/src/automation/system-test/system-test-execution-grant';
import { fingerprintSystemTestValue } from '../../../Test Automation Platform/src/automation/system-test/system-test-contract';
import {
  assertExecutionIntentCheckpointState,
  assertExecutionIntentCompletion,
  assertExecutionIntentContract,
  assertExecutionIntentImpactScope,
  fingerprintExecutionIntent,
  fingerprintExecutionSelection,
} from '../../../Test Automation Platform/src/governance/execution-intent';
import { resolveEvidenceLedgerTerminalCaseIds } from '../../../Test Automation Platform/src/governance/execution-terminal-receipts';
import { buildProductCenterProjectOptimizationCases } from '../adapters/product-center/product-center-project-optimization';
import { buildProductCenterBatchExecutionIntent } from '../adapters/product-center/product-center-execution-intent';
import { resolveProductCenterSourceTerminalCaseIds } from '../adapters/product-center/product-center-source-terminal-receipts';
import type { ProjectRemediationOptimizationCase, ProjectRemediationOptimizationPlan } from '../../../Test Automation Platform/src/governance/project-remediation-optimization';
import type { ProjectRemediationScopeArtifact } from '../../../Test Automation Platform/src/governance/project-remediation-scope';
import { runProductCenterItem213 } from './run-product-center-item-213';

type SourcePlan = {
  execution: { selectedCaseIds: string[]; runners: Array<{ runnerId: string; selectedCaseIds: string[] }> };
  revalidation: { selectedCaseIds: string[]; runners: Array<{ runnerId: string; selectedCaseIds: string[] }> };
};

type ImpactManifest = {
  changeId: string;
  impactedCaseIds: string[];
  classifiedExclusionCaseIds?: string[];
};

type ExecutionIndex = {
  records?: Array<{
    caseId: string;
    caseFingerprint?: string | null;
    implementationFingerprint?: string | null;
    status?: string;
    evidenceStatus?: string;
    recordedAt?: string;
  }>;
};

type BatchCheckpoint = {
  schemaVersion: '1.0.0';
  runId: string;
  planId: string;
  planFingerprint: string;
  intentFingerprint: string;
  selectedFingerprint: string;
  status: 'running' | 'completed' | 'completed-with-findings' | 'blocked' | 'paused';
  selectedCaseIds: string[];
  terminalCaseIds: string[];
  incompleteCaseIds: string[];
  reusedCaseIds: string[];
  batchStates: Record<string, 'pending' | 'running' | 'reused' | 'completed' | 'completed-with-findings' | 'blocked'>;
  unitRuns: Array<{ unitId: string; runner: string; caseIds: string[]; runId: string; exitCode: number; status: string }>;
  error: string | null;
  updatedAt: string;
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const planArgument = argument('plan');
if (!planArgument) throw new Error('OPTIMIZATION_PLAN_REQUIRED_BEFORE_BROWSER');
const planPath = path.resolve(projectRoot, planArgument);
const impactManifestArgument = argument('impact-manifest');
const impactManifest = impactManifestArgument
  ? readJson<ImpactManifest>(path.resolve(projectRoot, impactManifestArgument))
  : undefined;
const scopePath = path.join(projectRoot, 'deliverables/system-test-platform/product-center-remediation-scope.json');
const sourcePlanPath = path.join(workspaceRoot, 'deliverables/product-center-source-governance/execution-plan.json');
const executionIndexPath = path.join(projectRoot, 'deliverables/system-test-platform/execution-index.json');
const checkpointPath = path.resolve(projectRoot, argument('checkpoint')
  ?? 'deliverables/system-test-platform/product-center-batch-checkpoint.json');
const executionIntentPath = path.resolve(projectRoot, argument('execution-intent-output')
  ?? 'deliverables/system-test-platform/product-center-batch-execution-intent.json');
const executionIntentCheckpointPath = path.resolve(projectRoot, argument('execution-intent-checkpoint-output')
  ?? 'deliverables/system-test-platform/product-center-batch-execution-intent-checkpoint.json');
const groupRepairDiagnosisPath = path.join(projectRoot, 'deliverables/system-test-platform/product-center-group-repair-diagnosis-20260830.json');
const repairDiagnosisArgument = argument('repair-diagnosis');
const sourceRepairDiagnosisPath = path.resolve(projectRoot, repairDiagnosisArgument
  ?? 'deliverables/system-test-platform/product-center-source-repair-diagnosis-20260831.json');
const seasoningRepairDiagnosisPath = path.resolve(projectRoot, repairDiagnosisArgument
  ?? 'deliverables/system-test-platform/product-center-seasoning-repair-diagnosis-20260831.json');
const plan = readJson<ProjectRemediationOptimizationPlan>(planPath);
const scope = readJson<ProjectRemediationScopeArtifact>(scopePath);
if (!plan.changeId || plan.scopeTotal !== scope.cases.length || !plan.selectionFingerprint) {
  throw new Error('OPTIMIZATION_PLAN_METADATA_REQUIRED');
}
const sourcePlan = readJson<SourcePlan>(sourcePlanPath);
const cases = buildProductCenterProjectOptimizationCases({ projectRoot, scope });
const caseById = new Map(cases.map((item) => [item.caseId, item]));
const sourceIds = new Set(sourcePlan.revalidation.selectedCaseIds);
const requestedRunId = argument('run-id');
const existingCheckpoint = fs.existsSync(checkpointPath) ? readJson<BatchCheckpoint>(checkpointPath) : undefined;
const runId = requestedRunId ?? (existingCheckpoint?.status === 'running'
  ? existingCheckpoint.runId
  : `product-center-all-landed-batch-${timestamp()}`);
const selectedCaseIds = [...plan.executionEligibleCaseIds].sort();
const classifiedExclusionCaseIds = parseCsv(argument('classified-exclusion-case-ids'));
const classifiedExclusionSet = new Set(classifiedExclusionCaseIds);
const plannedCaseIds = impactManifest
  ? [...new Set(impactManifest.impactedCaseIds)].filter((caseId) => !classifiedExclusionSet.has(caseId)).sort()
  : selectedCaseIds;
const executionIntent = buildProductCenterBatchExecutionIntent({
  runId,
  plan,
  cases,
  plannedCaseIds,
  selectedCaseIds,
  classifiedExclusionCaseIds,
});
const intentFingerprint = fingerprintExecutionIntent(executionIntent);
const selectedFingerprint = fingerprintExecutionSelection(selectedCaseIds);
const acceptedFindings = new Set(plan.acceptedFindingCaseIds);
const currentReusable = resolveCurrentReusableCaseIds();
const checkpoint = loadOrCreateCheckpoint();

if (require.main === module) {
  run().then((exitCode) => { process.exitCode = exitCode; }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}

async function run(): Promise<number> {
  try {
    validatePlan();
    writeJsonAtomic(executionIntentPath, executionIntent);
    persist(checkpoint);
  } catch (error) {
    const reason = errorMessage(error);
    if (reason.startsWith('SYSTEM_TEST_SELECTION_DRIFT:')) {
      appendSystemTestRepairTelemetry({
        filePath: path.join(projectRoot, 'output/system-test-repair/product-center/repair-execution-ledger.jsonl'),
        eventType: 'selection-drift',
        sessionId: runId,
        applicationId: 'merchant-center-product-center',
        payload: { reason, plannedCaseIds: selectedCaseIds },
      });
    }
    persist({ ...checkpoint, status: 'blocked', error: reason });
    process.stderr.write(`批次执行在浏览器启动前阻断：${reason}\n`);
    return 2;
  }

  const reusable = new Set([...checkpoint.reusedCaseIds, ...currentReusable]);
  const terminal = new Set(reconcileCheckpointTerminalCaseIds(reusable));
  for (const caseId of reusable) terminal.add(caseId);
  checkpoint.reusedCaseIds = [...reusable].sort();
  checkpoint.terminalCaseIds = [...terminal].sort();
  checkpoint.status = 'running';
  checkpoint.error = null;
  persist(checkpoint);

  const sourceRecovered = resolveUnitTerminalCaseIds(
    { unitId: 'source-governed', runner: 'source-governed', caseIds: selectedCaseIds },
    unitRunId('source-governed'),
  );
  for (const caseId of sourceRecovered) terminal.add(caseId);
  if (sourceRecovered.length > 0) {
    checkpoint.reusedCaseIds = [...new Set([...checkpoint.reusedCaseIds, ...sourceRecovered])].sort();
    checkpoint.terminalCaseIds = [...terminal].sort();
    persist(checkpoint);
  }

  const sourcePending = selectedCaseIds.filter((caseId) => sourceIds.has(caseId) && !terminal.has(caseId));
  const handledItemIds = selectedCaseIds.filter((caseId) => !sourceIds.has(caseId) && caseId.startsWith('TC-ITEM-') && !terminal.has(caseId));
  const seasoningBatches = plan.batches.filter((batch) => batch.caseIds.some((caseId) => caseById.get(caseId)?.module === 'seasoning'));
  const units: Array<{ unitId: string; runner: string; caseIds: string[]; execute: () => Promise<number> }> = [];
  if (sourcePending.length > 0) {
    units.push({ unitId: 'source-governed', runner: 'source-governed', caseIds: sourcePending, execute: async () => runSource(sourcePending) });
  }
  if (handledItemIds.length > 0) {
    units.push({ unitId: 'handled-item-revalidation', runner: 'item', caseIds: handledItemIds, execute: async () => runHandledItems(handledItemIds) });
  }
  for (const batch of seasoningBatches) {
    const batchCaseIds = batch.caseIds.filter((caseId) => !terminal.has(caseId));
    if (batchCaseIds.length === 0) {
      markBatches(batch.caseIds, 'reused', terminal);
      continue;
    }
    units.push({ unitId: batch.batchId, runner: 'seasoning-system-test', caseIds: batchCaseIds, execute: async () => runSeasoning(batch.batchId, batchCaseIds) });
  }

  let blockedUnit = false;
  for (const unit of units) {
    const expectedUnitRunId = unitRunId(unit.unitId);
    const priorIndex = checkpoint.unitRuns.findIndex((item) => item.unitId === unit.unitId && item.runId === expectedUnitRunId);
    const prior = priorIndex >= 0 ? checkpoint.unitRuns[priorIndex] : undefined;
    if (prior && ['completed', 'completed-with-findings', 'reused'].includes(prior.status)
      && unit.caseIds.every((caseId) => terminal.has(caseId))) continue;
    markBatches(unit.caseIds, 'running', terminal);
    const exitCode = await unit.execute();
    const unitTerminal = resolveUnitTerminalCaseIds(unit);
    const status = unitTerminal.length === unit.caseIds.length
      ? exitCode === 0 ? 'completed' : 'completed-with-findings'
      : 'blocked';
    blockedUnit ||= status === 'blocked';
    const unitResult = { unitId: unit.unitId, runner: unit.runner, caseIds: unit.caseIds, runId: unitRunId(unit.unitId), exitCode, status };
    if (priorIndex >= 0) checkpoint.unitRuns[priorIndex] = unitResult;
    else checkpoint.unitRuns.push(unitResult);
    for (const caseId of unitTerminal) terminal.add(caseId);
    markBatches(unit.caseIds, status, terminal);
    persist({ ...checkpoint, status: 'running', terminalCaseIds: [...terminal].sort() });
  }

  const complete = terminal.size === selectedCaseIds.length;
  const hasFindings = checkpoint.unitRuns.some((item) => item.status === 'completed-with-findings');
  const finalStatus = blockedUnit || !complete ? 'blocked' : hasFindings ? 'completed-with-findings' : 'completed';
  assertExecutionIntentCompletion({ intent: executionIntent, status: finalStatus, terminalCaseIds: [...terminal].sort() });
  persist({ ...checkpoint, status: finalStatus, terminalCaseIds: [...terminal].sort(), error: complete ? null : `未完成用例：${selectedCaseIds.filter((caseId) => !terminal.has(caseId)).join(',')}` });
  process.stdout.write(`${JSON.stringify({ runId, status: finalStatus, selected: selectedCaseIds.length, terminal: terminal.size, reused: reusable.size, executed: selectedCaseIds.length - reusable.size, checkpoint: checkpointPath })}\n`);
  return complete ? (hasFindings ? 1 : 0) : 2;
}

function validatePlan(): void {
  if (plan.status !== 'ready-for-batch') throw new Error(`OPTIMIZATION_PLAN_NOT_READY:${plan.status}`);
  if (!Array.isArray(plan.reusableCaseIds) || !plan.caseDecisions || !Array.isArray(plan.candidateCanaryCaseIds)) {
    throw new Error('PRODUCT_CENTER_REVALIDATION_DECISIONS_REQUIRED');
  }
  if (repairDiagnosisArgument) {
    const diagnosis = readJson<{ planFingerprint?: unknown; selectionFingerprint?: unknown }>(sourceRepairDiagnosisPath);
    if (typeof diagnosis.planFingerprint === 'string' && diagnosis.planFingerprint !== plan.fingerprint) {
      throw new Error(`PRODUCT_CENTER_REPAIR_DIAGNOSIS_PLAN_DRIFT:diagnosis=${diagnosis.planFingerprint};plan=${plan.fingerprint}`);
    }
    if (typeof diagnosis.selectionFingerprint === 'string' && diagnosis.selectionFingerprint !== plan.selectionFingerprint) {
      throw new Error(`PRODUCT_CENTER_REPAIR_DIAGNOSIS_SELECTION_DRIFT:diagnosis=${diagnosis.selectionFingerprint};plan=${plan.selectionFingerprint}`);
    }
  }
  if (scope.status !== 'ready' || cases.length !== scope.summary.actualLanded) {
    throw new Error(`PRODUCT_CENTER_SCOPE_NOT_READY:status=${scope.status};actual=${scope.summary.actualLanded};cases=${cases.length}`);
  }
  const includedModules = new Set(plan.includedModules);
  const expectedPlanCaseIds = cases.filter((item) => includedModules.has(item.module));
  const moduleScopeCaseIds = new Set(expectedPlanCaseIds.map((item) => item.caseId));
  const actualPlanCaseIds = [...plan.executionCaseIds].sort();
  if (actualPlanCaseIds.some((caseId) => !moduleScopeCaseIds.has(caseId))) {
    throw new Error(`PRODUCT_CENTER_PLAN_SCOPE_INVALID:execution=${actualPlanCaseIds.length};moduleScope=${moduleScopeCaseIds.size}`);
  }
  if ([...acceptedFindings].some((caseId) => !actualPlanCaseIds.includes(caseId))) throw new Error('PRODUCT_CENTER_ACCEPTED_FINDINGS_INVALID');
  const planIds = new Set(selectedCaseIds);
  const batchIds = plan.batches.flatMap((batch) => batch.caseIds);
  if (batchIds.length !== selectedCaseIds.length || new Set(batchIds).size !== selectedCaseIds.length
    || batchIds.some((caseId) => !planIds.has(caseId))) {
    throw new Error('PRODUCT_CENTER_BATCH_COVERAGE_INVALID');
  }
  assertSelectionMatchesPlan({
    plannedCaseIds: selectedCaseIds,
    runnerCaseIds: plan.batches.flatMap((batch) => batch.caseIds),
    phase: 'product-center-batch-before-browser',
  });
  assertSystemTestOptimizationGate({
    plan,
    requestedCaseIds: selectedCaseIds,
    stage: 'batch',
    currentCases: cases.map((item) => ({
      caseId: item.caseId,
      caseFingerprint: item.caseFingerprint,
      implementationFingerprint: item.implementationFingerprint,
    })),
  });
  assertExecutionIntentContract({
    intent: executionIntent,
    checkpoint: { intentFingerprint: checkpoint.intentFingerprint, selectedFingerprint: checkpoint.selectedFingerprint },
  });
  assertExecutionIntentCheckpointState({
    intent: executionIntent,
    terminalCaseIds: checkpoint.terminalCaseIds,
    incompleteCaseIds: checkpoint.incompleteCaseIds,
  });
  if (classifiedExclusionCaseIds.length > 0 && !impactManifest) {
    throw new Error('PRODUCT_CENTER_EXECUTION_INTENT_IMPACT_MANIFEST_REQUIRED');
  }
  if (impactManifest) {
    if (impactManifest.changeId !== plan.changeId) throw new Error('PRODUCT_CENTER_EXECUTION_INTENT_CHANGE_ID_MISMATCH');
    const manifestExclusions = [...new Set(impactManifest.classifiedExclusionCaseIds ?? [])].sort();
    if (JSON.stringify(manifestExclusions) !== JSON.stringify(classifiedExclusionCaseIds)) {
      throw new Error('PRODUCT_CENTER_EXECUTION_INTENT_EXCLUSION_MANIFEST_MISMATCH');
    }
    assertExecutionIntentImpactScope({ intent: executionIntent, impactedCaseIds: impactManifest.impactedCaseIds });
  }
  const allowedExclusionDecisions = new Set(['static-verify', 'classified-exclusion']);
  const invalidExclusions = classifiedExclusionCaseIds.filter((caseId) => {
    const decision = plan.caseDecisions[caseId];
    if (!decision) return !impactManifest?.classifiedExclusionCaseIds?.includes(caseId);
    return !allowedExclusionDecisions.has(decision.decision) || decision.impactType === 'platform-only';
  });
  if (invalidExclusions.length > 0) {
    throw new Error(`PRODUCT_CENTER_EXECUTION_INTENT_EXCLUSION_INVALID:${invalidExclusions.join(',')}`);
  }
  if (selectedCaseIds.filter((caseId) => sourceIds.has(caseId)).some((caseId) => !caseById.has(caseId))) {
    throw new Error('SOURCE_PLAN_SELECTED_CASE_UNKNOWN');
  }
  if (selectedCaseIds.filter((caseId) => sourceIds.has(caseId)).some((caseId) => caseById.get(caseId)?.module === 'seasoning')) {
    throw new Error('SOURCE_PLAN_SEASONING_ROUTE_INVALID');
  }
  appendSystemTestRepairTelemetry({
    filePath: path.join(projectRoot, 'output/system-test-repair/product-center/repair-execution-ledger.jsonl'),
    eventType: 'repair-session',
    sessionId: runId,
    applicationId: 'merchant-center-product-center',
    payload: {
      mode: 'incremental',
      stage: 'batch',
      planId: plan.planId,
      planFingerprint: plan.fingerprint,
      selectedCaseIds,
      reusableCaseIds: [...currentReusable].sort(),
      decisionCounts: Object.values(plan.caseDecisions ?? {}).reduce<Record<string, number>>((counts, decision) => {
        counts[decision.decision] = (counts[decision.decision] ?? 0) + 1;
        return counts;
      }, {}),
    },
  });
}

function resolveUnitTerminalCaseIds(
  unit: { unitId: string; runner: string; caseIds: string[] },
  executionRunId = unitRunId(unit.unitId),
): string[] {
  if (unit.runner === 'source-governed') {
    const progressPath = path.join(projectRoot, 'output/checkpoints/item', `source-governed-${executionRunId}`, 'progress.jsonl');
    if (fs.existsSync(progressPath)) {
      const terminal = new Set<string>();
      for (const line of fs.readFileSync(progressPath, 'utf8').split(/\r?\n/).filter(Boolean)) {
        try {
          const event = JSON.parse(line) as { caseId?: string; phase?: string };
          if (event.caseId && unit.caseIds.includes(event.caseId) && ['completed', 'failed'].includes(event.phase ?? '')) {
            terminal.add(event.caseId);
          }
        } catch {}
      }
      if (terminal.size > 0) return unit.caseIds.filter((caseId) => terminal.has(caseId));
    }
    const manifestPath = path.join(projectRoot, `output/product-center-source-governed-${executionRunId}-reports.json`);
    return resolveProductCenterSourceTerminalCaseIds({ projectRoot, manifestPath, selectedCaseIds: unit.caseIds });
  }
  if (unit.runner === 'seasoning-system-test') {
    const runRoot = path.join(projectRoot, 'output/system-test/merchant-center-product-center-seasoning', executionRunId);
    const ledgerPath = path.join(runRoot, 'evidence-ledger.json');
    if (!fs.existsSync(ledgerPath)) return [];
    const ledger = readJson<{ cases?: Array<{ caseId?: string; caseFingerprint?: string; implementationFingerprint?: string; playwrightStatus?: string }> }>(ledgerPath);
    return resolveEvidenceLedgerTerminalCaseIds({
      selectedCaseIds: unit.caseIds,
      currentCases: unit.caseIds.flatMap((caseId) => {
        const current = caseById.get(caseId);
        return current ? [{
          caseId,
          caseFingerprint: current.caseFingerprint,
          implementationFingerprint: current.implementationFingerprint,
        }] : [];
      }),
      ledgers: [ledger],
    });
  }
  const reportPath = path.join(projectRoot, `output/product-center-item-handled-${executionRunId}.json`);
  if (!fs.existsSync(reportPath)) return [];
  const report = readJson<{ suites?: unknown[] }>(reportPath);
  const terminal = new Set<string>();
  visitSuites(report.suites ?? [], (test) => {
    const caseId = test.annotations?.find((item) => item.type === 'canonical-case-id')?.description;
    if (caseId && unit.caseIds.includes(caseId) && (test.results ?? []).some((result) => result.status !== 'skipped')) terminal.add(caseId);
  });
  return unit.caseIds.filter((caseId) => terminal.has(caseId));
}

function reconcileCheckpointTerminalCaseIds(reusable: ReadonlySet<string>): string[] {
  const verified = new Set(reusable);
  for (const prior of checkpoint.unitRuns) {
    const unit = { unitId: prior.unitId, runner: prior.runner, caseIds: prior.caseIds };
    for (const caseId of resolveUnitTerminalCaseIds(unit, prior.runId)) verified.add(caseId);
  }
  return selectedCaseIds.filter((caseId) => verified.has(caseId));
}

function visitSuites(suites: readonly unknown[], visit: (test: {
  annotations?: Array<{ type?: string; description?: string }>;
  results?: Array<{ status?: string }>;
}) => void): void {
  for (const rawSuite of suites) {
    const suite = rawSuite as { specs?: Array<{ tests?: unknown[] }>; suites?: unknown[] };
    for (const spec of suite.specs ?? []) for (const rawTest of spec.tests ?? []) visit(rawTest as Parameters<typeof visit>[0]);
    visitSuites(suite.suites ?? [], visit);
  }
}

async function runSeasoning(batchId: string, caseIds: readonly string[]): Promise<number> {
  return runProcess([
    require.resolve('tsx/cli'),
    'scripts/run-merchant-system-test.ts',
    'run',
    '--manifest=systems/merchant-center-product-center-seasoning/manifest.json',
    `--case-ids=${caseIds.join(',')}`,
    `--run-id=${unitRunId(batchId)}`,
    `--optimization-plan=${path.relative(projectRoot, planPath).replaceAll(path.sep, '/')}`,
    '--optimization-stage=batch',
    `--repair-diagnosis=${path.relative(projectRoot, seasoningRepairDiagnosisPath).replaceAll(path.sep, '/')}`,
  ], process.env);
}

async function runSource(caseIds: readonly string[]): Promise<number> {
  const runnerCaseIds = sourcePlan.revalidation.runners.flatMap((runner) => runner.selectedCaseIds)
    .filter((caseId) => caseIds.includes(caseId));
  assertSelectionMatchesPlan({
    plannedCaseIds: caseIds,
    runnerCaseIds,
    phase: 'source-governed-before-browser',
  });
  const env = { ...process.env, PC_SOURCE_GOVERNED_RUN_ID: unitRunId('source-governed') };
  const args = [require.resolve('tsx/cli'), 'scripts/run-product-center-source-governed.ts', '--execute', `--case-ids=${caseIds.join(',')}`];
  const diagnosisPath = repairDiagnosisArgument
    ? sourceRepairDiagnosisPath
    : caseIds.every((caseId) => caseId.startsWith('TC-GRP-'))
      ? groupRepairDiagnosisPath
      : diagnosisCoversCases(sourceRepairDiagnosisPath, caseIds)
      ? sourceRepairDiagnosisPath
      : undefined;
  if (diagnosisPath) args.push(`--repair-diagnosis=${path.relative(projectRoot, diagnosisPath).replaceAll(path.sep, '/')}`);
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot, env, stdio: 'inherit', shell: false,
  });
  return result.status ?? 1;
}

async function runHandledItems(caseIds: readonly string[]): Promise<number> {
  const candidateFingerprint = fingerprintSystemTestValue({ plan: plan.fingerprint, caseIds });
  const grant = issueSystemTestExecutionGrant({
    rootDir: projectRoot,
    applicationId: 'merchant-center-product-center',
    runId: unitRunId('handled-item-revalidation'),
    caseIds,
    ttlMs: 4 * 60 * 60 * 1000,
    candidateFingerprint,
  });
  const previous = captureEnv(['PC_ITEM_RUN_ID', 'PC_ITEM_SELECTED_CASE_IDS', 'PLAYWRIGHT_JSON_OUTPUT_NAME', ...Object.keys(grant.env)]);
  Object.assign(process.env, grant.env, {
    PC_ITEM_RUN_ID: unitRunId('handled-item-revalidation'),
    PC_ITEM_SELECTED_CASE_IDS: caseIds.join(','),
    PLAYWRIGHT_JSON_OUTPUT_NAME: `output/product-center-item-handled-${unitRunId('handled-item-revalidation')}.json`,
  });
  try {
    return runProductCenterItem213({ caseIds, workerCount: 1 });
  } finally {
    restoreEnv(previous);
    revokeSystemTestExecutionGrant(grant);
  }
}

function resolveCurrentReusableCaseIds(): string[] {
  const reusable = new Set(plan.reusableCaseIds.filter((caseId) => selectedCaseIds.includes(caseId)));
  return [...reusable].filter((caseId) => !acceptedFindings.has(caseId)).sort();
}

function loadOrCreateCheckpoint(): BatchCheckpoint {
  if (fs.existsSync(checkpointPath)) {
    const previous = readJson<BatchCheckpoint>(checkpointPath);
    if (JSON.stringify(previous.selectedCaseIds) !== JSON.stringify(selectedCaseIds)) {
      throw new Error('PRODUCT_CENTER_BATCH_CHECKPOINT_SCOPE_DRIFT');
    }
    if (previous.planFingerprint !== plan.fingerprint) {
      const archivePath = `${checkpointPath}.stale-${timestamp()}.json`;
      fs.copyFileSync(checkpointPath, archivePath);
      const reusedCaseIds = [...currentReusable].sort();
      return {
        schemaVersion: '1.0.0',
        runId,
        planId: plan.planId,
        planFingerprint: plan.fingerprint,
        intentFingerprint,
        selectedFingerprint,
        status: 'running',
        selectedCaseIds,
        terminalCaseIds: reusedCaseIds,
        incompleteCaseIds: selectedCaseIds.filter((caseId) => !reusedCaseIds.includes(caseId)),
        reusedCaseIds,
        batchStates: Object.fromEntries(plan.batches.map((batch) => [batch.batchId, 'pending'])),
        unitRuns: [],
        error: null,
        updatedAt: new Date().toISOString(),
      };
    }
    return previous;
  }
  return {
    schemaVersion: '1.0.0', runId, planId: plan.planId, planFingerprint: plan.fingerprint, status: 'running',
    intentFingerprint, selectedFingerprint, selectedCaseIds, terminalCaseIds: [], incompleteCaseIds: [...selectedCaseIds], reusedCaseIds: [], batchStates: Object.fromEntries(plan.batches.map((batch) => [batch.batchId, 'pending'])),
    unitRuns: [], error: null, updatedAt: new Date().toISOString(),
  };
}

function markBatches(caseIds: readonly string[], status: BatchCheckpoint['batchStates'][string], terminal: Set<string>): void {
  for (const batch of plan.batches) {
    if (!batch.caseIds.some((caseId) => caseIds.includes(caseId))) continue;
    if (batch.caseIds.every((caseId) => terminal.has(caseId))) checkpoint.batchStates[batch.batchId] = status;
    else checkpoint.batchStates[batch.batchId] = status === 'running' ? 'running' : 'pending';
  }
}

function runProcess(args: readonly string[], env: NodeJS.ProcessEnv): number {
  const result = spawnSync(process.execPath, args, { cwd: projectRoot, env, stdio: 'inherit', shell: false });
  return result.status ?? 1;
}

function unitRunId(unitId: string): string { return `${runId}-${unitId.replace(/[^a-zA-Z0-9_-]+/g, '_')}`; }
function timestamp(): string { return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
function argument(name: string): string | undefined { return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3); }
function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function parseCsv(value: string | undefined): string[] { return [...new Set(value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [])].sort(); }
function diagnosisCoversCases(filePath: string, caseIds: readonly string[]): boolean {
  if (!fs.existsSync(filePath)) return false;
  const diagnosis = readJson<{ caseIds?: unknown }>(filePath);
  return Array.isArray(diagnosis.caseIds) && caseIds.every((caseId) => diagnosis.caseIds?.includes(caseId));
}
function persist(value: BatchCheckpoint): void {
  value.intentFingerprint = intentFingerprint;
  value.selectedFingerprint = selectedFingerprint;
  value.terminalCaseIds = [...new Set(value.terminalCaseIds)].sort();
  value.incompleteCaseIds = selectedCaseIds.filter((caseId) => !value.terminalCaseIds.includes(caseId));
  value.updatedAt = new Date().toISOString();
  assertExecutionIntentCheckpointState({
    intent: executionIntent,
    terminalCaseIds: value.terminalCaseIds,
    incompleteCaseIds: value.incompleteCaseIds,
  });
  writeJsonAtomic(checkpointPath, value);
  writeJsonAtomic(executionIntentCheckpointPath, {
    intentFingerprint,
    selectedFingerprint,
    selectedCaseIds,
    terminalCaseIds: value.terminalCaseIds,
    incompleteCaseIds: value.incompleteCaseIds,
  });
}
function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(`${filePath}.tmp`, filePath);
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function captureEnv(keys: readonly string[]): Record<string, string | undefined> { return Object.fromEntries(keys.map((key) => [key, process.env[key]])); }
function restoreEnv(values: Record<string, string | undefined>): void { for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
