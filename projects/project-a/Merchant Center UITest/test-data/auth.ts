import { appConfig } from './env';

type AuthCredentials = {
  username: string;
  password: string;
  merchant: string;
  brandId: string;
};

export function resolveAuthCredentials(
  identity: Partial<Pick<AuthCredentials, 'merchant' | 'brandId'>> = {},
): AuthCredentials {
  return {
    username: appConfig.username,
    password: appConfig.password,
    merchant: identity.merchant ?? appConfig.merchantName,
    brandId: identity.brandId ?? appConfig.brandId,
  };
}

export function resolveEntryUrl(): string {
  return `${appConfig.baseURL}${appConfig.brandPicturePath}`;
}
