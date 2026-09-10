import {test as base} from './product-center.fixture';
import {ItemListPage} from '../pages/product-management/item/item-list.page';
import {ItemCreateSidePage} from '../pages/product-management/item/item-create-side.page';
import {ProductCenterSidebarNavigationPage} from '../pages/product-center/product-center-sidebar-navigation.page';
import {AddonOtherSettingsPage} from '../pages/product-management/item/addon-other-settings.page';
import {AddonOtherSettingsFlow} from '../flows/product-center/item-216/addon-other-settings.flow';
export const test=base.extend<{addonOtherSettingsFlow:AddonOtherSettingsFlow}>({
  addonOtherSettingsFlow:async({page},use)=>{const list=new ItemListPage(page);await use(new AddonOtherSettingsFlow(page,new AddonOtherSettingsPage(page),async()=>{await new ProductCenterSidebarNavigationPage(page).openFromSidebar('/pp/brand/list');await new ItemCreateSidePage(page).open();return {route:new URL(page.url()).pathname};},async()=>{await list.open();await list.expectLoaded();}));},
});
