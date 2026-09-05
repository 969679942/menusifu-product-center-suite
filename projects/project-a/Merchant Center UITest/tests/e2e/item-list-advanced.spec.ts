import { test } from '../../fixtures/test.fixture';
import { ItemCreateFlow } from '../../flows/item-create.flow';
import { ItemListFlow } from '../../flows/item-list.flow';
import { ItemRowActionFlow } from '../../flows/item-row-action.flow';

test.describe('商品列表筛选 E2E', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test(
    '搜索不存在商品时应显示无结果',
    {
      tag: ['@e2e', '@item-list', '@item-filter'],
    },
    async ({ page }) => {
      const listFlow = new ItemListFlow();
      await listFlow.searchNonExistingItem(page);
    },
  );

  test(
    '按标准商品类型筛选后每行类型应一致',
    {
      tag: ['@e2e', '@item-list', '@item-filter'],
    },
    async ({ page }) => {
      const listFlow = new ItemListFlow();
      await listFlow.filterStandardItems(page);
    },
  );

  test(
    '按启用状态筛选后每行状态应一致',
    {
      tag: ['@e2e', '@item-list', '@item-filter'],
    },
    async ({ page }) => {
      const listFlow = new ItemListFlow();
      await listFlow.filterEnabledItems(page);
    },
  );

  test(
    '点击重置应恢复列表默认展示',
    {
      tag: ['@e2e', '@item-list', '@item-filter'],
    },
    async ({ page }) => {
      const listFlow = new ItemListFlow();
      await listFlow.resetFiltersAndExpectData(page);
    },
  );
});

test.describe('商品列表批量与导入 E2E', () => {
  test(
    '选中商品后批量操作菜单应展示预期项',
    {
      tag: ['@e2e', '@item-list', '@item-batch'],
    },
    async ({ page }) => {
      const listFlow = new ItemListFlow();
      await listFlow.selectFirstRowAndExpectBatchMenuItems(page);
    },
  );

  test(
    '点击导入记录应进入导入记录页',
    {
      tag: ['@e2e', '@item-list', '@item-import'],
    },
    async ({ page }) => {
      const listFlow = new ItemListFlow();
      await listFlow.openImportRecordFromList(page);
    },
  );

  test(
    '点击操作菜单图片导入应进入图片导入页',
    {
      tag: ['@e2e', '@item-list', '@item-import'],
    },
    async ({ page }) => {
      const listFlow = new ItemListFlow();
      await listFlow.openImageImportFromList(page);
    },
  );

  test(
    '点击操作菜单商品导入应进入商品导入页',
    {
      tag: ['@e2e', '@item-list', '@item-import'],
    },
    async ({ page }) => {
      const listFlow = new ItemListFlow();
      await listFlow.openProductImportFromList(page);
    },
  );
});

test.describe('商品行操作 E2E', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test(
    '创建加料/配菜商品后删除应从列表消失',
    {
      tag: ['@e2e', '@item-list', '@item-delete'],
    },
    async ({ page }) => {
      const rowActionFlow = new ItemRowActionFlow();
      await rowActionFlow.createSideItemAndDelete(page);
    },
  );
});

test.describe('商品创建校验 E2E', () => {
  test(
    '标准商品未填必填项点击保存应停留在创建页',
    {
      tag: ['@e2e', '@item-create', '@item-validation'],
    },
    async ({ page }) => {
      const createFlow = new ItemCreateFlow();
      await createFlow.expectStandardSaveBlockedWithoutRequiredFields(page);
    },
  );
});
