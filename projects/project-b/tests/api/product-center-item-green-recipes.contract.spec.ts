import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { productCenterRecipeCapabilityContracts } from '../../adapters/product-center/product-center-recipe-capabilities';
import { validateAutomationRecipe } from '../../automation/recipe/recipe-validator';
import { buildProductCenterItemGreenRecipeArtifacts } from '../../scripts/build-product-center-item-green-recipes';

test.describe('商品中心绿色用例 Recipe 精确绑定', () => {
  test('应生成65条逐用例Recipe并全部完成精确绑定', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const { collection, report } = buildProductCenterItemGreenRecipeArtifacts({
      projectRoot,
      generatedAt: '2026-07-31T15:00:00.000Z',
    });

    expect(collection).toMatchObject({
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-green-binding-draft-recipes',
      status: 'fully-bound',
      summary: {
        greenCases: 65,
        sharedBindingGroups: 20,
        caseRecipes: 65,
        structurallyCompiled: 65,
        compileBlocked: 0,
        exactBindingRequired: 0,
        runtimeExecutable: 65,
        humanReviewRequired: 0,
      },
    });
    expect(collection.recipes).toHaveLength(65);
    expect(new Set(collection.recipes.map((recipe) => recipe.caseId)).size).toBe(65);
    expect(collection.recipes.every((recipe) => (
      recipe.capabilities[0]?.id === 'navigation.sidebar.open'
      && recipe.executionPolicy?.mode === 'wave-shared-chain'
      && recipe.executionPolicy.caseLevelExecutionAllowed === false
      && !recipe.seed
      && !recipe.mutation
      && !recipe.cleanup
      && validateAutomationRecipe(recipe, productCenterRecipeCapabilityContracts).length === 0
    ))).toBe(true);
    const runnable = collection.recipes.filter((recipe) => recipe.generationAllowed);
    expect(runnable).toHaveLength(65);
    expect(runnable.map((recipe) => recipe.caseId)).toEqual(expect.arrayContaining([
      'TC-ITEM-PKG-016',
      'TC-ITEM-PKG-054',
      'TC-ITEM-PKG-057',
      'TC-ITEM-STD-020',
      'TC-ITEM-STD-048',
      'TC-ITEM-STD-050',
      'TC-ITEM-STD-064',
      'TC-ITEM-STD-078',
      'TC-ITEM-STD-098',
    ]));
    expect(runnable.map((recipe) => recipe.capabilities[1]?.id)).toEqual(expect.arrayContaining([
      'item.combo.readOptionalGroupDialog',
      'item.createComboRequiredOnly',
      'item.createStandard',
      'item.list.probeImagePreview',
      'item.list.searchSecondLanguage',
      'item.standard.probeMainImageReplacement',
      'item.standard.probeSpecGroupCreateNavigation',
      'item.combo.mega.disableEnabledItem',
    ]));
    expect(runnable.every((recipe) => (
      recipe.assertions.length === 1
      && recipe.assertions[0]?.adapterId !== 'greenRecipe.exactBindingRequired'
      && recipe.executionPolicy?.orchestratorSpecPath?.startsWith('tests/generated/product-center-item-green-')
    ))).toBe(true);
    expect(collection.recipes.filter((recipe) => !recipe.generationAllowed)).toEqual([]);
    expect(report.groups.every((group) => group.missingBindings.length === 0)).toBe(true);
    expect(report.policy).toMatchObject({
      coarseTemplateReuseDoesNotGrantRuntime: true,
      exactCapabilityBindingRequired: true,
      exactAssertionBindingRequired: true,
      caseLevelEvidenceRequired: true,
      humanSemanticReviewRequired: false,
    });
  });

  test('产物应落盘并保持整波共享执行策略', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const artifacts = buildProductCenterItemGreenRecipeArtifacts({ projectRoot });
    expect(fs.existsSync(artifacts.recipePath)).toBe(true);
    expect(fs.existsSync(artifacts.reportPath)).toBe(true);
    expect(fs.existsSync(artifacts.manifestPath)).toBe(true);
    expect(artifacts.manifest.executionPolicy).toMatchObject({
      caseLevelExecutionAllowed: false,
      runtimeExecutable: 65,
      exactBindingRequired: 0,
    });
    expect(artifacts.manifest.groups.find((group) => group.groupId === 'AT15')).toMatchObject({
      orchestratorSpecPath: 'tests/generated/product-center-item-green-at15.generated.spec.ts',
      runtimeExecutableCaseIds: ['TC-ITEM-STD-078'],
    });
    expect(artifacts.manifest.groups.find((group) => group.groupId === 'AT39')).toMatchObject({
      orchestratorSpecPath: 'tests/generated/product-center-item-green-at39.generated.spec.ts',
      runtimeExecutableCaseIds: ['TC-ITEM-PKG-016'],
    });
    expect(artifacts.manifest.groups.find((group) => group.groupId === 'AT09')).toMatchObject({
      orchestratorSpecPath: 'tests/generated/product-center-item-green-at09.generated.spec.ts',
      runtimeExecutableCaseIds: [
        'TC-ITEM-STD-020',
        'TC-ITEM-STD-048',
        'TC-ITEM-STD-050',
        'TC-ITEM-STD-098',
      ],
    });
  });
});
