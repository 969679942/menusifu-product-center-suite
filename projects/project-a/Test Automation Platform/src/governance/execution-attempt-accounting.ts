import { fingerprintExecutionSelection } from './execution-intent';

export type ExecutionAttempt = {
  runId: string;
  caseId: string;
  testId: string;
  retry: number;
  status: 'running' | 'passed' | 'failed' | 'timedOut' | 'interrupted' | 'skipped';
  startedAt: string;
  durationMs: number | null;
  receipt?: Record<string, unknown>;
};
const key = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const terminal = new Set(['passed', 'failed', 'timedOut', 'interrupted']);

/** Counts observations, never grants business pass. Latest retry is authoritative even when unfinished/skipped. */
export function accountExecutionAttempts(input: { runId: string; selectedCaseIds: readonly string[]; attempts: readonly ExecutionAttempt[] }) {
  const reasons = new Set<string>();
  const selected = Array.isArray(input.selectedCaseIds) ? input.selectedCaseIds : [];
  if (!key(input.runId) || !Array.isArray(selected) || !selected.length || !selected.every(key)
    || new Set(selected).size !== selected.length) reasons.add('ATTEMPT_SELECTION_INVALID');
  if (!Array.isArray(input.attempts) || !input.attempts.every((item) => object(item) && item.runId === input.runId
    && key(item.caseId) && selected.includes(item.caseId) && key(item.testId)
    && typeof item.retry === 'number' && Number.isSafeInteger(item.retry) && item.retry >= 0
    && typeof item.status === 'string' && ['running', 'passed', 'failed', 'timedOut', 'interrupted', 'skipped'].includes(item.status)
    && typeof item.startedAt === 'string' && Number.isFinite(Date.parse(item.startedAt))
    && (item.status === 'running' ? item.durationMs === null : typeof item.durationMs === 'number'
      && Number.isFinite(item.durationMs) && item.durationMs >= 0
      && Number.isFinite(Date.parse(item.startedAt) + item.durationMs)))) reasons.add('ATTEMPT_OBSERVATION_INVALID');
  const empty = { latestAttempts: [] as ExecutionAttempt[], terminalAttempts: [] as ExecutionAttempt[],
    actualAttemptCount: null as number | null, registrationResultCount: null as number | null,
    executedCaseIds: [] as string[], terminalCaseIds: [] as string[], skippedCaseIds: [] as string[],
    incompleteCaseIds: Array.isArray(selected) ? [...selected] : [],
    testAttemptWorkMs: null as number | null, testAttemptWallMs: null as number | null };
  if (reasons.size) return { ...empty, status: 'invalid' as const, reasons: [...reasons].sort() };
  const latestAttempts: ExecutionAttempt[] = [];
  for (const caseId of selected) {
    const attempts = input.attempts.filter((item) => item.caseId === caseId).sort((a, b) => a.retry - b.retry);
    if (!attempts.length) continue;
    if (new Set(attempts.map((item) => item.testId)).size !== 1) reasons.add('ATTEMPT_TEST_ID_AMBIGUOUS');
    if (attempts.some((item, index) => item.retry !== index)) reasons.add('ATTEMPT_RETRY_SEQUENCE_INVALID');
    latestAttempts.push(attempts.at(-1)!);
  }
  if (reasons.size) return { ...empty, status: 'invalid' as const, reasons: [...reasons].sort() };
  const actual = input.attempts.filter((item) => item.status !== 'skipped');
  const executedCaseIds = selected.filter((caseId) => actual.some((item) => item.caseId === caseId));
  const terminalAttempts = latestAttempts.filter((item) => terminal.has(item.status));
  const terminalCaseIds = terminalAttempts.map((item) => item.caseId);
  const timingComplete = actual.every((item) => item.durationMs !== null);
  const intervals = actual.map((item) => [Date.parse(item.startedAt), Date.parse(item.startedAt) + (item.durationMs ?? 0)]).sort((a, b) => a[0] - b[0]);
  let wall = 0;
  let end = -Infinity;
  for (const [start, finish] of intervals) { wall += Math.max(0, finish - Math.max(start, end)); end = Math.max(end, finish); }
  const work = actual.reduce((sum, item) => sum + (item.durationMs ?? 0), 0);
  return { status: 'valid' as const, reasons: [], latestAttempts, terminalAttempts,
    actualAttemptCount: actual.length, registrationResultCount: input.attempts.filter((item) => item.status !== 'running').length,
    executedCaseIds, terminalCaseIds, skippedCaseIds: latestAttempts.filter((item) => item.status === 'skipped').map((item) => item.caseId),
    incompleteCaseIds: selected.filter((caseId) => !terminalCaseIds.includes(caseId)),
    testAttemptWorkMs: timingComplete && Number.isFinite(work) ? work : null,
    testAttemptWallMs: timingComplete && Number.isFinite(wall) ? wall : null };
}

/** Recompute the saved projection before a runner, adapter or importer consumes it. */
export function verifyExecutionAttemptLedger(runId: string, selectedCaseIds: readonly string[], value: unknown) {
  const ledger = object(value) ? value : {};
  const accounting = accountExecutionAttempts({ runId, selectedCaseIds, attempts: ledger.attempts as ExecutionAttempt[] });
  const reasons = new Set(accounting.reasons);
  const cases = accounting.terminalAttempts.flatMap((item) => item.receipt ? [item.receipt] : []);
  const { latestAttempts: _latest, terminalAttempts: _terminal, ...storedAccounting } = accounting;
  const complete = cases.filter((item) => item.playwrightStatus === 'passed' && object(item.evidence) && item.evidence.status === 'complete').length;
  const summary = { selected: selectedCaseIds.length, executed: accounting.status === 'valid' ? accounting.executedCaseIds.length : null,
    evidenceComplete: complete, evidenceIncomplete: accounting.status === 'valid' ? accounting.executedCaseIds.length - complete : null };
  if (!['1.1.0', '1.2.0'].includes(String(ledger.schemaVersion)) || ledger.runId !== runId
    || JSON.stringify(ledger.selectedCaseIds) !== JSON.stringify(selectedCaseIds)
    || ledger.selectedFingerprint !== fingerprintExecutionSelection([...selectedCaseIds])) reasons.add('ATTEMPT_LEDGER_IDENTITY_MISMATCH');
  if (accounting.terminalAttempts.some((item) => !item.receipt || item.receipt.caseId !== item.caseId || item.receipt.playwrightStatus !== item.status)) reasons.add('ATTEMPT_RECEIPT_IDENTITY_MISMATCH');
  if (JSON.stringify(ledger.cases) !== JSON.stringify(cases) || JSON.stringify(ledger.summary) !== JSON.stringify(summary)
    || JSON.stringify(ledger.executionAccounting) !== JSON.stringify(storedAccounting)) reasons.add('ATTEMPT_LEDGER_PROJECTION_MISMATCH');
  return { valid: reasons.size === 0, reasons: [...reasons].sort(), accounting, cases };
}
