import type { Page } from '@playwright/test';
import { ProductCenterCrudPage } from '../../pages/product-center/product-center-crud.page';
import { step } from '../../utils/step';

export class ProductCenterCrudFlow {
  @step('打开业务页并获取页面结构')
  async inspect(page: Page, route: string): Promise<{ controls: number; fields: number; terminal: number }> {
    const target = new ProductCenterCrudPage(page, route);
    await target.open();
    return { controls: await target.readActionableControlCount(), fields: await target.readVisibleFieldCount(), terminal: await target.main.locator('table:visible,.ant-empty:visible,.ant-result:visible').count() };
  }
}
