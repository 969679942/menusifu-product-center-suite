import { expect, test } from '@playwright/test';
import contractDocument from '../../contracts/product-center/product-center-test-contract.json';
import type { AutomationRecipe, RecipeAdapterCall, RecipeCapabilityStep } from '../../automation/recipe/automation-recipe';
import { compileProductCenterPilotRecipes } from '../../automation/recipe/product-center-recipe-compiler';
import {
  ProductCenterRecipeFlow,
  resolveRecipeInput,
  type ProductCenterRecipeExecutionContext,
  type ProductCenterRecipeFlowPort,
} from '../../flows/product-center/product-center-recipe.flow';
import { productCenterNegativeSopCatalog } from '../../sop/product-center/product-center-negative-sop.catalog';
import { productCenterCreateSopCatalog } from '../../sop/product-center/product-center-create-sop.catalog';
import { highDependencySopCatalog } from '../../sop/product-center/product-center-high-dependency-sop.catalog';
import { lowDependencySopCatalog } from '../../sop/product-center/product-center-low-dependency-sop.catalog';
import { productCenterSopCatalog } from '../../sop/product-center/product-center-sop.catalog';
import type { ProductCenterTestContract } from '../../utils/product-center-test-contract';

const recipes = compileProductCenterPilotRecipes({
  core: productCenterSopCatalog,
  create: productCenterCreateSopCatalog,
  lowDependency: lowDependencySopCatalog,
  highDependency: highDependencySopCatalog,
  negative: productCenterNegativeSopCatalog,
  contract: contractDocument as unknown as ProductCenterTestContract,
}).recipes;

function createPort(
  calls: string[],
  failCapability?: string,
  failAssertion?: string,
  beforeCleanup?: ProductCenterRecipeFlowPort['beforeCleanup'],
): ProductCenterRecipeFlowPort {
  return {
    beforeCleanup,
    seed: async (call, recipe) => {
      calls.push(`seed:${call.adapterId}`);
      return {
        recipe,
        record: { id: 407, originalIdentity: 'AUTO_AUDIT_ORIGINAL', editedIdentity: 'AUTO_AUDIT_EDITED' },
        results: {},
      } as ProductCenterRecipeExecutionContext;
    },
    executeCapability: async (step: RecipeCapabilityStep, context, input) => {
      const record = input.record as { id?: number; parentCategoryId?: number } | undefined;
      calls.push(`capability:${step.id}:${String(record?.id ?? record?.parentCategoryId ?? '')}`);
      if (step.id === failCapability) throw new Error('能力执行失败');
      const result = { capabilityId: step.id };
      context.results[step.id] = result;
      return result;
    },
      assert: async (call: RecipeAdapterCall) => {
      calls.push(`assert:${call.adapterId}`);
      if (call.adapterId === failAssertion) throw new Error('断言失败');
    },
    cleanup: async (call: RecipeAdapterCall) => {
      calls.push(`cleanup:${call.adapterId}`);
    },
  };
}

test.describe('商品中心 Recipe 通用 Flow 合同', () => {
  test('只读 Recipe 应仅执行页面能力和 UI 断言', async () => {
    const calls: string[] = [];
    const recipe: AutomationRecipe = {
      schemaVersion: '1.0.0',
      id: 'product-center:item-list-display:read',
      caseId: 'TC-ITEM-STD-002',
      title: '商品列表页面展示正确',
      tags: ['@item-intake-pilot', '@read'],
      route: '/pp/brand/list',
      action: 'read',
      traceabilityId: 'trace:sop:TC-ITEM-STD-002',
      sourceIds: ['test-scheme:item:TC-ITEM-STD-002'],
      coverageIds: ['coverage:route:route:cc612d39a954'],
      generationAllowed: true,
      capabilities: [
        { id: 'navigation.sidebar.open', input: { targetPath: '/pp/brand/list' } },
        { id: 'item.openList' },
      ],
      assertions: [{ adapterId: 'productCenter.verifyItemListDisplayUi' }],
    };

    await new ProductCenterRecipeFlow(createPort(calls)).execute(recipe);

    expect(calls).toEqual([
      'capability:navigation.sidebar.open:',
      'capability:item.openList:',
      'assert:productCenter.verifyItemListDisplayUi',
    ]);
  });

  test('编辑 Recipe 应按前置能力断言清理顺序执行', async () => {
    const calls: string[] = [];
    const recipe = recipes.find((item) => item.caseId === 'edit:category')!;

    const context = await new ProductCenterRecipeFlow(createPort(calls)).execute(recipe);

    expect(calls).toEqual([
      'seed:productCenter.seedCore',
      'capability:navigation.sidebar.open:',
      'capability:category.open:407',
      'capability:category.editIdentity:407',
      'assert:productCenter.verifyEditedApi',
      'assert:productCenter.verifyEditedUi',
      'cleanup:productCenter.cleanupSeed',
    ]);
    expect(context.phaseDurationsMs).toEqual(expect.objectContaining({
      seed: expect.any(Number),
      sidebar: expect.any(Number),
      uiAction: expect.any(Number),
      apiAssertion: expect.any(Number),
      uiAssertion: expect.any(Number),
      cleanup: expect.any(Number),
    }));
  });

  test('清理前应先提供一次页面证据采集机会且仍保证 cleanup', async () => {
    const calls: string[] = [];
    const recipe = recipes.find((item) => item.caseId === 'edit:category')!;

    await new ProductCenterRecipeFlow(createPort(
      calls,
      undefined,
      undefined,
      async () => { calls.push('before-cleanup'); },
    )).execute(recipe);

    expect(calls.indexOf('before-cleanup')).toBeGreaterThan(-1);
    expect(calls.indexOf('before-cleanup')).toBeLessThan(calls.indexOf('cleanup:productCenter.cleanupSeed'));
  });

  test('成功执行后应按前置动作预期阶段记录实际验证 Claim', async () => {
    const calls: string[] = [];
    const source = recipes.find((item) => item.caseId === 'edit:category')!;
    const recipe: AutomationRecipe = {
      ...source,
      claimIds: [
        'claim:edit:category:precondition:1',
        'claim:edit:category:action:1',
        'claim:edit:category:expectation:1',
      ],
    };

    const context = await new ProductCenterRecipeFlow(createPort(calls)).execute(recipe);

    expect(context.claimVerification).toEqual({
      precondition: ['claim:edit:category:precondition:1'],
      action: ['claim:edit:category:action:1'],
      expectation: ['claim:edit:category:expectation:1'],
    });
    expect(context.verifiedClaimIds).toEqual(recipe.claimIds);
  });

  test('canonical 连字符 Claim 编号应按前置动作预期阶段记录', async () => {
    const calls: string[] = [];
    const source = recipes.find((item) => item.caseId === 'edit:category')!;
    const recipe: AutomationRecipe = {
      ...source,
      claimIds: [
        'TC-ITEM-STD-007:precondition-1',
        'TC-ITEM-STD-007:action-1',
        'TC-ITEM-STD-007:expectation-1',
      ],
    };

    const context = await new ProductCenterRecipeFlow(createPort(calls)).execute(recipe);

    expect(context.claimVerification).toEqual({
      precondition: ['TC-ITEM-STD-007:precondition-1'],
      action: ['TC-ITEM-STD-007:action-1'],
      expectation: ['TC-ITEM-STD-007:expectation-1'],
    });
    expect(context.verifiedClaimIds).toEqual(recipe.claimIds);
  });

  test('能力失败时仍应执行一次清理', async () => {
    const calls: string[] = [];
    const recipe = recipes.find((item) => item.caseId === 'delete:method')!;

    await expect(new ProductCenterRecipeFlow(createPort(calls, 'method.deleteIdentity')).execute(recipe))
      .rejects.toThrow('能力执行失败');

    expect(calls.filter((item) => item === 'capability:method.deleteIdentity:407')).toHaveLength(1);
    expect(calls.filter((item) => item === 'cleanup:productCenter.cleanupSeed')).toHaveLength(1);
  });

  test('删除断言失败时不得重放 UI 删除', async () => {
    const calls: string[] = [];
    const recipe = recipes.find((item) => item.caseId === 'delete:category')!;

    await expect(new ProductCenterRecipeFlow(createPort(calls, undefined, 'productCenter.verifyAbsentApi')).execute(recipe))
      .rejects.toThrow('断言失败');

    expect(calls.filter((item) => item.startsWith('capability:category.deleteIdentity'))).toHaveLength(1);
    expect(calls.filter((item) => item === 'cleanup:productCenter.cleanupSeed')).toHaveLength(1);
  });

  test('边界 Recipe 不应执行 seed 或 cleanup', async () => {
    const calls: string[] = [];
    const recipe = recipes.find((item) => item.caseId === 'negative:statistic-tag-second-language-max')!;

    await new ProductCenterRecipeFlow(createPort(calls)).execute(recipe);

    expect(calls.some((item) => item.startsWith('seed:'))).toBe(false);
    expect(calls.some((item) => item.startsWith('cleanup:'))).toBe(false);
    expect(calls).toEqual([
      'capability:navigation.sidebar.open:',
      'capability:negative.execute:',
      'assert:productCenter.verifyBoundary',
    ]);
  });

  test('创建 Recipe 应按准备、UI 创建、API 登记、UI 验证和清理顺序执行', async () => {
    const calls: string[] = [];
    const recipe = recipes.find((item) => item.caseId === 'create:category')!;

    await new ProductCenterRecipeFlow(createPort(calls)).execute(recipe);

    expect(calls).toEqual([
      'seed:productCenter.prepareCreate',
      'capability:navigation.sidebar.open:',
      'capability:coreCreate.execute:407',
      'assert:productCenter.verifyCreatedApi',
      'assert:productCenter.verifyCreatedUi',
      'cleanup:productCenter.cleanupSeed',
    ]);
  });

  test('低依赖与高依赖 Recipe 应复用统一执行能力', async () => {
    const calls: string[] = [];
    const low = recipes.find((item) => item.caseId === 'edit:taste')!;
    const high = recipes.find((item) => item.caseId === 'delete:combo')!;

    await new ProductCenterRecipeFlow(createPort(calls)).execute(low);
    await new ProductCenterRecipeFlow(createPort(calls)).execute(high);

    expect(calls).toContain('seed:productCenter.seedLowDependency');
    expect(calls).toContain('capability:lowDependency.execute:407');
    expect(calls).toContain('seed:productCenter.seedHighDependency');
    expect(calls).toContain('capability:highDependency.execute:407');
  });

  test('普通负向 Recipe 应执行单一负向能力且不自动清理', async () => {
    const calls: string[] = [];
    const recipe = recipes.find((item) => item.caseId === 'negative:method-required')!;

    await new ProductCenterRecipeFlow(createPort(calls)).execute(recipe);

    expect(calls).toEqual([
      'capability:navigation.sidebar.open:',
      'capability:negative.execute:',
      'assert:productCenter.verifyNegative',
    ]);
  });

  test('分类下已有商品时应按 Seed、单次 UI 操作、双端验证和清理顺序执行', async () => {
    const calls: string[] = [];
    const recipe = recipes.find(
      (item) => item.caseId === 'negative:category-child-blocked-by-product',
    )!;

    await new ProductCenterRecipeFlow(createPort(calls)).execute(recipe);

    expect(calls).toEqual([
      'seed:productCenter.seedCategoryWithProduct',
      'capability:navigation.sidebar.open:',
      'capability:category.attemptAddChildBlockedByProduct:407',
      'assert:productCenter.verifyCategoryChildBlockedApi',
      'assert:productCenter.verifyCategoryChildBlockedUi',
      'cleanup:productCenter.cleanupSeed',
    ]);
    expect(calls.filter((item) => item === 'capability:category.attemptAddChildBlockedByProduct:407'))
      .toHaveLength(1);
  });

  test('值绑定应精确解析记录、Recipe 和结果路径', async () => {
    const recipe = recipes[0];
    const context: ProductCenterRecipeExecutionContext = {
      recipe,
      record: { id: 407, originalIdentity: 'AUTO_AUDIT_ORIGINAL' } as ProductCenterRecipeExecutionContext['record'],
      results: { boundary: { acceptedValue: 'A'.repeat(50) } },
    };

    expect(resolveRecipeInput({
      id: { $ref: '$record.id' },
      route: { $ref: '$recipe.route' },
      value: { $ref: '$result.boundary.acceptedValue' },
    }, context)).toEqual({
      id: 407,
      route: recipe.route,
      value: 'A'.repeat(50),
    });
  });
});
