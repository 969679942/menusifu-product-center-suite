const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'output', 'product-management', 'item-deep');
const LIST_URL = 'https://cc-fe.balamxqa.com/pp/brand/list';

async function save(page, name, extra = {}) {
  const data = await page.evaluate(() => {
    const textOf = (el) => (el.innerText || el.textContent || '').trim();
    return {
      url: location.href,
      title: document.title,
      headings: [...document.querySelectorAll('h1,h2,h3,h4,.ant-modal-title')].map(textOf).filter(Boolean),
      buttons: [...new Set([...document.querySelectorAll('button,a')].map((el) => textOf(el)).filter((t) => t && t.length < 40))].slice(0, 40),
      menuItems: [...document.querySelectorAll('.ant-dropdown-menu-item')].map((el) => textOf(el)).filter(Boolean),
      tableRows: document.querySelectorAll('tbody tr').length,
      bodySnippet: document.body.innerText.slice(0, 2500),
    };
  });
  fs.writeFileSync(path.join(OUTPUT, `${name}.json`), JSON.stringify({ ...data, ...extra }, null, 2));
}

(async () => {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: path.join(__dirname, '..', 'output', 'auth-state.json'),
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  // 新增商品 -> 选择商品类型
  await page.getByRole('button', { name: /Add Item|新增商品/ }).click();
  await page.waitForURL(/brand\/create/, { timeout: 30000 });
  await save(page, '02-create-type-select');
  await page.screenshot({ path: path.join(OUTPUT, '02-create-type-select.png'), fullPage: true });

  const types = [
    { key: 'standard', text: /标准商品|Standard Product/ },
    { key: 'combo', text: /套餐商品|Combo Product/ },
    { key: 'addon', text: /加料|配菜|Add-on|Topping/i },
  ];

  for (const type of types) {
    await page.goto(LIST_URL.replace('/list', '/create'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    const card = page.locator('.ant-card, [class*="card"]').filter({ hasText: type.text }).first();
    const createLink = card.getByText(/去创建|Go to create|Create/i).first();
    if (await createLink.isVisible().catch(() => false)) {
      await createLink.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(2000);
      await save(page, `03-create-form-${type.key}`);
      await page.screenshot({ path: path.join(OUTPUT, `03-create-form-${type.key}.png`), fullPage: true });
    }
  }

  // 回到列表
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  // 搜索
  await page.getByPlaceholder(/Item Name|商品名称/).fill('Pearl');
  await page.waitForTimeout(2000);
  await save(page, '04-search-pearl');

  // 操作下拉
  await page.getByPlaceholder(/Item Name|商品名称/).fill('');
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /^Action$|^操作$/ }).click();
  await page.waitForTimeout(1000);
  await save(page, '05-action-menu');
  await page.keyboard.press('Escape');

  // 行内操作
  await page.locator('tbody tr').first().locator('button').last().click();
  await page.waitForTimeout(1000);
  await save(page, '06-row-action-menu');
  await page.keyboard.press('Escape');

  // 批量选择
  await page.locator('tbody .ant-checkbox-input').first().click();
  await page.waitForTimeout(800);
  await save(page, '07-batch-selected');

  // 导入记录
  await page.locator('tbody .ant-checkbox-input').first().click();
  await page.getByRole('button', { name: /Import Record|导入记录/ }).click();
  await page.waitForTimeout(2500);
  await save(page, '08-import-records');
  await page.screenshot({ path: path.join(OUTPUT, '08-import-records.png'), fullPage: true });

  console.log('Done');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
