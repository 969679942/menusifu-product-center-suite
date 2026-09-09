import type { Page } from '@playwright/test';
import type { ItemProductType } from '../test-data/item-create';
import {
  createItemEditPage,
  type ItemEditComboPage,
  type ItemEditPage,
  type ItemEditSidePage,
  type ItemEditStandardPage,
} from '../pages/product-management/item/item-edit.page';
import { createItemListPage } from '../pages/product-management/item/item-list.page';
import { ItemListFlow } from './item-list.flow';
import { step } from '../utils/step';

export class ItemEditFlow {
  private readonly listFlow = new ItemListFlow();

  async openEditByItemName(page: Page, itemName: string, type: 'standard'): Promise<ItemEditStandardPage>;
  async openEditByItemName(page: Page, itemName: string, type: 'combo'): Promise<ItemEditComboPage>;
  async openEditByItemName(page: Page, itemName: string, type: 'side'): Promise<ItemEditSidePage>;
  async openEditByItemName(page: Page, itemName: string, type: ItemProductType): Promise<ItemEditPage>;
  @step('搜索商品并进入编辑页：{itemName}')
  async openEditByItemName(page: Page, itemName: string, type: ItemProductType): Promise<ItemEditPage> {
    const itemListPage = createItemListPage(page);
    await itemListPage.open();
    await itemListPage.fillSearch(itemName);
    await itemListPage.expectItemVisible(itemName);
    await itemListPage.clickItemName(itemName);
    const editPage = createItemEditPage(page, type);
    await editPage.expectLoaded();
    return editPage;
  }
}
