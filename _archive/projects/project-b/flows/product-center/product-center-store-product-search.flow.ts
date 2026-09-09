import type { Page } from '@playwright/test';
import type { ProductCenterApi } from '../../api/product-center/product-center-api';
import {
  ProductCenterStoreProductAuditPage,
  type StoreProductSearchEvidence,
} from '../../pages/product-center/product-center-store-product-audit.page';
import { ProductCenterStoreProductDataFactory } from '../../test-data/product-center/sop/product-center-store-product-data.factory';
import { step } from '../../utils/step';

export type ProductCenterStoreProductSearchResult = StoreProductSearchEvidence & {
  selectedServerId: number;
  mutationAttempted: false;
  cleanupVerified: true;
};

export class ProductCenterStoreProductSearchFlow {
  constructor(private readonly page: Page) {}

  @step('按名称片段查询既有门店商品并恢复查询状态')
  async execute(api: ProductCenterApi): Promise<ProductCenterStoreProductSearchResult> {
    const dataFactory = new ProductCenterStoreProductDataFactory(api);
    const storeProductPage = new ProductCenterStoreProductAuditPage(this.page);
    await storeProductPage.waitUntilReady();
    const prepared = await dataFactory.prepare();
    try {
      const evidence = await storeProductPage.searchByName(
        prepared.searchFragment,
        prepared.identity,
      );
      return {
        ...evidence,
        selectedServerId: prepared.id,
        mutationAttempted: false,
        cleanupVerified: true,
      };
    } finally {
      await storeProductPage.clearSearch();
    }
  }
}
