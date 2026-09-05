import { establishMerchantCenterSession } from '../flows/auth.flow';
import { test } from '../fixtures/test.fixture';
import { resolveAuthCredentials } from '../test-data/auth';
import { SidebarPage } from '../pages/sidebar.page';

test.describe('Playwright Test Agents 种子入口', () => {
  test(
    '应能通过 OAuth 登录并选择商户进入商户中心',
    {
      tag: ['@seed'],
    },
    async ({ page }) => {
      const auth = resolveAuthCredentials();
      await establishMerchantCenterSession(page, auth);

      const sidebarPage = new SidebarPage(page);
      await sidebarPage.expectProductManagementVisible();
    },
  );
});
