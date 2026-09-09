const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output', 'product-management');

const MENU = [
  { id: 'item', menuLabel: 'Item', path: '/pp/brand/list', pageName: '商品' },
  { id: 'language-management', menuLabel: 'Language Management', path: '/pp/language-manage', pageName: '多语言管理' },
  { id: 'category', menuLabel: 'Category', path: '/pp/brand/category', pageName: '分类' },
  { id: 'specifications', menuLabel: 'Specifications', path: '/pp/brand/spec', pageName: '规格组' },
  { id: 'sort-order', menuLabel: 'Sort order', path: '/pp/brand/modify-sort', pageName: '排序规则' },
  { id: 'flavors', menuLabel: 'Flavors', path: '/pp/brand/taste', pageName: '口味组' },
  { id: 'preparations', menuLabel: 'Preparations', path: '/pp/brand/method', pageName: '做法组' },
  { id: 'add-ons', menuLabel: 'Add-Ons', path: '/pp/brand/additional', pageName: '加料组' },
  { id: 'combos', menuLabel: 'Combos', path: '/pp/brand/combo', pageName: '套餐组' },
];

function parseLogin() {
  const text = fs.readFileSync(path.join(__dirname, '..', '登录信息.txt'), 'utf8');
  return {
    username: text.match(/账号[:：]\s*(\S+)/)?.[1],
    password: text.match(/密码[:：]\s*(\S+)/)?.[1],
    merchant: text.match(/选择商户[:：]\s*(.+?)后/)?.[1]?.trim(),
  };
}

async function login(page, auth) {
  await page.goto('https://cc-fe.balamxqa.com/pp/brand/list', { waitUntil: 'domcontentloaded', timeout: 60000 });

  if (page.url().includes('auth.menusifucloudqa.com')) {
    await page.locator('input[type=email]').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('input[type=email]').fill(auth.username);
    await page.locator('input[type=password]').fill(auth.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/cc-fe\.balamxqa\.com/, { timeout: 60000 });
  }

  await page.waitForFunction(
    () => document.body.innerText.includes('选择商户') || document.querySelectorAll('button').length > 1,
    { timeout: 60000 },
  );

  if (await page.getByText('选择商户').isVisible().catch(() => false)) {
    await page.getByText(auth.merchant, { exact: false }).click();
    await page.getByRole('button', { name: /确\s*定/ }).click();
  }

  await page.waitForFunction(
    () => document.querySelectorAll('.ant-menu-item, .ant-menu-submenu').length > 3,
    { timeout: 60000 },
  );
}

async function extractFeatures(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const textOf = (el) => (el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ');

    return {
      title: document.title,
      url: location.href,
      pathname: location.pathname,
      headings: [...document.querySelectorAll('h1,h2,h3,h4,.ant-page-header-heading-title')].filter(visible).map(textOf).filter(Boolean),
      buttons: [...document.querySelectorAll('button,.ant-btn')].filter(visible).map((el) => ({
        text: textOf(el),
        disabled: el.disabled,
        testId: el.getAttribute('data-testid') || '',
      })).filter((b) => b.text && b.text.length < 40),
      inputs: [...document.querySelectorAll('input,textarea,select')].filter(visible).map((el) => ({
        type: el.type || el.tagName.toLowerCase(),
        placeholder: el.placeholder || '',
        label: el.getAttribute('aria-label') || el.name || el.id || '',
      })),
      tableHeaders: [...document.querySelectorAll('table th,.ant-table-thead th')].filter(visible).map(textOf).filter(Boolean),
      tableRowCount: document.querySelectorAll('tbody tr,.ant-table-tbody tr').length,
      tabs: [...document.querySelectorAll('[role=tab],.ant-tabs-tab')].filter(visible).map(textOf).filter(Boolean),
      links: [...document.querySelectorAll('main a[href]')].filter(visible).map((el) => ({ text: textOf(el), href: el.getAttribute('href') })).filter((l) => l.text).slice(0, 20),
      bodySnippet: document.body.innerText.slice(0, 2500),
    };
  });
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const auth = parseLogin();
  const storagePath = path.join(__dirname, '..', 'output', 'auth-state.json');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(fs.existsSync(storagePath) ? { storageState: storagePath } : {}),
  });
  const page = await context.newPage();

  await login(page, auth);

  const results = [];
  for (const item of MENU) {
    console.log(`探索: ${item.pageName} (${item.path})`);
    await page.goto(`https://cc-fe.balamxqa.com${item.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForFunction(
      () => document.querySelectorAll('button,.ant-btn,input').length > 0 || document.body.innerText.length > 100,
      { timeout: 30000 },
    ).catch(() => {});
    const features = await extractFeatures(page);
    const dedupedButtons = [...new Map(features.buttons.map((b) => [b.text, b])).values()];
    const payload = { ...item, features: { ...features, buttons: dedupedButtons } };
    results.push(payload);
    fs.writeFileSync(path.join(OUTPUT_DIR, `${item.id}.json`), JSON.stringify(payload, null, 2));
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${item.id}.png`), fullPage: true });
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'all-pages.json'), JSON.stringify(results, null, 2));
  console.log(`完成，共 ${results.length} 页，输出目录: ${OUTPUT_DIR}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
