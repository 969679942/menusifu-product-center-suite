import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterRuntimeAcceptanceArtifact } from '../../scripts/build-product-center-runtime-acceptance';

test.describe('商品中心主 Recipe 原子验收产物', () => {
  test('应同时消费反馈证据和实际禁止模式扫描结果', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'product-center-runtime-acceptance-'));
    try {
      await mkdir(path.join(rootDir, 'contracts/product-center/recipes'), { recursive: true });
      await mkdir(path.join(rootDir, 'output/recipes'), { recursive: true });
      await mkdir(path.join(rootDir, 'tests/generated'), { recursive: true });
      await writeFile(path.join(rootDir, 'contracts/product-center/recipes/product-center-pilot-recipes.json'), JSON.stringify({
        fingerprint: 'fingerprint-1',
        recipes: [{
          id: 'recipe-1', caseId: 'case-1', sourceIds: ['route:category'],
          claimIds: ['claim:case-1:action:1'],
          capabilities: [{ id: 'navigation.sidebar.open', input: { targetPath: '/pp/brand/category' } }],
        }],
      }));
      await writeFile(path.join(rootDir, 'output/recipes/product-center-pilot-feedback.json'), JSON.stringify({
        fingerprint: 'fingerprint-1', entries: [{ recipeId: 'recipe-1', caseId: 'case-1', status: 'passed' }],
      }));
      await writeFile(path.join(rootDir, 'output/recipes/product-center-pilot-evidence.json'), JSON.stringify({
        fingerprint: 'fingerprint-1', entries: [{
          recipeId: 'recipe-1', caseId: 'case-1',
          expectedClaimIds: ['claim:case-1:action:1'],
          verifiedClaimIds: ['claim:case-1:action:1'],
          claimCoverageComplete: true, sidebarEntryVerified: true,
        }],
      }));
      await writeFile(path.join(rootDir, 'tests/generated/product-center-recipe-pilot.generated.spec.ts'), 'await flow.execute(recipe);');

      const outputPath = await buildProductCenterRuntimeAcceptanceArtifact(rootDir, { legacySourceAliases: [] });
      const artifact = JSON.parse(await readFile(outputPath, 'utf8')) as {
        accepted: boolean; acceptedCaseIds: string[]; safety: { forbiddenPatterns: number };
      };

      expect(artifact.accepted).toBe(true);
      expect(artifact.acceptedCaseIds).toEqual(['case-1']);
      expect(artifact.safety.forbiddenPatterns).toBe(0);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
