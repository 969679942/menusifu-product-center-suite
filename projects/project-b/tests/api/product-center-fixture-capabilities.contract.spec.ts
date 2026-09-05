import { expect, test } from '@playwright/test';
import {
  hasLocalProductCenterFixtureCapability,
  productCenterFixtureCapabilities,
} from '../../test-data/product-center/product-center-fixture-capabilities';
import {
  brandProductFixtureCleanupOrder,
  ProductCenterItemCreateDataFactory,
  readSkuIds,
} from '../../test-data/product-center/product-center-item-create-data.factory';

test.describe('商品中心统一造数能力合同', () => {
  test('品牌商品、SKU、引用 owner 和清理能力必须机器可发现', async () => {
    expect(hasLocalProductCenterFixtureCapability('brand-product.single-sku.api')).toBe(true);
    expect(hasLocalProductCenterFixtureCapability('brand-product.addon-candidate.api')).toBe(true);
    expect(hasLocalProductCenterFixtureCapability('brand-product.combo-candidate.api')).toBe(true);
    expect(hasLocalProductCenterFixtureCapability('brand-product.multi-sku.ui')).toBe(true);
    expect(hasLocalProductCenterFixtureCapability('brand-product.group-reference-owner.ui')).toBe(true);
    expect(hasLocalProductCenterFixtureCapability('brand-product.cleanup.api-ui')).toBe(true);
    expect(productCenterFixtureCapabilities.filter((item) => item.availability === 'external-required').map((item) => item.capabilityId)).toEqual([
      'terminal.observation.external',
      'industry-item.inheritance.external',
    ]);
  });

  test('公共工厂必须返回服务端商品、SKU 和清理合同', async () => {
    expect(ProductCenterItemCreateDataFactory.prototype.createSingleSkuBrandProduct).toBeDefined();
    expect(readSkuIds({ data: { skuList: [{ id: 11 }, { skuId: 12 }, { id: 11 }] } })).toEqual([11, 12]);
    expect(readSkuIds({ data: { sectionItemList: [{ skuId: 21 }, { skuId: 22 }] } })).toEqual([21, 22]);
    expect(readSkuIds({ data: { skuList: [] } })).toEqual([]);
  });

  test('本地造数能力不得进入人工审核队列并必须零残留清理', () => {
    const localCapabilities = productCenterFixtureCapabilities.filter(
      (capability) => capability.availability === 'local-automated',
    );
    expect(localCapabilities.length).toBeGreaterThan(0);
    expect(localCapabilities.every((capability) => capability.humanReviewRequired === false)).toBe(true);
    expect(localCapabilities.every((capability) => capability.cleanupPolicy === 'api-ui-zero-residue')).toBe(true);
    expect(brandProductFixtureCleanupOrder).toEqual({
      'group-reference-owner': 60,
      'addon-candidate': 20,
      'combo-candidate': 20,
    });
  });

  test('只有真实终端和行业商品来源能力允许转交外部负责人', () => {
    const externalCapabilities = productCenterFixtureCapabilities.filter(
      (capability) => capability.availability === 'external-required',
    );
    expect(externalCapabilities.map((capability) => capability.capabilityId).sort()).toEqual([
      'industry-item.inheritance.external',
      'terminal.observation.external',
    ]);
    expect(externalCapabilities.every((capability) => capability.humanReviewRequired)).toBe(true);
    expect(externalCapabilities.every((capability) => capability.cleanupPolicy === 'external-owner')).toBe(true);
  });
});
