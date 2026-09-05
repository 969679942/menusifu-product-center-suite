import { test, expect } from '../../fixtures/product-center.fixture';
import { productCenterCreateSopCatalog } from '../../sop/product-center/product-center-create-sop.catalog';
import { ProductCenterCreateDataFactory } from '../../test-data/product-center/sop/product-center-create-data.factory';
import { ProductCenterCreateSopFlow } from '../../flows/product-center/product-center-create-sop.flow';
import { waitUntil } from '../../utils/wait';

test.describe('商品中心五实体 UI 创建 SOP', () => {
  test.describe.configure({ mode: 'parallel', timeout: 240_000 });

  for (const definition of productCenterCreateSopCatalog) {
    test(`${definition.entityName}应通过 UI 创建并完成 API UI 双验证`, { tag: definition.entityKey === 'category' ? ['@fast'] : [] }, async ({
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    }) => {
      const factory = new ProductCenterCreateDataFactory(productCenterApi);
      const context = await test.step('准备 UI 创建输入和 API 依赖', async () =>
        factory.prepare(definition.entityKey, cleanupRegistry),
      );
      const flow = new ProductCenterCreateSopFlow(page);

      await test.step('通过 UI 创建主实体并等待最终 POST', async () => {
        await flow.create(definition, context);
      });

      const created = await test.step('API 查询创建结果并立即登记服务端 ID', async () => {
        const record = await waitUntil(
          () => factory.findPrimary(context),
          (value) => value?.name === context.originalIdentity,
          { timeout: 60_000, interval: 500, message: `${definition.entityName}UI 创建后 API 未找到主实体` },
        );
        const seedRecord = await factory.registerCreated(context, record!, cleanupRegistry);
        executionLedger.markPhase(seedRecord.checkpointEntryId, 'mutation-observed');
        executionLedger.markPhase(seedRecord.checkpointEntryId, 'api-verified');
        return seedRecord;
      });

      await test.step('重新打开列表并验证 UI 创建终态', async () => {
        await flow.verifyCreatedUi(definition, created);
        executionLedger.markPhase(created.checkpointEntryId, 'ui-verified');
        expect(executionLedger.snapshot().entries.find((entry) => entry.entryId === created.checkpointEntryId)?.phase).toBe('ui-verified');
      });
    });
  }
});
