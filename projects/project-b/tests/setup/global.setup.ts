import type { FullConfig } from '@playwright/test';
import path from 'node:path';
import { appConfig } from '../../test-data/env';
import { configureProductCenterAuditRuntime } from '../../utils/product-center-audit-runtime';

function validateUrl(url: string): void {
  try {
    new URL(url);
  } catch (error) {
    throw new Error(`Invalid PLAYWRIGHT_BASE_URL: ${url}`, { cause: error });
  }
}

async function globalSetup(_config: FullConfig): Promise<void> {
  process.env.PW_RUN_STARTED_AT = String(Date.now());
  validateUrl(appConfig.baseURL);
  // API/合同测试必须使用自己的隔离日志，不能污染业务运行历史。
  const requestedProjects = process.argv.flatMap((value, index) => {
    if (value === '--project' || value === '-p') return process.argv[index + 1]?.split(',') ?? [];
    if (value.startsWith('--project=')) return value.slice('--project='.length).split(',');
    return [];
  });
  const apiOnly = requestedProjects.length > 0 && requestedProjects.every((project) => project === 'api');
  if (!apiOnly) {
    process.env.TEST_WAIT_TELEMETRY_PATH = path.resolve('output/performance', `product-center-waits-${process.env.PW_RUN_STARTED_AT}-{pid}.jsonl`);
    configureProductCenterAuditRuntime();
  }
}

export default globalSetup;
