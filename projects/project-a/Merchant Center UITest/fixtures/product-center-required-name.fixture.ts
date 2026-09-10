import {test as base} from './product-center.fixture';
import {ItemListPage} from '../pages/product-management/item/item-list.page';
import {StandardListAcceptancePage} from '../pages/product-management/item/standard-list-acceptance.page';
import {StandardRequiredNamePage} from '../pages/product-management/item/standard-required-name.page';
import {StandardRequiredNameFlow} from '../flows/product-center/item-216/standard-required-name.flow';
import {RequiredNamePersistence} from '../api/product-center/required-name-persistence';
import {ProductCenterSidebarNavigationPage} from '../pages/product-center/product-center-sidebar-navigation.page';
export const test=base.extend<{standardRequiredNameFlow:StandardRequiredNameFlow}>({
  standardRequiredNameFlow:async({page,request,productCenterApi:_authenticatedApi},use)=>{
    const list=new ItemListPage(page),navigation=new ProductCenterSidebarNavigationPage(page);
    await use(new StandardRequiredNameFlow(page,list,new StandardListAcceptancePage(page),new StandardRequiredNamePage(page),new RequiredNamePersistence(process.env.MC_EPHEMERAL_AUTH==='1'?page.request:request),async()=>{await navigation.openFromSidebar('/pp/brand/list');await list.expectLoaded();}));
  },
});
