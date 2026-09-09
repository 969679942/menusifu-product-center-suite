import { test } from '../../fixtures/test.fixture';
import { ItemCreateFlow } from '../../flows/item-create.flow';

test.describe('创建标准商品 E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test(
    '应能创建单规格标准商品并在列表中搜索到',
    {
      tag: ['@e2e', '@item-create', '@item-standard', '@item-single-spec'],
    },
    async ({ page }) => {
      const createFlow = new ItemCreateFlow();
      await createFlow.createSingleSpecAndExpectEmptySpecInList(page);
    },
  );

  test(
    '应能创建多规格标准商品并在列表看到规格信息',
    {
      tag: ['@e2e', '@item-create', '@item-standard', '@item-multi-spec'],
    },
    async ({ page }) => {
      const createFlow = new ItemCreateFlow();
      await createFlow.createMultiSpecAndExpectSpecInList(page);
    },
  );

  test(
    '应能创建称重标准商品并在列表中搜索到',
    {
      tag: ['@e2e', '@item-create', '@item-standard', '@item-weight'],
    },
    async ({ page }) => {
      const createFlow = new ItemCreateFlow();
      await createFlow.createWeightAndExpectSearchableInList(page);
    },
  );
});
