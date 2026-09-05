import { expect, test } from '@playwright/test';
import { resolveOperationBaseUrl, resolveOperationRequestMode } from '../../api/operation-client';

test.describe('多服务 operation client 合同', () => {
  test('品牌与行业 operation 必须路由到各自服务地址', () => {
    expect(resolveOperationBaseUrl({ runtimeBaseEnv: 'MC_ITEM_API_BASE_URL' })).toMatch(/\/item\/v1\/?$/);
    expect(resolveOperationBaseUrl({ runtimeBaseEnv: 'MC_PLATFORM_ITEM_API_BASE_URL' })).toMatch(/\/platform-item\/v1\/?$/);
  });

  test('未知服务缺少地址时必须在请求前失败', () => {
    expect(() => resolveOperationBaseUrl({ runtimeBaseEnv: 'MC_UNKNOWN_SERVICE_BASE_URL' }))
      .toThrow('API operation 缺少运行时服务地址：MC_UNKNOWN_SERVICE_BASE_URL');
  });

  test('multipart 接口必须与 JSON 接口使用不同请求模式', async () => {
    await test.step('识别 multipart 和 JSON 请求合同', async () => {
      expect(resolveOperationRequestMode({ requestBody: { content: { 'multipart/form-data': {} } } })).toBe('multipart');
      expect(resolveOperationRequestMode({ requestBody: { content: { 'application/json': {} } } })).toBe('json');
      expect(resolveOperationRequestMode({})).toBe('none');
    });
  });
});
