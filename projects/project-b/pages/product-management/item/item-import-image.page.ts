import type { Page } from '@playwright/test';
import { ITEM_IMPORT_IMAGE_PATH } from '../../../test-data/item-list';
import { step } from '../../../utils/step';
import { MerchantShellPage } from '../../sidebar.page';
import { ItemImportImageLocators } from './item-import-image-locators';

export class ItemImportImagePage extends MerchantShellPage {
  private readonly locators: ItemImportImageLocators;

  constructor(page: Page) {
    super(page);
    this.locators = new ItemImportImageLocators(page);
  }

  @step('等待图片导入页加载完成')
  async expectLoaded(): Promise<void> {
    await this.expectPathname(ITEM_IMPORT_IMAGE_PATH);
    await this.locators.pageTitle.waitFor({ state: 'visible', timeout: 30_000 });
    await this.locators.uploadHeading.waitFor({ state: 'visible', timeout: 30_000 });
  }
}

export function createItemImportImagePage(page: Page): ItemImportImagePage {
  return new ItemImportImagePage(page);
}
