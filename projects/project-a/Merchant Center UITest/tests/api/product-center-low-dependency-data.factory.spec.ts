import { test, expect } from '../../fixtures/product-center.fixture';
import { lowDependencySopCatalog } from '../../sop/product-center/product-center-low-dependency-sop.catalog';
import { ProductCenterLowDependencyDataFactory } from '../../test-data/product-center/sop/product-center-low-dependency-data.factory';

test.describe('商品中心低依赖实体数据工厂', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  for (const definition of lowDependencySopCatalog) {
    test(`${definition.entityName}应通过 API 创建并登记清理台账`, async ({ productCenterApi, cleanupRegistry, executionLedger }) => {
      const factory = new ProductCenterLowDependencyDataFactory(productCenterApi);
      const record = await factory.seed(definition.entityKey, cleanupRegistry);
      expect(record.id).toBeDefined();
      expect(record.originalIdentity).toMatch(/^AUTO_AUDIT_/);
      expect(await factory.find(record.entityKey, record.originalIdentity)).toMatchObject({ id: record.id });
      expect(executionLedger.snapshot().entries.length).toBeGreaterThan(0);
    });
  }

  test('加料组应创建可供 UI 编辑的商品依赖并登记逆序清理', async ({ productCenterApi, cleanupRegistry, executionLedger }) => {
    const factory = new ProductCenterLowDependencyDataFactory(productCenterApi);
    const record = await factory.seed('addon', cleanupRegistry);
    const entries = executionLedger.snapshot().entries;
    expect(entries.find((entry) => entry.entryId === record.checkpointEntryId)?.cleanupOrder).toBe(40);
    expect(entries.some((entry) => entry.entityKind === 'bom-product' && entry.cleanupOrder === 10)).toBe(true);
  });
});
