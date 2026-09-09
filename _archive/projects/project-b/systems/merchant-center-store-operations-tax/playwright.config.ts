import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { appConfig } from '../../test-data/env';
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

export default defineConfig({
  testDir: './tests',
  reporter: [[require.resolve('../../reporters/system-test-audit-step.reporter')]],
  timeout: 180_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.SYSTEM_TEST_BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    viewport: { width: 1440, height: 900 },
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: 'setup', testMatch: /setup\.spec\.ts/ },
    { name: 'recovery', testMatch: /recovery\.spec\.ts/ },
    {
      name: 'system',
      testIgnore: /(?:setup|recovery)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        headless: Boolean(process.env.CI),
        storageState: appConfig.storageStatePath,
      },
    },
  ],
});
