import { expect, test } from '@playwright/test';
import contractDocument from '../../contracts/product-center/product-center-test-contract.json';
import { productCenterRecipeCaseIds } from '../../automation/recipe/product-center-recipe-compiler';
import {
  buildProductCenterRecipeCoverage,
} from '../../automation/recipe/product-center-recipe-coverage';
import { buildProductCenterRecipeSourceIndex } from '../../automation/recipe/product-center-recipe-source-index';
import type { ProductCenterTestContract } from '../../utils/product-center-test-contract';

test.describe('商品中心 Recipe 覆盖矩阵合同', () => {
  test('应将四十六条统一合同 SOP 精确分类为全量已编译', () => {
    const sourceIndex = buildProductCenterRecipeSourceIndex(
      contractDocument as unknown as ProductCenterTestContract,
    );
    const coverage = buildProductCenterRecipeCoverage(sourceIndex, productCenterRecipeCaseIds);

    expect(coverage.total).toBe(46);
    expect(coverage.compiled).toBe(46);
    expect(coverage.pending).toBe(0);
    expect(coverage.unknownCaseIds).toEqual([]);
    expect(coverage.duplicateCaseIds).toEqual([]);
    expect(new Set(coverage.entries.map((entry) => entry.caseId)).size).toBe(46);
    expect(coverage.entries.every((entry) => entry.sourceIds.length > 0)).toBe(true);
  });

  test('应按创建、核心 CRUD、低依赖、高依赖和负向场景分类', () => {
    const sourceIndex = buildProductCenterRecipeSourceIndex(
      contractDocument as unknown as ProductCenterTestContract,
    );
    const coverage = buildProductCenterRecipeCoverage(sourceIndex, productCenterRecipeCaseIds);
    const count = (group: typeof coverage.entries[number]['group']) =>
      coverage.entries.filter((entry) => entry.group === group).length;

    expect(count('core-create')).toBe(5);
    expect(count('core-crud')).toBe(10);
    expect(count('low-dependency-crud')).toBe(13);
    expect(count('high-dependency-crud')).toBe(6);
    expect(count('negative')).toBe(12);
  });
});
