import type { Locator, Page } from '@playwright/test';
import { itemImportRecordPageDom } from '../../../test-data/item-list';

export class ItemImportRecordLocators {
  readonly pageTitle: Locator;
  readonly tableHeaderMarker: Locator;

  constructor(page: Page) {
    this.pageTitle = page.getByText(itemImportRecordPageDom.pageTitle, { exact: true });
    this.tableHeaderMarker = page
      .locator('.ant-table-thead')
      .getByText(itemImportRecordPageDom.tableMarker, { exact: true });
  }
}
