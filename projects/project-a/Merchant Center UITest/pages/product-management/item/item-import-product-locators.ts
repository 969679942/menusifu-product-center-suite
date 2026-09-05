import type { Locator, Page } from '@playwright/test';
import { itemImportProductPageDom } from '../../../test-data/item-list';

export class ItemImportProductLocators {
  readonly pageTitle: Locator;
  readonly uploadHeading: Locator;
  readonly fileInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.pageTitle = page.getByText(itemImportProductPageDom.pageTitle, { exact: true });
    this.uploadHeading = page.getByRole('heading', { name: itemImportProductPageDom.uploadHeading });
    this.fileInput = page.locator('input[type="file"]');
    this.submitButton = page.getByRole('button', { name: /^(submit|提交)$/i });
  }
}
