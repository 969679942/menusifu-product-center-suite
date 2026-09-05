import type { Locator, Page } from '@playwright/test';
import { findProductMenuById } from '../../test-data/product-management';
import { step } from '../../utils/step';
import { MerchantShellPage } from '../sidebar.page';

export class LanguageManagementPage extends MerchantShellPage {
  readonly searchInput: Locator;
  readonly resetButton: Locator;
  readonly tableHeaderRow: Locator;
  private readonly menuItem = findProductMenuById('language-management');

  constructor(page: Page) {
    super(page);
    this.searchInput = page.getByPlaceholder(this.menuItem.searchPlaceholder);
    this.resetButton = page.getByRole('button', { name: this.menuItem.resetAction! });
    this.tableHeaderRow = page.locator('.ant-table-thead');
  }

  @step('打开多语言管理页')
  async open(): Promise<void> {
    await this.page.goto(this.menuItem.path, { waitUntil: 'domcontentloaded' });
    await this.expectLoaded();
  }

  @step('等待多语言管理页加载完成')
  async expectLoaded(): Promise<void> {
    await this.expectPathname(this.menuItem.path);
    await this.searchInput.waitFor({ state: 'visible', timeout: 30_000 });
    await this.resetButton.waitFor({ state: 'visible', timeout: 30_000 });
    await this.tableHeaderRow.getByText(this.menuItem.tableMarker, { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
  }

  @step('按商品名称搜索：{keyword}')
  async search(keyword: string): Promise<void> {
    await this.searchInput.fill(keyword);
  }
}
