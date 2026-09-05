import { expect, test } from '@playwright/test';
import { ProductCenterApi } from '../../../api/product-center/product-center-api';
import { lowDependencySopCatalog } from '../../../sop/product-center/product-center-low-dependency-sop.catalog';
import { waitUntil } from '../../../utils/wait';

const taxDefinition = lowDependencySopCatalog.find((item) => item.entityKey === 'tax');
if (!taxDefinition) throw new Error('税率类型页面合同不存在');

test('认证、税率 API 与页面列表只读预检', async ({ page, request }) => {
  const responsePromise = page.waitForResponse(
    (response) => taxDefinition.listResponse.test(response.url()) && response.status() === 200,
    { timeout: 60_000 },
  );
  await page.goto(taxDefinition.route, { waitUntil: 'domcontentloaded' });
  await responsePromise;
  await expect(page.locator('main:visible')).toHaveCount(1);
  await expect(page.locator('input[type="email"]')).toHaveCount(0);

  const api = new ProductCenterApi(request);
  const probe = await waitUntil(
    () => api.taxPage('AUTO_AUDIT_TAX_PREFLIGHT_READ'),
    (value) => Boolean(value && typeof value === 'object'),
    { timeout: 30_000, interval: 500, message: '税率列表 API 只读预检失败' },
  );
  expect(probe).toBeTruthy();
});
