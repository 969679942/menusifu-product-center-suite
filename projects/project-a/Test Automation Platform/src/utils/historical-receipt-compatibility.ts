import type { TestExecutionIndexRecord } from './test-execution-index';

export type HistoricalReceiptCompatibilityStatus =
  | 'exact-match-importable'
  | 'no-standard-receipt'
  | 'case-fingerprint-mismatch'
  | 'implementation-fingerprint-mismatch'
  | 'execution-context-mismatch'
  | 'execution-not-passed'
  | 'evidence-incomplete'
  | 'assertion-incomplete'
  | 'cleanup-incomplete'
  | 'evidence-fingerprint-incomplete';

export type HistoricalReceiptCurrentIdentity = {
  caseId: string;
  caseFingerprint: string | null;
  implementationFingerprint?: string | null;
  implementationFingerprintRequired?: boolean;
  executionContextFingerprint?: string | null;
};

export type HistoricalReceiptCompatibilityCase = {
  caseId: string;
  status: HistoricalReceiptCompatibilityStatus;
  blockers: string[];
  currentCaseFingerprint: string | null;
  currentImplementationFingerprint: string | null;
  currentExecutionContextFingerprint: string | null;
  receiptCount: number;
  completeReceiptCount: number;
  receiptCaseFingerprints: string[];
  receiptImplementationFingerprints: string[];
  receiptExecutionContextFingerprints: string[];
  evidencePaths: string[];
  importableRecordKey: string | null;
};

export type HistoricalReceiptCompatibilityReport = {
  cases: HistoricalReceiptCompatibilityCase[];
  importableRecords: TestExecutionIndexRecord[];
  summary: Record<HistoricalReceiptCompatibilityStatus, number> & { total: number };
};

export function classifyHistoricalReceiptCompatibility(input: {
  cases: readonly HistoricalReceiptCurrentIdentity[];
  receipts: readonly TestExecutionIndexRecord[];
}): HistoricalReceiptCompatibilityReport {
  const receiptsByCase = new Map<string, TestExecutionIndexRecord[]>();
  for (const receipt of input.receipts) {
    const current = receiptsByCase.get(receipt.caseId) ?? [];
    current.push(receipt);
    receiptsByCase.set(receipt.caseId, current);
  }

  const importableRecords: TestExecutionIndexRecord[] = [];
  const cases = input.cases.map((identity) => {
    const receipts = [...(receiptsByCase.get(identity.caseId) ?? [])]
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
    const completeReceipts = receipts.filter(hasCompleteReceiptEvidence);
    const businessEvidenceReceipts = receipts.filter(hasCompleteBusinessEvidence);
    const rawCaseMatches = receipts.filter((receipt) => (
      Boolean(identity.caseFingerprint) && receipt.caseFingerprint === identity.caseFingerprint
    ));
    const caseMatches = businessEvidenceReceipts.filter((receipt) => (
      Boolean(identity.caseFingerprint) && receipt.caseFingerprint === identity.caseFingerprint
    ));
    const implementationMatches = caseMatches.filter((receipt) => (
      identity.implementationFingerprintRequired !== true
      || !identity.implementationFingerprint
      || receipt.implementationFingerprint === identity.implementationFingerprint
    ));
    const contextMatches = implementationMatches.filter((receipt) => (
      Boolean(receipt.executionContextFingerprint)
      && (!identity.executionContextFingerprint
        || receipt.executionContextFingerprint === identity.executionContextFingerprint)
    ));
    const exact = contextMatches.find(hasCompleteReceiptEvidence) ?? null;
    if (exact) importableRecords.push(exact);

    const status = resolveStatus({
      identity,
      receipts,
      businessEvidenceReceipts,
      rawCaseMatches,
      caseMatches,
      implementationMatches,
      contextMatches,
      exact,
    });
    return {
      caseId: identity.caseId,
      status,
      blockers: resolveBlockers(status, identity),
      currentCaseFingerprint: identity.caseFingerprint,
      currentImplementationFingerprint: identity.implementationFingerprint ?? null,
      currentExecutionContextFingerprint: identity.executionContextFingerprint ?? null,
      receiptCount: receipts.length,
      completeReceiptCount: completeReceipts.length,
      receiptCaseFingerprints: unique(receipts.map((receipt) => receipt.caseFingerprint)),
      receiptImplementationFingerprints: unique(receipts.map((receipt) => receipt.implementationFingerprint)),
      receiptExecutionContextFingerprints: unique(receipts.map((receipt) => receipt.executionContextFingerprint)),
      evidencePaths: unique(receipts.map((receipt) => receipt.evidencePath)),
      importableRecordKey: exact ? recordKey(exact) : null,
    } satisfies HistoricalReceiptCompatibilityCase;
  }).sort((left, right) => left.caseId.localeCompare(right.caseId));

  const statuses: HistoricalReceiptCompatibilityStatus[] = [
    'exact-match-importable',
    'no-standard-receipt',
    'case-fingerprint-mismatch',
    'implementation-fingerprint-mismatch',
    'execution-context-mismatch',
    'execution-not-passed',
    'evidence-incomplete',
    'assertion-incomplete',
    'cleanup-incomplete',
    'evidence-fingerprint-incomplete',
  ];
  const summary = Object.fromEntries(statuses.map((status) => [
    status,
    cases.filter((item) => item.status === status).length,
  ])) as Record<HistoricalReceiptCompatibilityStatus, number>;
  return { cases, importableRecords, summary: { total: cases.length, ...summary } };
}

function resolveStatus(input: {
  identity: HistoricalReceiptCurrentIdentity;
  receipts: readonly TestExecutionIndexRecord[];
  businessEvidenceReceipts: readonly TestExecutionIndexRecord[];
  rawCaseMatches: readonly TestExecutionIndexRecord[];
  caseMatches: readonly TestExecutionIndexRecord[];
  implementationMatches: readonly TestExecutionIndexRecord[];
  contextMatches: readonly TestExecutionIndexRecord[];
  exact: TestExecutionIndexRecord | null;
}): HistoricalReceiptCompatibilityStatus {
  if (input.exact) return 'exact-match-importable';
  if (input.receipts.length === 0) return 'no-standard-receipt';
  if (!input.identity.caseFingerprint) return 'case-fingerprint-mismatch';
  if (input.businessEvidenceReceipts.length > 0 && input.caseMatches.length === 0) {
    return 'case-fingerprint-mismatch';
  }
  if (input.rawCaseMatches.length === 0) return 'case-fingerprint-mismatch';
  if (input.businessEvidenceReceipts.length === 0) {
    if (!input.rawCaseMatches.some((receipt) => receipt.status === 'passed')) return 'execution-not-passed';
    const passed = input.rawCaseMatches.filter((receipt) => receipt.status === 'passed');
    if (!passed.some((receipt) => receipt.evidenceStatus === 'complete')) return 'evidence-incomplete';
    const complete = passed.filter((receipt) => receipt.evidenceStatus === 'complete');
    if (!complete.some(hasVerifiedAssertions)) return 'assertion-incomplete';
    const asserted = complete.filter(hasVerifiedAssertions);
    if (!asserted.some(hasCompleteCleanup)) return 'cleanup-incomplete';
    return 'evidence-fingerprint-incomplete';
  }
  if (input.implementationMatches.length === 0) return 'implementation-fingerprint-mismatch';
  if (input.contextMatches.length === 0) return 'execution-context-mismatch';
  if (!input.contextMatches.some((receipt) => receipt.status === 'passed')) return 'execution-not-passed';
  const passed = input.contextMatches.filter((receipt) => receipt.status === 'passed');
  if (!passed.some((receipt) => receipt.evidenceStatus === 'complete')) return 'evidence-incomplete';
  const complete = passed.filter((receipt) => receipt.evidenceStatus === 'complete');
  if (!complete.some(hasVerifiedAssertions)) return 'assertion-incomplete';
  const asserted = complete.filter(hasVerifiedAssertions);
  if (!asserted.some(hasCompleteCleanup)) return 'cleanup-incomplete';
  return 'evidence-fingerprint-incomplete';
}

function hasCompleteReceiptEvidence(receipt: TestExecutionIndexRecord): boolean {
  return hasCompleteBusinessEvidence(receipt)
    && Boolean(receipt.executionContextFingerprint);
}

function hasCompleteBusinessEvidence(receipt: TestExecutionIndexRecord): boolean {
  return receipt.status === 'passed'
    && receipt.evidenceStatus === 'complete'
    && hasVerifiedAssertions(receipt)
    && hasCompleteCleanup(receipt)
    && Boolean(receipt.receiptEvidenceFingerprint)
    && Boolean(receipt.evidenceFileFingerprint);
}

function hasVerifiedAssertions(receipt: TestExecutionIndexRecord): boolean {
  return Array.isArray(receipt.assertionStatuses)
    && receipt.assertionStatuses.length > 0
    && receipt.assertionStatuses.every((status) => status === 'verified');
}

function hasCompleteCleanup(receipt: TestExecutionIndexRecord): boolean {
  return receipt.cleanupEvidence?.apiZeroResidue === true
    && receipt.cleanupEvidence.uiZeroResidue === true;
}

function resolveBlockers(
  status: HistoricalReceiptCompatibilityStatus,
  identity: HistoricalReceiptCurrentIdentity,
): string[] {
  if (status === 'exact-match-importable') return [];
  if (status === 'case-fingerprint-mismatch') {
    return [identity.caseFingerprint ? 'CASE_FINGERPRINT_MISMATCH' : 'CURRENT_CASE_FINGERPRINT_MISSING'];
  }
  return [status.replaceAll('-', '_').toUpperCase()];
}

function unique(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function recordKey(record: TestExecutionIndexRecord): string {
  return [record.caseId, record.caseFingerprint, record.executionEpochId].join(':');
}
