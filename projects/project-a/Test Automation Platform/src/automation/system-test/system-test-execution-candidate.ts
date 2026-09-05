import { fingerprintSystemTestValue } from './system-test-contract';

export type SystemTestExecutionCandidate = {
  schemaVersion: '1.0.0';
  applicationId: string;
  runId: string;
  selectedCaseIds: string[];
  caseFingerprints: Record<string, string>;
  implementationFingerprints: Record<string, string>;
  contextFingerprint: string;
  fingerprint: string;
};

export function buildSystemTestExecutionCandidate(input: Omit<SystemTestExecutionCandidate, 'schemaVersion' | 'fingerprint'>): SystemTestExecutionCandidate {
  const normalized = {
    schemaVersion: '1.0.0' as const,
    applicationId: input.applicationId.trim(),
    runId: input.runId.trim(),
    selectedCaseIds: [...new Set(input.selectedCaseIds.map((item) => item.trim()).filter(Boolean))].sort(),
    caseFingerprints: sortRecord(input.caseFingerprints),
    implementationFingerprints: sortRecord(input.implementationFingerprints),
    contextFingerprint: input.contextFingerprint.trim(),
  };
  if (!normalized.applicationId || !normalized.runId || normalized.selectedCaseIds.length === 0
    || !normalized.contextFingerprint
    || normalized.selectedCaseIds.some((caseId) => !normalized.caseFingerprints[caseId]
      || !normalized.implementationFingerprints[caseId])) {
    throw new Error('EXECUTION_CANDIDATE_INCOMPLETE');
  }
  return { ...normalized, fingerprint: fingerprintSystemTestValue(normalized) };
}

export function assertSystemTestExecutionCandidateUnchanged(
  frozen: SystemTestExecutionCandidate,
  current: SystemTestExecutionCandidate,
): void {
  if (frozen.fingerprint !== current.fingerprint) {
    throw new Error(`EXECUTION_CANDIDATE_DRIFT:${frozen.fingerprint}:${current.fingerprint}`);
  }
}

function sortRecord(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}
