import { expect, test } from '@playwright/test';
import { buildProductCenterCapabilityMatch } from '../../scripts/build-product-center-capability-match';

test.describe('商品中心环境能力匹配合同', () => {
  test('逐条输出能力声明与当前注册能力的匹配结果', () => {
    const result = buildProductCenterCapabilityMatch({ write: false });
    expect(result.report.applicationId).toBe('merchant-center');
    expect(result.report.environmentId).toBeTruthy();
    expect(result.report.cases.length).toBe(result.report.summary.total);
    expect(result.report.cases.every((item) => item.caseId && item.status)).toBe(true);
    expect(result.report.summary.matched).toBeGreaterThan(0);
    expect(result.report.summary.missingDeclaration + result.report.summary.missingEnvironment)
      .toBeGreaterThan(0);
  });
});
