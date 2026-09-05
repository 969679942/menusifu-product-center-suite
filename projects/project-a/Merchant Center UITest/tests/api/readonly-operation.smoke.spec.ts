import { test, expect } from '@playwright/test';
import { callOperation } from '../../api/operation-client';

test('应能通过 operationKey 调用只读健康接口', async ({ request }) => {
  const response = await callOperation(request, 'brand-menu:GET /health');
  expect(response.status()).toBeLessThan(500);
});
