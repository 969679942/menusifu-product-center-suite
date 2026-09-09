import { secretEnv } from '../../config/secret-source';

export type MerchantCenterCredentialSource = 'access-token' | 'username-password';

export type MerchantCenterAccountContext = {
  environment: string;
  authBaseUrl: string;
  apiBaseUrl: string;
  platformItemApiBaseUrl: string;
  brandId: string;
  poiId: string;
  credentialSource: MerchantCenterCredentialSource;
  accessToken?: string;
  username?: string;
  password?: string;
};

export type MerchantCenterAccountEvidence = {
  environment: string;
  authBaseUrl: string;
  apiBaseUrl: string;
  brandId: string;
  poiId: string;
  credentialSource: MerchantCenterCredentialSource;
  authenticatedAt: string;
  tokenFingerprint: string;
  tokenExpiresAt: string;
};

export function loadMerchantCenterAccountContext(
  env: Record<string, string | undefined> = process.env,
  secrets: Record<string, string> = secretEnv,
): MerchantCenterAccountContext {
  const accessToken = readValue(env, secrets, 'MC_ACCESS_TOKEN');
  const username = readValue(env, secrets, 'MC_USERNAME');
  const password = readValue(env, secrets, 'MC_PASSWORD');

  if (!accessToken && (!username || !password)) {
    throw new Error('商品中心 API 前置账号未配置：需要 MC_ACCESS_TOKEN 或 MC_USERNAME + MC_PASSWORD。');
  }

  return {
    environment: env.MC_ENVIRONMENT?.trim() || 'qa',
    authBaseUrl: readValue(env, secrets, 'MC_AUTH_API_BASE_URL') || 'https://cloud.menusifucloudqa.com',
    apiBaseUrl: readValue(env, secrets, 'MC_ITEM_API_BASE_URL') || 'https://api.balamxqa.com/item/v1',
    platformItemApiBaseUrl: readValue(env, secrets, 'MC_PLATFORM_ITEM_API_BASE_URL') || 'https://api.balamxqa.com/platform-item/v1',
    brandId: readValue(env, secrets, 'MC_BRAND_ID') || '000407',
    poiId: readValue(env, secrets, 'MC_POI_ID'),
    credentialSource: accessToken ? 'access-token' : 'username-password',
    ...(accessToken ? { accessToken } : {}),
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
  };
}

export function assertMerchantCenterAccountContext(
  context: MerchantCenterAccountContext,
  options: { requirePoi?: boolean } = {},
): void {
  if (!context.brandId) throw new Error('商品中心 API 前置账号缺少 MC_BRAND_ID。');
  if (options.requirePoi && !context.poiId) throw new Error('门店接口需要 MC_POI_ID，但当前账号上下文未提供。');
}

function readValue(
  env: Record<string, string | undefined>,
  secrets: Record<string, string>,
  key: string,
): string {
  return (env[key] ?? secrets[key] ?? '').trim();
}
