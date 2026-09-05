import { expect, test } from '@playwright/test';
import {
  classifyBrandMenuResponse,
  observeBrandMenuResponseBody,
  type BrandMenuDocumentedOperation,
} from '../../utils/brand-menu-live-probe';

const operation: BrandMenuDocumentedOperation = {
  operationKey: 'brand-menu:GET /contract-probe',
  method: 'GET',
  path: '/contract-probe',
};

test.describe('品牌接口响应语义合同', () => {
  test('HTTP 成功不得覆盖业务失败', async () => {
    await test.step('解析 HTTP 200 中显式失败的业务响应', async () => {
      const observation = observeBrandMenuResponseBody(JSON.stringify({ success: false, code: 'BITEM-2014', message: '业务拒绝' }));
      expect(observation.businessSuccess).toBe(false);
      expect(classifyBrandMenuResponse(operation, 200, observation)).toBe('business-rejection');
    });

    await test.step('区分成功、参数校验和服务端错误', async () => {
      expect(classifyBrandMenuResponse(operation, 200, observeBrandMenuResponseBody('{"success":true}'))).toBe('success');
      expect(classifyBrandMenuResponse(operation, 400, observeBrandMenuResponseBody('{"success":false}'))).toBe('validation-response');
      expect(classifyBrandMenuResponse(operation, 500, observeBrandMenuResponseBody('error'))).toBe('unexpected-server-error');
    });
  });
});
