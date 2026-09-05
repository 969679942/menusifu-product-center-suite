import { expect, test } from '@playwright/test';
import { productCenterSopCatalog } from '../../sop/product-center/product-center-sop.catalog';
import { productCenterCreateSopCatalog } from '../../sop/product-center/product-center-create-sop.catalog';
import { highDependencySopCatalog } from '../../sop/product-center/product-center-high-dependency-sop.catalog';
import { lowDependencySopCatalog } from '../../sop/product-center/product-center-low-dependency-sop.catalog';
import { productCenterNegativeSopCatalog } from '../../sop/product-center/product-center-negative-sop.catalog';
import {
  generateProductCenterProductionSopCases,
  generateProductCenterSopCases,
} from '../../sop/product-center/product-center-sop-generator';

test.describe('商品中心混合式 SOP 合同', () => {
  test('五个核心实体应生成编辑和删除正反向 SOP', async () => {
    const cases = generateProductCenterSopCases(productCenterSopCatalog);

    expect(cases).toHaveLength(10);
    expect(new Set(cases.map((item) => item.entityKey))).toEqual(
      new Set(['category', 'method', 'material', 'seasoning', 'bom']),
    );

    for (const item of cases) {
      expect(['edit', 'delete']).toContain(item.action);
      expect(item.testIdentityPrefix).toMatch(/^AUTO_AUDIT_/);
      expect(item.forwardSteps).toEqual([
        'API 创建唯一审计数据并记录服务端 ID',
        'UI 打开实体页面并等待业务列表终态',
        item.action === 'edit'
          ? 'UI 精确定位唯一记录并完成编辑'
          : 'UI 精确定位唯一记录并完成删除确认',
        'API 验证服务端终态',
      ]);
      expect(item.reverseSteps).toEqual([
        'fixture finally 按依赖逆序执行 API 清理',
        '验证原始身份不存在',
        '验证编辑身份不存在',
        '验证依赖身份不存在',
      ]);
    }
  });

  test('非创建动作必须声明 API 前置和 API 后置清理', async () => {
    const cases = generateProductCenterSopCases(productCenterSopCatalog);

    for (const item of cases) {
      expect(item.seedMode).toBe('api');
      expect(item.cleanupMode).toBe('api-finally');
      expect(item.uiCreatesData).toBe(false);
      expect(item.verifyServerState).toBe(true);
      expect(item.verifyZeroResidue).toBe(true);
    }
  });
  test('生产生成器应输出四十六条可独立执行的描述符', async () => {
    const cases = generateProductCenterProductionSopCases({
      core: productCenterSopCatalog,
      create: productCenterCreateSopCatalog,
      lowDependency: lowDependencySopCatalog,
      highDependency: highDependencySopCatalog,
      negative: productCenterNegativeSopCatalog,
    });

    expect(cases).toHaveLength(46);
    expect(cases.filter((item) => item.action === 'create')).toHaveLength(5);
    expect(cases.filter((item) => item.action === 'edit')).toHaveLength(13);
    expect(cases.filter((item) => item.action === 'delete')).toHaveLength(16);
    expect(cases.filter((item) => item.action === 'negative')).toHaveLength(12);
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);

    for (const item of cases) {
      expect(item.route).toMatch(/^\//);
      expect(item.testTitle.length).toBeGreaterThan(0);
      expect(item.rerunGrep).toBe(item.testTitle);
    }

    const boundary = cases.find((item) => item.id === 'negative:statistic-tag-second-language-max');
    expect(boundary).toMatchObject({
      verifyModes: ['ui'], cleanupMode: 'none', seedMode: 'none',
      sourceIds: ['/pp/brand/tag/statistic#action-1#primary-1#field-35'],
    });

    expect(cases.find((item) => item.id === 'negative:category-child-blocked-by-product'))
      .toMatchObject({
        seedMode: 'api',
        cleanupMode: 'api-finally',
        verifyModes: ['api', 'ui'],
        sourceIds: ['rule:category-child-blocked-by-product'],
      });
  });
});
