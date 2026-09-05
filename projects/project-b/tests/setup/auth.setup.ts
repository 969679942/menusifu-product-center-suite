import { test as setup } from '@playwright/test';
import { bootstrapMerchantCenterSession, persistMerchantCenterSessionState } from '../../flows/auth.flow';
import { appConfig } from '../../test-data/env';
import { resolveAuthCredentials } from '../../test-data/auth';
import { writeProductCenterGroupProgress } from '../../utils/product-center-group-progress';

setup('保存商户中心登录态', async ({ browser }) => {
  const progressRunId = process.env.PC_GROUP_RUN_ID;
  if (progressRunId) writeProductCenterGroupProgress({ runId: progressRunId, caseId: '__setup__', phase: 'started' });
  const auth = resolveAuthCredentials();

  if (!auth.username || !auth.password || !auth.merchant) {
    throw new Error('缺少登录信息。请在 .secrets/runtime.env 或环境变量 MC_USERNAME/MC_PASSWORD/MC_MERCHANT 中配置。');
  }

  let session: Awaited<ReturnType<typeof bootstrapMerchantCenterSession>> | undefined;
  try {
    session = await bootstrapMerchantCenterSession({
      browser,
      storageStatePath: appConfig.storageStatePath,
      targetUrl: `${appConfig.baseURL}/pp/brand/list`,
      expectedBrandId: appConfig.brandId,
      auth,
      options: {
        onNavigationRetry: () => {
          if (progressRunId) {
            writeProductCenterGroupProgress({ runId: progressRunId, caseId: '__setup__', phase: 'auth-retrying' });
          }
        },
      },
    });
    await persistMerchantCenterSessionState(session.context, appConfig.storageStatePath);
    if (progressRunId) writeProductCenterGroupProgress({ runId: progressRunId, caseId: '__setup__', phase: 'completed' });
  } catch (error) {
    if (progressRunId) writeProductCenterGroupProgress({ runId: progressRunId, caseId: '__setup__', phase: 'failed' });
    throw error;
  } finally {
    await session?.context.close();
  }
});
