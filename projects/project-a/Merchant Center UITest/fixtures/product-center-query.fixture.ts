import {test as base} from './product-center.fixture';
import {StandardQueryReturnPage} from '../pages/product-management/item/standard-query-return.page';
import {StandardQueryReturnFlow} from '../flows/product-center/item-216/standard-query-return.flow';

export const test=base.extend<{standardQueryReturnFlow:StandardQueryReturnFlow}>({
  standardQueryReturnFlow:async({page},use)=>{await use(new StandardQueryReturnFlow(new StandardQueryReturnPage(page)));},
});
