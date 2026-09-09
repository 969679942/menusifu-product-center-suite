import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { buildSystemTestArtifacts } from './build-system-test-contract';
import { evaluateSystemTestCircuit } from '../src/automation/system-test/system-test-circuit';
import { readSystemTestProgress } from '../src/automation/system-test/system-test-progress';
import { scanSystemTestArtifacts } from '../src/automation/system-test/system-test-safety';
import {
  classifySystemTestCircuit,
  classifySystemTestContractBlockers,
  uniqueSystemTestFailureCategories,
} from '../src/automation/system-test/system-test-failure';
import type { SystemTestFailureCategory } from '../src/automation/system-test/system-test-progress';
import {
  reconcileSystemTestRunState,
  writeSystemTestRunState,
  type SystemTestRunState,
} from '../src/automation/system-test/system-test-run-state';
import {
  beginSystemTestRepairAttempt,
  completeSystemTestRepairAttempt,
  reconcileOrphanedSystemTestRepairAttempts,
  readSystemTestRepairDiagnosis,
} from '../src/automation/system-test/system-test-repair-attempt-guard';
import {
  fingerprintSystemTestValue,
  type SystemTestAdapterDefinition,
} from '../src/automation/system-test/system-test-contract';
import {
  issueSystemTestExecutionGrant,
  revokeSystemTestExecutionGrant,
} from '../src/automation/system-test/system-test-execution-grant';
import {
  buildSystemTestFailureDiagnosticDocument,
  buildSystemTestDiagnosticWorkQueue,
  fingerprintSystemTestFailureDiagnostic,
} from '../src/automation/system-test/system-test-diagnostics';
import {
  evaluateSystemTestStageReceipt,
  readSystemTestStageReceipt,
} from '../src/automation/system-test/system-test-stage-receipt';
import {
  assertSystemTestExecutionCandidateUnchanged,
  buildSystemTestExecutionCandidate,
} from '../src/automation/system-test/system-test-execution-candidate';
import {
  assertSystemTestOptimizationGate,
  assertSystemTestOptimizationPlanMetadata,
  type SystemTestOptimizationPlan,
} from '../src/governance/system-test-optimization-gate';
import { appendSystemTestRepairTelemetry } from '../src/automation/system-test/system-test-repair-telemetry';
import { resolveSystemTestConcurrency } from '../src/automation/system-test/system-test-concurrency';
import { appendAuditEvent } from '../src/audit/event-log';
import {
  assertExecutionIntentCompletion,
  assertExecutionIntentContract,
  fingerprintExecutionIntent,
  fingerprintExecutionSelection,
  type ExecutionIntent,
} from '../src/governance/execution-intent';
import { importSystemTestEvidenceLedgerReceipts } from '../src/utils/system-test-evidence-ledger-receipt';

type EvidenceLedger = {
  contractFingerprint: string;
  summary: { selected: number; executed: number; evidenceIncomplete: number };
  cases?: Array<{
    caseId?: string;
    playwrightStatus?: string;
    failureCategory?: SystemTestFailureCategory;
    runtimeEvidence?: {
      mutationObserved?: boolean;
      executionTimings?: Array<{ phase?: string; durationMs?: number }>;
    };
    evidence?: { status?: string };
  }>;
};

type RepairAttemptRegistration = { caseId: string; attemptId: string };

export type SystemTestExecutionMode = 'incremental' | 'full-regression' | 'reference';

const rootDir = path.resolve(process.env.SYSTEM_TEST_PROJECT_ROOT ?? process.cwd());
const platformRoot = path.resolve(__dirname, '..');

export async function runSystemTest(input: {
  manifestPath: string;
  runId?: string;
  caseIds?: readonly string[];
  repairDiagnosisPath?: string;
  executionIntent?: 'repair' | 'full-regression';
  fullRegressionAuthorized?: boolean;
  optimizationPlanPath?: string;
  optimizationStage?: 'canary' | 'batch';
  /**
   * Reference-system verification has no compiled execution-selection file.
   * Production systems must never use this escape hatch.
   */
  allowUnscopedSelection?: boolean;
  /** Optional project-relative audit log. Jenkins may also provide SYSTEM_TEST_AUDIT_EVENT_LOG. */
  auditEventLogPath?: string;
}): Promise<number> {
  const executionMode = resolveSystemTestExecutionMode(input);
  const runId = input.runId ?? `system-test-${Date.now()}`;
  const bootstrap = buildSystemTestArtifacts({ rootDir, manifestPath: input.manifestPath });
  const systemOutputDir = path.join(rootDir, 'output/system-test', bootstrap.manifest.system.systemId);
  const outputDir = path.join(systemOutputDir, runId);
  const telemetryPath = process.env.SYSTEM_TEST_REPAIR_TELEMETRY_PATH
    ? path.resolve(rootDir, process.env.SYSTEM_TEST_REPAIR_TELEMETRY_PATH)
    : path.join(systemOutputDir, 'repair-execution-ledger.jsonl');
  const statePath = path.join(systemOutputDir, 'latest-run-state.json');
  const previousRunState = reconcileSystemTestRunState(statePath);
  if (previousRunState?.status === 'running' && previousRunState.runId !== runId) {
    fs.mkdirSync(outputDir, { recursive: true });
    writeJson(path.join(outputDir, 'run-report.json'), {
      schemaVersion: '1.0.0', runId, systemId: bootstrap.manifest.system.systemId,
      status: 'blocked', exitCode: 2, reason: 'SYSTEM_TEST_RUN_ALREADY_ACTIVE',
      activeRunId: previousRunState.runId,
      failureCategories: ['transient-platform'],
      metrics: { totalDurationMs: 0, phaseDurationsMs: {}, setupRuns: 0, preflightRuns: 0, businessRuns: 0, selectedCaseCount: 0 },
    });
    return 2;
  }
  const startedAt = new Date().toISOString();
  let state: SystemTestRunState = {
    schemaVersion: '1.0.0', runId, systemId: bootstrap.manifest.system.systemId,
    status: 'running', phase: 'compiling', startedAt, updatedAt: startedAt,
    runnerPid: process.pid, childPid: null, exitCode: null, interruptionReason: null,
  };
  const phaseDurationsMs: Record<string, number> = {};
  let phaseStartedAtMs = Date.now();
  const updateState = (changes: Partial<SystemTestRunState>): void => {
    if (changes.phase && changes.phase !== state.phase) {
      const durationMs = Date.now() - phaseStartedAtMs;
      phaseDurationsMs[state.phase] = (phaseDurationsMs[state.phase] ?? 0) + durationMs;
      appendSystemTestRepairTelemetry({
        filePath: telemetryPath,
        eventType: 'unit-timing',
        sessionId: runId,
        applicationId: bootstrap.manifest.system.portabilityScope?.applicationId ?? bootstrap.manifest.system.systemId,
        payload: { phase: state.phase, durationMs, workerCount: bootstrap.manifest.execution.workers },
      });
      phaseStartedAtMs = Date.now();
    }
    state = { ...state, ...changes, updatedAt: new Date().toISOString() };
    writeSystemTestRunState(statePath, state);
  };
  updateState({});
  const failBeforeExecution = (error: unknown): number => {
    const detail = error instanceof Error ? error.message : String(error);
    writeJson(path.join(outputDir, 'run-report.json'), {
      schemaVersion: '1.0.0', runId, systemId: bootstrap.manifest.system.systemId,
      status: 'blocked', executionStatus: 'blocked', exitCode: 2,
      reason: 'STARTUP_VALIDATION_FAILED', detail,
      failureCategories: ['automation-gap'], metrics: { totalDurationMs: 0, phaseDurationsMs: {}, setupRuns: 0, preflightRuns: 0, businessRuns: 0, selectedCaseCount: 0 },
    });
    writeJson(path.join(outputDir, 'diagnostics.json'), { schemaVersion: '1.0.0', runId, category: 'automation-gap', phase: 'startup', conclusion: '运行启动前校验失败，未启动认证、造数或浏览器。', expected: '选择集、计划和合同校验通过', actual: detail });
    updateState({ status: 'blocked', phase: 'completed', exitCode: 2, childPid: null });
    return 2;
  };
  const selectionPath = path.join(path.dirname(path.resolve(rootDir, input.manifestPath)), 'execution-selection.json');
  const persistedSelection = readJson<{ selectedCaseIds?: unknown }>(selectionPath);
  const persistedCaseIds = Array.isArray(persistedSelection?.selectedCaseIds)
    ? persistedSelection.selectedCaseIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
  let selection: ReturnType<typeof resolveSystemTestCaseSelection>;
  try {
    selection = resolveSystemTestCaseSelection({
      explicitCaseIds: input.caseIds ?? [],
      persistedCaseIds,
      contractCaseIds: bootstrap.contract.cases.map((item) => item.caseId),
      allowUnscopedSelection: input.allowUnscopedSelection
        || Boolean(input.optimizationPlanPath && input.optimizationStage),
      fullRegressionAuthorized: input.fullRegressionAuthorized,
      selectionFileExists: fs.existsSync(selectionPath),
    });
  } catch (error) {
    return failBeforeExecution(error);
  }
  const selectedCaseIds = selection.selectedCaseIds;
  if (selection.noOp) {
    const noOpRunId = input.runId ?? `system-test-${Date.now()}`;
    const noOpOutputDir = path.join(systemOutputDir, noOpRunId);
    fs.mkdirSync(noOpOutputDir, { recursive: true });
    writeJson(path.join(noOpOutputDir, 'run-report.json'), {
      schemaVersion: '1.0.0',
      runId: noOpRunId,
      systemId: bootstrap.manifest.system.systemId,
      status: 'not-run',
      exitCode: 0,
      reason: 'execution-selection-empty',
      selectionPath: path.relative(rootDir, selectionPath).replaceAll(path.sep, '/'),
      selectedCaseIds: [],
      metrics: {
        totalDurationMs: 0,
        phaseDurationsMs: {},
        setupRuns: 0,
        preflightRuns: 0,
        businessRuns: 0,
        selectedCaseCount: 0,
      },
    });
    return 0;
  }
  let artifacts: ReturnType<typeof buildSystemTestArtifacts>;
  try {
    artifacts = buildSystemTestArtifacts({
      rootDir,
      manifestPath: input.manifestPath,
      outputDir,
      caseIds: selectedCaseIds,
      availableExternalCapabilities: (process.env.SYSTEM_TEST_EXTERNAL_CAPABILITIES ?? '').split(',').filter(Boolean),
    });
  } catch (error) {
    return failBeforeExecution(error);
  }
  const caseImplementationFingerprints = buildSystemTestCaseImplementationFingerprints(artifacts, __filename);
  const implementationFingerprint = fingerprintSystemTestValue(caseImplementationFingerprints);
  let optimizationPlan: SystemTestOptimizationPlan | undefined;
  let executionIntentArtifact: ExecutionIntent | undefined;
  let executionIntentPath: string | undefined;
  let executionIntentCheckpointPath: string | undefined;
  if (executionMode === 'incremental') {
    try {
      optimizationPlan = readJson<SystemTestOptimizationPlan>(path.resolve(rootDir, input.optimizationPlanPath!));
      if (!optimizationPlan) throw new Error(`OPTIMIZATION_PLAN_NOT_FOUND:${input.optimizationPlanPath}`);
      assertSystemTestOptimizationPlanMetadata(optimizationPlan);
      assertSystemTestOptimizationGate({
        plan: optimizationPlan,
        requestedCaseIds: selectedCaseIds,
        stage: input.optimizationStage!,
        currentCases: artifacts.contract.cases.map((item) => ({
          caseId: item.caseId,
          caseFingerprint: fingerprintSystemTestValue(item),
          implementationFingerprint: caseImplementationFingerprints[item.caseId] ?? implementationFingerprint,
        })),
      });
      executionIntentArtifact = buildRunnerExecutionIntent({
        runId,
        plan: optimizationPlan,
        selectedCaseIds,
        stage: input.optimizationStage!,
        contractCases: bootstrap.contract.cases,
        recipes: bootstrap.recipes.recipes,
      });
      assertExecutionIntentContract({ intent: executionIntentArtifact });
      executionIntentPath = path.join(outputDir, 'execution-intent.json');
      executionIntentCheckpointPath = path.join(outputDir, 'execution-intent-checkpoint.json');
      writeJson(executionIntentPath, {
        ...executionIntentArtifact,
        intentFingerprint: fingerprintExecutionIntent(executionIntentArtifact),
        selectedFingerprint: fingerprintExecutionSelection(executionIntentArtifact.selectedCaseIds),
      });
      writeExecutionIntentCheckpoint(executionIntentCheckpointPath, executionIntentArtifact, []);
    } catch (error) {
      return failBeforeExecution(error);
    }
    appendSystemTestRepairTelemetry({
      filePath: telemetryPath,
      eventType: 'repair-session',
      sessionId: runId,
      applicationId: artifacts.manifest.system.portabilityScope?.applicationId ?? artifacts.manifest.system.systemId,
      payload: {
        mode: executionMode,
        stage: input.optimizationStage,
        planId: optimizationPlan!.planId,
        planFingerprint: optimizationPlan!.fingerprint,
        selectedCaseIds,
        reusableCaseIds: optimizationPlan!.reusableCaseIds ?? [],
        decisionCounts: Object.values(optimizationPlan!.caseDecisions ?? {}).reduce<Record<string, number>>((counts, decision: any) => {
          counts[decision.decision] = (counts[decision.decision] ?? 0) + 1;
          return counts;
        }, {}),
      },
    });
  }
  const reportPath = path.join(outputDir, 'run-report.json');
  const requiresMutation = artifacts.contract.cases.some((item) => item.mutationMode === 'reversible');
  const ready = artifacts.errors.length === 0
    && (requiresMutation ? artifacts.onboarding.mutationReady : artifacts.onboarding.readOnlyReady);
  if (!ready) {
    writeJson(reportPath, {
      schemaVersion: '1.0.0', runId, systemId: artifacts.manifest.system.systemId,
      status: 'blocked', exitCode: 2, onboarding: artifacts.onboarding,
      failureCategories: classifySystemTestContractBlockers(artifacts.onboarding.blockers),
    });
    updateState({ status: 'blocked', phase: 'completed', exitCode: 2, childPid: null });
    return 2;
  }
  const applicationId = artifacts.manifest.system.portabilityScope?.applicationId ?? artifacts.manifest.system.systemId;
  const auditEventLogPath = input.auditEventLogPath ?? process.env.SYSTEM_TEST_AUDIT_EVENT_LOG;
  const resolvedAuditEventLogPath = auditEventLogPath ? path.resolve(rootDir, auditEventLogPath) : undefined;
  const auditIdentity = {
    applicationId,
    businessDomainId: artifacts.manifest.system.portabilityScope?.businessDomainId ?? artifacts.manifest.system.systemId,
    planId: artifacts.manifest.system.systemId,
    runId,
    traceId: runId,
  };
  if (resolvedAuditEventLogPath) appendAuditEvent(resolvedAuditEventLogPath, {
    eventId: `${runId}:run.started`, eventType: 'run.started', actorType: 'runner', ...auditIdentity,
    outcome: 'success', details: { selectedCaseIds, executionIntent: input.executionIntent ?? 'repair' },
  });
  const repairLedgerPath = path.join(systemOutputDir, 'repair-attempt-ledger.json');
  const repairAttemptReconciliation = reconcileOrphanedSystemTestRepairAttempts({
    ledgerPath: repairLedgerPath,
    // A live run is rejected above. Therefore every remaining running attempt
    // is an orphan from a terminated or force-interrupted process.
  });
  const diagnosis = input.repairDiagnosisPath
    ? readSystemTestRepairDiagnosis(input.repairDiagnosisPath, { applicationId, caseIds: selectedCaseIds })
    : undefined;
  const diagnosisFingerprint = diagnosis?.fingerprint;
  const repairAttempts: RepairAttemptRegistration[] = [];
  const blockedCaseIds: string[] = [];
  const repairGuardDecisions: Array<{ caseId: string; code?: string; detail?: string }> = [];
  const caseImplementationFingerprintPath = path.join(outputDir, 'case-implementation-fingerprints.json');
  writeJson(caseImplementationFingerprintPath, caseImplementationFingerprints);
  const profileResolution = resolveSystemTestExecutionContextProfile(artifacts.contract.cases);
  if (!profileResolution.ok) {
    writeJson(reportPath, {
      schemaVersion: '1.0.0', runId, systemId: artifacts.manifest.system.systemId,
      status: 'blocked', exitCode: 2,
      reason: 'MIXED_EXECUTION_CONTEXT_PROFILES',
      executionContextProfiles: profileResolution.profiles,
      selectedCaseIds,
      failureCategories: ['automation-gap'],
      metrics: { setupRuns: 0, preflightRuns: 0, businessRuns: 0, selectedCaseCount: selectedCaseIds.length },
    });
    updateState({ status: 'blocked', phase: 'completed', exitCode: 2, childPid: null });
    return 2;
  }
  const executionContextProfile = profileResolution.profile;
  const authImplementationFingerprint = fingerprintSelectedAdapterImplementations(
    artifacts,
    [artifacts.manifest.execution.authAdapterId],
  );
  const contextFingerprint = fingerprintSystemTestValue({
    executionContext: artifacts.contract.sourceFingerprints.executionContext,
    authAdapterId: artifacts.manifest.execution.authAdapterId,
    executionContextProfile,
  });
  const executionCandidate = buildSystemTestExecutionCandidate({
    applicationId,
    runId,
    selectedCaseIds,
    caseFingerprints: Object.fromEntries(artifacts.contract.cases.map((item) => [
      item.caseId,
      fingerprintSystemTestValue(item),
    ])),
    implementationFingerprints: caseImplementationFingerprints,
    contextFingerprint,
  });
  const executionCandidatePath = path.join(outputDir, 'execution-candidate.json');
  writeJson(executionCandidatePath, executionCandidate);
  const setupReceiptPath = path.join(systemOutputDir, 'stage-receipts', `setup-${safeKey(executionContextProfile)}.json`);
  const stageFingerprint = fingerprintSystemTestValue({
    authAdapter: artifacts.manifest.execution.authAdapterId,
    authImplementationFingerprint,
    contextFingerprint,
  });
  // The persisted execution-selection file is an authoritative selection too.
  // Guard only selected cases, otherwise an unrelated deterministic failure
  // could block setup/preflight for this run before any selected case executes.
  const selectedCaseSet = new Set(selectedCaseIds);
  if (input.executionIntent !== 'full-regression' && selectedCaseIds.length) for (const item of artifacts.contract.cases) {
    if (!selectedCaseSet.has(item.caseId)) continue;
    const decision = beginSystemTestRepairAttempt({
      ledgerPath: repairLedgerPath,
      applicationId,
      caseId: item.caseId,
      caseFingerprint: fingerprintSystemTestValue(item),
      implementationFingerprint: caseImplementationFingerprints[item.caseId] ?? implementationFingerprint,
      runId,
      diagnosisFingerprint,
      invalidatedAttemptIds: diagnosis?.supersedesAttemptIds,
      invalidationReason: diagnosis?.rootCause,
    });
    if (!decision.allowed || !decision.attempt) {
      blockedCaseIds.push(item.caseId);
      repairGuardDecisions.push({ caseId: item.caseId, code: decision.code, detail: decision.detail });
      continue;
    }
    repairAttempts.push({ caseId: item.caseId, attemptId: decision.attempt.attemptId });
  }
  const executableCaseIds = selectedCaseIds.filter((caseId) => !blockedCaseIds.includes(caseId));
  if (executableCaseIds.length === 0) {
    completeRepairRegistrations(repairLedgerPath, repairAttempts, 'interrupted');
    writeJson(reportPath, {
      schemaVersion: '1.0.0', runId, systemId: artifacts.manifest.system.systemId,
      status: 'blocked', exitCode: 2, selectedCaseIds, executableCaseIds, blockedCaseIds,
      repairGuardDecisions, failureCategories: ['automation-gap'],
    });
    writeJson(path.join(outputDir, 'diagnostics.json'), buildSystemTestFailureDiagnosticDocument({
      outputDir,
      systemId: artifacts.manifest.system.systemId,
      runId,
      contractFingerprint: artifacts.contract.fingerprint,
      implementationFingerprint,
    }));
    updateState({ status: 'blocked', phase: 'completed', exitCode: 2, childPid: null });
    return 2;
  }
  const progressLatest = path.join(outputDir, 'progress.json');
  const progressHistory = path.join(outputDir, 'progress.jsonl');
  const evidencePath = path.join(outputDir, 'evidence-ledger.json');
  const configPath = path.resolve(rootDir, artifacts.manifest.execution.playwrightConfigPath);
  const concurrency = resolveSystemTestConcurrency({
    configuredMaxWorkers: artifacts.manifest.execution.workers,
    requestedWorkers: Number(process.env.SYSTEM_TEST_WORKERS || artifacts.manifest.execution.workers),
    selectedCaseCount: executableCaseIds.length,
  });
  const executionGrant = issueSystemTestExecutionGrant({
    rootDir,
    applicationId,
    runId,
    caseIds: executableCaseIds,
    ttlMs: artifacts.manifest.policies.maxRunMs + 10 * 60 * 1000,
    candidateFingerprint: executionCandidate.fingerprint,
  });
  if (resolvedAuditEventLogPath) appendAuditEvent(resolvedAuditEventLogPath, {
    eventId: `${runId}:run.authorized`, eventType: 'run.authorized', actorType: 'system', ...auditIdentity,
    outcome: 'success', effectiveSuccess: true,
    details: { selectedCaseIds: executableCaseIds, blockedCaseIds, candidateFingerprint: executionCandidate.fingerprint, grantSource: 'ephemeral-runner-grant' },
  });
  try {
  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...executionGrant.env,
    SYSTEM_TEST_RUN_ID: runId,
    SYSTEM_TEST_CONTRACT: artifacts.contractPath,
    SYSTEM_TEST_PROGRESS_LATEST: progressLatest,
    SYSTEM_TEST_PROGRESS_HISTORY: progressHistory,
    SYSTEM_TEST_EVIDENCE_OUTPUT: evidencePath,
    SYSTEM_TEST_BASE_URL: artifacts.manifest.system.baseURL,
    SYSTEM_TEST_MARKER_PREFIX: artifacts.manifest.system.markerPrefix,
    SYSTEM_TEST_CASE_IDS: executableCaseIds.join(','),
    SYSTEM_TEST_CHECKPOINT_ROOT: path.join(systemOutputDir, 'checkpoints'),
    SYSTEM_TEST_PLATFORM_ROOT: platformRoot,
    SYSTEM_TEST_IMPLEMENTATION_FINGERPRINT: implementationFingerprint,
    SYSTEM_TEST_CASE_IMPLEMENTATION_FINGERPRINTS: caseImplementationFingerprintPath,
    SYSTEM_TEST_CONTEXT_FINGERPRINT: contextFingerprint,
    SYSTEM_TEST_EXECUTION_CANDIDATE: executionCandidatePath,
    SYSTEM_TEST_EXECUTION_CONTEXT_PROFILE: executionContextProfile,
    SYSTEM_TEST_PLAYWRIGHT_OUTPUT_DIR: path.join(outputDir, 'playwright-business'),
    ALLURE_RESULTS_DIR: path.join(outputDir, 'allure-results'),
    SYSTEM_TEST_EFFECTIVE_WORKERS: String(concurrency.effectiveWorkers),
    SYSTEM_TEST_CONCURRENCY_DECISION: JSON.stringify(concurrency),
    ...(auditEventLogPath ? {
      SYSTEM_TEST_AUDIT_EVENT_LOG: path.resolve(rootDir, auditEventLogPath),
      SYSTEM_TEST_APPLICATION_ID: applicationId,
      SYSTEM_TEST_BUSINESS_DOMAIN_ID: artifacts.manifest.system.portabilityScope?.businessDomainId ?? artifacts.manifest.system.systemId,
      SYSTEM_TEST_PLAN_ID: artifacts.manifest.system.systemId,
      SYSTEM_TEST_SYSTEM_ID: artifacts.manifest.system.systemId,
    } : {}),
  };
  const observeChild = (childPid: number | null): void => updateState({ childPid });
  updateState({ phase: 'setup' });
  const setupDecision = evaluateSystemTestStageReceipt({
    receipt: readSystemTestStageReceipt(setupReceiptPath),
    expected: {
      stage: 'setup', fingerprint: stageFingerprint, contextFingerprint,
      implementationFingerprint: authImplementationFingerprint,
    },
  });
  const setupReusable = setupDecision.reusable;
  const setupEnv = {
    ...baseEnv,
    SYSTEM_TEST_STAGE: 'setup',
    SYSTEM_TEST_STAGE_RECEIPT: setupReceiptPath,
    SYSTEM_TEST_STAGE_FINGERPRINT: stageFingerprint,
    SYSTEM_TEST_STAGE_IMPLEMENTATION_FINGERPRINT: authImplementationFingerprint,
    SYSTEM_TEST_PLAYWRIGHT_OUTPUT_DIR: path.join(outputDir, 'playwright-setup'),
  };
  const setupExit = setupReusable
    ? 0
    : await executePlaywrightWithRetry(
      configPath, artifacts.manifest.execution.setupSpecPath, artifacts.manifest.execution.setupProject,
      setupEnv, artifacts.manifest.policies.maxRunMs, observeChild, 1,
    );
  const setupReuseReason = setupDecision.reason;
  if (setupExit !== 0) {
    completeRepairRegistrations(repairLedgerPath, repairAttempts, 'interrupted', 'environment-failure');
    const exitCode = finish(reportPath, runId, artifacts.manifest.system.systemId, 'blocked', setupExit, artifacts.onboarding, ['environment-failure'], {
      phaseDurationsMs: currentPhaseDurations(phaseDurationsMs, state.phase, phaseStartedAtMs),
      setupRuns: setupReusable ? 0 : 1, preflightRuns: 0, businessRuns: 0,
      selectedCaseCount: executableCaseIds.length, skippedStage: 'setup', reuseReason: setupReuseReason,
      retryLimit: 1,
    });
    writeJson(path.join(outputDir, 'diagnostics.json'), buildSystemTestFailureDiagnosticDocument({
      outputDir, systemId: artifacts.manifest.system.systemId, runId,
      contractFingerprint: artifacts.contract.fingerprint, implementationFingerprint,
    }));
    updateState({ status: 'blocked', phase: 'completed', exitCode, childPid: null });
    return exitCode;
  }
  updateState({ phase: 'preflight' });
  const routes = resolveSelectedRoutes(artifacts, executableCaseIds);
  let preflightExit = 0;
  let preflightRuns = 0;
  let preflightReused = 0;
  for (const route of routes) {
    const routeKey = safeKey(route);
    const receiptPath = path.join(
      systemOutputDir,
      'stage-receipts',
      `preflight-${safeKey(executionContextProfile)}-${routeKey}.json`,
    );
    const routeCaseIds = artifacts.recipes.recipes
      .filter((recipe) => executableCaseIds.includes(recipe.caseId) && recipe.route === route)
      .map((recipe) => recipe.caseId);
    const routeAdapterIds = artifacts.contract.cases
      .filter((item) => routeCaseIds.includes(item.caseId))
      .flatMap((item) => item.probeAdapterIds);
    const preflightImplementationFingerprint = fingerprintSystemTestValue({
      spec: sha256File(path.resolve(rootDir, artifacts.manifest.execution.preflightSpecPath)),
      adapters: fingerprintSelectedAdapterImplementations(artifacts, routeAdapterIds),
    });
    const routeFingerprint = fingerprintSystemTestValue({ contextFingerprint, route, preflightImplementationFingerprint });
    const decision = evaluateSystemTestStageReceipt({
      receipt: readSystemTestStageReceipt(receiptPath),
      expected: {
        stage: 'preflight', fingerprint: routeFingerprint, route, contextFingerprint,
        implementationFingerprint: preflightImplementationFingerprint,
      },
    });
    const reusable = decision.reusable;
    if (reusable) { preflightReused += 1; continue; }
    preflightRuns += 1;
    const routeEnv = {
      ...baseEnv,
      SYSTEM_TEST_PREFLIGHT_ROUTE: route,
      SYSTEM_TEST_STAGE: 'preflight',
      SYSTEM_TEST_STAGE_ROUTE: route,
      SYSTEM_TEST_STAGE_RECEIPT: receiptPath,
      SYSTEM_TEST_STAGE_FINGERPRINT: routeFingerprint,
      SYSTEM_TEST_STAGE_IMPLEMENTATION_FINGERPRINT: preflightImplementationFingerprint,
      SYSTEM_TEST_PLAYWRIGHT_OUTPUT_DIR: path.join(outputDir, `playwright-preflight-${routeKey}`),
    };
    preflightExit = await executePlaywrightWithRetry(
      configPath, artifacts.manifest.execution.preflightSpecPath, artifacts.manifest.execution.project,
      routeEnv, artifacts.manifest.policies.maxRunMs, observeChild, 1,
    );
    if (preflightExit !== 0) break;
  }
  if (preflightExit !== 0) {
    completeRepairRegistrations(repairLedgerPath, repairAttempts, 'interrupted', 'environment-failure');
    const exitCode = finish(reportPath, runId, artifacts.manifest.system.systemId, 'blocked', preflightExit, artifacts.onboarding, ['environment-failure'], {
      phaseDurationsMs: currentPhaseDurations(phaseDurationsMs, state.phase, phaseStartedAtMs),
      setupRuns: setupReusable ? 0 : 1, preflightRuns, businessRuns: 0,
      selectedCaseCount: executableCaseIds.length, skippedStage: 'preflight',
      reuseReason: `${setupReuseReason};preflight-reused=${preflightReused}`, retryLimit: 1,
    });
    writeJson(path.join(outputDir, 'diagnostics.json'), buildSystemTestFailureDiagnosticDocument({
      outputDir, systemId: artifacts.manifest.system.systemId, runId,
      contractFingerprint: artifacts.contract.fingerprint, implementationFingerprint,
    }));
    updateState({ status: 'blocked', phase: 'completed', exitCode, childPid: null });
    return exitCode;
  }
  const candidateRecheck = buildSystemTestArtifacts({
    rootDir,
    manifestPath: input.manifestPath,
    outputDir: path.join(outputDir, 'candidate-recheck'),
    caseIds: selectedCaseIds,
    availableExternalCapabilities: (process.env.SYSTEM_TEST_EXTERNAL_CAPABILITIES ?? '').split(',').filter(Boolean),
  });
  try {
    if (candidateRecheck.errors.length > 0) throw new Error(candidateRecheck.errors.join(';'));
    assertSystemTestExecutionCandidateUnchanged(executionCandidate, buildSystemTestExecutionCandidate({
      applicationId,
      runId,
      selectedCaseIds,
      caseFingerprints: Object.fromEntries(candidateRecheck.contract.cases.map((item) => [
        item.caseId,
        fingerprintSystemTestValue(item),
      ])),
      implementationFingerprints: buildSystemTestCaseImplementationFingerprints(candidateRecheck, __filename),
      contextFingerprint,
    }));
  } catch (error) {
    completeRepairRegistrations(repairLedgerPath, repairAttempts, 'interrupted', 'automation-gap');
    const exitCode = finish(reportPath, runId, artifacts.manifest.system.systemId, 'blocked', 2, artifacts.onboarding, ['automation-gap'], {
      phaseDurationsMs: currentPhaseDurations(phaseDurationsMs, state.phase, phaseStartedAtMs),
      setupRuns: setupReusable ? 0 : 1, preflightRuns, businessRuns: 0,
      selectedCaseCount: executableCaseIds.length, skippedStage: 'business',
      reuseReason: `${setupReuseReason};preflight-reused=${preflightReused}`,
      failureCategory: 'execution-candidate-drift',
      detail: error instanceof Error ? error.message : String(error),
    });
    updateState({ status: 'blocked', phase: 'completed', exitCode, childPid: null });
    return exitCode;
  }
  updateState({ phase: 'business' });
  const execution = await executeBusiness({
    configPath,
    specPath: artifacts.manifest.execution.specPath,
    project: artifacts.manifest.execution.project,
    workers: concurrency.effectiveWorkers,
    env: baseEnv,
    progressHistory,
    policy: artifacts.manifest.policies,
    caseIds: executableCaseIds,
    onChild: observeChild,
  });
  let recoveryExitCode: number | null = null;
  if ((execution.exitCode !== 0 || execution.circuit) && artifacts.manifest.execution.recoverySpecPath) {
    updateState({ phase: 'recovery', childPid: null });
    recoveryExitCode = await executePlaywrightWithRetry(
      configPath,
      artifacts.manifest.execution.recoverySpecPath,
      artifacts.manifest.execution.recoveryProject ?? artifacts.manifest.execution.project,
      { ...baseEnv, SYSTEM_TEST_PLAYWRIGHT_OUTPUT_DIR: path.join(outputDir, 'playwright-recovery') },
      artifacts.manifest.policies.maxRunMs,
      observeChild,
      1,
    );
  }
  const ledger = fs.existsSync(evidencePath) ? readJson<EvidenceLedger>(evidencePath) : undefined;
  const terminalCaseIds = [...new Set((ledger?.cases ?? [])
    .map((item) => item.caseId)
    .filter((caseId): caseId is string => typeof caseId === 'string' && caseId.length > 0))].sort();
  if (executionIntentArtifact && executionIntentCheckpointPath) {
    writeExecutionIntentCheckpoint(executionIntentCheckpointPath, executionIntentArtifact, terminalCaseIds);
    assertExecutionIntentCompletion({
      intent: executionIntentArtifact,
      status: terminalCaseIds.length === executionIntentArtifact.selectedCaseIds.length
        ? execution.exitCode === 0 ? 'completed' : 'completed-with-findings'
        : 'blocked',
      terminalCaseIds,
    });
  }
  const diagnosticsPath = path.join(outputDir, 'diagnostics.json');
  const diagnosticWorkQueuePath = path.join(outputDir, 'repair-work-queue.json');
  const diagnostics = buildSystemTestFailureDiagnosticDocument({
    outputDir,
    systemId: artifacts.manifest.system.systemId,
    runId,
    contractFingerprint: artifacts.contract.fingerprint,
    implementationFingerprint,
    evidence: ledger,
  });
  writeJson(diagnosticsPath, diagnostics);
  writeJson(diagnosticWorkQueuePath, buildSystemTestDiagnosticWorkQueue(diagnostics));
  const diagnosticFingerprint = fingerprintSystemTestFailureDiagnostic(diagnostics);
  const evidenceValid = ledger?.contractFingerprint === artifacts.contract.fingerprint
    && ledger.summary.selected === artifacts.contract.cases.length
    && ledger.summary.executed === artifacts.contract.cases.length
    && ledger.summary.evidenceIncomplete === 0;
  const receiptImport = ledger
    ? importSystemTestEvidenceLedgerReceipts({
      ledgerPath: evidencePath,
      contractPath: artifacts.contractPath,
      executionIndexPath: path.join(rootDir, 'deliverables/system-test-platform/execution-index.json'),
      workspaceRoot: path.resolve(rootDir, '..'),
      runId,
      expectedSystemId: artifacts.manifest.system.systemId,
      expectedCaseIds: executableCaseIds,
      allowPartial: true,
    })
    : { records: [], diagnostics: ['EVIDENCE_LEDGER_MISSING'], indexChanged: false };
  const receiptImportValid = receiptImport.records.length === artifacts.contract.cases.length
    && receiptImport.diagnostics.length === 0;
  const securityFindings = scanSystemTestArtifacts(outputDir);
  const exitCode = execution.circuit
    ? 124
    : execution.exitCode === 0 && evidenceValid && receiptImportValid && securityFindings.length === 0
      ? 0 : execution.exitCode || 3;
  const failureCategories = exitCode === 0 ? [] : uniqueSystemTestFailureCategories([
    ...(ledger?.cases ?? []).map((item) => item.failureCategory),
    execution.circuit ? classifySystemTestCircuit(execution.circuit.code) : undefined,
    !evidenceValid || securityFindings.length > 0 ? 'automation-gap' : undefined,
  ]);
  for (const registration of repairAttempts) {
    const item = ledger?.cases?.find((candidate) => candidate.caseId === registration.caseId);
    completeSystemTestRepairAttempt({
      ledgerPath: repairLedgerPath,
      attemptId: registration.attemptId,
      status: exitCode === 0 || (item?.playwrightStatus === 'passed' && item.evidence?.status === 'complete')
        ? 'passed'
        : item
          ? 'failed'
          : 'interrupted',
      ...(item?.failureCategory ? { failureCategory: item.failureCategory } : exitCode === 0 ? {} : { failureCategory: 'automation-gap' }),
      ...(exitCode === 0 ? {} : { diagnosticFingerprint }),
    });
  }
  updateState({ phase: 'reporting', childPid: null });
  const finalStatus = exitCode === 0
    ? 'passed'
    : execution.circuit
      ? 'circuit-broken'
      : terminalCaseIds.length < executableCaseIds.length
        ? 'blocked'
        : 'failed';
  phaseDurationsMs[state.phase] = (phaseDurationsMs[state.phase] ?? 0) + (Date.now() - phaseStartedAtMs);
  writeJson(reportPath, {
    schemaVersion: '1.0.0', runId, systemId: artifacts.manifest.system.systemId,
    status: finalStatus,
    exitCode,
    contractFingerprint: artifacts.contract.fingerprint,
    onboarding: artifacts.onboarding,
    circuit: execution.circuit,
    recoveryExitCode,
    stageReuse: { setup: { reused: setupReusable, reason: setupReuseReason }, preflight: { runs: preflightRuns, reused: preflightReused, routes } },
    failureCategories,
    securityFindings: securityFindings.length,
    metrics: {
      totalDurationMs: Date.now() - Date.parse(startedAt),
      phaseDurationsMs,
      setupRuns: setupReusable ? 0 : 1,
      preflightRuns,
      businessRuns: 1,
      selectedCaseCount: executableCaseIds.length,
      averageCaseDurationMs: executableCaseIds.length > 0
        ? Math.round((Date.now() - Date.parse(startedAt)) / executableCaseIds.length)
        : 0,
      recipePhaseDurationsMs: aggregateRecipePhaseDurations(ledger),
      workers: concurrency.effectiveWorkers,
    },
    concurrency,
    selectedCaseIds,
    executableCaseIds,
    blockedCaseIds,
    repairGuardDecisions,
    executionCandidate: path.relative(rootDir, executionCandidatePath).replaceAll(path.sep, '/'),
    evidenceLedger: path.relative(rootDir, evidencePath).replaceAll(path.sep, '/'),
    diagnostics: path.relative(rootDir, diagnosticsPath).replaceAll(path.sep, '/'),
    repairWorkQueue: path.relative(rootDir, diagnosticWorkQueuePath).replaceAll(path.sep, '/'),
    repairAttemptReconciliation,
    receiptImport: {
      executionIndex: path.relative(rootDir, path.join(rootDir, 'deliverables/system-test-platform/execution-index.json')).replaceAll(path.sep, '/'),
      records: receiptImport.records.length,
      diagnostics: receiptImport.diagnostics,
      indexChanged: receiptImport.indexChanged,
    },
    ...(executionIntentPath && executionIntentCheckpointPath ? {
      executionIntent: path.relative(rootDir, executionIntentPath).replaceAll(path.sep, '/'),
      executionIntentCheckpoint: path.relative(rootDir, executionIntentCheckpointPath).replaceAll(path.sep, '/'),
    } : {}),
  });
  updateState({ status: finalStatus, phase: 'completed', exitCode, childPid: null });
  process.stdout.write(`跨系统测试运行报告：${reportPath}\n`);
  if (resolvedAuditEventLogPath) appendAuditEvent(resolvedAuditEventLogPath, {
    eventId: `${runId}:run.completed`, eventType: 'run.completed', actorType: 'runner', ...auditIdentity,
    outcome: exitCode === 0 ? 'success' : 'failed', effectiveSuccess: exitCode === 0,
    details: { exitCode, status: finalStatus, selectedCaseIds: executableCaseIds, blockedCaseIds, evidenceValid, failureCategories },
  });
  return exitCode;
  } finally {
    revokeSystemTestExecutionGrant(executionGrant);
  }
}

export function buildRunnerExecutionIntent(input: {
  runId: string;
  plan: SystemTestOptimizationPlan;
  selectedCaseIds: readonly string[];
  stage: 'canary' | 'batch';
  contractCases: ReadonlyArray<{ caseId: string; executionContextProfile?: string }>;
  recipes: ReadonlyArray<{ caseId: string; route: string }>;
}): ExecutionIntent {
  const plannedCaseIds = [...input.plan.executionCaseIds];
  const planned = new Set(plannedCaseIds);
  const caseById = new Map(input.contractCases.map((item) => [item.caseId, item]));
  const unknown = plannedCaseIds.filter((caseId) => !caseById.has(caseId));
  if (unknown.length > 0) throw new Error(`EXECUTION_INTENT_PLAN_CASE_UNKNOWN:${unknown.sort().join(',')}`);
  const partitionCaseIds: Record<string, string[]> = {};
  for (const caseId of plannedCaseIds) {
    const key = caseById.get(caseId)?.executionContextProfile ?? 'default';
    (partitionCaseIds[key] ??= []).push(caseId);
  }
  const selected = new Set(input.selectedCaseIds);
  const canaryPartitionKeys = Object.entries(partitionCaseIds)
    .filter(([, caseIds]) => caseIds.some((caseId) => selected.has(caseId)))
    .map(([partition]) => partition)
    .sort();
  const routes: Record<string, string[]> = {};
  for (const recipe of input.recipes) {
    if (!selected.has(recipe.caseId)) continue;
    const key = recipe.route.trim();
    if (!key) throw new Error(`EXECUTION_INTENT_ROUTE_REQUIRED:${recipe.caseId}`);
    (routes[key] ??= []).push(recipe.caseId);
  }
  return {
    intentId: input.runId,
    mode: 'incremental',
    stage: input.stage,
    scopeId: input.plan.planId,
    scopeFingerprint: input.plan.scopeFingerprint ?? input.plan.contractFingerprint,
    plannedCaseIds,
    classifiedExclusionCaseIds: [...(input.plan.excludedCaseIds ?? [])],
    partitionCaseIds,
    ...(input.stage === 'canary' ? { canaryPartitionKeys } : {}),
    selectedCaseIds: [...input.selectedCaseIds],
    routes,
  };
}

function writeExecutionIntentCheckpoint(
  filePath: string,
  intent: ExecutionIntent,
  terminalCaseIds: readonly string[],
): void {
  const terminal = new Set(terminalCaseIds);
  writeJson(filePath, {
    schemaVersion: '1.0.0',
    intentFingerprint: fingerprintExecutionIntent(intent),
    selectedFingerprint: fingerprintExecutionSelection(intent.selectedCaseIds),
    selectedCaseIds: [...intent.selectedCaseIds].sort(),
    terminalCaseIds: [...terminal].sort(),
    incompleteCaseIds: intent.selectedCaseIds.filter((caseId) => !terminal.has(caseId)).sort(),
  });
}

function completeRepairRegistrations(
  ledgerPath: string,
  registrations: readonly RepairAttemptRegistration[],
  status: 'passed' | 'failed' | 'interrupted',
  failureCategory?: SystemTestFailureCategory,
): void {
  for (const registration of registrations) {
    completeSystemTestRepairAttempt({
      ledgerPath,
      attemptId: registration.attemptId,
      status,
      ...(failureCategory ? { failureCategory } : {}),
    });
  }
}

function executePlaywrightWithRetry(
  configPath: string,
  specPath: string,
  project: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  onChild: (pid: number | null) => void,
  maxRetries: number,
): Promise<number> {
  const run = async (attempt: number): Promise<number> => {
    const exitCode = await executePlaywrightOnce(configPath, specPath, project, env, timeoutMs, onChild);
    if (!shouldRetrySystemTestStageProcess(exitCode, attempt, maxRetries)) return exitCode;
    // Only the runner watchdog is certainly transient here. Page/API adapters
    // own their more precise transient classification and bounded backoff.
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    return run(attempt + 1);
  };
  return run(0);
}

function executePlaywrightOnce(
  configPath: string,
  specPath: string,
  project: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  onChild: (pid: number | null) => void,
): Promise<number> {
  const child = spawn(process.execPath, [
    require.resolve('@playwright/test/cli', { paths: [rootDir] }), 'test', specPath,
    `--config=${configPath}`, `--project=${project}`, '--workers=1', '--reporter=line',
  ], { cwd: rootDir, env, stdio: 'inherit', shell: false, windowsHide: true });
  onChild(child.pid ?? null);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      terminate(child);
      onChild(null);
      resolve(124);
    }, timeoutMs);
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      onChild(null);
      reject(error);
    });
    child.once('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      onChild(null);
      resolve(code ?? 1);
    });
  });
}

function executeBusiness(input: {
  configPath: string;
  specPath: string;
  project: string;
  workers: number;
  env: NodeJS.ProcessEnv;
  progressHistory: string;
  policy: ReturnType<typeof buildSystemTestArtifacts>['manifest']['policies'];
  caseIds: readonly string[];
  onChild: (pid: number | null) => void;
}): Promise<{ exitCode: number; circuit?: { code?: string; detail?: string } }> {
  const startedAtMs = Date.now();
  const reporterPath = path.join(platformRoot, 'src/reporters/system-test-evidence.reporter.ts');
  const reporterArgument = resolveSystemTestBusinessReporterArgument(input.env, reporterPath);
  const child = spawn(process.execPath, [
    require.resolve('@playwright/test/cli', { paths: [rootDir] }), 'test', input.specPath,
    `--config=${input.configPath}`, `--project=${input.project}`, `--workers=${input.workers}`,
    `--grep=${buildSystemTestCaseGrep(input.caseIds)}`,
    `--reporter=${reporterArgument}`,
  ], { cwd: rootDir, env: input.env, stdio: 'inherit', shell: false, windowsHide: true });
  input.onChild(child.pid ?? null);
  return new Promise((resolve, reject) => {
    let circuit: { code?: string; detail?: string } | undefined;
    const timer = setInterval(() => {
      const decision = evaluateSystemTestCircuit({
        events: readSystemTestProgress(input.progressHistory),
        policy: input.policy,
        startedAtMs,
      });
      if (!decision.trip || circuit) return;
      circuit = { code: decision.code, detail: decision.detail };
      terminate(child);
    }, Math.min(2_000, input.policy.stallMs));
    child.once('error', (error) => { clearInterval(timer); input.onChild(null); reject(error); });
    child.once('exit', (code) => {
      clearInterval(timer);
      input.onChild(null);
      resolve({ exitCode: circuit ? 124 : code ?? 1, ...(circuit ? { circuit } : {}) });
    });
  });
}

function terminate(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  } else child.kill('SIGTERM');
}

function finish(
  reportPath: string,
  runId: string,
  systemId: string,
  status: string,
  exitCode: number,
  onboarding: unknown,
  failureCategories: SystemTestFailureCategory[],
  metrics?: Record<string, unknown>,
): number {
  writeJson(reportPath, { schemaVersion: '1.0.0', runId, systemId, status, exitCode, onboarding, failureCategories, ...(metrics ? { metrics } : {}) });
  return exitCode;
}

function currentPhaseDurations(
  durations: Record<string, number>,
  phase: string,
  phaseStartedAtMs: number,
): Record<string, number> {
  return { ...durations, [phase]: (durations[phase] ?? 0) + (Date.now() - phaseStartedAtMs) };
}

function resolveSelectedRoutes(
  artifacts: ReturnType<typeof buildSystemTestArtifacts>,
  selectedCaseIds: readonly string[],
): string[] {
  const selected = new Set(selectedCaseIds);
  const routes = artifacts.recipes.recipes
    .filter((recipe) => selected.has(recipe.caseId))
    .map((recipe) => recipe.route)
    .filter((route) => route.length > 0);
  return [...new Set(routes)].sort();
}

export function fingerprintSelectedAdapterImplementations(
  artifacts: ReturnType<typeof buildSystemTestArtifacts>,
  adapterIds: readonly string[],
): string {
  const selected = new Set(adapterIds);
  return fingerprintSystemTestValue(artifacts.adapters.adapters
    .filter((adapter) => selected.has(adapter.id))
    .map((adapter) => ({ id: adapter.id, implementation: adapter.implementation }))
    .sort((left, right) => left.id.localeCompare(right.id)));
}

export function collectSystemTestRecipeAdapterIds(
  recipe: unknown,
  profile?: unknown,
  execution?: { authAdapterId?: unknown; recoveryAdapterId?: unknown },
): string[] {
  const ids: string[] = [];
  const add = (value: unknown): void => { if (typeof value === 'string' && value.trim()) ids.push(value.trim()); };
  if (recipe && typeof recipe === 'object') {
    const value = recipe as Record<string, unknown>;
    for (const key of ['contextGuards', 'capabilities', 'assertions']) {
      const calls = value[key];
      if (!Array.isArray(calls)) continue;
      for (const call of calls) if (call && typeof call === 'object') {
        add((call as { adapterId?: unknown }).adapterId);
        add((call as { id?: unknown }).id);
      }
    }
    for (const key of ['seed', 'cleanup']) {
      const call = value[key];
      if (call && typeof call === 'object') add((call as { adapterId?: unknown }).adapterId);
    }
    const readiness = value.actionReadiness;
    if (readiness && typeof readiness === 'object') add((readiness as { adapterId?: unknown }).adapterId);
  }
  if (profile && typeof profile === 'object') {
    const value = profile as Record<string, unknown>;
    for (const key of ['seedAdapterId', 'cleanupAdapterId', 'apiResidueAdapterId', 'uiResidueAdapterId']) add(value[key]);
    if (Array.isArray(value.probeAdapterIds)) value.probeAdapterIds.forEach(add);
  }
  add(execution?.authAdapterId);
  add(execution?.recoveryAdapterId);
  return [...new Set(ids)].sort();
}

export function buildSystemTestCaseImplementationFingerprints(
  artifacts: ReturnType<typeof buildSystemTestArtifacts>,
  runnerPath: string,
): Record<string, string> {
  return Object.fromEntries(artifacts.contract.cases.map((item) => {
    const recipe = artifacts.recipes.recipes.find((candidate) => candidate.caseId === item.caseId);
    const profile = recipe && 'dataProfileId' in recipe
      ? artifacts.manifest.dataProfiles[String(recipe.dataProfileId)]
      : undefined;
    const adapterIds = collectSystemTestRecipeAdapterIds(recipe, profile, {
      authAdapterId: artifacts.manifest.execution.authAdapterId,
    });
    return [item.caseId, buildSystemTestCaseImplementationFingerprint({
      adapters: artifacts.adapters.adapters,
      adapterIds,
      evidenceRuntime: artifacts.contract.sourceFingerprints.evidenceRuntime,
      execution: artifacts.contract.execution,
      runnerPath,
    })];
  }));
}

function aggregateRecipePhaseDurations(ledger: EvidenceLedger | undefined): Record<string, number> {
  const result: Record<string, number> = {};
  for (const timing of ledger?.cases?.flatMap((item) => item.runtimeEvidence?.executionTimings ?? []) ?? []) {
    if (!timing.phase || !Number.isFinite(timing.durationMs)) continue;
    result[timing.phase] = (result[timing.phase] ?? 0) + Number(timing.durationMs);
  }
  return result;
}

export function buildSystemTestCaseImplementationFingerprint(input: {
  adapters: readonly SystemTestAdapterDefinition[];
  adapterIds: readonly string[];
  evidenceRuntime: string;
  execution: unknown;
  runnerPath: string;
}): string {
  const selected = new Set(input.adapterIds);
  return buildSystemTestImplementationFingerprint({
    adapters: fingerprintSystemTestValue(input.adapters
      .filter((adapter) => selected.has(adapter.id))
      .map((adapter) => ({ id: adapter.id, implementation: adapter.implementation }))
      .sort((left, right) => left.id.localeCompare(right.id))),
    evidenceRuntime: input.evidenceRuntime,
    execution: input.execution,
    runnerPath: input.runnerPath,
  });
}

function safeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'default';
}

export function resolveSystemTestExecutionContextProfile(
  cases: ReadonlyArray<{ executionContextProfile?: string }>,
): { ok: true; profile: string } | { ok: false; profiles: string[] } {
  const profiles = [...new Set(cases.map((item) => item.executionContextProfile ?? 'default'))].sort();
  return profiles.length === 1
    ? { ok: true, profile: profiles[0] }
    : { ok: false, profiles };
}

export function resolveSystemTestExecutionMode(input: {
  executionIntent?: 'repair' | 'full-regression';
  fullRegressionAuthorized?: boolean;
  allowUnscopedSelection?: boolean;
  optimizationPlanPath?: string;
  optimizationStage?: 'canary' | 'batch';
}): SystemTestExecutionMode {
  const fullRegressionRequested = input.executionIntent === 'full-regression' || input.fullRegressionAuthorized === true;
  if (input.executionIntent === 'full-regression' && input.fullRegressionAuthorized === false) {
    throw new Error('SYSTEM_TEST_EXECUTION_MODE_CONFLICT:full-regression-authorization-required');
  }
  if (input.executionIntent === 'repair' && input.fullRegressionAuthorized === true) {
    throw new Error('SYSTEM_TEST_EXECUTION_MODE_CONFLICT:repair-with-full-regression-authorization');
  }
  if (fullRegressionRequested) {
    if (input.optimizationPlanPath || input.optimizationStage) {
      throw new Error('FULL_REGRESSION_OPTIMIZATION_MIXED');
    }
    return 'full-regression';
  }
  if (input.allowUnscopedSelection) {
    if (input.optimizationPlanPath || input.optimizationStage) {
      throw new Error('REFERENCE_EXECUTION_OPTIMIZATION_MIXED');
    }
    return 'reference';
  }
  if (!input.optimizationPlanPath) throw new Error('OPTIMIZATION_PLAN_REQUIRED_BEFORE_BROWSER');
  if (input.optimizationStage !== 'canary' && input.optimizationStage !== 'batch') {
    throw new Error('OPTIMIZATION_STAGE_REQUIRED_BEFORE_BROWSER');
  }
  return 'incremental';
}

export function shouldRetrySystemTestStageProcess(exitCode: number, attempt: number, maxRetries: number): boolean {
  return exitCode === 124 && attempt < maxRetries;
}

function readJson<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; } catch { return undefined; }
}

function sha256File(filePath: string): string {
  return require('node:crypto').createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function buildSystemTestImplementationFingerprint(input: {
  adapters: string;
  evidenceRuntime: string;
  execution: unknown;
  runnerPath: string;
}): string {
  return fingerprintSystemTestValue({
    adapters: input.adapters,
    evidenceRuntime: input.evidenceRuntime,
    execution: input.execution,
    runner: sha256File(input.runnerPath),
  });
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function parseCsv(value: string | undefined): string[] {
  return [...new Set(value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [])];
}

export function resolveSystemTestCaseIds(env: NodeJS.ProcessEnv, args: readonly string[]): string[] {
  const invalidArgument = args.find((item) => item.startsWith('--cases=') || item.startsWith('--case='));
  if (invalidArgument) throw new Error(`无效系统用例筛选参数：${invalidArgument}；请使用 --case-ids=`);
  const argumentValue = args.find((item) => item.startsWith('--case-ids='))?.slice('--case-ids='.length);
  const environmentIds = parseCsv(env.SYSTEM_TEST_CASE_IDS);
  const argumentIds = parseCsv(argumentValue);
  if (environmentIds.length > 0 && argumentIds.length > 0
    && JSON.stringify([...environmentIds].sort()) !== JSON.stringify([...argumentIds].sort())) {
    throw new Error(`系统用例筛选冲突：SYSTEM_TEST_CASE_IDS=${environmentIds.join(',')} --case-ids=${argumentIds.join(',')}`);
  }
  return argumentIds.length > 0 ? argumentIds : environmentIds;
}

export function buildSystemTestCaseGrep(caseIds: readonly string[]): string {
  if (caseIds.length === 0) throw new Error('系统用例筛选集合为空');
  const escaped = caseIds.map((caseId) => caseId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return `@case-(?:${escaped.join('|')})(?=$|\\s)`;
}

export function resolveSystemTestCaseSelection(input: {
  explicitCaseIds: readonly string[];
  persistedCaseIds: readonly string[];
  contractCaseIds: readonly string[];
  allowUnscopedSelection?: boolean;
  fullRegressionAuthorized?: boolean;
  selectionFileExists: boolean;
}): { selectedCaseIds: string[]; noOp: boolean } {
  const explicit = [...new Set(input.explicitCaseIds.map((caseId) => caseId.trim()).filter(Boolean))].sort();
  const persisted = [...new Set(input.persistedCaseIds.map((caseId) => caseId.trim()).filter(Boolean))].sort();
  if (!input.allowUnscopedSelection && !input.fullRegressionAuthorized && explicit.length > 0) {
    if (!input.selectionFileExists) throw new Error('SYSTEM_TEST_EXECUTION_SELECTION_REQUIRED');
    const unauthorized = explicit.filter((caseId) => !persisted.includes(caseId));
    if (unauthorized.length > 0) throw new Error(`SYSTEM_TEST_CASES_NOT_IN_EXECUTION_SELECTION:${unauthorized.join(',')}`);
  }
  if (input.fullRegressionAuthorized) {
    const available = new Set(input.contractCaseIds);
    const unknown = explicit.filter((caseId) => !available.has(caseId));
    if (unknown.length > 0) throw new Error(`SYSTEM_TEST_FULL_REGRESSION_UNKNOWN_CASE_IDS:${unknown.join(',')}`);
  }
  const selectedCaseIds = explicit.length > 0
    ? explicit
    : input.allowUnscopedSelection
      ? [...new Set(input.contractCaseIds)].sort()
      : persisted;
  return { selectedCaseIds, noOp: selectedCaseIds.length === 0 && !input.allowUnscopedSelection };
}

export function resolveSystemTestBusinessReporterArgument(
  env: NodeJS.ProcessEnv,
  evidenceReporterPath: string,
): string {
  const additional = (env.SYSTEM_TEST_ADDITIONAL_REPORTERS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(['line', evidenceReporterPath, ...additional])].join(',');
}

if (require.main === module) {
  const manifestPath = argument('manifest');
  if (!manifestPath) throw new Error('缺少 --manifest=<path>');
  const caseIds = resolveSystemTestCaseIds(process.env, process.argv.slice(2));
  const repairDiagnosisPath = argument('repair-diagnosis');
  runSystemTest({ manifestPath, caseIds, repairDiagnosisPath }).then((exitCode) => { process.exitCode = exitCode; }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
