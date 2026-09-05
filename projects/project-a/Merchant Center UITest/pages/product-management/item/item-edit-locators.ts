import type { Locator, Page } from '@playwright/test';
import { itemEditPageDom } from '../../../test-data/item-list';

export class ItemEditLocators {
  readonly standardPageTitle: Locator;
  readonly comboPageTitle: Locator;
  readonly sidePageTitle: Locator;

  constructor(page: Page) {
    this.standardPageTitle = page.getByText(itemEditPageDom.standardTitle, { exact: true });
    this.comboPageTitle = page.getByText(itemEditPageDom.comboTitle, { exact: true });
    this.sidePageTitle = page.getByText(itemEditPageDom.sideTitle, { exact: true });
  }
}
