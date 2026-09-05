import type { APIRequestContext } from '@playwright/test';
import { runtimeConfig } from './runtime-config';
import { executeWithTransientRetry } from './transient-retry';
import { TransientRetryCheckpoint } from './transient-retry-checkpoint';
import { MerchantCenterTokenProvider } from './core/merchant-center-token-provider';

type CachedAccessToken = {
  value: string;
  expiresAt: number;
};

const FALLBACK_TOKEN_TTL_MS = 15 * 60 * 1_000;
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const authRequestTimeoutMs = 15_000;

let cachedAccessToken: CachedAccessToken | undefined;
let accessTokenPromise: Promise<string> | undefined;
let configuredTokenProvider: MerchantCenterTokenProvider | undefined;

export function configureMerchantCenterTokenProvider(provider: MerchantCenterTokenProvider | undefined): void {
  configuredTokenProvider = provider;
}

function findToken(value: unknown): string {
  if (typeof value === 'string' && value.length > 20) return value;
  if (Array.isArray(value)) for (const item of value) { const token = findToken(item); if (token) return token; }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/access.?token|refresh.?token|^token$/i.test(key)) { const token = findToken(item); if (token) return token; }
    }
    for (const item of Object.values(value)) { const token = findToken(item); if (token) return token; }
  }
  return '';
}

function resolveTokenExpiry(token: string): number {
  const fallback = Date.now() + FALLBACK_TOKEN_TTL_MS;
  const payload = token.split('.')[1];
  if (!payload) return fallback;

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as { exp?: number };
    if (!decoded.exp) return fallback;
    return Math.max(Date.now(), decoded.exp * 1_000 - TOKEN_EXPIRY_SKEW_MS);
  } catch {
    return fallback;
  }
}

async function requestAccessToken(request: APIRequestContext): Promise<string> {
  if (!runtimeConfig.username || !runtimeConfig.password) throw new Error('未配置 MC_ACCESS_TOKEN 或 MC_USERNAME/MC_PASSWORD');
  const checkpoint = new TransientRetryCheckpoint('auth-login');
  const response = await executeWithTransientRetry(
    () => request.post(runtimeConfig.authBaseUrl + '/api/auth/login', {
      headers: { 'content-type': 'application/json' },
      data: { userName: runtimeConfig.username, password: runtimeConfig.password },
      timeout: authRequestTimeoutMs,
    }).catch((error: unknown) => {
      throw new Error(
        `API 登录请求未在 ${authRequestTimeoutMs}ms 内完成：${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }),
    {
      safeToRetry: true,
      retryDelaysMs: [5_000],
      onRetry: (event) => checkpoint.recordRetry(event),
      onRecovered: (event) => checkpoint.recordRecovered(event),
    },
  );
  if (!response.ok()) throw new Error('API 登录失败，HTTP ' + response.status());
  const body = await response.json();
  const token = findToken(body);
  if (!token) throw new Error('API 登录响应未找到 token 字段');
  cachedAccessToken = { value: token, expiresAt: resolveTokenExpiry(token) };
  return token;
}

export async function resolveAccessToken(request: APIRequestContext): Promise<string> {
  if (configuredTokenProvider) return configuredTokenProvider.getToken(request);
  if (runtimeConfig.accessToken) return runtimeConfig.accessToken;
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) return cachedAccessToken.value;
  if (!accessTokenPromise) {
    accessTokenPromise = requestAccessToken(request).finally(() => {
      accessTokenPromise = undefined;
    });
  }
  return accessTokenPromise;
}

export function resetAccessTokenCache(): void {
  cachedAccessToken = undefined;
  accessTokenPromise = undefined;
  configuredTokenProvider?.reset();
}
