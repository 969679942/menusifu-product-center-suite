import { secretEnv } from '../config/secret-source';

export const appConfig = {
  environmentId: process.env.MC_TEST_ENV || 'balamxqa',
  baseURL: process.env.PLAYWRIGHT_BASE_URL
    || process.env.MC_BASE_URL
    || 'https://cc-fe.balamxqa.com',
  authBaseURL: process.env.PLAYWRIGHT_AUTH_BASE_URL
    || process.env.MC_AUTH_BASE_URL
    || 'https://auth.menusifucloudqa.com',
  brandPicturePath: '/pp/brandpictrue',
  brandPictureTitle: /图片管理|image management/i,
  username: process.env.MC_USERNAME || secretEnv.MC_USERNAME || '',
  password: process.env.MC_PASSWORD || secretEnv.MC_PASSWORD || '',
  merchantName: process.env.MC_MERCHANT
    || process.env.MC_MERCHANT_NAME
    || secretEnv.MC_MERCHANT
    || secretEnv.MC_MERCHANT_NAME
    || 'Menusifu SCH Restaurant',
  brandId: process.env.MC_BRAND_ID || secretEnv.MC_BRAND_ID || '000407',
  storageStatePath: process.env.MC_STORAGE_STATE_PATH || 'output/auth-state.json',
} as const;

export function brandPictureUrl(): string {
  return `${appConfig.baseURL}${appConfig.brandPicturePath}`;
}
