import { test, expect } from '@playwright/test';
import { lowDependencySopCatalog, generateLowDependencySopCases } from '../../sop/product-center/product-center-low-dependency-sop.catalog';

test.describe('商品中心低依赖实体 SOP 合同', () => {
  test('应按真实 API 能力生成十三条适用动作', async () => {
    const cases = generateLowDependencySopCases(lowDependencySopCatalog);
    expect(lowDependencySopCatalog).toHaveLength(8);
    expect(cases).toHaveLength(13);
    expect(cases.filter((item) => item.action === 'edit')).toHaveLength(5);
    expect(cases.filter((item) => item.action === 'delete')).toHaveLength(8);
  });

  test('无更新接口实体应明确标记编辑不适用', async () => {
    for (const key of ['print-stall', 'description-tag', 'statistic-tag']) {
      const definition = lowDependencySopCatalog.find((item) => item.entityKey === key);
      expect(definition?.actions).toEqual(['delete']);
      expect(definition?.notApplicable).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: 'edit' }),
      ]));
    }
  });
});
