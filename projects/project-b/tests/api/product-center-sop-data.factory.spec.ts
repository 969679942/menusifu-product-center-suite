import { test, expect } from '../../fixtures/product-center.fixture';
import { ProductCenterSopDataFactory } from '../../test-data/product-center/sop/product-center-sop-data.factory';
import type { ProductCenterCoreEntityKey } from '../../sop/product-center/product-center-sop.types';

const entities: readonly ProductCenterCoreEntityKey[] = [
  'category',
  'method',
  'material',
  'seasoning',
  'bom',
];

test.describe('商品中心 SOP API 数据生命周期', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  for (const entityKey of entities) {
    test(`${entityKey}应通过 API 创建可追踪审计数据并登记反向清理`, async ({
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    }) => {
      const factory = new ProductCenterSopDataFactory(productCenterApi);

      const record = await test.step('通过 API 创建唯一审计数据', async () =>
        factory.seed(entityKey, cleanupRegistry),
      );

      await test.step('验证服务端 ID 和审计身份', async () => {
        expect(record.id).toBeDefined();
        expect(record.originalIdentity).toMatch(/^AUTO_AUDIT_/);
        expect(record.editedIdentity).toBe(`${record.originalIdentity}_EDIT`);
        expect(await factory.find(entityKey, record.originalIdentity)).toMatchObject({
          id: record.id,
          name: record.originalIdentity,
        });
      });

      await test.step('验证所有清理身份均限定为审计数据', async () => {
        expect(record.cleanupIdentities.length).toBeGreaterThan(0);
        for (const identity of record.cleanupIdentities) {
          expect(identity).toMatch(/^AUTO_AUDIT_/);
        }
      });
      if (entityKey === 'bom') {
        await test.step('验证配方单四级依赖均已即时写入台账', async () => {
          expect(executionLedger.snapshot().entries.map((entry) => entry.entityKind)).toEqual([
            'bom-product',
            'material',
            'recipe-ingredient',
            'bom',
          ]);
        });
      }
    });
  }

  test('API Seed 应立即把服务端 ID 写入执行台账', async ({
    productCenterApi,
    cleanupRegistry,
    executionLedger,
  }) => {
    const factory = new ProductCenterSopDataFactory(productCenterApi);
    const record = await factory.seed('category', cleanupRegistry);

    expect(record.checkpointEntryId).toBe(`category-${record.id}`);
    expect(executionLedger.snapshot().entries).toContainEqual(
      expect.objectContaining({
        entryId: record.checkpointEntryId,
        serverId: record.id,
        identity: record.originalIdentity,
        phase: 'seeded',
      }),
    );
  });});


