import { expect, test } from '@playwright/test';
import type { AutomationRecipe, RecipeCapabilityContract } from '../../automation/recipe/automation-recipe';
import { recipeFingerprint, validateAutomationRecipe } from '../../automation/recipe/recipe-validator';

const capabilities: readonly RecipeCapabilityContract[] = [
  { id: 'navigation.sidebar.open', actions: ['create', 'edit', 'delete', 'negative', 'boundary', 'read'], requiredInputs: ['targetPath'] },
  { id: 'category.open', actions: ['edit', 'delete'], requiredInputs: [] },
  { id: 'category.editIdentity', actions: ['edit'], requiredInputs: ['record'] },
  { id: 'category.deleteIdentity', actions: ['delete'], requiredInputs: ['record'] },
  { id: 'statisticTag.readSecondLanguageBoundary', actions: ['boundary'], requiredInputs: ['locatorKey', 'acceptedLength', 'rejectedLength'] },
  { id: 'item.openList', actions: ['read'], requiredInputs: [] },
];

function editRecipe(): AutomationRecipe {
  return {
    schemaVersion: '1.0.0',
    id: 'product-center:category:edit',
    caseId: 'edit:category',
    title: '商品分类应通过 Recipe 完成编辑',
    tags: ['@recipe', '@sop'],
    route: '/pp/brand/category',
    action: 'edit',
    traceabilityId: 'trace:sop:edit:category',
    sourceIds: ['route:b0de43a7ecd9'],
    coverageIds: ['coverage:control:category-row-actions'],
    generationAllowed: true,
    seed: { adapterId: 'productCenter.seedCore', input: { entityKey: 'category' } },
    capabilities: [
      { id: 'navigation.sidebar.open', input: { targetPath: '/pp/brand/category' }, saveAs: 'navigation' },
      { id: 'category.open', input: { record: { $ref: '$record' } } },
      { id: 'category.editIdentity', input: { record: { $ref: '$record' } } },
    ],
    mutation: { method: 'PUT', operationKey: 'category.update' },
    assertions: [
      { adapterId: 'productCenter.verifyEditedApi' },
      { adapterId: 'productCenter.verifyEditedUi' },
    ],
    cleanup: { adapterId: 'productCenter.cleanupSeed' },
  };
}

test.describe('自动化 Recipe 合同', () => {
  test('所有 Recipe 必须把侧边栏导航声明为第一项能力', async () => {
    const recipe = editRecipe();
    recipe.capabilities = [{ id: 'category.open', input: { record: { $ref: '$record' } } }];

    const issues = validateAutomationRecipe(recipe, capabilities);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SIDEBAR_NAVIGATION_REQUIRED' }),
    ]));
  });
  test('有效编辑 Recipe 应通过校验', async () => {
    expect(validateAutomationRecipe(editRecipe(), capabilities)).toEqual([]);
  });

  test('缺少来源的 Recipe 应被拒绝', async () => {
    const recipe = editRecipe();
    recipe.sourceIds = [];

    expect(validateAutomationRecipe(recipe, capabilities)).toContainEqual({
      code: 'SOURCE_REQUIRED', path: 'sourceIds', message: 'Recipe 必须至少声明一个来源',
    });
  });

  test('缺少合同追溯根的 Recipe 应被拒绝', async () => {
    const recipe = editRecipe();
    delete (recipe as Partial<AutomationRecipe>).traceabilityId;

    expect(validateAutomationRecipe(recipe, capabilities)).toContainEqual({
      code: 'TRACEABILITY_REQUIRED', path: 'traceabilityId', message: 'Recipe 必须绑定统一合同追溯记录',
    });
  });

  test('未知能力和缺少能力输入应被拒绝', async () => {
    const recipe = editRecipe();
    recipe.capabilities = [
      { id: 'navigation.sidebar.open', input: { targetPath: '/pp/brand/category' } },
      { id: 'category.unknown' },
      { id: 'category.editIdentity' },
    ];

    const issues = validateAutomationRecipe(recipe, capabilities);
    expect(issues.map((issue) => issue.code)).toEqual(['UNKNOWN_CAPABILITY', 'CAPABILITY_INPUT_REQUIRED']);
  });

  test('能力动作不兼容和重复能力应被拒绝', async () => {
    const recipe = editRecipe();
    recipe.capabilities = [
      { id: 'navigation.sidebar.open', input: { targetPath: '/pp/brand/category' } },
      { id: 'category.deleteIdentity', input: { record: { $ref: '$record' } } },
      { id: 'category.deleteIdentity', input: { record: { $ref: '$record' } } },
    ];

    const codes = validateAutomationRecipe(recipe, capabilities).map((issue) => issue.code);
    expect(codes).toContain('CAPABILITY_ACTION_MISMATCH');
    expect(codes).toContain('DUPLICATE_CAPABILITY');
  });

  test('编辑删除必须声明 mutation 和数据生命周期', async () => {
    const recipe = editRecipe();
    delete recipe.mutation;
    delete recipe.seed;
    delete recipe.cleanup;

    const codes = validateAutomationRecipe(recipe, capabilities).map((issue) => issue.code);
    expect(codes).toEqual(['MUTATION_REQUIRED', 'SEED_REQUIRED', 'CLEANUP_REQUIRED']);
  });

  test('边界 Recipe 不得声明 mutation 或数据生命周期', async () => {
    const recipe: AutomationRecipe = {
      ...editRecipe(),
      id: 'product-center:statistic-tag:second-language-boundary',
      caseId: 'negative:statistic-tag-second-language-max',
      action: 'boundary',
      seed: { adapterId: 'productCenter.seedCore' },
      capabilities: [{ id: 'navigation.sidebar.open', input: { targetPath: '/pp/brand/tag/statistic' } }, {
        id: 'statisticTag.readSecondLanguageBoundary',
        input: { locatorKey: 'tag-second-language', acceptedLength: 50, rejectedLength: 51 },
      }],
      mutation: { method: 'PUT', operationKey: 'tag.update' },
      cleanup: { adapterId: 'productCenter.cleanupSeed' },
    };

    const codes = validateAutomationRecipe(recipe, capabilities).map((issue) => issue.code);
    expect(codes).toEqual(['BOUNDARY_MUTATION_FORBIDDEN', 'BOUNDARY_SEED_FORBIDDEN', 'BOUNDARY_CLEANUP_FORBIDDEN']);
  });

  test('只读 Recipe 不声明数据生命周期时应通过校验', async () => {
    const recipe: AutomationRecipe = {
      ...editRecipe(),
      id: 'product-center:item-list-display:read',
      caseId: 'TC-ITEM-STD-002',
      action: 'read',
      capabilities: [
        { id: 'navigation.sidebar.open', input: { targetPath: '/pp/brand/list' } },
        { id: 'item.openList' },
      ],
      assertions: [{ adapterId: 'productCenter.verifyItemListDisplayUi' }],
    };
    delete recipe.seed;
    delete recipe.mutation;
    delete recipe.cleanup;

    expect(validateAutomationRecipe(recipe, capabilities)).toEqual([]);
  });

  test('只读 Recipe 不得声明 mutation 或数据生命周期', async () => {
    const recipe: AutomationRecipe = {
      ...editRecipe(),
      id: 'product-center:item-list-display:read',
      caseId: 'TC-ITEM-STD-002',
      action: 'read',
      capabilities: [
        { id: 'navigation.sidebar.open', input: { targetPath: '/pp/brand/list' } },
        { id: 'item.openList' },
      ],
      assertions: [{ adapterId: 'productCenter.verifyItemListDisplayUi' }],
    };

    const codes = validateAutomationRecipe(recipe, capabilities).map((issue) => issue.code);
    expect(codes).toEqual([
      'READ_MUTATION_FORBIDDEN',
      'READ_SEED_FORBIDDEN',
      'READ_CLEANUP_FORBIDDEN',
    ]);
  });

  test('共享整波 Recipe 应允许生成但禁止声明单例数据生命周期', async () => {
    const recipe: AutomationRecipe = {
      ...editRecipe(),
      id: 'product-center:item-p0-wave-a:TC-ITEM-PKG-006',
      caseId: 'TC-ITEM-PKG-006',
      route: '/pp/brand/list',
      action: 'create',
      capabilities: [
        { id: 'navigation.sidebar.open', input: { targetPath: '/pp/brand/list' } },
      ],
      assertions: [],
      executionPolicy: {
        mode: 'wave-shared-chain',
        caseLevelExecutionAllowed: false,
        waveId: 'wave-a-combo',
        orchestratorSpecPath: 'tests/generated/product-center-item-p0-wave-a.generated.spec.ts',
        runtimeAcceptanceId: 'product-center-item-p0-wave-a-runtime-acceptance',
      },
    };
    delete recipe.seed;
    delete recipe.mutation;
    delete recipe.cleanup;

    expect(validateAutomationRecipe(recipe, capabilities)).toEqual([]);

    recipe.seed = { adapterId: 'productCenter.seedCore' };
    expect(validateAutomationRecipe(recipe, capabilities)).toContainEqual(expect.objectContaining({
      code: 'WAVE_EXECUTION_POLICY_INVALID',
    }));
  });

  test('Recipe 中的原始 selector 字段和无效绑定应被拒绝', async () => {
    const recipe = editRecipe();
    recipe.capabilities[0].input = {
      record: { $ref: '$unknown.value' },
      selector: 'button.primary',
    };

    const codes = validateAutomationRecipe(recipe, capabilities).map((issue) => issue.code);
    expect(codes).toContain('RAW_SELECTOR_FORBIDDEN');
    expect(codes).toContain('INVALID_VALUE_BINDING');
  });

  test('稳定指纹应忽略对象键顺序', async () => {
    const recipe = editRecipe();
    const reordered = {
      generationAllowed: recipe.generationAllowed,
      sourceIds: recipe.sourceIds,
      coverageIds: recipe.coverageIds,
      action: recipe.action,
      route: recipe.route,
      title: recipe.title,
      tags: recipe.tags,
      caseId: recipe.caseId,
      traceabilityId: recipe.traceabilityId,
      id: recipe.id,
      schemaVersion: recipe.schemaVersion,
      cleanup: recipe.cleanup,
      assertions: recipe.assertions,
      mutation: recipe.mutation,
      capabilities: recipe.capabilities,
      seed: recipe.seed,
    } as AutomationRecipe;

    expect(recipeFingerprint(reordered)).toBe(recipeFingerprint(recipe));
  });
});
