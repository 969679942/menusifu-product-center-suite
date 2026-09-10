import { accountExecutionAttempts, type ExecutionAttempt } from '../../src/governance/execution-attempt-accounting';
import { fingerprintExecutionSelection } from '../../src/governance/execution-intent';
import { registerEvidenceInvocation, claimEvidenceInvocation } from '../../src/governance/run-evidence-index';

export function syntheticAttempt(caseId: string, startMs: number, durationMs: number | null,
  status: ExecutionAttempt['status'] = 'passed', retry = 0): ExecutionAttempt {
  return { runId: 'run-1', caseId, testId: `test-${caseId}`, retry, status, startedAt: new Date(startMs).toISOString(), durationMs,
    ...(status === 'running' ? {} : { receipt: { caseId, playwrightStatus: status, evidence: { status: status === 'passed' ? 'complete' : 'incomplete' } } }) };
}

export function indexedInvocationFixture(root: string, selectedCaseIds: string[], attempts: ExecutionAttempt[], final = true) {
  const identity = { runId: 'run-1', selectedCaseIds, contractFingerprint: '1'.repeat(64),
    implementationFingerprint: '2'.repeat(64), executionCandidateFingerprint: '3'.repeat(64) };
  const entry = registerEvidenceInvocation(root, identity);
  const owner = claimEvidenceInvocation(root, entry.invocationId, identity);
  const { latestAttempts: _latest, terminalAttempts, ...executionAccounting } = accountExecutionAttempts({ runId: 'run-1', selectedCaseIds, attempts });
  const cases = terminalAttempts.flatMap((item) => item.receipt ? [item.receipt] : []);
  const complete = cases.filter((item) => item.playwrightStatus === 'passed').length;
  const ledger = { schemaVersion: '1.2.0', ...identity, invocationId: entry.invocationId,
    selectedFingerprint: fingerprintExecutionSelection(selectedCaseIds), attempts, cases, executionAccounting,
    summary: { selected: selectedCaseIds.length, executed: executionAccounting.executedCaseIds.length,
      evidenceComplete: complete, evidenceIncomplete: executionAccounting.executedCaseIds.length - complete } };
  owner.publish(ledger, final);
  return { entry, identity, owner, ledger };
}
