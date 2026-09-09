import type { Page } from '@playwright/test';
import type { CreatedItem } from '../test-data/item-create';
import { createItemListPage } from '../pages/product-management/item/item-list.page';
import { ItemCreateFlow } from './item-create.flow';
import { step } from '../utils/step';

type DeleteItemOptions = {
  skipOpen?: boolean;
};

export class ItemRowActionFlow {
  private readonly createFlow = new ItemCreateFlow();

  @step('搜索商品并删除：{itemName}')
  async deleteItemByName(page: Page, itemName: string, options: DeleteItemOptions = {}): Promise<void> {
    const itemListPage = createItemListPage(page);
    if (!options.skipOpen) {
      await itemListPage.open();
    } else {
      await itemListPage.expectLoaded();
    }
    await itemListPage.fillSearch(itemName);
    await itemListPage.expectItemVisible(itemName);
    await itemListPage.openRowActionMenu(itemName);
    await itemListPage.clickRowActionDelete();
    await itemListPage.confirmDeleteDialog();
    await itemListPage.expectLoaded();
    await itemListPage.fillSearch(itemName);
    await itemListPage.expectItemNotVisible(itemName);
    await itemListPage.expectEmptySearchResults();
  }

  @step('创建加料/配菜商品后删除')
  async createSideItemAndDelete(page: Page): Promise<CreatedItem> {
    const created = await this.createFlow.createSideItem(page);
    await this.deleteItemByName(page, created.name, { skipOpen: true });
    return created;
  }
}
