import { expect, test } from '@playwright/test';
import { matchesSystemTestRequest } from '../../src/automation/system-test/system-test-request-correlation';

test.describe('系统测试请求关联公共合同', () => {
  test('防止防抖查询把上一输入值的响应误认作当前响应', () => {
    const contract = {
      method: 'GET',
      pathSuffix: '/ops/items/page',
      queryParameter: 'name',
      expectedValue: '',
    };
    expect(matchesSystemTestRequest({
      method: 'GET',
      url: 'https://example.test/ops/items/page?page=1&name=OLD_VALUE',
    }, contract)).toBe(false);
    expect(matchesSystemTestRequest({
      method: 'GET',
      url: 'https://example.test/ops/items/page?page=1',
    }, contract)).toBe(true);
  });

  test('支持通过请求体字段关联输入值且拒绝同路径无关请求', () => {
    const contract = {
      method: 'POST',
      pathSuffix: '/ops/items/page',
      bodyPath: 'filters.name',
      expectedValue: 'TARGET',
    };
    expect(matchesSystemTestRequest({
      method: 'POST',
      url: 'https://example.test/ops/items/page',
      postData: { filters: { name: 'OTHER' } },
    }, contract)).toBe(false);
    expect(matchesSystemTestRequest({
      method: 'POST',
      url: 'https://example.test/ops/items/page',
      postData: { filters: { name: 'TARGET' } },
    }, contract)).toBe(true);
  });
});
