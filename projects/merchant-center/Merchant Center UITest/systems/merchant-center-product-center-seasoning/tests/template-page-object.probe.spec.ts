import { expect, test } from '@playwright/test';
import { SeasoningBoundaryPage } from '../../../pages/product-center/seasoning-boundary.page';

test('调味模板页面对象定向探针', async ({ page }) => {
  const seasoning = new SeasoningBoundaryPage(page);
  await seasoning.openTemplateCreate();
  const fields = await seasoning.readTemplateCreateFields();
  expect(fields).toEqual({
    name: '调味模版名称',
    secondLanguage: '请输入第二语言',
    description: '模板说明',
    selectSeasoningVisible: true,
    sortDisabled: true,
  });
});
