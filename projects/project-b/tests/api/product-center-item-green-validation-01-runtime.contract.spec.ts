import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { productCenterRecipeCapabilityContracts } from '../../adapters/product-center/product-center-recipe-capabilities';
import { validateAutomationRecipe } from '../../automation/recipe/recipe-validator';
import { buildProductCenterItemGreenRecipeArtifacts } from '../../scripts/build-product-center-item-green-recipes';

const executorPath = path.resolve('tests/generated/product-center-item-green-validation-01.generated.spec.ts');
const caseIds = [
  'TC-ITEM-STD-035',
  'TC-ITEM-STD-046',
  'TC-ITEM-STD-094',
  'TC-ITEM-STD-101',
  'TC-ITEM-STD-095',
  'TC-ITEM-STD-049',
  'TC-ITEM-STD-051',
  'TC-ITEM-STD-045',
  'TC-ITEM-STD-054',
  'TC-ITEM-STD-059',
  'TC-ITEM-ADD-017',
] as const;

test.describe('商品中心绿色校验共享波 01 合同', () => {
  test('应将十一条用例精确绑定到同一共享执行器', () => {
    const { collection, manifest } = buildProductCenterItemGreenRecipeArtifacts({
      projectRoot: path.resolve(__dirname, '../..'),
      generatedAt: '2026-08-05T08:00:00.000Z',
    });
    expect(collection.summary).toMatchObject({ runtimeExecutable: 20, exactBindingRequired: 45 });

    const recipes = Object.fromEntries(caseIds.map((caseId) => [
      caseId,
      collection.recipes.find((recipe) => recipe.caseId === caseId),
    ]));
    expect(recipes['TC-ITEM-STD-035']?.capabilities[1]).toMatchObject({
      id: 'category.attemptAddChildBlockedByProduct',
      input: { record: { $ref: '$record' } },
    });
    expect(recipes['TC-ITEM-STD-046']?.capabilities[1]).toMatchObject({
      id: 'item.standard.probeFieldValidation',
      input: { field: 'mnemonicCode', value: 'MMMMMMMMMMMMMMMMMMMMM' },
    });
    expect(recipes['TC-ITEM-STD-094']?.capabilities[1]).toMatchObject({
      id: 'item.standard.probeFieldValidation',
      input: { field: 'posName', value: '  POS名称-autocreate-094  ' },
    });
    expect(recipes['TC-ITEM-STD-101']?.capabilities[1]).toMatchObject({
      id: 'item.standard.probeFieldValidation',
      input: { field: 'deviceCode', value: 'DDDDDDDDDDDDDDDDDDDDD' },
    });
    expect(recipes['TC-ITEM-STD-095']).toMatchObject({
      action: 'create',
      capabilities: [
        { id: 'navigation.sidebar.open' },
        { id: 'item.standard.createRoundedPricePair', input: { values: ['10.235', '10.234'] } },
      ],
    });
    expect(recipes['TC-ITEM-STD-049']?.capabilities[1]).toMatchObject({
      id: 'item.standard.probeMultiSpecWeightDisabled',
    });
    expect(recipes['TC-ITEM-STD-051']?.capabilities[1]).toMatchObject({
      id: 'item.standard.probeFieldValidation',
      input: { field: 'standardPrice', value: '1000000.00' },
    });
    expect(recipes['TC-ITEM-STD-045']?.capabilities[1]).toMatchObject({
      id: 'item.standard.probeDescriptionLengthBoundary',
      input: { acceptedLength: 500, rejectedLength: 501 },
    });
    expect(recipes['TC-ITEM-STD-054']?.capabilities[1]).toMatchObject({
      id: 'item.standard.probeDetailImageLimit',
      input: { maximum: 10, attempted: 11 },
    });
    expect(recipes['TC-ITEM-STD-059']?.capabilities[1]).toMatchObject({
      id: 'item.standard.probeReferencedGroupChildControls',
      input: { record: { $ref: '$record' } },
    });
    expect(recipes['TC-ITEM-ADD-017']).toMatchObject({
      action: 'create',
      capabilities: [
        { id: 'navigation.sidebar.open' },
        { id: 'item.side.createWithDetailImageLimit', input: { maximum: 10 } },
      ],
    });

    for (const recipe of Object.values(recipes)) {
      expect(recipe?.generationAllowed).toBe(true);
      expect(recipe?.executionPolicy).toMatchObject({
        mode: 'wave-shared-chain',
        caseLevelExecutionAllowed: false,
        orchestratorSpecPath: 'tests/generated/product-center-item-green-validation-01.generated.spec.ts',
      });
      expect(validateAutomationRecipe(recipe!, productCenterRecipeCapabilityContracts)).toEqual([]);
    }
    for (const groupId of ['AT06', 'AT10', 'AT17', 'AT28']) {
      const group = manifest.groups.find((candidate) => candidate.groupId === groupId);
      expect(group?.runtimeExecutableCaseIds).toEqual(expect.arrayContaining(
        caseIds.filter((caseId) => group?.caseIds.includes(caseId)),
      ));
      expect(group?.orchestratorSpecPath).toBe(
        'tests/generated/product-center-item-green-validation-01.generated.spec.ts',
      );
    }
  });

  test('共享执行器应具备独立证据、受控变更和零残留门禁', () => {
    expect(fs.existsSync(executorPath)).toBe(true);
    const source = fs.readFileSync(executorPath, 'utf8');
    for (const caseId of caseIds) expect(source).toContain(`'${caseId}'`);
    for (const marker of [
      "batchId: 'GREEN-VALIDATION-01'",
      "executionMode: 'wave-shared-chain'",
      'evidenceInheritanceAllowed: false',
      'caseLevelRunsClaimed: 0',
      'MutationIntentJournal',
      'reconcileIncompleteIntents',
      'registerCreated',
      'finally',
      'residueFree',
      "'cleanup-complete'",
    ]) expect(source).toContain(marker);
    expect(source).not.toContain('waitForTimeout');
  });
});
