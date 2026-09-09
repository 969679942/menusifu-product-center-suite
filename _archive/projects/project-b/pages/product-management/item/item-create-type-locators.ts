import type { Locator, Page } from '@playwright/test';
import { itemCreateTypeDom } from '../../../test-data/item-list';

export class ItemCreateTypeLocators {
  readonly pageHeading: Locator;
  readonly standardCreateLink: Locator;
  readonly comboCreateLink: Locator;
  readonly sideCreateLink: Locator;

  constructor(page: Page) {
    this.pageHeading = page.getByRole('heading', { name: itemCreateTypeDom.pageHeading });
    this.standardCreateLink = this.createLinkInTypeCard(page, itemCreateTypeDom.standardCard);
    this.comboCreateLink = this.createLinkInTypeCard(page, itemCreateTypeDom.comboCard);
    this.sideCreateLink = this.createLinkInTypeCard(page, itemCreateTypeDom.sideCard);
  }

  private typeCard(page: Page, cardTitle: string): Locator {
    return page.locator(`[class^="${itemCreateTypeDom.typeCardClassPrefix}"]`).filter({
      has: page.getByText(cardTitle, { exact: true }),
    });
  }

  private createLinkInTypeCard(page: Page, cardTitle: string): Locator {
    return this.typeCard(page, cardTitle).getByText(itemCreateTypeDom.createLink, { exact: true });
  }
}
