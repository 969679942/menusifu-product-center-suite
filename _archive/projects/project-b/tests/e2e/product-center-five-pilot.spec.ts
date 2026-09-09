import { test, expect } from '@playwright/test';
import { ProductCenterCrudFlow } from '../../flows/product-center/product-center-crud.flow';
import { fivePilotEntities } from '../../test-data/product-center/entity-matrix';

test.describe('商品中心五实体 UI/API 联合冒烟', () => {
  for (const target of fivePilotEntities) {
    test(`${target.entity}页面应加载并收到业务接口响应`, async ({ page }) => {
      const responsePromise = page.waitForResponse(response => target.response.test(response.url()) && response.status() === 200, { timeout: 60_000 });
      const flow = new ProductCenterCrudFlow();
      const structurePromise = flow.inspect(page, target.route);
      const [response, structure] = await Promise.all([responsePromise, structurePromise]);
      expect(response.status()).toBe(200);
      expect(structure.controls + structure.fields + structure.terminal).toBeGreaterThan(0);
    });
  }
});
