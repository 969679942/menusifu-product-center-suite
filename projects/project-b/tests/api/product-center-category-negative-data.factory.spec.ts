import { test, expect } from '../../fixtures/product-center.fixture';
import { ProductCenterCategoryNegativeDataFactory } from '../../test-data/product-center/sop/product-center-category-negative-data.factory';

test.describe('商品分类关系阻断 API 数据生命周期', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test('应创建带商品的一级分类并按依赖逆序清理', async ({
    productCenterApi,
    cleanupRegistry,
    executionLedger,
  }) => {
    const factory = new ProductCenterCategoryNegativeDataFactory(productCenterApi);

    const record = await test.step('通过 API 创建一级分类和分类下商品', async () =>
      factory.seedCategoryWithProduct(cleanupRegistry));

    await test.step('验证前置数据和检查点已立即登记', async () => {
      expect(record.parentCategoryName).toMatch(/^AUTO_AUDIT_/);
      expect(record.productName).toMatch(/^AUTO_AUDIT_/);
      expect(record.childCategoryName).toMatch(/^AUTO_AUDIT_/);
      expect(await factory.findCategory(record.parentCategoryName)).toMatchObject({
        id: record.parentCategoryId,
        name: record.parentCategoryName,
      });
      expect(await factory.findProduct(record.productName)).toMatchObject({
        id: record.productId,
        name: record.productName,
      });
      expect(executionLedger.snapshot().entries).toEqual(expect.arrayContaining([
        expect.objectContaining({
          entryId: record.checkpointEntryId,
          entityKind: 'category',
          serverId: record.parentCategoryId,
        }),
        expect.objectContaining({
          entityKind: 'bom-product',
          serverId: record.productId,
          dependencyOf: record.checkpointEntryId,
        }),
      ]));
    });

    await test.step('执行清理并验证父分类和商品零残留', async () => {
      await cleanupRegistry.cleanupAll();
      expect(await factory.findProduct(record.productName)).toBeUndefined();
      expect(await factory.findCategory(record.parentCategoryName)).toBeUndefined();
      expect(executionLedger.incompleteEntries()).toEqual([]);
    });
  });
});
