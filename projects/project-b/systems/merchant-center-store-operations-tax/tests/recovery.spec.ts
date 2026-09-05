import path from 'node:path';
import { expect, test } from '@playwright/test';
import { recoverProductCenterCheckpoints } from '../../../scripts/product-center-resume-cleanup';

test('恢复本系统未完成的可逆写入', async () => {
  const checkpointRoot = process.env.SYSTEM_TEST_CHECKPOINT_ROOT;
  if (!checkpointRoot) throw new Error('缺少 SYSTEM_TEST_CHECKPOINT_ROOT');
  const recovery = await recoverProductCenterCheckpoints(path.resolve(checkpointRoot));
  expect(recovery.failed, '熔断或失败后的恢复不得遗留服务端数据').toBe(0);
});
