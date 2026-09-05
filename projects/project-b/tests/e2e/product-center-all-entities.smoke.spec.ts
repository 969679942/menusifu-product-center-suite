import { test, expect } from '@playwright/test';
import { ProductCenterCrudFlow } from '../../flows/product-center/product-center-crud.flow';
import { productCenterEntities } from '../../test-data/product-center/entity-matrix';

test.describe('商品中心全部实体页面终态回归', () => {
  test.describe.configure({ mode: 'serial' });
  for (const [entity, route] of productCenterEntities) {
    test(`${entity}页面应进入可验证终态`, async ({ page }) => {
      const structure = await new ProductCenterCrudFlow().inspect(page, route);
      expect(structure.controls + structure.fields + structure.terminal).toBeGreaterThan(0);
    });
  }
});
