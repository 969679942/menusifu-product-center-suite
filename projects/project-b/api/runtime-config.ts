import { secretEnv } from '../config/secret-source';

export const runtimeConfig = {
  apiBaseUrl: process.env.MC_ITEM_API_BASE_URL || 'https://api.balamxqa.com/item/v1',
  platformItemApiBaseUrl: process.env.MC_PLATFORM_ITEM_API_BASE_URL
    || secretEnv.MC_PLATFORM_ITEM_API_BASE_URL
    || 'https://api.balamxqa.com/platform-item/v1',
  authBaseUrl: process.env.MC_AUTH_API_BASE_URL || 'https://cloud.menusifucloudqa.com',
  accessToken: process.env.MC_ACCESS_TOKEN || secretEnv.MC_ACCESS_TOKEN || '',
  username: process.env.MC_USERNAME || secretEnv.MC_USERNAME || '',
  password: process.env.MC_PASSWORD || secretEnv.MC_PASSWORD || '',
  brandId: process.env.MC_BRAND_ID || secretEnv.MC_BRAND_ID || '000407',
  poiId: process.env.MC_POI_ID || secretEnv.MC_POI_ID || '',
};
