import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  findSystemTestResourceLeases,
  withSystemTestResourceClaims,
} from '../../src/automation/system-test/system-test-resource-lock';

test.describe('跨系统资源租约锁合同', () => {
  test('共享读租约可以并发，独占写租约必须等待读租约释放', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-lock-'));
    const order: string[] = [];
    try {
      await Promise.all([
        withSystemTestResourceClaims([{ key: 'route:list', mode: 'shared' }], async () => {
          order.push('read-start');
          await new Promise((resolve) => setTimeout(resolve, 60));
          order.push('read-end');
        }, { rootDir, pollIntervalMs: 5 }),
        withSystemTestResourceClaims([{ key: 'route:list', mode: 'exclusive' }], async () => {
          order.push('write-start');
          order.push('write-end');
        }, { rootDir, pollIntervalMs: 5 }),
      ]);
      expect(order).toEqual(['read-start', 'read-end', 'write-start', 'write-end']);
      expect(findSystemTestResourceLeases(rootDir)).toEqual([]);
      const resourceDir = path.join(rootDir, createHash('sha256').update('route:list').digest('hex').slice(0, 24));
      expect(fs.existsSync(path.join(resourceDir, 'shared'))).toBe(true);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('死亡进程遗留租约必须自动恢复', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-stale-lock-'));
    const resourceDir = path.join(rootDir, createHash('sha256').update('stale-resource-key').digest('hex').slice(0, 24));
    try {
      fs.mkdirSync(resourceDir, { recursive: true });
      fs.writeFileSync(path.join(resourceDir, 'exclusive.json'), JSON.stringify({
        ownerId: 'dead-owner', pid: 999_999_999, acquiredAt: new Date(0).toISOString(),
      }));
      await withSystemTestResourceClaims([{ key: 'stale-resource-key', mode: 'exclusive' }], async () => undefined, {
        rootDir, leaseTtlMs: 1, pollIntervalMs: 5,
      });
      expect(findSystemTestResourceLeases(rootDir)).toEqual([]);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('租约可按运行会话隔离查询，其他存活会话不得污染本次 teardown', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-lock-scope-'));
    try {
      await withSystemTestResourceClaims([{ key: 'scoped-resource', mode: 'exclusive' }], async () => {
        expect(findSystemTestResourceLeases(rootDir)).toHaveLength(1);
        expect(findSystemTestResourceLeases(rootDir, 'run-a')).toHaveLength(1);
        expect(findSystemTestResourceLeases(rootDir, 'run-b')).toEqual([]);
      }, { rootDir, ownerScopeId: 'run-a', pollIntervalMs: 5 });
      expect(findSystemTestResourceLeases(rootDir)).toEqual([]);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
