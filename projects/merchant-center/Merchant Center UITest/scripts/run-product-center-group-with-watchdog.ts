import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { assertSystemTestExecutionGrant } from '../automation/system-test/system-test-execution-grant';

const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, 'output');
const jsonName = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? 'output/product-center-group-trusted-full-watchdog.json';
if (process.env.PC_GROUP_CASES && !process.env.PC_GROUP_CASE_IDS) {
  throw new Error('检测到无效过滤变量 PC_GROUP_CASES；请使用 PC_GROUP_CASE_IDS，已拒绝意外全量运行。');
}
const jsonPath = path.resolve(projectRoot, jsonName);
const watchdogPath = path.resolve(
  process.env.PC_GROUP_WATCHDOG_FILE ?? path.join(outputRoot, 'product-center-group-watchdog.json'),
);
const progressPath = path.resolve(
  process.env.PC_GROUP_PROGRESS_FILE ?? path.join(outputRoot, 'product-center-group-progress.json'),
);
const stallMs = Number(process.env.PC_WATCHDOG_STALL_MS ?? 180_000);
const pollMs = Number(process.env.PC_WATCHDOG_POLL_MS ?? 15_000);

type WatchdogState = {
  status: 'running' | 'auth-retrying' | 'passed' | 'failed' | 'stalled' | 'interrupted';
  startedAt: string;
  updatedAt: string;
  attempt: number;
  maxAttempts: number;
  stallMs: number;
  lastProgressAt: string;
  lastProgressSource: string;
  jsonPath: string;
  exitCode: number | null;
  signal: string | null;
  watchdogPid: number | null;
  childPid: number | null;
  interruptionReason: string | null;
};

type ProgressState = {
  runId?: string;
  caseId?: string;
  phase?: string;
  updatedAt?: string;
};

type AttemptResult = {
  exitCode: number;
  state: WatchdogState;
};

const authRetryDelaysMs = resolveAuthRetryDelays();

async function main(): Promise<void> {
  const selectedCaseIds = (process.env.PC_GROUP_CASE_IDS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  if (selectedCaseIds.length === 0) throw new Error('GOVERNED_EXECUTION_CASE_IDS_REQUIRED:group');
  for (const caseId of selectedCaseIds) {
    assertSystemTestExecutionGrant({
      rootDir: projectRoot,
      applicationId: 'merchant-center-product-center',
      caseId,
    });
  }
  fs.mkdirSync(outputRoot, { recursive: true });
  reconcileProductCenterGroupWatchdogFiles(outputRoot);
  const baseRunId = process.env.PC_GROUP_RUN_ID ?? `group-${Date.now()}`;
  for (let attempt = 1; attempt <= authRetryDelaysMs.length + 1; attempt += 1) {
    const result = await runAttempt(attempt, baseRunId);
    if (result.exitCode === 0 || result.exitCode === 124) {
      process.exitCode = result.exitCode;
      return;
    }

    const document = readJsonDocument();
    const progress = readProgressState();
    const retryDelayMs = authRetryDelaysMs[attempt - 1];
    if (retryDelayMs === undefined || !isAuthOnlyFailure(document, progress)) {
      process.exitCode = result.exitCode;
      return;
    }

    archiveAuthAttemptJson(attempt);
    const retryState: WatchdogState = {
      ...result.state,
      status: 'auth-retrying',
      updatedAt: new Date().toISOString(),
    };
    persist(retryState);
    persistProgress({
      runId: `${baseRunId}-attempt-${attempt}`,
      caseId: '__setup__',
      phase: 'auth-retrying',
      updatedAt: new Date().toISOString(),
    });
    process.stdout.write(`[watchdog] auth-only failure attempt=${attempt}; retrying in ${retryDelayMs}ms\n`);
    await delay(retryDelayMs);
  }
}

function runAttempt(attempt: number, baseRunId: string): Promise<AttemptResult> {
  return new Promise((resolve, reject) => {
  if (fs.existsSync(progressPath)) fs.unlinkSync(progressPath);
  const startedAt = new Date();
  let lastProgressAt = startedAt.getTime();
  let lastProgressSource = 'process-started';
  let lastProgressToken = '';
  let lastConsoleHeartbeatAt = startedAt.getTime();
  let state: WatchdogState = {
    status: 'running',
    startedAt: startedAt.toISOString(),
    updatedAt: startedAt.toISOString(),
    attempt,
    maxAttempts: authRetryDelaysMs.length + 1,
    stallMs,
    lastProgressAt: startedAt.toISOString(),
    lastProgressSource,
    jsonPath: path.relative(projectRoot, jsonPath).replaceAll(path.sep, '/'),
    exitCode: null,
    signal: null,
    watchdogPid: process.pid,
    childPid: null,
    interruptionReason: null,
  };
  persist(state);
  process.stdout.write(`[watchdog] started attempt=${attempt}/${state.maxAttempts} stall=${stallMs}ms poll=${pollMs}ms output=${state.jsonPath}\n`);

  const command = process.execPath;
  const child = spawn(command, [
    path.join(projectRoot, 'node_modules', 'playwright', 'cli.js'),
    'test',
      'tests/generated/product-center-group.generated.spec.ts',
      '--project=chrome',
      '--workers=1',
      '--max-failures=0',
      `--timeout=${process.env.PC_GROUP_TEST_TIMEOUT_MS ?? '300000'}`,
      ...(process.env.PC_AUTH_NO_DEPENDENCIES === '1' ? ['--no-deps'] : []),
  ], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PLAYWRIGHT_JSON_OUTPUT_NAME: jsonName,
      PC_GROUP_RUN_ID: `${baseRunId}-attempt-${attempt}`,
      PC_GROUP_CASE_IDS: process.env.PC_GROUP_CASE_IDS ?? '',
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  state = { ...state, childPid: child.pid ?? null, updatedAt: new Date().toISOString() };
  persist(state);

  const timer = setInterval(() => {
    const progress = latestProgress(startedAt.getTime());
    if (progress.time > lastProgressAt) {
      lastProgressAt = progress.time;
      lastProgressSource = progress.source;
    }
    const progressState = readProgressState();
    const progressToken = progressState
      ? `${progressState.runId ?? ''}:${progressState.caseId ?? ''}:${progressState.phase ?? ''}:${progressState.updatedAt ?? ''}`
      : '';
    if (progressToken && progressToken !== lastProgressToken) {
      lastProgressToken = progressToken;
      lastConsoleHeartbeatAt = Date.now();
      process.stdout.write(`[watchdog] case=${progressState?.caseId ?? 'unknown'} phase=${progressState?.phase ?? 'unknown'} at=${progressState?.updatedAt ?? new Date().toISOString()}\n`);
    } else if (Date.now() - lastConsoleHeartbeatAt >= 60_000) {
      lastConsoleHeartbeatAt = Date.now();
      process.stdout.write(`[watchdog] alive lastProgress=${new Date(lastProgressAt).toISOString()} source=${lastProgressSource}\n`);
    }
    state = {
      ...state,
      updatedAt: new Date().toISOString(),
      lastProgressAt: new Date(lastProgressAt).toISOString(),
      lastProgressSource,
    };
    persist(state);
    if (Date.now() - lastProgressAt > stallMs) {
      state = {
        ...state,
        status: 'stalled',
        updatedAt: new Date().toISOString(),
        lastProgressAt: new Date(lastProgressAt).toISOString(),
        lastProgressSource,
      };
      persist(state);
      terminateProcessTree(child.pid);
      clearInterval(timer);
      process.stderr.write(`[watchdog] stalled for ${Date.now() - lastProgressAt}ms; terminating child process\n`);
    }
  }, pollMs);

  child.on('error', reject);
  child.on('exit', (exitCode, signal) => {
    clearInterval(timer);
    const stalled = state.status === 'stalled';
    const finalState: WatchdogState = {
      ...state,
      status: stalled ? 'stalled' : exitCode === 0 ? 'passed' : 'failed',
      updatedAt: new Date().toISOString(),
      exitCode: stalled ? 124 : exitCode,
      signal,
      childPid: null,
    };
    persist(finalState);
    process.stdout.write(`[watchdog] finished status=${finalState.status} exit=${finalState.exitCode}\n`);
    resolve({ exitCode: stalled ? 124 : exitCode ?? 1, state: finalState });
  });
  });
}

export function isAuthOnlyFailure(document: unknown, progress: ProgressState | null): boolean {
  if (progress?.caseId !== '__setup__' || progress.phase !== 'failed' || !document || typeof document !== 'object') {
    return false;
  }
  let businessResultCount = 0;
  const visit = (suite: any): void => {
    for (const spec of suite.specs ?? []) {
      const hasBusinessCaseTag = (spec.tags ?? []).some((tag: string) => tag.startsWith('case-'));
      if (!hasBusinessCaseTag) continue;
      for (const test of spec.tests ?? []) businessResultCount += (test.results ?? []).length;
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of (document as { suites?: unknown[] }).suites ?? []) visit(suite);
  return businessResultCount === 0;
}

function readProgressState(): ProgressState | null {
  if (!fs.existsSync(progressPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(progressPath, 'utf8')) as ProgressState;
  } catch {
    return null;
  }
}

function readJsonDocument(): unknown | null {
  if (!fs.existsSync(jsonPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function archiveAuthAttemptJson(attempt: number): void {
  if (!fs.existsSync(jsonPath)) return;
  const extension = path.extname(jsonPath);
  const archivePath = `${jsonPath.slice(0, -extension.length)}.auth-attempt-${attempt}-${Date.now()}${extension}`;
  fs.renameSync(jsonPath, archivePath);
}

function persistProgress(value: Required<ProgressState>): void {
  const temporaryPath = `${progressPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, progressPath);
}

function resolveAuthRetryDelays(): number[] {
  const configured = process.env.PC_AUTH_RETRY_DELAYS_MS;
  if (!configured) return [5_000, 15_000, 30_000, 60_000];
  const values = configured.split(',').map((value) => Number(value.trim()));
  if (values.length < 1 || values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(`PC_AUTH_RETRY_DELAYS_MS 无效：${configured}`);
  }
  return values;
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function terminateProcessTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    return;
  }
  process.kill(pid, 'SIGTERM');
}

function latestProgress(startedAt: number): { time: number; source: string } {
  const candidates: Array<{ time: number; source: string }> = [];
  for (const candidate of [jsonPath, progressPath]) {
    const stat = safeStat(candidate);
    if (stat?.isFile()) candidates.push({ time: stat.mtimeMs, source: path.basename(candidate) });
  }
  const checkpointRoot = path.resolve(
    process.env.PC_CHECKPOINT_ROOT ?? path.join(projectRoot, 'output', 'checkpoints'),
  );
  if (fs.existsSync(checkpointRoot)) {
    for (const entry of fs.readdirSync(checkpointRoot)) {
      const filePath = path.join(checkpointRoot, entry);
      const stat = safeStat(filePath);
      if (stat?.isFile() && !entry.endsWith('.tmp')) {
        candidates.push({ time: stat.mtimeMs, source: `checkpoints/${entry}` });
      }
    }
  }
  const latest = candidates.sort((left, right) => right.time - left.time)[0];
  return latest && latest.time >= startedAt ? latest : { time: startedAt, source: 'process-started' };
}

function safeStat(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function persist(value: WatchdogState): void {
  persistAt(watchdogPath, value);
}

export function reconcileProductCenterGroupWatchdogFiles(
  directory: string,
  nowMs: number = Date.now(),
): string[] {
  if (!fs.existsSync(directory)) return [];
  const reconciled: string[] = [];
  for (const entry of fs.readdirSync(directory)) {
    if (!/^product-center-group-.*watchdog\.json$/.test(entry)) continue;
    const filePath = path.join(directory, entry);
    let state: WatchdogState;
    try {
      state = JSON.parse(fs.readFileSync(filePath, 'utf8')) as WatchdogState;
    } catch {
      continue;
    }
    if (!['running', 'auth-retrying'].includes(state.status)) continue;
    const watchdogPid = Number(state.watchdogPid);
    const hasOwnerIdentity = Number.isSafeInteger(watchdogPid) && watchdogPid > 0;
    if (hasOwnerIdentity && isProcessAlive(watchdogPid)) continue;
    const updatedAtMs = Date.parse(state.updatedAt);
    const staleLegacyState = !hasOwnerIdentity
      && Number.isFinite(updatedAtMs)
      && nowMs - updatedAtMs > Number(state.stallMs || stallMs);
    if (!hasOwnerIdentity && !staleLegacyState) continue;
    const reconciledState: WatchdogState = {
      ...state,
      status: 'interrupted',
      updatedAt: new Date(nowMs).toISOString(),
      exitCode: 130,
      signal: null,
      watchdogPid: hasOwnerIdentity ? watchdogPid : null,
      childPid: null,
      interruptionReason: hasOwnerIdentity ? 'watchdog-process-not-running' : 'legacy-running-state-stale',
    };
    persistAt(filePath, reconciledState);
    reconciled.push(filePath);
  }
  return reconciled;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function persistAt(filePath: string, value: WatchdogState): void {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const retryDelaysMs = [50, 150, 500, 1_000];
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        fs.renameSync(temporaryPath, filePath);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        const retryDelayMs = retryDelaysMs[attempt];
        if (!['EPERM', 'EACCES'].includes(code ?? '') || retryDelayMs === undefined) throw error;
        sleepSync(retryDelayMs);
      }
    }
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function sleepSync(delayMs: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
