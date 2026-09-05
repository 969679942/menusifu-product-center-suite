import type { Page } from '@playwright/test';
import {
  buildAutoStandardFormBrowseName,
  standardFormSamples,
  type StandardAdvancedSettingsInput,
  type StandardBasicInfoInput,
  type StandardPriceInput,
} from '../test-data/item-create';
import { type ItemCreateStandardPage } from '../pages/product-management/item/item-create-standard.page';
import { ItemCreateFlow } from './item-create.flow';
import { step } from '../utils/step';
import { waitUntil } from '../utils/wait';

export class ItemCreateStandardFlow {
  private readonly createFlow = new ItemCreateFlow();

  @step('从商品列表进入标准商品创建页')
  async openCreateFromList(page: Page): Promise<ItemCreateStandardPage> {
    return this.createFlow.openStandardCreateFromList(page);
  }

  @step('填写标准商品基本信息')
  async fillBasicInfo(formPage: ItemCreateStandardPage, input: StandardBasicInfoInput = {}): Promise<void> {
    if (input.name) {
      await formPage.fillItemName(input.name);
    }
    if (input.altName) {
      await formPage.fillItemAltName(input.altName);
    }
    if (input.description) {
      await formPage.fillDescription(input.description);
    }
  }

  @step('选择首个可用商品分类')
  async selectFirstAvailableCategory(formPage: ItemCreateStandardPage): Promise<void> {
    await formPage.clickCategoryCascader();
    await formPage.expectCategoryMenuVisible();
    await waitUntil(
      () => formPage.countCategoryLeafMenuItems(),
      (count) => count > 0,
      { timeout: 10_000, message: '分类菜单未展示可选项。' },
    );
    await formPage.clickCategoryLeafMenuItemAt(0);
  }

  @step('展开并填写标准商品高级设置')
  async fillAdvancedSettings(
    formPage: ItemCreateStandardPage,
    input: StandardAdvancedSettingsInput = {},
  ): Promise<void> {
    await formPage.clickAdvancedSettings();
    await formPage.expectAdvancedSettingsFieldsVisible();

    const data = { ...standardFormSamples, ...input };
    await formPage.fillPosName(data.posName);
    await formPage.fillKitchenName(data.kitchenName);
    await formPage.fillMnemonicCode(data.mnemonicCode);
    await formPage.fillIndustryGoods(data.industryGoods);
    await formPage.fillItemCode(data.itemCode);
    await formPage.fillUnit(data.unit);
    await formPage.fillDeviceCode(data.deviceCode);
    await formPage.fillMinimumOrderQuantity(data.minimumOrderQuantity);
  }

  @step('填写单规格价格信息')
  async fillSingleSpecPrice(formPage: ItemCreateStandardPage, input: StandardPriceInput = {}): Promise<void> {
    await formPage.selectSingleSpec();
    if (input.price) {
      await formPage.fillStandardPrice(input.price);
    }
    if (input.packagingFee) {
      await formPage.fillPackagingFee(input.packagingFee);
    }
    if (input.cost) {
      await formPage.fillCost(input.cost);
    }
  }

  @step('探索标准商品属性区块交互')
  async exploreAttributeSection(formPage: ItemCreateStandardPage): Promise<void> {
    await formPage.expectSortRulesSectionVisible();
    await formPage.clickSortRuleSelect();
    await formPage.expectSortRuleDialogVisible();
    await formPage.closeSortRuleDialog();

    await formPage.openAddAttributeMenu();
    await formPage.expectAddAttributeMenuItemsVisible();
    await formPage.closeAddAttributeMenu();

    await formPage.expandMutuallyExclusiveRules();
    await formPage.expectMutuallyExclusiveRulesAddVisible();
  }

  @step('探索标准商品其他设置区块交互')
  async exploreOtherSettingsSection(formPage: ItemCreateStandardPage): Promise<void> {
    await formPage.expandOtherSettings();
    await formPage.expectDetailImageUploadVisible();
    await formPage.expectOtherSettingsAddButtonsVisible();
  }

  @step('浏览标准商品创建表单全部区块')
  async browseFullCreateForm(page: Page): Promise<ItemCreateStandardPage> {
    const formPage = await this.openCreateFromList(page);

    await this.fillBasicInfo(formPage, {
      name: buildAutoStandardFormBrowseName(),
      altName: standardFormSamples.altName,
      description: standardFormSamples.description,
    });
    await this.selectFirstAvailableCategory(formPage);
    await this.fillAdvancedSettings(formPage);
    await this.fillSingleSpecPrice(formPage, {
      price: '9.99',
      packagingFee: standardFormSamples.packagingFee,
      cost: standardFormSamples.cost,
    });
    await this.exploreAttributeSection(formPage);
    await this.exploreOtherSettingsSection(formPage);

    return formPage;
  }

  @step('浏览标准商品创建表单全部区块后应仍停留在创建页')
  async browseFullCreateFormAndExpectStillOnPage(page: Page): Promise<void> {
    const formPage = await this.browseFullCreateForm(page);
    await formPage.expectStillOnCreatePage();
  }
}
