import type { Locator, Page } from '@playwright/test';
import { findProductMenuById } from '../../test-data/product-management';
import { step } from '../../utils/step';
import { MerchantShellPage } from '../sidebar.page';

export class SortOrderPage extends MerchantShellPage {
  readonly pageHeading: Locator;
  readonly searchInput: Locator;
  readonly createButton: Locator;
  private readonly menuItem = findProductMenuById('sort-order');

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.getByRole('heading', { name: this.menuItem.tableMarker });
    this.searchInput = page.getByPlaceholder(this.menuItem.searchPlaceholder);
    this.createButton = page.getByRole('button', { name: this.menuItem.primaryAction });
  }

  @step('打开排序规则页')
  async open(): Promise<void> {
    await this.page.goto(this.menuItem.path, { waitUntil: 'domcontentloaded' });
    await this.expectLoaded();
  }

  @step('等待排序规则页加载完成')
  async expectLoaded(): Promise<void> {
    await this.expectPathname(this.menuItem.path);
    await this.pageHeading.waitFor({ state: 'visible', timeout: 30_000 });
    await this.searchInput.waitFor({ state: 'visible', timeout: 30_000 });
    await this.createButton.waitFor({ state: 'visible', timeout: 30_000 });
  }

  @step('按排序规则名称搜索：{keyword}')
  async search(keyword: string): Promise<void> {
    await this.searchInput.fill(keyword);
  }

  @step('点击新增排序规则')
  async clickCreate(): Promise<void> {
    await this.createButton.click();
  }
}
