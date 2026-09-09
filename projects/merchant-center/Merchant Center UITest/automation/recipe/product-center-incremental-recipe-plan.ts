import { createHash } from 'node:crypto';
import type { ProductCenterContractDiff } from '../../utils/product-center-contract-diff';
import { stableStringify } from '../../utils/product-center-test-contract';
import type { AutomationRecipe } from './automation-recipe';

export type ProductCenterIncrementalRecipePlan = {
  schemaVersion: '1.0.0';
  contractVersion: string;
  diffFingerprint: string;
  changedRecordIds: string[];
  selectedCaseIds: string[];
  selectedRecipeIds: string[];
  unsupportedCaseIds: string[];
  routeFallbackIgnored: string[];
};

export function buildProductCenterIncrementalRecipePlan(
  diff: ProductCenterContractDiff,
  recipes: readonly AutomationRecipe[],
  contractVersion: string,
): ProductCenterIncrementalRecipePlan {
  const executableChanges = diff.changes.filter(
    (change) => change.collection !== 'traceability' && change.collection !== 'unresolved',
  );
  const changedRecordIds = [...new Set(executableChanges.map((change) => change.id))].sort();
  const changedRecordSet = new Set(changedRecordIds);
  const recipeByCaseId = new Map(recipes.map((recipe) => [recipe.caseId, recipe]));
  const selectedCaseIds = new Set<string>();
  const unsupportedCaseIds = new Set<string>();
  const routeFallbackIgnored = new Set<string>();

  for (const recipe of recipes) {
    if (recipe.sourceIds.some((sourceId) => changedRecordSet.has(sourceId))) {
      selectedCaseIds.add(recipe.caseId);
    }
  }

  for (const impact of diff.impactedCaseDetails) {
    if (impact.match === 'route-fallback') {
      routeFallbackIgnored.add(impact.caseId);
      continue;
    }
    if (recipeByCaseId.has(impact.caseId)) selectedCaseIds.add(impact.caseId);
    else unsupportedCaseIds.add(impact.caseId);
  }

  const normalizedCaseIds = [...selectedCaseIds].sort();
  return {
    schemaVersion: '1.0.0',
    contractVersion,
    diffFingerprint: createHash('sha256').update(stableStringify(diff)).digest('hex'),
    changedRecordIds,
    selectedCaseIds: normalizedCaseIds,
    selectedRecipeIds: normalizedCaseIds.map((caseId) => recipeByCaseId.get(caseId)!.id),
    unsupportedCaseIds: [...unsupportedCaseIds].sort(),
    routeFallbackIgnored: [...routeFallbackIgnored].sort(),
  };
}
