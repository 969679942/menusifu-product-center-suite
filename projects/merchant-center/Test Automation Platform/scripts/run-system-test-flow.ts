import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildSystemTestArtifacts } from './build-system-test-contract';
import { compileSystemTestPlanFiles } from './compile-system-test-plan';
import { resolveSystemTestExecutionMode, runSystemTest } from './run-system-test';
import {
  applySystemTestAdditionalReporterArguments,
  resolveSystemTestOptimizationArguments,
} from './run-system-test-cli';
import {
  fingerprintSystemTestValue,
  type SystemTestManifest,
} from '../src/automation/system-test/system-test-contract';
import { runtimeAuditNeedsRefresh } from '../src/utils/runtime-audit-freshness';
import type { SystemTestPlan } from '../src/automation/system-test/system-test-plan-compiler';
import { assertSystemTestOptimizationPlanMetadata, type SystemTestOptimizationPlan } from '../src/governance/system-test-optimization-gate';
import {
  assertExecutionIntentCheckpointMetadata,
  fingerprintExecutionSelection,
} from '../src/governance/execution-intent';
import {
  fingerprintRuntimeAuditablePlan,
  type RuntimeAuditCorrectionDocument,
} from '../src/utils/test-plan-runtime-audit-correction';
import {
  FileAuditEventStore,
  type AuditEventInput,
} from '../src/audit/event-log';

type FlowCheckpoint = {
  schemaVersion: '1.0.0';
  flowId: string;
  systemId: string;
  status: 'running' | 'compiled' | 'executed' | 'completed-with-findings' | 'blocked';
  phase: 'audit' | 'compile' | 'contract' | 'execute' | 'complete';
  selectedCaseIds: string[];
  intentFingerprint: string | null;
  selectionFingerprint: string | null;
  terminalCaseIds: string[];
  incompleteCaseIds: string[];
  runId: string | null;
  runIds: string[];
  executionFingerprint: string | null;
  error: string | null;
  updatedAt: string;
  executionMode: 'incremental' | 'full-regression';
};

const rootDir = path.resolve(process.env.SYSTEM_TEST_PROJECT_ROOT ?? process.cwd());

export async function runSystemTestFlow(input: {
  planPath: string;
  manifestPath: string;
  execute?: boolean;
  flowId?: string;
  repairDiagnosisPath?: string;
  fullRegression?: boolean;
  fullRegressionBatchSize?: number;
  optimizationPlanPath?: string;
  optimizationStage?: 'canary' | 'batch';
  auditEventLogPath?: string;
}): Promise<{ exitCode: number; checkpointPath: string; selectedCaseIds: string[] }> {
  const fullRegression = input.fullRegression === true;
  if (fullRegression && (input.optimizationPlanPath || input.optimizationStage)) {
    throw new Error('FULL_REGRESSION_OPTIMIZATION_MIXED');
  }
  if (input.execute) {
    resolveSystemTestExecutionMode({
      executionIntent: fullRegression ? 'full-regression' : 'repair',
      fullRegressionAuthorized: fullRegression,
      optimizationPlanPath: input.optimizationPlanPath,
      optimizationStage: input.optimizationStage,
    });
  }
  const manifestPath = path.resolve(rootDir, input.manifestPath);
  const planPath = path.resolve(rootDir, input.planPath);
  const manifest = readJson<SystemTestManifest>(manifestPath);
  const plan = readJson<SystemTestPlan>(planPath);
  const executionFingerprint = fingerprintSystemTestValue({
    manifest: { system: manifest.system, execution: manifest.execution, policies: manifest.policies },
    plan,
    runner: fs.readFileSync(path.resolve(__dirname, 'run-system-test.ts'), 'utf8'),
  });
  const checkpointPath = path.join(rootDir, 'output/system-test-flow', manifest.system.systemId, 'checkpoint.json');
  const persistedCheckpoint = fs.existsSync(checkpointPath)
    ? readJson<FlowCheckpoint>(checkpointPath)
    : undefined;
  if (persistedCheckpoint?.status === 'running' && persistedCheckpoint.runIds.length > 0) {
    assertExecutionIntentCheckpointMetadata(persistedCheckpoint);
  }
  const resumableCheckpoint = persistedCheckpoint?.status === 'running'
    && persistedCheckpoint.runIds.length > 0
    ? persistedCheckpoint
    : undefined;
  const flowId = input.flowId
    ?? resumableCheckpoint?.flowId
    ?? `system-test-flow-${Date.now()}`;
  const resumeCheckpoint = persistedCheckpoint?.flowId === flowId
    && persistedCheckpoint.status === 'running'
    && persistedCheckpoint.executionFingerprint === executionFingerprint
    && persistedCheckpoint.runIds.length > 0
    ? persistedCheckpoint
    : undefined;
  const auditEventLogPath = input.auditEventLogPath
    ? resolveProjectAuditEventLogPath(rootDir, input.auditEventLogPath)
    : null;
  let checkpoint: FlowCheckpoint = resumeCheckpoint ?? {
    schemaVersion: '1.0.0', flowId, systemId: manifest.system.systemId, status: 'running',
    phase: manifest.execution.audit ? 'audit' : 'compile',
    selectedCaseIds: [], intentFingerprint: null, selectionFingerprint: null, terminalCaseIds: [], incompleteCaseIds: [],
    runId: null, runIds: [], executionFingerprint, error: null, updatedAt: new Date().toISOString(),
    executionMode: input.fullRegression ? 'full-regression' : 'incremental',
  };
  persist(checkpointPath, checkpoint);
  appendFlowAuditEvent(auditEventLogPath, {
    eventType: 'flow.started', manifest, plan, flowId,
    outcome: 'success', checkpointId: flowId,
    details: { phase: checkpoint.phase, executionMode: checkpoint.executionMode },
  });
  try {
    if (manifest.execution.audit) {
      appendFlowAuditEvent(auditEventLogPath, {
        eventType: 'audit.started', manifest, plan, flowId,
        outcome: 'success', checkpointId: flowId,
      });
      assertAuditContract({ rootDir, plan, manifest });
      if (shouldRunAudit({ rootDir, planPath, manifest })) {
        const auditExit = await executeAudit({ rootDir, planPath, manifestPath, manifest });
        if (auditExit !== 0) throw new Error(`SYSTEM_TEST_AUDIT_FAILED:${auditExit}`);
      }
      appendFlowAuditEvent(auditEventLogPath, {
        eventType: 'audit.completed', manifest, plan, flowId,
        outcome: 'success', checkpointId: flowId,
      });
      checkpoint = update(checkpoint, { phase: 'compile' });
      persist(checkpointPath, checkpoint);
    }
    compileSystemTestPlanFiles({ rootDir, planPath, manifestPath });
    appendFlowAuditEvent(auditEventLogPath, {
      eventType: 'plan.compiled', manifest, plan, flowId,
      outcome: 'success', checkpointId: flowId,
    });
    checkpoint = update(checkpoint, { phase: 'contract', status: 'compiled' });
    persist(checkpointPath, checkpoint);
    const selectionPath = path.join(path.dirname(manifestPath), 'execution-selection.json');
    const selection = readJson<{ selectedCaseIds?: string[] }>(selectionPath);
    const artifacts = buildSystemTestArtifacts({ rootDir, manifestPath });
    const optimizationPlan = input.optimizationPlanPath
      ? readJson<SystemTestOptimizationPlan>(path.resolve(rootDir, input.optimizationPlanPath))
      : undefined;
    if (optimizationPlan) assertSystemTestOptimizationPlanMetadata(optimizationPlan);
    const selectedCaseIds = resolveFlowExecutionSelection({
      fullRegression: input.fullRegression === true,
      selectedCaseIds: selection.selectedCaseIds ?? [],
      availableCaseIds: artifacts.contract.cases.map((item) => item.caseId),
      optimizationPlan,
      optimizationStage: input.optimizationStage,
    });
    checkpoint = update(checkpoint, {
      phase: input.execute && selectedCaseIds.length > 0 ? 'execute' : 'complete',
      status: input.execute && selectedCaseIds.length > 0 ? 'running' : 'compiled',
      selectedCaseIds,
      intentFingerprint: fingerprintSystemTestValue({ executionFingerprint, executionMode: checkpoint.executionMode, selectedCaseIds }),
      selectionFingerprint: fingerprintExecutionSelection(selectedCaseIds),
      terminalCaseIds: [],
      incompleteCaseIds: [...selectedCaseIds],
    });
    persist(checkpointPath, checkpoint);
    if (!input.execute || selectedCaseIds.length === 0) {
      return { exitCode: 0, checkpointPath, selectedCaseIds: checkpoint.selectedCaseIds };
    }
    const batches = partitionSystemTestCasesForExecution(
      checkpoint.selectedCaseIds,
      artifacts.contract.cases,
      input.fullRegression ? input.fullRegressionBatchSize ?? 12 : Number.MAX_SAFE_INTEGER,
    );
    const completedRunIds = new Set(resolveFlowResumeRunIds({
      existingCheckpoint: resumeCheckpoint,
      flowId,
      selectedCaseIds: checkpoint.selectedCaseIds,
      completedRunIds: resumeCheckpoint?.runIds.filter((runId) => isCompletedFlowRun({
        rootDir, systemId: manifest.system.systemId, runId,
      })) ?? [],
    }));
    const results: Array<{ runId: string; exitCode: number; completion: ReturnType<typeof classifyFlowCompletion> }> = [];
    for (const batch of batches) {
      const batchSuffix = batch.batchCount > 1
        ? `-batch-${String(batch.batchIndex).padStart(2, '0')}-of-${String(batch.batchCount).padStart(2, '0')}`
        : '';
      const runId = `${flowId}-run-${safeKey(batch.profile)}${batchSuffix}`;
      if (completedRunIds.has(runId)) {
        const report = readJson<{ exitCode?: number }>(path.join(
          rootDir, 'output/system-test', manifest.system.systemId, runId, 'run-report.json',
        ));
        const exitCode = report.exitCode ?? 1;
        results.push({
          runId,
          exitCode,
          completion: classifyFlowCompletion({
            rootDir, systemId: manifest.system.systemId, runId, exitCode,
          }),
        });
        continue;
      }
      appendFlowAuditEvent(auditEventLogPath, {
        eventType: 'batch.started', manifest, plan, flowId, runId,
        outcome: 'success', checkpointId: flowId,
        details: { caseIds: batch.caseIds, profile: batch.profile, batchIndex: batch.batchIndex, batchCount: batch.batchCount },
      });
      appendFlowAuditEvent(auditEventLogPath, {
        eventType: 'run.started', manifest, plan, flowId, runId,
        outcome: 'success', checkpointId: flowId,
        details: { caseIds: batch.caseIds, executionContextProfile: batch.profile },
      });
      const exitCode = await runSystemTest({
        manifestPath,
        runId,
        caseIds: batch.caseIds,
        repairDiagnosisPath: input.repairDiagnosisPath,
        executionIntent: input.fullRegression ? 'full-regression' : 'repair',
        fullRegressionAuthorized: input.fullRegression === true,
        optimizationPlanPath: fullRegression ? undefined : input.optimizationPlanPath,
        optimizationStage: fullRegression ? undefined : input.optimizationStage,
        auditEventLogPath: auditEventLogPath ?? undefined,
      });
      results.push({
        runId,
        exitCode,
        completion: classifyFlowCompletion({ rootDir, systemId: manifest.system.systemId, runId, exitCode }),
      });
      appendFlowAuditEvent(auditEventLogPath, {
        eventType: 'run.completed', manifest, plan, flowId, runId,
        outcome: exitCode === 0 ? 'success' : 'failed', checkpointId: flowId,
        effectiveSuccess: exitCode === 0,
        details: { exitCode, caseIds: batch.caseIds, completion: results.at(-1)?.completion.status },
      });
      appendFlowAuditEvent(auditEventLogPath, {
        eventType: 'batch.completed', manifest, plan, flowId, runId,
        outcome: exitCode === 0 ? 'success' : 'failed', checkpointId: flowId,
        effectiveSuccess: exitCode === 0,
        details: { exitCode, caseIds: batch.caseIds, batchIndex: batch.batchIndex, batchCount: batch.batchCount },
      });
      const terminalCaseIds = [...new Set([
        ...checkpoint.terminalCaseIds,
        ...(isTerminalFlowCompletion(results.at(-1)?.completion.status) ? batch.caseIds : []),
      ])].sort();
      checkpoint = update(checkpoint, {
        runId, runIds: results.map((item) => item.runId), terminalCaseIds,
        incompleteCaseIds: checkpoint.selectedCaseIds.filter((caseId) => !terminalCaseIds.includes(caseId)),
      });
      persist(checkpointPath, checkpoint);
      if (results.at(-1)?.completion.status === 'blocked' && !input.fullRegression) break;
    }
    const blocked = results.find((item) => item.completion.status === 'blocked');
    const finding = results.find((item) => item.completion.status === 'completed-with-findings');
    const completion = blocked?.completion ?? finding?.completion ?? { status: 'executed' as const, error: null };
    const exitCode = blocked?.exitCode ?? finding?.exitCode ?? 0;
    const runId = results.at(-1)?.runId ?? null;
    checkpoint = update(checkpoint, {
      phase: 'complete', status: completion.status, runId, runIds: results.map((item) => item.runId),
      error: completion.error,
      incompleteCaseIds: checkpoint.selectedCaseIds.filter((caseId) => !checkpoint.terminalCaseIds.includes(caseId)),
    });
    persist(checkpointPath, checkpoint);
    appendFlowAuditEvent(auditEventLogPath, {
      eventType: 'flow.completed', manifest, plan, flowId,
      outcome: exitCode === 0 ? 'success' : 'failed', checkpointId: flowId,
      effectiveSuccess: exitCode === 0,
      details: { status: checkpoint.status, selectedCaseIds: checkpoint.selectedCaseIds, runIds: checkpoint.runIds },
    });
    return { exitCode, checkpointPath, selectedCaseIds: checkpoint.selectedCaseIds };
  } catch (error) {
    checkpoint = update(checkpoint, { phase: 'complete', status: 'blocked', error: errorMessage(error) });
    persist(checkpointPath, checkpoint);
    appendFlowAuditEvent(auditEventLogPath, {
      eventType: 'flow.failed', manifest, plan, flowId,
      outcome: 'blocked', checkpointId: flowId,
      details: { phase: checkpoint.phase, error: checkpoint.error },
    });
    return { exitCode: 2, checkpointPath, selectedCaseIds: checkpoint.selectedCaseIds };
  }
}

export function appendFlowAuditEvent(
  filePath: string | null,
  input: {
    eventType: AuditEventInput['eventType'];
    manifest: SystemTestManifest;
    plan: SystemTestPlan;
    flowId: string;
    runId?: string;
    outcome: AuditEventInput['outcome'];
    checkpointId: string;
    effectiveSuccess?: boolean;
    details?: unknown;
  },
): void {
  if (!filePath) return;
  const store = new FileAuditEventStore({ filePath });
  const scope = input.manifest.system.portabilityScope;
  const prior = store.query({
    eventType: input.eventType,
    runId: input.runId ?? input.flowId,
  });
  const attempt = prior.length + 1;
  store.append({
    eventId: `${input.runId ?? input.flowId}:${input.eventType}:attempt-${attempt}`,
    eventType: input.eventType,
    actorType: 'runner',
    actorId: 'system-test-flow',
    applicationId: scope?.applicationId ?? input.manifest.system.systemId,
    businessDomainId: scope?.businessDomainId ?? input.plan.systemId,
    planId: input.plan.systemId,
    runId: input.runId ?? input.flowId,
    traceId: input.flowId,
    checkpointId: input.checkpointId,
    attempt,
    retryOfEventId: prior.at(-1)?.eventId ?? null,
    outcome: input.outcome,
    effectiveSuccess: input.effectiveSuccess,
    details: input.details,
  });
}

export function resolveProjectAuditEventLogPath(projectRoot: string, value: string): string {
  const normalized = value.replaceAll('\\', '/');
  if (!normalized.trim() || path.isAbsolute(value) || normalized.split('/').includes('..')) {
    throw new Error(`AUDIT_EVENT_LOG_PATH_INVALID:${value}`);
  }
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`AUDIT_EVENT_LOG_PATH_INVALID:${value}`);
  }
  return resolved;
}

export function partitionSystemTestCasesByExecutionContext(
  selectedCaseIds: readonly string[],
  cases: ReadonlyArray<{ caseId: string; executionContextProfile?: string }>,
): Array<{ profile: string; caseIds: string[] }> {
  const selected = new Set(selectedCaseIds);
  const grouped = new Map<string, string[]>();
  for (const item of cases) {
    if (!selected.has(item.caseId)) continue;
    const profile = item.executionContextProfile ?? 'default';
    grouped.set(profile, [...(grouped.get(profile) ?? []), item.caseId]);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([profile, caseIds]) => ({ profile, caseIds: [...caseIds].sort() }));
}

export function partitionSystemTestCasesForExecution(
  selectedCaseIds: readonly string[],
  cases: ReadonlyArray<{ caseId: string; executionContextProfile?: string }>,
  maxCasesPerBatch: number,
): Array<{ profile: string; caseIds: string[]; batchIndex: number; batchCount: number }> {
  if (!Number.isInteger(maxCasesPerBatch) || maxCasesPerBatch < 1) {
    throw new Error(`SYSTEM_TEST_BATCH_SIZE_INVALID:${maxCasesPerBatch}`);
  }
  return partitionSystemTestCasesByExecutionContext(selectedCaseIds, cases).flatMap((group) => {
    const batchCount = Math.ceil(group.caseIds.length / maxCasesPerBatch);
    return Array.from({ length: batchCount }, (_, index) => ({
      profile: group.profile,
      caseIds: group.caseIds.slice(index * maxCasesPerBatch, (index + 1) * maxCasesPerBatch),
      batchIndex: index + 1,
      batchCount,
    }));
  });
}

function safeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'default';
}

export function classifyFlowCompletion(input: {
  rootDir: string;
  systemId: string;
  runId: string;
  exitCode: number;
}): { status: FlowCheckpoint['status']; error: string | null } {
  const runRoot = path.join(input.rootDir, 'output/system-test', input.systemId, input.runId);
  const reportPath = path.join(runRoot, 'run-report.json');
  const ledgerPath = path.join(runRoot, 'evidence-ledger.json');
  if (!fs.existsSync(reportPath) || !fs.existsSync(ledgerPath)) {
    return { status: 'blocked', error: `系统测试执行失败，退出码 ${input.exitCode}` };
  }
  const report = readJson<{
    failureCategories?: string[];
    securityFindings?: number;
  }>(reportPath);
  const ledger = readJson<{
    summary?: { selected?: number; executed?: number; evidenceIncomplete?: number };
  }>(ledgerPath);
  const summary = ledger.summary;
  const completeExecution = summary?.selected !== undefined && summary.executed === summary.selected;
  if (!completeExecution) {
    return { status: 'blocked', error: `系统测试未完成全部选中用例，退出码 ${input.exitCode}` };
  }
  if (input.exitCode === 0 && summary.evidenceIncomplete === 0) {
    return { status: 'executed', error: null };
  }
  const categories = (report.failureCategories ?? []).join(',') || 'evidence-incomplete';
  const evidenceNote = summary.evidenceIncomplete && summary.evidenceIncomplete > 0
    ? `，证据不完整 ${summary.evidenceIncomplete} 条`
    : '';
  return {
    status: 'completed-with-findings',
    error: `已完成全部选中用例执行，失败分类：${categories}${evidenceNote}，退出码 ${input.exitCode}`,
  };
}

export function resolveFlowResumeRunIds(input: {
  existingCheckpoint?: Pick<FlowCheckpoint, 'flowId' | 'status' | 'selectedCaseIds' | 'runIds'>;
  flowId: string;
  selectedCaseIds: readonly string[];
  completedRunIds: readonly string[];
}): string[] {
  const checkpoint = input.existingCheckpoint;
  if (!checkpoint || checkpoint.flowId !== input.flowId || checkpoint.status !== 'running') return [];
  const selected = [...new Set(input.selectedCaseIds)].sort();
  const checkpointSelected = [...new Set(checkpoint.selectedCaseIds)].sort();
  if (JSON.stringify(selected) !== JSON.stringify(checkpointSelected)) {
    throw new Error('SYSTEM_TEST_CHECKPOINT_SELECTION_DRIFT');
  }
  const completed = new Set(input.completedRunIds);
  return checkpoint.runIds.filter((runId) => completed.has(runId));
}

function isCompletedFlowRun(input: { rootDir: string; systemId: string; runId: string }): boolean {
  const runRoot = path.join(input.rootDir, 'output/system-test', input.systemId, input.runId);
  const reportPath = path.join(runRoot, 'run-report.json');
  const ledgerPath = path.join(runRoot, 'evidence-ledger.json');
  if (!fs.existsSync(reportPath) || !fs.existsSync(ledgerPath)) return false;
  const ledger = readJson<{ summary?: { selected?: number; executed?: number } }>(ledgerPath);
  return ledger.summary?.selected !== undefined && ledger.summary.executed === ledger.summary.selected;
}

export function shouldRunAudit(input: {
  rootDir: string;
  planPath: string;
  manifest: SystemTestManifest;
}): boolean {
  const audit = input.manifest.execution.audit;
  if (!audit) return false;
  if (audit.trigger === 'always') return true;
  const outputPath = path.resolve(input.rootDir, audit.outputPath);
  if (!fs.existsSync(outputPath)) return true;
  const plan = readJson<SystemTestPlan>(path.resolve(input.rootDir, input.planPath));
  const document = readJson<RuntimeAuditCorrectionDocument>(outputPath);
  if (document.planId !== plan.systemId) return true;
  if (document.planFingerprint !== fingerprintRuntimeAuditablePlan(plan.cases.map((item) => ({
    caseId: item.caseId,
    title: item.title,
    preconditions: item.conditions,
    actions: item.actions,
    expectedResults: item.expectations.map((expectation) => expectation.expected),
    route: item.route,
    sourceIds: item.sourceIds,
    coverageIds: item.coverageIds,
    capabilityIds: item.capabilities.map((capability) => capability.id),
    assertionAdapterIds: item.expectations.map((expectation) => expectation.assertionAdapterId),
  })))) return true;
  const executionContext = input.manifest.system?.executionContext;
  if (runtimeAuditNeedsRefresh({
    generatedAt: document.generatedAt,
    freshUntil: document.freshUntil,
    maxAgeDays: document.context?.maxEvidenceAgeDays,
    applicationVersionFingerprint: document.context?.applicationVersionFingerprint,
    expectedApplicationVersionFingerprint: undefined,
    environmentId: document.context?.environmentId,
    expectedEnvironmentId: executionContext?.environmentId,
    roleId: document.context?.roleId,
    expectedRoleId: executionContext?.roleId,
    locale: document.context?.locale,
    expectedLocale: executionContext?.locale,
  })) return true;
  const outputTime = fs.statSync(outputPath).mtimeMs;
  return [input.planPath, audit.specPath, input.manifest.execution.playwrightConfigPath]
    .map((filePath) => path.resolve(input.rootDir, filePath))
    .some((filePath) => !fs.existsSync(filePath) || fs.statSync(filePath).mtimeMs > outputTime);
}

function assertAuditContract(input: {
  rootDir: string;
  plan: SystemTestPlan;
  manifest: SystemTestManifest;
}): void {
  const audit = input.manifest.execution.audit;
  if (!audit) return;
  if (!input.plan.runtimeAuditPath) throw new Error('SYSTEM_TEST_RUNTIME_AUDIT_PATH_REQUIRED');
  const expected = path.resolve(input.rootDir, input.plan.runtimeAuditPath);
  const actual = path.resolve(input.rootDir, audit.outputPath);
  if (expected !== actual) throw new Error('SYSTEM_TEST_RUNTIME_AUDIT_OUTPUT_MISMATCH');
}

function executeAudit(input: {
  rootDir: string;
  planPath: string;
  manifestPath: string;
  manifest: SystemTestManifest;
}): Promise<number> {
  const audit = input.manifest.execution.audit!;
  const configPath = path.resolve(input.rootDir, input.manifest.execution.playwrightConfigPath);
  const outputPath = path.resolve(input.rootDir, audit.outputPath);
  const auditDependencyEnv = buildSystemTestAuditDependencyEnvironment({
    rootDir: input.rootDir,
    manifest: input.manifest,
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const child = spawn(process.execPath, [
    require.resolve('@playwright/test/cli', { paths: [input.rootDir] }),
    'test', audit.specPath,
    `--config=${configPath}`,
    `--project=${audit.project}`,
    '--workers=1',
    '--reporter=line',
  ], {
    cwd: input.rootDir,
    env: {
      ...process.env,
      SYSTEM_TEST_AUDIT_OUTPUT: outputPath,
      SYSTEM_TEST_PLAN: path.resolve(input.rootDir, input.planPath),
      SYSTEM_TEST_MANIFEST: path.resolve(input.rootDir, input.manifestPath),
      SYSTEM_TEST_BASE_URL: input.manifest.system.baseURL,
      SYSTEM_TEST_PLATFORM_ROOT: path.resolve(__dirname, '..'),
      ...auditDependencyEnv,
    },
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
}

export function buildSystemTestAuditDependencyEnvironment(input: {
  rootDir: string;
  manifest: SystemTestManifest;
}): NodeJS.ProcessEnv {
  const audit = input.manifest.execution.audit;
  if (!audit) return {};
  const profile = audit.executionContextProfile ?? 'default';
  const setupSpecPath = path.resolve(input.rootDir, input.manifest.execution.setupSpecPath);
  const contextFingerprint = fingerprintSystemTestValue({
    systemId: input.manifest.system.systemId,
    profile,
    baseURL: input.manifest.system.baseURL,
    auditProject: audit.project,
  });
  const implementationFingerprint = fingerprintSystemTestValue({
    setupSpecPath: input.manifest.execution.setupSpecPath,
    setupSpec: fs.existsSync(setupSpecPath) ? fs.readFileSync(setupSpecPath, 'utf8') : 'missing',
  });
  const stageFingerprint = fingerprintSystemTestValue({
    stage: 'audit-setup',
    contextFingerprint,
    implementationFingerprint,
  });
  const systemOutputRoot = path.join(
    input.rootDir,
    'output/system-test',
    input.manifest.system.systemId,
  );
  return {
    SYSTEM_TEST_EXECUTION_CONTEXT_PROFILE: profile,
    SYSTEM_TEST_CONTEXT_FINGERPRINT: contextFingerprint,
    SYSTEM_TEST_STAGE: 'setup',
    SYSTEM_TEST_STAGE_RECEIPT: path.join(
      systemOutputRoot,
      'stage-receipts',
      `audit-setup-${safeKey(profile)}.json`,
    ),
    SYSTEM_TEST_STAGE_FINGERPRINT: stageFingerprint,
    SYSTEM_TEST_STAGE_IMPLEMENTATION_FINGERPRINT: implementationFingerprint,
    SYSTEM_TEST_CHECKPOINT_ROOT: path.join(systemOutputRoot, 'checkpoints'),
    SYSTEM_TEST_PLAYWRIGHT_OUTPUT_DIR: path.join(systemOutputRoot, 'playwright-audit'),
  };
}

export function resolveFlowSelection(
  selectedCaseIds: readonly string[],
  availableCaseIds: readonly string[],
): string[] {
  const selected = [...new Set(selectedCaseIds.map((caseId) => caseId.trim()).filter(Boolean))].sort();
  const available = new Set(availableCaseIds);
  const unknown = selected.filter((caseId) => !available.has(caseId));
  if (unknown.length > 0) throw new Error(`SYSTEM_TEST_SELECTION_UNKNOWN_CASE_IDS:${unknown.join(',')}`);
  return selected;
}

export function resolveFlowExecutionSelection(input: {
  fullRegression: boolean;
  selectedCaseIds: readonly string[];
  availableCaseIds: readonly string[];
  optimizationPlan?: Pick<SystemTestOptimizationPlan, 'canaryCaseIds'>;
  optimizationStage?: 'canary' | 'batch';
}): string[] {
  const requestedCaseIds = input.optimizationStage === 'canary' && input.optimizationPlan
    ? input.optimizationPlan.canaryCaseIds.filter((caseId) => input.availableCaseIds.includes(caseId))
    : input.selectedCaseIds;
  return input.fullRegression
    ? [...new Set(input.availableCaseIds.map((caseId) => caseId.trim()).filter(Boolean))].sort()
    : resolveFlowSelection(requestedCaseIds, input.availableCaseIds);
}

function update(checkpoint: FlowCheckpoint, changes: Partial<FlowCheckpoint>): FlowCheckpoint {
  return { ...checkpoint, ...changes, updatedAt: new Date().toISOString() };
}

function isTerminalFlowCompletion(status: FlowCheckpoint['status'] | undefined): boolean {
  return status === 'executed' || status === 'completed-with-findings';
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function persist(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

if (require.main === module) {
  applySystemTestAdditionalReporterArguments(process.env, process.argv.slice(2));
  const planPath = argument('plan');
  const manifestPath = argument('manifest');
  const repairDiagnosisPath = argument('repair-diagnosis');
  const { optimizationPlanPath, optimizationStage } = resolveSystemTestOptimizationArguments(process.argv.slice(2));
  if (!planPath || !manifestPath) throw new Error('用法：--plan=<path> --manifest=<path> [--execute]');
  runSystemTestFlow({
    planPath,
    manifestPath,
    execute: process.argv.includes('--execute'),
    repairDiagnosisPath,
    fullRegression: process.argv.includes('--full-regression'),
    fullRegressionBatchSize: argument('batch-size')
      ? Number(argument('batch-size'))
      : undefined,
    optimizationPlanPath,
    optimizationStage,
    auditEventLogPath: argument('audit-event-log'),
  })
    .then((result) => {
      process.stdout.write(`系统测试流程检查点：${result.checkpointPath}\n`);
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      process.stderr.write(`${errorMessage(error)}\n`);
      process.exitCode = 1;
    });
}
