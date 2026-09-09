import type { APIResponse } from '@playwright/test';

export const transientRetryDelaysMs = [5_000, 15_000, 30_000, 60_000] as const;

type RetryEvent = {
  attempt: number;
  delayMs: number;
  reason: string;
  status?: number;
};

type RecoveredEvent = {
  attempts: number;
};

type TransientRetryOptions = {
  safeToRetry: boolean;
  retryDelaysMs?: readonly number[];
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  onRetry?: (event: RetryEvent) => Promise<void> | void;
  onRecovered?: (event: RecoveredEvent) => Promise<void> | void;
};

type ReadOnlyUiRetryOptions = Omit<TransientRetryOptions, 'safeToRetry'>;

type OperationShape = {
  method: string;
  path: string;
};

const retryableStatuses = new Set([408, 429, 502, 503, 504]);
const readOnlyPostPath = /\/(?:list|page|pageQuery)$/i;
const transientError = /ECONNRESET|ETIMEDOUT|timeout|socket hang up|connection reset|connection closed|ERR_ABORTED|ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_TIMED_OUT|ERR_NETWORK_CHANGED|fetch failed|network/i;

export function parseRetryAfterMs(value: string | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

export function isReadOnlyOperation(operation: OperationShape): boolean {
  const method = operation.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  return method === 'POST' && readOnlyPostPath.test(operation.path);
}

export async function executeWithTransientRetry(
  operation: () => Promise<APIResponse>,
  options: TransientRetryOptions,
): Promise<APIResponse> {
  const sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  const random = options.random ?? Math.random;
  const retryDelaysMs = options.retryDelaysMs ?? transientRetryDelaysMs;
  let attempts = 0;

  while (true) {
    attempts += 1;
    try {
      const response = await operation();
      const status = response.status();
      const retryIndex = attempts - 1;
      if (!options.safeToRetry || !retryableStatuses.has(status) || retryIndex >= retryDelaysMs.length) {
        if (attempts > 1 && !retryableStatuses.has(status)) await options.onRecovered?.({ attempts });
        return response;
      }

      const retryAfterMs = parseRetryAfterMs(response.headers()['retry-after']);
      const delayMs = retryAfterMs ?? retryDelaysMs[retryIndex] + Math.round(random() * 1_000);
      await options.onRetry?.({ attempt: attempts, delayMs, reason: `http-${status}`, status });
      await response.dispose().catch(() => undefined);
      await sleep(delayMs);
    } catch (error) {
      const retryIndex = attempts - 1;
      if (!options.safeToRetry || !transientError.test(String(error)) || retryIndex >= retryDelaysMs.length) throw error;
      const delayMs = retryDelaysMs[retryIndex] + Math.round(random() * 1_000);
      await options.onRetry?.({ attempt: attempts, delayMs, reason: 'transport-error' });
      await sleep(delayMs);
    }
  }
}

export async function executeReadOnlyUiWithTransientRetry<T>(
  operation: () => Promise<T>,
  options: ReadOnlyUiRetryOptions = {},
): Promise<T> {
  const sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  const random = options.random ?? Math.random;
  const retryDelaysMs = options.retryDelaysMs ?? transientRetryDelaysMs;
  let attempts = 0;

  while (true) {
    attempts += 1;
    try {
      const result = await operation();
      if (attempts > 1) await options.onRecovered?.({ attempts });
      return result;
    } catch (error) {
      const retryIndex = attempts - 1;
      if (!transientError.test(String(error)) || retryIndex >= retryDelaysMs.length) throw error;
      const delayMs = retryDelaysMs[retryIndex] + Math.round(random() * 1_000);
      await options.onRetry?.({ attempt: attempts, delayMs, reason: 'ui-read-timeout' });
      await sleep(delayMs);
    }
  }
}
