import {test as base} from './product-center.fixture';
import {ItemListPage} from '../pages/product-management/item/item-list.page';
import {ItemCreateFlow} from '../flows/item-create.flow';
import {ProductCenterSidebarNavigationPage} from '../pages/product-center/product-center-sidebar-navigation.page';
import {StandardAdvancedSettingsPage} from '../pages/product-management/item/standard-advanced-settings.page';
import {StandardAdvancedSettingsFlow} from '../flows/product-center/item-216/standard-advanced-settings.flow';
import {verifyAdvancedSettingsSourceNameAvailable} from '../api/product-center/advanced-settings-preconditions';
import {buildAdvancedSettingsSourceName} from '../test-data/product-center/advanced-settings';
export const test=base.extend<{standardAdvancedSettingsFlow:StandardAdvancedSettingsFlow}>({
  standardAdvancedSettingsFlow:async({page,request,productCenterApi:_authenticatedApi},use)=>{
    const list=new ItemListPage(page),navigation=new ProductCenterSidebarNavigationPage(page),create=new ItemCreateFlow();
    const prepare=async(caseId:string)=>{await navigation.openFromSidebar('/pp/brand/list');await list.expectLoaded();const uniqueName=caseId==='TC-ITEM-STD-041'?await verifyAdvancedSettingsSourceNameAvailable(process.env.MC_EPHEMERAL_AUTH==='1'?page.request:request,buildAdvancedSettingsSourceName(Date.now())):undefined;await create.openStandardCreateFromCurrentList(page);return {uniqueName,route:new URL(page.url()).pathname};};
    await use(new StandardAdvancedSettingsFlow(page,new StandardAdvancedSettingsPage(page),prepare,async()=>{await list.open();await list.expectLoaded();}));
  },
});
