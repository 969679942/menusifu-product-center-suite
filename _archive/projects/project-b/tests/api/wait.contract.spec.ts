import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRefreshGatedProbe, waitUntil, WaitUntilError } from '../../utils/wait';

test.describe('通用条件等待器', () => {
  test('刷新门控探测应首次刷新并在间隔内只观察', async () => {
    let now = 0;
    let refreshes = 0;
    let observations = 0;
    const probe = createRefreshGatedProbe({
      refresh: () => { refreshes += 1; },
      observe: () => { observations += 1; return observations; },
      refreshInterval: 5_000,
      now: () => now,
    });
    await probe();
    now = 4_999; await probe();
    now = 5_000; await probe();
    expect({ refreshes, observations }).toEqual({ refreshes: 2, observations: 3 });
  });

  test('启用默认遥测时应持久化脱敏等待终态', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wait-telemetry-'));
    const target = path.join(root, 'wait.jsonl');
    const previous = process.env.TEST_WAIT_TELEMETRY_PATH;
    try {
      process.env.TEST_WAIT_TELEMETRY_PATH = target;
      await waitUntil(() => ({ secret: 'must-not-leak' }), () => true, {
        waitId: 'contract-wait',
        observation: { channel: 'api', operation: 'contract-probe', caseId: 'REF-001' },
      });
      const event = JSON.parse(fs.readFileSync(target, 'utf8').trim());
      expect(event).toEqual(expect.objectContaining({ outcome: 'satisfied', waitId: 'contract-wait', attempts: 1, lastValueSummary: 'object(keyCount=1)' }));
      expect(fs.readFileSync(target, 'utf8')).not.toContain('must-not-leak');
    } finally {
      if (previous === undefined) delete process.env.TEST_WAIT_TELEMETRY_PATH;
      else process.env.TEST_WAIT_TELEMETRY_PATH = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('共享 deadline 应缩短本次等待预算并只产生一次结束遥测', async () => {
    const events: Array<{ outcome: string; effectiveTimeoutMs: number; attempts: number }> = [];
    const startedAt = Date.now();
    await expect(waitUntil(
      () => true,
      () => true,
      {
        timeout: 10_000,
        deadlineAt: startedAt + 50,
        telemetry: (event) => events.push({ outcome: event.outcome, effectiveTimeoutMs: event.effectiveTimeoutMs, attempts: event.attempts }),
      },
    )).resolves.toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({ outcome: 'satisfied', effectiveTimeoutMs: expect.any(Number), attempts: 1 }));
    expect(events[0].effectiveTimeoutMs).toBeGreaterThanOrEqual(45);
    expect(events[0].effectiveTimeoutMs).toBeLessThanOrEqual(50);
  });

  test('共享 deadline 已过期时不得执行探测并记录超时遥测', async () => {
    let probeCount = 0;
    const events: Array<{ outcome: string; effectiveTimeoutMs: number; attempts: number }> = [];
    await expect(waitUntil(
      () => { probeCount += 1; return false; },
      () => false,
      {
        timeout: 10_000,
        deadlineAt: Date.now() - 1,
        telemetry: (event) => events.push({ outcome: event.outcome, effectiveTimeoutMs: event.effectiveTimeoutMs, attempts: event.attempts }),
      },
    )).rejects.toMatchObject({ code: 'WAIT_UNTIL_TIMEOUT', timeoutMs: 0 });
    expect(probeCount).toBe(0);
    expect(events).toEqual([{ outcome: 'timeout', effectiveTimeoutMs: 0, attempts: 0 }]);
  });

  test('剩余预算不足一次有效探测时应保留最后值并标准超时', async () => {
    let probeCount = 0;
    let now = 0;
    const originalNow = Date.now;

    Date.now = () => now;
    try {
      await expect(waitUntil(
        () => {
          probeCount += 1;
          now = probeCount === 1 ? 75 : 81;
          return probeCount;
        },
        () => false,
        {
          timeout: 80,
          interval: 1,
          probeTimeout: 100,
          message: '目标状态未稳定',
        },
      )).rejects.toThrow('目标状态未稳定 Last value: 1');
    } finally {
      Date.now = originalNow;
    }

    expect(probeCount).toBe(1);
  });

  test('探测器超时必须保留 API 观测元数据，不得伪装成业务断言失败', async () => {
    const rejection = waitUntil(
      () => new Promise<never>(() => undefined),
      () => false,
      {
        timeout: 30,
        probeTimeout: 5,
        observation: {
          channel: 'api',
          operation: 'product-detail.attribute-option-synchronization',
          caseId: 'TC-GRP-SPEC-021',
        },
      },
    );

    await expect(rejection).rejects.toBeInstanceOf(WaitUntilError);
    await expect(rejection).rejects.toMatchObject({
      code: 'WAIT_UNTIL_TIMEOUT',
      kind: 'probe-timeout',
      observation: {
        channel: 'api',
        caseId: 'TC-GRP-SPEC-021',
      },
    });
  });
});
