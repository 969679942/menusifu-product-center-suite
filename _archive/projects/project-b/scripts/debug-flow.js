const { chromium } = require('playwright');

const username = process.env.MC_USERNAME;
const password = process.env.MC_PASSWORD;
const merchant = process.env.MC_MERCHANT || 'Menusifu SCH Restaurant';
if (!username || !password) throw new Error('MC_USERNAME and MC_PASSWORD are required');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('https://cc-fe.balamxqa.com/pp/brandpictrue', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  if (page.url().includes('auth.menusifucloudqa.com')) {
    await page.locator('input[type=email]').fill(username);
    await page.locator('input[type=password]').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/cc-fe\.balamxqa\.com/, { timeout: 60000 });
    await page.waitForTimeout(5000);
  }

  console.log('After login URL:', page.url());
  const hasMerchant = await page.getByText('选择商户').isVisible().catch(() => false);
  console.log('Merchant dialog:', hasMerchant);

  if (hasMerchant) {
    await page.getByText(merchant, { exact: false }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /确\s*定/ }).click();
    await page.waitForTimeout(5000);
  }

  console.log('Final URL:', page.url());

  await page.waitForFunction(
    () => document.body.innerText.includes('选择商户') || document.querySelectorAll('button').length > 1,
    { timeout: 60000 }
  ).catch(() => console.log('Timed out waiting for app content'));

  await page.waitForTimeout(3000);

  const hasMerchant2 = await page.getByText('选择商户').isVisible().catch(() => false);
  console.log('Merchant dialog after wait:', hasMerchant2);
  if (hasMerchant2) {
    await page.getByText(merchant, { exact: false }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /确\s*定/ }).click();
    await page.waitForTimeout(8000);
  }
  const btns = await page.locator('button').allTextContents();
  console.log('Buttons:', btns.filter((t) => t.trim()).slice(0, 30));
  const headings = await page.locator('h1, h2, h3').allTextContents();
  console.log('Headings:', headings.filter((t) => t.trim()).slice(0, 20));
  await page.screenshot({ path: 'output/brand-page.png', fullPage: true });
  await browser.close();
})();
