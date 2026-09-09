import type { Locator, Page } from '@playwright/test';
import { step } from '../utils/step';
import { waitUntil } from '../utils/wait';

const brandPictureDom = {
  searchPlaceholder: 'Image Name',
  addButton: /Add$/,
  channelHeading: 'Channel',
} as const;

export class BrandPicturePage {
  readonly main: Locator;
  readonly searchInput: Locator;
  readonly addButton: Locator;
  readonly channelHeading: Locator;
  readonly loading: Locator;
  private readonly imageCards: Locator;
  private readonly emptyState: Locator;
  private readonly previewRoot: Locator;
  private readonly previewHeading: Locator;
  private readonly previewCloseButton: Locator;

  constructor(private readonly page: Page) {
    this.main = page.locator('main:visible');
    this.searchInput = page.getByPlaceholder(brandPictureDom.searchPlaceholder);
    this.addButton = page.getByRole('button', { name: brandPictureDom.addButton });
    this.channelHeading = page.getByRole('heading', { name: brandPictureDom.channelHeading, level: 1 });
    this.loading = page.locator('.ant-spin-spinning:visible');
    this.imageCards = this.main.locator('div[class^="imageCard___"]');
    this.emptyState = this.main.getByText('No images found', { exact: true });
    this.previewRoot = page.locator('[role="dialog"]:visible');
    this.previewHeading = this.previewRoot.getByRole('heading', { level: 5 });
    this.previewCloseButton = this.previewRoot.getByRole('button', { name: 'close', exact: true });
  }

  @step('打开图片管理页面')
  async open(path = '/pp/brandpictrue'): Promise<void> {
    const listResponse = this.page.waitForResponse((candidate) => (
      candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname.endsWith('/ops-brand/brand-images/list')
      && candidate.ok()
    ), { timeout: 60_000 });
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
    await listResponse;
    await this.expectLoaded();
  }

  @step('等待图片管理页面加载完成')
  async expectLoaded(): Promise<void> {
    await waitUntil(
      () => new URL(this.page.url()).pathname,
      (pathname) => pathname.includes('brandpictrue'),
      {
        timeout: 60_000,
        message: '图片管理页面 URL 未在超时内加载完成。',
      },
    );
    await this.channelHeading.waitFor({ state: 'visible', timeout: 30_000 });
    await this.addButton.waitFor({ state: 'visible', timeout: 30_000 });
  }

  @step('按图片名称搜索：{keyword}')
  async searchByName(keyword: string): Promise<void> {
    const response = this.page.waitForResponse((candidate) => (
      candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname.endsWith('/ops-brand/brand-images/list')
      && candidate.ok()
    ), { timeout: 60_000 });
    await this.searchInput.fill(keyword);
    await response;
    await waitUntil(() => this.loading.count(), (count) => count === 0, {
      timeout: 30_000,
      message: `图片名称搜索未完成：${keyword}`,
    });
  }

  @step('读取当前图片卡片名称')
  async readVisibleImageNames(options: { allowEmpty?: boolean } = {}): Promise<string[]> {
    await waitUntil(
      async () => ({ cards: await this.imageCards.count(), empty: await this.emptyState.isVisible().catch(() => false) }),
      (state) => state.cards > 0 || (options.allowEmpty === true && state.empty),
      {
      timeout: 60_000,
        message: '图片管理页未加载出图片卡片或空结果状态',
      },
    );
    const names = await this.imageCards.locator('div[aria-describedby]').allInnerTexts();
    return names.map((name) => name.trim()).filter(Boolean);
  }

  @step('读取当前可预览图片名称')
  async readPreviewableImageNames(): Promise<string[]> {
    await waitUntil(() => this.imageCards.count(), (count) => count > 0, {
      timeout: 60_000,
      message: '图片管理页未加载出任何图片卡片',
    });
    const names = await this.main.locator('img[alt]').all();
    const previewableNames: string[] = [];
    for (const image of names) {
      const name = (await image.getAttribute('alt'))?.trim();
      if (name) previewableNames.push(name);
    }
    return [...new Set(previewableNames)];
  }

  @step('打开图片大图预览：{name}')
  async openPreviewByName(name: string): Promise<{ previewName: string }> {
    const card = this.imageCard(name);
    await waitUntil(() => card.count(), (count) => count === 1, {
      timeout: 30_000,
      message: `图片卡片未唯一显示：${name}`,
    });
    await card.click();
    await this.previewRoot.waitFor({ state: 'visible', timeout: 30_000 });
    return {
      previewName: (await this.previewHeading.innerText()).trim(),
    };
  }

  @step('关闭图片大图预览')
  async closePreview(): Promise<void> {
    await this.previewCloseButton.click();
    await this.previewRoot.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  @step('读取图片大图预览是否显示')
  async isPreviewVisible(): Promise<boolean> {
    return this.previewRoot.isVisible().catch(() => false);
  }

  @step('读取精确名称品牌图片数量：{name}')
  async countExactImageName(name: string): Promise<number> {
    return this.imageName(name).count();
  }

  @step('确认图片管理页不存在品牌图片：{name}')
  async expectImageAbsent(name: string): Promise<void> {
    await this.searchByName(name);
    const startedAt = Date.now();
    await waitUntil(
      async () => ({
        elapsed: Date.now() - startedAt,
        loading: await this.loading.count(),
        count: await this.countExactImageName(name),
      }),
      (state) => state.elapsed >= 500 && state.loading === 0 && state.count === 0,
      { timeout: 15_000, message: `图片管理页仍包含 ${name}。` },
    );
  }

  @step('点击添加按钮')
  async clickAdd(): Promise<void> {
    await this.addButton.click();
  }

  private imageName(name: string): Locator {
    return this.page.getByText(name, { exact: true });
  }

  private imageCard(name: string): Locator {
    return this.imageCards.filter({ has: this.page.getByText(name, { exact: true }) });
  }
}
