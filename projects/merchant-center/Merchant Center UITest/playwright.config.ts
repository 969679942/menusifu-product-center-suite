import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import { appConfig } from './test-data/env';
import { createMerchantCenterAllurePlaywrightV3Options } from './adapters/test-automation-platform/allure-reporting';
import { resolveMerchantCenterPlaywrightConcurrency } from './adapters/test-automation-platform/playwright-concurrency';
import { configureMerchantCenterAuditStepEnvironment } from './adapters/test-automation-platform/audit-step-reporting';

configureMerchantCenterAuditStepEnvironment();

function resolveChromeExecutablePath(): string | undefined {
  const candidates = [
    process.env.PC_CHROME_EXECUTABLE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].filter((value): value is string => Boolean(value));
  return candidates.find((candidate) => fs.existsSync(candidate));
}

const chromeExecutablePath = resolveChromeExecutablePath();
const productCenterLeanReporting = process.env.PC_ITEM_LEAN_REPORTING === '1';
const sourceGovernedReporting = Boolean(process.env.PC_SOURCE_GOVERNED_ALLURE_DIR);
const sourceGovernedJsonReporter = sourceGovernedReporting ? [['json'] as const] : [];
const localConcurrency = resolveMerchantCenterPlaywrightConcurrency({
  maxWorkers: 3,
  requestedWorkers: Number(process.env.PW_WORKERS || 3),
});

export default defineConfig({
  testDir: './tests',
  outputDir: process.env.PC_PLAYWRIGHT_OUTPUT_DIR ?? 'test-results',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // 非幂等 UI 恢复由 pipeline 检查点负责，测试运行器不得自动重放。
  retries: 0,
  workers: process.env.CI ? 1 : localConcurrency.effectiveWorkers,
  reporter: productCenterLeanReporting
    ? [
        ['line'],
        ['./reporters/product-center-timing.reporter.ts'],
        [require.resolve('./reporters/system-test-audit-step.reporter')],
      ]
    : [
        ['./reporters/product-center-timing.reporter.ts'],
        ['./reporters/product-center-recipe.reporter.ts'],
        [require.resolve('./reporters/system-test-audit-step.reporter')],
        [
          'allure-playwright',
          createMerchantCenterAllurePlaywrightV3Options(),
        ],
        ...sourceGovernedJsonReporter,
      ],
  globalSetup: require.resolve('./tests/setup/global.setup'),
  globalTeardown: require.resolve('./tests/setup/global.teardown'),
  use: {
    baseURL: appConfig.baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    ...(chromeExecutablePath ? { launchOptions: { executablePath: chromeExecutablePath } } : {}),
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'api',
      testMatch: /tests\/api\/.*\.spec\.ts/,
    },
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      timeout: 120_000,
      retries: process.env.PC_BATCH_AUTH_ONCE === '1' ? 0 : 2,
    },
    {
      name: 'chrome',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        headless: !!process.env.CI,
        storageState: appConfig.storageStatePath,
      },
    },
    {
      name: 'ephemeral-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        headless: !!process.env.CI,
      },
    },
  ],
});
