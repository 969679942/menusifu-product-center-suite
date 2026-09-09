import type { Page } from '@playwright/test';
import {
  buildItemCreateInput,
  buildStandardItemCreateInput,
  standardMultiSpecExpectations,
  type CreatedItem,
  type ItemCreateInput,
  type ItemProductType,
  type StandardItemCreateInput,
  type StandardItemVariant,
} from '../test-data/item-create';
import { ItemCreateComboPage } from '../pages/product-management/item/item-create-combo.page';
import type { ItemCreateFormPage } from '../pages/product-management/item/item-create-form.page';
import { ItemCreateSidePage } from '../pages/product-management/item/item-create-side.page';
import { ItemCreateStandardPage } from '../pages/product-management/item/item-create-standard.page';
import { createItemEditPage } from '../pages/product-management/item/item-edit.page';
import { createItemListPage } from '../pages/product-management/item/item-list.page';
import { ItemListFlow } from './item-list.flow';
import { step } from '../utils/step';
import { waitUntil } from '../utils/wait';
import { ITEM_LIST_PATH } from '../test-data/item-list';

export class ItemCreateFlow {
  private readonly listFlow = new ItemListFlow();

  @step('从商品列表进入新增商品类型选择页')
  async openTypeSelectionFromList(page: Page) {
    const itemListPage = await this.listFlow.openList(page);
    return itemListPage.enterCreateTypePage();
  }

  @step('从商品列表进入标准商品创建页')
  async openStandardCreateFromList(page: Page): Promise<ItemCreateStandardPage> {
    const createTypePage = await this.openTypeSelectionFromList(page);
    return createTypePage.enterStandardCreate();
  }

  @step('从当前商品列表进入标准商品创建页')
  async openStandardCreateFromCurrentList(page: Page): Promise<ItemCreateStandardPage> {
    const itemListPage = createItemListPage(page);
    await itemListPage.expectLoaded();
    const createTypePage = await itemListPage.enterCreateTypePage();
    return createTypePage.enterStandardCreate();
  }

  @step('从商品列表进入套餐商品创建页')
  async openComboCreateFromList(page: Page): Promise<ItemCreateComboPage> {
    const createTypePage = await this.openTypeSelectionFromList(page);
    return createTypePage.enterComboCreate();
  }

  @step('从当前商品列表进入套餐商品创建页')
  async openComboCreateFromCurrentList(page: Page): Promise<ItemCreateComboPage> {
    const itemListPage = createItemListPage(page);
    await itemListPage.expectLoaded();
    const createTypePage = await itemListPage.enterCreateTypePage();
    return createTypePage.enterComboCreate();
  }

  @step('从商品列表进入加料/配菜商品创建页')
  async openSideCreateFromList(page: Page): Promise<ItemCreateSidePage> {
    const createTypePage = await this.openTypeSelectionFromList(page);
    return createTypePage.enterSideCreate();
  }

  @step('保存商品表单并确认保存成功后回到列表')
  private async saveFormAndExpectList(
    page: Page,
    formPage: ItemCreateFormPage,
    itemName: string,
  ): Promise<void> {
    await formPage.clickSave();
    let completion: Awaited<ReturnType<ItemCreateFormPage['readSaveCompletionState']>>;
    try {
      completion = await waitUntil(
        () => formPage.readSaveCompletionState(),
        (state) => state.pathname === ITEM_LIST_PATH || state.successVisible || state.errorVisible || state.validationErrors.length > 0,
        {
          timeout: 30_000,
          interval: 100,
          message: '商品保存后未观察到列表路由、成功提示或表单错误。',
          probeTimeout: 2_000,
        },
      );
    } catch (error) {
      const currentState = await formPage.readSaveCompletionState();
      if (!await formPage.isOnExpectedPath() || currentState.errorVisible || currentState.validationErrors.length > 0) {
        throw error;
      }
      const listPage = createItemListPage(page);
      await listPage.open();
      await listPage.fillSearchAndWait(itemName);
      await listPage.expectItemVisible(itemName);
      return;
    }
    if (completion.errorVisible || completion.validationErrors.length > 0) {
      throw new Error(`商品保存被表单校验拦截：${completion.validationErrors.join('；') || '页面出现错误提示。'}`);
    }
    const listPage = createItemListPage(page);
    if (completion.pathname === ITEM_LIST_PATH) {
      await listPage.expectLoaded();
      return;
    }
    await listPage.open();
  }

  @step('创建标准商品（单规格）')
  async createStandardSingleSpecItem(page: Page, input: ItemCreateInput = {}): Promise<CreatedItem> {
    return this.createStandardItemByVariant(page, 'single', input);
  }

  @step('创建标准商品（多规格）')
  async createStandardMultiSpecItem(page: Page, input: StandardItemCreateInput = {}): Promise<CreatedItem> {
    return this.createStandardItemByVariant(page, 'multi', input);
  }

  @step('创建标准商品（称重）')
  async createStandardWeightItem(page: Page, input: ItemCreateInput = {}): Promise<CreatedItem> {
    return this.createStandardItemByVariant(page, 'weight', input);
  }

  @step('创建标准商品')
  async createStandardItem(page: Page, input: ItemCreateInput = {}): Promise<CreatedItem> {
    return this.createStandardSingleSpecItem(page, input);
  }

  private async createStandardItemByVariant(
    page: Page,
    variant: StandardItemVariant,
    input: StandardItemCreateInput = {},
  ): Promise<CreatedItem> {
    const data = buildStandardItemCreateInput(variant, input);
    const formPage = await this.openStandardCreateFromList(page);
    await formPage.fillItemName(data.name);

    switch (variant) {
      case 'single':
        await formPage.selectSingleSpec();
        await formPage.fillStandardPrice(data.price);
        break;
      case 'multi':
        await formPage.selectMultiSpec();
        await formPage.addFirstSpecGroup();
        await formPage.fillAllMultiSpecPrices(data.multiSpecPrice);
        break;
      case 'weight':
        await formPage.enableWeightBasedItem();
        await formPage.fillStandardPrice(data.price);
        break;
      default: {
        const exhaustiveCheck: never = variant;
        throw new Error(`Unsupported standard item variant: ${String(exhaustiveCheck)}`);
      }
    }

    await this.saveFormAndExpectList(page, formPage, data.name);
    return { name: data.name, type: 'standard', price: data.price, variant };
  }

  @step('创建套餐商品')
  async createComboItem(page: Page, input: ItemCreateInput = {}): Promise<CreatedItem> {
    const data = buildItemCreateInput('combo', input);
    const formPage = await this.openComboCreateFromList(page);
    await formPage.fillItemName(data.name);
    await formPage.fillStandardPrice(data.price);
    await formPage.addFirstCustomComboGroup();
    await this.saveFormAndExpectList(page, formPage, data.name);
    return { name: data.name, type: 'combo', price: data.price };
  }

  @step('创建加料/配菜商品')
  async createSideItem(page: Page, input: ItemCreateInput = {}): Promise<CreatedItem> {
    const data = buildItemCreateInput('side', input);
    const formPage = await this.openSideCreateFromList(page);
    await formPage.fillItemName(data.name);
    await formPage.fillStandardPrice(data.price);
    await this.saveFormAndExpectList(page, formPage, data.name);
    return { name: data.name, type: 'side', price: data.price };
  }

  @step('未填必填项保存标准商品应停留在创建页')
  async expectStandardSaveBlockedWithoutRequiredFields(page: Page): Promise<void> {
    const formPage = await this.openStandardCreateFromList(page);
    await formPage.clickSave();
    await formPage.expectSaveBlockedOnCreatePage();
  }

  @step('创建商品并验证编辑页显示正确商品名称')
  async createItemAndExpectEditPageName(
    page: Page,
    type: ItemProductType,
    input: ItemCreateInput = {},
  ): Promise<void> {
    const { created, editPage } = await this.createItemAndOpenEdit(page, type, input);
    await waitUntil(
      () => editPage.readItemName(),
      (name) => name === created.name,
      { timeout: 10_000, message: '编辑页商品名称与创建时不一致。' },
    );
  }

  @step('创建单规格标准商品并验证列表规格列为空')
  async createSingleSpecAndExpectEmptySpecInList(page: Page): Promise<CreatedItem> {
    const created = await this.createStandardSingleSpecItem(page);
    const itemListPage = await this.listFlow.searchExistingItem(page, created.name);
    await waitUntil(
      () => itemListPage.readItemSpecificationText(created.name),
      (specText) => specText.length === 0,
      { timeout: 10_000, message: '单规格商品列表规格列应为空。' },
    );
    return created;
  }

  @step('创建多规格标准商品并验证列表展示规格信息')
  async createMultiSpecAndExpectSpecInList(page: Page): Promise<CreatedItem> {
    const created = await this.createStandardMultiSpecItem(page);
    const itemListPage = await this.listFlow.searchExistingItem(page, created.name);
    await waitUntil(
      () => itemListPage.readItemSpecificationText(created.name),
      (specText) => specText.includes(standardMultiSpecExpectations.listSpecMarker),
      { timeout: 10_000, message: '多规格商品列表应展示规格信息。' },
    );
    return created;
  }

  @step('创建称重标准商品并验证列表可搜索到')
  async createWeightAndExpectSearchableInList(page: Page): Promise<CreatedItem> {
    const created = await this.createStandardWeightItem(page);
    await this.listFlow.searchExistingItem(page, created.name);
    return created;
  }

  @step('创建商品并在编辑页验证：{type}')
  async createItemAndOpenEdit(page: Page, type: ItemProductType, input: ItemCreateInput = {}) {
    const created = await this.createItemByType(page, type, input);
    const itemListPage = createItemListPage(page);
    await itemListPage.fillSearch(created.name);
    await itemListPage.expectItemVisible(created.name);
    await itemListPage.clickItemName(created.name);
    const editPage = createItemEditPage(page, type);
    await editPage.expectLoaded();
    return { created, editPage };
  }

  private async createItemByType(page: Page, type: ItemProductType, input: ItemCreateInput): Promise<CreatedItem> {
    switch (type) {
      case 'standard':
        return this.createStandardItem(page, input);
      case 'combo':
        return this.createComboItem(page, input);
      case 'side':
        return this.createSideItem(page, input);
      default: {
        const exhaustiveCheck: never = type;
        throw new Error(`Unsupported item type: ${String(exhaustiveCheck)}`);
      }
    }
  }
}
