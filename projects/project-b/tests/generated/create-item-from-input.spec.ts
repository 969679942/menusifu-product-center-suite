import { test } from '../../fixtures/test.fixture';
import { ItemCreateFlow } from '../../flows/item-create.flow';
import { ItemListFlow } from '../../flows/item-list.flow';

/** 一次性：按用户输入创建标准商品「111」 */
test('应能创建标准商品111并在列表中搜索到', { tag: ['@generated'] }, async ({ page }) => {
  const createFlow = new ItemCreateFlow();
  const listFlow = new ItemListFlow();

  const created = await createFlow.createStandardSingleSpecItem(page, {
    name: '111',
    price: '9.99',
  });

  await listFlow.searchExistingItem(page, created.name);
});
