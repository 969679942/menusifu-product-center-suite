import { expect, test } from '@playwright/test';
import {
  assertItemNotCreated,
  assertItemRequiredValidationUi,
  readProductTotalCount,
} from '../../utils/product-center-item-required-validation';

test.describe('标准商品名称必填校验合同', () => {
  test('应从真实 pageQuery 响应读取 totalCount', async () => {
    expect(readProductTotalCount({
      code: 200,
      success: true,
      data: { list: [{}], pageNumber: 1, pageSize: 1, totalCount: 123, pageCount: 123 },
    })).toBe(123);
    expect(() => readProductTotalCount({ data: { total: 123 } })).toThrow('totalCount');
  });

  test('UI 断言应同时要求停留创建页、唯一可见必填提示且无成功提示', async () => {
    expect(() => assertItemRequiredValidationUi({
      route: '/pp/brand/create/standard',
      requiredErrorCount: 1,
      successMessageCount: 0,
      mutationCount: 0,
      beforeTotalCount: 123,
      afterTotalCount: 123,
    })).not.toThrow();
    expect(() => assertItemRequiredValidationUi({
      route: '/pp/brand/create/standard',
      requiredErrorCount: 0,
      successMessageCount: 0,
      mutationCount: 0,
      beforeTotalCount: 123,
      afterTotalCount: 123,
    })).toThrow('商品名称必填提示');
  });

  test('未创建断言应要求创建请求为零且 API 总数不变', async () => {
    expect(() => assertItemNotCreated({
      route: '/pp/brand/create/standard',
      requiredErrorCount: 1,
      successMessageCount: 0,
      mutationCount: 0,
      beforeTotalCount: 123,
      afterTotalCount: 123,
    })).not.toThrow();
    expect(() => assertItemNotCreated({
      route: '/pp/brand/create/standard',
      requiredErrorCount: 1,
      successMessageCount: 0,
      mutationCount: 1,
      beforeTotalCount: 123,
      afterTotalCount: 124,
    })).toThrow('创建请求');
  });
});
