import { expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import diffDocument from '../../contracts/product-center/product-center-contract-diff.json';
import recipesDocument from '../../contracts/product-center/recipes/product-center-pilot-recipes.json';
import {
  buildProductCenterIncrementalRecipePlan,
} from '../../automation/recipe/product-center-incremental-recipe-plan';
import type { AutomationRecipe } from '../../automation/recipe/automation-recipe';
import type { ProductCenterContractDiff } from '../../utils/product-center-contract-diff';
import { buildProductCenterIncrementalRecipeArtifact } from '../../scripts/build-product-center-incremental-recipes';

const recipes = (recipesDocument as unknown as { recipes: AutomationRecipe[] }).recipes;

test.describe('商品中心 Recipe 增量编译计划', () => {
  test('字段来源变化应只精确命中对应 Recipe', async () => {
    const diff: ProductCenterContractDiff = {
      fromVersion: '1.0.0', toVersion: '1.0.1', metadataChanged: true,
      summary: { added: 0, removed: 0, changed: 1, unchanged: 0 },
      changes: [{
        collection: 'fields', id: '/pp/brand/tag/statistic#action-1#primary-1#field-35',
        kind: 'changed', route: '/pp/brand/tag/statistic',
      }],
      impactedRoutes: ['/pp/brand/tag/statistic'],
      impactedCases: ['negative:statistic-tag-second-language-max'],
      impactedCaseDetails: [{
        caseId: 'negative:statistic-tag-second-language-max', match: 'source-id',
        changeIds: ['/pp/brand/tag/statistic#action-1#primary-1#field-35'],
      }],
    };

    const plan = buildProductCenterIncrementalRecipePlan(diff, recipes, '1.0.1');

    expect(plan.selectedCaseIds).toEqual(['negative:statistic-tag-second-language-max']);
    expect(plan.selectedRecipeIds).toEqual(['product-center:statistic-tag-second-language-max:boundary']);
    expect(plan.routeFallbackIgnored).toEqual([]);
  });

  test('route fallback 不得扩散到同路由其他 Recipe', async () => {
    const diff: ProductCenterContractDiff = {
      fromVersion: '1.0.0', toVersion: '1.0.1', metadataChanged: true,
      summary: { added: 0, removed: 0, changed: 1, unchanged: 0 },
      changes: [{ collection: 'controls', id: 'unmapped-control', kind: 'changed', route: '/pp/brand/category' }],
      impactedRoutes: ['/pp/brand/category'],
      impactedCases: ['edit:category', 'delete:category'],
      impactedCaseDetails: [
        { caseId: 'edit:category', match: 'route-fallback', changeIds: ['unmapped-control'] },
        { caseId: 'delete:category', match: 'route-fallback', changeIds: ['unmapped-control'] },
      ],
    };

    const plan = buildProductCenterIncrementalRecipePlan(diff, recipes, '1.0.1');

    expect(plan.selectedCaseIds).toEqual([]);
    expect(plan.routeFallbackIgnored).toEqual(['delete:category', 'edit:category']);
  });

  test('精确命中的描述标签 case 已支持时应进入执行计划', async () => {
    const diff: ProductCenterContractDiff = {
      fromVersion: '1.0.0', toVersion: '1.0.1', metadataChanged: true,
      summary: { added: 0, removed: 0, changed: 1, unchanged: 0 },
      changes: [{ collection: 'fields', id: 'field-description-50', kind: 'changed' }],
      impactedRoutes: [], impactedCases: ['negative:description-tag-second-language-max'],
      impactedCaseDetails: [{
        caseId: 'negative:description-tag-second-language-max', match: 'source-id',
        changeIds: ['field-description-50'],
      }],
    };

    const plan = buildProductCenterIncrementalRecipePlan(diff, recipes, '1.0.1');

    expect(plan.selectedCaseIds).toEqual(['negative:description-tag-second-language-max']);
    expect(plan.unsupportedCaseIds).toEqual([]);
  });

  test('当前合同差异应精确选择四个标签边界 Recipe', async () => {
    const plan = buildProductCenterIncrementalRecipePlan(
      diffDocument as unknown as ProductCenterContractDiff,
      recipes,
      '1.0.0',
    );

    expect(plan.selectedCaseIds).toEqual([
      'negative:description-tag-group-second-language-max',
      'negative:description-tag-second-language-max',
      'negative:statistic-tag-group-second-language-max',
      'negative:statistic-tag-second-language-max',
    ]);
    expect(plan.unsupportedCaseIds).toEqual([]);
    expect(plan.routeFallbackIgnored).toEqual([]);
  });

  test('构建脚本应确定性输出增量计划', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'product-center-incremental-recipes-'));
    try {
      const firstPath = await buildProductCenterIncrementalRecipeArtifact(rootDir);
      const first = await readFile(firstPath, 'utf8');
      const secondPath = await buildProductCenterIncrementalRecipeArtifact(rootDir);
      const second = await readFile(secondPath, 'utf8');

      expect(secondPath).toBe(firstPath);
      expect(second).toBe(first);
      expect(JSON.parse(first).selectedCaseIds).toHaveLength(4);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
