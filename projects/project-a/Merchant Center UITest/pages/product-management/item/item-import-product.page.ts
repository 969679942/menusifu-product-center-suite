import type { Page } from '@playwright/test';
import { ITEM_IMPORT_PRODUCT_PATH } from '../../../test-data/item-list';
import { step } from '../../../utils/step';
import { MerchantShellPage } from '../../sidebar.page';
import { ItemImportProductLocators } from './item-import-product-locators';

export class ItemImportProductPage extends MerchantShellPage {
  private readonly locators: ItemImportProductLocators;

  constructor(page: Page) {
    super(page);
    this.locators = new ItemImportProductLocators(page);
  }

  @step('等待商品导入页加载完成')
  async expectLoaded(): Promise<void> {
    await this.expectPathname(ITEM_IMPORT_PRODUCT_PATH);
    await this.locators.pageTitle.waitFor({ state: 'visible', timeout: 30_000 });
    await this.locators.uploadHeading.waitFor({ state: 'visible', timeout: 30_000 });
  }

  @step('读取商品导入文件格式限制')
  async readFileInputAccept(): Promise<string> {
    await this.locators.fileInput.waitFor({ state: 'attached', timeout: 10_000 });
    return await this.locators.fileInput.getAttribute('accept') ?? '';
  }

  @step('选择商品导入审计文件')
  async selectAuditFile(file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
    await this.locators.fileInput.setInputFiles(file);
  }

  @step('提交商品导入文件')
  async submit(): Promise<void> {
    await this.locators.submitButton.waitFor({ state: 'visible', timeout: 10_000 });
    if (!await this.locators.submitButton.isEnabled()) {
      throw new Error('商品导入 Submit 按钮未启用。');
    }
    await this.locators.submitButton.click();
  }
}

export function createItemImportProductPage(page: Page): ItemImportProductPage {
  return new ItemImportProductPage(page);
}
