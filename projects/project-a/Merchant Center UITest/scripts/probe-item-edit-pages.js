const { chromium } = require('playwright');

const baseURL = 'https://cc-fe.balamxqa.com';
const storageStatePath = 'output/auth-state.json';

const samples = [
  { name: 'MIXUE Fresh Lemonade', type: 'Standard' },
  { name: 'combo-group', type: 'Combo' },
  { name: 'Pearl', type: 'Add-On' },
];

async function probeEdit(page, itemName) {
  await page.goto('/pp/brand/list', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Item Name').fill(itemName);
  await page.waitForTimeout(2000);
  const row = page.locator('tbody tr.ant-table-row').filter({ hasText: itemName }).first();
  await row.waitFor({ state: 'visible', timeout: 15000 });
  const nameCell = row.locator('td').nth(1);
  await nameCell.locator('[class*="cursor"], a, span').first().click({ timeout: 5000 }).catch(async () => {
    await nameCell.click();
  });
  await page.waitForTimeout(3000);
  return {
    itemName,
    url: page.url(),
    pathname: new URL(page.url()).pathname,
    title: await page.title(),
    saveButtons: await page.getByRole('button', { name: /^Save$/ }).count(),
    itemNameValue: await page.getByLabel('Item Name', { exact: false }).inputValue().catch(() => ''),
    headings: await page.getByRole('heading', { level: 2 }).allTextContents(),
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
  for (const sample of samples) {
    console.log(JSON.stringify(await probeEdit(page, sample.name), null, 2));
  }
  await browser.close();
})();
