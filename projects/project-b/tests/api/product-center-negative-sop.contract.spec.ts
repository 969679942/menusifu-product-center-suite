import { expect, test } from '@playwright/test';
import { productCenterNegativeReviewRequired, productCenterNegativeSopCatalog } from '../../sop/product-center/product-center-negative-sop.catalog';

test.describe('商品中心反向 SOP 合同', () => {
  test('仅应生成有运行时或人工确认依据的十二条场景', async () => {
    expect(productCenterNegativeSopCatalog).toHaveLength(12);
    expect(productCenterNegativeSopCatalog.every((item) => item.generationAllowed)).toBe(true);
    expect(productCenterNegativeSopCatalog.filter((item) => item.scenario === 'required')).toHaveLength(3);
    expect(productCenterNegativeSopCatalog.filter((item) => item.scenario === 'max-length')).toHaveLength(6);
  });
  test('标签第二语言边界应携带精确字段来源和值域', async () => {
    const records = productCenterNegativeSopCatalog as unknown as ReadonlyArray<Record<string, unknown>>;
    const boundaries = records.filter((item) => String(item.id).includes('tag-') && item.scenario === 'max-length');

    expect(boundaries.map((item) => item.id)).toEqual([
      'statistic-tag-second-language-max',
      'statistic-tag-group-second-language-max',
      'description-tag-second-language-max',
      'description-tag-group-second-language-max',
    ]);
    expect(boundaries.map((item) => item.boundary)).toEqual([
      { fieldLabel: '标签名称（第二语言）', locatorKey: 'tag-second-language', maxLength: 50, acceptedLength: 50, rejectedLength: 51 },
      { fieldLabel: '标签组名称（第二语言）', locatorKey: 'tag-group-second-language', maxLength: 10, acceptedLength: 10, rejectedLength: 11 },
      { fieldLabel: '标签名称（第二语言）', locatorKey: 'tag-second-language', maxLength: 50, acceptedLength: 50, rejectedLength: 51 },
      { fieldLabel: '标签组名称（第二语言）', locatorKey: 'tag-group-second-language', maxLength: 10, acceptedLength: 10, rejectedLength: 11 },
    ]);
  });
  test('无可靠来源规则应进入评审而非生成断言', async () => {
    expect(productCenterNegativeReviewRequired.map((item) => item.scenario)).toEqual(['duplicate', 'whitespace', 'backend-error']);
  });
});
