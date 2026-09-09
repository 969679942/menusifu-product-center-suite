import { test, expect } from '../../fixtures/product-center.fixture';
import { ProductCenterCreateDataFactory } from '../../test-data/product-center/sop/product-center-create-data.factory';

test.describe('商品中心 UI 创建数据工厂', () => {
  test('商品分类准备阶段不得通过 API 创建主实体', async ({ productCenterApi, cleanupRegistry, executionLedger }) => {
    const factory = new ProductCenterCreateDataFactory(productCenterApi);
    const context = await factory.prepare('category', cleanupRegistry);

    expect(await factory.findPrimary(context)).toBeUndefined();
    expect(executionLedger.snapshot().entries).toEqual([]);
    expect(context.metadata.code).toMatch(/^A\d+$/);
  });

  test('配方单准备阶段应只创建三层 API 依赖', async ({ productCenterApi, cleanupRegistry, executionLedger }) => {
    const factory = new ProductCenterCreateDataFactory(productCenterApi);
    const context = await factory.prepare('bom', cleanupRegistry);

    expect(await factory.findPrimary(context)).toBeUndefined();
    expect(executionLedger.snapshot().entries.map((entry) => entry.entityKind)).toEqual([
      'bom-product', 'material', 'recipe-ingredient',
    ]);
    expect(context.metadata.productId).toBeDefined();
    expect(context.metadata.recipeIngredientId).toBeDefined();
  });
});
