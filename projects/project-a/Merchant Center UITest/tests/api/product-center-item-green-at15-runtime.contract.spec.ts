import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { productCenterRecipeCapabilityContracts } from '../../adapters/product-center/product-center-recipe-capabilities';
import { validateAutomationRecipe } from '../../automation/recipe/recipe-validator';
import { buildProductCenterItemGreenRecipeArtifacts } from '../../scripts/build-product-center-item-green-recipes';

const executorPath = path.resolve('tests/generated/product-center-item-green-at15.generated.spec.ts');

test.describe('商品中心绿色 AT15 主图替换批次合同', () => {
  test('应将 TC-ITEM-STD-078 精确绑定并仅通过共享波次执行', () => {
    const { collection, manifest } = buildProductCenterItemGreenRecipeArtifacts({
      projectRoot: path.resolve(__dirname, '../..'),
      generatedAt: '2026-08-03T04:00:00.000Z',
    });
    expect(collection.summary).toMatchObject({ runtimeExecutable: 4, exactBindingRequired: 61 });
    const recipe = collection.recipes.find((item) => item.caseId === 'TC-ITEM-STD-078');
    expect(recipe).toBeDefined();
    expect(recipe).toMatchObject({
      generationAllowed: true,
      executionPolicy: {
        mode: 'wave-shared-chain',
        caseLevelExecutionAllowed: false,
        orchestratorSpecPath: 'tests/generated/product-center-item-green-at15.generated.spec.ts',
      },
      capabilities: [
        { id: 'navigation.sidebar.open' },
        { id: 'item.standard.probeMainImageReplacement' },
      ],
      assertions: [{ adapterId: 'productCenter.verifyMainImageReplacement' }],
    });
    expect(validateAutomationRecipe(recipe!, productCenterRecipeCapabilityContracts)).toEqual([]);
    expect(manifest.executionPolicy).toMatchObject({ runtimeExecutable: 4, exactBindingRequired: 61 });
  });

  test('执行器应记录上传替换、持久化和零残留证据', () => {
    expect(fs.existsSync(executorPath)).toBe(true);
    const source = fs.readFileSync(executorPath, 'utf8');
    expect(source).toContain("'TC-ITEM-STD-078'");
    expect(source).toContain("batchId: 'GREEN-AT15'");
    expect(source).toContain("executionMode: 'wave-shared-chain'");
    expect(source).toContain('caseLevelRunsClaimed: 0');
    expect(source).toContain('firstUpload');
    expect(source).toContain('interactionEvidenceAfterFirstUpload');
    expect(source).toContain('readCommonMainImageInteractionEvidence');
    expect(source).toContain('terminalState');
    expect(source).toContain('first-upload-not-ready');
    expect(source).toContain('replacement');
    expect(source).toContain('persistedEvidence');
    expect(source).toContain('reconcileIncompleteIntents');
    expect(source).toContain('finally');
    expect(source).toContain('residueFree');
    expect(source).toContain("'cleanup-complete'");
    expect(source).not.toContain('waitForTimeout');
  });
});
