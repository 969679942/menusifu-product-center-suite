import {test as base} from './product-center.fixture';
import {ItemListPage} from '../pages/product-management/item/item-list.page';
import {ItemCreateFlow} from '../flows/item-create.flow';
import {ProductCenterSidebarNavigationPage} from '../pages/product-center/product-center-sidebar-navigation.page';
import {StandardCreateControlsPage} from '../pages/product-management/item/standard-create-controls.page';
import {StandardCreateControlsFlow} from '../flows/product-center/item-216/standard-create-controls.flow';
import {verifyAdvancedSettingsSourceNameAvailable} from '../api/product-center/advanced-settings-preconditions';
import {buildCreateControlsSourceName} from '../test-data/product-center/create-controls';
export const test=base.extend<{standardCreateControlsFlow:StandardCreateControlsFlow}>({
  standardCreateControlsFlow:async({page,request,productCenterApi:_authenticatedApi},use)=>{
    const list=new ItemListPage(page),navigation=new ProductCenterSidebarNavigationPage(page),create=new ItemCreateFlow();
    const prepare=async(caseId:string)=>{await navigation.openFromSidebar('/pp/brand/list');await list.expectLoaded();const name=buildCreateControlsSourceName(caseId,Date.now()),uniqueName=name?await verifyAdvancedSettingsSourceNameAvailable(process.env.MC_EPHEMERAL_AUTH==='1'?page.request:request,name):undefined;await create.openStandardCreateFromCurrentList(page);return {uniqueName,route:new URL(page.url()).pathname};};
    await use(new StandardCreateControlsFlow(page,new StandardCreateControlsPage(page),prepare,async()=>{await list.open();await list.expectLoaded();}));
  },
});
