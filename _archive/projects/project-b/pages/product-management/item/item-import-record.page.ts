import type { Page } from '@playwright/test';
import { ITEM_IMPORT_RECORD_PATH } from '../../../test-data/item-list';
import { step } from '../../../utils/step';
import { MerchantShellPage } from '../../sidebar.page';
import { ItemImportRecordLocators } from './item-import-record-locators';

export class ItemImportRecordPage extends MerchantShellPage {
  private readonly locators: ItemImportRecordLocators;

  constructor(page: Page) {
    super(page);
    this.locators = new ItemImportRecordLocators(page);
  }

  @step('等待导入记录页加载完成')
  async expectLoaded(): Promise<void> {
    await this.expectPathname(ITEM_IMPORT_RECORD_PATH);
    await this.locators.pageTitle.waitFor({ state: 'visible', timeout: 30_000 });
    await this.locators.tableHeaderMarker.waitFor({ state: 'visible', timeout: 30_000 });
  }
}

export function createItemImportRecordPage(page: Page): ItemImportRecordPage {
  return new ItemImportRecordPage(page);
}
