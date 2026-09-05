import { createHash } from 'node:crypto';
import type { ProductCenterFailureCategory } from './product-center-failure-classifier';
import type { ProductCenterItemCompiledCase } from './product-center-item-practice-contract';

export type ProductCenterItemResponsibilityCategory =
  | 'product-failure'
  | 'automation-gap'
  | 'environment-failure'
  | 'external-dependency';

export type ProductCenterItemAssertionStep = {
  stepId: string;
  title: string;
  passed: boolean;
};

export type ProductCenterItemExpectationReceipt = {
  receiptId: string;
  claimId: string;
  expected: string;
  assertionStepId?: string;
  assertionTitle?: string;
  status: 'verified' | 'missing' | 'failed';
};

export type ProductCenterItemCleanupReceipt = {
  required: boolean;
  evidencePresent: boolean;
  apiZeroResidue: boolean;
  uiZeroResidue: boolean;
  unavailableUiChecks: string[];
  apiIdentityCount: number;
  uiIdentityCount: number;
};

export function buildProductCenterItemExpectationReceipts(
  item: ProductCenterItemCompiledCase,
  assertionSteps: readonly ProductCenterItemAssertionStep[],
  testPassed: boolean,
): ProductCenterItemExpectationReceipt[] {
  return item.expectationClaims.map((claim) => {
    const step = assertionSteps.find((candidate) => candidate.title.includes(claim.claimId));
    const status = !step ? 'missing' : testPassed && step.passed ? 'verified' : 'failed';
    return {
      receiptId: sha256(`${item.caseId}:${claim.claimId}:${step?.stepId ?? 'missing'}`),
      claimId: claim.claimId,
      expected: claim.expected,
      ...(step ? { assertionStepId: step.stepId, assertionTitle: step.title } : {}),
      status,
    };
  });
}

export function evaluateProductCenterItemCleanupEvidence(
  item: ProductCenterItemCompiledCase,
  runtimeEvidence: unknown,
): ProductCenterItemCleanupReceipt {
  const required = item.mutationMode !== 'none';
  if (!required) {
    return {
      required: false,
      evidencePresent: true,
      apiZeroResidue: true,
      uiZeroResidue: true,
      unavailableUiChecks: [],
      apiIdentityCount: 0,
      uiIdentityCount: 0,
    };
  }
  const cleanup = findCleanupEvidence(runtimeEvidence);
  if (!cleanup) {
    return {
      required: true,
      evidencePresent: false,
      apiZeroResidue: false,
      uiZeroResidue: false,
      unavailableUiChecks: [],
      apiIdentityCount: 0,
      uiIdentityCount: 0,
    };
  }
  const apiCounts = recordOf(cleanup.apiIdentityCounts);
  const uiCounts = recordOf(cleanup.uiIdentityCounts);
  const unavailableUiChecks = Object.entries(uiCounts)
    .filter(([, value]) => value !== 0)
    .map(([identity]) => identity);
  const noMutation = Object.keys(apiCounts).length === 0
    && Object.keys(uiCounts).length === 0
    && containsExplicitNoMutation(runtimeEvidence);
  return {
    required: true,
    evidencePresent: true,
    apiZeroResidue: noMutation || (Object.keys(apiCounts).length > 0 && Object.values(apiCounts).every((value) => value === 0)),
    uiZeroResidue: noMutation || (Object.keys(uiCounts).length > 0 && Object.values(uiCounts).every((value) => value === 0)),
    unavailableUiChecks,
    apiIdentityCount: Object.keys(apiCounts).length,
    uiIdentityCount: Object.keys(uiCounts).length,
  };
}

function containsExplicitNoMutation(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 8) return false;
  const record = value as Record<string, unknown>;
  if (record.mutationCount === 0) return true;
  if (typeof record.beforeApiCount === 'number' && typeof record.apiCount === 'number' && record.beforeApiCount === record.apiCount) {
    return true;
  }
  return Object.values(record).some((nested) => containsExplicitNoMutation(nested, depth + 1));
}

export function classifyProductCenterItemResponsibility(
  category: ProductCenterFailureCategory | undefined,
  evidenceComplete: boolean,
): ProductCenterItemResponsibilityCategory | undefined {
  if (category === 'product-behavior') return 'product-failure';
  if (!evidenceComplete) return 'automation-gap';
  if (!category) return undefined;
  if (category === 'environment-auth' || category === 'environment-data' || category === 'transient-platform') {
    return 'environment-failure';
  }
  return 'automation-gap';
}

function findCleanupEvidence(value: unknown, depth = 0): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 8) return undefined;
  const record = value as Record<string, unknown>;
  if (record.apiIdentityCounts && record.uiIdentityCounts) return record;
  if (record.cleanupEvidence && typeof record.cleanupEvidence === 'object') {
    return record.cleanupEvidence as Record<string, unknown>;
  }
  for (const nested of Object.values(record)) {
    const found = findCleanupEvidence(nested, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
