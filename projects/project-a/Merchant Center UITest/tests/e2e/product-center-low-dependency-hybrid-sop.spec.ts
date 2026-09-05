import { expect, test } from '../../fixtures/product-center.fixture';
import { ProductCenterLowDependencySopFlow } from '../../flows/product-center/product-center-low-dependency-sop.flow';
import {
  generateLowDependencySopCases,
  lowDependencySopCatalog,
} from '../../sop/product-center/product-center-low-dependency-sop.catalog';
import { ProductCenterLowDependencyDataFactory } from '../../test-data/product-center/sop/product-center-low-dependency-data.factory';
import { waitUntil } from '../../utils/wait';

const cases = generateLowDependencySopCases(lowDependencySopCatalog);

test.describe('商品中心低依赖实体 API 前置 UI 操作 SOP', () => {
  test.describe.configure({ mode: 'parallel', timeout: 180_000 });

  for (const sopCase of cases) {
    const actionName = sopCase.action === 'edit' ? '编辑' : '删除';
    test(
      `${sopCase.entityName}应使用 API 前置数据完成 UI ${actionName}并验证双终态`,
      { tag: ['@sop', '@hybrid', '@low-dependency'] },
      async ({ page, productCenterApi, cleanupRegistry, executionLedger }) => {
        const factory = new ProductCenterLowDependencyDataFactory(productCenterApi);
        const flow = new ProductCenterLowDependencySopFlow(page);
        const record = await test.step('API 创建唯一审计数据并记录服务端 ID', async () =>
          factory.seed(sopCase.entityKey, cleanupRegistry),
        );

        await test.step(`UI 执行${actionName}正向 SOP`, async () => {
          executionLedger.markPhase(record.checkpointEntryId, 'ui-triggered');
          if (sopCase.action === 'edit') {
            await flow.edit(sopCase, record);
          } else {
            await flow.delete(sopCase, record);
          }
          executionLedger.markPhase(record.checkpointEntryId, 'mutation-observed');
        });

        await test.step('API 验证服务端终态', async () => {
          const verified = await waitUntil(
            () => sopCase.action === 'edit' ? factory.verifyEdited(record) : factory.verifyAbsent(record),
            (value) => value,
            { timeout: 60_000, interval: 500, message: `${sopCase.entityName}${actionName}后服务端终态不正确` },
          );
          expect(verified).toBe(true);
          executionLedger.markPhase(record.checkpointEntryId, 'api-verified');
        });

        await test.step('UI 重新打开并验证终态', async () => {
          if (sopCase.action === 'edit') {
            await flow.verifyEditedUi(sopCase, record);
          } else {
            await flow.verifyDeletedUi(sopCase, record);
          }
          executionLedger.markPhase(record.checkpointEntryId, 'ui-verified');
          expect(
            executionLedger.snapshot().entries.find((entry) => entry.entryId === record.checkpointEntryId)?.phase,
          ).toBe('ui-verified');
        });
      },
    );
  }
});