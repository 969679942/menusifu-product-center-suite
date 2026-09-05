import { test as base } from '@playwright/test';
import { AuthLoginPage, MerchantSelectionPage } from '../pages/auth-login.page';
import { BrandPicturePage } from '../pages/brand-picture.page';

type AppFixtures = {
  authLoginPage: AuthLoginPage;
  merchantSelectionPage: MerchantSelectionPage;
  brandPicturePage: BrandPicturePage;
};

export const test = base.extend<AppFixtures>({
  authLoginPage: async ({ page }, use) => {
    await use(new AuthLoginPage(page));
  },
  merchantSelectionPage: async ({ page }, use) => {
    await use(new MerchantSelectionPage(page));
  },
  brandPicturePage: async ({ page }, use) => {
    await use(new BrandPicturePage(page));
  },
});

export { expect } from '@playwright/test';
