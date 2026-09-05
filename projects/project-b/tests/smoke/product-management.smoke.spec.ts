import { test } from '../../fixtures/test.fixture';
import { ItemListFlow } from '../../flows/item-list.flow';
import { openProductManagementPage } from '../../flows/product-management.flow';
import { PRODUCT_MANAGEMENT_MENU } from '../../test-data/product-management';

test.describe('商品管理模块冒烟', () => {
  for (const menuItem of PRODUCT_MANAGEMENT_MENU) {
    test(
      `应能打开${menuItem.pageName}页面并显示关键操作区`,
      {
        tag: ['@smoke', '@product-management'],
      },
      async ({ page }) => {
        await openProductManagementPage(page, menuItem);
      },
    );
  }
});

test.describe('商品管理侧边栏导航冒烟', () => {
  for (const menuItem of PRODUCT_MANAGEMENT_MENU) {
    test(
      `应能通过侧边栏进入${menuItem.pageName}页面`,
      {
        tag: ['@smoke', '@product-management', '@navigation'],
      },
      async ({ page }) => {
        const listFlow = new ItemListFlow();
        await listFlow.openList(page);
        await openProductManagementPage(page, menuItem, true);
      },
    );
  }
});
