import type { Locator, Page } from '@playwright/test';
import { executeReadOnlyUiWithTransientRetry } from '../../api/transient-retry';
import { step } from '../../utils/step';
import { waitUntil } from '../../utils/wait';

const itemListRoute = '/pp/brand/list';
const itemListResponse = /\/ops-brand\/brand-items\/pageQuery/;
const itemListCoreHeaders = [
  'Item question-circle',
  'Type question-circle',
  'Specification question-circle',
  'Price($) question-circle',
  'Status question-circle',
  'Action',
] as const;
const itemListPageSizeOptions = ['10 / page', '20 / page', '50 / page', '100 / page'] as const;

type ItemListDisplayState = {
  main: number;
  searchInput: number;
  addButton: number;
  categoryNavigation: number;
  typeFilter: number;
  categoryFilter: number;
  statusFilter: number;
  headerCounts: number[];
  rows: number;
  rowActionButtons: number;
  pagination: number;
  paginationTotal: number;
  pageSize: number;
};

export class ProductCenterItemIntakePage {
  private readonly main: Locator;
  private readonly searchInput: Locator;
  private readonly addButton: Locator;
  private readonly categoryNavigation: Locator;
  private readonly typeFilter: Locator;
  private readonly categoryFilter: Locator;
  private readonly statusFilter: Locator;
  private readonly tableRows: Locator;
  private readonly rowActionButtons: Locator;
  private readonly pagination: Locator;
  private readonly paginationTotal: Locator;
  private readonly pageSize: Locator;
  private readonly pageSizeDropdown: Locator;
  private readonly pageSizeOptions: readonly Locator[];
  private readonly headers: readonly Locator[];

  constructor(private readonly page: Page) {
    this.main = page.locator('main:visible');
    this.searchInput = this.main.getByPlaceholder('Item Name', { exact: true });
    this.addButton = this.main.getByRole('button', { name: 'plus Add Item', exact: true });
    this.categoryNavigation = page.getByRole('link', { name: 'Category', exact: true });
    this.typeFilter = this.main.locator('[class^="selectLabel___"]:visible').filter({ hasText: /^Type$/ });
    this.categoryFilter = this.main
      .locator('div[class^="customCascaderCapsule___"]:visible')
      .getByText('Category', { exact: true });
    this.statusFilter = this.main.locator('[class^="selectLabel___"]:visible').filter({ hasText: /^Status$/ });
    this.tableRows = this.main.locator('tbody tr.ant-table-row:visible');
    this.rowActionButtons = this.tableRows.getByRole('button', { name: '', exact: true });
    this.pagination = this.main.locator('.ant-pagination:visible');
    this.paginationTotal = this.pagination.getByText(/^Total \d+ items$/);
    this.pageSize = this.pagination.getByText('50 / page', { exact: true });
    this.pageSizeDropdown = page.locator('.ant-select-dropdown:visible');
    this.pageSizeOptions = itemListPageSizeOptions.map((name) =>
      this.pageSizeDropdown.getByText(name, { exact: true }));
    this.headers = itemListCoreHeaders.map((name) => this.main.getByRole('columnheader', { name, exact: true }));
  }

  @step('打开商品列表并等待列表接口成功')
  async openItemList(): Promise<void> {
    await executeReadOnlyUiWithTransientRetry(async () => {
      const responsePromise = this.page.waitForResponse(
        (response) => itemListResponse.test(response.url()) && response.status() === 200,
        { timeout: 60_000 },
      );
      await this.page.goto(itemListRoute, { waitUntil: 'domcontentloaded' });
      await responsePromise;
    });
  }

  @step('验证商品列表关键筛选、字段、数据和分页完整展示')
  async expectListDisplay(): Promise<void> {
    let lastState: ItemListDisplayState | undefined;
    try {
      await waitUntil(
        async () => {
          lastState = {
            main: await this.main.count(),
            searchInput: await this.searchInput.count(),
            addButton: await this.addButton.count(),
            categoryNavigation: await this.categoryNavigation.count(),
            typeFilter: await this.typeFilter.count(),
            categoryFilter: await this.categoryFilter.count(),
            statusFilter: await this.statusFilter.count(),
            headerCounts: await Promise.all(this.headers.map((header) => header.count())),
            rows: await this.tableRows.count(),
            rowActionButtons: await this.rowActionButtons.count(),
            pagination: await this.pagination.count(),
            paginationTotal: await this.paginationTotal.count(),
            pageSize: await this.pageSize.count(),
          };
          return lastState;
        },
        (state) => isListDisplayComplete(state),
        { timeout: 10_000, interval: 100, message: '商品列表展示合同未达到完整终态' },
      );
    } catch {
      throw new Error(`商品列表展示合同未达到完整终态：${JSON.stringify(lastState)}`);
    }
    await this.expectPageSizeOptions();
  }

  @step('验证分页支持十、二十、五十和一百条每页')
  async expectPageSizeOptions(): Promise<void> {
    await this.pageSize.click({ timeout: 5_000 });
    try {
      await this.pageSizeDropdown.waitFor({ state: 'visible', timeout: 5_000 });
      for (const option of this.pageSizeOptions) {
        await option.waitFor({ state: 'visible', timeout: 5_000 });
      }
    } finally {
      await this.page.keyboard.press('Escape');
      await this.pageSizeDropdown.waitFor({ state: 'hidden', timeout: 5_000 });
    }
  }

}

function isListDisplayComplete(state: ItemListDisplayState): boolean {
  return state.main === 1
    && state.searchInput === 1
    && state.addButton === 1
    && state.categoryNavigation === 1
    && state.typeFilter === 1
    && state.categoryFilter === 1
    && state.statusFilter === 1
    && state.headerCounts.every((count) => count === 1)
    && state.rows === 50
    && state.rowActionButtons === state.rows
    && state.pagination === 1
    && state.paginationTotal === 1
    && state.pageSize === 1;
}
