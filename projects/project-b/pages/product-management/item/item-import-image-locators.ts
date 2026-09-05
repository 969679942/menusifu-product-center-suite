import type { Locator, Page } from '@playwright/test';
import { itemImportImagePageDom } from '../../../test-data/item-list';

export class ItemImportImageLocators {
  readonly pageTitle: Locator;
  readonly uploadHeading: Locator;

  constructor(page: Page) {
    this.pageTitle = page.getByText(itemImportImagePageDom.pageTitle, { exact: true });
    this.uploadHeading = page.getByRole('heading', { name: itemImportImagePageDom.uploadHeading });
  }
}
