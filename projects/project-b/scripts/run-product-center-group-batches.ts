import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createProductCenterAuthBatchSession } from '../utils/product-center-auth-batch-session';
import {
  buildProductCenterGroupExecutionFingerprint,
  buildProductCenterGroupOrchestrationFingerprint,
} from '../utils/product-center-group-execution-fingerprint';
import { reconcileProductCenterGroupWatchdogFiles } from './run-product-center-group-with-watchdog';

type GroupCaseMode = 'read-only' | 'crud-sop' | 'query-reset' | 'cancel' | 'form-validation'
  | 'selection-probe' | 'mutation-probe' | 'dependency-probe' | 'terminal-probe';
type Binding = {
  caseId: string;
  generationAllowed: boolean;
  executionProfile: GroupCaseMode;
  bindingFingerprint: string;
  requiredEvidence: string[];
};
type BatchLane = 'safe' | 'mutation';
export type ProductCenterGroupBatchPlan = {
  batchId: string;
  lane: BatchLane;
  caseIds: string[];
  batchFingerprint: string;
  jsonFile: string;
};
type CompletedBatch = ProductCenterGroupBatchPlan & {
  jsonSha256: string;
  completedAt: string;
  outcome?: 'passed' | 'findings';
};
type BatchCheckpoint = {
  schemaVersion: '2.0.0';
  runLabel: string;
  startedAt?: string;
  planFingerprint: string;
  executionFingerprint: string;
  completed: CompletedBatch[];
};
type SchedulerState = {
  schemaVersion: '2.0.0';
  runLabel: string;
  status: 'authenticating' | 'running' | 'failed' | 'completed';
  phase: 'authenticating' | 'executing' | 'merging' | 'reporting' | 'completed';
  planFingerprint: string;
  executionFingerprint: string;
  orchestrationFingerprint: string;
  totalBatches: number;
  completedBatches: string[];
  runningBatches: string[];
  pendingBatches: string[];
  failedBatch: string | null;
  errorMessage: string | null;
  startedAt: string;
  updatedAt: string;
  lastTransitionAt: string;
  maxIdleMs: number;
  mergedJsonFile: string | null;
  runScope: 'full' | 'targeted';
  selectedCaseIds: string[];
  strictReportGenerated: boolean;
  batchRetries: Record<string, number>;
};
type PlaywrightJson = {
  stats?: { startTime?: string; duration?: number; expected?: number; skipped?: number; unexpected?: number; flaky?: number };
  suites?: unknown[];
  errors?: unknown[];
};

const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, 'output');
const bindingsPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json');
const watchdogScript = path.join(projectRoot, 'scripts/run-product-center-group-with-watchdog.ts');
const executionVersion = buildProductCenterGroupExecutionFingerprint(projectRoot);
const orchestrationVersion = buildProductCenterGroupOrchestrationFingerprint(projectRoot);
const maxSchedulerIdleMs = positiveInteger(process.env.PC_GROUP_SCHEDULER_IDLE_MS, 180_000);
const schedulerPollMs = positiveInteger(process.env.PC_GROUP_SCHEDULER_POLL_MS, 15_000);
const authTimeoutMs = positiveInteger(process.env.PC_GROUP_AUTH_TIMEOUT_MS, 180_000);
const maxResidueVerifiedBatchRetries = positiveInteger(process.env.PC_GROUP_RESIDUE_VERIFIED_RETRIES, 1);

async function main(): Promise<void> {
  fs.mkdirSync(outputRoot, { recursive: true });
  const reconciledWatchdogs = reconcileProductCenterGroupWatchdogFiles(outputRoot);
  if (reconciledWatchdogs.length > 0) {
    process.stdout.write(`[scheduler] reconciled interrupted watchdogs=${reconciledWatchdogs.length}\n`);
  }
  const allBindings = readJson<{ cases: Binding[] }>(bindingsPath).cases.filter((item) => item.generationAllowed);
  const selectedCaseIds = resolveProductCenterGroupCaseIds(process.env, process.argv.slice(2));
  const unknownCaseIds = selectedCaseIds.filter((caseId) => !allBindings.some((item) => item.caseId === caseId));
  if (unknownCaseIds.length > 0) throw new Error(`选择了未知或不可执行组用例：${unknownCaseIds.join(',')}`);
  const bindings = selectedCaseIds.length > 0
    ? allBindings.filter((item) => selectedCaseIds.includes(item.caseId))
    : allBindings;
  if (bindings.length === 0) throw new Error('组用例调度计划为空');
  const runScope: SchedulerState['runScope'] = selectedCaseIds.length > 0 ? 'targeted' : 'full';
  const runLabel = resolveRunLabel(runScope);
  const plans = buildProductCenterGroupBatchPlan({
    bindings,
    runLabel,
    executionFingerprint: executionVersion.fingerprint,
    safeBatchSize: positiveInteger(process.env.PC_GROUP_SAFE_BATCH_SIZE, 10),
    mutationBatchSize: positiveInteger(process.env.PC_GROUP_MUTATION_BATCH_SIZE, 5),
  });
  const planFingerprint = fingerprint({
    executionFingerprint: executionVersion.fingerprint,
    plans: plans.map(({ jsonFile: _jsonFile, ...plan }) => plan),
  });
  const checkpointPath = path.join(outputRoot, `product-center-group-${runLabel}-checkpoint-v2.json`);
  const schedulerPath = path.join(outputRoot, `product-center-group-${runLabel}-scheduler.json`);
  const latestSchedulerPath = path.join(outputRoot, 'product-center-group-scheduler-latest.json');
  const scopedLatestSchedulerPath = path.join(outputRoot, `product-center-group-scheduler-latest-${runScope}.json`);
  const nowStartedAt = new Date().toISOString();
  const previousSchedulerStartedAt = fs.existsSync(schedulerPath)
    ? readJson<{ startedAt?: string }>(schedulerPath).startedAt
    : undefined;
  const checkpoint = readCheckpoint(checkpointPath, {
    schemaVersion: '2.0.0',
    runLabel,
    startedAt: resolveProductCenterGroupStartedAt(undefined, previousSchedulerStartedAt, nowStartedAt),
    planFingerprint,
    executionFingerprint: executionVersion.fingerprint,
    completed: [],
  });
  const startedAt = resolveProductCenterGroupStartedAt(
    checkpoint.startedAt,
    previousSchedulerStartedAt,
    nowStartedAt,
  );
  checkpoint.startedAt = startedAt;
  writeJsonAtomic(checkpointPath, checkpoint);
  validateReusableCompletedBatches(checkpoint, plans);

  let lastTransitionAt = Date.now();
  let failure: Error | null = null;
  let failedBatchId: string | null = null;
  let phase: SchedulerState['phase'] = 'authenticating';
  let strictReportGenerated = false;
  const batchRetries: Record<string, number> = {};
  const running = new Set<string>();
  const session = createProductCenterAuthBatchSession('pc-group-auth-');
  const persistScheduler = (status: SchedulerState['status'], failedBatch: string | null = null): void => {
    const completed = new Set(checkpoint.completed.map((item) => item.batchId));
    const value: SchedulerState = {
      schemaVersion: '2.0.0',
      runLabel,
      status,
      phase,
      planFingerprint,
      executionFingerprint: executionVersion.fingerprint,
      orchestrationFingerprint: orchestrationVersion.fingerprint,
      totalBatches: plans.length,
      completedBatches: [...completed].sort(),
      runningBatches: [...running].sort(),
      pendingBatches: plans.map((item) => item.batchId).filter((batchId) => !completed.has(batchId) && !running.has(batchId)),
      failedBatch,
      errorMessage: status === 'failed' ? failure?.message ?? '未知调度失败' : null,
      startedAt,
      updatedAt: new Date().toISOString(),
      lastTransitionAt: new Date(lastTransitionAt).toISOString(),
      maxIdleMs: maxSchedulerIdleMs,
      mergedJsonFile: status === 'completed' ? `output/product-center-group-${runLabel}.json` : null,
      runScope,
      selectedCaseIds: [...selectedCaseIds],
      strictReportGenerated,
      batchRetries: { ...batchRetries },
    };
    writeJsonAtomic(schedulerPath, value);
    writeJsonAtomic(latestSchedulerPath, value);
    writeJsonAtomic(scopedLatestSchedulerPath, value);
  };

  try {
    const allBatchesReusable = plans.every((plan) => checkpoint.completed.some((item) => item.batchId === plan.batchId));
    if (!allBatchesReusable) {
      persistScheduler('authenticating');
      let lastAuthHeartbeatAt = 0;
      const authHeartbeat = setInterval(() => {
        persistScheduler('authenticating');
        if (Date.now() - lastAuthHeartbeatAt >= 60_000) {
          lastAuthHeartbeatAt = Date.now();
          process.stdout.write(`[scheduler] authenticating timeout=${authTimeoutMs}ms\n`);
        }
      }, schedulerPollMs);
      try {
        const authExitCode = await runCommand([
          require.resolve('@playwright/test/cli'),
          'test',
          'tests/setup/auth.setup.ts',
          '--project=setup',
          '--workers=1',
          '--reporter=line',
        ], session.env({ requiredRoutes: requiredGroupRoutes(bindings) }), authTimeoutMs);
        if (authExitCode !== 0) throw new Error(`组用例共享认证失败：exit=${authExitCode}`);
      } finally {
        clearInterval(authHeartbeat);
      }
      lastTransitionAt = Date.now();
    } else {
      process.stdout.write(`[scheduler] all batches reusable; skipping authentication\n`);
    }
    phase = 'executing';
    persistScheduler('running');

    let lastHeartbeatAt = 0;
    const schedulerTimer = setInterval(() => {
      const completedIds = new Set(checkpoint.completed.map((item) => item.batchId));
      const pending = plans.filter((item) => !completedIds.has(item.batchId) && !running.has(item.batchId));
      if (pending.length > 0 && running.size === 0 && Date.now() - lastTransitionAt > maxSchedulerIdleMs) {
        failure = new Error(`组用例总调度停滞：pending=${pending.map((item) => item.batchId).join(',')}`);
      }
      persistScheduler(failure ? 'failed' : 'running');
      if (Date.now() - lastHeartbeatAt >= 60_000) {
        lastHeartbeatAt = Date.now();
        process.stdout.write(`[scheduler] completed=${completedIds.size}/${plans.length} running=${[...running].join(',') || 'none'} pending=${pending.length}\n`);
      }
    }, schedulerPollMs);

    try {
      const safePlans = plans.filter((item) => item.lane === 'safe');
      const mutationPlans = plans.filter((item) => item.lane === 'mutation');
      await Promise.all([
        runLane(safePlans, session.env({ noDependencies: true, requiredRoutes: requiredGroupRoutes(bindings) })),
        runLane(mutationPlans, session.env({ noDependencies: true, requiredRoutes: requiredGroupRoutes(bindings) })),
      ]);
    } finally {
      clearInterval(schedulerTimer);
    }
    if (failure) throw failure;

    phase = 'merging';
    lastTransitionAt = Date.now();
    persistScheduler('running');
    const completedById = new Map(checkpoint.completed.map((item) => [item.batchId, item]));
    const batchFiles = plans.map((plan) => path.join(projectRoot, completedById.get(plan.batchId)!.jsonFile));
    const merged = merge(batchFiles);
    const mergedRelativePath = `output/product-center-group-${runLabel}.json`;
    writeJsonAtomic(path.join(projectRoot, mergedRelativePath), merged);
    const buildStrictReport = shouldBuildProductCenterGroupStrictReport(
      selectedCaseIds,
      process.env.PC_GROUP_BUILD_REPORT,
    );
    if (buildStrictReport) {
      phase = 'reporting';
      lastTransitionAt = Date.now();
      persistScheduler('running');
    }
    const reportExitCode = buildStrictReport
      ? await runCommand([
        path.join(projectRoot, 'node_modules/tsx/dist/cli.mjs'),
        'scripts/build-product-center-group-final-report.ts',
        '--json',
        mergedRelativePath,
      ], process.env)
      : 0;
    if (reportExitCode !== 0) throw new Error(`组用例严格报告生成失败：exit=${reportExitCode}`);
    strictReportGenerated = buildStrictReport;
    if (selectedCaseIds.length > 0) {
      process.stdout.write(`[scheduler] targeted evidence completed; strict full report skipped cases=${selectedCaseIds.length}\n`);
    }
    lastTransitionAt = Date.now();
    phase = 'completed';
    persistScheduler('completed');
    process.stdout.write(`[scheduler] completed cases=${collectCaseIds(merged).length} output=${mergedRelativePath}\n`);
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
    lastTransitionAt = Date.now();
    persistScheduler('failed', failedBatchId ?? running.values().next().value ?? null);
    throw failure;
  } finally {
    session.cleanup();
  }

  async function runLane(lanePlans: ProductCenterGroupBatchPlan[], env: NodeJS.ProcessEnv): Promise<void> {
    for (const plan of lanePlans) {
      if (failure) return;
      if (checkpoint.completed.some((item) => item.batchId === plan.batchId)) {
        process.stdout.write(`[scheduler] resume skip batch=${plan.batchId} cases=${plan.caseIds.length}\n`);
        continue;
      }
      running.add(plan.batchId);
      lastTransitionAt = Date.now();
      persistScheduler('running');
      let exitCode = await runBatch(plan, runLabel, env);
      while (exitCode !== 0 && (batchRetries[plan.batchId] ?? 0) < maxResidueVerifiedBatchRetries) {
        const retryCheck = evaluateProductCenterGroupBatchRetry({
          jsonPath: path.join(projectRoot, plan.jsonFile),
          checkpointRoot: path.join(outputRoot, 'checkpoints', 'group', runLabel, plan.batchId),
          runtimeLockRoot: path.join(outputRoot, 'runtime-locks', 'group', runLabel, plan.batchId),
        });
        if (!retryCheck.allowed) {
          process.stdout.write(`[scheduler] batch retry denied batch=${plan.batchId} reasons=${retryCheck.reasons.join(',')}\n`);
          break;
        }
        batchRetries[plan.batchId] = (batchRetries[plan.batchId] ?? 0) + 1;
        lastTransitionAt = Date.now();
        persistScheduler('running');
        process.stdout.write(`[scheduler] retry residue-verified transient batch=${plan.batchId} attempt=${batchRetries[plan.batchId] + 1}\n`);
        exitCode = await runBatch(plan, runLabel, env);
      }
      running.delete(plan.batchId);
      lastTransitionAt = Date.now();
      if (exitCode !== 0) {
        failedBatchId = plan.batchId;
        const jsonPath = path.join(projectRoot, plan.jsonFile);
        try {
          validateBatchDocument(plan, readJson<PlaywrightJson>(jsonPath), true);
        } catch (error) {
          failure = error instanceof Error ? error : new Error(String(error));
          persistScheduler('failed', plan.batchId);
          return;
        }
        checkpoint.completed.push({
          ...plan,
          jsonSha256: sha256File(jsonPath),
          completedAt: new Date().toISOString(),
          outcome: 'findings',
        });
        writeJsonAtomic(checkpointPath, checkpoint);
        persistScheduler('running');
        process.stdout.write(`[scheduler] completed-with-findings batch=${plan.batchId} cases=${plan.caseIds.length} exit=${exitCode}\n`);
        continue;
      }
      const jsonPath = path.join(projectRoot, plan.jsonFile);
      validateBatchDocument(plan, readJson<PlaywrightJson>(jsonPath));
      checkpoint.completed.push({
        ...plan,
        jsonSha256: sha256File(jsonPath),
        completedAt: new Date().toISOString(),
        outcome: 'passed',
      });
      writeJsonAtomic(checkpointPath, checkpoint);
      persistScheduler('running');
      process.stdout.write(`[scheduler] completed batch=${plan.batchId} cases=${plan.caseIds.length}\n`);
    }
  }
}

export function evaluateProductCenterGroupBatchRetry(input: {
  jsonPath: string;
  checkpointRoot: string;
  runtimeLockRoot: string;
}): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!fs.existsSync(input.jsonPath)) reasons.push('BATCH_JSON_MISSING');
  else if (!isTransientNavigationBatchFailure(readJson<PlaywrightJson>(input.jsonPath))) {
    reasons.push('FAILURE_NOT_TRANSIENT_NAVIGATION');
  }
  if (!allCheckpointEntriesResidueVerified(input.checkpointRoot)) reasons.push('CHECKPOINT_RESIDUE_NOT_VERIFIED');
  if (hasFiles(input.runtimeLockRoot)) reasons.push('RUNTIME_LOCK_PRESENT');
  return { allowed: reasons.length === 0, reasons };
}

function isTransientNavigationBatchFailure(document: PlaywrightJson): boolean {
  const failedResults = collectFailedResultErrors(document.suites ?? []);
  if (failedResults.length === 0) return false;
  const transientPrimary = /page\.waitForResponse: Timeout|page\.goto:.*(?:Timeout|ERR_)|ERR_CONNECTION_|ERR_NETWORK_CHANGED|ECONNRESET|socket hang up|Too Many Requests|HTTP 429/i;
  const allowedSecondary = /Target page, context or browser has been closed|Testing stopped early/i;
  return failedResults.every((messages) => (
    messages.some((message) => transientPrimary.test(message))
    && messages.every((message) => transientPrimary.test(message) || allowedSecondary.test(message))
  ));
}

function collectFailedResultErrors(suites: readonly unknown[]): string[][] {
  const output: string[][] = [];
  const visit = (suite: unknown): void => {
    if (!suite || typeof suite !== 'object') return;
    const value = suite as {
      suites?: unknown[];
      specs?: Array<{ tests?: Array<{ results?: Array<{ status?: string; errors?: Array<{ message?: string }> }> }> }>;
    };
    for (const spec of value.specs ?? []) {
      for (const item of spec.tests ?? []) {
        for (const result of item.results ?? []) {
          if (result.status !== 'failed') continue;
          output.push((result.errors ?? []).map((error) => error.message ?? '').filter(Boolean));
        }
      }
    }
    for (const child of value.suites ?? []) visit(child);
  };
  for (const suite of suites) visit(suite);
  return output;
}

function allCheckpointEntriesResidueVerified(rootDir: string): boolean {
  if (!fs.existsSync(rootDir)) return true;
  return collectJsonFiles(rootDir).every((filePath) => {
    try {
      const value = readJson<{ entries?: Array<{ phase?: string }> }>(filePath);
      return !Array.isArray(value.entries) || value.entries.every((entry) => entry.phase === 'residue-verified');
    } catch {
      return false;
    }
  });
}

function collectJsonFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) return collectJsonFiles(filePath);
    return entry.isFile() && entry.name.endsWith('.json') ? [filePath] : [];
  });
}

function hasFiles(rootDir: string): boolean {
  if (!fs.existsSync(rootDir)) return false;
  return fs.readdirSync(rootDir, { withFileTypes: true }).some((entry) => (
    entry.isFile() || (entry.isDirectory() && hasFiles(path.join(rootDir, entry.name)))
  ));
}

export function shouldBuildProductCenterGroupStrictReport(
  selectedCaseIds: readonly string[],
  configuredValue: string | undefined,
): boolean {
  return selectedCaseIds.length === 0 && configuredValue !== 'false';
}

export function resolveProductCenterGroupStartedAt(
  checkpointStartedAt: string | undefined,
  schedulerStartedAt: string | undefined,
  currentStartedAt: string,
): string {
  for (const candidate of [checkpointStartedAt, schedulerStartedAt]) {
    if (candidate && Number.isFinite(Date.parse(candidate))) return candidate;
  }
  return currentStartedAt;
}

export function buildProductCenterGroupBatchPlan(input: {
  bindings: readonly Binding[];
  runLabel: string;
  executionFingerprint: string;
  safeBatchSize: number;
  mutationBatchSize: number;
}): ProductCenterGroupBatchPlan[] {
  const safe = input.bindings.filter(safeExecutionBinding);
  const mutation = input.bindings.filter((item) => !safeExecutionBinding(item));
  return [
    ...chunkLane(safe, 'safe', input.safeBatchSize),
    ...chunkLane(mutation, 'mutation', input.mutationBatchSize),
  ].map((batch) => {
    const batchFingerprint = fingerprint({
      executionFingerprint: input.executionFingerprint,
      lane: batch.lane,
      cases: batch.bindings.map((item) => ({
        caseId: item.caseId,
        bindingFingerprint: item.bindingFingerprint,
      })),
    });
    return {
      batchId: `${batch.lane}-${String(batch.index + 1).padStart(2, '0')}`,
      lane: batch.lane,
      caseIds: batch.bindings.map((item) => item.caseId),
      batchFingerprint,
      jsonFile: `output/product-center-group-${input.runLabel}-${batch.lane}-${String(batch.index + 1).padStart(2, '0')}.json`,
    };
  });
}

export function validateProductCenterGroupCompletedBatch(
  completed: CompletedBatch,
  plan: ProductCenterGroupBatchPlan,
  projectRootOverride: string = projectRoot,
): string[] {
  const errors: string[] = [];
  if (completed.batchFingerprint !== plan.batchFingerprint) errors.push('BATCH_FINGERPRINT_MISMATCH');
  if (stableJson(completed.caseIds) !== stableJson(plan.caseIds)) errors.push('BATCH_CASE_SET_MISMATCH');
  if (completed.jsonFile !== plan.jsonFile) errors.push('BATCH_JSON_PATH_MISMATCH');
  const jsonPath = path.join(projectRootOverride, completed.jsonFile);
  if (!fs.existsSync(jsonPath)) errors.push('BATCH_JSON_MISSING');
  else {
    if (sha256File(jsonPath) !== completed.jsonSha256) errors.push('BATCH_JSON_HASH_MISMATCH');
    try {
      validateBatchDocument(plan, readJson<PlaywrightJson>(jsonPath), completed.outcome === 'findings');
    } catch {
      errors.push('BATCH_JSON_CONTRACT_INVALID');
    }
  }
  return errors;
}

function validateReusableCompletedBatches(
  checkpoint: BatchCheckpoint,
  plans: readonly ProductCenterGroupBatchPlan[],
): void {
  const planById = new Map(plans.map((item) => [item.batchId, item]));
  for (const completed of checkpoint.completed) {
    const plan = planById.get(completed.batchId);
    if (!plan) throw new Error(`checkpoint 包含当前计划外批次：${completed.batchId}`);
    const errors = validateProductCenterGroupCompletedBatch(completed, plan);
    if (errors.length > 0) throw new Error(`checkpoint 批次不可复用：${completed.batchId}:${errors.join(',')}`);
  }
}

function readCheckpoint(filePath: string, fallback: BatchCheckpoint): BatchCheckpoint {
  if (!fs.existsSync(filePath)) return fallback;
  const checkpoint = readJson<BatchCheckpoint>(filePath);
  if (checkpoint.schemaVersion !== fallback.schemaVersion
    || checkpoint.runLabel !== fallback.runLabel
    || checkpoint.planFingerprint !== fallback.planFingerprint
    || checkpoint.executionFingerprint !== fallback.executionFingerprint) {
    throw new Error(`组用例 checkpoint 与当前计划不匹配：${filePath}`);
  }
  return checkpoint;
}

function runBatch(plan: ProductCenterGroupBatchPlan, runLabel: string, env: NodeJS.ProcessEnv): Promise<number> {
  const batchRoot = path.join(outputRoot, 'checkpoints', 'group', runLabel, plan.batchId);
  return runCommand([path.join(projectRoot, 'node_modules/tsx/dist/cli.mjs'), watchdogScript], {
    ...env,
    PC_GROUP_CASE_IDS: plan.caseIds.join(','),
    PC_GROUP_RUN_ID: `${runLabel}-${plan.batchId}`,
    PLAYWRIGHT_JSON_OUTPUT_NAME: plan.jsonFile,
    PC_CHECKPOINT_ROOT: batchRoot,
    PC_RUNTIME_LOCK_ROOT: path.join(outputRoot, 'runtime-locks', 'group', runLabel, plan.batchId),
    PC_GROUP_PROGRESS_FILE: path.join(outputRoot, `product-center-group-${runLabel}-${plan.batchId}-progress.json`),
    PC_GROUP_WATCHDOG_FILE: path.join(outputRoot, `product-center-group-${runLabel}-${plan.batchId}-watchdog.json`),
  });
}

function runCommand(args: readonly string[], env: NodeJS.ProcessEnv, timeoutMs = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...args], {
      cwd: projectRoot,
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    let settled = false;
    const timer = timeoutMs > 0 ? setTimeout(() => {
      if (settled) return;
      settled = true;
      terminateProcessTree(child.pid);
      process.stderr.write(`[scheduler] command timeout after ${timeoutMs}ms: ${args.slice(0, 3).join(' ')}\n`);
      resolve(124);
    }, timeoutMs) : null;
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(signal ? 1 : code ?? 1);
    });
  });
}

function terminateProcessTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    return;
  }
  process.kill(pid, 'SIGTERM');
}

function validateBatchDocument(
  plan: ProductCenterGroupBatchPlan,
  document: PlaywrightJson,
  allowFindings = false,
): void {
  const observedIds = collectCaseIds(document);
  if (observedIds.length !== plan.caseIds.length
    || new Set(observedIds).size !== plan.caseIds.length
    || plan.caseIds.some((caseId) => !observedIds.includes(caseId))) {
    throw new Error(`批次记录不完整：batch=${plan.batchId} expected=${plan.caseIds.join(',')} observed=${observedIds.join(',')}`);
  }
  if (!allowFindings && (Number(document.stats?.unexpected ?? 0) > 0
    || Number(document.stats?.skipped ?? 0) > 0
    || (document.errors?.length ?? 0) > 0)) {
    throw new Error(`批次存在失败、跳过或 teardown 错误：${plan.batchId}`);
  }
}

function merge(files: readonly string[]): PlaywrightJson {
  const documents = files.map((filePath) => readJson<PlaywrightJson>(filePath));
  const first = documents[0];
  const stats = documents.reduce((acc, document) => {
    const item = document.stats ?? {};
    acc.duration = Number(acc.duration ?? 0) + Number(item.duration ?? 0);
    acc.expected = Number(acc.expected ?? 0) + Number(item.expected ?? 0);
    acc.skipped = Number(acc.skipped ?? 0) + Number(item.skipped ?? 0);
    acc.unexpected = Number(acc.unexpected ?? 0) + Number(item.unexpected ?? 0);
    acc.flaky = Number(acc.flaky ?? 0) + Number(item.flaky ?? 0);
    return acc;
  }, { startTime: first.stats?.startTime, duration: 0, expected: 0, skipped: 0, unexpected: 0, flaky: 0 } as NonNullable<PlaywrightJson['stats']>);
  return {
    ...first,
    stats,
    suites: documents.flatMap((document) => document.suites ?? []),
    errors: documents.flatMap((document) => document.errors ?? []),
  };
}

function collectCaseIds(document: PlaywrightJson): string[] {
  const result: string[] = [];
  const visit = (suite: any): void => {
    for (const spec of suite.specs ?? []) {
      const tag = (spec.tags ?? []).find((item: string) => /^@?case-/.test(item));
      const fromTitle = String(spec.title ?? '').match(/^(TC-GRP-[A-Z]+-\d+)/)?.[1];
      if (tag) result.push(tag.replace(/^@?case-/, ''));
      else if (fromTitle) result.push(fromTitle);
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of document.suites ?? []) visit(suite);
  return result;
}

function chunkLane(bindings: readonly Binding[], lane: BatchLane, size: number): Array<{
  lane: BatchLane;
  index: number;
  bindings: Binding[];
}> {
  const chunks: Array<{ lane: BatchLane; index: number; bindings: Binding[] }> = [];
  for (let index = 0; index < bindings.length; index += size) {
    chunks.push({ lane, index: chunks.length, bindings: bindings.slice(index, index + size) });
  }
  return chunks;
}

function safeExecutionProfile(profile: GroupCaseMode): boolean {
  return ['read-only', 'cancel', 'form-validation', 'selection-probe'].includes(profile);
}

function safeExecutionBinding(binding: Binding): boolean {
  return safeExecutionProfile(binding.executionProfile)
    && !binding.requiredEvidence.includes('api-mutation')
    && !binding.requiredEvidence.includes('cleanup');
}

function requiredGroupRoutes(bindings: readonly Binding[]): string[] {
  const routes = readJson<{ cases: Array<{ caseId: string; route: string }> }>(bindingsPath).cases
    .filter((item) => bindings.some((binding) => binding.caseId === item.caseId))
    .map((item) => item.route);
  return [...new Set(['/pp/brand/list', ...routes])].sort();
}

function resolveRunLabel(runScope: SchedulerState['runScope']): string {
  const configured = process.env.PC_GROUP_BATCH_LABEL?.trim();
  if (configured) return configured.replace(/[^a-zA-Z0-9_-]/g, '-');
  if (process.env.PC_GROUP_RESUME === 'true') {
    const scopedLatestPath = path.join(outputRoot, `product-center-group-scheduler-latest-${runScope}.json`);
    const latestPath = fs.existsSync(scopedLatestPath)
      ? scopedLatestPath
      : path.join(outputRoot, 'product-center-group-scheduler-latest.json');
    if (!fs.existsSync(latestPath)) throw new Error('请求恢复组用例，但缺少 latest scheduler 状态');
    return readJson<{ runLabel: string }>(latestPath).runLabel;
  }
  return `strict-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCsv(value: string | undefined): string[] {
  return [...new Set(value?.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean) ?? [])];
}

export function resolveProductCenterGroupCaseIds(
  env: NodeJS.ProcessEnv,
  args: readonly string[],
): string[] {
  const invalidArgument = args.find((item) => item.startsWith('--cases=') || item.startsWith('--case='));
  if (invalidArgument) throw new Error(`无效组用例筛选参数：${invalidArgument}；请使用 --case-ids=`);
  const argumentValue = args.find((item) => item.startsWith('--case-ids='))?.slice('--case-ids='.length);
  const environmentIds = parseCsv(env.PC_GROUP_CASE_IDS);
  const argumentIds = parseCsv(argumentValue);
  if (environmentIds.length > 0 && argumentIds.length > 0
    && stableJson([...environmentIds].sort()) !== stableJson([...argumentIds].sort())) {
    throw new Error(`组用例筛选冲突：PC_GROUP_CASE_IDS=${environmentIds.join(',')} --case-ids=${argumentIds.join(',')}`);
  }
  return argumentIds.length > 0 ? argumentIds : environmentIds;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
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
