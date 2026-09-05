import { test, expect } from '@playwright/test';
import { callOperation } from '../../api/operation-client';

test('商品中心直连接口应使用 token 与品牌上下文鉴权', async ({ request }) => {
  const response = await callOperation(request, 'brand-menu:POST /ops-brand/brand-items/pageQuery', {
    body: { pageNumber: 1, pageSize: 1 },
  });
  const body = await response.json();

  expect(response.status()).toBe(200);
  expect(body).toMatchObject({ code: '0', message: 'success', success: true });
});