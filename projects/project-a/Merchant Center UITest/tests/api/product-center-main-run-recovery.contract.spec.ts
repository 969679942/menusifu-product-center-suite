import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  productCenterMainRunConfig,
  selectProductCenterMainRecipes,
} from '../../scripts/run-product-center-main-recipes';
import {
  publishProductCenterCompletedRunArtifacts,
  runProductCenterRecipeCollectionSelection,
} from '../../scripts/product-center-recipe-collection-runner';
import type { AutomationRecipe } from '../../automation/recipe/automation-recipe';

test.describe('商品中心主集合失败隔离恢复合同', () => {
  test('主集合 runner 应选择完整 Recipe 分母并复用安全 collection runner', async () => {
    const recipes = [recipe('case-a'), recipe('case-b')];

    expect(productCenterMainRunConfig).toEqual({
      collectionId: 'product-center-pilot',
      specPath: 'tests/generated/product-center-recipe-pilot.generated.spec.ts',
      runIdPrefix: 'AUTO_AUDIT_RUN',
    });
    expect(selectProductCenterMainRecipes(recipes)).toMatchObject({
      scope: 'full',
      selectedCaseIds: ['case-a', 'case-b'],
    });
  });

  test('主集合应支持页面合同生成的精确 impacted caseId 集合', async () => {
    const recipes = [recipe('case-a'), recipe('case-b'), recipe('case-c')];
    expect(selectProductCenterMainRecipes(recipes, ['case-c', 'case-a', 'case-a'])).toMatchObject({
      scope: 'impacted',
      selectedCaseIds: ['case-a', 'case-c'],
      reasons: [
        { caseId: 'case-a', matches: ['page-contract-impact'] },
        { caseId: 'case-c', matches: ['page-contract-impact'] },
      ],
    });
  });

  test('隔离恢复成功后应把完整 merged feedback 和 evidence 发布为 full latest', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-main-recovery-'));
    const runId = 'main-run-001';
    const runDirectory = path.join(
      rootDir,
      'output/recipes/runs/product-center-pilot',
      runId,
    );
    try {
      fs.mkdirSync(runDirectory, { recursive: true });
      fs.writeFileSync(path.join(runDirectory, 'feedback.json'), JSON.stringify({
        schemaVersion: '1.0.0',
        fingerprint: 'recipe-fingerprint',
        runId,
        scope: 'recovery',
        selectedCaseIds: ['case-b'],
        entries: [
          { recipeId: 'recipe:case-a', caseId: 'case-a', status: 'passed' },
          { recipeId: 'recipe:case-b', caseId: 'case-b', status: 'passed' },
        ],
      }));
      fs.writeFileSync(path.join(runDirectory, 'evidence.json'), JSON.stringify({
        schemaVersion: '1.0.0',
        fingerprint: 'recipe-fingerprint',
        runId,
        scope: 'recovery',
        selectedCaseIds: ['case-b'],
        entries: [
          { recipeId: 'recipe:case-a', caseId: 'case-a' },
          { recipeId: 'recipe:case-b', caseId: 'case-b' },
        ],
      }));

      publishProductCenterCompletedRunArtifacts({
        rootDir,
        config: productCenterMainRunConfig,
        runId,
        scope: 'full',
        selectedCaseIds: ['case-a', 'case-b'],
      });

      for (const artifactName of ['feedback', 'evidence'] as const) {
        const latest = JSON.parse(fs.readFileSync(path.join(
          rootDir,
          `output/recipes/product-center-pilot-${artifactName}.json`,
        ), 'utf8')) as Record<string, unknown>;
        expect(latest).toMatchObject({
          runId,
          scope: 'full',
          selectedCaseIds: ['case-a', 'case-b'],
        });
        expect(latest.entries).toHaveLength(2);
      }
      expect(JSON.parse(fs.readFileSync(path.join(runDirectory, 'manifest.json'), 'utf8')))
        .toMatchObject({ runId, scope: 'full' });
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('首轮仅一条 transient 失败时第二轮应只执行失败 case', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-main-isolated-retry-'));
    const recipes = [recipe('case-a'), recipe('case-b')];
    const attempts: string[][] = [];
    try {
      const run = await runProductCenterRecipeCollectionSelection(
        rootDir,
        recipes,
        selectProductCenterMainRecipes(recipes),
        productCenterMainRunConfig,
        {
          repeatEach: 1,
          workers: 2,
          authStatePath: path.join(rootDir, 'auth-state.json'),
          noDependencies: false,
          delay: async () => undefined,
          executePlaywright: (_executionRoot, input) => {
            attempts.push([...input.selectedCaseIds]);
            const runDirectory = path.join(
              rootDir,
              'output/recipes/runs/product-center-pilot',
              input.runId,
            );
            fs.mkdirSync(runDirectory, { recursive: true });
            const recovered = attempts.length > 1;
            fs.writeFileSync(path.join(runDirectory, 'feedback.json'), JSON.stringify({
              schemaVersion: '1.0.0',
              runId: input.runId,
              scope: input.scope,
              entries: [
                { recipeId: 'recipe:case-a', caseId: 'case-a', status: 'passed' },
                {
                  recipeId: 'recipe:case-b',
                  caseId: 'case-b',
                  status: recovered ? 'passed' : 'timedOut',
                  diagnostic: recovered ? undefined : 'HTTP 429 Too Many Requests',
                },
              ],
            }));
            fs.writeFileSync(path.join(runDirectory, 'evidence.json'), JSON.stringify({
              schemaVersion: '1.0.0',
              runId: input.runId,
              scope: input.scope,
              entries: [
                { recipeId: 'recipe:case-a', caseId: 'case-a' },
                ...(recovered ? [{ recipeId: 'recipe:case-b', caseId: 'case-b' }] : []),
              ],
            }));
            return recovered ? 0 : 1;
          },
        },
      );

      expect(attempts).toEqual([
        ['case-a', 'case-b'],
        ['case-b'],
      ]);
      expect(run.selectedCaseIds).toEqual(['case-a', 'case-b']);
      const latest = JSON.parse(fs.readFileSync(path.join(
        rootDir,
        'output/recipes/product-center-pilot-feedback.json',
      ), 'utf8')) as { scope: string; selectedCaseIds: string[]; entries: unknown[] };
      expect(latest).toMatchObject({
        scope: 'full',
        selectedCaseIds: ['case-a', 'case-b'],
      });
      expect(latest.entries).toHaveLength(2);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('npm 主集合入口应使用隔离恢复 runner 而不是直接调用 Playwright', async () => {
    const packageDocument = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageDocument.scripts['test:product-center:recipes'])
      .toContain('tsx scripts/run-product-center-main-recipes.ts');
    expect(packageDocument.scripts['test:product-center:recipes'])
      .not.toContain('playwright test tests/generated/product-center-recipe-pilot.generated.spec.ts');
    expect(packageDocument.scripts['test:product-center:recipes:contracts'])
      .toContain('tests/api/product-center-main-run-recovery.contract.spec.ts');
  });
});

function recipe(caseId: string): AutomationRecipe {
  return {
    schemaVersion: '1.0.0',
    id: `recipe:${caseId}`,
    caseId,
    title: caseId,
    tags: ['@main'],
    route: `/route/${caseId}`,
    action: 'read',
    traceabilityId: `trace:sop:${caseId}`,
    sourceIds: [`source:${caseId}`],
    claimIds: [`claim:${caseId}`],
    coverageIds: [],
    generationAllowed: true,
    capabilities: [
      { id: 'navigation.sidebar.open', input: { targetPath: `/route/${caseId}` } },
      { id: 'entity.read' },
    ],
    assertions: [{ adapterId: 'assert.entity' }],
  };
}
