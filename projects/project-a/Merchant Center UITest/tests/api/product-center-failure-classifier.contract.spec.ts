import { expect, test } from '@playwright/test';
import { classifyProductCenterExecutionDiagnostic } from '../../scripts/build-product-center-execution-repair-queue';
import { classifyProductCenterFailure } from '../../utils/product-center-failure-classifier';

test.describe('商品中心失败自动分类', () => {
  test('应区分平台瞬态环境定位器产品和清理失败', async () => {
    expect(classifyProductCenterFailure({ message: 'exceeded retry limit: 429 Too Many Requests' }).category)
      .toBe('transient-platform');
    expect(classifyProductCenterFailure({ statusCode: 403, message: 'Forbidden' }).category)
      .toBe('environment-auth');
    expect(classifyProductCenterFailure({ message: 'strict mode violation: locator resolved to 2 elements' }).category)
      .toBe('locator-drift');
    expect(classifyProductCenterFailure({ message: 'cleanup residue remains for AUTO_AUDIT_CATEGORY' }).category)
      .toBe('cleanup-residue');
    expect(classifyProductCenterFailure({ assertion: true, message: 'expected enabled but received disabled' }).category)
      .toBe('unknown');
    expect(classifyProductCenterFailure({ message: 'PRODUCT_BEHAVIOR TC-ITEM-ADD-010: invalid price was normalized' }).category)
      .toBe('unknown');
    expect(classifyProductCenterFailure({
      message: '稳定 UI/API 终态均与预期不符',
      evidenceComplete: true,
      productMismatchConfirmed: true,
      executionPathEquivalent: true,
    }).category)
      .toBe('product-behavior');
    expect(classifyProductCenterFailure({ message: '商品中心环境页面异常：Server Error' }).category)
      .toBe('environment-data');
  });

  test('分类结果不得回显凭据', async () => {
    const result = classifyProductCenterFailure({
      statusCode: 401,
      message: 'token=secret-token password=secret-password cookie=session-value',
    });
    expect(JSON.stringify(result)).not.toContain('secret-token');
    expect(JSON.stringify(result)).not.toContain('secret-password');
    expect(JSON.stringify(result)).not.toContain('session-value');
  });

  test('定位器唯一性错误即使包含 timeout 也不得按 transient 重试', async () => {
    const result = classifyProductCenterFailure({
      message: 'Timeout 60000ms exceeded while waiting for locator; strict mode violation: resolved to 2 elements',
    });
    expect(result).toMatchObject({ category: 'locator-drift', retryable: false });
    expect(classifyProductCenterFailure({
      message: 'locator uniqueness check failed: count=2',
    })).toMatchObject({ category: 'locator-drift', retryable: false });
  });

  test('执行修复队列不得把控件等待超时归为平台瞬态失败', async () => {
    expect(classifyProductCenterExecutionDiagnostic(
      'ProductCenterAuthFlowError: permissions-loading；页面显示 403 无权限',
    )).toBe('environment-failure');
    expect(classifyProductCenterExecutionDiagnostic(
      'TimeoutError: 等待商户中心中文界面就绪超时',
    )).toBe('environment-failure');
    expect(classifyProductCenterExecutionDiagnostic(
      'WaitUntilError: [WAIT_UNTIL_CONDITION_TIMEOUT] Add Custom Combo 菜单项未稳定进入视口 count=0',
    )).toBe('ui-contract-drift');
    expect(classifyProductCenterExecutionDiagnostic(
      'TimeoutError: page.goto: Timeout 30000ms exceeded.',
    )).toBe('transient-platform');
    expect(classifyProductCenterExecutionDiagnostic(
      'Error: PRODUCT_BEHAVIOR_CONFIRMED 产品行为证据完整：当前页面将非法价格保存为 0.00',
    )).toBe('product-behavior');
    expect(classifyProductCenterExecutionDiagnostic(
      'Error: PRODUCT_BEHAVIOR 第一张图片上传后自动化未定位到预览卡片',
    )).toBe('ui-contract-drift');
    expect(classifyProductCenterExecutionDiagnostic(
      '上传 operation 完成后未找到唯一品牌图片',
    )).toBe('data-factory');
  });
});
