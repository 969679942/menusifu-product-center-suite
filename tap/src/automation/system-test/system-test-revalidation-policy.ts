export type SystemTestRevalidationImpactType =
  | 'report-only'
  | 'platform-only'
  | 'adapter-only'
  | 'business-implementation'
  | 'context-change'
  | 'evidence-gap'
  | 'unknown-impact';

export type SystemTestRevalidationDecision =
  | 'reuse'
  | 'static-verify'
  | 'targeted-execute'
  | 'sentinel-execute'
  | 'full-regression'
  | 'blocked'
  | 'classified-exclusion';

export type SystemTestRevalidationCase = {
  caseId: string;
  caseFingerprint: string;
  implementationFingerprint: string;
  businessImplementationFingerprint?: string;
  expectationCount: number;
  mutationRequired: boolean;
  requiredCanary?: boolean;
};

export type SystemTestRevalidationReceipt = {
  caseId: string;
  caseFingerprint: string;
  implementationFingerprint: string;
  businessImplementationFingerprint?: string;
  status: 'passed' | 'failed' | 'blocked' | 'not-run';
  failureCategory?: string;
  evidenceComplete: boolean;
  operationReceiptCount: number;
  assertionReceiptCount: number;
  cleanupComplete: boolean;
  contextReceiptComplete?: boolean;
};

export type SystemTestRevalidationDecisionRecord = {
  caseId: string;
  decision: SystemTestRevalidationDecision;
  reasonCode: string;
  impactType: SystemTestRevalidationImpactType;
  confidence: 'high' | 'medium' | 'low';
  reusable: boolean;
  receiptCaseId?: string;
};

export function isReusableSystemTestReceipt(input: {
  item: SystemTestRevalidationCase;
  receipt?: SystemTestRevalidationReceipt;
  impactType?: SystemTestRevalidationImpactType;
}): boolean {
  const receipt = input.receipt;
  if (!receipt || receipt.caseId !== input.item.caseId) return false;
  if (receipt.caseFingerprint !== input.item.caseFingerprint) return false;
  if (!isAcceptedOutcome(receipt)) return false;
  if (!receipt.evidenceComplete || receipt.operationReceiptCount < 1
    || receipt.assertionReceiptCount < input.item.expectationCount
    || (input.item.mutationRequired && !receipt.cleanupComplete)
    || receipt.contextReceiptComplete !== true) return false;
  if (input.impactType === 'report-only' || input.impactType === 'platform-only') return true;
  const currentBusinessFingerprint = input.item.businessImplementationFingerprint ?? input.item.implementationFingerprint;
  const receiptBusinessFingerprint = receipt.businessImplementationFingerprint ?? receipt.implementationFingerprint;
  return receiptBusinessFingerprint === currentBusinessFingerprint;
}

export function buildSystemTestRevalidationDecision(input: {
  item: SystemTestRevalidationCase;
  receipt?: SystemTestRevalidationReceipt;
  impactType?: SystemTestRevalidationImpactType;
  staticIssueCodes?: readonly string[];
}): SystemTestRevalidationDecisionRecord {
  const impactType = input.impactType ?? 'unknown-impact';
  const staticIssue = input.staticIssueCodes?.find(Boolean);
  if (staticIssue) return {
    caseId: input.item.caseId,
    decision: 'blocked',
    reasonCode: staticIssue,
    impactType,
    confidence: 'high',
    reusable: false,
  };
  if (impactType === 'report-only' || impactType === 'platform-only') {
    if (isReusableSystemTestReceipt(input)) return {
      caseId: input.item.caseId,
      decision: 'reuse',
      reasonCode: 'CURRENT_COMPLETE_RECEIPT_REUSED',
      impactType,
      confidence: 'high',
      reusable: true,
      receiptCaseId: input.receipt?.caseId,
    };
    return {
      caseId: input.item.caseId,
      decision: 'static-verify',
      reasonCode: 'NON_BUSINESS_CHANGE_REQUIRES_STATIC_VERIFY',
      impactType,
      confidence: 'high',
      reusable: false,
      receiptCaseId: input.receipt?.caseId,
    };
  }
  if (input.receipt?.status === 'failed' && input.receipt.failureCategory === 'product-failure') {
    const complete = input.receipt.evidenceComplete
      && input.receipt.operationReceiptCount >= 1
      && input.receipt.assertionReceiptCount >= input.item.expectationCount
      && (!input.item.mutationRequired || input.receipt.cleanupComplete)
      && input.receipt.contextReceiptComplete === true;
    if (complete) return {
      caseId: input.item.caseId,
      decision: 'classified-exclusion',
      reasonCode: 'ACCEPTED_PRODUCT_FINDING_RECEIPT',
      impactType,
      confidence: 'high',
      reusable: false,
      receiptCaseId: input.receipt.caseId,
    };
  }
  if (isReusableSystemTestReceipt(input)) return {
    caseId: input.item.caseId,
    decision: 'reuse',
    reasonCode: 'CURRENT_COMPLETE_RECEIPT_REUSED',
    impactType,
    confidence: 'high',
    reusable: true,
    receiptCaseId: input.receipt?.caseId,
  };
  if (input.receipt?.status === 'failed' && input.receipt.failureCategory === 'product-failure') return {
    caseId: input.item.caseId,
    decision: 'targeted-execute',
    reasonCode: 'PRODUCT_FINDING_EVIDENCE_INCOMPLETE',
    impactType,
    confidence: 'low',
    reusable: false,
    receiptCaseId: input.receipt.caseId,
  };
  if (impactType === 'unknown-impact' || input.item.requiredCanary) return {
    caseId: input.item.caseId,
    decision: 'sentinel-execute',
    reasonCode: input.receipt ? 'RECEIPT_NOT_REUSABLE_UNKNOWN_IMPACT' : 'NO_RECEIPT_UNKNOWN_IMPACT',
    impactType,
    confidence: 'low',
    reusable: false,
    receiptCaseId: input.receipt?.caseId,
  };
  return {
    caseId: input.item.caseId,
    decision: 'targeted-execute',
    reasonCode: input.receipt ? 'RECEIPT_STALE_OR_INCOMPLETE' : 'NO_CURRENT_COMPLETE_RECEIPT',
    impactType,
    confidence: input.impactType ? 'high' : 'medium',
    reusable: false,
    receiptCaseId: input.receipt?.caseId,
  };
}

export function assertCanaryBudget(input: {
  candidateCaseIds: readonly string[];
  totalCaseCount?: number;
  maxCanaryCases?: number;
  maxCanaryRatio?: number;
}): { allowed: boolean; code?: 'CANARY_PARTITION_TOO_LARGE' | 'GROUP_PARTITION_TOO_FINE'; detail?: string } {
  const maxCases = input.maxCanaryCases ?? 20;
  const maxRatio = input.maxCanaryRatio ?? 0.1;
  if (!Number.isInteger(maxCases) || maxCases < 1) throw new Error(`CANARY_MAX_CASES_INVALID:${maxCases}`);
  if (!Number.isFinite(maxRatio) || maxRatio <= 0 || maxRatio > 1) throw new Error(`CANARY_MAX_RATIO_INVALID:${maxRatio}`);
  const count = new Set(input.candidateCaseIds).size;
  if (count > maxCases) return { allowed: false, code: 'CANARY_PARTITION_TOO_LARGE', detail: `count=${count};max=${maxCases}` };
  const totalCaseCount = input.totalCaseCount ?? count;
  if (!Number.isInteger(totalCaseCount) || totalCaseCount < count) throw new Error(`CANARY_TOTAL_CASE_COUNT_INVALID:${totalCaseCount}`);
  if (totalCaseCount >= 10 && count > 0 && count / totalCaseCount > maxRatio) {
    return { allowed: false, code: 'GROUP_PARTITION_TOO_FINE', detail: `count=${count};total=${totalCaseCount};ratio=${maxRatio}` };
  }
  return { allowed: true };
}

export function assertSelectionMatchesPlan(input: {
  plannedCaseIds: readonly string[];
  runnerCaseIds: readonly string[];
  phase?: string;
}): void {
  const planned = [...new Set(input.plannedCaseIds)].sort();
  const actual = [...new Set(input.runnerCaseIds)].sort();
  const missing = planned.filter((caseId) => !actual.includes(caseId));
  const unexpected = actual.filter((caseId) => !planned.includes(caseId));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(`SYSTEM_TEST_SELECTION_DRIFT:${input.phase ?? 'unknown'}:missing=${missing.join(',')}:unexpected=${unexpected.join(',')}`);
  }
}

function isAcceptedOutcome(receipt: SystemTestRevalidationReceipt): boolean {
  return receipt.status === 'passed' || (receipt.status === 'failed' && receipt.failureCategory === 'product-failure');
}
