import { test as base } from './product-center.fixture';
import { StandardListAcceptancePage } from '../pages/product-management/item/standard-list-acceptance.page';
import { StandardListAcceptanceFlow } from '../flows/product-center/item-216/standard-list-acceptance.flow';

export const test = base.extend<{standardListAcceptanceFlow:StandardListAcceptanceFlow}>({
  standardListAcceptanceFlow:async({page},use)=>{await use(new StandardListAcceptanceFlow(new StandardListAcceptancePage(page)));},
});
