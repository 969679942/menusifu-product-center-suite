import { expect, test } from '../../fixtures/product-center.fixture';
import { highDependencySopCatalog } from '../../sop/product-center/product-center-high-dependency-sop.catalog';
import { ProductCenterHighDependencyDataFactory } from '../../test-data/product-center/sop/product-center-high-dependency-data.factory';

test.describe('商品中心高依赖实体数据工厂', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });
  for (const definition of highDependencySopCatalog) {
    test(`${definition.entityName}应通过 API 创建依赖并登记清理台账`, async ({ productCenterApi, cleanupRegistry, executionLedger }) => {
      const factory = new ProductCenterHighDependencyDataFactory(productCenterApi);
      const record = await factory.seed(definition.entityKey, cleanupRegistry);
      expect(record.originalIdentity).toMatch(/^AUTO_AUDIT_/);
      expect(record.id).toBeDefined();
      expect(executionLedger.snapshot().entries.some((entry) => entry.entryId === record.checkpointEntryId)).toBe(true);
      if (definition.entityKey === 'recipe-ingredient' || definition.entityKey === 'combo') {
        expect(executionLedger.snapshot().entries.length).toBeGreaterThanOrEqual(2);
      }
    });
  }
});