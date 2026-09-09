const { chromium } = require('playwright');
const fs = require('fs');

const text = fs.readFileSync('登录信息.txt', 'utf8');
const auth = {
  username: text.match(/账号[:：]\s*(\S+)/)[1],
  password: text.match(/密码[:：]\s*(\S+)/)[1],
  merchant: text.match(/选择商户[:：]\s*(.+?)后/)[1].trim(),
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('https://cc-fe.balamxqa.com/pp/brand/list', { waitUntil: 'domcontentloaded' });

  if (page.url().includes('auth.')) {
    await page.locator('input[type=email]').fill(auth.username);
    await page.locator('input[type=password]').fill(auth.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/cc-fe/, { timeout: 60000 });
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
    () => document.querySelector('.ant-menu-submenu') || document.querySelector('a[href="/pp/brand/list"]'),
    { timeout: 60000 },
  );

  const data = await page.evaluate(() => ({
    title: document.title,
    placeholders: [...document.querySelectorAll('input[placeholder]')].map((i) => i.placeholder),
    buttons: [...new Set([...document.querySelectorAll('button')].map((b) => (b.innerText || '').trim()).filter((t) => t && t.length < 40))],
    submenuTitles: [...document.querySelectorAll('.ant-menu-submenu-title')].map((e) => e.innerText.trim()),
    menuLinks: [...document.querySelectorAll('a[href^="/pp/"]')].map((a) => ({ href: a.getAttribute('href'), text: a.innerText.trim() })).slice(0, 15),
  }));

  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})();
