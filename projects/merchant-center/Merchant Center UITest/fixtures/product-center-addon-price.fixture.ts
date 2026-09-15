import {test as base} from './product-center.fixture';
import {AddonPriceAcceptancePage} from '../pages/product-management/item/addon-price-acceptance.page';
import {AddonPriceAcceptanceFlow} from '../flows/product-center/item-216/addon-price-acceptance.flow';
import {AddonPricePersistence,createAddonPriceOwnershipWriter} from '../api/product-center/addon-price-persistence';
import path from 'node:path';
import {ItemListPage} from '../pages/product-management/item/item-list.page';
import {ProductCenterSidebarNavigationPage} from '../pages/product-center/product-center-sidebar-navigation.page';
export const test=base.extend<{addonPriceFlow:AddonPriceAcceptanceFlow}>({
 addonPriceFlow:async({page,request,productCenterApi,cleanupRegistry},use)=>{const persistence=new AddonPricePersistence(process.env.MC_EPHEMERAL_AUTH==='1'?page.request:request,productCenterApi,cleanupRegistry,createAddonPriceOwnershipWriter(path.resolve(__dirname,'..'),process.env.PC_ITEM_RUN_ID??'',process.env.PC_PROJECT_EXECUTION_INTENT_PATH??''));await use(new AddonPriceAcceptanceFlow(page,new AddonPriceAcceptancePage(page),persistence,new ItemListPage(page),new ProductCenterSidebarNavigationPage(page)));},
});
