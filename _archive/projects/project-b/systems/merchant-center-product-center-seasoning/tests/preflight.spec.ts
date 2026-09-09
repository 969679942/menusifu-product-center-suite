import { expect, test } from '@playwright/test';
import { executeReadOnlyUiWithTransientRetry } from '../../../api/transient-retry';
import { SeasoningBoundaryPage } from '../../../pages/product-center/seasoning-boundary.page';
import { resolveSeasoningContext } from '../../../test-data/seasoning-context';
import { writePassedSystemTestStageReceiptFromEnvironment } from '../../../../../Test Automation Platform/src/automation/system-test/system-test-stage-receipt';

test('调味管理页面只读在线预检', async ({ page }) => {
  const route = process.env.SYSTEM_TEST_PREFLIGHT_ROUTE;
  if (!route?.startsWith('/')) throw new Error('SYSTEM_TEST_PREFLIGHT_ROUTE_REQUIRED');
  const seasoning = new SeasoningBoundaryPage(page);
  const executionContextProfile = process.env.SYSTEM_TEST_EXECUTION_CONTEXT_PROFILE ?? 'default';
  await executeReadOnlyUiWithTransientRetry(
    () => seasoning.openPreflightRoute(route, executionContextProfile),
  );
  await expect(page).toHaveURL((url) => url.pathname === route);
  const seasoningContext = resolveSeasoningContext();
  writePassedSystemTestStageReceiptFromEnvironment({
    storageStatePath: process.env.MC_STORAGE_STATE_PATH || seasoningContext.storageStatePath,
  });
});
