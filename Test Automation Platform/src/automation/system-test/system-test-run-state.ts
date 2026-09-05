import fs from 'node:fs';
import path from 'node:path';

export type SystemTestRunState = {
  schemaVersion: '1.0.0';
  runId: string;
  systemId: string;
  status: 'running' | 'passed' | 'blocked' | 'failed' | 'circuit-broken' | 'interrupted';
  phase: 'compiling' | 'setup' | 'preflight' | 'business' | 'recovery' | 'reporting' | 'completed';
  startedAt: string;
  updatedAt: string;
  runnerPid: number | null;
  childPid: number | null;
  exitCode: number | null;
  interruptionReason: string | null;
};

export function writeSystemTestRunState(filePath: string, state: SystemTestRunState): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

export function reconcileSystemTestRunState(filePath: string, nowMs: number = Date.now()): SystemTestRunState | null {
  if (!fs.existsSync(filePath)) return null;
  let state: SystemTestRunState;
  try {
    state = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SystemTestRunState;
  } catch {
    return null;
  }
  if (state.status !== 'running') return state;
  const runnerPid = Number(state.runnerPid);
  if (Number.isSafeInteger(runnerPid) && runnerPid > 0 && isProcessAlive(runnerPid)) return state;
  const interrupted: SystemTestRunState = {
    ...state,
    status: 'interrupted',
    phase: 'completed',
    updatedAt: new Date(nowMs).toISOString(),
    childPid: null,
    exitCode: 130,
    interruptionReason: 'runner-process-not-running',
  };
  writeSystemTestRunState(filePath, interrupted);
  return interrupted;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
