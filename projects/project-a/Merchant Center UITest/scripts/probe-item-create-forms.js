const { chromium } = require('playwright');

const baseURL = 'https://cc-fe.balamxqa.com';
const storageStatePath = 'output/auth-state.json';

async function probeForm(page, path) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  return {
    path,
    url: page.url(),
    title: await page.title(),
    headings: await page.getByRole('heading').allTextContents(),
    buttons: await page.getByRole('button').allTextContents().then((items) => [...new Set(items.map((t) => t.trim()).filter(Boolean))].slice(0, 15)),
    labels: await page.locator('label').allTextContents().then((items) => [...new Set(items.map((t) => t.trim()).filter(Boolean))].slice(0, 20)),
    tabs: await page.getByRole('tab').allTextContents().catch(() => []),
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
  for (const path of ['/pp/brand/create/standard', '/pp/brand/create/combo', '/pp/brand/create/side']) {
    console.log(JSON.stringify(await probeForm(page, path), null, 2));
  }
  await browser.close();
})();
