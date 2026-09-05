import { test as base } from '@playwright/test';
import {
  assertMerchantCenterAccountContext,
  loadMerchantCenterAccountContext,
  type MerchantCenterAccountContext,
  type MerchantCenterAccountEvidence,
} from '../api/core/merchant-center-account-context';
import { MerchantCenterTokenProvider } from '../api/core/merchant-center-token-provider';
import {
  ApiTestResourceRegistry,
  assertApiTestCleanupSucceeded,
} from '../api/core/api-test-resource-registry';
import { configureMerchantCenterTokenProvider } from '../api/auth-client';

type ProductCenterApiTestFixtures = {
  apiTestResourceRegistry: ApiTestResourceRegistry;
  merchantCenterAuthEvidence: MerchantCenterAccountEvidence;
};

type ProductCenterApiWorkerFixtures = {
  merchantCenterAccount: MerchantCenterAccountContext;
  merchantCenterTokenProvider: MerchantCenterTokenProvider;
};

export const test = base.extend<ProductCenterApiTestFixtures, ProductCenterApiWorkerFixtures>({
  apiTestResourceRegistry: async ({}, use) => {
    const registry = new ApiTestResourceRegistry();
    try {
      await use(registry);
    } finally {
      assertApiTestCleanupSucceeded(await registry.cleanupAll());
    }
  },
  merchantCenterAccount: [async ({}, use) => {
    const account = loadMerchantCenterAccountContext();
    assertMerchantCenterAccountContext(account);
    await use(account);
  }, { scope: 'worker' }],
  merchantCenterTokenProvider: [async ({ merchantCenterAccount }, use) => {
    const provider = new MerchantCenterTokenProvider(merchantCenterAccount);
    configureMerchantCenterTokenProvider(provider);
    try {
      await use(provider);
    } finally {
      provider.reset();
      configureMerchantCenterTokenProvider(undefined);
    }
  }, { scope: 'worker' }],
  merchantCenterAuthEvidence: async ({ request, merchantCenterTokenProvider }, use, testInfo) => {
    await merchantCenterTokenProvider.getToken(request);
    const evidence = merchantCenterTokenProvider.evidence();
    testInfo.annotations.push({
      type: '认证上下文',
      description: JSON.stringify({
        environment: evidence.environment,
        brandId: evidence.brandId,
        poiId: evidence.poiId,
        credentialSource: evidence.credentialSource,
        authenticatedAt: evidence.authenticatedAt,
        tokenFingerprint: evidence.tokenFingerprint,
      }),
    });
    await use(evidence);
  },
});

export { expect } from '@playwright/test';
