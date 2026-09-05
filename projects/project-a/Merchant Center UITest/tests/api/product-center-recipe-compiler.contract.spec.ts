import { expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import contractDocument from '../../contracts/product-center/product-center-test-contract.json';
import existingSopCasesDocument from '../../contracts/product-center/test-cases/product-center-existing-sop-cases.json';
import { productCenterRecipeCapabilityContracts } from '../../adapters/product-center/product-center-recipe-capabilities';
import {
  compileProductCenterPilotRecipes,
  productCenterRecipeCaseIds,
} from '../../automation/recipe/product-center-recipe-compiler';
import { validateAutomationRecipe } from '../../automation/recipe/recipe-validator';
import { productCenterCreateSopCatalog } from '../../sop/product-center/product-center-create-sop.catalog';
import { highDependencySopCatalog } from '../../sop/product-center/product-center-high-dependency-sop.catalog';
import { lowDependencySopCatalog } from '../../sop/product-center/product-center-low-dependency-sop.catalog';
import { productCenterNegativeSopCatalog } from '../../sop/product-center/product-center-negative-sop.catalog';
import { productCenterSopCatalog } from '../../sop/product-center/product-center-sop.catalog';
import { buildProductCenterRecipeArtifacts } from '../../scripts/build-product-center-recipes';
import type { ProductCenterTestContract } from '../../utils/product-center-test-contract';

const compilerInput = {
  core: productCenterSopCatalog,
  create: productCenterCreateSopCatalog,
  lowDependency: lowDependencySopCatalog,
  highDependency: highDependencySopCatalog,
  negative: productCenterNegativeSopCatalog,
  contract: contractDocument as unknown as ProductCenterTestContract,
  claimIdsByCaseId: new Map((existingSopCasesDocument as {
    cases: Array<{ id: string; claims: Array<{ id: string }>; sourceIds: string[] }>;
  }).cases.map((item) => [item.id, item.claims.map((claim) => claim.id)])),
  sourceIdsByCaseId: new Map((existingSopCasesDocument as {
    cases: Array<{ id: string; sourceIds: string[] }>;
  }).cases.map((item) => [item.id, item.sourceIds])),
  generatedCaseIds: new Set<string>(productCenterRecipeCaseIds),
};

test.describe('商品中心 Recipe 编译器合同', () => {
  test('应编译四十六条合同驱动 Recipe 且全部通过校验', async () => {
    const result = compileProductCenterPilotRecipes(compilerInput);

    expect(productCenterRecipeCaseIds).toHaveLength(46);
    expect(result.recipes.map((recipe) => recipe.caseId)).toEqual(productCenterRecipeCaseIds);
    expect(result.unresolved).toEqual([]);
    for (const recipe of result.recipes) {
      expect(recipe.sourceIds.length).toBeGreaterThan(0);
      expect(recipe.traceabilityId).toBe(`trace:sop:${recipe.caseId}`);
      expect(recipe.sourceIds.some((id) => id.startsWith('sop-catalog:'))).toBe(false);
      expect(recipe.claimIds).toEqual(compilerInput.claimIdsByCaseId.get(recipe.caseId));
      expect(recipe.claimIds?.length).toBeGreaterThan(0);
      expect(validateAutomationRecipe(recipe, productCenterRecipeCapabilityContracts)).toEqual([]);
      expect(JSON.stringify(recipe)).not.toMatch(/selector|xpath|\.locator\(/i);
    }
  });

  test('核心编辑删除应声明 API 生命周期和稳定能力', async () => {
    const result = compileProductCenterPilotRecipes(compilerInput);
    const methodEdit = result.recipes.find((recipe) => recipe.caseId === 'edit:method');
    const categoryDelete = result.recipes.find((recipe) => recipe.caseId === 'delete:category');

    expect(methodEdit).toMatchObject({
      action: 'edit',
      seed: { adapterId: 'productCenter.seedCore', input: { entityKey: 'method' } },
      mutation: { method: 'PUT', operationKey: 'method.update' },
      cleanup: { adapterId: 'productCenter.cleanupSeed' },
    });
    expect(methodEdit?.capabilities.map((item) => item.id)).toEqual([
      'navigation.sidebar.open',
      'method.open',
      'method.editIdentity',
    ]);
    expect(categoryDelete).toMatchObject({
      action: 'delete',
      mutation: { method: 'DELETE', operationKey: 'category.delete' },
    });
    expect(result.recipes.filter((recipe) => recipe.action === 'create')).toHaveLength(5);
    expect(result.recipes.filter((recipe) => recipe.action === 'edit')).toHaveLength(13);
    expect(result.recipes.filter((recipe) => recipe.action === 'delete')).toHaveLength(16);
    expect(result.recipes.filter((recipe) => recipe.action === 'negative')).toHaveLength(6);
    expect(result.recipes.find((recipe) => recipe.caseId === 'edit:material')?.sourceIds)
      .toContain('route:7cbe5e6e2734');
  });

  test('Recipe 应使用用例级精确来源且不得继承同模块无关业务规则', async () => {
    const result = compileProductCenterPilotRecipes(compilerInput);
    const menuDelete = result.recipes.find((recipe) => recipe.caseId === 'delete:menu');
    const expectedSourceIds = (existingSopCasesDocument as {
      cases: Array<{ id: string; sourceIds: string[] }>;
    }).cases.find((item) => item.id === 'delete:menu')!.sourceIds;

    expect(menuDelete?.sourceIds).toEqual(expectedSourceIds);
    expect(menuDelete?.sourceIds).not.toEqual(expect.arrayContaining([
      'rule:menu-publish-generates-store-menu-and-products',
      'rule:menu-price-syncs-on-publish',
      'rule:pos-price-change-applies-after-publish',
    ]));
  });

  test('用例级来源包含统一追溯未知 ID 时必须阻断编译', async () => {
    const sourceIdsByCaseId = new Map(compilerInput.sourceIdsByCaseId);
    sourceIdsByCaseId.set('delete:menu', ['route:3cc726e3e217', 'rule:not-in-traceability']);

    const result = compileProductCenterPilotRecipes({ ...compilerInput, sourceIdsByCaseId });

    expect(result.recipes.some((recipe) => recipe.caseId === 'delete:menu')).toBe(false);
    expect(result.unresolved.find((item) => item.caseId === 'delete:menu')).toMatchObject({
      reasonCode: 'CONTRACT_INVALID',
      sourceIds: ['rule:not-in-traceability'],
    });
  });

  test('商品分类 Recipe 应声明精确覆盖能力且不得继承整页来源作为覆盖', async () => {
    const result = compileProductCenterPilotRecipes(compilerInput);
    const categoryRecipes = result.recipes.filter((recipe) => recipe.route === '/pp/brand/category');

    expect(categoryRecipes).toHaveLength(7);
    expect(new Set(categoryRecipes.flatMap((recipe) => recipe.coverageIds))).toEqual(new Set([
      'coverage:route:route:b0de43a7ecd9',
      'coverage:control:category-expand',
      'coverage:control:category-row-actions',
      'coverage:control:category-create',
      'coverage:dialog:category-row-actions',
      'coverage:validation:validation:0e0354674598',
      'coverage:control:category-add-child',
    ]));
    expect(categoryRecipes.find(
      (recipe) => recipe.caseId === 'negative:category-child-blocked-by-product',
    )).toMatchObject({
      action: 'negative',
      seed: { adapterId: 'productCenter.seedCategoryWithProduct' },
      cleanup: { adapterId: 'productCenter.cleanupSeed' },
      coverageIds: ['coverage:control:category-add-child'],
      capabilities: [
        { id: 'navigation.sidebar.open' },
        { id: 'category.attemptAddChildBlockedByProduct' },
      ],
      assertions: [
        { adapterId: 'productCenter.verifyCategoryChildBlockedApi' },
        { adapterId: 'productCenter.verifyCategoryChildBlockedUi' },
      ],
    });
  });

  test('统计标签边界应无 mutation 并保留已确认长度', async () => {
    const result = compileProductCenterPilotRecipes(compilerInput);
    const boundaries = result.recipes.filter((recipe) => recipe.action === 'boundary');

    expect(boundaries).toHaveLength(6);
    expect(boundaries.find((recipe) => recipe.caseId === 'negative:statistic-tag-second-language-max')?.capabilities[1].input)
      .toEqual({ definitionId: 'statistic-tag-second-language-max' });
    for (const recipe of boundaries) {
      expect(recipe.seed).toBeUndefined();
      expect(recipe.mutation).toBeUndefined();
      expect(recipe.cleanup).toBeUndefined();
    }
  });

  test('重复来源应进入未决且不得生成 Recipe', async () => {
    const duplicate = productCenterNegativeSopCatalog.find(
      (item) => item.id === 'statistic-tag-second-language-max',
    )!;
    const result = compileProductCenterPilotRecipes({
      core: productCenterSopCatalog,
      create: productCenterCreateSopCatalog,
      lowDependency: lowDependencySopCatalog,
      highDependency: highDependencySopCatalog,
      negative: [...productCenterNegativeSopCatalog, duplicate],
      contract: compilerInput.contract,
    });

    expect(result.recipes.some((recipe) => recipe.caseId === `negative:${duplicate.id}`)).toBe(false);
    expect(result.unresolved.find((item) => item.caseId === `negative:${duplicate.id}`)).toMatchObject({
      reasonCode: 'AMBIGUOUS_SOURCE',
    });
  });

  test('能力合同缺失时应进入未决而不是猜测', async () => {
    const result = compileProductCenterPilotRecipes(
      compilerInput,
      productCenterRecipeCapabilityContracts.filter((item) => item.id !== 'method.editIdentity'),
    );

    expect(result.recipes.some((recipe) => recipe.caseId === 'edit:method')).toBe(false);
    expect(result.unresolved.find((item) => item.caseId === 'edit:method')).toMatchObject({
      reasonCode: 'CONTRACT_INVALID',
    });
  });

  test('测试用例生成门禁未放行时不得生成 Recipe', async () => {
    const generatedCaseIds = new Set<string>(productCenterRecipeCaseIds);
    generatedCaseIds.delete('edit:method');

    const result = compileProductCenterPilotRecipes({
      ...compilerInput,
      generatedCaseIds,
    });

    expect(result.recipes.some((recipe) => recipe.caseId === 'edit:method')).toBe(false);
    expect(result.unresolved.find((item) => item.caseId === 'edit:method')).toMatchObject({
      reasonCode: 'TEST_CASE_GATE_REJECTED',
      message: '测试用例生成门禁未放行：edit:method',
    });
  });

  test('构建脚本应输出确定性且脱敏的 Recipe 合同', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'product-center-recipes-'));
    try {
      const first = await buildProductCenterRecipeArtifacts(rootDir);
      const second = await buildProductCenterRecipeArtifacts(rootDir);
      const recipeText = await readFile(first.recipePath, 'utf8');
      const unresolvedText = await readFile(first.unresolvedPath, 'utf8');

      expect(second.fingerprint).toBe(first.fingerprint);
      expect(JSON.parse(recipeText).recipes).toHaveLength(46);
      expect(JSON.parse(recipeText).recipes.every((recipe: { claimIds?: string[] }) => recipe.claimIds?.length)).toBe(true);
      expect(JSON.parse(unresolvedText).unresolved).toEqual([]);
      expect(`${recipeText}${unresolvedText}`).not.toMatch(/authorization|cookie|password|token/i);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

