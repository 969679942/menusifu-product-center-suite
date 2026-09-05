import { test } from '../../fixtures/test.fixture';
import { ItemCreateStandardFlow } from '../../flows/item-create-standard.flow';

test.describe('标准商品创建表单区块 E2E', () => {
  test(
    '应能展开并操作基本信息、高级设置、价格、属性与其他设置',
    {
      tag: ['@e2e', '@item-create', '@item-standard', '@item-standard-form'],
    },
    async ({ page }) => {
      const standardFlow = new ItemCreateStandardFlow();
      await standardFlow.browseFullCreateFormAndExpectStillOnPage(page);
    },
  );
});
