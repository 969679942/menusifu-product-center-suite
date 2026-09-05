import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  reporter: [['line']],
  projects: [{ name: 'api', testMatch: /.*\.contract\.spec\.ts/ }],
});
