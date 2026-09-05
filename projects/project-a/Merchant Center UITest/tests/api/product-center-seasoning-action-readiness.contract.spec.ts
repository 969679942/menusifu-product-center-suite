import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildSystemTestArtifacts } from '../../../../Test Automation Platform/scripts/build-system-test-contract';
import { compileSystemTestRunContract, fingerprintSystemTestValue } from '../../../../Test Automation Platform/src/automation/system-test/system-test-contract';
import { recipeCollectionFingerprint } from '../../../../Test Automation Platform/src/automation/recipe/recipe-validator';

const projectRoot = path.resolve(__dirname, '../..');
const manifestPath = path.join(
  projectRoot,
  'systems/merchant-center-product-center-seasoning/manifest.json',
);
const storeMutationCaseIds = [
  'TC-FLV-SEA-042',
  'TC-FLV-XMOD-004',
  'TC-FLV-XMOD-005',
  'TC-FLV-XMOD-006',
  'TC-FLV-XMOD-011',
];
const readinessAdapters = new Map([
  ['TC-FLV-SEA-042', 'merchant-center.seasoning.single-store-action-readiness'],
  ['TC-FLV-XMOD-004', 'merchant-center.seasoning.store-group-delete-action-readiness'],
  ['TC-FLV-XMOD-005', 'merchant-center.seasoning.store-option-delete-action-readiness'],
  ['TC-FLV-XMOD-006', 'merchant-center.seasoning.store-batch-delete-action-readiness'],
  ['TC-FLV-XMOD-011', 'merchant-center.seasoning.store-redeliver-action-readiness'],
]);

test.describe('调味动作链就绪领域适配合同', () => {
  test('五条门店写入用例必须具备权威动作链、身份、请求和清理合同', () => {
    const artifacts = buildSystemTestArtifacts({ rootDir: projectRoot, manifestPath });
    expect(artifacts.errors).toEqual([]);
    for (const caseId of storeMutationCaseIds) {
      const item = artifacts.contract.cases.find((candidate) => candidate.caseId === caseId);
      const recipe = artifacts.recipes.recipes.find((candidate) => candidate.caseId === caseId);
      expect(item?.requiredActionReadiness).toMatchObject({
        adapterId: readinessAdapters.get(caseId),
      });
      expect(recipe?.actionReadiness).toMatchObject({
        status: 'observed',
        generationAllowed: true,
        adapterId: readinessAdapters.get(caseId),
      });
      expect(recipe?.actionReadiness?.controlIds.length).toBeGreaterThan(0);
      expect(recipe?.actionReadiness?.sequence.length).toBeGreaterThan(0);
      expect(recipe?.actionReadiness?.operationKeys.length).toBeGreaterThan(0);
      expect(recipe?.actionReadiness?.requiredIdentityKeys.length).toBeGreaterThan(0);
      expect(recipe?.actionReadiness?.cleanupIdentityKeys).toEqual(recipe?.actionReadiness?.requiredIdentityKeys);
    }
  });

  test('领域方案删除任一必需动作链合同时公共编译器必须拒绝', () => {
    const artifacts = buildSystemTestArtifacts({ rootDir: projectRoot, manifestPath });
    const recipes = structuredClone(artifacts.recipes.recipes);
    const target = recipes.find((candidate) => candidate.caseId === 'TC-FLV-XMOD-005');
    if (!target) throw new Error('缺少 TC-FLV-XMOD-005 Recipe');
    delete target.actionReadiness;
    const fingerprint = recipeCollectionFingerprint(recipes);
    const manifest = structuredClone(artifacts.manifest);
    manifest.sources.recipeCollectionFingerprint = fingerprint;
    manifest.sources.adapterCatalogFingerprint = fingerprintSystemTestValue(artifacts.adapters);
    const result = compileSystemTestRunContract({
      rootDir: projectRoot,
      manifest,
      recipes,
      recipeCollectionFingerprint: fingerprint,
      rules: artifacts.rules,
      adapters: artifacts.adapters,
    });
    expect(result.errors).toContain('TC-FLV-XMOD-005:ACTION_READINESS_REQUIRED');
  });

  test('SEA-042 只要求品牌调味身份且不依赖单门店不可用的模板身份', () => {
    const artifacts = buildSystemTestArtifacts({ rootDir: projectRoot, manifestPath });
    const recipe = artifacts.recipes.recipes.find((candidate) => candidate.caseId === 'TC-FLV-SEA-042');
    expect(recipe?.actionReadiness?.requiredIdentityKeys).toEqual(['groupId', 'groupName']);
    expect(recipe?.actionReadiness?.cleanupIdentityKeys).toEqual(['groupId', 'groupName']);
    expect(recipe?.actionReadiness?.input).toMatchObject({
      groupId: { $ref: '$records.0.id' },
      groupName: { $ref: '$records.0.name' },
    });
    expect(recipe?.actionReadiness?.input).not.toHaveProperty('templateId');
    expect(recipe?.actionReadiness?.input).not.toHaveProperty('templateName');
  });

  test('五类动作链必须使用独立适配器源码分段以限制修复重跑范围', () => {
    const artifacts = buildSystemTestArtifacts({ rootDir: projectRoot, manifestPath });
    const adapters = new Map(artifacts.adapters.adapters.map((adapter) => [adapter.id, adapter]));
    const option = adapters.get('merchant-center.seasoning.store-option-delete-action-readiness');
    const batch = adapters.get('merchant-center.seasoning.store-batch-delete-action-readiness');
    const redeliver = adapters.get('merchant-center.seasoning.store-redeliver-action-readiness');
    const sections = (adapter: typeof option) => adapter?.implementation.dependencies?.map((item) => item.sourceSection) ?? [];

    expect(sections(option)).toContain('seasoning-page-store-option-delete-action-readiness');
    expect(sections(option)).not.toContain('seasoning-page-store-batch-delete-action-readiness');
    expect(sections(batch)).toContain('seasoning-page-store-batch-delete-action-readiness');
    expect(sections(batch)).not.toContain('seasoning-page-store-option-delete-action-readiness');
    expect(sections(redeliver)).toContain('seasoning-page-template-distribution-action-readiness');
  });
});
