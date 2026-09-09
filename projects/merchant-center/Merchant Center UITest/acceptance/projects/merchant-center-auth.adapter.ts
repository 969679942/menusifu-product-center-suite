import type { Browser, BrowserContext } from '@playwright/test';
import { establishMerchantCenterSession } from '../../flows/auth.flow';
import { resolveAuthCredentials } from '../../test-data/auth';
import type { AcceptanceAuthAdapter } from './acceptance-project';

export const merchantCenterAuthAdapter: AcceptanceAuthAdapter = {
  async createContext(browser: Browser): Promise<BrowserContext> {
    const auth = resolveAuthCredentials();
    if (!auth.username || !auth.password || !auth.merchant || !auth.brandId) {
      throw new Error('缺少商户中心安全凭据或商户上下文。');
    }

    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      locale: 'en-US',
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    try {
      await establishMerchantCenterSession(page, auth);
      return context;
    } catch (error) {
      await context.close();
      throw error;
    } finally {
      await page.close().catch(() => undefined);
    }
  },
};
