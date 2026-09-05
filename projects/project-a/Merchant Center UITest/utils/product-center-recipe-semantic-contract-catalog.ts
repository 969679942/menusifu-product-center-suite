import type { AutomationRecipe, RecipeSemanticBindings } from '../automation/recipe/automation-recipe';
import {
  promoteProductCenterCleanupContract,
  promoteProductCenterFactoryContract,
} from './product-center-data-contract-promotion';

const assertionContractIdByAdapterId: Readonly<Record<string, string>> = {
  'productCenter.verifyAbsentApi': 'assertion:lifecycle.absent.api',
  'productCenter.verifyBoundary': 'assertion:boundary.result',
  'productCenter.verifyCategoryChildBlockedApi': 'assertion:category.child-blocked.api',
  'productCenter.verifyCategoryChildBlockedUi': 'assertion:category.child-blocked.ui',
  'productCenter.verifyCreatedApi': 'assertion:lifecycle.created.api',
  'productCenter.verifyCreatedUi': 'assertion:lifecycle.created.ui',
  'productCenter.verifyDeletedUi': 'assertion:lifecycle.deleted.ui',
  'productCenter.verifyEditedApi': 'assertion:lifecycle.edited.api',
  'productCenter.verifyEditedUi': 'assertion:lifecycle.edited.ui',
  'productCenter.verifyNegative': 'assertion:negative.result',
  'productCenter.verifyStoreProductSearch': 'assertion:search.filtered.ui-api',
  'productCenter.verifyItemStandardSingleZeroPriceApi': 'assertion:item-standard-zero-price.api',
  'productCenter.verifyItemStandardSingleZeroPriceUi': 'assertion:item-standard-zero-price.ui',
  'productCenter.verifyItemComboRequiredOnlyApi': 'assertion:item-combo-required-only.api',
  'productCenter.verifyItemComboRequiredOnlyUi': 'assertion:item-combo-required-only.ui',
  'productCenter.verifyItemComboApiClosureCase': 'assertion:item-combo-ui-api-terminal',
  'productCenter.verifyItemComboGroupRequiredUi': 'assertion:item-combo-group-required.ui',
  'productCenter.verifyItemComboGroupRequiredApi': 'assertion:item-combo-group-required.api',
  'productCenter.verifyItemComboOptionalBoundaryUi': 'assertion:item-combo-optional-boundary.ui',
  'productCenter.verifyItemComboOptionalBoundaryApi': 'assertion:item-combo-optional-boundary.api',
  'productCenter.verifyItemRequiredValidationUi': 'assertion:item-required-name.ui',
  'productCenter.verifyItemNotCreated': 'assertion:item-not-created.api',
  'productCenter.verifyCategoryParentNotCommitted': 'assertion:item-category-parent-not-committed.ui',
  'productCenter.verifyCategoryLeafCommitted': 'assertion:item-category-leaf-committed.ui',
};

const factoryContractIdByAdapterId: Readonly<Record<string, string>> = {
  'productCenter.prepareCreate': 'factory:lifecycle.create',
  'productCenter.prepareItemStandardSingleZeroPrice': 'factory:item-standard-zero-price',
  'productCenter.prepareItemComboRequiredOnly': 'factory:item-combo-required-only',
  'productCenter.seedDescriptionTagDeletionScenario': 'factory:description-tag-deletion',
  'productCenter.seedCategoryWithProduct': 'factory:category.with-product',
  'productCenter.seedCore': 'factory:lifecycle.core',
  'productCenter.seedHighDependency': 'factory:lifecycle.high-dependency',
  'productCenter.seedLowDependency': 'factory:lifecycle.low-dependency',
  'productCenter.prepareItemComboApiClosureSharedUnit': 'factory:item-combo-audit-identity',
  'productCenter.prepareItemComboGroupRequiredProbe': 'factory:item-combo-group-required-probe',
  'productCenter.prepareItemComboOptionalBoundaryProbe': 'factory:item-combo-optional-boundary-probe',
};

const cleanupContractIdByAdapterId: Readonly<Record<string, string>> = {
  'productCenter.cleanupSeed': 'cleanup:lifecycle.zero-residue',
  'productCenter.cleanupItemComboApiClosureSharedUnit': 'cleanup:item-combo-ui-api-zero-residue',
};

const semanticContractSource = 'flows/product-center/product-center-recipe.flow.ts';
const runtimeContractSource = 'contracts/product-center/runtime/product-center-canonical-runtime-retain.json';

export const productCenterCanonicalFactoryContracts = [
  ['factory:item-combo-audit-identity', 'productCenter.prepareItemComboApiClosureSharedUnit'],
  ['factory:item-combo-group-required-probe', 'productCenter.prepareItemComboGroupRequiredProbe'],
  ['factory:item-combo-optional-boundary-probe', 'productCenter.prepareItemComboOptionalBoundaryProbe'],
].map(([id, adapterId]) => promoteProductCenterFactoryContract({
  id,
  adapterId,
  requiredPrefix: 'AUTO_AUDIT_',
  returnsServerId: true,
  registersDependencyIds: true,
  retryReconciliationSupported: true,
  sourcePaths: [semanticContractSource, runtimeContractSource],
  adapterRegistered: true,
}));

export const productCenterCanonicalCleanupContracts = [
  ['cleanup:item-combo-ui-api-zero-residue', 'productCenter.cleanupItemComboApiClosureSharedUnit'],
  ['cleanup:lifecycle.zero-residue', 'productCenter.cleanupSeed'],
].map(([id, adapterId]) => promoteProductCenterCleanupContract({
  id,
  adapterId,
  finallyCleanupGuaranteed: true,
  verifiesApiCountZero: true,
  verifiesUiCountZero: true,
  sourcePaths: [semanticContractSource, 'api/product-center/cleanup-registry.ts', runtimeContractSource],
  adapterRegistered: true,
}));

export function bindProductCenterRecipeSemanticContracts(
  recipe: AutomationRecipe,
): AutomationRecipe & { semanticBindings: RecipeSemanticBindings } {
  return {
    ...recipe,
    semanticBindings: {
      testCaseIrId: recipe.caseId,
      obligationIds: recipe.coverageIds.length > 0
        ? [...recipe.coverageIds]
        : [`obligation:case:${recipe.caseId}`],
      assertionContractIds: unique(recipe.assertions
        .map((assertion) => assertionContractIdByAdapterId[assertion.adapterId])
        .filter(isString)),
      factoryContractIds: recipe.seed
        ? unique([factoryContractIdByAdapterId[recipe.seed.adapterId]].filter(isString))
        : [],
      cleanupContractIds: recipe.cleanup
        ? unique([cleanupContractIdByAdapterId[recipe.cleanup.adapterId]].filter(isString))
        : [],
    },
  };
}

export const productCenterRecipeSemanticContractCatalog = {
  assertions: { ...assertionContractIdByAdapterId },
  factories: { ...factoryContractIdByAdapterId },
  cleanup: { ...cleanupContractIdByAdapterId },
} as const;

function isString(value: string | undefined): value is string {
  return typeof value === 'string';
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
