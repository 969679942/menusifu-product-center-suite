import { createHash } from 'node:crypto';
import type { SystemTestReferenceBaselineEvidence } from './system-test-platform-readiness';

export type SystemTestResponsibilityClass =
  | 'passed'
  | 'deferred'
  | 'not-applicable'
  | 'product-defect'
  | 'source-blocked'
  | 'technical-blocked'
  | 'environment-blocked'
  | 'handled'
  | 'revalidation-required'
  | 'invalid';

export type SystemTestReferenceCase = {
  caseId: string;
  state: string;
  responsibilityClass?: SystemTestResponsibilityClass | null;
  caseFingerprint?: string | null;
};

export type SystemTestReferenceReceipt = {
  caseId: string;
  caseFingerprint: string;
  status: string;
  evidenceStatus: string;
  cleanupEvidence: { apiZeroResidue: boolean; uiZeroResidue: boolean } | null;
  receiptEvidenceFingerprint: string | null;
  evidenceFileFingerprint: string | null;
  recordedAt: string;
};

export type SystemTestReferenceBaselineResult = {
  baseline: SystemTestReferenceBaselineEvidence;
  verifiedCaseIds: string[];
  missingEvidenceCaseIds: string[];
};

export function buildSystemTestReferenceBaseline(input: {
  applicationId: string;
  businessDomainId: string;
  cases: readonly SystemTestReferenceCase[];
  receipts: readonly SystemTestReferenceReceipt[];
}): SystemTestReferenceBaselineResult {
  const caseIds = new Set<string>();
  for (const item of input.cases) {
    if (!item.caseId?.trim()) throw new Error('REFERENCE_BASELINE_CASE_ID_REQUIRED');
    if (caseIds.has(item.caseId)) throw new Error(`REFERENCE_BASELINE_DUPLICATE_CASE:${item.caseId}`);
    caseIds.add(item.caseId);
  }
  for (const receipt of input.receipts) {
    if (!caseIds.has(receipt.caseId)) throw new Error(`REFERENCE_BASELINE_ORPHAN_RECEIPT:${receipt.caseId}`);
    if (!receipt.caseFingerprint?.trim()) throw new Error(`REFERENCE_BASELINE_RECEIPT_FINGERPRINT_REQUIRED:${receipt.caseId}`);
    if (!receipt.recordedAt || Number.isNaN(Date.parse(receipt.recordedAt))) {
      throw new Error(`REFERENCE_BASELINE_RECEIPT_TIMESTAMP_INVALID:${receipt.caseId}`);
    }
  }
  const receiptsByCase = new Map<string, SystemTestReferenceReceipt[]>();
  for (const receipt of input.receipts) {
    const records = receiptsByCase.get(receipt.caseId) ?? [];
    records.push(receipt);
    receiptsByCase.set(receipt.caseId, records);
  }
  const responsibilityBreakdown: Record<SystemTestResponsibilityClass | 'unclassified', number> = {
    passed: 0,
    deferred: 0,
    'not-applicable': 0,
    'product-defect': 0,
    'source-blocked': 0,
    'technical-blocked': 0,
    'environment-blocked': 0,
    handled: 0,
    'revalidation-required': 0,
    invalid: 0,
    unclassified: 0,
  };
  const verified: Array<{ caseId: string; caseFingerprint: string; receiptFingerprint: string; fileFingerprint: string }> = [];
  const missingEvidenceCaseIds: string[] = [];
  let passed = 0;
  let failed = 0;
  let classifiedExclusions = 0;
  let classifiedBlockers = 0;
  let automationGap = 0;

  for (const item of input.cases) {
    const responsibility = resolveResponsibility(item);
    responsibilityBreakdown[responsibility] += 1;
    if (responsibility === 'passed') {
      passed += 1;
      const receipt = selectBestReceipt(item, receiptsByCase.get(item.caseId) ?? []);
      if (isMatchingCompleteReceipt(item, receipt)) {
        verified.push({
          caseId: item.caseId,
          caseFingerprint: item.caseFingerprint!,
          receiptFingerprint: receipt.receiptEvidenceFingerprint!,
          fileFingerprint: receipt.evidenceFileFingerprint!,
        });
      } else {
        missingEvidenceCaseIds.push(item.caseId);
      }
    } else if (responsibility === 'product-defect') {
      failed += 1;
    } else if (responsibility === 'deferred' || responsibility === 'not-applicable' || responsibility === 'handled') {
      classifiedExclusions += 1;
    } else if (responsibility === 'unclassified') {
      automationGap += 1;
    } else {
      classifiedBlockers += 1;
    }
  }

  const executionEligible = passed + failed;
  const evidenceCoverageFingerprint = createHash('sha256')
    .update(JSON.stringify(verified.sort((left, right) => left.caseId.localeCompare(right.caseId))))
    .digest('hex');
  const baseline: SystemTestReferenceBaselineEvidence = {
    applicationId: input.applicationId,
    businessDomainId: input.businessDomainId,
    planned: input.cases.length,
    executionEligible,
    classifiedExclusions,
    classifiedBlockers,
    executed: executionEligible,
    passed,
    failed,
    automationGap,
    evidenceVerified: verified.length,
    evidenceMissing: missingEvidenceCaseIds.length,
    evidenceCoverageFingerprint,
    responsibilityBreakdown,
    responsibilityClassified: automationGap === 0,
    apiUiZeroResidue: missingEvidenceCaseIds.length === 0,
  };
  return {
    baseline,
    verifiedCaseIds: verified.map((item) => item.caseId).sort(),
    missingEvidenceCaseIds: missingEvidenceCaseIds.sort(),
  };
}

function selectBestReceipt(
  item: SystemTestReferenceCase,
  receipts: readonly SystemTestReferenceReceipt[],
): SystemTestReferenceReceipt | undefined {
  return [...receipts]
    .filter((receipt) => !item.caseFingerprint || receipt.caseFingerprint === item.caseFingerprint)
    .sort((left, right) => compareReceiptQuality(left, right))
    .at(-1);
}

function compareReceiptQuality(left: SystemTestReferenceReceipt, right: SystemTestReferenceReceipt): number {
  const recordedAtOrder = left.recordedAt.localeCompare(right.recordedAt);
  if (recordedAtOrder !== 0) return recordedAtOrder;
  return receiptQuality(left) - receiptQuality(right);
}

function receiptQuality(receipt: SystemTestReferenceReceipt): number {
  return Number(receipt.status === 'passed')
    + Number(receipt.evidenceStatus === 'complete')
    + Number(receipt.cleanupEvidence?.apiZeroResidue === true)
    + Number(receipt.cleanupEvidence?.uiZeroResidue === true)
    + Number(Boolean(receipt.receiptEvidenceFingerprint))
    + Number(Boolean(receipt.evidenceFileFingerprint));
}

function resolveResponsibility(item: SystemTestReferenceCase): SystemTestResponsibilityClass | 'unclassified' {
  if (item.responsibilityClass) return item.responsibilityClass;
  if (item.state === 'evidence-passed') return 'passed';
  if (item.state === 'handled') return 'handled';
  if (item.state === 'deferred') return 'deferred';
  if (item.state === 'not-applicable') return 'not-applicable';
  if (['change-revalidation-required', 'evidence-reconciliation-required', 'evidence-revalidation-required'].includes(item.state)) {
    return 'revalidation-required';
  }
  if (item.state === 'invalid') return 'invalid';
  return 'unclassified';
}

function isMatchingCompleteReceipt(
  item: SystemTestReferenceCase,
  receipt: SystemTestReferenceReceipt | undefined,
): receipt is SystemTestReferenceReceipt {
  return Boolean(receipt
    && item.caseFingerprint
    && receipt.caseFingerprint === item.caseFingerprint
    && receipt.status === 'passed'
    && receipt.evidenceStatus === 'complete'
    && receipt.cleanupEvidence?.apiZeroResidue === true
    && receipt.cleanupEvidence.uiZeroResidue === true
    && receipt.receiptEvidenceFingerprint
    && receipt.evidenceFileFingerprint);
}
