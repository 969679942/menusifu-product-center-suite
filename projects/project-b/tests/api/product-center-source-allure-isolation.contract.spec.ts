import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');

test('source-governed执行必须按runner隔离Allure并保留JSON收据', () => {
  const sourceRunner = fs.readFileSync(
    path.join(projectRoot, 'scripts/run-product-center-source-governed.ts'),
    'utf8',
  );
  const groupRunner = fs.readFileSync(
    path.join(projectRoot, 'scripts/run-product-center-group-with-watchdog.ts'),
    'utf8',
  );
  const itemRunner = fs.readFileSync(
    path.join(projectRoot, 'scripts/run-product-center-item-213.ts'),
    'utf8',
  );
  const itemImplementation = fs.readFileSync(
    path.join(projectRoot, 'adapters/product-center/product-center-item-implementation.ts'),
    'utf8',
  );
  const config = fs.readFileSync(path.join(projectRoot, 'playwright.config.ts'), 'utf8');

  expect(sourceRunner).toContain("sourceGovernedAllureEnvironment('group', runId)");
  expect(sourceRunner).toContain("sourceGovernedAllureEnvironment('item', runId)");
  expect(sourceRunner).toContain("sourceGovernedAllureEnvironment('remaining', runId)");
  expect(sourceRunner).toContain("'output', 'allure', 'source-governed', runId, runnerId, 'allure-results'");
  expect(config).toContain('createMerchantCenterAllurePlaywrightV3Options');
  expect(config).toContain('sourceGovernedJsonReporter');
  expect(groupRunner).not.toContain("'--reporter=json'");
  expect(itemRunner).toContain("process.env.PC_SOURCE_GOVERNED_ALLURE_DIR ? { PC_ITEM_LEAN_REPORTING: '0' }");
  expect(itemRunner).toContain('delete authEnv.ALLURE_RESULTS_DIR');
  expect(itemImplementation).toContain("path: 'playwright.config.ts'");
  expect(sourceRunner).toContain("'playwright.config.ts',\n    'tests/generated/product-center-legacy-remaining.generated.spec.ts'");
});
