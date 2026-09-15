import {test as base} from './product-center.fixture';
import {ItemCreateFlow} from '../flows/item-create.flow';
import {StandardListAcceptancePage} from '../pages/product-management/item/standard-list-acceptance.page';
import {StandardWeightUnitsAcceptanceFlow} from '../flows/product-center/item-216/standard-weight-units-acceptance.flow';
export const test=base.extend<{standardWeightUnitsAcceptanceFlow:StandardWeightUnitsAcceptanceFlow}>({
  standardWeightUnitsAcceptanceFlow:async({page},use)=>{await use(new StandardWeightUnitsAcceptanceFlow(page,new ItemCreateFlow(),new StandardListAcceptancePage(page)));},
});
