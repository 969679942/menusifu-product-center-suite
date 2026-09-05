import { expect, test } from '@playwright/test';
import type { ProductCenterApi } from '../../api/product-center/product-center-api';
import { ProductCenterStoreProductDataFactory } from '../../test-data/product-center/sop/product-center-store-product-data.factory';

test.describe('商品中心门店商品 Gold 只读数据准备合同', () => {
  test('应从门店商品查询接口选择可唯一模糊命中的既有商品且不产生变更', async () => {
    const calls: string[] = [];
    const api = {
      storePoiProductPage: async (name?: string) => {
        calls.push(`storePoiProductPage:${name ?? ''}`);
        const records = [
          { itemBasic: { id: 101, name: 'Existing Match Alpha' }, category: { id: 201, name: 'Shared Category' } },
          { itemBasic: { id: 102, name: 'Different Product' }, category: { id: 201, name: 'Shared Category' } },
        ];
        return {
          data: {
            list: records.filter((record) => !name || record.itemBasic.name.includes(name)),
          },
        };
      },
    } as unknown as ProductCenterApi;
    const prepared = await new ProductCenterStoreProductDataFactory(api).prepare();

    expect(prepared).toEqual({
      id: 101,
      identity: 'Existing Match Alpha',
      searchFragment: 'Existing Match Alph',
      mutationAttempted: false,
    });
    expect(calls).toEqual([
      'storePoiProductPage:',
      'storePoiProductPage:Existing Match Alph',
    ]);
  });
});
