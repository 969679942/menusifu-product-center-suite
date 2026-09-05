import { test, expect } from '@playwright/test';
import { productCenterCreateSopCatalog } from '../../sop/product-center/product-center-create-sop.catalog';

test.describe('商品中心五实体 UI 创建 SOP 合同', () => {
  test('应声明五个由 UI 创建的核心实体', async () => {
    expect(productCenterCreateSopCatalog).toHaveLength(5);
    expect(productCenterCreateSopCatalog.map((item) => item.entityKey)).toEqual([
      'category', 'method', 'material', 'seasoning', 'bom',
    ]);
    for (const item of productCenterCreateSopCatalog) {
      expect(item.createMode).toBe('ui');
      expect(item.verifyModes).toEqual(['api', 'ui']);
      expect(item.cleanupMode).toBe('api-finally');
      expect(item.testIdentityPrefix).toMatch(/^AUTO_AUDIT_/);
    }
  });

  test('配方单创建应声明 API 依赖而其他实体不得伪造主实体', async () => {
    const bom = productCenterCreateSopCatalog.find((item) => item.entityKey === 'bom');
    expect(bom?.apiDependencies).toEqual(['bom-product', 'material', 'recipe-ingredient']);
    for (const item of productCenterCreateSopCatalog.filter((candidate) => candidate.entityKey !== 'bom')) {
      expect(item.apiDependencies).not.toContain(item.entityKey);
    }
  });
});
