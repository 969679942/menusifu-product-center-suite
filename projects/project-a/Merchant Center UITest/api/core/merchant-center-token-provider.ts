import { createHash } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { executeWithTransientRetry } from '../transient-retry';
import { TransientRetryCheckpoint } from '../transient-retry-checkpoint';
import type {
  MerchantCenterAccountContext,
  MerchantCenterAccountEvidence,
} from './merchant-center-account-context';

type CachedToken = {
  value: string;
  expiresAt: number;
};

const TOKEN_SKEW_MS = 60_000;
const FALLBACK_TTL_MS = 15 * 60 * 1_000;

export class MerchantCenterTokenProvider {
  private cachedToken?: CachedToken;
  private pendingToken?: Promise<string>;
  private authenticatedAt?: string;

  constructor(private readonly account: MerchantCenterAccountContext) {}

  async getToken(request: APIRequestContext): Promise<string> {
    if (this.account.credentialSource === 'access-token') {
      if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) return this.cachedToken.value;
      return this.accountToken();
    }
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) return this.cachedToken.value;
    if (!this.pendingToken) {
      this.pendingToken = this.login(request).finally(() => {
        this.pendingToken = undefined;
      });
    }
    return this.pendingToken;
  }

  invalidate(token: string): void {
    if (this.cachedToken?.value === token) this.cachedToken = undefined;
  }

  evidence(): MerchantCenterAccountEvidence {
    const token = this.cachedToken?.value ?? this.accountToken();
    return {
      environment: this.account.environment,
      authBaseUrl: this.account.authBaseUrl,
      apiBaseUrl: this.account.apiBaseUrl,
      brandId: this.account.brandId,
      poiId: this.account.poiId,
      credentialSource: this.account.credentialSource,
      authenticatedAt: this.authenticatedAt ?? 'provided-token',
      tokenFingerprint: createHash('sha256').update(token).digest('hex').slice(0, 16),
      tokenExpiresAt: new Date(this.cachedToken?.expiresAt ?? Date.now() + FALLBACK_TTL_MS).toISOString(),
    };
  }

  reset(): void {
    this.cachedToken = undefined;
    this.pendingToken = undefined;
    this.authenticatedAt = undefined;
  }

  private accountToken(): string {
    if (this.account.credentialSource !== 'access-token') {
      throw new Error('商品中心账号上下文未配置直接访问令牌。');
    }
    const value = this.accountTokenValue();
    this.cachedToken = { value, expiresAt: Date.now() + FALLBACK_TTL_MS };
    return value;
  }

  private accountTokenValue(): string {
    if (this.account.accessToken) return this.account.accessToken;
    throw new Error('商品中心直接访问令牌未找到。');
  }

  private async login(request: APIRequestContext): Promise<string> {
    if (!this.account.username || !this.account.password) throw new Error('商品中心账号上下文缺少登录账号或密码。');
    const checkpoint = new TransientRetryCheckpoint('merchant-center-auth-login');
    const response = await executeWithTransientRetry(
      () => request.post(`${this.account.authBaseUrl}/api/auth/login`, {
        headers: { 'content-type': 'application/json' },
        data: { userName: this.account.username, password: this.account.password },
        timeout: 15_000,
      }),
      {
        safeToRetry: true,
        retryDelaysMs: [5_000],
        onRetry: (event) => checkpoint.recordRetry(event),
        onRecovered: (event) => checkpoint.recordRecovered(event),
      },
    );
    if (!response.ok()) throw new Error(`商品中心 API 登录失败，HTTP ${response.status()}。`);
    const token = findToken(await response.json());
    if (!token) throw new Error('商品中心 API 登录响应未找到 token。');
    this.cachedToken = { value: token, expiresAt: resolveTokenExpiry(token) };
    this.authenticatedAt = new Date().toISOString();
    return token;
  }
}

function findToken(value: unknown): string {
  if (typeof value === 'string' && value.length > 20) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const token = findToken(item);
      if (token) return token;
    }
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/access.?token|refresh.?token|^token$/i.test(key)) {
        const token = findToken(item);
        if (token) return token;
      }
    }
    for (const item of Object.values(value)) {
      const token = findToken(item);
      if (token) return token;
    }
  }
  return '';
}

function resolveTokenExpiry(token: string): number {
  const fallback = Date.now() + FALLBACK_TTL_MS;
  const payload = token.split('.')[1];
  if (!payload) return fallback;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as { exp?: number };
    return decoded.exp ? Math.max(Date.now(), decoded.exp * 1_000 - TOKEN_SKEW_MS) : fallback;
  } catch {
    return fallback;
  }
}
