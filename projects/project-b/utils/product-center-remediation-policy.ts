import type { ProductCenterFailureCategory } from './product-center-failure-classifier';

export const productCenterRemediationPolicy = {
  schemaVersion: '1.0.0',
  maxRounds: 2,
  maxCaseDurationMs: 60_000,
  maxWorkers: 4,
  authSetupsPerBatch: 1,
  evidenceMode: 'complete-on-first-failure',
} as const;

export type ProductCenterRemediationDisposition =
  | 'automatic-retry'
  | 'repair-then-verify'
  | 'product-finding'
  | 'environment-blocked'
  | 'cleanup-blocked'
  | 'human-decision';

export function resolveProductCenterRemediationWorkers(
  selectedCaseCount: number,
  requestedWorkers?: number,
): number {
  const requested = Number.isSafeInteger(requestedWorkers) && (requestedWorkers ?? 0) > 0
    ? requestedWorkers as number
    : productCenterRemediationPolicy.maxWorkers;
  const bounded = Math.min(requested, productCenterRemediationPolicy.maxWorkers);
  return selectedCaseCount > 0 ? Math.max(1, Math.min(bounded, selectedCaseCount)) : bounded;
}

const highDependencyItemCases = new Set([
  'TC-ITEM-PKG-024', 'TC-ITEM-PKG-025', 'TC-ITEM-PKG-028', 'TC-ITEM-PKG-035',
  'TC-ITEM-PKG-036', 'TC-ITEM-PKG-038', 'TC-ITEM-PKG-052', 'TC-ITEM-PKG-053',
  'TC-ITEM-PKG-054', 'TC-ITEM-PKG-059', 'TC-ITEM-PKG-061', 'TC-ITEM-PKG-067',
  'TC-ITEM-PKG-068', 'TC-ITEM-PKG-075',
]);

export function resolveProductCenterItemWorkerCap(caseIds: readonly string[]): number {
  if (caseIds.length === 0) return productCenterRemediationPolicy.maxWorkers;
  return caseIds.some((caseId) => highDependencyItemCases.has(caseId.toUpperCase())) ? 2 : 4;
}

export function assertProductCenterRemediationRound(round: number): void {
  if (!Number.isSafeInteger(round) || round < 1 || round > productCenterRemediationPolicy.maxRounds) {
    throw new Error(`商品中心整改仅允许 1-${productCenterRemediationPolicy.maxRounds} 轮，实际 round=${round}`);
  }
}

export function decideProductCenterRemediationDisposition(input: {
  category: ProductCenterFailureCategory;
  cleanupVerified: boolean;
  sourceChanged: boolean;
  round: number;
}): ProductCenterRemediationDisposition {
  assertProductCenterRemediationRound(input.round);
  if (input.category === 'cleanup-residue' || !input.cleanupVerified) return 'cleanup-blocked';
  if (input.category === 'product-behavior') return 'product-finding';
  if (input.category === 'environment-auth' || input.category === 'environment-data') return 'environment-blocked';
  if (input.category === 'transient-platform') return 'automatic-retry';
  if (input.round === 1 && input.sourceChanged) return 'repair-then-verify';
  if (input.round === 2) return 'human-decision';
  return 'repair-then-verify';
}
