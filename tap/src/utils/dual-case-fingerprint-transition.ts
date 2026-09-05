import type { TestEvidenceStatus } from './test-execution-state';

export type DualFingerprintTransitionReceipt = {
  caseFingerprint: string;
  semanticCaseFingerprint?: string | null;
  implementationFingerprint?: string | null;
  status: 'passed' | 'failed' | 'skipped' | 'not-run';
  evidenceStatus?: TestEvidenceStatus;
  assertionStatuses?: ReadonlyArray<'verified' | 'observed-mismatch'>;
  executionContextFingerprint?: string | null;
  cleanupEvidence?: { apiZeroResidue: boolean; uiZeroResidue: boolean } | null;
  receiptEvidenceFingerprint?: string | null;
  evidenceFileFingerprint?: string | null;
  evidencePath?: string | null;
};

export type DualFingerprintTransitionCase = {
  caseId: string;
  requiredForCutover: boolean;
  currentEffectiveCaseFingerprint: string | null;
  currentSemanticCaseFingerprint: string | null;
  currentImplementationFingerprint?: string | null;
  implementationFingerprintRequired?: boolean;
  receipts: readonly DualFingerprintTransitionReceipt[];
  /** Enforce the complete standard-receipt contract for cutover assessment. */
  strictEvidence?: boolean;
};

export type DualFingerprintTransitionCaseStatus =
  | 'eligible'
  | 'awaiting-dual-receipt'
  | 'semantic-mismatch'
  | 'implementation-mismatch'
  | 'excluded';

export type DualFingerprintTransitionAssessment = {
  cutoverReady: boolean;
  summary: Record<DualFingerprintTransitionCaseStatus, number> & {
    total: number;
    requiredForCutover: number;
  };
  cases: Array<{
    caseId: string;
    status: DualFingerprintTransitionCaseStatus;
    reason: string;
  }>;
};

export function assessDualCaseFingerprintTransition(input: {
  cases: readonly DualFingerprintTransitionCase[];
}): DualFingerprintTransitionAssessment {
  const seen = new Set<string>();
  const cases = input.cases.map((item) => {
    if (!item.caseId.trim()) throw new Error('DUAL_FINGERPRINT_CASE_ID_REQUIRED');
    if (seen.has(item.caseId)) throw new Error(`DUAL_FINGERPRINT_CASE_DUPLICATE:${item.caseId}`);
    seen.add(item.caseId);
    if (!item.requiredForCutover) {
      return { caseId: item.caseId, status: 'excluded' as const, reason: 'case-excluded-from-cutover-denominator' };
    }
    if (!item.currentEffectiveCaseFingerprint || !item.currentSemanticCaseFingerprint) {
      return { caseId: item.caseId, status: 'awaiting-dual-receipt' as const, reason: 'current-dual-fingerprint-identity-incomplete' };
    }
    const complete = item.receipts.filter((receipt) => (
      receipt.status === 'passed'
      && receipt.evidenceStatus === 'complete'
      && Array.isArray(receipt.assertionStatuses)
      && receipt.assertionStatuses.length > 0
      && receipt.assertionStatuses.every((status) => status === 'verified')
      && receipt.caseFingerprint === item.currentEffectiveCaseFingerprint
      && (!item.strictEvidence || isStrictEvidenceComplete(receipt))
    ));
    if (complete.length === 0) {
      return { caseId: item.caseId, status: 'awaiting-dual-receipt' as const, reason: 'complete-current-effective-receipt-missing' };
    }
    const semanticMatches = complete.filter((receipt) => (
      receipt.semanticCaseFingerprint === item.currentSemanticCaseFingerprint
    ));
    if (semanticMatches.length === 0) {
      const hasExplicitSemantic = complete.some((receipt) => Boolean(receipt.semanticCaseFingerprint));
      return {
        caseId: item.caseId,
        status: hasExplicitSemantic ? 'semantic-mismatch' as const : 'awaiting-dual-receipt' as const,
        reason: hasExplicitSemantic
          ? 'receipt-semantic-fingerprint-differs-from-current'
          : 'complete-receipt-does-not-carry-semantic-fingerprint',
      };
    }
    if (item.implementationFingerprintRequired === true && !item.currentImplementationFingerprint) {
      return { caseId: item.caseId, status: 'implementation-mismatch' as const, reason: 'current-implementation-fingerprint-missing' };
    }
    const implementationMatches = semanticMatches.some((receipt) => (
      item.implementationFingerprintRequired !== true
      || receipt.implementationFingerprint === item.currentImplementationFingerprint
    ));
    if (!implementationMatches) {
      return { caseId: item.caseId, status: 'implementation-mismatch' as const, reason: 'receipt-implementation-fingerprint-differs-from-current' };
    }
    return { caseId: item.caseId, status: 'eligible' as const, reason: 'complete-dual-fingerprint-receipt-matches-current-identities' };
  });
  const statuses: DualFingerprintTransitionCaseStatus[] = [
    'eligible',
    'awaiting-dual-receipt',
    'semantic-mismatch',
    'implementation-mismatch',
    'excluded',
  ];
  const statusCounts = Object.fromEntries(statuses.map((status) => [
    status,
    cases.filter((item) => item.status === status).length,
  ])) as Record<DualFingerprintTransitionCaseStatus, number>;
  const requiredForCutover = input.cases.filter((item) => item.requiredForCutover).length;
  return {
    cutoverReady: requiredForCutover > 0 && statusCounts.eligible === requiredForCutover,
    summary: { total: cases.length, requiredForCutover, ...statusCounts },
    cases,
  };
}

function isStrictEvidenceComplete(receipt: DualFingerprintTransitionReceipt): boolean {
  return Boolean(
    receipt.executionContextFingerprint
      && receipt.cleanupEvidence?.apiZeroResidue === true
      && receipt.cleanupEvidence?.uiZeroResidue === true
      && receipt.receiptEvidenceFingerprint
      && receipt.evidenceFileFingerprint
      && receipt.evidencePath,
  );
}

export function assertDualCaseFingerprintCutoverReady(
  assessment: DualFingerprintTransitionAssessment,
): void {
  if (!assessment.cutoverReady) {
    throw new Error(
      `DUAL_FINGERPRINT_CUTOVER_BLOCKED:eligible=${assessment.summary.eligible};required=${assessment.summary.requiredForCutover}`,
    );
  }
}
