import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { establishMerchantCenterSession } from '../../../flows/auth.flow';
import { recoverProductCenterCheckpoints } from '../../../scripts/product-center-resume-cleanup';
import { resolveAuthCredentials } from '../../../test-data/auth';
import { appConfig } from '../../../test-data/env';

test('恢复遗留数据并建立商户中心认证会话', async ({ page }) => {
  const checkpointRoot = requiredCheckpointRoot();
  const recovery = await recoverProductCenterCheckpoints(checkpointRoot);
  expect(recovery.failed, '历史检查点必须在新运行前恢复').toBe(0);

  const auth = resolveAuthCredentials();
  if (!auth.username || !auth.password || !auth.merchant) throw new Error('商户中心认证配置不完整');
  await establishMerchantCenterSession(page, auth);
  fs.mkdirSync(path.dirname(appConfig.storageStatePath), { recursive: true });
  await page.context().storageState({ path: appConfig.storageStatePath });
});

function requiredCheckpointRoot(): string {
  const value = process.env.SYSTEM_TEST_CHECKPOINT_ROOT;
  if (!value) throw new Error('缺少 SYSTEM_TEST_CHECKPOINT_ROOT');
  return path.resolve(value);
}
