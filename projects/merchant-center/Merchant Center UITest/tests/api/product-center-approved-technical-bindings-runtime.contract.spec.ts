import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProductCenterApprovedTechnicalBindingsRuntimeAcceptanceArtifact } from '../../scripts/build-product-center-approved-technical-bindings-runtime-acceptance';

test.describe('商品中心已审批技术绑定独立运行闭环', () => {
  test('应独立消费 approved 反馈证据并写入不可变 acceptance', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-approved-bindings-acceptance-'));
    const runId = 'approved-run-001';
    const runDirectory = path.join(
      rootDir,
      'output/recipes/runs/product-center-approved-technical-bindings',
      runId,
    );
    try {
      fs.mkdirSync(path.join(rootDir, 'contracts/product-center/recipes'), { recursive: true });
      fs.mkdirSync(path.join(rootDir, 'tests/generated'), { recursive: true });
      fs.mkdirSync(runDirectory, { recursive: true });
      fs.writeFileSync(
        path.join(rootDir, 'contracts/product-center/recipes/product-center-approved-technical-bindings-recipes.json'),
        JSON.stringify({
          fingerprint: 'approved-fingerprint',
          recipes: [{
            id: 'approved:case-1',
            caseId: 'case-1',
            claimIds: ['claim:case-1:action:1'],
            sourceIds: ['route:case-1'],
            capabilities: [{ id: 'navigation.sidebar.open' }],
          }],
        }),
      );
      fs.writeFileSync(path.join(runDirectory, 'feedback.json'), JSON.stringify({
        fingerprint: 'approved-fingerprint',
        runId,
        scope: 'full',
        selectedCaseIds: ['case-1'],
        entries: [{ recipeId: 'approved:case-1', caseId: 'case-1', status: 'passed' }],
      }));
      fs.writeFileSync(path.join(runDirectory, 'evidence.json'), JSON.stringify({
        fingerprint: 'approved-fingerprint',
        entries: [{
          recipeId: 'approved:case-1',
          caseId: 'case-1',
          expectedClaimIds: ['claim:case-1:action:1'],
          verifiedClaimIds: ['claim:case-1:action:1'],
          claimCoverageComplete: true,
          sidebarEntryVerified: true,
        }],
      }));
      fs.writeFileSync(
        path.join(rootDir, 'tests/generated/product-center-approved-technical-bindings.generated.spec.ts'),
        'await flow.execute(recipe);',
      );

      const outputPath = await buildProductCenterApprovedTechnicalBindingsRuntimeAcceptanceArtifact(
        rootDir,
        { runId, scope: 'full', selectedCaseIds: ['case-1'], publishLatest: true },
      );
      const acceptance = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      const manifest = JSON.parse(fs.readFileSync(path.join(runDirectory, 'manifest.json'), 'utf8'));

      expect(acceptance).toMatchObject({
        collectionId: 'product-center-approved-technical-bindings',
        fingerprint: 'approved-fingerprint',
        runId,
        accepted: true,
        acceptedCaseIds: ['case-1'],
        issues: [],
        safety: {
          incompleteCheckpoints: 0,
          sensitiveFindings: 0,
          authStateArtifacts: 0,
          forbiddenPatterns: 0,
        },
      });
      expect(manifest.artifacts).toContain('acceptance.json');
      expect(fs.existsSync(path.join(
        rootDir,
        'output/recipes/product-center-approved-technical-bindings-acceptance.json',
      ))).toBe(true);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('Reporter、runner、流水线与本地入口应完整接入 approved 集合', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const reporter = fs.readFileSync(
      path.join(projectRoot, 'reporters/product-center-recipe.reporter.ts'),
      'utf8',
    );
    const runner = fs.readFileSync(
      path.join(projectRoot, 'scripts/run-product-center-approved-technical-bindings.ts'),
      'utf8',
    );
    const smartRunner = fs.readFileSync(
      path.join(projectRoot, 'scripts/run-product-center-approved-technical-bindings-smart.ts'),
      'utf8',
    );
    const pipeline = fs.readFileSync(
      path.join(projectRoot, 'scripts/run-product-center-quality-pipeline.ts'),
      'utf8',
    );
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

    expect(reporter).toContain("runCollectionId: 'product-center-approved-technical-bindings'");
    expect(reporter).toContain('PC_RECIPE_COLLECTION_ID');
    expect(runner).toContain("const collectionId = 'product-center-approved-technical-bindings'");
    expect(runner).toContain("const specPath = 'tests/generated/product-center-approved-technical-bindings.generated.spec.ts'");
    expect(smartRunner).toContain("mode: 'reused-gold'");
    expect(smartRunner).toContain('runProductCenterApprovedTechnicalBindings(rootDir)');
    expect(pipeline).toContain("'approved-technical-bindings-runtime-acceptance'");
    expect(packageJson.scripts['test:product-center:approved-technical-bindings'])
      .toContain('run-product-center-approved-technical-bindings-smart.ts');
    expect(packageJson.scripts['build:product-center:approved-technical-bindings:acceptance'])
      .toContain('build-product-center-approved-technical-bindings-runtime-acceptance.ts');
  });
});
