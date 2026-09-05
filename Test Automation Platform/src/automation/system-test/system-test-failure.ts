import type { SystemTestFailureCategory } from './system-test-progress';

export function classifySystemTestContractBlockers(
  blockers: readonly string[],
): SystemTestFailureCategory[] {
  if (blockers.some((blocker) => blocker.startsWith('EXTERNAL_CAPABILITY_MISSING:'))) {
    return ['external-dependency'];
  }
  return blockers.length > 0 ? ['automation-gap'] : [];
}

export function classifySystemTestCircuit(code: string | undefined): SystemTestFailureCategory {
  if (code === 'ENVIRONMENT_FAILURE_RATE') return 'environment-failure';
  if (code === 'STALL' || code === 'MAX_RUN_TIME') return 'automation-gap';
  return 'unknown';
}

export function classifySystemTestFailure(input: {
  status?: string;
  message?: string;
  evidenceComplete: boolean;
  productMismatchConfirmed?: boolean;
  executionPathEquivalent?: boolean;
}): SystemTestFailureCategory {
  const message = input.message?.toLowerCase() ?? '';
  if (/connection reset|too many requests|429|exceeded retry|timeout while waiting for codex/.test(message)) {
    return 'transient-platform';
  }
  if (/auth|login|forbidden|unauthorized|storage state|network unavailable/.test(message)) {
    return 'environment-failure';
  }
  if (/cleanup|residue|残留/.test(message)) return 'cleanup-residue';
  if (/locator|strict mode violation|element not found|selector/.test(message)) return 'locator-drift';
  if (/data factory|duplicate identity|unique constraint|invalid fixture/.test(message)) return 'test-data';
  const explicitProductMismatch = input.productMismatchConfirmed || /product_behavior|product behavior/.test(message);
  const equivalentPath = input.executionPathEquivalent || /product_behavior|product behavior/.test(message);
  if (explicitProductMismatch && input.evidenceComplete && equivalentPath) return 'product-failure';
  if (!input.evidenceComplete) return 'automation-gap';
  return input.status === 'failed' ? 'unknown' : 'automation-gap';
}

export function uniqueSystemTestFailureCategories(
  categories: ReadonlyArray<SystemTestFailureCategory | undefined>,
): SystemTestFailureCategory[] {
  return [...new Set(categories.filter((item): item is SystemTestFailureCategory => item !== undefined))].sort();
}
