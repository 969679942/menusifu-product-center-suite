import type { Locator, Page } from '@playwright/test';
import { step } from '../utils/step';
import { waitUntil } from '../utils/wait';
import { PRODUCT_MANAGEMENT_ENTRY_PATH } from '../test-data/product-management';

export class SidebarPage {
  readonly productEntryLink: Locator;
  readonly languageButton: Locator;
  readonly englishItemListMarker: Locator;
  readonly chineseLocaleMarker: Locator;

  constructor(private readonly page: Page) {
    this.productEntryLink = page.locator(`a[href="${PRODUCT_MANAGEMENT_ENTRY_PATH}"]`);
    // The shell renders the locale control differently across deployments:
    // some expose the icon's accessible name as `translation`, others expose
    // an aria-label/title or only the icon data attribute. Keep one semantic
    // locator that covers those observed variants instead of making locale
    // validation depend on a single Ant icon implementation.
    this.languageButton = page.locator([
      'button[aria-label="translation"]',
      'button[aria-label="Translation"]',
      'button[title="translation"]',
      'button[title="Translation"]',
      '[role="button"][aria-label="translation"]',
      '[role="button"][aria-label="Translation"]',
      'button:has(svg[data-icon="translation"])',
      '[role="button"]:has(svg[data-icon="translation"])',
      'button:has(.anticon-translation)',
      '[role="button"]:has(.anticon-translation)',
      '[data-icon="translation"]',
      '[aria-label*="language" i]',
      '[aria-label*="语言"]',
      '[title*="language" i]',
      '[title*="语言"]',
      '[data-testid*="language" i]',
    ].join(',')).first();
    this.englishItemListMarker = page.locator('a[href="/pp/brand/list"]')
      .filter({ hasText: /^Item$/ });
    this.chineseLocaleMarker = page.locator('a[href="/pp/brand/list"]')
      .filter({ hasText: /^商品$/ });
  }

  @step('判断商户中心是否已使用自动化英文界面')
  async isEnglishAutomationLocale(): Promise<boolean> {
    if (await this.englishItemListMarker.isVisible().catch(() => false)) return true;
    if (await this.chineseLocaleMarker.isVisible().catch(() => false)) return false;
    const documentLanguage = await this.readDocumentLanguage();
    if (documentLanguage === 'en-US') return true;
    if (documentLanguage === 'zh-CN') return false;
    return false;
  }

  @step('判断商户中心是否已使用自动化中文界面')
  async isChineseAutomationLocale(): Promise<boolean> {
    if (await this.chineseLocaleMarker.isVisible().catch(() => false)) return true;
    if (await this.englishItemListMarker.isVisible().catch(() => false)) return false;
    const documentLanguage = await this.readDocumentLanguage();
    if (documentLanguage === 'zh-CN') return true;
    if (documentLanguage === 'en-US') return false;
    // Some deployments render the product route without the sidebar marker or
    // an explicit html lang. Only accept visible exact UI controls as locale
    // evidence; arbitrary Chinese product data must not be mistaken for shell
    // language state.
    return this.page.getByRole('button', { name: /^(新增|添加|保存|确定|取消)$/ }).first()
      .isVisible().catch(() => false);
  }

  @step('打开商户中心语言菜单')
  async openLanguageMenu(): Promise<void> {
    let languageButton = this.languageButton;
    if (!(await languageButton.isVisible().catch(() => false))) {
      // A few deployments expose only an accessible role/name and no stable
      // icon attribute. Resolve that variant explicitly instead of composing
      // a locator fallback, which also keeps the architecture contract clear.
      languageButton = this.page.getByRole('button', { name: /translation/i }).first();
    }
    if (!(await languageButton.isVisible().catch(() => false))) {
      if (await this.isChineseAutomationLocale()) return;
      const documentLanguage = await this.readDocumentLanguage();
      throw new Error(
        `[LOCALE_CONTROL_UNAVAILABLE] 无法确认中文界面且语言控件不可用：htmlLang=${documentLanguage}; url=${this.page.url()}`,
      );
    }
    await languageButton.click({ force: true });
  }

  @step('切换商户中心为英文界面')
  async selectEnglishLanguage(): Promise<void> {
    await this.selectLanguageMenuItem('English');
  }

  @step('切换商户中心为中文界面')
  async selectChineseLanguage(): Promise<void> {
    if (await this.isChineseAutomationLocale()) return;
    await this.selectLanguageMenuItem('简体中文');
    await this.expectStableChineseShellLocale(15_000).catch(async () => {
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.expectStableChineseShellLocale(30_000);
    });
  }

  private async readDocumentLanguage(): Promise<'zh-CN' | 'en-US' | 'unknown'> {
    const language = (await this.page.locator('html').getAttribute('lang').catch(() => null))
      ?.trim()
      .toLowerCase();
    if (language?.startsWith('zh')) return 'zh-CN';
    if (language?.startsWith('en')) return 'en-US';
    return 'unknown';
  }

  private async expectStableChineseShellLocale(timeout: number): Promise<void> {
    await waitUntil(
      async () => ({
        chineseVisible: await this.chineseLocaleMarker.isVisible().catch(() => false),
        englishVisible: await this.englishItemListMarker.isVisible().catch(() => false),
      }),
      (state) => state.chineseVisible && !state.englishVisible,
      { timeout, interval: 100, message: '切换中文后侧栏未稳定显示中文商品入口。' },
    );
  }

  private async selectLanguageMenuItem(label: string): Promise<void> {
    await waitUntil(
      () => this.page.evaluate((targetLabel) => {
        const target = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
          .find((candidate) => candidate.innerText.includes(targetLabel));
        if (!target) return false;
        target.click();
        return true;
      }, label),
      (clicked) => clicked,
      { timeout: 15_000, interval: 100, message: `语言菜单项 ${label} 未出现。` },
    );
  }

  @step('等待商户中心中文界面就绪')
  async expectChineseAutomationLocale(): Promise<void> {
    await waitUntil(
      () => this.isChineseAutomationLocale(),
      (ready) => ready,
      { timeout: 30_000, interval: 100, message: `中文界面未就绪：url=${this.page.url()}` },
    );
  }

  @step('等待商户中心英文界面就绪')
  async expectEnglishAutomationLocale(): Promise<void> {
    await this.englishItemListMarker.waitFor({ state: 'visible', timeout: 30_000 });
  }

  @step('展开包含目标路径的侧边栏子菜单：{path}')
  async expandSubMenuForPath(path: string, submenuTitles?: readonly string[]): Promise<void> {
    const targetLink = this.page.locator(`a[href="${path}"]`);
    if (await targetLink.isVisible().catch(() => false)) {
      return;
    }

    const titleCandidates = submenuTitles?.length
      ? submenuTitles.map((title) => this.page.locator('.ant-menu-submenu-title:visible').filter({ hasText: title }))
      : [this.page.locator('.ant-menu-submenu-title:visible')];
    for (const candidateGroup of titleCandidates) {
      const titleCount = await candidateGroup.count();
      for (let index = 0; index < titleCount; index += 1) {
        const title = candidateGroup.nth(index);
        await title.click();
        const found = await waitUntil(
          async () => ({
            count: await targetLink.count(),
            visible: await targetLink.isVisible().catch(() => false),
          }),
          (state) => state.count === 1 && state.visible,
          {
            timeout: 2_000,
            interval: 100,
            message: `目标路径 ${path} 在当前侧边栏分组中尚未显示。`,
          },
        ).catch(() => undefined);
        if (found) return;
      }
    }

    throw new Error(`目标路径 ${path} 未在任何侧边栏分组中显示。`);
  }

  @step('通过侧边栏候选链接进入目标模块')
  async openSubMenuByCandidates(paths: readonly string[], submenuTitles?: readonly string[]): Promise<string> {
    const candidates = [...new Set(paths)];
    const errors: string[] = [];
    for (const path of candidates) {
      try {
        await this.expandSubMenuForPath(path, submenuTitles);
        await this.page.locator(`a[href="${path}"]`).click();
        return path;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    throw new Error(`侧边栏候选路径全部失败：${candidates.join(', ')}；${errors.join(' | ')}`);
  }

  @step('通过精确侧边栏标题路径进入目标模块')
  async openNestedSubMenuByCandidates(
    paths: readonly string[],
    submenuTitlePath: readonly string[],
  ): Promise<string> {
    const candidates = [...new Set(paths)];
    const errors: string[] = [];
    for (const path of candidates) {
      try {
        await this.expandNestedSubMenuForPath(path, submenuTitlePath);
        await this.page.locator(`a[href="${path}"]`).click();
        return path;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    throw new Error(`侧边栏嵌套路径全部失败：${candidates.join(', ')}；${errors.join(' | ')}`);
  }

  @step('按精确标题路径展开侧边栏到：{path}')
  private async expandNestedSubMenuForPath(
    path: string,
    submenuTitlePath: readonly string[],
  ): Promise<void> {
    const targetLink = this.page.locator(`a[href="${path}"]`);
    for (const titleText of submenuTitlePath) {
      if (await targetLink.isVisible().catch(() => false)) return;
      const title = this.page.locator('.ant-menu-submenu-title:visible').filter({ hasText: titleText });
      await waitUntil(
        async () => ({
          count: await title.count(),
          visible: await title.isVisible().catch(() => false),
          enabled: await title.isEnabled().catch(() => false),
        }),
        (state) => state.count === 1 && state.visible && state.enabled,
        { timeout: 30_000, interval: 100, message: `侧边栏层级 ${titleText} 不可唯一操作。` },
      );
      await title.click();
    }
    await waitUntil(
      async () => ({
        count: await targetLink.count(),
        visible: await targetLink.isVisible().catch(() => false),
      }),
      (state) => state.count === 1 && state.visible,
      { timeout: 30_000, interval: 100, message: `目标路径 ${path} 未在精确侧边栏层级中显示。` },
    );
  }

  @step('通过侧边栏链接进入：{path}')
  async openSubMenuByPath(path: string): Promise<void> {
    await this.expandSubMenuForPath(path);
    await this.page.locator(`a[href="${path}"]`).click();
  }

  @step('等待商品管理入口链接可见')
  async expectProductManagementVisible(): Promise<void> {
    await waitUntil(
      async () => this.productEntryLink.isVisible().catch(() => false),
      (visible) => visible === true,
      {
        timeout: 60_000,
        message: '商品管理入口链接未在超时内可见。',
      },
    );
  }
}

export function createSidebarPage(page: Page): SidebarPage {
  return new SidebarPage(page);
}

export class MerchantShellPage {
  constructor(protected readonly page: Page) {}

  @step('等待页面路径为：{expectedPath}')
  async expectPathname(expectedPath: string): Promise<void> {
    await waitUntil(
      () => new URL(this.page.url()).pathname,
      (pathname) => pathname === expectedPath,
      {
        timeout: 60_000,
        message: `页面路径未切换到 ${expectedPath}。`,
      },
    );
  }
}
