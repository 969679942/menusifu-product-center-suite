const { chromium } = require('playwright');
const paths = [
  ['/pp/brand/list', 'item'],
  ['/pp/language-manage', 'lang'],
  ['/pp/brand/category', 'cat'],
  ['/pp/brand/spec', 'spec'],
  ['/pp/brand/modify-sort', 'sort'],
  ['/pp/brand/taste', 'taste'],
  ['/pp/brand/method', 'method'],
  ['/pp/brand/additional', 'addon'],
  ['/pp/brand/combo', 'combo'],
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: 'output/auth-state.json', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  for (const [path, id] of paths) {
    await page.goto('https://cc-fe.balamxqa.com' + path, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    const data = await page.evaluate(() => ({
      title: document.title,
      placeholders: [...document.querySelectorAll('input[placeholder]')].map((i) => i.placeholder).filter(Boolean),
      buttons: [...new Set([...document.querySelectorAll('button')].map((b) => (b.innerText || '').trim()).filter((t) => t && t.length < 40))],
      headings: [...document.querySelectorAll('h1,h2,h3')].map((h) => h.innerText.trim()).filter(Boolean),
      th: [...document.querySelectorAll('th')].map((h) => h.innerText.trim().split('\n')[0]).filter(Boolean).slice(0, 6),
    }));
    console.log(JSON.stringify({ id, path, ...data }));
  }
  await browser.close();
})();
