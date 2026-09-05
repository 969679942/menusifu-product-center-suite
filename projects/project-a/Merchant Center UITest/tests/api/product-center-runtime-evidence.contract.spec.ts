import { expect, test } from '@playwright/test';
import { buildProductCenterRuntimeEvidenceBundle } from '../../automation/recipe/product-center-runtime-evidence';

test.describe('商品中心 Recipe 运行证据包合同', () => {
  test('证据包应覆盖可见界面定位唯一性网络接口和品牌上下文', async () => {
    const bundle = buildProductCenterRuntimeEvidenceBundle({
      recipeId: 'product-center:item-required-name:negative',
      caseId: 'TC-ITEM-STD-005',
      results: {
        navigation: { mode: 'sidebar', targetPath: '/pp/brand/list', arrivedPath: '/pp/brand/list' },
        validation: {
          route: '/pp/brand/create/standard',
          requiredErrorCount: 1,
          nameInputCount: 1,
          successMessageCount: 0,
          mutationCount: 0,
          beforeTotalCount: 12,
          afterTotalCount: 12,
        },
      },
      environmentId: 'balamxqa',
      brandId: '000407',
      screenshotAttachmentName: 'recipe-screenshot',
    });

    expect(bundle.navigation).toMatchObject({ mode: 'sidebar', targetPath: '/pp/brand/list' });
    expect(bundle.visibleUi).toMatchObject({ route: '/pp/brand/create/standard', requiredErrorCount: 1 });
    expect(bundle.locatorUniqueness).toEqual({ nameInputCount: 1, requiredErrorCount: 1 });
    expect(bundle.network).toEqual({ method: 'POST', operation: 'standard-item-create', requestCount: 0 });
    expect(bundle.api).toMatchObject({ responseShape: ['data.totalCount'], beforeEqualsAfter: true });
    expect(bundle.context.brandFingerprint).toMatch(/^[a-f0-9]{12}$/);
    expect(JSON.stringify(bundle)).not.toContain('000407');
  });

  test('主 Recipe 证据包应记录通用执行摘要和完整 Claim', async () => {
    const bundle = buildProductCenterRuntimeEvidenceBundle({
      recipeId: 'product-center:category:edit',
      caseId: 'edit:category',
      action: 'edit',
      results: {
        navigation: { mode: 'sidebar', targetPath: '/pp/brand/category', arrivedPath: '/pp/brand/category' },
        'category.open': { opened: true },
        'category.editIdentity': { saved: true },
      },
      environmentId: 'balamxqa',
      brandId: '000407',
      screenshotAttachmentName: 'recipe-screenshot',
      expectedClaimIds: [
        'claim:edit:category:precondition:1',
        'claim:edit:category:action:1',
        'claim:edit:category:expectation:1',
      ],
      verifiedClaimIds: [
        'claim:edit:category:precondition:1',
        'claim:edit:category:action:1',
        'claim:edit:category:expectation:1',
      ],
      claimVerification: {
        precondition: ['claim:edit:category:precondition:1'],
        action: ['claim:edit:category:action:1'],
        expectation: ['claim:edit:category:expectation:1'],
      },
      capabilityIds: ['navigation.sidebar.open', 'category.open', 'category.editIdentity'],
      assertionAdapterIds: ['productCenter.verifyEditedApi', 'productCenter.verifyEditedUi'],
      phaseDurationsMs: {
        auth: 0,
        sidebar: 120,
        seed: 80,
        uiAction: 640,
        network: 0,
        apiAssertion: 90,
        uiAssertion: 110,
        cleanup: 70,
        artifact: 0,
      },
    });

    expect(bundle.execution).toEqual({
      action: 'edit',
      resultKeys: ['category.editIdentity', 'category.open', 'navigation'],
      capabilityIds: ['navigation.sidebar.open', 'category.open', 'category.editIdentity'],
      assertionAdapterIds: ['productCenter.verifyEditedApi', 'productCenter.verifyEditedUi'],
      phaseDurationsMs: {
        auth: 0,
        sidebar: 120,
        seed: 80,
        uiAction: 640,
        network: 0,
        apiAssertion: 90,
        uiAssertion: 110,
        cleanup: 70,
        artifact: 0,
      },
    });
    expect(bundle.verifiedClaimIds).toHaveLength(3);
    expect(bundle.claimCoverageComplete).toBe(true);
    expect(bundle.sidebarEntryVerified).toBe(true);
  });

  test('门店商品只读证据应记录真实查询接口且不得伪装成标准商品创建', async () => {
    const bundle = buildProductCenterRuntimeEvidenceBundle({
      recipeId: 'product-center:test-plan-gold-set:read:store-product-search',
      caseId: 'read:store-product-search',
      action: 'read',
      results: {
        navigation: {
          mode: 'sidebar',
          targetPath: '/poi/location/prod-list',
          arrivedPath: '/poi/location/prod-list',
        },
        storeProductSearch: {
          trigger: 'input-change',
          locatorCount: 1,
          resultCount: 1,
          responseMethod: 'POST',
          responsePath: '/ops-poi/poi-items/pageQuery',
          responseStatus: 200,
          mutationAttempted: false,
          cleanupVerified: true,
        },
      },
      environmentId: 'balamxqa',
      brandId: '000407',
      screenshotAttachmentName: 'store-product-search-evidence',
    });

    expect(bundle.visibleUi.route).toBe('/poi/location/prod-list');
    expect(bundle.locatorUniqueness.nameInputCount).toBe(1);
    expect(bundle.network).toEqual({
      method: 'POST',
      operation: '/ops-poi/poi-items/pageQuery',
      requestCount: 1,
    });
    expect(bundle.api).toEqual({
      responseShape: ['data.list'],
      beforeEqualsAfter: true,
    });
    expect(bundle.network.operation).not.toBe('standard-item-create');
  });

  test('不得把 expected Claim 直接复制为已验证 Claim', async () => {
    const bundle = buildProductCenterRuntimeEvidenceBundle({
      recipeId: 'product-center:category:edit',
      caseId: 'edit:category',
      results: {
        navigation: { mode: 'sidebar', targetPath: '/pp/brand/category', arrivedPath: '/pp/brand/category' },
      },
      environmentId: 'balamxqa',
      brandId: '000407',
      screenshotAttachmentName: 'recipe-screenshot',
      expectedClaimIds: [
        'claim:edit:category:precondition:1',
        'claim:edit:category:action:1',
        'claim:edit:category:expectation:1',
      ],
      verifiedClaimIds: [
        'claim:edit:category:action:1',
        'claim:unknown:expectation:1',
        'claim:unknown:expectation:1',
      ],
    });

    expect(bundle.claimCoverageComplete).toBe(false);
    expect(bundle.verifiedClaimIds).toEqual([
      'claim:edit:category:action:1',
      'claim:unknown:expectation:1',
    ]);
    expect(bundle.missingClaimIds).toEqual([
      'claim:edit:category:expectation:1',
      'claim:edit:category:precondition:1',
    ]);
    expect(bundle.unexpectedClaimIds).toEqual(['claim:unknown:expectation:1']);
    expect(bundle.duplicateVerifiedClaimIds).toEqual(['claim:unknown:expectation:1']);
  });

  test('侧边栏证据应接受导航别名落点', async () => {
    const bundle = buildProductCenterRuntimeEvidenceBundle({
      recipeId: 'product-center:printer:edit',
      caseId: 'edit:printer',
      action: 'edit',
      results: {
        navigation: {
          mode: 'sidebar',
          targetPath: '/poi/printer-stall/list',
          arrivedPath: '/pp/printer-stall/list',
          verifiedPaths: ['/poi/printer-stall/list', '/pp/printer-stall/list'],
        },
      },
      environmentId: 'balamxqa',
      brandId: '000407',
      screenshotAttachmentName: 'recipe-screenshot',
      capabilityIds: ['navigation.sidebar.open'],
      assertionAdapterIds: ['productCenter.verifyEditedUi'],
    });

    expect(bundle.navigation).toMatchObject({
      targetPath: '/poi/printer-stall/list',
      arrivedPath: '/pp/printer-stall/list',
      verifiedPaths: ['/poi/printer-stall/list', '/pp/printer-stall/list'],
    });
    expect(bundle.sidebarEntryVerified).toBe(true);
  });

  test('正式前置条件应记录非敏感的实际执行证据', async () => {
    const bundle = buildProductCenterRuntimeEvidenceBundle({
      recipeId: 'product-center:test-plan-gold-set:delete:description-tag',
      caseId: 'delete:description-tag',
      action: 'delete',
      results: {
        navigation: {
          mode: 'sidebar',
          targetPath: '/pp/brand/tag/description',
          arrivedPath: '/pp/brand/tag/description',
        },
        preconditionEvidence: {
          groupTagCount: 2,
          referencedTagCount: 1,
          targetReferenceCount: 0,
          productReferenceVerified: true,
        },
      },
      environmentId: 'balamxqa',
      brandId: '000407',
      screenshotAttachmentName: 'recipe-screenshot',
      expectedClaimIds: ['claim:delete:description-tag:precondition:1'],
      verifiedClaimIds: ['claim:delete:description-tag:precondition:1'],
      claimVerification: {
        precondition: ['claim:delete:description-tag:precondition:1'],
        action: [],
        expectation: [],
      },
      capabilityIds: ['navigation.sidebar.open', 'lowDependency.execute'],
      assertionAdapterIds: ['productCenter.verifyAbsentApi', 'productCenter.verifyDeletedUi'],
    });

    expect(bundle.execution).toMatchObject({
      preconditionEvidence: {
        groupTagCount: 2,
        referencedTagCount: 1,
        targetReferenceCount: 0,
        productReferenceVerified: true,
      },
    });
    expect(JSON.stringify(bundle.execution.preconditionEvidence)).not.toMatch(
      /authorization|cookie|password|token/i,
    );
  });

  test('单规格零元商品证据应记录可见成功提示、唯一行、请求和双端价格', async () => {
    const bundle = buildProductCenterRuntimeEvidenceBundle({
      recipeId: 'product-center:test-plan-gold-set:create:item-standard-single-zero-price',
      caseId: 'create:item-standard-single-zero-price',
      results: {
        navigation: {
          mode: 'sidebar',
          targetPath: '/pp/brand/list',
          arrivedPath: '/pp/brand/list',
          verifiedPaths: ['/pp/brand/list'],
        },
        itemStandardSingleZeroPrice: {
          responseMethod: 'POST',
          responsePath: '/gateway/ops-brand/brand-items/standard',
          successMessageCount: 1,
          locatorCount: 1,
          apiRecordCount: 1,
          apiPrice: 0,
          listPrice: 0,
        },
      },
      environmentId: 'balamxqa',
      brandId: 'redacted-brand',
      screenshotAttachmentName: 'item-zero-price-runtime-evidence',
      action: 'create',
      capabilityIds: ['navigation.sidebar.open', 'item.createStandard'],
      assertionAdapterIds: [
        'productCenter.verifyItemStandardSingleZeroPriceApi',
        'productCenter.verifyItemStandardSingleZeroPriceUi',
      ],
    });

    expect(bundle.visibleUi).toMatchObject({ route: '/pp/brand/list', successMessageCount: 1 });
    expect(bundle.locatorUniqueness).toMatchObject({ nameInputCount: 1 });
    expect(bundle.network).toEqual({
      method: 'POST',
      operation: '/gateway/ops-brand/brand-items/standard',
      requestCount: 1,
    });
    expect(bundle.api).toMatchObject({ recordCount: 1, apiPrice: 0, listPrice: 0 });
  });

  test('通用网络证据扫描遇到循环对象时不得栈溢出', async () => {
    const cyclic: Record<string, unknown> = {
      responseMethod: 'DELETE',
      responsePath: '/item/v1/ops-brand/entities/123',
      responseCount: 1,
    };
    cyclic.self = cyclic;
    const bundle = buildProductCenterRuntimeEvidenceBundle({
      recipeId: 'product-center:category:delete',
      caseId: 'delete:category',
      results: {
        navigation: {
          mode: 'sidebar',
          targetPath: '/pp/brand/category',
          arrivedPath: '/pp/brand/category',
        },
        deletion: cyclic,
      },
      environmentId: 'balamxqa',
      brandId: 'redacted-brand',
      screenshotAttachmentName: 'category-delete-runtime-evidence',
    });

    expect(bundle.network).toEqual({
      method: 'DELETE',
      operation: '/item/v1/ops-brand/entities/123',
      requestCount: 1,
    });
  });

  test('边界复核应记录实际 maxlength 和定位器唯一性摘要', async () => {
    const bundle = buildProductCenterRuntimeEvidenceBundle({
      recipeId: 'product-center:description-tag-second-language-max:boundary',
      caseId: 'negative:description-tag-second-language-max',
      results: {
        navigation: { mode: 'sidebar', targetPath: '/pp/brand/tag/description', arrivedPath: '/pp/brand/tag/description' },
        boundary: {
          maxLengthAttribute: '50',
          acceptedValue: 'A'.repeat(50),
          rejectedValue: 'B'.repeat(50),
          locatorCount: 1,
          visible: true,
          enabled: true,
        },
      },
      environmentId: 'balamxqa',
      brandId: '000407',
      screenshotAttachmentName: 'boundary-evidence',
    });

    expect(bundle.execution.boundaryEvidence).toEqual({
      maxLengthAttribute: '50',
      acceptedLength: 50,
      rejectedLength: 50,
      locatorCount: 1,
      visible: true,
      enabled: true,
    });
  });
});
