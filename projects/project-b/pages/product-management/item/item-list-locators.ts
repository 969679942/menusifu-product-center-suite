import type { Locator, Page } from '@playwright/test';
import {
  itemActionMenuDom,
  itemDeleteDialogDom,
  itemListBatchMenuDom,
  itemListDom,
  itemRowActionMenuDom,
} from '../../../test-data/item-list';

export class ItemListLocators {
  readonly searchInput: Locator;
  readonly addButton: Locator;
  readonly resetButton: Locator;
  readonly actionButton: Locator;
  readonly importRecordsButton: Locator;
  readonly batchActionButton: Locator;
  readonly tableHeaderRow: Locator;
  readonly tableBodyRows: Locator;
  readonly pagination: Locator;
  readonly emptyResults: Locator;
  readonly filterTypeTrigger: Locator;
  readonly filterStatusTrigger: Locator;
  readonly actionMenuImageImport: Locator;
  readonly actionMenuItemImport: Locator;
  readonly rowActionDisable: Locator;
  readonly rowActionEnable: Locator;
  readonly rowActionCopy: Locator;
  readonly rowActionDelete: Locator;
  readonly deleteDialog: Locator;
  readonly deleteDialogCancelButton: Locator;
  readonly deleteDialogConfirmButton: Locator;
  readonly batchMenuEditProductInfo: Locator;
  readonly batchMenuModifySalesInfo: Locator;
  readonly batchMenuModifyPrice: Locator;
  readonly batchMenuModifyAttributes: Locator;
  readonly batchMenuAddToMenu: Locator;
  readonly batchMenuDelete: Locator;
  readonly visibleBatchMenuItems: Locator;
  readonly visibleBatchDropdowns: Locator;
  readonly tableHeaderMarker: Locator;
  readonly paginationTotalText: Locator;
  readonly paginationCurrentPage: Locator;
  readonly visibleMessages: Locator;
  readonly imagePreview: Locator;
  readonly imagePreviewCloseButton: Locator;
  readonly visibleDialogs: Locator;
  readonly visibleModals: Locator;

  constructor(private readonly page: Page) {
    this.searchInput = page.getByPlaceholder(/Item Name|商品名称/i);
    this.addButton = page.getByRole('button', { name: /Add Item|新增商品/i });
    this.resetButton = page.getByRole('button', { name: /Reset|重置/i });
    this.actionButton = page.getByRole('button', { name: /Action|操作/i });
    this.importRecordsButton = page.getByRole('button', { name: itemListDom.importRecordsButton });
    this.batchActionButton = page.getByRole('button', { name: itemListDom.batchActionPattern });
    this.tableHeaderRow = page.locator('.ant-table-thead');
    this.tableBodyRows = page.locator('tbody tr.ant-table-row:visible');
    this.pagination = page.locator('.ant-pagination');
    this.emptyResults = page.getByText(/No search results found|暂无数据|无搜索结果/i, { exact: true });
    this.filterTypeTrigger = page.locator('[class*="selectLabel"]').filter({ hasText: new RegExp(`^${itemListDom.filterType}$`) });
    this.filterStatusTrigger = page.locator('[class*="selectLabel"]').filter({ hasText: new RegExp(`^${itemListDom.filterStatus}$`) });
    this.actionMenuImageImport = page.getByRole('menuitem', { name: itemActionMenuDom.imageImport });
    this.actionMenuItemImport = page.getByRole('menuitem', { name: itemActionMenuDom.itemImport });
    this.rowActionDisable = page.getByRole('menuitem', { name: itemRowActionMenuDom.disable });
    this.rowActionEnable = page.getByRole('menuitem', { name: itemRowActionMenuDom.enable });
    this.rowActionCopy = page.getByRole('menuitem', { name: itemRowActionMenuDom.copy });
    this.rowActionDelete = page.getByRole('menuitem', { name: itemRowActionMenuDom.delete });
    this.deleteDialog = page.getByRole('dialog', { name: itemDeleteDialogDom.title });
    this.deleteDialogCancelButton = this.deleteDialog.getByRole('button', { name: itemDeleteDialogDom.cancelButton });
    this.deleteDialogConfirmButton = this.deleteDialog.getByRole('button', { name: itemDeleteDialogDom.confirmButton });
    this.batchMenuEditProductInfo = page.getByRole('menuitem', { name: itemListBatchMenuDom.editProductInfo });
    this.batchMenuModifySalesInfo = page.getByRole('menuitem', { name: itemListBatchMenuDom.modifySalesInfo });
    this.batchMenuModifyPrice = page.getByRole('menuitem', { name: itemListBatchMenuDom.modifyPrice });
    this.batchMenuModifyAttributes = page.getByRole('menuitem', { name: itemListBatchMenuDom.modifyAttributes });
    this.batchMenuAddToMenu = page.getByRole('menuitem', { name: itemListBatchMenuDom.addToMenu });
    this.batchMenuDelete = page.getByRole('menuitem', { name: 'Delete', exact: true });
    this.visibleBatchMenuItems = page.locator('.ant-dropdown-menu:visible [role="menuitem"], .ant-dropdown-menu:visible .ant-dropdown-menu-item');
    this.visibleBatchDropdowns = page.locator('.ant-dropdown:visible');
    this.tableHeaderMarker = this.tableHeaderRow.getByText(/Item|商品/i, { exact: true }).first();
    this.paginationTotalText = this.pagination.locator('.ant-pagination-total-text');
    this.paginationCurrentPage = this.pagination.locator('.ant-pagination-item-active');
    this.visibleMessages = page.locator('.ant-message-notice:visible');
    this.imagePreview = page.locator('.ant-image-preview-img:visible');
    this.imagePreviewCloseButton = page.locator('.ant-image-preview-close:visible');
    this.visibleDialogs = page.locator('[role="dialog"]:visible');
    this.visibleModals = page.locator('.ant-modal:visible');
  }

  firstRowCheckbox(): Locator {
    return this.tableBodyRows.first().locator('.ant-checkbox-input');
  }

  firstRowActionButton(): Locator {
    return this.tableBodyRows.first().locator('button').last();
  }

  batchActionButtonForCount(count: number): Locator {
    return this.page.getByRole('button', { name: new RegExp(`Bulk Operation\\(${count}\\)`) });
  }

  rowByItemName(itemName: string): Locator {
    return this.tableBodyRows.filter({ hasText: itemName }).first();
  }

  rowsByItemName(itemName: string): Locator {
    return this.tableBodyRows.filter({ hasText: itemName });
  }

  rowsByType(typeLabel: string): Locator {
    return this.tableBodyRows.filter({ hasText: typeLabel });
  }

  itemNameLink(itemName: string): Locator {
    return this.rowByItemName(itemName).locator('td').nth(1).getByText(itemName, { exact: true }).locator('..');
  }

  rowActionButton(itemName: string): Locator {
    return this.rowByItemName(itemName).locator('button').last();
  }

  typeFilterOption(typeLabel: string): Locator {
    return this.typeFilterContainer()
      .getByText(typeLabel, { exact: true })
      .locator('..')
      .getByRole('checkbox');
  }

  statusFilterOptionRow(statusLabel: string): Locator {
    return this.statusFilterContainer().getByText(statusLabel, { exact: true }).locator('..');
  }

  typeFilterContainer(): Locator {
    return this.filterTypeTrigger.locator('../..');
  }

  statusFilterContainer(): Locator {
    return this.filterStatusTrigger.locator('../..');
  }

  rowTypeCell(row: Locator): Locator {
    return row.locator('td').nth(4);
  }

  rowStatusCell(row: Locator): Locator {
    return row.locator('td').nth(15);
  }

  rowSpecificationCell(row: Locator): Locator {
    return row.locator('td').nth(6);
  }

  rowPriceCell(row: Locator): Locator {
    return row.locator('td').nth(7);
  }

  rowCategoryCell(row: Locator): Locator {
    return row.locator('td').nth(5);
  }

  rowMainImages(row: Locator): Locator {
    return row.locator('td').nth(1).locator('img');
  }

  checkedTypeFilters(): Locator {
    return this.typeFilterContainer().getByRole('checkbox', { checked: true });
  }

  checkedStatusFilters(): Locator {
    return this.statusFilterContainer().getByRole('radio', { checked: true });
  }
}
