import { createHash } from 'node:crypto';
import type { AutomationRecipe, RecipeAction } from './automation-recipe';
import type { ProductCenterAuditSafetyLevel } from '../../utils/product-center-audit-unit';
import type { MutationIntentReconciliation } from '../../api/product-center/mutation-intent-journal';

export type ProductCenterGoldRunScope = 'full' | 'single' | 'impacted' | 'recovery';

export type ProductCenterGoldRunSelection = {
  scope: ProductCenterGoldRunScope;
  selectedCaseIds: string[];
  reasons: Array<{ caseId: string; matches: string[] }>;
};

export function buildProductCenterGoldRunSelection(
  recipes: readonly AutomationRecipe[],
  options: { caseId?: string; impactedCaseId?: string } = {},
): ProductCenterGoldRunSelection {
  if (options.caseId && options.impactedCaseId) {
    throw new Error('Gold 运行不能同时指定单例和影响集');
  }
  if (!options.caseId && !options.impactedCaseId) {
    if (recipes.length === 0) throw new Error('Gold 完整运行分母为零');
    return {
      scope: 'full',
      selectedCaseIds: recipes.map((recipe) => recipe.caseId).sort(),
      reasons: recipes.map((recipe) => ({ caseId: recipe.caseId, matches: ['full-collection'] }))
        .sort((left, right) => left.caseId.localeCompare(right.caseId)),
    };
  }

  const targetCaseId = options.caseId ?? options.impactedCaseId ?? '';
  const target = recipes.find((recipe) => recipe.caseId === targetCaseId);
  if (!target) throw new Error(`Gold 运行分母为零：${targetCaseId}`);
  if (options.caseId) {
    return {
      scope: 'single',
      selectedCaseIds: [target.caseId],
      reasons: [{ caseId: target.caseId, matches: ['exact-case-id'] }],
    };
  }

  const targetCapabilities = new Set(target.capabilities.slice(1).map((item) => item.id));
  const targetAssertions = new Set(target.assertions.map((item) => item.adapterId));
  const targetSourceIds = new Set(target.sourceIds);
  const reasons = recipes.flatMap((recipe) => {
    const matches: string[] = [];
    if (recipe.caseId === target.caseId) matches.push('exact-case-id');
    if (recipe.route === target.route) matches.push(`route:${target.route}`);
    for (const capability of recipe.capabilities.slice(1)) {
      if (targetCapabilities.has(capability.id)) matches.push(`capability:${capability.id}`);
    }
    for (const assertion of recipe.assertions) {
      if (targetAssertions.has(assertion.adapterId)) matches.push(`assertion:${assertion.adapterId}`);
    }
    if (recipe.seed?.adapterId && recipe.seed.adapterId === target.seed?.adapterId) {
      matches.push(`seed:${recipe.seed.adapterId}`);
    }
    if (recipe.cleanup?.adapterId
      && recipe.cleanup.adapterId !== 'productCenter.cleanupSeed'
      && recipe.cleanup.adapterId === target.cleanup?.adapterId) {
      matches.push(`cleanup:${recipe.cleanup.adapterId}`);
    }
    const sharedSourceIds = recipe.sourceIds.filter((sourceId) => targetSourceIds.has(sourceId));
    matches.push(...sharedSourceIds.map((sourceId) => `source:${sourceId}`));
    return matches.length > 0
      ? [{ caseId: recipe.caseId, matches: [...new Set(matches)].sort() }]
      : [];
  }).sort((left, right) => left.caseId.localeCompare(right.caseId));
  if (reasons.length === 0) throw new Error(`Gold 影响集分母为零：${targetCaseId}`);
  return {
    scope: 'impacted',
    selectedCaseIds: reasons.map((item) => item.caseId),
    reasons,
  };
}

export function buildExactProductCenterGoldRunSelection(
  recipes: readonly AutomationRecipe[],
  caseIds: readonly string[],
): ProductCenterGoldRunSelection {
  const selectedCaseIds = [...new Set(caseIds.map((caseId) => caseId.trim()).filter(Boolean))].sort();
  if (selectedCaseIds.length === 0) throw new Error('Gold 精确影响集分母为零');
  const recipeCaseIds = new Set(recipes.map((recipe) => recipe.caseId));
  const missing = selectedCaseIds.filter((caseId) => !recipeCaseIds.has(caseId));
  if (missing.length > 0) throw new Error(`Gold 精确影响集包含未知 caseId：${missing.join(',')}`);
  return {
    scope: 'impacted',
    selectedCaseIds,
    reasons: selectedCaseIds.map((caseId) => ({ caseId, matches: ['page-contract-impact'] })),
  };
}

export function selectProductCenterRecipesForRuntime(
  recipes: readonly AutomationRecipe[],
  rawCaseIds = process.env.PC_RECIPE_SELECTED_CASE_IDS,
): AutomationRecipe[] {
  if (!rawCaseIds) return [...recipes];
  const caseIds = rawCaseIds.split(',').map((value) => value.trim()).filter(Boolean);
  const selected = recipes.filter((recipe) => caseIds.includes(recipe.caseId));
  const missing = caseIds.filter((caseId) => !selected.some((recipe) => recipe.caseId === caseId));
  if (selected.length === 0 || missing.length > 0) {
    throw new Error(`Gold 运行分母无效：selected=${selected.length};missing=${missing.join(',')}`);
  }
  return selected;
}

export type ProductCenterRecipeResourceClaim = {
  key: string;
  mode: 'shared' | 'exclusive';
};

export function buildProductCenterRecipeResourcePlan(
  recipes: readonly AutomationRecipe[],
  requestedWorkers = 2,
) {
  const workers = Math.max(1, Math.min(2, Math.floor(requestedWorkers)));
  const entries = recipes.map((recipe) => {
    const resourceClaims = productCenterRecipeResourceClaims(recipe);
    return {
      caseId: recipe.caseId,
      resourceClaims,
      resourceKeys: resourceClaims.map((claim) => claim.key),
    };
  }).sort((left, right) => left.caseId.localeCompare(right.caseId));
  const casesByResource = new Map<string, Array<{ caseId: string; mode: ProductCenterRecipeResourceClaim['mode'] }>>();
  for (const entry of entries) {
    for (const claim of entry.resourceClaims) {
      const cases = casesByResource.get(claim.key) ?? [];
      cases.push({ caseId: entry.caseId, mode: claim.mode });
      casesByResource.set(claim.key, cases);
    }
  }
  const conflicts = [...casesByResource.entries()]
    .filter(([, cases]) => cases.length > 1 && cases.some((item) => item.mode === 'exclusive'))
    .map(([resourceKey, cases]) => ({ resourceKey, caseIds: cases.map((item) => item.caseId).sort() }))
    .sort((left, right) => left.resourceKey.localeCompare(right.resourceKey));
  return { workers, entries, conflicts };
}

export function productCenterRecipeResourceKeys(recipe: AutomationRecipe): string[] {
  return productCenterRecipeResourceClaims(recipe).map((claim) => claim.key);
}

export function productCenterRecipeResourceClaims(recipe: AutomationRecipe): ProductCenterRecipeResourceClaim[] {
  const mode = recipe.mutation ? 'exclusive' as const : 'shared' as const;
  const claims: ProductCenterRecipeResourceClaim[] = [{ key: `route:${recipe.route}`, mode }];
  if (recipe.mutation?.operationKey) {
    const entity = recipe.mutation.operationKey.split(/[.:]/)[0];
    if (entity) claims.push({ key: `entity:${entity}`, mode: 'exclusive' });
  }
  const capabilities = recipe.capabilities.map((capability) => capability.id);
  const seasoningRecipe = recipe.route.includes('/seasoning')
    || capabilities.some((capability) => capability.includes('seasoning'));
  if (seasoningRecipe) {
    if (recipe.mutation) claims.push({ key: 'seasoning:write', mode: 'exclusive' });
    if (recipe.route.includes('/template') || capabilities.some((capability) => capability.includes('template'))) {
      claims.push({ key: 'seasoning:template', mode });
    }
    if (recipe.route === '/poi/location/seasoning'
      || capabilities.some((capability) => /store-|distribution|distribute/.test(capability))) {
      claims.push({ key: 'seasoning:store-global', mode });
    }
    if (recipe.route.endsWith('/record')
      || capabilities.some((capability) => /distribution|distribute|record-/.test(capability))) {
      claims.push({ key: 'seasoning:distribution-job', mode });
    }
  }
  const byKey = new Map<string, ProductCenterRecipeResourceClaim['mode']>();
  for (const claim of claims) {
    const current = byKey.get(claim.key);
    byKey.set(claim.key, current === 'exclusive' || claim.mode === 'exclusive' ? 'exclusive' : 'shared');
  }
  return [...byKey.entries()].map(([key, claimMode]) => ({ key, mode: claimMode }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function matchesProductCenterApiOperation(
  request: { method: string; url: string },
  operation: { method: string; pathSuffix: `/${string}` },
): boolean {
  if (request.method.toUpperCase() !== operation.method.toUpperCase()) return false;
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return false;
  }
  return pathname.endsWith(operation.pathSuffix);
}

export function decideProductCenterTransientRecovery(input: {
  action: RecipeAction;
  diagnostic: string;
  ledgerEntries: readonly { phase: string }[];
  previousFailureFingerprint?: string;
  safetyLevel?: ProductCenterAuditSafetyLevel;
  intentReconciliation?: MutationIntentReconciliation;
  reversibleStateRestored?: boolean;
}): {
  decision: 'retry-isolated' | 'state-verification-required' | 'resume-verification' | 'stop-ambiguous' | 'not-transient';
  reason: string;
} {
  if (isDeterministicUiDiagnostic(input.diagnostic)) {
    return { decision: 'not-transient', reason: 'deterministic-ui-failure' };
  }
  if (!isTransientDiagnostic(input.diagnostic)) {
    return { decision: 'not-transient', reason: 'failure-not-transient' };
  }
  if (input.previousFailureFingerprint
    && input.previousFailureFingerprint === buildProductCenterFailureFingerprint(input.diagnostic)) {
    return { decision: 'not-transient', reason: 'repeated-failure-fingerprint' };
  }
  if (!input.safetyLevel && input.action !== 'read') {
    if (input.ledgerEntries.length === 0) {
      return { decision: 'retry-isolated', reason: 'no-mutation-observed' };
    }
    if (input.ledgerEntries.every((entry) => entry.phase === 'residue-verified')) {
      return { decision: 'retry-isolated', reason: 'residue-verified' };
    }
    return { decision: 'state-verification-required', reason: 'mutation-state-unknown' };
  }
  const safetyLevel = input.safetyLevel ?? 'L0-read-only';
  if (safetyLevel === 'L0-read-only') {
    return { decision: 'retry-isolated', reason: 'read-only' };
  }
  if (safetyLevel === 'L1-reversible') {
    return input.reversibleStateRestored
      ? { decision: 'retry-isolated', reason: 'reversible-state-restored' }
      : { decision: 'state-verification-required', reason: 'reversible-state-not-restored' };
  }
  if (input.intentReconciliation === 'absent') {
    return { decision: 'retry-isolated', reason: 'reconciled-absent' };
  }
  if (input.intentReconciliation === 'present') {
    return { decision: 'resume-verification', reason: 'reconciled-present' };
  }
  if (input.intentReconciliation === 'ambiguous') {
    return { decision: 'stop-ambiguous', reason: 'reconciled-ambiguous' };
  }
  if (input.ledgerEntries.length > 0
    && input.ledgerEntries.every((entry) => entry.phase === 'residue-verified')) {
    return { decision: 'retry-isolated', reason: 'residue-verified' };
  }
  return { decision: 'state-verification-required', reason: 'non-idempotent-state-unknown' };
}

export function isDeterministicUiDiagnostic(value: string): boolean {
  return /strict mode violation|resolved to \d+ elements|定位不唯一|uniqueness|targetcount\s*=|locator\.(?:waitfor|click|fill).*timeout|waiting for (?:getby|locator)|expected.*(?:count|visible|enabled)/i
    .test(value);
}

export function isTransientDiagnostic(value: string): boolean {
  return /资源锁等待超时|resource lock[^\n]*(?:timeout|timed out)|429|too many requests|exceeded retry limit|connection reset|reconnect|econnreset|etimedout|err_timed_out|socket hang up|upstream.*unavailable|(?:waitforresponse|request|response|network|api)[^\n]*(?:timeout|timed out)|(?:timeout|timed out)[^\n]*(?:waitforresponse|request|response|network|api)/i
    .test(value);
}

export function buildProductCenterFailureFingerprint(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<uuid>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
