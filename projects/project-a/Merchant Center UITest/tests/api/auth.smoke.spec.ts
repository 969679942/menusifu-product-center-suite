import { test, expect } from '@playwright/test';
import { resolveAccessToken } from '../../api/auth-client';

test('测试账号应能获取 API 访问令牌', async ({ request }) => {
  const token = await resolveAccessToken(request);
  expect(token.length).toBeGreaterThan(20);
});
