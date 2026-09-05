import { createHash } from 'node:crypto';
import path from 'node:path';
import { test as base } from './product-center-api.fixture';
import { CleanupRegistry } from '../api/product-center/cleanup-registry';
import { ProductCenterExecutionLedger } from '../api/product-center/execution-ledger';
import { ProductCenterApi } from '../api/product-center/product-center-api';

type ProductCenterEndpointApiFixtures = {
  productCenterApi: ProductCenterApi;
  executionLedger: ProductCenterExecutionLedger;
  cleanupRegistry: CleanupRegistry;
};

export const test = base.extend<ProductCenterEndpointApiFixtures>({
  productCenterApi: async ({ request, merchantCenterTokenProvider: _merchantCenterTokenProvider }, use) => {
    await use(new ProductCenterApi(request));
  },
  executionLedger: async ({}, use, testInfo) => {
    const fingerprint = createHash('sha256')
      .update(`${testInfo.testId}:${testInfo.retry}:${Date.now()}`)
      .digest('hex')
      .slice(0, 16);
    const ledger = new ProductCenterExecutionLedger({
      rootDir: path.resolve(process.env.PC_CHECKPOINT_ROOT || 'output/checkpoints/api-endpoint'),
      runId: `AUTO_AUDIT_API_${fingerprint}`,
    });
    await use(ledger);
  },
  cleanupRegistry: async ({ executionLedger }, use, testInfo) => {
    const registry = new CleanupRegistry(executionLedger);
    try {
      await use(registry);
    } finally {
      const evidence = await registry.cleanupAll();
      testInfo.annotations.push({
        type: 'API 清理证据',
        description: JSON.stringify(evidence),
      });
    }
  },
});

export { expect } from '@playwright/test';
