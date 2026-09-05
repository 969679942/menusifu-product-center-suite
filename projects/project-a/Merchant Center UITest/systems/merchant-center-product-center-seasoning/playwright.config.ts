import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { appConfig } from '../../test-data/env';
import { resolveSeasoningContext } from '../../test-data/seasoning-context';
import { resolveMerchantCenterPlaywrightConcurrency } from '../../adapters/test-automation-platform/playwright-concurrency';
import { configureMerchantCenterAuditStepEnvironment } from '../../adapters/test-automation-platform/audit-step-reporting';

configureMerchantCenterAuditStepEnvironment();

function resolveChromeExecutablePath(): string | undefined {
  return [
    process.env.PC_CHROME_EXECUTABLE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].filter((value): value is string => Boolean(value)).find((candidate) => fs.existsSync(candidate));
}

const executablePath = resolveChromeExecutablePath();
const seasoningContext = resolveSeasoningContext();
process.env.MC_BRAND_ID ??= seasoningContext.brandId;
if (seasoningContext.profile === 'multi-store-000420') process.env.MC_POI_ID ??= 'M000023918';
if (seasoningContext.profile === 'multi-store-000420') {
  process.env.MC_EXPECTED_POI_ID ??= seasoningContext.poiId;
  process.env.MC_EXPECTED_POI_NAME ??= seasoningContext.poiName;
}
const storageStatePath = process.env.MC_STORAGE_STATE_PATH || seasoningContext.storageStatePath;
const concurrency = resolveMerchantCenterPlaywrightConcurrency({
  maxWorkers: 2,
  requestedWorkers: Number(process.env.SYSTEM_TEST_EFFECTIVE_WORKERS || process.env.SYSTEM_TEST_WORKERS || 2),
  selectedCaseCount: 82,
});

export default defineConfig({
  testDir: './tests',
  outputDir: process.env.SYSTEM_TEST_PLAYWRIGHT_OUTPUT_DIR || './test-results',
  reporter: [[require.resolve('../../reporters/system-test-audit-step.reporter')]],
  timeout: 240_000,
  expect: { timeout: 10_000 },
  retries: 0,
  fullyParallel: true,
  workers: concurrency.effectiveWorkers,
  use: {
    baseURL: process.env.SYSTEM_TEST_BASE_URL || appConfig.baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: 'setup', testMatch: /setup\.spec\.ts/ },
    {
      name: 'audit',
      testMatch: /audit\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: storageStatePath },
    },
    { name: 'recovery', testMatch: /recovery\.spec\.ts/ },
    {
      name: 'system',
      testIgnore: /(?:setup|audit|recovery)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: storageStatePath },
    },
  ],
});
