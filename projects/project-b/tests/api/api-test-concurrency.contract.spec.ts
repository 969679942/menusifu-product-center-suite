import { expect, test } from '@playwright/test';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { ApiTestResourceRegistry } from '../../api/core/api-test-resource-registry';
import { MerchantCenterTokenProvider } from '../../api/core/merchant-center-token-provider';
import { loadMerchantCenterAccountContext } from '../../api/core/merchant-center-account-context';

test('并发获取令牌时只允许发送一次登录请求', async () => {
  const context = loadMerchantCenterAccountContext({
    MC_USERNAME: 'concurrency-user',
    MC_PASSWORD: 'concurrency-password',
    MC_BRAND_ID: 'brand-test',
  }, {});
  const provider = new MerchantCenterTokenProvider(context);
  let loginCount = 0;
  const request = {
    post: async () => {
      loginCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        ok: () => true,
        status: () => 200,
        json: async () => ({ accessToken: 'concurrent-access-token-value-1234567890' }),
      } as APIResponse;
    },
  } as unknown as APIRequestContext;

  await test.step('并发请求十次访问令牌', async () => {
    const tokens = await Promise.all(Array.from({ length: 10 }, () => provider.getToken(request)));
    expect(new Set(tokens).size).toBe(1);
  });
  await test.step('断言登录请求只执行一次', async () => {
    expect(loginCount).toBe(1);
  });
});

test('同优先级资源应并发清理且高优先级先完成', async () => {
  const registry = new ApiTestResourceRegistry();
  const events: string[] = [];
  let active = 0;
  let maxActive = 0;
  registry.register({
    type: 'parent', id: 1, cleanupPriority: 20,
    cleanup: async () => { events.push('parent'); },
  });
  for (const id of [1, 2]) {
    registry.register({
      type: 'child', id, cleanupPriority: 10,
      cleanup: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
        events.push(`child-${id}`);
      },
    });
  }

  const result = await test.step('按优先级清理全部登记资源', async () => registry.cleanupAll());
  await test.step('断言优先级和同层并发行为', async () => {
    expect(result.errors).toEqual([]);
    expect(events[0]).toBe('parent');
    expect(maxActive).toBe(2);
  });
});
