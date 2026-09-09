import type { Locator, Page } from '@playwright/test';
import { settleInput } from '../utils/input-settle';
import { waitUntil } from '../utils/wait';
import { step } from '../utils/step';

export const merchantSelectionDomContract = {
  name: /Selected Merchant|选择商户/,
  confirm: { name: /^(Confirm|确\s*定)$/ },
} as const;

export class AuthLoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;

  constructor(private readonly page: Page) {
    this.emailInput = page.locator('input[type="email"]');
    this.passwordInput = page.getByRole('textbox', { name: 'Password' });
    this.signInButton = page.getByRole('button', { name: /sign in/i });
  }

  @step('判断 OAuth 登录页是否可见')
  async isVisible(timeout = 1_000): Promise<boolean> {
    return this.emailInput.isVisible({ timeout }).catch(() => false);
  }

  @step('等待 OAuth 登录页加载')
  async expectLoaded(): Promise<void> {
    await waitUntil(
      async () => this.page.url(),
      (url) => url.includes('auth.menusifucloudqa.com'),
      {
        timeout: 15_000,
        interval: 100,
        probeTimeout: 2_000,
        message: 'OAuth 登录页 URL 未在超时内出现。',
      },
    );
    await this.passwordInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.emailInput.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('填写账号密码并登录')
  async signIn(username: string, password: string): Promise<void> {
    await this.emailInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.passwordInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.emailInput.fill(username, { timeout: 10_000 });
    await this.passwordInput.fill(password, { timeout: 10_000 });
    await settleInput();
    await this.signInButton.click({ timeout: 10_000 });
  }
}

export class MerchantSelectionPage {
  readonly dialog: Locator;
  readonly dialogHeading: Locator;
  readonly confirmButton: Locator;
  private readonly localizedDialogHeading: Locator;
  private readonly localizedConfirmButton: Locator;
  private readonly currentMerchantButton: Locator;

  constructor(private readonly page: Page) {
    this.dialog = page.getByRole('dialog');
    this.dialogHeading = page.getByRole('heading', { name: 'Selected Merchant', exact: true });
    this.confirmButton = page.getByRole('button', { name: 'Confirm', exact: true });
    this.localizedDialogHeading = page.getByRole('heading', merchantSelectionDomContract);
    this.localizedConfirmButton = page.getByRole('button', merchantSelectionDomContract.confirm);
    this.currentMerchantButton = page.getByRole('button', { name: /Menusifu/i });
  }

  @step('判断当前商户是否为：{merchantName}')
  async isCurrentMerchant(merchantName: string): Promise<boolean> {
    const count = await this.currentMerchantButton.count().catch(() => 0);
    if (count !== 1) return false;
    const visible = await this.currentMerchantButton.isVisible({ timeout: 1_000 }).catch(() => false);
    return visible && (await this.currentMerchantButton.innerText()).trim().includes(merchantName);
  }

  @step('判断页面是否显示当前商户：{merchantName}')
  async isMerchantTextVisible(merchantName: string): Promise<boolean> {
    return (await this.page.locator('body').innerText().catch(() => '')).includes(merchantName);
  }

  @step('打开商户选择弹窗')
  async openMerchantSelection(): Promise<void> {
    await waitUntil(
      () => this.currentMerchantButton.count(),
      (count) => count === 1,
      { timeout: 15_000, interval: 100, message: '当前商户切换按钮定位不唯一。' },
    );
    await this.currentMerchantButton.click();
    await this.localizedDialogHeading.waitFor({ state: 'visible', timeout: 15_000 });
  }

  @step('判断商户选择弹窗是否可见')
  async isVisible(timeout = 8_000): Promise<boolean> {
    return this.dialogHeading.isVisible({ timeout }).then(async (visible) => (
      visible || this.localizedDialogHeading.isVisible({ timeout }).catch(() => false)
    )).catch(() => false);
  }

  @step('选择商户：{merchantName}，品牌编号：{brandId}')
  async selectMerchant(merchantName: string, brandId: string): Promise<void> {
    const merchantNameLocator = this.dialog.getByText(merchantName, { exact: true });
    const merchantBrandIdLocator = this.dialog.getByText(new RegExp(`^Brand ID:\\s*${escapeRegex(brandId)}$`));
    const result = await waitUntil(
      async () => {
        const [merchantNameVisible, merchantBrandIdVisible] = await Promise.all([
          merchantNameLocator.isVisible().catch(() => false),
          merchantBrandIdLocator.isVisible().catch(() => false),
        ]);
        if (merchantNameVisible && merchantBrandIdVisible) return 'found' as const;
        const scroll = await this.scrollMerchantList();
        return scroll.atEnd && !scroll.moved ? 'exhausted' as const : 'searching' as const;
      },
      (state) => state !== 'searching',
      { timeout: 15_000, interval: 100, probeTimeout: 2_000, message: '未在虚拟商户列表中定位目标商户。' },
    );
    if (result === 'exhausted') throw new Error('商户列表滚动到底仍未找到目标商户');
    const [merchantNameCount, merchantBrandIdCount] = await Promise.all([
      merchantNameLocator.count(),
      merchantBrandIdLocator.count(),
    ]);
    if (merchantNameCount !== 1 || merchantBrandIdCount !== 1) {
      throw new Error(`目标商户定位不唯一：name=${merchantNameCount};brandId=${merchantBrandIdCount}`);
    }
    await this.clickMerchantBrandIdentity(merchantNameLocator, merchantBrandIdLocator);
  }

  @step('点击已唯一确认的商户品牌身份')
  private async clickMerchantBrandIdentity(
    merchantNameLocator: Locator,
    merchantBrandIdLocator: Locator,
  ): Promise<void> {
    try {
      await merchantBrandIdLocator.click({ timeout: 2_000 });
    } catch {
      const [merchantNameCount, merchantBrandIdCount, merchantNameVisible, merchantBrandIdVisible] = await Promise.all([
        merchantNameLocator.count(),
        merchantBrandIdLocator.count(),
        merchantNameLocator.isVisible().catch(() => false),
        merchantBrandIdLocator.isVisible().catch(() => false),
      ]);
      if (
        merchantNameCount !== 1
        || merchantBrandIdCount !== 1
        || !merchantNameVisible
        || !merchantBrandIdVisible
      ) {
        throw new Error('受控点击前目标商户身份已漂移');
      }
      await merchantBrandIdLocator.click({ force: true });
    }
  }

  @step('滚动商户选择列表查找目标')
  private async scrollMerchantList(): Promise<{ moved: boolean; atEnd: boolean }> {
    return this.dialog.evaluate((dialog) => {
      const scrollable = Array.from(dialog.querySelectorAll<HTMLElement>('*')).filter((element) => {
        const overflowY = window.getComputedStyle(element).overflowY;
        return /auto|scroll/.test(overflowY) && element.scrollHeight > element.clientHeight;
      });
      if (scrollable.length === 0) return { moved: false, atEnd: true };
      const viewport = scrollable.sort((left, right) => (
        right.scrollHeight - right.clientHeight - (left.scrollHeight - left.clientHeight)
      ))[0];
      const previousTop = viewport.scrollTop;
      viewport.scrollTop = Math.min(
        viewport.scrollHeight - viewport.clientHeight,
        previousTop + Math.max(1, Math.floor(viewport.clientHeight * 0.8)),
      );
      viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
      return {
        moved: viewport.scrollTop > previousTop,
        atEnd: viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 1,
      };
    });
  }

  @step('确认商户选择')
  async confirm(): Promise<void> {
    const button = await this.confirmButton.isVisible({ timeout: 500 }).catch(() => false)
      ? this.confirmButton
      : this.localizedConfirmButton;
    await button.click({ timeout: 10_000 });
    await this.localizedDialogHeading.waitFor({ state: 'hidden', timeout: 15_000 });
  }

  @step('等待应用主界面就绪')
  async waitForAppReady(): Promise<void> {
    await waitUntil(
      async () => ({
        url: this.page.url(),
        productLinkVisible: await this.page.locator('a[href="/pp/brand/list"]').isVisible({ timeout: 500 }).catch(() => false),
        merchantVisible: await this.dialogHeading.isVisible({ timeout: 500 }).catch(() => false),
      }),
      (state) => state.productLinkVisible && !state.merchantVisible && state.url !== 'about:blank',
      {
        timeout: 30_000,
        interval: 100,
        probeTimeout: 2_000,
        message: '应用主界面未在超时内就绪。',
      },
    );
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
