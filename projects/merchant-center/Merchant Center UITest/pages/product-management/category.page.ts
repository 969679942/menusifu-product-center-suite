import type { Locator, Page } from '@playwright/test';
import { findProductMenuById } from '../../test-data/product-management';
import { step } from '../../utils/step';
import { MerchantShellPage } from '../sidebar.page';

export class CategoryPage extends MerchantShellPage {
  readonly searchInput: Locator;
  readonly createCategoryButton: Locator;
  private readonly menuItem = findProductMenuById('category');

  constructor(page: Page) {
    super(page);
    this.searchInput = page.getByPlaceholder(this.menuItem.searchPlaceholder);
    this.createCategoryButton = page.getByText(this.menuItem.primaryAction).first();
  }

  @step('打开分类页')
  async open(): Promise<void> {
    await this.page.goto(this.menuItem.path, { waitUntil: 'domcontentloaded' });
    await this.expectLoaded();
  }

  @step('等待分类页加载完成')
  async expectLoaded(): Promise<void> {
    await this.expectPathname(this.menuItem.path);
    await this.searchInput.waitFor({ state: 'visible', timeout: 30_000 });
    await this.createCategoryButton.waitFor({ state: 'visible', timeout: 30_000 });
    await this.page.getByText(this.menuItem.tableMarker).first().waitFor({ state: 'visible', timeout: 30_000 });
  }

  @step('按分类名称搜索：{keyword}')
  async search(keyword: string): Promise<void> {
    await this.searchInput.fill(keyword);
  }

  @step('点击新增商品分类')
  async clickCreateCategory(): Promise<void> {
    await this.createCategoryButton.click();
  }
}
