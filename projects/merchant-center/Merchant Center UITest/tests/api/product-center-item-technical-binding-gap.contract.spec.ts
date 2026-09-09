import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterItemTechnicalBindingGapArtifacts } from '../../scripts/build-product-center-item-technical-binding-gap';

const projectRoot = path.resolve(__dirname, '../..');

test.describe('商品中心商品技术绑定差距矩阵', () => {
  test('应逐条覆盖全部 canonical 并按精确证据筛选首批 P0', async () => {
    const { document } = buildProductCenterItemTechnicalBindingGapArtifacts({
      projectRoot,
      generatedAt: '2026-07-30T00:00:00.000Z',
    });

    expect(document.summary).toMatchObject({
      canonicalTotal: 232,
      activeTotal: 225,
      deprecated: 7,
      runtimeAccepted: 4,
      recipeExistingRuntimeRequired: 0,
      recipeDriftRepairRequired: 2,
      pageObservationRequired: 157,
      capabilityMappingRequired: 62,
      firstP0BatchEligible: 3,
      firstP0BatchBlocked: 83,
      byPriority: { P0: 86, P1: 132, P2: 7 },
    });
    expect(new Set(document.entries.map((entry) => entry.caseId)).size).toBe(232);
    expect(document.firstP0Batch).toMatchObject({
      readyCaseIds: [
        'TC-ITEM-PKG-009',
        'TC-ITEM-STD-005',
        'TC-ITEM-PKG-046',
      ],
      newRecipeGenerationCount: 0,
    });
  });

  test('应阻断已验收但与当前 canonical Claim 漂移的 Recipe', async () => {
    const { document } = buildProductCenterItemTechnicalBindingGapArtifacts({
      projectRoot,
      generatedAt: '2026-07-30T00:00:00.000Z',
    });
    const drifted = document.entries.find((entry) => entry.caseId === 'TC-ITEM-STD-007');

    expect(drifted).toMatchObject({
      classification: 'recipe-drift-repair-required',
      evidenceKind: 'direct-recipe',
      currentCanonicalClaimCount: 9,
      recipeClaimCount: 8,
      claimAlignment: 'drifted',
      firstP0BatchEligible: false,
    });
    expect(drifted?.gapCodes).toEqual(expect.arrayContaining([
      'recipe-drift-repair-required',
      'claim-alignment-required',
    ]));
  });

  test('应区分精确 Gold 来源映射与人工断言占位', async () => {
    const { document } = buildProductCenterItemTechnicalBindingGapArtifacts({
      projectRoot,
      generatedAt: '2026-07-30T00:00:00.000Z',
    });

    expect(document.entries.find((entry) => entry.caseId === 'TC-ITEM-PKG-009')).toMatchObject({
      classification: 'runtime-accepted',
      evidenceKind: 'approved-external-source',
      claimAlignment: 'source-ref-exact',
    });
    expect(document.entries.find((entry) => entry.caseId === 'TC-ITEM-STD-006')).toMatchObject({
      classification: 'capability-mapping-required',
      evidenceKind: 'legacy-binding',
      technicalDimensions: {
        navigation: 'observed',
        capabilities: 'partial',
        assertions: 'required',
      },
    });
  });

  test('所有已接入的商品 UI Recipe 都必须从侧边栏导航开始', async () => {
    const recipeFiles = [
      'product-center-item-intake-pilot-recipes.json',
      'product-center-item-category-leaf-probe-recipes.json',
      'product-center-item-combo-audit-probe-recipes.json',
      'product-center-approved-technical-bindings-recipes.json',
    ];
    for (const file of recipeFiles) {
      const document = JSON.parse(fs.readFileSync(path.join(
        projectRoot,
        'contracts/product-center/recipes',
        file,
      ), 'utf8')) as { recipes: Array<{ capabilities?: Array<{ id: string }> }> };
      for (const recipe of document.recipes) {
        expect(recipe.capabilities?.[0]?.id).toBe('navigation.sidebar.open');
      }
    }
  });
});
