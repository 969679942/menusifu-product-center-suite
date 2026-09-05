import { expect, test } from '@playwright/test';
import { scanProductCenterForbiddenPatterns } from '../../automation/recipe/product-center-forbidden-patterns';
import type { AutomationRecipe } from '../../automation/recipe/automation-recipe';

const validRecipe: AutomationRecipe = {
  schemaVersion: '1.0.0',
  id: 'recipe-1',
  caseId: 'case-1',
  title: '分类编辑',
  tags: ['@recipe'],
  route: '/pp/brand/category',
  action: 'edit',
  traceabilityId: 'trace:sop:case-1',
  sourceIds: ['route:category'],
  claimIds: ['claim:case-1:action:1'],
  coverageIds: [],
  generationAllowed: true,
  capabilities: [
    { id: 'navigation.sidebar.open', input: { targetPath: '/pp/brand/category' } },
    { id: 'category.open', input: { record: { $ref: '$record' } } },
  ],
  assertions: [{ adapterId: 'productCenter.verifyEditedUi' }],
};

test.describe('商品中心 Recipe 禁止模式扫描', () => {
  test('受治理产物无禁止模式时应返回空结果', async () => {
    expect(scanProductCenterForbiddenPatterns({
      recipes: [validRecipe],
      generatedSpecSources: ['await flow.execute(recipe);'],
      runtimeEvidenceEntries: [{
        recipeId: 'recipe-1',
        visibleUi: { observableVisibility: 'visible', semanticKey: 'category-name', observableSemanticKey: 'category-name' },
      }],
      legacySourceAliases: [],
    })).toEqual([]);
  });

  test('应发现直接路由隐藏 DOM 原始定位器错误语义和旧来源别名', async () => {
    const findings = scanProductCenterForbiddenPatterns({
      recipes: [{
        ...validRecipe,
        capabilities: [{ id: 'category.open', input: { selector: '#category' } }],
      }],
      generatedSpecSources: ["await page.goto('/pp/brand/category'); await page.waitForTimeout(1000);"],
      runtimeEvidenceEntries: [{
        recipeId: 'recipe-1',
        visibleUi: { observableVisibility: 'hidden', semanticKey: 'created-at', observableSemanticKey: 'action-time' },
      }],
      legacySourceAliases: ['runtime-negative-contract:category-delete-cancel'],
    });

    expect(findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      'RECIPE_FIRST_CAPABILITY_NOT_SIDEBAR',
      'RECIPE_RAW_SELECTOR',
      'GENERATED_SPEC_DIRECT_ROUTE',
      'GENERATED_SPEC_FIXED_WAIT',
      'HIDDEN_UI_EVIDENCE',
      'EVIDENCE_SEMANTIC_MISMATCH',
      'LEGACY_SOURCE_ALIAS',
    ]));
  });
});
