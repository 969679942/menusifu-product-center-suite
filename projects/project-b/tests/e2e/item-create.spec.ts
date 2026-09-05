import { test } from '../../fixtures/test.fixture';
import { ItemCreateFlow } from '../../flows/item-create.flow';
import { ItemEditFlow } from '../../flows/item-edit.flow';
import { itemEditSamples } from '../../test-data/item-create';

test.describe('商品编辑页 E2E', () => {
  for (const [key, sample] of Object.entries(itemEditSamples)) {
    test(
      `搜索${key}类型商品应能进入编辑页`,
      {
        tag: ['@e2e', '@item-edit', `@item-${sample.type}`],
      },
      async ({ page }) => {
        const editFlow = new ItemEditFlow();
        await editFlow.openEditByItemName(page, sample.name, sample.type);
      },
    );
  }
});

test.describe('创建商品 E2E', () => {
  test(
    '应能创建标准商品并在编辑页看到商品名称',
    {
      tag: ['@e2e', '@item-create', '@item-standard'],
    },
    async ({ page }) => {
      const createFlow = new ItemCreateFlow();
      await createFlow.createItemAndExpectEditPageName(page, 'standard');
    },
  );

  test(
    '应能创建套餐商品并在编辑页看到商品名称',
    {
      tag: ['@e2e', '@item-create', '@item-combo'],
    },
    async ({ page }) => {
      const createFlow = new ItemCreateFlow();
      await createFlow.createItemAndExpectEditPageName(page, 'combo');
    },
  );

  test(
    '应能创建加料/配菜商品并在编辑页看到商品名称',
    {
      tag: ['@e2e', '@item-create', '@item-side'],
    },
    async ({ page }) => {
      const createFlow = new ItemCreateFlow();
      await createFlow.createItemAndExpectEditPageName(page, 'side');
    },
  );
});
