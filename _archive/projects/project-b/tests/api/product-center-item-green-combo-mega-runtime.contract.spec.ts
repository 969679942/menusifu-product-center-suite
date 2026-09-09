import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { productCenterRecipeCapabilityContracts } from '../../adapters/product-center/product-center-recipe-capabilities';
import type { AutomationRecipe } from '../../automation/recipe/automation-recipe';
import { validateAutomationRecipe } from '../../automation/recipe/recipe-validator';

const projectRoot = path.resolve(__dirname, '../..');
const recipesPath = path.join(
  projectRoot,
  'contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json',
);
const manifestPath = path.join(
  projectRoot,
  'contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-manifest.json',
);
const executorPath = path.join(
  projectRoot,
  'tests/generated/product-center-item-green-combo-mega.generated.spec.ts',
);
const orchestratorSpecPath = 'tests/generated/product-center-item-green-combo-mega.generated.spec.ts';

const bindings = {
  'TC-ITEM-PKG-050': ['item.combo.mega.removeAllGroupItems', 'productCenter.verifyComboEmptyGroupHidden'],
  'TC-ITEM-PKG-055': ['item.combo.mega.probeDeleteConfirmation', 'productCenter.verifyComboDeleteConfirmation'],
  'TC-ITEM-PKG-011': ['item.combo.mega.createWithoutCategory', 'productCenter.verifyComboCreateWithoutCategory'],
  'TC-ITEM-PKG-012': ['item.combo.mega.createWithParentCategory', 'productCenter.verifyComboParentCategoryCreate'],
  'TC-ITEM-PKG-018': ['item.combo.mega.createWithZeroPrice', 'productCenter.verifyComboZeroPriceCreate'],
  'TC-ITEM-PKG-033': ['item.combo.mega.createWithLibraryMainImage', 'productCenter.verifyComboLibraryMainImageCreate'],
  'TC-ITEM-PKG-058': ['item.combo.mega.readOptionalGroupRules', 'productCenter.verifyComboOptionalGroupRules'],
  'TC-ITEM-PKG-067': ['item.combo.mega.createWithLocalMainImage', 'productCenter.verifyComboLocalMainImageCreate'],
  'TC-ITEM-PKG-068': ['item.combo.mega.probeMainImageReplacement', 'productCenter.verifyComboMainImageReplacement'],
  'TC-ITEM-PKG-023': ['item.combo.mega.probeMnemonicMaximum', 'productCenter.verifyComboMnemonicMaximum'],
  'TC-ITEM-PKG-027': ['item.combo.mega.probeDescriptionMaximum', 'productCenter.verifyComboDescriptionMaximum'],
  'TC-ITEM-PKG-028': ['item.combo.mega.probeDetailImageLimit', 'productCenter.verifyComboDetailImageMaximum'],
  'TC-ITEM-PKG-065': ['item.combo.mega.probeReferencedGroupChildControls', 'productCenter.verifyComboReferencedGroupChildControls'],
  'TC-ITEM-PKG-005': ['item.combo.mega.readOtherSettings', 'productCenter.verifyComboOtherSettings'],
  'TC-ITEM-PKG-021': ['item.combo.mega.createFormattedName', 'productCenter.verifyComboFormattedName'],
  'TC-ITEM-PKG-022': ['item.combo.mega.createFormattedNames', 'productCenter.verifyComboFormattedNames'],
  'TC-ITEM-PKG-029': ['item.combo.mega.editDescriptionTags', 'productCenter.verifyComboDescriptionTagsEdit'],
  'TC-ITEM-PKG-030': ['item.combo.mega.editCornerMark', 'productCenter.verifyComboCornerMarkEdit'],
  'TC-ITEM-PKG-031': ['item.combo.mega.editStatisticsTags', 'productCenter.verifyComboStatisticsTagsEdit'],
  'TC-ITEM-PKG-032': ['item.combo.mega.editMaterialInformation', 'productCenter.verifyComboMaterialInformationEdit'],
  'TC-ITEM-PKG-049': ['item.combo.mega.createWithFixedAndCustomGroups', 'productCenter.verifyComboFixedAndCustomGroups'],
  'TC-ITEM-PKG-052': ['item.combo.mega.editTasteGroup', 'productCenter.verifyComboTasteGroupEdit'],
  'TC-ITEM-PKG-053': ['item.combo.mega.probeMutualExclusion', 'productCenter.verifyComboMutualExclusion'],
  'TC-ITEM-PKG-063': ['item.combo.mega.editMethodGroup', 'productCenter.verifyComboMethodGroupEdit'],
  'TC-ITEM-PKG-064': ['item.combo.mega.editAddonGroup', 'productCenter.verifyComboAddonGroupEdit'],
  'TC-ITEM-PKG-034': ['item.combo.mega.searchByCombinedFilters', 'productCenter.verifyComboCombinedFilters'],
  'TC-ITEM-PKG-061': ['item.combo.mega.enableDisabledItem', 'productCenter.verifyComboEnableDisabledItem'],
  'TC-ITEM-PKG-062': ['item.combo.mega.disableEnabledItem', 'productCenter.verifyComboDisableEnabledItem'],
} as const;

test.describe('商品中心绿色套餐商品 mega wave 合同', () => {
  test('二十八条用例应精确绑定到同一共享执行器', () => {
    const collection = readJson<{ summary: Record<string, number>; recipes: AutomationRecipe[] }>(recipesPath);
    const manifest = readJson<{
      executionPolicy: { runtimeExecutable: number; exactBindingRequired: number };
      groups: Array<{ groupId: string; runtimeExecutableCaseIds: string[]; orchestratorSpecPath: string }>;
    }>(manifestPath);
    const recipes = Object.fromEntries(collection.recipes.map((recipe) => [recipe.caseId, recipe]));

    expect(collection.summary).toMatchObject({
      greenCases: 65,
      runtimeExecutable: 65,
      exactBindingRequired: 0,
      humanReviewRequired: 0,
    });
    expect(manifest.executionPolicy).toMatchObject({ runtimeExecutable: 65, exactBindingRequired: 0 });

    for (const [caseId, [capabilityId, assertionAdapterId]] of Object.entries(bindings)) {
      const recipe = recipes[caseId];
      expect(recipe?.generationAllowed).toBe(true);
      expect(recipe?.capabilities[0]).toMatchObject({ id: 'navigation.sidebar.open' });
      expect(recipe?.capabilities[1]).toMatchObject({ id: capabilityId });
      expect(recipe?.assertions[0]?.adapterId).toBe(assertionAdapterId);
      expect(recipe?.executionPolicy).toMatchObject({
        mode: 'wave-shared-chain',
        caseLevelExecutionAllowed: false,
        orchestratorSpecPath,
      });
      expect(validateAutomationRecipe(recipe!, productCenterRecipeCapabilityContracts)).toEqual([]);
    }

    for (const groupId of ['AT42', 'AT43', 'AT45', 'AT47', 'AT50']) {
      const group = manifest.groups.find((candidate) => candidate.groupId === groupId);
      expect(group?.orchestratorSpecPath).toBe(orchestratorSpecPath);
      expect(group?.runtimeExecutableCaseIds).toEqual(expect.arrayContaining(
        Object.keys(bindings).filter((caseId) => group?.runtimeExecutableCaseIds.includes(caseId)),
      ));
    }
  });

  test('共享执行器应具备独立证据、断点恢复和零残留门禁', () => {
    expect(fs.existsSync(executorPath)).toBe(true);
    const source = fs.readFileSync(executorPath, 'utf8');
    for (const caseId of Object.keys(bindings)) expect(source).toContain(`'${caseId}'`);
    for (const marker of [
      "batchId: 'GREEN-COMBO-MEGA'",
      "executionMode: 'wave-shared-chain'",
      'evidenceInheritanceAllowed: false',
      'caseLevelRunsClaimed: 0',
      'MutationIntentJournal',
      'reconcileIncompleteIntents',
      'registerCreated',
      'finally',
      'residueFree',
      "'cleanup-complete'",
      "'environment-blocked'",
      "'canonical-conflict'",
    ]) expect(source).toContain(marker);
    expect(source).not.toContain('waitForTimeout');
  });
});

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
