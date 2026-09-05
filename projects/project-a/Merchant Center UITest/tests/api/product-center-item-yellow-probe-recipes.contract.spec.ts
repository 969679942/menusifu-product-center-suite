import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { productCenterRecipeCapabilityContracts } from '../../adapters/product-center/product-center-recipe-capabilities';
import { validateAutomationRecipe } from '../../automation/recipe/recipe-validator';
import { buildProductCenterItemYellowProbeRecipeArtifacts } from '../../scripts/build-product-center-item-yellow-probe-recipes';

test.describe('商品中心黄色用例共享链 Recipe 编译', () => {
  test('应为58条黄色用例逐条生成Recipe并按34组共享执行', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const { collection, report } = buildProductCenterItemYellowProbeRecipeArtifacts({
      projectRoot,
      generatedAt: '2026-07-31T13:15:00.000Z',
    });

    expect(collection).toMatchObject({
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-yellow-shared-chain-probe-recipes',
      status: 'compiled-awaiting-wave-executors',
      summary: {
        yellowCases: 58,
        yellowTemplates: 34,
        caseRecipes: 58,
        executorGroups: 34,
        structurallyCompiled: 58,
        compileBlocked: 0,
        humanReviewRequired: 0,
        waves: {
          Y1: { templates: 8, cases: 14, riskLevel: 'L0' },
          Y2: { templates: 1, cases: 1, riskLevel: 'L1' },
          Y3: { templates: 19, cases: 37, riskLevel: 'L2' },
          Y4: { templates: 6, cases: 6, riskLevel: 'L3' },
        },
      },
    });
    expect(collection.recipes).toHaveLength(58);
    expect(new Set(collection.recipes.map((recipe) => recipe.caseId)).size).toBe(58);
    expect(collection.recipes.every((recipe) => (
      recipe.generationAllowed === false
      && recipe.capabilities[0]?.id === 'navigation.sidebar.open'
      && recipe.executionPolicy?.mode === 'wave-shared-chain'
      && recipe.executionPolicy.caseLevelExecutionAllowed === false
      && !recipe.seed
      && !recipe.mutation
      && !recipe.cleanup
      && validateAutomationRecipe(recipe, productCenterRecipeCapabilityContracts).length === 0
    ))).toBe(true);
    expect(report).toMatchObject({
      status: 'compiled-awaiting-wave-executors',
      compile: { total: 58, passed: 58, blocked: 0 },
      execution: {
        Y1: 'executor-required',
        Y2: 'executor-required',
        Y3: 'executor-required',
        Y4: 'blocked-until-controlled-channel',
      },
      policy: {
        representativeOnly: false,
        evidenceInheritanceAllowed: false,
        caseLevelEvidenceRequired: true,
        sharedChainSetupReuseAllowed: true,
        nonIdempotentReplayRequiresReconciliation: true,
        cleanupInFinally: true,
      },
    });
  });

  test('编译产物应落盘且只允许在共享链中逐用例留证', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const paths = buildProductCenterItemYellowProbeRecipeArtifacts({ projectRoot });
    expect(fs.existsSync(paths.recipePath)).toBe(true);
    expect(fs.existsSync(paths.reportPath)).toBe(true);
    expect(fs.existsSync(paths.manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(paths.manifestPath, 'utf8')) as any;
    expect(manifest.executionPolicy).toMatchObject({
      mode: 'wave-shared-chain',
      caseLevelExecutionAllowed: false,
      caseRecipes: 58,
      executorGroups: 34,
      caseEvidenceRequired: 58,
      evidenceInheritanceAllowed: false,
    });
    expect(manifest.waves.every((wave: any) => (
      wave.sharedChainAnchorCaseIds.length === wave.templateCount
      && wave.caseIds.length === wave.caseCount
    ))).toBe(true);
  });
});
