import { expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CleanupRegistry } from '../../api/product-center/cleanup-registry';
import type { ProductCenterApi } from '../../api/product-center/product-center-api';
import { buildProductCenterTestPlanGoldSetArtifacts } from '../../scripts/build-product-center-test-plan-gold-set';
import { ProductCenterLowDependencyDataFactory } from '../../test-data/product-center/sop/product-center-low-dependency-data.factory';

test.describe('商品中心真实测试方案金标集', () => {
  test('应放行十一条来源明确且可执行的真实用例', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'product-center-test-plan-gold-set-'));
    try {
      const paths = await buildProductCenterTestPlanGoldSetArtifacts(rootDir);
      const document = JSON.parse(await readFile(paths.documentPath, 'utf8'));
      const report = JSON.parse(await readFile(paths.reportPath, 'utf8'));
      const recipes = JSON.parse(await readFile(paths.recipesPath, 'utf8'));
      const reviewQueue = JSON.parse(await readFile(paths.reviewQueuePath, 'utf8'));

      expect(document.cases.map((item: { id: string }) => item.id)).toEqual([
        'negative:category-child-blocked-by-product',
        'create:seasoning',
        'review:method-detail-max-length',
        'delete:description-tag',
        'create:bom',
        'delete:print-stall',
        'delete:menu',
        'delete:tax',
        'read:store-product-search',
        'create:item-standard-single-zero-price',
        'create:item-combo-required-only',
      ]);
      expect(document.cases[1]).toMatchObject({
        module: 'brand-seasoning',
        route: '/pp/brand/seasoning/list',
        mutatesData: true,
        execution: {
          capabilityIds: ['navigation.sidebar.open', 'coreCreate.execute'],
          mutationMode: 'ui-create',
          cleanupAdapterIds: ['productCenter.cleanupSeed'],
        },
      });
      expect(document.cases[2]).toMatchObject({
        module: 'brand-group',
        route: '/pp/brand/option-group/method',
        title: '做法明细名称超长保存后截断为100字符',
        execution: {
          capabilityIds: [
            'navigation.sidebar.open',
            'methodDetail.enforceNameMaxLength',
          ],
        },
      });
      expect(document.cases[3]).toMatchObject({
        module: 'brand-tag',
        route: '/pp/brand/tag/description',
        title: '标签未被引用，未被引用的标签可删除成功',
        mutatesData: true,
        execution: {
          capabilityIds: ['navigation.sidebar.open', 'lowDependency.execute'],
          mutationMode: 'api-seeded-ui-action',
          seedAdapterIds: ['productCenter.seedDescriptionTagDeletionScenario'],
          cleanupAdapterIds: ['productCenter.cleanupSeed'],
        },
      });
      expect(document.cases.slice(4).map((item: { module: string }) => item.module)).toEqual([
        'brand-material-recipe',
        'brand-print',
        'menu',
        'store-operations',
        'store-product',
        'brand-item',
        'brand-item',
      ]);
      expect(document.cases.slice(4).every((item: {
        sourceRefs: string[];
        cleanup: string[];
        mutatesData: boolean;
        claims: Array<{ sourceTrace: { businessBasis: { kind: string } } }>;
      }) => item.sourceRefs.some((ref) => ref.startsWith('XMIND:'))
        && (item.mutatesData ? item.cleanup.length > 0 : item.cleanup.length === 0)
        && item.claims.every((claim) =>
          ['xmind-existing', 'business-rule-explicit'].includes(
            claim.sourceTrace.businessBasis.kind,
          )))).toBe(true);
      expect(report.status).toBe('passed');
      expect(report.sourceArtifacts).toHaveLength(20);
      expect(report.sourceCitationVerifications).toHaveLength(14);
      expect(report.sourceCitationVerifications).toContainEqual(expect.objectContaining({
        kind: 'business-rule-explicit',
        citation: 'BR-FMT-001',
        matchedLocation: '2.2 全局格式与输入（B 端规范）#BR-FMT-001',
      }));
      expect(report.sourceCitationVerifications.every((item: { verified: boolean }) =>
        item.verified)).toBe(true);
      expect(report.generationGate.summary).toEqual({
        totalCases: 11,
        generated: 11,
        reviewRequired: 0,
        blocked: 0,
        intentionallyOmitted: 0,
      });
      expect(report.generationGate.generated.map((item: { caseId: string }) => item.caseId)).toEqual([
        'negative:category-child-blocked-by-product',
        'create:seasoning',
        'review:method-detail-max-length',
        'delete:description-tag',
        'create:bom',
        'delete:print-stall',
        'delete:menu',
        'delete:tax',
        'read:store-product-search',
        'create:item-standard-single-zero-price',
        'create:item-combo-required-only',
      ]);
      expect(report.generationGate.reviewRequired).toEqual([]);
      expect(report.generationQuality).toEqual({
        summary: {
          total: 11,
          correct: 11,
          mismatched: 0,
          decisionAccuracy: 1,
          falsePromotions: 0,
          falsePromotionRate: 0,
          falseRejections: 0,
          falseRejectionRate: 0,
        },
        expectedCounts: {
          generated: 11,
          'review-required': 0,
        },
        actualCounts: {
          generated: 11,
          'review-required': 0,
        },
        mismatches: [],
      });
      expect(report.reviewQueueSummary).toEqual({
        total: 0,
        pending: 0,
        readyForReaudit: 0,
        resolved: 0,
        deferred: 0,
        byRepairKind: {},
        byIssueCode: {},
      });
      expect(reviewQueue).toMatchObject({
        collectionId: 'product-center-test-plan-gold-set',
        fingerprint: report.fingerprint,
        status: 'clear',
        summary: report.reviewQueueSummary,
      });
      expect(reviewQueue.items).toEqual([]);
      expect(report.recipeMappings.map((item: { caseId: string }) => item.caseId)).toEqual([
        'negative:category-child-blocked-by-product',
        'create:seasoning',
        'review:method-detail-max-length',
        'delete:description-tag',
        'create:bom',
        'delete:print-stall',
        'delete:menu',
        'delete:tax',
        'read:store-product-search',
        'create:item-standard-single-zero-price',
        'create:item-combo-required-only',
      ]);
      expect(recipes.recipes).toHaveLength(11);
      expect(recipes.recipes.every((recipe: { id: string }) =>
        recipe.id.startsWith('product-center:test-plan-gold-set:'))).toBe(true);
      expect(recipes.recipes.find((recipe: { caseId: string }) =>
        recipe.caseId === 'create:seasoning')).toMatchObject({
        action: 'create',
        capabilities: [
          { id: 'navigation.sidebar.open' },
          { id: 'coreCreate.execute' },
        ],
        assertions: [
          { adapterId: 'productCenter.verifyCreatedApi' },
          { adapterId: 'productCenter.verifyCreatedUi' },
        ],
        cleanup: { adapterId: 'productCenter.cleanupSeed' },
      });
      expect(recipes.recipes.find((recipe: { caseId: string }) =>
        recipe.caseId === 'review:method-detail-max-length')).toMatchObject({
        action: 'boundary',
        capabilities: [
          { id: 'navigation.sidebar.open' },
          { id: 'methodDetail.enforceNameMaxLength', saveAs: 'methodDetailBoundary' },
        ],
        assertions: [
          { adapterId: 'productCenter.verifyCreatedApi' },
          { adapterId: 'productCenter.verifyMethodDetailBoundary' },
        ],
        cleanup: { adapterId: 'productCenter.cleanupSeed' },
      });
      expect(recipes.recipes.find((recipe: { caseId: string }) =>
        recipe.caseId === 'delete:description-tag')).toMatchObject({
        action: 'delete',
        seed: { adapterId: 'productCenter.seedDescriptionTagDeletionScenario' },
        capabilities: [
          { id: 'navigation.sidebar.open' },
          { id: 'lowDependency.execute' },
        ],
        assertions: [
          { adapterId: 'productCenter.verifyAbsentApi' },
          { adapterId: 'productCenter.verifyDeletedUi' },
        ],
        cleanup: { adapterId: 'productCenter.cleanupSeed' },
      });
      expect(recipes.recipes.find((recipe: { caseId: string }) =>
        recipe.caseId === 'create:bom')).toMatchObject({
        action: 'create',
        capabilities: [
          { id: 'navigation.sidebar.open' },
          { id: 'coreCreate.execute' },
        ],
        cleanup: { adapterId: 'productCenter.cleanupSeed' },
      });
      for (const caseId of ['delete:print-stall', 'delete:tax']) {
        expect(recipes.recipes.find((recipe: { caseId: string }) =>
          recipe.caseId === caseId)).toMatchObject({
          action: 'delete',
          capabilities: [
            { id: 'navigation.sidebar.open' },
            { id: 'lowDependency.execute' },
          ],
          cleanup: { adapterId: 'productCenter.cleanupSeed' },
        });
      }
      expect(recipes.recipes.find((recipe: { caseId: string }) =>
        recipe.caseId === 'delete:menu')).toMatchObject({
        action: 'delete',
        capabilities: [
          { id: 'navigation.sidebar.open' },
          { id: 'highDependency.execute' },
        ],
        cleanup: { adapterId: 'productCenter.cleanupSeed' },
      });
      expect(recipes.recipes.find((recipe: { caseId: string }) =>
        recipe.caseId === 'read:store-product-search')).toMatchObject({
        action: 'read',
        capabilities: [
          { id: 'navigation.sidebar.open', saveAs: 'navigation' },
          { id: 'storeProduct.searchByName', saveAs: 'storeProductSearch' },
        ],
        assertions: [{
          adapterId: 'productCenter.verifyStoreProductSearch',
          input: { result: { $ref: '$result.storeProductSearch' } },
        }],
      });
      expect(document.cases.find((item: { id: string }) =>
        item.id === 'create:item-standard-single-zero-price')).toMatchObject({
        module: 'brand-item',
        route: '/pp/brand/list',
        title: '单规格商品标准价为0时创建成功',
        priority: 'P1',
        mutatesData: true,
        execution: {
          capabilityIds: ['navigation.sidebar.open', 'item.createStandard'],
          mutationMode: 'ui-create',
          seedAdapterIds: ['productCenter.prepareItemStandardSingleZeroPrice'],
          cleanupAdapterIds: ['productCenter.cleanupSeed'],
        },
      });
      expect(recipes.recipes.find((recipe: { caseId: string }) =>
        recipe.caseId === 'create:item-standard-single-zero-price')).toMatchObject({
        action: 'create',
        seed: { adapterId: 'productCenter.prepareItemStandardSingleZeroPrice' },
        capabilities: [
          { id: 'navigation.sidebar.open', saveAs: 'navigation' },
          {
            id: 'item.createStandard',
            saveAs: 'itemStandardSingleZeroPrice',
            input: {
              record: { $ref: '$record' },
              specification: 'single',
              price: '0',
              minimumOrderQuantity: '1',
            },
          },
        ],
        assertions: [
          { adapterId: 'productCenter.verifyItemStandardSingleZeroPriceApi' },
          {
            adapterId: 'productCenter.verifyItemStandardSingleZeroPriceUi',
            input: { result: { $ref: '$result.itemStandardSingleZeroPrice' } },
          },
        ],
        cleanup: { adapterId: 'productCenter.cleanupSeed' },
      });
      const itemRecipe = recipes.recipes.find((recipe: { caseId: string }) =>
        recipe.caseId === 'create:item-standard-single-zero-price');
      expect(itemRecipe.capabilities[0].id).toBe('navigation.sidebar.open');
      expect(itemRecipe.claimIds.length).toBeGreaterThan(0);
      expect(document.cases.find((item: { id: string }) =>
        item.id === 'create:item-combo-required-only')).toMatchObject({
        module: 'brand-item',
        route: '/pp/brand/list',
        title: '套餐商品仅填写必填项时创建成功',
        priority: 'P0',
        mutatesData: true,
        execution: {
          capabilityIds: ['navigation.sidebar.open', 'item.createComboRequiredOnly'],
          mutationMode: 'api-seeded-ui-action',
          seedAdapterIds: ['productCenter.prepareItemComboRequiredOnly'],
          cleanupAdapterIds: ['productCenter.cleanupSeed'],
        },
      });
      expect(recipes.recipes.find((recipe: { caseId: string }) =>
        recipe.caseId === 'create:item-combo-required-only')).toMatchObject({
        action: 'create',
        seed: { adapterId: 'productCenter.prepareItemComboRequiredOnly' },
        capabilities: [
          { id: 'navigation.sidebar.open', saveAs: 'navigation' },
          {
            id: 'item.createComboRequiredOnly',
            saveAs: 'itemComboRequiredOnly',
            input: {
              record: { $ref: '$record' },
              price: '10.00',
              minimumOrderQuantity: '1',
              comboGroupName: { $ref: '$record.comboGroupName' },
            },
          },
        ],
        assertions: [
          { adapterId: 'productCenter.verifyItemComboRequiredOnlyApi' },
          {
            adapterId: 'productCenter.verifyItemComboRequiredOnlyUi',
            input: { result: { $ref: '$result.itemComboRequiredOnly' } },
          },
        ],
        cleanup: { adapterId: 'productCenter.cleanupSeed' },
      });
      expect(recipes.recipes.find((recipe: { caseId: string }) =>
        recipe.caseId === 'read:store-product-search')).not.toHaveProperty('cleanup');
      expect(recipes.recipes.every((recipe: {
        capabilities: Array<{ id: string; saveAs?: string }>;
        claimIds: string[];
      }) => recipe.capabilities[0]?.id === 'navigation.sidebar.open'
        && recipe.capabilities[0]?.saveAs === 'navigation'
        && recipe.claimIds.length > 0)).toBe(true);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test('描述标签删除场景应精确准备同组引用标签和未引用目标标签', async () => {
    const calls: Array<{ method: string; input?: unknown }> = [];
    let tagSequence = 0;
    const tagRecords: Array<{ id: number; name: string }> = [];
    const productName = { value: '' };
    const api = {
      createTagGroup: async (input: { name: string }) => {
        calls.push({ method: 'createTagGroup', input });
        return { data: { id: 101, name: input.name } };
      },
      tagGroupList: async () => ({ data: [{ id: 101, name: 'unused' }] }),
      deleteTagGroup: async () => undefined,
      createDescriptionTag: async (input: { name: string; groupId: number }) => {
        const record = { id: 201 + tagSequence, name: input.name };
        tagSequence += 1;
        tagRecords.push(record);
        calls.push({ method: 'createDescriptionTag', input });
        return { data: record };
      },
      tagPage: async () => ({ data: tagRecords }),
      deleteTag: async () => undefined,
      createBomProduct: async (name: string) => {
        productName.value = name;
        calls.push({ method: 'createBomProduct' });
        return { data: { id: 301, name } };
      },
      bindDescriptionTagToProduct: async (input: {
        itemId: number;
        groupId: number;
        tagId: number;
      }) => {
        calls.push({ method: 'bindDescriptionTagToProduct', input });
        return { success: true };
      },
      brandItemTagGroupList: async () => {
        calls.push({ method: 'brandItemTagGroupList' });
        return {
          data: [{
            tagGroupId: 101,
            brandItemTagList: [{ tagGroupId: 101, tagId: 201 }],
          }],
        };
      },
      productPage: async () => ({ data: [{ id: 301, name: productName.value }] }),
      productDetail: async () => ({
        data: { descTagList: [{ tagGroupId: 101, idList: [201] }] },
      }),
      deleteBomProduct: async () => undefined,
    } as unknown as ProductCenterApi;

    const record = await new ProductCenterLowDependencyDataFactory(api)
      .seedDescriptionTagDeletionScenario(new CleanupRegistry());

    expect(calls.map((call) => call.method)).toEqual([
      'createTagGroup',
      'createDescriptionTag',
      'createBomProduct',
      'bindDescriptionTagToProduct',
      'brandItemTagGroupList',
      'createDescriptionTag',
    ]);
    expect(calls.find((call) => call.method === 'bindDescriptionTagToProduct')?.input).toEqual({
      itemId: 301,
      groupId: 101,
      tagId: 201,
    });
    expect(record.metadata).toMatchObject({
      groupId: 101,
      referencedTagId: 201,
      targetTagId: 202,
      productId: 301,
      groupTagCount: 2,
      referencedTagCount: 1,
    });
    expect(record.id).toBe(202);
  });
});
