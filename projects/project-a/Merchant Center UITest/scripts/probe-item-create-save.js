const { chromium } = require('playwright');

const baseURL = 'https://cc-fe.balamxqa.com';
const storageStatePath = 'output/auth-state.json';

async function probeCreateSave(page, path, itemName) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const itemNameInput = page.getByLabel('Item Name', { exact: false });
  await itemNameInput.waitFor({ state: 'visible', timeout: 30000 });
  await itemNameInput.fill(itemName);
  const priceInput = page.getByRole('spinbutton', { name: 'Price(Required)' });
  if (await priceInput.isVisible().catch(() => false)) {
    await priceInput.fill('9.99');
  }
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^Save$/ }).click();
  await page.waitForTimeout(5000);
  return {
    path,
    itemName,
    afterUrl: page.url(),
    afterPathname: new URL(page.url()).pathname,
    toast: await page.locator('.ant-message-notice-content, .ant-notification-notice-message').allTextContents().catch(() => []),
    errors: await page.locator('.ant-form-item-explain-error').allTextContents().catch(() => []),
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: storageStatePath,
    viewport: { width: 1440, height: 900 },
    baseURL,
  });
  const page = await context.newPage();
  const ts = Date.now();
  for (const [type, path] of [
    ['standard', '/pp/brand/create/standard'],
    ['combo', '/pp/brand/create/combo'],
    ['side', '/pp/brand/create/side'],
  ]) {
    console.log(JSON.stringify(await probeCreateSave(page, path, `AUTO-${type}-${ts}`), null, 2));
  }
  await browser.close();
})();
