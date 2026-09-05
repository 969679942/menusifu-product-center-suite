import { test as base } from './product-center-api.fixture';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ProductCenterApi } from '../api/product-center/product-center-api';
import { CleanupRegistry } from '../api/product-center/cleanup-registry';
import { ProductCenterExecutionLedger } from '../api/product-center/execution-ledger';
import { establishMerchantCenterSession } from '../flows/auth.flow';
import { ItemListFlow } from '../flows/item-list.flow';
import { AddonItem216Flow } from '../flows/product-center/item-216/addon-item-216.flow';
import { PackageItem216Flow } from '../flows/product-center/item-216/package-item-216.flow';
import { StandardItem216Flow } from '../flows/product-center/item-216/standard-item-216.flow';
import { StandardItem216CaseRunner } from '../flows/product-center/item-216/standard-item-216.runner';
import { resolveAuthCredentials } from '../test-data/auth';
import { clearExecutableOperationReceipts } from '../utils/executable-operation-receipt';
import { writeProductCenterGroupProgress } from '../utils/product-center-group-progress';
import { assertSystemTestExecutionGrant } from '../automation/system-test/system-test-execution-grant';

type ProductCenterFixtures = {
  executableOperationTrace: void;
  merchantContext: void;
  productCenterApi: ProductCenterApi;
  executionLedger: ProductCenterExecutionLedger;
  cleanupRegistry: CleanupRegistry;
  standardItem216Flow: StandardItem216Flow;
  standardItem216CaseRunner: StandardItem216CaseRunner;
  packageItem216Flow: PackageItem216Flow;
  addonItem216Flow: AddonItem216Flow;
  itemListFlow: ItemListFlow;
};

export const test = base.extend<ProductCenterFixtures>({
  executableOperationTrace: [async ({}, use, testInfo) => {
    clearExecutableOperationReceipts(testInfo.testId);
    try {
      await use();
    } finally {
      clearExecutableOperationReceipts(testInfo.testId);
    }
  }, { auto: true }],
  merchantContext: [async ({ page, executableOperationTrace: _executableOperationTrace }, use, testInfo) => {
    const governedCaseId = testInfo.annotations.find((item) => (
      item.type === 'canonical-case-id' || item.type === 'group-case-id'
    ))?.description;
    if (governedCaseId) {
      assertSystemTestExecutionGrant({
        rootDir: path.resolve(__dirname, '..'),
        applicationId: 'merchant-center-product-center',
        caseId: governedCaseId,
      });
    }
    if (process.env.PC_BATCH_AUTH_VERIFIED === '1') {
      await use();
      return;
    }
    const auth = resolveAuthCredentials();
    if (!auth.username || !auth.password || !auth.merchant) {
      throw new Error('商品中心测试缺少用户名、密码或商户上下文。');
    }
    const progressRunId = process.env.PC_GROUP_RUN_ID;
    const caseId = testInfo.annotations.find((item) => item.type === 'group-case-id')?.description;
    await establishMerchantCenterSession(page, auth, {
      expectedPoiId: process.env.MC_EXPECTED_POI_ID,
      expectedPoiName: process.env.MC_EXPECTED_POI_NAME,
      onNavigationRetry: () => {
        if (progressRunId && caseId) {
          writeProductCenterGroupProgress({ runId: progressRunId, caseId, phase: 'auth-retrying' });
        }
      },
    });
    await use();
  }, { auto: true }],
  productCenterApi: async ({
    request,
    page,
    merchantContext: _merchantContext,
    merchantCenterTokenProvider: _merchantCenterTokenProvider,
  }, use) => {
    if (process.env.MC_EPHEMERAL_AUTH === '1') {
      await use(new ProductCenterApi(page.request));
      return;
    }
    await use(new ProductCenterApi(request));
  },
  executionLedger: async ({}, use, testInfo) => {
    const fingerprint = createHash('sha256')
      .update(`${testInfo.testId}:${testInfo.retry}:${Date.now()}`)
      .digest('hex')
      .slice(0, 16);
    const orchestratedRunId = process.env.PC_RECIPE_RUN_ID;
    const caseId = testInfo.annotations.find((item) => item.type === 'recipe-case-id')?.description;
    const deterministicAuditRun = process.env.PC_RESUMABLE_AUDIT === '1';
    const ledger = new ProductCenterExecutionLedger({
      rootDir: path.resolve(process.env.PC_CHECKPOINT_ROOT || 'output/checkpoints'),
      runId: orchestratedRunId && caseId
        ? `${orchestratedRunId}_${caseId.replace(/[^a-zA-Z0-9_-]/g, '_')}${deterministicAuditRun ? '' : `_${fingerprint}`}`
        : `AUTO_AUDIT_RUN_${fingerprint}`,
    });
    await use(ledger);
  },
  cleanupRegistry: async ({ executionLedger }, use) => {
    const registry = new CleanupRegistry(executionLedger);
    try {
      await use(registry);
    } finally {
      await registry.cleanupAll();
    }
  },
  standardItem216Flow: async ({ page, productCenterApi, cleanupRegistry }, use) => {
    await use(new StandardItem216Flow(page, productCenterApi, cleanupRegistry));
  },
  standardItem216CaseRunner: async ({ standardItem216Flow }, use) => {
    await use(new StandardItem216CaseRunner(standardItem216Flow));
  },
  packageItem216Flow: async ({ page, productCenterApi, cleanupRegistry, executionLedger }, use) => {
    await use(new PackageItem216Flow(page, { api: productCenterApi, cleanupRegistry, executionLedger }));
  },
  addonItem216Flow: async ({ page, productCenterApi, cleanupRegistry }, use) => {
    await use(new AddonItem216Flow(page, productCenterApi, cleanupRegistry));
  },
  itemListFlow: async ({}, use) => {
    await use(new ItemListFlow());
  },
});
export { expect } from './product-center-api.fixture';
