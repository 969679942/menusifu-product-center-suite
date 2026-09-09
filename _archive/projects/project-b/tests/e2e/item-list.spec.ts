import { test } from '../../fixtures/test.fixture';
import { ItemCreateFlow } from '../../flows/item-create.flow';
import { ItemListFlow } from '../../flows/item-list.flow';
import { itemSamples } from '../../test-data/item-list';

test.describe('商品列表 E2E', () => {
  test(
    '应能加载商品列表并显示关键操作区与分页',
    {
      tag: ['@e2e', '@item-list'],
    },
    async ({ page }) => {
      const listFlow = new ItemListFlow();
      await listFlow.expectListLoadedWithPagination(page);
    },
  );

  test(
    '应能按商品名称搜索并展示匹配结果',
    {
      tag: ['@e2e', '@item-list'],
    },
    async ({ page }) => {
      const listFlow = new ItemListFlow();
      await listFlow.searchExistingItem(page, itemSamples.existingName);
    },
  );

  test(
    '未选中商品时批量操作按钮应禁用',
    {
      tag: ['@e2e', '@item-list'],
    },
    async ({ page }) => {
      const listFlow = new ItemListFlow();
      await listFlow.expectBatchActionDisabledWhenNoneSelected(page);
    },
  );

  test(
    '选中商品后批量操作按钮应可用并显示选中数量',
    {
      tag: ['@e2e', '@item-list'],
    },
    async ({ page }) => {
      const listFlow = new ItemListFlow();
      await listFlow.selectFirstRowAndExpectBatchEnabled(page);
    },
  );

  test(
    '顶部操作菜单应包含图片导入与商品导入选项',
    {
      tag: ['@e2e', '@item-list'],
    },
    async ({ page }) => {
      const listFlow = new ItemListFlow();
      await listFlow.expectActionMenuHasImportOptions(page);
    },
  );

  test(
    '行操作菜单应包含停用、复制、删除选项',
    {
      tag: ['@e2e', '@item-list'],
    },
    async ({ page }) => {
      const listFlow = new ItemListFlow();
      await listFlow.expectFirstRowActionMenuHasOptions(page);
    },
  );
});

test.describe('新增商品 E2E', () => {
  test(
    '点击新增商品应进入商品类型选择页',
    {
      tag: ['@e2e', '@item-list', '@item-create'],
    },
    async ({ page }) => {
      const createFlow = new ItemCreateFlow();
      await createFlow.openTypeSelectionFromList(page);
    },
  );

  test(
    '应能进入标准商品创建表单',
    {
      tag: ['@e2e', '@item-list', '@item-create'],
    },
    async ({ page }) => {
      const createFlow = new ItemCreateFlow();
      await createFlow.openStandardCreateFromList(page);
    },
  );

  test(
    '应能进入套餐商品创建表单',
    {
      tag: ['@e2e', '@item-list', '@item-create'],
    },
    async ({ page }) => {
      const createFlow = new ItemCreateFlow();
      await createFlow.openComboCreateFromList(page);
    },
  );

  test(
    '应能进入加料/配菜商品创建表单',
    {
      tag: ['@e2e', '@item-list', '@item-create'],
    },
    async ({ page }) => {
      const createFlow = new ItemCreateFlow();
      await createFlow.openSideCreateFromList(page);
    },
  );
});
