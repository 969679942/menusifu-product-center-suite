import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import feedbackDocument from '../../output/recipes/product-center-pilot-feedback.json';
import incrementalDocument from '../../contracts/product-center/recipes/product-center-recipe-incremental-plan.json';
import promotionDocument from '../../contracts/product-center/recipes/product-center-recipe-promotion.json';
import recipesDocument from '../../contracts/product-center/recipes/product-center-pilot-recipes.json';
import sourceContractDocument from '../../contracts/product-center/product-center-test-contract.json';
import {
  buildProductCenterRecipeMetrics,
} from '../../automation/recipe/product-center-recipe-metrics';
import { buildProductCenterRecipeSourceIndex } from '../../automation/recipe/product-center-recipe-source-index';
import type { AutomationRecipe } from '../../automation/recipe/automation-recipe';
import { buildProductCenterRecipeMetricsArtifact } from '../../scripts/build-product-center-recipe-metrics';
import type { ProductCenterTestContract } from '../../utils/product-center-test-contract';

test.describe('商品中心 Recipe 质量指标', () => {
  test('应计算生成覆盖来源绑定人工修正和执行质量', async () => {
    const metrics = buildProductCenterRecipeMetrics({
      totalSopCases: 45,
      recipes: [
        { id: 'r1', caseId: 'c1', sourceIds: ['field-1'] },
        { id: 'r2', caseId: 'c2', sourceIds: ['field-2'] },
      ],
      unresolvedCount: 1,
      manualCorrectionCaseIds: ['c2'],
      feedback: [
        { recipeId: 'r1', status: 'passed', durationMs: 100 },
        { recipeId: 'r2', status: 'failed', durationMs: 200, classification: 'capability', diagnostic: 'locator drift' },
      ],
      promotedCaseIds: ['c1'],
      incrementalSelectedCount: 1,
      incrementalUnsupportedCount: 2,
      legacySourceAliasCount: 1,
    });

    expect(metrics.generation).toMatchObject({ compiled: 2, totalSopCases: 45, unresolved: 1, coverageRate: 0.0444 });
    expect(metrics.sources).toMatchObject({ bound: 2, bindingRate: 1, legacyAliases: 1 });
    expect(metrics.review).toMatchObject({ manualCorrections: 1, manualCorrectionRate: 0.5 });
    expect(metrics.execution).toMatchObject({ total: 2, passed: 1, failed: 1, passRate: 0.5, locatorDrift: 1, durationMs: 300, maxDurationMs: 200 });
    expect(metrics.promotion.promoted).toBe(1);
  });

  test('当前四十六条 Recipe 应输出完整生成指标', async () => {
    const recipes = (recipesDocument as unknown as { recipes: AutomationRecipe[] }).recipes;
    const sourceIndex = buildProductCenterRecipeSourceIndex(
      sourceContractDocument as unknown as ProductCenterTestContract,
    );
    const metrics = buildProductCenterRecipeMetrics({
      totalSopCases: recipes.length,
      recipes,
      unresolvedCount: 0,
      manualCorrectionCaseIds: [],
      feedback: (feedbackDocument as unknown as { entries: Array<{ recipeId: string; status: string; durationMs: number; classification: string; diagnostic?: string }> }).entries,
      promotedCaseIds: (promotionDocument as { promotedCaseIds: string[] }).promotedCaseIds,
      incrementalSelectedCount: (incrementalDocument as { selectedCaseIds: string[] }).selectedCaseIds.length,
      incrementalUnsupportedCount: (incrementalDocument as { unsupportedCaseIds: string[] }).unsupportedCaseIds.length,
      legacySourceAliasCount: sourceIndex.entries.reduce((total, entry) => total + entry.legacySourceAliases.length, 0),
    });

    expect(metrics.generation).toEqual({ totalSopCases: 46, compiled: 46, unresolved: 0, coverageRate: 1 });
    expect(metrics.sources.bindingRate).toBe(1);
    expect(metrics.execution.total).toBe((feedbackDocument as { entries: unknown[] }).entries.length);
    expect(metrics.incremental).toEqual({ selected: 4, unsupported: 0 });
    expect(metrics.promotion.promoted).toBe((promotionDocument as { promotedCaseIds: string[] }).promotedCaseIds.length);
  });

  test('指标构建脚本应确定性输出文件', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'product-center-recipe-metrics-'));
    try {
      const firstPath = await buildProductCenterRecipeMetricsArtifact(rootDir);
      const first = await readFile(firstPath, 'utf8');
      const secondPath = await buildProductCenterRecipeMetricsArtifact(rootDir);
      const second = await readFile(secondPath, 'utf8');

      expect(secondPath).toBe(firstPath);
      expect(second).toBe(first);
      expect(JSON.parse(first).generation).toMatchObject({ totalSopCases: 46, compiled: 46 });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
