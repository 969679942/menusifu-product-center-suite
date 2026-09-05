import type { Page } from '@playwright/test';
import type { ProductManagementMenuItem } from '../test-data/product-management';
import { SidebarPage } from '../pages/sidebar.page';
import { CategoryPage } from '../pages/product-management/category.page';
import { createItemListPage } from '../pages/product-management/item/item-list.page';
import { LanguageManagementPage } from '../pages/product-management/language-management.page';
import {
  createAddOnsPage,
  createCombosPage,
  createFlavorsPage,
  createPreparationsPage,
  createSpecificationsPage,
  type GroupListPage,
} from '../pages/product-management/group-list.factory';
import { SortOrderPage } from '../pages/product-management/sort-order.page';
import { step } from '../utils/step';

export type ProductManagementPage =
  | ReturnType<typeof createItemListPage>
  | LanguageManagementPage
  | CategoryPage
  | GroupListPage
  | SortOrderPage;

function createPageByMenuItem(page: Page, menuItem: ProductManagementMenuItem): ProductManagementPage {
  switch (menuItem.id) {
    case 'item':
      return createItemListPage(page);
    case 'language-management':
      return new LanguageManagementPage(page);
    case 'category':
      return new CategoryPage(page);
    case 'specifications':
      return createSpecificationsPage(page);
    case 'sort-order':
      return new SortOrderPage(page);
    case 'flavors':
      return createFlavorsPage(page);
    case 'preparations':
      return createPreparationsPage(page);
    case 'add-ons':
      return createAddOnsPage(page);
    case 'combos':
      return createCombosPage(page);
    default: {
      const exhaustiveCheck: never = menuItem;
      throw new Error(`Unsupported menu item: ${String(exhaustiveCheck)}`);
    }
  }
}

export class ProductManagementFlow {
  @step((_page: Page, menuItem: ProductManagementMenuItem) => `通过侧边栏进入商品管理页面：${menuItem.pageName}`)
  async openViaSidebar(page: Page, menuItem: ProductManagementMenuItem): Promise<ProductManagementPage> {
    const sidebarPage = new SidebarPage(page);
    await sidebarPage.expectProductManagementVisible();
    await sidebarPage.openSubMenuByPath(menuItem.path);

    const targetPage = createPageByMenuItem(page, menuItem);
    await targetPage.expectLoaded();
    return targetPage;
  }

  @step((_page: Page, menuItem: ProductManagementMenuItem) => `直接打开商品管理页面：${menuItem.pageName}`)
  async openDirect(page: Page, menuItem: ProductManagementMenuItem): Promise<ProductManagementPage> {
    const targetPage = createPageByMenuItem(page, menuItem);
    await targetPage.open();
    return targetPage;
  }
}

export async function openProductManagementPage(
  page: Page,
  menuItem: ProductManagementMenuItem,
  viaSidebar = false,
): Promise<ProductManagementPage> {
  const flow = new ProductManagementFlow();
  return viaSidebar
    ? flow.openViaSidebar(page, menuItem)
    : flow.openDirect(page, menuItem);
}
