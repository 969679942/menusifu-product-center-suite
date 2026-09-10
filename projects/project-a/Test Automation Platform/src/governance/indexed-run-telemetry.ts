import { readIndexedRunEvidence } from './run-evidence-index';
import { verifyExecutionAttemptLedger, type ExecutionAttempt } from './execution-attempt-accounting';
import { fingerprintExecutionSelection } from './execution-intent';

type Counts = {
  actualAttemptCount: number | null; registrationResultCount: number | null; uniqueExecutedCaseCount: number | null;
  testAttemptWorkMs: number | null; testAttemptWallMs: number | null; averageTestAttemptDurationMs: number | null;
};
const unavailableCounts = (): Counts => ({ actualAttemptCount: null, registrationResultCount: null, uniqueExecutedCaseCount: null,
  testAttemptWorkMs: null, testAttemptWallMs: null, averageTestAttemptDurationMs: null });
const unique = (values: string[]) => [...new Set(values)].sort();

/** Telemetry only. Every observed attempt identity includes its invocation; retries restarting at zero are distinct. */
export function summarizeIndexedRunTelemetry(runRoot: string, runId: string, expectedInvocationId?: string) {
  const base = { schemaVersion: '1.0.0', scope: 'indexed-reporter-invocation-observations', runId, businessPassAuthorized: false,
    runnerWallMs: null, nonRunnerOverheadMs: null };
  const indexed = readIndexedRunEvidence(runRoot, runId, expectedInvocationId);
  if (indexed.status !== 'available') return { ...base, coverageStatus: 'unavailable' as const, reasons: [indexed.reason],
    currentInvocation: null, historySelectedCaseIds: null, historySelectionFingerprint: null, indexedSelectedCaseIds: null, invocations: [],
    observedExecutedCaseIds: null, observed: unavailableCounts(), totals: unavailableCounts() };
  const reasons: string[] = [];
  if (indexed.preIndexHistory.status !== 'none') reasons.push('UNINDEXED_RUN_HISTORY');
  const attempts: ExecutionAttempt[] = [];
  const invocations = indexed.history.map((item) => {
    if (!item.ledger) {
      reasons.push('HISTORICAL_INVOCATION_REPORT_MISSING');
      return { invocationId: item.invocationId, ledgerHash: null, final: null, selectedCaseIds: item.selectedCaseIds,
        selectionFingerprint: fingerprintExecutionSelection(item.selectedCaseIds), actualAttemptCount: null, registrationResultCount: null };
    }
    if (!item.final) reasons.push('INVOCATION_NOT_FINAL');
    const projection = verifyExecutionAttemptLedger(runId, item.selectedCaseIds, item.ledger);
    // readIndexedRunEvidence has already verified this against the independent declaration.
    attempts.push(...item.ledger.attempts as ExecutionAttempt[]);
    return { invocationId: item.invocationId, ledgerHash: item.ledgerHash, final: item.final, selectedCaseIds: item.selectedCaseIds,
      selectionFingerprint: fingerprintExecutionSelection(item.selectedCaseIds),
      actualAttemptCount: projection.accounting.actualAttemptCount, registrationResultCount: projection.accounting.registrationResultCount };
  });
  const actual = attempts.filter((item) => item.status !== 'skipped');
  const observedExecutedCaseIds = unique(actual.map((item) => item.caseId));
  const timingComplete = actual.every((item) => item.durationMs !== null);
  const intervals = actual.map((item) => [Date.parse(item.startedAt), Date.parse(item.startedAt) + (item.durationMs ?? 0)])
    .sort((left, right) => left[0] - right[0]);
  let wall = 0; let end = -Infinity;
  for (const [start, finish] of intervals) { wall += Math.max(0, finish - Math.max(start, end)); end = Math.max(end, finish); }
  const work = actual.reduce((total, item) => total + (item.durationMs ?? 0), 0);
  const observed: Counts = { actualAttemptCount: actual.length, registrationResultCount: attempts.filter((item) => item.status !== 'running').length,
    uniqueExecutedCaseCount: observedExecutedCaseIds.length, testAttemptWorkMs: timingComplete && Number.isFinite(work) ? work : null,
    testAttemptWallMs: timingComplete && Number.isFinite(wall) ? wall : null,
    averageTestAttemptDurationMs: timingComplete && actual.length > 0 && Number.isFinite(work) ? work / actual.length : null };
  const historySelectedCaseIds = unique(indexed.history.flatMap((item) => item.selectedCaseIds));
  const current = indexed.history.at(-1)!;
  const currentProjection = verifyExecutionAttemptLedger(runId, current.selectedCaseIds, indexed.ledger);
  const coverageComplete = reasons.length === 0;
  return { ...base, coverageStatus: coverageComplete ? 'complete' as const : 'partial' as const, reasons: unique(reasons),
    currentInvocation: { invocationId: indexed.invocationId, ledgerHash: indexed.ledgerHash, final: indexed.final,
      selectedCaseIds: current.selectedCaseIds, selectionFingerprint: fingerprintExecutionSelection(current.selectedCaseIds),
      terminalCaseIds: currentProjection.accounting.terminalCaseIds, skippedCaseIds: currentProjection.accounting.skippedCaseIds,
      incompleteCaseIds: currentProjection.accounting.incompleteCaseIds },
    historySelectedCaseIds: indexed.preIndexHistory.status === 'none' ? historySelectedCaseIds : null,
    historySelectionFingerprint: indexed.preIndexHistory.status === 'none' ? fingerprintExecutionSelection(historySelectedCaseIds) : null,
    indexedSelectedCaseIds: historySelectedCaseIds, invocations,
    preIndexHistory: indexed.preIndexHistory,
    observedExecutedCaseIds, observed, totals: coverageComplete ? observed : unavailableCounts() };
}
