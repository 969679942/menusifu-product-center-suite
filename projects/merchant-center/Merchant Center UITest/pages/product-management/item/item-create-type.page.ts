import type { Page } from '@playwright/test';
import { ITEM_CREATE_TYPE_PATH } from '../../../test-data/item-list';
import { step } from '../../../utils/step';
import { MerchantShellPage } from '../../sidebar.page';
import { ItemCreateComboPage } from './item-create-combo.page';
import { ItemCreateSidePage } from './item-create-side.page';
import { ItemCreateStandardPage } from './item-create-standard.page';
import { ItemCreateTypeLocators } from './item-create-type-locators';

export class ItemCreateTypePage extends MerchantShellPage {
  private readonly locators: ItemCreateTypeLocators;

  constructor(page: Page) {
    super(page);
    this.locators = new ItemCreateTypeLocators(page);
  }

  @step('打开选择商品类型页')
  async open(): Promise<void> {
    await this.page.goto(ITEM_CREATE_TYPE_PATH, { waitUntil: 'domcontentloaded' });
    await this.expectLoaded();
  }

  @step('等待选择商品类型页加载完成')
  async expectLoaded(): Promise<void> {
    await this.expectPathname(ITEM_CREATE_TYPE_PATH);
    await this.locators.pageHeading.waitFor({ state: 'visible', timeout: 30_000 });
    await this.locators.standardCreateLink.waitFor({ state: 'visible', timeout: 30_000 });
  }

  @step('读取三个商品类型创建入口')
  async readCreateEntryEvidence(): Promise<{ standard: number; combo: number; side: number }> {
    return {
      standard: await this.locators.standardCreateLink.count(),
      combo: await this.locators.comboCreateLink.count(),
      side: await this.locators.sideCreateLink.count(),
    };
  }

  @step('进入标准商品创建页')
  async enterStandardCreate(): Promise<ItemCreateStandardPage> {
    await this.locators.standardCreateLink.click();
    const formPage = new ItemCreateStandardPage(this.page);
    await formPage.expectLoaded();
    return formPage;
  }

  @step('进入套餐商品创建页')
  async enterComboCreate(): Promise<ItemCreateComboPage> {
    await this.locators.comboCreateLink.click();
    const formPage = new ItemCreateComboPage(this.page);
    await formPage.expectLoaded();
    return formPage;
  }

  @step('进入加料/配菜商品创建页')
  async enterSideCreate(): Promise<ItemCreateSidePage> {
    await this.locators.sideCreateLink.click();
    const formPage = new ItemCreateSidePage(this.page);
    await formPage.expectLoaded();
    return formPage;
  }
}
