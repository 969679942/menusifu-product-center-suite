export type SystemTestReportFreshnessStatus = 'current' | 'stale' | 'unknown';

export type SystemTestReportCaseReceipt = {
  caseId: string;
  caseFingerprint: string | null;
  implementationFingerprint: string | null;
  receiptFingerprint: string | null;
};

export type SystemTestCurrentReceipt = SystemTestReportCaseReceipt & {
  recordedAt: string;
};

export type SystemTestReportCandidate = {
  applicationId: string;
  scope: string;
  artifactId: string;
  generatedAt: string;
  authorityPath: string;
  cases: readonly SystemTestReportCaseReceipt[];
  summary: Readonly<Record<string, number>>;
};

export type SystemTestReportFreshnessInput = {
  applicationId: string;
  scope: string;
  expectedCaseIds: readonly string[];
  candidates: readonly SystemTestReportCandidate[];
  currentReceipts: readonly SystemTestCurrentReceipt[];
};

export type SystemTestReportFreshnessResult = {
  status: SystemTestReportFreshnessStatus;
  applicationId: string;
  scope: string;
  artifactId: string | null;
  asOf: string | null;
  authorityPath: string | null;
  reasons: string[];
  supersededArtifacts: string[];
  summary: Readonly<Record<string, number>> | null;
};

function requireIdentity(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function sameFingerprint(
  report: SystemTestReportCaseReceipt,
  current: SystemTestCurrentReceipt,
): boolean {
  return Boolean(report.caseFingerprint
    && report.implementationFingerprint
    && report.receiptFingerprint
    && report.caseFingerprint === current.caseFingerprint
    && report.implementationFingerprint === current.implementationFingerprint
    && report.receiptFingerprint === current.receiptFingerprint);
}

export function arbitrateSystemTestReportFreshness(
  input: SystemTestReportFreshnessInput,
): SystemTestReportFreshnessResult {
  const applicationId = requireIdentity(input.applicationId, 'CURRENT_REPORT_APPLICATION_ID_REQUIRED');
  const scope = requireIdentity(input.scope, 'CURRENT_REPORT_SCOPE_REQUIRED');
  const scopedCandidates = input.candidates.filter((candidate) => (
    candidate.applicationId === applicationId && candidate.scope === scope
  ));
  const validCandidates = scopedCandidates
    .filter((candidate) => timestamp(candidate.generatedAt) !== null)
    .sort((left, right) => timestamp(left.generatedAt)! - timestamp(right.generatedAt)!);
  const candidate = validCandidates.at(-1) ?? null;
  const supersededArtifacts = scopedCandidates
    .filter((item) => item !== candidate)
    .map((item) => item.artifactId)
    .sort();

  if (!candidate) {
    return {
      status: 'unknown',
      applicationId,
      scope,
      artifactId: null,
      asOf: null,
      authorityPath: null,
      reasons: scopedCandidates.length > 0
        ? ['REPORT_GENERATED_AT_INVALID']
        : ['REPORT_SCOPE_NOT_FOUND'],
      supersededArtifacts,
      summary: null,
    };
  }

  const staleReasons = new Set<string>();
  const unknownReasons = new Set<string>();
  const expectedCaseIds = [...new Set(input.expectedCaseIds)].sort();
  const reportCaseIds = candidate.cases.map((item) => item.caseId);
  if (duplicates(input.expectedCaseIds).length > 0) unknownReasons.add('EXPECTED_SCOPE_CASE_ID_DUPLICATED');
  if (duplicates(reportCaseIds).length > 0) staleReasons.add('REPORT_CASE_ID_DUPLICATED');
  const reportCaseIdSet = new Set(reportCaseIds);
  if (expectedCaseIds.some((caseId) => !reportCaseIdSet.has(caseId))) staleReasons.add('REPORT_SCOPE_CASE_MISSING');
  if (reportCaseIds.some((caseId) => !expectedCaseIds.includes(caseId))) staleReasons.add('REPORT_SCOPE_CASE_UNEXPECTED');

  const reportGeneratedAt = timestamp(candidate.generatedAt)!;
  for (const reportCase of candidate.cases) {
    if (!reportCase.caseFingerprint || !reportCase.implementationFingerprint || !reportCase.receiptFingerprint) {
      staleReasons.add('REPORT_RECEIPT_FINGERPRINT_INCOMPLETE');
      continue;
    }
    const matchingReceipts = input.currentReceipts
      .filter((receipt) => receipt.caseId === reportCase.caseId)
      .map((receipt) => ({ receipt, recordedAt: timestamp(receipt.recordedAt) }))
      .filter((entry): entry is { receipt: SystemTestCurrentReceipt; recordedAt: number } => entry.recordedAt !== null)
      .sort((left, right) => left.recordedAt - right.recordedAt);
    const latest = matchingReceipts.at(-1);
    if (!latest) {
      unknownReasons.add('CURRENT_RECEIPT_MISSING');
      continue;
    }
    if (latest.recordedAt > reportGeneratedAt) staleReasons.add('CURRENT_RECEIPT_NEWER_THAN_REPORT');
    if (!sameFingerprint(reportCase, latest.receipt)) staleReasons.add('CURRENT_RECEIPT_FINGERPRINT_MISMATCH');
  }

  const status: SystemTestReportFreshnessStatus = staleReasons.size > 0
    ? 'stale'
    : unknownReasons.size > 0 ? 'unknown' : 'current';
  return {
    status,
    applicationId,
    scope,
    artifactId: candidate.artifactId,
    asOf: candidate.generatedAt,
    authorityPath: status === 'current' ? candidate.authorityPath : null,
    reasons: [...staleReasons, ...unknownReasons].sort(),
    supersededArtifacts,
    summary: status === 'current' ? { ...candidate.summary } : null,
  };
}
