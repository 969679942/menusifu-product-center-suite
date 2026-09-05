import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { productCenterRecipeCapabilityContracts } from '../../adapters/product-center/product-center-recipe-capabilities';
import { validateAutomationRecipe } from '../../automation/recipe/recipe-validator';
import { buildProductCenterItemGreenRecipeArtifacts } from '../../scripts/build-product-center-item-green-recipes';

const executorPath = path.resolve('tests/generated/product-center-item-green-at39.generated.spec.ts');

test.describe('商品中心绿色 AT39 套餐 MOQ 批次合同', () => {
  test('应将 TC-ITEM-PKG-016 精确绑定并仅通过共享波次执行', () => {
    const { collection, manifest } = buildProductCenterItemGreenRecipeArtifacts({
      projectRoot: path.resolve(__dirname, '../..'),
      generatedAt: '2026-08-03T14:50:00.000Z',
    });
    expect(collection.summary).toMatchObject({ runtimeExecutable: 5, exactBindingRequired: 60 });
    const recipe = collection.recipes.find((item) => item.caseId === 'TC-ITEM-PKG-016');
    expect(recipe).toMatchObject({
      action: 'create',
      generationAllowed: true,
      executionPolicy: {
        mode: 'wave-shared-chain',
        caseLevelExecutionAllowed: false,
        orchestratorSpecPath: 'tests/generated/product-center-item-green-at39.generated.spec.ts',
      },
      capabilities: [
        { id: 'navigation.sidebar.open' },
        {
          id: 'item.createComboRequiredOnly',
          input: {
            record: { $ref: '$record' },
            price: '10.00',
            minimumOrderQuantity: '2',
            comboGroupName: { $ref: '$record.comboGroupName' },
          },
        },
      ],
      assertions: [{ adapterId: 'productCenter.verifyComboMinimumOrderQuantity' }],
    });
    expect(validateAutomationRecipe(recipe!, productCenterRecipeCapabilityContracts)).toEqual([]);
    expect(manifest.executionPolicy).toMatchObject({ runtimeExecutable: 5, exactBindingRequired: 60 });
  });

  test('执行器应记录创建、MOQ 回读、即时登记和零残留证据', () => {
    expect(fs.existsSync(executorPath)).toBe(true);
    const source = fs.readFileSync(executorPath, 'utf8');
    expect(source).toContain("'TC-ITEM-PKG-016'");
    expect(source).toContain("batchId: 'GREEN-AT39'");
    expect(source).toContain("executionMode: 'wave-shared-chain'");
    expect(source).toContain('caseLevelRunsClaimed: 0');
    expect(source).toContain("minimumOrderQuantity: '2'");
    expect(source).toContain('valueBeforeSave');
    expect(source).toContain('reopenedMinimumOrderQuantity');
    expect(source).toContain('registerCreated');
    expect(source).toContain('reconcileIncompleteIntents');
    expect(source).toContain('finally');
    expect(source).toContain('residueFree');
    expect(source).toContain("'cleanup-complete'");
    expect(source).not.toContain('waitForTimeout');
  });
});
