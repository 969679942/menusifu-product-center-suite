import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  bootstrapMerchantCenterSession,
  establishMerchantCenterPoiContext,
  persistMerchantCenterSessionState,
} from '../../../flows/auth.flow';
import { appConfig } from '../../../test-data/env';
import { recoverProductCenterCheckpoints } from '../../../scripts/product-center-resume-cleanup';
import { resolveAuthCredentials } from '../../../test-data/auth';
import { resolveSeasoningContext } from '../../../test-data/seasoning-context';
import { SidebarPage } from '../../../pages/sidebar.page';
import { writePassedSystemTestStageReceiptFromEnvironment } from '../../../../../Test Automation Platform/src/automation/system-test/system-test-stage-receipt';

test('建立调味管理商户认证会话', async ({ browser }, testInfo) => {
  const checkpointRoot = process.env.SYSTEM_TEST_CHECKPOINT_ROOT
    ? path.resolve(process.env.SYSTEM_TEST_CHECKPOINT_ROOT)
    : path.resolve('output/system-test/merchant-center-product-center-seasoning/checkpoints');
  const recovery = await recoverProductCenterCheckpoints(checkpointRoot);
  expect(recovery.failed, '历史调味检查点必须先恢复').toBe(0);
  const seasoningContext = resolveSeasoningContext();
  const auth = resolveAuthCredentials({
    merchant: seasoningContext.merchant,
    brandId: seasoningContext.brandId,
  });
  if (!auth.username || !auth.password || !auth.merchant) {
    throw new Error('调味管理流程缺少用户名、密码或商户上下文。');
  }
  const storageStatePath = process.env.MC_STORAGE_STATE_PATH || seasoningContext.storageStatePath;
  const session = await bootstrapMerchantCenterSession({
    browser,
    storageStatePath,
    targetUrl: `${process.env.SYSTEM_TEST_BASE_URL || appConfig.baseURL}${seasoningContext.identityProbePath}`,
    expectedBrandId: seasoningContext.brandId,
    auth,
    options: {
      identityProbePath: seasoningContext.identityProbePath,
      expectedPoiId: seasoningContext.poiId,
      expectedPoiName: seasoningContext.poiName,
    },
  });
  try {
    const sidebar = new SidebarPage(session.page);
    await sidebar.openLanguageMenu();
    await sidebar.selectChineseLanguage();
    await sidebar.expectChineseAutomationLocale();
    if (seasoningContext.poiId) {
      await establishMerchantCenterPoiContext(session.page, {
        poiId: seasoningContext.poiId,
        poiName: seasoningContext.poiName,
      });
    }
    await persistMerchantCenterSessionState(session.context, storageStatePath);
    writePassedSystemTestStageReceiptFromEnvironment({ storageStatePath });
    testInfo.annotations.push({ type: 'auth-bootstrap-mode', description: session.mode });
    await testInfo.attach('seasoning-auth-bootstrap', {
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify({
        profile: seasoningContext.profile,
        brandId: seasoningContext.brandId,
        poiId: seasoningContext.poiId,
        mode: session.mode,
      })),
    });
  } finally {
    await session.context.close();
  }
});
