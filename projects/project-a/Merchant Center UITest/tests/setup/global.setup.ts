import type { FullConfig } from '@playwright/test';
import path from 'node:path';
import { appConfig } from '../../test-data/env';
import { configureProductCenterAuditRuntime } from '../../utils/product-center-audit-runtime';
import { resolveMerchantCenterContractRunIsolation } from '../../adapters/test-automation-platform/contract-run-isolation';

function validateUrl(url: string): void {
  try {
    new URL(url);
  } catch (error) {
    throw new Error(`Invalid PLAYWRIGHT_BASE_URL: ${url}`, { cause: error });
  }
}

async function globalSetup(_config: FullConfig): Promise<void> {
  if (resolveMerchantCenterContractRunIsolation().isolated) return;
  process.env.PW_RUN_STARTED_AT = String(Date.now());
  validateUrl(appConfig.baseURL);
  process.env.TEST_WAIT_TELEMETRY_PATH = path.resolve('output/performance', `product-center-waits-${process.env.PW_RUN_STARTED_AT}-{pid}.jsonl`);
  configureProductCenterAuditRuntime();
}

export default globalSetup;
