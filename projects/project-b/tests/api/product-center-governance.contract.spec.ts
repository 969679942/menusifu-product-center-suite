import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '../..');
const read = (relativePath: string): string => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test.describe('商品中心自动化治理合同', () => {
  test('Playwright 应配置全局安全收尾', async () => {
    const config = read('playwright.config.ts');
    const teardownPath = path.join(projectRoot, 'tests/setup/global.teardown.ts');

    expect(config).toContain('globalTeardown');
    expect(fs.existsSync(teardownPath)).toBe(true);
    const teardown = fs.readFileSync(teardownPath, 'utf8');
    expect(teardown).toContain('removeAuthState');
    expect(teardown).toContain('recoverProductCenterCheckpoints');
    expect(teardown).toContain('scanGeneratedArtifacts');
    expect(teardown).toContain("scanGeneratedArtifacts('output', { modifiedAfterMs })");
    expect(teardown).toContain('pruneCompletedCheckpoints');
    expect(teardown).toContain('pruneTimingReports');
  });

  test('商户选择必须同时锁定商户名称与 Brand ID', async () => {
    const page = read('pages/auth-login.page.ts');
    const flow = read('flows/auth.flow.ts');
    const env = read('test-data/env.ts');
    const auth = read('test-data/auth.ts');

    expect(page).toContain("getByRole('dialog')");
    expect(page).toContain('Brand ID:');
    expect(page).toContain('exact: true');
    expect(flow).toContain('brandId');
    expect(env).toContain('brandId');
    expect(auth).toContain('brandId');
  });

  test('项目内覆盖矩阵必须固定 18 个实体并标记缺口', async () => {
    const matrixPath = path.join(projectRoot, 'contracts/product-center/product-center-coverage-matrix.json');
    expect(fs.existsSync(matrixPath)).toBe(true);
    const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8')) as {
      entities: Array<{ entity: string; route: string; coverage: string }>;
      summary: { totalEntities: number; uncovered: number; apiOnly: number; notApplicable: number; reviewRequired: number };
    };

    expect(matrix.summary.totalEntities).toBe(18);
    expect(matrix.entities).toHaveLength(18);
    expect(matrix.entities.every((item) => item.entity && item.route && item.coverage)).toBe(true);
    expect(matrix.summary.uncovered + matrix.summary.apiOnly + matrix.summary.notApplicable + matrix.summary.reviewRequired).toBeGreaterThan(0);
  });

  test('治理命令必须可单独执行', async () => {
    const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(packageJson.scripts['verify:product-center:agents']).toContain('playwright test');
    expect(packageJson.scripts['generate:product-center:coverage']).toContain('tsx');
  });

  test('Recipe 编译产物和生成 Spec 必须遵守统一治理合同', async () => {
    const recipes = JSON.parse(read('contracts/product-center/recipes/product-center-pilot-recipes.json')) as {
      recipes: Array<{ sourceIds: string[]; capabilities: Array<{ id: string }> }>;
    };
    const unresolved = JSON.parse(read('contracts/product-center/recipes/product-center-recipe-unresolved.json')) as {
      unresolved: unknown[];
    };
    const generatedSpec = read('tests/generated/product-center-recipe-pilot.generated.spec.ts');
    const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

    expect(recipes.recipes).toHaveLength(46);
    expect(recipes.recipes.every((recipe) => recipe.sourceIds.length > 0 && recipe.capabilities.length > 0)).toBe(true);
    expect(recipes.recipes.every((recipe) => 'traceabilityId' in recipe)).toBe(true);
    expect(JSON.stringify(recipes)).not.toMatch(/"(selector|locator|xpath|css)"\s*:/i);
    expect(unresolved.unresolved).toEqual([]);
    expect(generatedSpec).toContain('flow.execute(recipe)');
    expect(generatedSpec).not.toMatch(/\.locator\(|getByRole\(|\.click\(|\.fill\(|switch\s*\(|if\s*\(/);
    expect(packageJson.scripts['test:product-center:sop:all:contracts']).toContain('test:product-center:recipes:contracts');
  });

  test('Recipe 增量晋级与指标必须形成闭环', async () => {
    const incremental = JSON.parse(read('contracts/product-center/recipes/product-center-recipe-incremental-plan.json')) as {
      selectedCaseIds: string[]; unsupportedCaseIds: string[]; routeFallbackIgnored: string[];
    };
    const promotion = JSON.parse(read('contracts/product-center/recipes/product-center-recipe-promotion.json')) as {
      status: string; promotedCaseIds: string[];
    };
    const metrics = JSON.parse(read('contracts/product-center/recipes/product-center-recipe-metrics.json')) as {
      generation: { compiled: number; unresolved: number; coverageRate: number };
      sources: { bindingRate: number };
      execution: { passed: number; failed: number; locatorDrift: number };
    };

    expect(incremental.selectedCaseIds).toHaveLength(4);
    expect(incremental.unsupportedCaseIds).toHaveLength(0);
    expect(incremental.routeFallbackIgnored).toEqual([]);
    expect(promotion).toMatchObject({ status: 'eligible' });
    expect(promotion.promotedCaseIds).toHaveLength(46);
    expect(metrics.generation).toMatchObject({ compiled: 46, unresolved: 0, coverageRate: 1 });
    expect(metrics.sources.bindingRate).toBe(1);
    expect(metrics.execution).toMatchObject({ passed: 46, failed: 0, locatorDrift: 0 });
  });
});
