import { expect, test } from '@playwright/test';
import { recoverProductCenterCheckpoints } from '../../../scripts/product-center-resume-cleanup';

test('恢复调味管理执行检查点', async () => {
  const root = process.env.SYSTEM_TEST_CHECKPOINT_ROOT;
  if (!root) throw new Error('缺少 SYSTEM_TEST_CHECKPOINT_ROOT');
  const result = await recoverProductCenterCheckpoints(root);
  expect(result.failed, '调味管理恢复阶段存在清理失败').toBe(0);
});
