import { expect, test } from '@playwright/test';
import { SidebarPage } from '../../pages/sidebar.page';

test.describe('商户中心语言状态安全识别合同', () => {
  test('html lang 已明确为中文时不依赖语言按钮', async ({ page }) => {
    await page.setContent('<html lang="zh-CN"><body><main>商品中心</main></body></html>');

    const sidebar = new SidebarPage(page);

    await expect(sidebar.isChineseAutomationLocale()).resolves.toBe(true);
    await expect(sidebar.openLanguageMenu()).resolves.toBeUndefined();
  });

  test('无 lang 和侧栏标识时只接受明确中文操作控件', async ({ page }) => {
    await page.setContent('<html><body><main><button>保存</button></main></body></html>');

    const sidebar = new SidebarPage(page);

    await expect(sidebar.isChineseAutomationLocale()).resolves.toBe(true);
    await expect(sidebar.openLanguageMenu()).resolves.toBeUndefined();
  });

  test('可见英文侧栏必须覆盖失真的中文 html lang', async ({ page }) => {
    await page.setContent(`
      <html lang="zh-CN"><body><a href="/pp/brand/list">Item</a></body></html>
    `);

    const sidebar = new SidebarPage(page);

    await expect(sidebar.isEnglishAutomationLocale()).resolves.toBe(true);
    await expect(sidebar.isChineseAutomationLocale()).resolves.toBe(false);
  });

  test('可见中文侧栏必须覆盖失真的英文 html lang', async ({ page }) => {
    await page.setContent(`
      <html lang="en-US"><body><a href="/pp/brand/list">商品</a></body></html>
    `);

    const sidebar = new SidebarPage(page);

    await expect(sidebar.isChineseAutomationLocale()).resolves.toBe(true);
    await expect(sidebar.isEnglishAutomationLocale()).resolves.toBe(false);
  });

  test('语言状态未知且控件不存在时返回可分类诊断而不是 locator 超时', async ({ page }) => {
    await page.setContent('<html><body><main>Product center</main></body></html>');

    const sidebar = new SidebarPage(page);

    await expect(sidebar.openLanguageMenu()).rejects.toThrow(/LOCALE_CONTROL_UNAVAILABLE/);
  });

  test('英文界面存在语言控件时打开菜单', async ({ page }) => {
    await page.setContent(`
      <html lang="en-US">
        <body>
          <button aria-label="translation" onclick="this.dataset.opened='true'">Language</button>
        </body>
      </html>
    `);

    const sidebar = new SidebarPage(page);
    await sidebar.openLanguageMenu();

    await expect(page.getByRole('button', { name: 'translation' })).toHaveAttribute('data-opened', 'true');
  });

  test('切换中文必须等待可见中文侧栏替换英文侧栏', async ({ page }) => {
    await page.setContent(`
      <html lang="zh-CN">
        <body>
          <a id="item-entry" href="/pp/brand/list">Item</a>
          <button aria-label="translation" onclick="document.getElementById('language-menu').hidden=false">Language</button>
          <div id="language-menu" role="menuitem" hidden
            onclick="document.getElementById('item-entry').textContent='商品'">简体中文</div>
        </body>
      </html>
    `);

    const sidebar = new SidebarPage(page);
    await sidebar.openLanguageMenu();
    await sidebar.selectChineseLanguage();

    await expect(page.locator('a[href="/pp/brand/list"]')).toHaveText('商品');
  });

  test('业务字段样式不得冒充语言切换按钮', async ({ page }) => {
    await page.setContent(`
      <html><body><a href="/pp/brand/list">Item</a><div class="alternative-language">Alt.Language</div></body></html>
    `);

    const sidebar = new SidebarPage(page);

    await expect(sidebar.openLanguageMenu()).rejects.toThrow(/LOCALE_CONTROL_UNAVAILABLE/);
  });
});
