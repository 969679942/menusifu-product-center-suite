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
  'tests/generated/product-center-item-green-standard-mega.generated.spec.ts',
);
const orchestratorSpecPath = 'tests/generated/product-center-item-green-standard-mega.generated.spec.ts';

const bindings = {
  'TC-ITEM-STD-033': ['item.standard.mega.editOtherInformation', 'productCenter.verifyStandardOtherInformationEdit'],
  'TC-ITEM-STD-006': ['item.standard.mega.createWithParentCategory', 'productCenter.verifyParentCategoryCreate'],
  'TC-ITEM-STD-052': ['item.standard.mega.createWithLibraryMainImage', 'productCenter.verifyLibraryMainImageCreate'],
  'TC-ITEM-STD-053': ['item.standard.mega.createWithLocalMainImage', 'productCenter.verifyLocalMainImageCreate'],
  'TC-ITEM-STD-009': ['item.standard.mega.createFormattedNames', 'productCenter.verifyFormattedNames'],
  'TC-ITEM-STD-055': ['item.standard.mega.editDescriptionTags', 'productCenter.verifyDescriptionTagsEdit'],
  'TC-ITEM-STD-056': ['item.standard.mega.editMaterialInformation', 'productCenter.verifyMaterialInformationEdit'],
  'TC-ITEM-STD-099': ['item.standard.mega.editCornerMark', 'productCenter.verifyCornerMarkEdit'],
  'TC-ITEM-STD-100': ['item.standard.mega.editStatisticsTags', 'productCenter.verifyStatisticsTagsEdit'],
  'TC-ITEM-STD-003': ['item.list.mega.probeColumnSelection', 'productCenter.verifyColumnSelection'],
  'TC-ITEM-STD-004': ['item.list.mega.probeLanguageSwitch', 'productCenter.verifyLanguageSwitch'],
  'TC-ITEM-STD-034': ['item.standard.mega.probeTasteGroupSync', 'productCenter.verifyTasteGroupSync'],
  'TC-ITEM-STD-042': ['item.standard.mega.probeAdvancedFields', 'productCenter.verifyAdvancedFields'],
  'TC-ITEM-STD-063': ['item.list.mega.probePageSizes', 'productCenter.verifyPageSizes'],
  'TC-ITEM-STD-072': ['item.list.mega.probeDefaultColumns', 'productCenter.verifyDefaultColumns'],
  'TC-ITEM-STD-073': ['item.list.mega.probeRestoreColumns', 'productCenter.verifyRestoreColumns'],
  'TC-ITEM-STD-065': ['item.list.mega.enableDisabledItem', 'productCenter.verifyEnableDisabledItem'],
} as const;

test.describe('商品中心绿色标准商品 mega wave 合同', () => {
  test('十七条用例应精确绑定到同一共享执行器', () => {
    const collection = readJson<{ summary: Record<string, number>; recipes: AutomationRecipe[] }>(recipesPath);
    const manifest = readJson<{
      executionPolicy: { runtimeExecutable: number; exactBindingRequired: number };
      groups: Array<{ groupId: string; runtimeExecutableCaseIds: string[]; orchestratorSpecPath: string }>;
    }>(manifestPath);
    const recipes = Object.fromEntries(collection.recipes.map((recipe) => [recipe.caseId, recipe]));

    expect(collection.summary).toMatchObject({
      greenCases: 65,
      runtimeExecutable: 37,
      exactBindingRequired: 28,
      humanReviewRequired: 0,
    });
    expect(manifest.executionPolicy).toMatchObject({ runtimeExecutable: 37, exactBindingRequired: 28 });

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

    for (const groupId of ['AT01', 'AT05', 'AT08', 'AT19', 'AT21']) {
      const group = manifest.groups.find((candidate) => candidate.groupId === groupId);
      expect(group?.runtimeExecutableCaseIds).toEqual(expect.arrayContaining(
        Object.keys(bindings).filter((caseId) => group?.runtimeExecutableCaseIds.includes(caseId)),
      ));
      expect(group?.orchestratorSpecPath).toBe(orchestratorSpecPath);
    }
  });

  test('共享执行器应具备独立证据、断点恢复和零残留门禁', () => {
    expect(fs.existsSync(executorPath)).toBe(true);
    const source = fs.readFileSync(executorPath, 'utf8');
    for (const caseId of Object.keys(bindings)) expect(source).toContain(`'${caseId}'`);
    for (const marker of [
      "batchId: 'GREEN-STANDARD-MEGA'",
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
