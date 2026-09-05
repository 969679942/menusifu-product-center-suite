import { expect, test } from '@playwright/test';
import { generateHighDependencySopCases, highDependencySopCatalog } from '../../sop/product-center/product-center-high-dependency-sop.catalog';

test.describe('商品中心高依赖实体 SOP 合同', () => {
  test('应按真实 UI 能力生成六条适用动作', async () => {
    const cases = generateHighDependencySopCases(highDependencySopCatalog);
    expect(highDependencySopCatalog).toHaveLength(4);
    expect(cases).toHaveLength(6);
    expect(cases.filter((item) => item.action === 'edit')).toHaveLength(3);
    expect(cases.filter((item) => item.action === 'delete')).toHaveLength(3);
    const combo = highDependencySopCatalog.find((item) => item.entityKey === 'combo');
    expect(combo?.actions).toEqual(['delete']);
    expect(combo?.notApplicable).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'edit' })]));
    const printer = highDependencySopCatalog.find((item) => item.entityKey === 'printer');
    expect(printer?.actions).toEqual(['edit']);
    expect(printer?.notApplicable).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'delete' })]));
  });

  test('应声明可逆依赖图', async () => {
    expect(highDependencySopCatalog.find((item) => item.entityKey === 'recipe-ingredient')?.dependencies).toEqual(['material-category-readonly', 'material']);
    expect(highDependencySopCatalog.find((item) => item.entityKey === 'combo')?.dependencies).toEqual(['bom-product', 'sku']);
    expect(highDependencySopCatalog.find((item) => item.entityKey === 'printer')?.dependencies).toEqual(['poi-print-stall-readonly']);
  });
});