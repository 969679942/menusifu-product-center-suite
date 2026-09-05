import { expect, test } from '@playwright/test';
import type { APIResponse } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  executeWithTransientRetry,
  executeReadOnlyUiWithTransientRetry,
  isReadOnlyOperation,
  parseRetryAfterMs,
  transientRetryDelaysMs,
} from '../../api/transient-retry';
import { TransientRetryCheckpoint } from '../../api/transient-retry-checkpoint';

function response(status: number, retryAfter?: string): APIResponse {
  return {
    status: () => status,
    headers: () => retryAfter ? { 'retry-after': retryAfter } : {},
    dispose: async () => undefined,
  } as APIResponse;
}

test.describe('商品中心瞬时故障恢复合同', () => {
  test('应按五十五三十六十秒执行有界退避', async () => {
    expect(transientRetryDelaysMs).toEqual([5_000, 15_000, 30_000, 60_000]);
  });

  test('应优先遵循 Retry-After 响应头', async () => {
    expect(parseRetryAfterMs('7', 0)).toBe(7_000);
    expect(parseRetryAfterMs('Thu, 01 Jan 1970 00:00:09 GMT', 0)).toBe(9_000);
  });

  test('只读请求遇到 429 应按 Retry-After 重试', async () => {
    let attempts = 0;
    const sleeps: number[] = [];
    const result = await executeWithTransientRetry(
      async () => {
        attempts += 1;
        return attempts === 1 ? response(429, '3') : response(200);
      },
      {
        safeToRetry: true,
        sleep: async (delayMs) => { sleeps.push(delayMs); },
        random: () => 0,
      },
    );

    expect(result.status()).toBe(200);
    expect(attempts).toBe(2);
    expect(sleeps).toEqual([3_000]);
  });

  test('非幂等请求遇到 429 不得自动重放', async () => {
    let attempts = 0;
    const result = await executeWithTransientRetry(
      async () => {
        attempts += 1;
        return response(429);
      },
      { safeToRetry: false },
    );

    expect(result.status()).toBe(429);
    expect(attempts).toBe(1);
  });

  test('只读网络超时应使用有界退避且成功后更新检查点', async () => {
    let attempts = 0;
    const sleeps: number[] = [];
    const checkpoints: string[] = [];
    const result = await executeWithTransientRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('ETIMEDOUT');
        return response(200);
      },
      {
        safeToRetry: true,
        sleep: async (delayMs) => { sleeps.push(delayMs); },
        random: () => 0,
        onRetry: async ({ attempt }) => { checkpoints.push(`retry-${attempt}`); },
        onRecovered: async ({ attempts: recoveredAttempts }) => { checkpoints.push(`recovered-${recoveredAttempts}`); },
      },
    );

    expect(result.status()).toBe(200);
    expect(sleeps).toEqual([5_000, 15_000]);
    expect(checkpoints).toEqual(['retry-1', 'retry-2', 'recovered-3']);
  });

  test('只读 UI 导航超时应按同一退避序列重试', async () => {
    let attempts = 0;
    const sleeps: number[] = [];

    const result = await executeReadOnlyUiWithTransientRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('page.waitForResponse: Timeout 60000ms exceeded');
        return 'loaded';
      },
      {
        sleep: async (delayMs) => { sleeps.push(delayMs); },
        random: () => 0,
      },
    );

    expect(result).toBe('loaded');
    expect(attempts).toBe(2);
    expect(sleeps).toEqual([5_000]);
  });

  test('只读 UI 重试应尊重调用方提供的有界退避序列', async () => {
    let attempts = 0;
    const sleeps: number[] = [];
    await expect(executeReadOnlyUiWithTransientRetry(
      async () => {
        attempts += 1;
        throw new Error('page.waitForResponse: Timeout 30000ms exceeded');
      },
      {
        retryDelaysMs: [7, 11],
        sleep: async (delayMs) => { sleeps.push(delayMs); },
        random: () => 0,
      },
    )).rejects.toThrow('Timeout 30000ms exceeded');

    expect(attempts).toBe(3);
    expect(sleeps).toEqual([7, 11]);
  });

  test('仅 GET 与明确查询型 POST 可以自动重试', async () => {
    expect(isReadOnlyOperation({ method: 'GET', path: '/items/{id}' })).toBe(true);
    expect(isReadOnlyOperation({ method: 'POST', path: '/items/pageQuery' })).toBe(true);
    expect(isReadOnlyOperation({ method: 'POST', path: '/items/list' })).toBe(true);
    expect(isReadOnlyOperation({ method: 'POST', path: '/items' })).toBe(false);
    expect(isReadOnlyOperation({ method: 'PUT', path: '/items/{id}' })).toBe(false);
    expect(isReadOnlyOperation({ method: 'DELETE', path: '/items/{id}' })).toBe(false);
  });

  test('重试检查点只能保存脱敏元数据', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-retry-checkpoint-'));
    const checkpoint = new TransientRetryCheckpoint('secret-operation-key', rootDir);

    await checkpoint.recordRetry({ attempt: 1, delayMs: 5_000, reason: 'http-429', status: 429 });
    await checkpoint.recordRecovered({ attempts: 2 });

    const files = fs.readdirSync(rootDir);
    const stored = fs.readFileSync(path.join(rootDir, files[0]), 'utf8');
    expect(stored).not.toContain('secret-operation-key');
    expect(stored).not.toMatch(/password|authorization|cookie|token/i);
    expect(JSON.parse(stored)).toMatchObject({ status: 'recovered', attempts: 2 });
  });
});
