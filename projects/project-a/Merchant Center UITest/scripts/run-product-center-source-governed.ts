import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildCaseTagGrep } from '../utils/playwright-batch-policy';
import { fingerprintProductCenterItemImplementation } from '../adapters/product-center/product-center-item-implementation';
import { fingerprintImplementationSources } from '../automation/system-test/system-test-implementation-fingerprint';
import { buildProductCenterGroupCaseFingerprintManifest } from '../utils/product-center-group-case-fingerprint';
import {
  beginSystemTestRepairAttempt,
  completeSystemTestRepairAttempt,
  fingerprintSystemTestRepairDiagnosis,
  readSystemTestRepairDiagnosis,
  readSystemTestRepairLedger,
} from '../automation/system-test/system-test-repair-attempt-guard';
import { classifySystemTestFailure } from '../automation/system-test/system-test-failure';
import { fingerprintSystemTestValue } from '../automation/system-test/system-test-contract';
import {
  issueSystemTestExecutionGrant,
  revokeSystemTestExecutionGrant,
} from '../automation/system-test/system-test-execution-grant';
import { assertSelectionMatchesPlan } from '../../../Test Automation Platform/src/automation/system-test/system-test-revalidation-policy';
import { createProductCenterAuthBatchSession } from '../utils/product-center-auth-batch-session';

type RunnerPlan = {
  runnerId: 'group' | 'group-finding' | 'item' | 'remaining';
  spec: string;
  selectedCaseIds: string[];
  sourceRecoveryCaseIds?: string[];
};

type ExecutionPlan = {
  generatedAt: string;
  summary: Record<string, number>;
  execution: {
    selectedCaseIds: string[];
    runners: RunnerPlan[];
  };
  revalidation: {
    selectedCaseIds: string[];
    runners: RunnerPlan[];
  };
  tasks: Array<{
    caseId: string;
    bindingFingerprint?: string | null;
    runnerId: RunnerPlan['runnerId'] | null;
  }>;
};

type RepairAttemptRegistration = { caseId: string; attemptId: string };
type RepairGuardBlock = { caseId: string; code: string; detail?: string };

type ExecutionIndex = {
  records: Array<{
    caseId: string;
    caseFingerprint: string;
    implementationFingerprint?: string | null;
    status: string;
    evidenceStatus?: string;
  }>;
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const planPath = path.join(workspaceRoot, 'deliverables/product-center-source-governance/execution-plan.json');

export function runProductCenterSourceGoverned(options: {
  execute?: boolean;
  runnerIds?: readonly RunnerPlan['runnerId'][];
  caseIds?: readonly string[];
  repairDiagnosisPath?: string;
} = {}): number {
  const plan = readJson<ExecutionPlan>(planPath);
  const requestedRunners = new Set(options.runnerIds ?? ['group', 'group-finding', 'item', 'remaining']);
  const requestedCaseIds = options.caseIds === undefined ? null : new Set(options.caseIds);
  const routingPlan = requestedCaseIds === null ? plan.execution : plan.revalidation;
  const plannedCaseIdSet = new Set(routingPlan.selectedCaseIds);
  const unplannedCaseIds = requestedCaseIds === null
    ? []
    : [...requestedCaseIds].filter((caseId) => !plannedCaseIdSet.has(caseId)).sort();
  if (unplannedCaseIds.length > 0) {
    throw new Error(`增量名单包含未进入当前执行计划的用例：${unplannedCaseIds.join(',')}`);
  }
  const runners = routingPlan.runners
    .filter((runner) => requestedRunners.has(runner.runnerId))
    .map((runner) => ({
      ...runner,
      selectedCaseIds: requestedCaseIds === null
        ? runner.selectedCaseIds
        : runner.selectedCaseIds.filter((caseId) => requestedCaseIds.has(caseId)),
      sourceRecoveryCaseIds: (runner.sourceRecoveryCaseIds ?? [])
        .filter((caseId) => requestedCaseIds === null || requestedCaseIds.has(caseId)),
    }));
  if (options.execute) {
    assertSelectionMatchesPlan({
      plannedCaseIds: requestedCaseIds ? [...requestedCaseIds] : routingPlan.selectedCaseIds,
      runnerCaseIds: runners.flatMap((runner) => runner.selectedCaseIds),
      phase: 'source-governed-before-browser',
    });
  }
  process.stdout.write(`${JSON.stringify({ mode: options.execute ? 'execute' : 'plan-only', summary: plan.summary, runners }, null, 2)}\n`);
  if (!options.execute) return 0;

  const runId = process.env.PC_SOURCE_GOVERNED_RUN_ID ?? timestamp();
  const repairLedgerPath = path.join(projectRoot, 'output/system-test-repair/product-center/repair-attempt-ledger.json');
  const plannedCaseIds = runners.flatMap((runner) => runner.selectedCaseIds);
  const diagnosisFingerprint = options.repairDiagnosisPath
    ? fingerprintSystemTestRepairDiagnosis(options.repairDiagnosisPath, {
      applicationId: 'merchant-center-product-center', caseIds: plannedCaseIds,
    })
    : undefined;
  const repairDiagnosis = options.repairDiagnosisPath
    ? readSystemTestRepairDiagnosis(options.repairDiagnosisPath, {
      applicationId: 'merchant-center-product-center', caseIds: plannedCaseIds,
    })
    : undefined;
  const repairRegistration = requestedCaseIds === null
    ? { registrations: [] as RepairAttemptRegistration[], blocked: [] as RepairGuardBlock[] }
    : registerRepairAttempts({
      plan,
      runId,
      caseIds: plannedCaseIds,
      repairLedgerPath,
      diagnosisFingerprint,
      invalidatedAttemptIds: repairDiagnosis?.supersedesAttemptIds,
      invalidationReason: repairDiagnosis
        ? `${repairDiagnosis.rootCause} ${repairDiagnosis.correctiveAction}`
        : undefined,
    });
  const blockedCaseIds = new Set(repairRegistration.blocked.map((item) => item.caseId));
  const executableRunners = runners.map((runner) => ({
    ...runner,
    selectedCaseIds: runner.selectedCaseIds.filter((caseId) => !blockedCaseIds.has(caseId)),
  }));
  const selectedCaseIds = executableRunners.flatMap((runner) => runner.selectedCaseIds);
  if (repairRegistration.blocked.length > 0) {
    process.stdout.write(`${JSON.stringify({ code: 'REPAIR_GUARD_BLOCKED', cases: repairRegistration.blocked }, null, 2)}\n`);
  }
  const repairAttempts = repairRegistration.registrations;
  if (selectedCaseIds.length === 0) {
    const reportManifestPath = path.join(projectRoot, `output/product-center-source-governed-${runId}-reports.json`);
    writeJson(reportManifestPath, {
      schemaVersion: '1.0.0', runId, reportPaths: [], selectedCaseIds: plannedCaseIds,
      blockedCaseIds: [...blockedCaseIds].sort(), runnerReports: [],
    });
    return 1;
  }
  let executionExitCode = 0;
  const reportPaths: string[] = [];
  // This public orchestration ledger survives a runner failure or process
  // interruption.  Runner-internal checkpoints are not a substitute for the
  // stage-level selected/terminal reconciliation needed by Jenkins.
  const stageLedgerPath = path.join(projectRoot, `output/product-center-source-governed-${runId}-stage-ledger.json`);
  const stageLedger: {
    schemaVersion: string; runId: string; selectedCaseIds: string[];
    stages: Array<{ runnerId: string; selectedCaseIds: string[]; terminalCaseIds: string[]; status: string; startedAt?: string; finishedAt?: string; exitCode?: number }>;
  } = { schemaVersion: '1.0.0', runId, selectedCaseIds, stages: executableRunners.filter((runner) => runner.selectedCaseIds.length > 0).map((runner) => ({ runnerId: runner.runnerId, selectedCaseIds: runner.selectedCaseIds, terminalCaseIds: [], status: 'pending' })) };
  writeJson(stageLedgerPath, stageLedger);
  const executionGrant = issueSystemTestExecutionGrant({
    rootDir: projectRoot,
    applicationId: 'merchant-center-product-center',
    runId,
    caseIds: selectedCaseIds,
    ttlMs: 4 * 60 * 60 * 1000,
    candidateFingerprint: fingerprintSystemTestValue({
      plan: plan.execution,
      runners,
      selectedCaseIds,
    }),
  });
  const authSession = createProductCenterAuthBatchSession('pc-source-governed-auth-');
  const governedEnv: NodeJS.ProcessEnv = {
    ...authSession.env(),
    ...authSession.env({ requiredRoutes: ['/pp/brand/list', '/pp/brand/create/standard', '/pp/brand/create/combo'] }),
    ...executionGrant.env,
    // The batch performs setup once below.  Every domain runner consumes this
    // same state and must not re-run the setup project or overwrite it.
    PC_BATCH_AUTH_VERIFIED: '1',
    PC_BATCH_AUTH_ONCE: '1',
    PC_AUTH_NO_DEPENDENCIES: '1',
  };
  let authSetupExitCode = 0;
  let interruptedSignal: NodeJS.Signals | null = null;
  const onInterrupt = (signal: NodeJS.Signals) => { interruptedSignal = signal; };
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onInterrupt);
  try {
    authSetupExitCode = runBatchAuthSetup(governedEnv);
    if (authSetupExitCode !== 0) {
      for (const stage of stageLedger.stages) stage.status = 'blocked-by-auth-setup';
      writeJson(stageLedgerPath, stageLedger);
      completeRepairRegistrations(repairLedgerPath, repairAttempts, 'interrupted');
      const reportManifestPath = path.join(projectRoot, `output/product-center-source-governed-${runId}-reports.json`);
      writeJson(reportManifestPath, {
        schemaVersion: '1.0.0', runId, reportPaths: [], selectedCaseIds: plannedCaseIds,
        blockedCaseIds: [...blockedCaseIds].sort(), runnerReports: [],
        authSetupCount: 1, authSetupStatus: 'failed', interruptionReason: 'batch-auth-setup-failed',
      });
      return authSetupExitCode;
    }
    for (const runner of executableRunners) {
      if (runner.selectedCaseIds.length === 0) continue;
      const stage = stageLedger.stages.find((item) => item.runnerId === runner.runnerId)!;
      stage.status = 'running'; stage.startedAt = new Date().toISOString(); writeJson(stageLedgerPath, stageLedger);
      reportPaths.push(reportPathFor(runner.runnerId, runId));
      process.stdout.write(`[source-governed] runner-start runner=${runner.runnerId} selected=${runner.selectedCaseIds.length}\n`);
      let exitCode = 1;
      try {
        exitCode = runner.runnerId === 'group'
          ? runGroup(runner.selectedCaseIds, runner.sourceRecoveryCaseIds ?? [], runId, governedEnv)
          : runner.runnerId === 'group-finding'
            ? runGroupFinding(runner.selectedCaseIds, runId, governedEnv)
          : runner.runnerId === 'item'
            ? runItem(runner.selectedCaseIds, runId, governedEnv)
            : runRemaining(runner.selectedCaseIds, runId, governedEnv);
      } catch (error) {
        process.stderr.write(`[source-governed] runner-error runner=${runner.runnerId} error=${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
        exitCode = 2;
      }
      process.stdout.write(`[source-governed] runner-finish runner=${runner.runnerId} exit=${exitCode}\n`);
      const report = reportPathFor(runner.runnerId, runId);
      stage.terminalCaseIds = runner.selectedCaseIds.filter((caseId) => readCaseOutcome([report], caseId).status !== 'interrupted');
      stage.exitCode = exitCode; stage.finishedAt = new Date().toISOString();
      stage.status = exitCode === 0 ? 'completed' : 'completed-with-findings';
      writeJson(stageLedgerPath, stageLedger);
      if (exitCode !== 0) executionExitCode = exitCode;
      // A product/test batch failure must not suppress independent runners.
      // Only an explicitly requested abort may stop the full-regression plan.
      if (interruptedSignal && process.env.PC_ABORT_ON_RUNNER_SIGNAL === 'true') break;
      if (interruptedSignal) {
        process.stderr.write(`[source-governed] runner-signal-observed signal=${interruptedSignal}; continuing independent runners\n`);
        interruptedSignal = null;
      }
    }
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onInterrupt);
    authSession.cleanup();
    revokeSystemTestExecutionGrant(executionGrant);
  }
  if (interruptedSignal) {
    completeRepairRegistrations(repairLedgerPath, repairAttempts, 'interrupted');
    executionExitCode = 130;
  }
  const reportManifestPath = path.join(projectRoot, `output/product-center-source-governed-${runId}-reports.json`);
  writeJson(reportManifestPath, {
    schemaVersion: '1.0.0',
    runId,
    reportPaths,
    selectedCaseIds: plannedCaseIds,
    blockedCaseIds: [...blockedCaseIds].sort(),
    runnerReports: executableRunners.map((runner) => ({
      runnerId: runner.runnerId,
      reportPath: reportPathFor(runner.runnerId, runId),
      selectedCaseIds: runner.selectedCaseIds,
    })),
    authSetupCount: 1,
    authSetupStatus: authSetupExitCode === 0 ? 'passed' : 'failed',
    ...(interruptedSignal ? { interruptionReason: `signal:${interruptedSignal}` } : {}),
  });
  const aggregationExitCode = runTsx('scripts/build-product-center-source-governed-execution-result.ts', {
    ...process.env,
    PC_SOURCE_GOVERNED_RUN_ID: runId,
    PC_SOURCE_GOVERNED_REPORT_MANIFEST: reportManifestPath,
    PC_SOURCE_GOVERNED_MERGE_PREVIOUS: process.env.PC_SOURCE_GOVERNED_MERGE_PREVIOUS === 'true' ? 'true' : 'false',
  });
  completeRepairAttempts({ repairAttempts, repairLedgerPath, reportPaths });
  return aggregationExitCode !== 0 ? aggregationExitCode : blockedCaseIds.size > 0 ? 1 : executionExitCode;
}

function runBatchAuthSetup(env: NodeJS.ProcessEnv): number {
  const result = spawnSync(process.execPath, [
    require.resolve('@playwright/test/cli'),
    'test',
    'tests/setup/auth.setup.ts',
    '--project=setup',
    '--workers=1',
    '--reporter=line',
  ], {
    cwd: projectRoot,
    env: { ...env, PC_BATCH_AUTH_SETUP: '1' },
    stdio: 'inherit',
    shell: false,
  });
  return result.status ?? 1;
}

function registerRepairAttempts(input: {
  plan: ExecutionPlan;
  runId: string;
  caseIds: readonly string[];
  repairLedgerPath: string;
  diagnosisFingerprint?: string;
  invalidatedAttemptIds?: readonly string[];
  invalidationReason?: string;
}): { registrations: RepairAttemptRegistration[]; blocked: RepairGuardBlock[] } {
  const registrations: RepairAttemptRegistration[] = [];
  const blocked: RepairGuardBlock[] = [];
  const requestedCaseIdSet = new Set(input.caseIds);
  const groupImplementationFingerprints = new Map(
    buildProductCenterGroupCaseFingerprintManifest(
      projectRoot,
      readJson<{ cases: Array<{
        caseId: string;
        generationAllowed: boolean;
        handlerId: string | null;
        bindingFingerprint: string;
        blockClassification?: string | null;
      }> }>(path.join(
        projectRoot,
        'contracts/product-center/group/product-center-group-bindings.json',
      )).cases.filter((item) => item.generationAllowed
        || item.blockClassification === 'observed-product-drift'
        || requestedCaseIdSet.has(item.caseId)),
      { includeObservedProductDrift: true, includeSourceRecovery: true },
    ).cases.map((item) => [item.caseId, item.implementationFingerprint]),
  );
  const routeByCaseId = new Map(input.plan.revalidation.runners.flatMap((runner) => (
    runner.selectedCaseIds.map((caseId) => [caseId, runner.runnerId] as const)
  )));
  const itemCaseFingerprints = readProductCenterItemCaseFingerprints();
  const groupCaseFingerprints = new Map(readJson<{ cases: Array<{ caseId: string; bindingFingerprint: string }> }>(path.join(
    projectRoot,
    'contracts/product-center/group/product-center-group-bindings.json',
  )).cases.map((item) => [item.caseId, item.bindingFingerprint]));
  for (const caseId of input.caseIds) {
    const task = input.plan.tasks.find((item) => item.caseId === caseId);
    const runnerId = routeByCaseId.get(caseId) ?? task?.runnerId;
    if (!task || !runnerId) throw new Error(`REPAIR_GUARD_ROUTE_MISSING:${caseId}`);
    const caseFingerprint = runnerId === 'item'
      ? itemCaseFingerprints.get(caseId)
      : runnerId === 'group' || runnerId === 'group-finding'
        ? groupCaseFingerprints.get(caseId)
        : task.bindingFingerprint;
    if (!caseFingerprint) throw new Error(`REPAIR_GUARD_FINGERPRINT_MISSING:${caseId}`);
    const implementationFingerprint = productCenterImplementationFingerprint(
      caseId,
      runnerId,
      groupImplementationFingerprints,
    );
    const decision = beginSystemTestRepairAttempt({
      ledgerPath: input.repairLedgerPath,
      applicationId: 'merchant-center-product-center',
      caseId,
      caseFingerprint,
      implementationFingerprint,
      runId: input.runId,
      diagnosisFingerprint: input.diagnosisFingerprint,
      invalidatedAttemptIds: input.invalidatedAttemptIds,
      invalidationReason: input.invalidationReason,
      ...resolveStalePassedAttemptInvalidation({
        ledgerPath: input.repairLedgerPath,
        caseId,
        caseFingerprint,
        implementationFingerprint,
      }),
    });
    if (!decision.allowed || !decision.attempt) {
      blocked.push({
        caseId,
        code: decision.code ?? 'REPAIR_GUARD_BLOCKED',
        ...(decision.detail ? { detail: decision.detail } : {}),
      });
      continue;
    }
    registrations.push({ caseId, attemptId: decision.attempt.attemptId });
  }
  return { registrations, blocked };
}

function resolveStalePassedAttemptInvalidation(input: {
  ledgerPath: string;
  caseId: string;
  caseFingerprint: string;
  implementationFingerprint: string;
}): { invalidatedAttemptIds?: string[]; invalidationReason?: string } {
  const ledger = readSystemTestRepairLedger(input.ledgerPath);
  const entry = ledger.entries.find((candidate) => (
    candidate.applicationId === 'merchant-center-product-center'
      && candidate.caseId === input.caseId
      && candidate.caseFingerprint === input.caseFingerprint
  ));
  if (!entry) return {};
  const executionIndexPath = path.join(
    projectRoot,
    'deliverables/system-test-platform/execution-index.json',
  );
  if (!fs.existsSync(executionIndexPath)) return {};
  const executionIndex = readJson<ExecutionIndex>(executionIndexPath);
  const currentAcceptedPass = executionIndex.records.some((record) => (
    record.caseId === input.caseId
      && record.caseFingerprint === input.caseFingerprint
      && record.implementationFingerprint === input.implementationFingerprint
      && record.status === 'passed'
      && record.evidenceStatus === 'complete'
  ));
  if (currentAcceptedPass) return {};
  const stalePassedAttemptIds = entry.cycles
    .flatMap((cycle) => cycle.attempts)
    .filter((attempt) => !attempt.invalidated
      && attempt.status === 'passed'
      && attempt.implementationFingerprint === input.implementationFingerprint)
    .map((attempt) => attempt.attemptId);
  return stalePassedAttemptIds.length > 0
    ? {
      invalidatedAttemptIds: stalePassedAttemptIds,
      invalidationReason: '账本通过记录缺少当前用例、实现和完整收据三者一致的 execution index 证据。',
    }
    : {};
}

function completeRepairRegistrations(
  ledgerPath: string,
  registrations: readonly RepairAttemptRegistration[],
  status: 'passed' | 'failed' | 'interrupted',
): void {
  for (const registration of registrations) {
    completeSystemTestRepairAttempt({ ledgerPath, attemptId: registration.attemptId, status });
  }
}

function completeRepairAttempts(input: {
  repairAttempts: readonly RepairAttemptRegistration[];
  repairLedgerPath: string;
  reportPaths: readonly string[];
}): void {
  for (const registration of input.repairAttempts) {
    const outcome = readCaseOutcome(input.reportPaths, registration.caseId);
    completeSystemTestRepairAttempt({
      ledgerPath: input.repairLedgerPath,
      attemptId: registration.attemptId,
      status: outcome.status,
      ...(outcome.failureCategory ? { failureCategory: outcome.failureCategory } : {}),
      ...(outcome.diagnosticFingerprint ? { diagnosticFingerprint: outcome.diagnosticFingerprint } : {}),
    });
  }
}

function productCenterImplementationFingerprint(
  caseId: string,
  runnerId: RunnerPlan['runnerId'],
  groupImplementationFingerprints?: ReadonlyMap<string, string>,
): string {
  if (runnerId === 'item') return fingerprintProductCenterItemImplementation(projectRoot, caseId);
  if (runnerId === 'group' || runnerId === 'group-finding') {
    const fingerprint = groupImplementationFingerprints?.get(caseId);
    if (!fingerprint) throw new Error(`组用例缺少当前实现指纹：${caseId}`);
    return fingerprint;
  }
  const sources = legacyImplementationSources(caseId);
  return fingerprintImplementationSources(projectRoot, sources).fingerprint;
}

function readProductCenterItemCaseFingerprints(): Map<string, string> {
  const sourceText = fs.readFileSync(path.join(
    projectRoot,
    'tests/generated/product-center-item-216.generated.spec.ts',
  ), 'utf8');
  const start = sourceText.indexOf('const allCases = ');
  const endMarker = ' as readonly GeneratedCase[];';
  const end = sourceText.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('PRODUCT_CENTER_ITEM_REGISTRATION_INVALID');
  const cases = JSON.parse(sourceText.slice(start + 'const allCases = '.length, end)) as Array<{
    caseId: string;
    bindingFingerprint: string;
  }>;
  return new Map(cases.map((item) => [item.caseId, item.bindingFingerprint]));
}

function legacyImplementationSources(caseId: string): string[] {
  const sources = [
    'playwright.config.ts',
    'tests/generated/product-center-legacy-remaining.generated.spec.ts',
  ];
  if ([
    'TC-TAG-DESC-013',
    'TC-TAG-STAT-012',
    'TC-TAG-DESC-014',
    'TC-TAG-STAT-013',
    'TC-TAG-BDG-009',
  ].includes(caseId)) {
    sources.push('pages/sidebar.page.ts', 'pages/product-center/tag-management.page.ts');
  }
  return sources;
}

export function readCaseOutcome(reportPaths: readonly string[], caseId: string): {
  status: 'passed' | 'failed' | 'interrupted';
  failureCategory?: ReturnType<typeof classifySystemTestFailure>;
  diagnosticFingerprint?: string;
} {
  const matches: Array<{
    passed: boolean;
    messages: string[];
    productDifference: null | {
      evidenceComplete: boolean;
      productMismatchConfirmed: boolean;
      executionPathEquivalent: boolean;
    };
  }> = [];
  for (const reportPath of reportPaths) {
    const absolutePath = path.resolve(projectRoot, reportPath);
    if (!fs.existsSync(absolutePath)) continue;
    const report = readJson<{ suites?: unknown[] }>(absolutePath);
    visitPlaywrightSuites(report.suites ?? [], (spec, test) => {
      const annotations = Array.isArray(test.annotations) ? test.annotations : [];
      const annotatedCaseId = annotations.find((item: { type?: string }) =>
        ['canonical-case-id', 'group-case-id', 'case-id'].includes(item.type ?? ''),
      )?.description;
      if (annotatedCaseId !== caseId && !String(spec.title ?? '').includes(caseId)) return;
      const results = (Array.isArray(test.results) ? test.results : []) as Array<{
        error?: { message?: string };
        errors?: Array<{ message?: string }>;
        attachments?: Array<{ name?: string; body?: string; contentType?: string }>;
      }>;
      const messages = results.flatMap((result) => [
        result.error?.message,
        ...(result.errors ?? []).map((error) => error.message),
      ]).filter((message): message is string => Boolean(message));
      const productDifference = results.flatMap((result) => result.attachments ?? []).flatMap((attachment) => {
        if (![
          'product-center-group-product-difference-evidence',
          'product-center-product-difference-evidence',
          'product-center-group-runtime-evidence',
          'test-execution-receipt',
        ].includes(attachment.name ?? '')
          || attachment.contentType !== 'application/json' || !attachment.body) return [];
        try {
          const payload = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8')) as Record<string, unknown>;
          const evidence = payload.productDifference && typeof payload.productDifference === 'object'
            ? payload.productDifference as Record<string, unknown>
            : payload;
          if (attachment.name === 'test-execution-receipt') {
            const assertionReceipts = Array.isArray(payload.assertionReceipts)
              ? payload.assertionReceipts.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
              : [];
            const mismatched = assertionReceipts.filter((item) => item.status === 'observed-mismatch');
            const operationReceipts = Array.isArray(payload.operationReceipts)
              ? payload.operationReceipts.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
              : [];
            const cleanup = payload.cleanup && typeof payload.cleanup === 'object'
              ? payload.cleanup as Record<string, unknown>
              : {};
            const executionPathEquivalent = operationReceipts.length > 0
              && operationReceipts.every((item) => item.observed === true && item.status === 'passed');
            const evidenceComplete = mismatched.length > 0
              && cleanup.apiZeroResidue === true
              && cleanup.uiVerificationObserved === true
              && cleanup.uiZeroResidue === true
              && executionPathEquivalent
              && mismatched.every((item) => item.expectedValue !== undefined
                && item.actualValue !== undefined
                && item.actualStatus === 'observed'
                && item.comparison === 'mismatched');
            if (!evidenceComplete) return [];
            return [{ evidenceComplete, productMismatchConfirmed: true, executionPathEquivalent }];
          }
          return [{
            evidenceComplete: evidence.evidenceComplete === true,
            productMismatchConfirmed: evidence.productMismatchConfirmed === true,
            executionPathEquivalent: evidence.executionPathEquivalent === true,
          }];
        } catch {
          return [];
        }
      }).at(-1) ?? null;
      matches.push({ passed: test.status === 'expected', messages, productDifference });
    });
  }
  const latest = matches.at(-1);
  if (!latest) return { status: 'interrupted' };
  if (latest.passed) return { status: 'passed' };
  const diagnostic = latest.messages.join('\n') || 'missing-playwright-diagnostic';
  return {
    status: 'failed',
    failureCategory: classifySystemTestFailure({
      status: 'failed',
      message: diagnostic,
      evidenceComplete: latest.productDifference?.evidenceComplete ?? false,
      productMismatchConfirmed: latest.productDifference?.productMismatchConfirmed,
      executionPathEquivalent: latest.productDifference?.executionPathEquivalent,
    }),
    diagnosticFingerprint: fingerprintSystemTestValue(diagnostic),
  };
}

function visitPlaywrightSuites(
  suites: readonly unknown[],
  visit: (spec: { title?: string }, test: { status?: string; annotations?: Array<{ type?: string; description?: string }>; results?: unknown[] }) => void,
): void {
  for (const rawSuite of suites) {
    const suite = rawSuite as { suites?: unknown[]; specs?: Array<{ title?: string; tests?: unknown[] }> };
    for (const spec of suite.specs ?? []) {
      for (const rawTest of spec.tests ?? []) visit(spec, rawTest as Parameters<typeof visit>[1]);
    }
    visitPlaywrightSuites(suite.suites ?? [], visit);
  }
}

function runGroup(
  caseIds: readonly string[],
  sourceRecoveryCaseIds: readonly string[],
  runId: string,
  env: NodeJS.ProcessEnv,
): number {
  const prefix = `output/product-center-group-source-governed-${runId}`;
  return runTsx('scripts/run-product-center-group-with-watchdog.ts', {
    ...env,
    ...sourceGovernedAllureEnvironment('group', runId),
    PC_GROUP_CASE_IDS: caseIds.join(','),
    PC_GROUP_SOURCE_RECOVERY_CASE_IDS: sourceRecoveryCaseIds.join(','),
    PC_GROUP_RUN_ID: `source-governed-${runId}`,
    PC_CHECKPOINT_ROOT: `output/checkpoints/group/source-governed-${runId}`,
    PC_GROUP_TEST_TIMEOUT_MS: '420000',
    PC_PLAYWRIGHT_OUTPUT_DIR: `test-results/source-governed/${runId}/group`,
    PLAYWRIGHT_JSON_OUTPUT_NAME: `${prefix}.json`,
    PC_GROUP_WATCHDOG_FILE: `${prefix}-watchdog.json`,
    PC_GROUP_PROGRESS_FILE: `${prefix}-progress.json`,
  });
}

function runGroupFinding(caseIds: readonly string[], runId: string, env: NodeJS.ProcessEnv): number {
  const reportPath = reportPathFor('group-finding', runId);
  const result = spawnSync(process.execPath, [
    require.resolve('@playwright/test/cli'),
    'test',
    'tests/generated/product-center-group-finding-replay.generated.spec.ts',
    '--project=chrome',
    '--workers=1',
    '--max-failures=0',
    ...(process.env.PC_AUTH_NO_DEPENDENCIES === '1' ? ['--no-deps'] : []),
  ], {
    cwd: projectRoot,
    env: {
      ...env,
      ...sourceGovernedAllureEnvironment('group-finding', runId),
      PC_GROUP_FINDING_CASE_IDS: caseIds.join(','),
      PC_PLAYWRIGHT_OUTPUT_DIR: `test-results/source-governed/${runId}/group-finding`,
      PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
    },
    stdio: 'inherit',
    shell: false,
  });
  return result.status ?? 1;
}

function runItem(caseIds: readonly string[], runId: string, env: NodeJS.ProcessEnv): number {
  return runTsx('scripts/run-product-center-item-213.ts', {
    ...env,
    ...sourceGovernedAllureEnvironment('item', runId),
    PC_ITEM_SELECTED_CASE_IDS: caseIds.join(','),
    PC_ITEM_RUN_ID: `source-governed-${runId}`,
    PC_ITEM_PROGRESS_FILE: `output/checkpoints/item/source-governed-${runId}/progress.json`,
    PC_ITEM_PROGRESS_HISTORY_FILE: `output/checkpoints/item/source-governed-${runId}/progress.jsonl`,
    PC_PLAYWRIGHT_OUTPUT_DIR: `test-results/source-governed/${runId}/item`,
    PLAYWRIGHT_JSON_OUTPUT_NAME: `output/product-center-item-source-governed-${runId}.json`,
  });
}

function runRemaining(caseIds: readonly string[], runId: string, env: NodeJS.ProcessEnv): number {
  const result = spawnSync(process.execPath, [
    require.resolve('@playwright/test/cli'),
    'test',
    'tests/generated/product-center-legacy-remaining.generated.spec.ts',
    '--project=chrome',
    '--workers=1',
    '--grep',
    buildCaseTagGrep(caseIds),
    ...(process.env.PC_AUTH_NO_DEPENDENCIES === '1' ? ['--no-deps'] : []),
  ], {
    cwd: projectRoot,
    env: {
      ...env,
      ...sourceGovernedAllureEnvironment('remaining', runId),
      PC_REMAINING_CASE_IDS: caseIds.join(','),
      PC_RECIPE_RUN_ID: `source-governed-${runId}`,
      PC_RESUMABLE_AUDIT: '1',
      PC_BATCH_AUTH_VERIFIED: '1',
      PC_BATCH_AUTH_ONCE: '1',
      PC_CHECKPOINT_ROOT: `output/checkpoints/remaining/source-governed-${runId}`,
      PC_PLAYWRIGHT_OUTPUT_DIR: `test-results/source-governed/${runId}/remaining`,
      PLAYWRIGHT_JSON_OUTPUT_NAME: reportPathFor('remaining', runId),
    },
    stdio: 'inherit',
    shell: false,
  });
  return result.status ?? 1;
}

function sourceGovernedAllureEnvironment(
  runnerId: RunnerPlan['runnerId'],
  runId: string,
): NodeJS.ProcessEnv {
  const resultsDir = path.join(projectRoot, 'output', 'allure', 'source-governed', runId, runnerId, 'allure-results');
  fs.mkdirSync(resultsDir, { recursive: true });
  return {
    ALLURE_RESULTS_DIR: resultsDir,
    PC_SOURCE_GOVERNED_ALLURE_DIR: resultsDir,
  };
}

function reportPathFor(runnerId: RunnerPlan['runnerId'], runId: string): string {
  return `output/product-center-${runnerId}-source-governed-${runId}.json`;
}

function runTsx(scriptPath: string, env: NodeJS.ProcessEnv): number {
  const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), scriptPath], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
    shell: false,
  });
  return result.status ?? 1;
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

function timestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

if (require.main === module) {
  const execute = process.argv.includes('--execute');
  const runnerOption = process.argv.find((argument) => argument.startsWith('--runners='));
  const caseOption = process.argv.find((argument) => argument.startsWith('--case-ids='));
  const repairDiagnosisOption = process.argv.find((argument) => argument.startsWith('--repair-diagnosis='));
  const runnerIds = runnerOption
    ?.slice('--runners='.length)
    .split(',')
    .filter((value): value is RunnerPlan['runnerId'] => (
      value === 'group' || value === 'group-finding' || value === 'item' || value === 'remaining'
    ));
  const caseIds = caseOption
    ?.slice('--case-ids='.length)
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  process.exitCode = runProductCenterSourceGoverned({
    execute, runnerIds, caseIds,
    repairDiagnosisPath: repairDiagnosisOption?.slice('--repair-diagnosis='.length),
  });
}
