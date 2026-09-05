import type { Page } from '@playwright/test';
import { createItemListPage, ItemListPage } from '../pages/product-management/item/item-list.page';
import type { ItemImportImagePage } from '../pages/product-management/item/item-import-image.page';
import type { ItemImportProductPage } from '../pages/product-management/item/item-import-product.page';
import type { ItemImportRecordPage } from '../pages/product-management/item/item-import-record.page';
import { itemListFilterOptionsDom, itemSamples } from '../test-data/item-list';
import { step } from '../utils/step';
import { waitUntil } from '../utils/wait';

export class ItemListFlow {
  @step('打开商品列表页')
  async openList(page: Page): Promise<ItemListPage> {
    const itemListPage = createItemListPage(page);
    await itemListPage.open();
    return itemListPage;
  }

  @step('验证商品列表已加载且分页可见')
  async expectListLoadedWithPagination(page: Page): Promise<void> {
    const itemListPage = await this.openList(page);
    await itemListPage.expectBatchActionDisabled();
    await itemListPage.expectPaginationVisible();
  }

  @step('搜索商品并验证结果包含：{keyword}')
  async searchExistingItem(page: Page, keyword: string): Promise<ItemListPage> {
    const itemListPage = createItemListPage(page);
    await itemListPage.open();
    await itemListPage.fillSearch(keyword);
    await itemListPage.expectItemVisible(keyword);
    return itemListPage;
  }

  @step('搜索不存在商品并验证无结果')
  async searchNonExistingItem(page: Page): Promise<void> {
    const itemListPage = createItemListPage(page);
    await itemListPage.open();
    await itemListPage.fillSearch(itemSamples.nonExistingName);
    await itemListPage.expectEmptySearchResults();
  }

  @step('验证未选中商品时批量操作按钮禁用')
  async expectBatchActionDisabledWhenNoneSelected(page: Page): Promise<void> {
    const itemListPage = await this.openList(page);
    await itemListPage.expectBatchActionDisabled();
  }

  @step('选中首行商品后批量操作应可用')
  async selectFirstRowAndExpectBatchEnabled(page: Page, count = 1): Promise<ItemListPage> {
    const itemListPage = await this.openList(page);
    await itemListPage.selectFirstRow();
    await itemListPage.expectBatchActionEnabled(count);
    return itemListPage;
  }

  @step('选中首行并验证批量操作菜单项')
  async selectFirstRowAndExpectBatchMenuItems(page: Page): Promise<void> {
    const itemListPage = await this.selectFirstRowAndExpectBatchEnabled(page);
    await itemListPage.openBatchActionMenu();
    await itemListPage.expectBatchActionMenuItemsVisible();
  }

  @step('验证顶部操作菜单包含图片导入与商品导入选项')
  async expectActionMenuHasImportOptions(page: Page): Promise<void> {
    const itemListPage = await this.openList(page);
    await itemListPage.openActionMenu();
    await itemListPage.expectActionMenuItemsVisible();
  }

  @step('验证首行商品操作菜单包含停用、复制、删除选项')
  async expectFirstRowActionMenuHasOptions(page: Page): Promise<void> {
    const itemListPage = await this.openList(page);
    await itemListPage.openFirstRowActionMenu();
    await itemListPage.expectFirstRowActionMenuItemsVisible();
  }

  @step('从商品列表进入导入记录页')
  async openImportRecordFromList(page: Page): Promise<ItemImportRecordPage> {
    const itemListPage = await this.openList(page);
    return itemListPage.enterImportRecordPage();
  }

  @step('从商品列表进入图片导入页')
  async openImageImportFromList(page: Page): Promise<ItemImportImagePage> {
    const itemListPage = await this.openList(page);
    return itemListPage.enterImageImportPage();
  }

  @step('从商品列表进入商品导入页')
  async openProductImportFromList(page: Page): Promise<ItemImportProductPage> {
    const itemListPage = await this.openList(page);
    return itemListPage.enterProductImportPage();
  }

  @step('按标准商品类型筛选并验证结果')
  async filterStandardItems(page: Page): Promise<void> {
    const itemListPage = await this.openList(page);
    await itemListPage.selectTypeFilterOption(itemListFilterOptionsDom.typeStandard);
    await itemListPage.expectAllVisibleRowsMatchType(itemListFilterOptionsDom.typeStandard);
  }

  @step('按启用状态筛选并验证结果')
  async filterEnabledItems(page: Page): Promise<void> {
    const itemListPage = await this.openList(page);
    await itemListPage.selectStatusFilterOption(itemListFilterOptionsDom.statusEnabled);
    await itemListPage.expectAllVisibleRowsMatchStatus(itemListFilterOptionsDom.statusEnabled);
  }

  @step('重置筛选后列表应恢复展示数据')
  async resetFiltersAndExpectData(page: Page): Promise<void> {
    const itemListPage = await this.openList(page);
    await itemListPage.selectTypeFilterOption(itemListFilterOptionsDom.typeStandard);
    await itemListPage.expectAllVisibleRowsMatchType(itemListFilterOptionsDom.typeStandard);
    const filteredTotal = await itemListPage.readPaginationTotalText();
    await itemListPage.clickReset();
    await waitUntil(
      () => itemListPage.readPaginationTotalText(),
      (totalText) => totalText.length > 0 && totalText !== filteredTotal,
      { timeout: 15_000, message: '重置筛选后分页总条数应恢复为默认值。' },
    );
  }
}
