import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildProductCenterTestPlanGoldSetRuntimeAcceptanceArtifact } from '../../scripts/build-product-center-test-plan-gold-set-runtime-acceptance';

test.describe('商品中心真实测试方案金标集运行验收产物', () => {
  test('应独立消费金标反馈和证据并通过安全门禁', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'product-center-gold-acceptance-'));
    try {
      await mkdir(path.join(rootDir, 'contracts/product-center/recipes'), { recursive: true });
      await mkdir(path.join(rootDir, 'contracts/product-center/test-cases/pilots'), { recursive: true });
      await mkdir(path.join(rootDir, 'output/recipes'), { recursive: true });
      await mkdir(path.join(rootDir, 'tests/generated'), { recursive: true });
      await writeFile(
        path.join(rootDir, 'contracts/product-center/recipes/product-center-test-plan-gold-set-recipes.json'),
        JSON.stringify({
          fingerprint: 'gold-fingerprint',
          recipes: [{
            id: 'product-center:test-plan-gold-set:case-1',
            caseId: 'case-1',
            sourceIds: ['route:category'],
            claimIds: ['claim:case-1:action:1'],
            capabilities: [{ id: 'navigation.sidebar.open', input: { targetPath: '/pp/brand/category' } }],
          }],
        }),
      );
      await writeFile(
        path.join(rootDir, 'contracts/product-center/test-cases/pilots/product-center-test-plan-gold-set.json'),
        JSON.stringify({ cases: [{ id: 'case-1', module: 'brand-item' }] }),
      );
      await writeFile(
        path.join(rootDir, 'output/recipes/product-center-test-plan-gold-set-feedback.json'),
        JSON.stringify({
          fingerprint: 'gold-fingerprint',
          entries: [{
            recipeId: 'product-center:test-plan-gold-set:case-1',
            caseId: 'case-1',
            status: 'passed',
          }],
        }),
      );
      await writeFile(
        path.join(rootDir, 'output/recipes/product-center-test-plan-gold-set-evidence.json'),
        JSON.stringify({
          fingerprint: 'gold-fingerprint',
          entries: [{
            recipeId: 'product-center:test-plan-gold-set:case-1',
            caseId: 'case-1',
            expectedClaimIds: ['claim:case-1:action:1'],
            verifiedClaimIds: ['claim:case-1:action:1'],
            claimCoverageComplete: true,
            sidebarEntryVerified: true,
          }],
        }),
      );
      await writeFile(
        path.join(rootDir, 'tests/generated/product-center-test-plan-gold-set.generated.spec.ts'),
        'await flow.execute(recipe);',
      );

      const outputPath = await buildProductCenterTestPlanGoldSetRuntimeAcceptanceArtifact(rootDir);
      const artifact = JSON.parse(await readFile(outputPath, 'utf8'));

      expect(outputPath).toBe(path.join(
        rootDir,
        'output/recipes/product-center-test-plan-gold-set-acceptance.json',
      ));
      expect(artifact).toMatchObject({
        collectionId: 'product-center-test-plan-gold-set',
        fingerprint: 'gold-fingerprint',
        accepted: true,
        acceptedCaseIds: ['case-1'],
        caseAcceptance: [{ caseId: 'case-1', accepted: true, issues: [] }],
        issues: [],
        safety: {
          incompleteCheckpoints: 0,
          sensitiveFindings: 0,
          authStateArtifacts: 0,
          forbiddenPatterns: 0,
        },
      });
      expect(JSON.parse(await readFile(path.join(
        rootDir,
        'output/recipes/product-center-acceptance-history.json',
      ), 'utf8')).runs).toHaveLength(1);

      const runId = 'gold-run-001';
      const runDirectory = path.join(
        rootDir,
        'output/recipes/runs/product-center-test-plan-gold-set',
        runId,
      );
      await mkdir(runDirectory, { recursive: true });
      await writeFile(
        path.join(runDirectory, 'feedback.json'),
        await readFile(path.join(
          rootDir,
          'output/recipes/product-center-test-plan-gold-set-feedback.json',
        )),
      );
      await writeFile(
        path.join(runDirectory, 'evidence.json'),
        await readFile(path.join(
          rootDir,
          'output/recipes/product-center-test-plan-gold-set-evidence.json',
        )),
      );
      await buildProductCenterTestPlanGoldSetRuntimeAcceptanceArtifact(rootDir, {
        runId,
        scope: 'single',
        selectedCaseIds: ['case-1'],
        publishLatest: false,
      });
      const manifest = JSON.parse(await readFile(path.join(runDirectory, 'manifest.json'), 'utf8'));
      expect(manifest.artifacts).toContain('acceptance.json');
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
