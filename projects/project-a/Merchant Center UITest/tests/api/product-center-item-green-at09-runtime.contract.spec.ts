import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { productCenterRecipeCapabilityContracts } from '../../adapters/product-center/product-center-recipe-capabilities';
import { validateAutomationRecipe } from '../../automation/recipe/recipe-validator';
import { buildProductCenterItemGreenRecipeArtifacts } from '../../scripts/build-product-center-item-green-recipes';

const executorPath = path.resolve('tests/generated/product-center-item-green-at09.generated.spec.ts');
const caseIds = ['TC-ITEM-STD-020', 'TC-ITEM-STD-048', 'TC-ITEM-STD-050', 'TC-ITEM-STD-098'] as const;

test.describe('商品中心绿色 AT09 标准商品价格规格批次合同', () => {
  test('应将四条用例精确绑定并仅通过共享波次执行', () => {
    const { collection, manifest } = buildProductCenterItemGreenRecipeArtifacts({
      projectRoot: path.resolve(__dirname, '../..'),
      generatedAt: '2026-08-03T16:00:00.000Z',
    });
    expect(collection.summary).toMatchObject({ runtimeExecutable: 9, exactBindingRequired: 56 });
    const recipes = Object.fromEntries(caseIds.map((caseId) => [
      caseId,
      collection.recipes.find((item) => item.caseId === caseId),
    ]));
    expect(recipes['TC-ITEM-STD-020']).toMatchObject({
      action: 'create',
      generationAllowed: true,
      capabilities: [
        { id: 'navigation.sidebar.open' },
        {
          id: 'item.createStandard',
          input: {
            record: { $ref: '$record' },
            specification: 'single',
            price: '1.99',
            minimumOrderQuantity: '1',
          },
        },
      ],
      assertions: [{ adapterId: 'productCenter.verifyStandardPricePersistence' }],
    });
    expect(recipes['TC-ITEM-STD-048']).toMatchObject({
      action: 'read',
      generationAllowed: true,
      capabilities: [
        { id: 'navigation.sidebar.open' },
        { id: 'item.standard.probeSpecGroupCreateNavigation' },
      ],
      assertions: [{ adapterId: 'productCenter.verifySpecGroupCreateNavigation' }],
    });
    expect(recipes['TC-ITEM-STD-050']).toMatchObject({
      action: 'create',
      capabilities: [
        { id: 'navigation.sidebar.open' },
        {
          id: 'item.createStandard',
          input: expect.objectContaining({ price: '10.00', packagingFee: '1.00' }),
        },
      ],
      assertions: [{ adapterId: 'productCenter.verifyStandardPackagingFeePersistence' }],
    });
    expect(recipes['TC-ITEM-STD-098']).toMatchObject({
      action: 'create',
      capabilities: [
        { id: 'navigation.sidebar.open' },
        {
          id: 'item.createStandard',
          input: expect.objectContaining({ price: '10.00', cost: '5.00' }),
        },
      ],
      assertions: [{ adapterId: 'productCenter.verifyStandardCostPersistence' }],
    });
    for (const recipe of Object.values(recipes)) {
      expect(recipe?.executionPolicy).toMatchObject({
        mode: 'wave-shared-chain',
        caseLevelExecutionAllowed: false,
        orchestratorSpecPath: 'tests/generated/product-center-item-green-at09.generated.spec.ts',
      });
      expect(validateAutomationRecipe(recipe!, productCenterRecipeCapabilityContracts)).toEqual([]);
    }
    expect(manifest.executionPolicy).toMatchObject({ runtimeExecutable: 9, exactBindingRequired: 56 });
    expect(manifest.groups.find((group) => group.groupId === 'AT09')).toMatchObject({
      runtimeExecutableCaseIds: [...caseIds],
      orchestratorSpecPath: 'tests/generated/product-center-item-green-at09.generated.spec.ts',
    });
  });

  test('执行器应记录三次创建、跳转探测、即时登记和零残留证据', () => {
    expect(fs.existsSync(executorPath)).toBe(true);
    const source = fs.readFileSync(executorPath, 'utf8');
    for (const caseId of caseIds) expect(source).toContain(`'${caseId}'`);
    expect(source).toContain("batchId: 'GREEN-AT09'");
    expect(source).toContain("executionMode: 'wave-shared-chain'");
    expect(source).toContain('caseLevelRunsClaimed: 0');
    expect(source).toContain('packagingFeeBeforeSave');
    expect(source).toContain('costBeforeSave');
    expect(source).toContain('reopenedPackagingFee');
    expect(source).toContain('reopenedCost');
    expect(source).toContain('probeSpecGroupCreateNavigation');
    expect(source).toContain('registerCreated');
    expect(source).toContain('reconcileIncompleteIntents');
    expect(source).toContain('finally');
    expect(source).toContain('residueFree');
    expect(source).toContain("'cleanup-complete'");
    expect(source).not.toContain('waitForTimeout');
  });
});
