import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  FileAuditEventStore,
  aggregateAuditEvents,
  createAuditCheckpoint,
  queryAuditEvents,
  readAuditCheckpoint,
  writeAuditCheckpoint,
} from '../../src/audit/event-log';

function fixture(): { root: string; store: FileAuditEventStore } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-event-contract-'));
  return { root, store: new FileAuditEventStore({ filePath: path.join(root, 'events.jsonl') }) };
}

test.describe('系统无关流程审计事件合同', () => {
  test('追加事件以 eventId 幂等并形成可验证哈希链', () => {
    const { root, store } = fixture();
    try {
      const input = {
        eventId: 'evt-1', eventType: 'flow.started', occurredAt: '2026-08-28T00:00:00.000Z',
        actorType: 'system' as const, applicationId: 'application-alpha', runId: 'run-1', outcome: 'success' as const,
      };
      const first = store.append(input);
      const duplicate = store.append(input);
      const second = store.append({ ...input, eventId: 'evt-2', eventType: 'flow.completed', occurredAt: '2026-08-28T00:00:01.000Z' });
      expect(first.duplicate).toBe(false);
      expect(duplicate.duplicate).toBe(true);
      expect(store.readAll()).toHaveLength(2);
      expect(second.event.previousEventHash).toBe(first.event.eventHash);
      expect(store.verifyIntegrity()).toEqual({ valid: true, count: 2, diagnostics: [] });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('同一 eventId 携带不同内容必须拒绝且篡改可被检测', () => {
    const { root, store } = fixture();
    try {
      store.append({ eventId: 'evt-1', eventType: 'case.updated', occurredAt: '2026-08-28T00:00:00.000Z', actorType: 'ai', applicationId: 'application-alpha', caseId: 'CASE-1' });
      expect(() => store.append({ eventId: 'evt-1', eventType: 'case.updated', occurredAt: '2026-08-28T00:00:00.000Z', actorType: 'ai', applicationId: 'application-alpha', caseId: 'CASE-2' })).toThrow(/AUDIT_EVENT_ID_CONFLICT/);
      fs.appendFileSync(store.filePath, '{"tampered":true}\n', 'utf8');
      expect(store.verifyIntegrity()).toMatchObject({ valid: false });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('批量追加只读取一次并保持幂等哈希链', () => {
    const { root, store } = fixture();
    try {
      const inputs = [1, 2, 3].map((index) => ({
        eventId: `evt-batch-${index}`,
        eventType: 'case.started' as const,
        actorType: 'runner' as const,
        applicationId: 'application-batch',
        caseId: `CASE-${index}`,
      }));
      expect(store.appendMany(inputs)).toHaveLength(3);
      expect(store.appendMany(inputs)).toHaveLength(3);
      expect(store.readAll().map((event) => event.eventSequence)).toEqual([1, 2, 3]);
      expect(store.verifyIntegrity()).toEqual({ valid: true, count: 3, diagnostics: [] });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('多个进程并发追加仍保持唯一序号和连续哈希链', async () => {
    const { root, store } = fixture();
    try {
      const childPath = path.join(root, 'append-child.ts');
      const modulePath = pathToFileURL(path.resolve(process.cwd(), 'src/audit/event-log.ts')).href;
      fs.writeFileSync(childPath, [
        `import { appendAuditEvent } from ${JSON.stringify(modulePath)};`,
        `appendAuditEvent(process.argv[2], JSON.parse(process.argv[3]));`,
      ].join('\n'), 'utf8');
      await Promise.all(Array.from({ length: 12 }, (_, index) => new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, ['--import', 'tsx', childPath, store.filePath, JSON.stringify({
          eventId: `evt-concurrent-${index}`, eventType: 'case.started', actorType: 'runner',
          applicationId: 'application-concurrency', caseId: `CASE-${index}`,
        })], { cwd: process.cwd(), stdio: 'pipe' });
        let stderr = '';
        child.stderr.on('data', (chunk) => { stderr += String(chunk); });
        child.on('error', reject);
        child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr || `child exit ${code}`)));
      })));
      expect(store.readAll().map((event) => event.eventSequence)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
      expect(store.verifyIntegrity()).toEqual({ valid: true, count: 12, diagnostics: [] });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('敏感字段递归脱敏且不把明文写入事件文件', () => {
    const { root, store } = fixture();
    try {
      store.append({
        eventId: 'evt-secret', eventType: 'audit.completed', actorType: 'runner', applicationId: 'application-beta',
        details: { authorization: 'Bearer raw-secret', nested: { password: 's3cr3t', safeLabel: 'kept' }, cookies: ['a=b'] },
      });
      const persisted = fs.readFileSync(store.filePath, 'utf8');
      expect(persisted).not.toContain('Bearer raw-secret');
      expect(persisted).not.toContain('s3cr3t');
      expect(persisted).not.toContain('a=b');
      expect(persisted).toContain('safeLabel');
      expect(persisted).toContain('fingerprint');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('显式 undefined 可选字段落盘后保持哈希一致', () => {
    const { root, store } = fixture();
    try {
      store.append({
        eventId: 'evt-undefined', eventType: 'case.started', actorType: 'runner', applicationId: 'application-optional',
        startedAt: undefined, outcome: undefined, details: { optional: undefined, values: ['kept', undefined] },
      });
      expect(store.verifyIntegrity()).toEqual({ valid: true, count: 1, diagnostics: [] });
      const event = store.readAll()[0];
      expect(event).not.toHaveProperty('startedAt');
      expect(event.details).toEqual({ values: ['kept', null] });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('查询、重试、有效成功与纠正聚合不依赖业务领域', () => {
    const { root, store } = fixture();
    try {
      const common = { actorType: 'system' as const, applicationId: 'application-gamma', runId: 'run-7', planId: 'plan-7' };
      store.append({ ...common, eventId: 'evt-c1', eventType: 'correction.candidate', occurredAt: '2026-08-28T01:00:00.000Z', caseId: 'CASE-A' });
      store.append({ ...common, eventId: 'evt-c2', eventType: 'correction.candidate', occurredAt: '2026-08-28T01:00:01.000Z', caseId: 'CASE-A' });
      store.append({ ...common, eventId: 'evt-c3', eventType: 'correction.started', occurredAt: '2026-08-28T01:00:02.000Z', caseId: 'CASE-A', attempt: 2, retryOfEventId: 'evt-c2' });
      store.append({ ...common, eventId: 'evt-c4', eventType: 'correction.completed', occurredAt: '2026-08-28T01:00:03.000Z', caseId: 'CASE-A', outcome: 'success', effectiveSuccess: true, dataChanged: true });
      const retryEvents = queryAuditEvents(store.readAll(), { applicationId: 'application-gamma', retriesOnly: true });
      const summary = aggregateAuditEvents(store.query({ runId: 'run-7' }));
      expect(retryEvents.map((item) => item.eventId)).toEqual(['evt-c3']);
      expect(summary).toMatchObject({
        total: 4, effectiveSuccesses: 1, retries: 1, dataChanges: 1,
        correction: { triggered: 2, started: 1, completed: 1, blocked: 0, affectedCases: 1 },
      });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('检查点记录最后成功工作单元而不保存运行秘密', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-checkpoint-contract-'));
    const checkpoint = createAuditCheckpoint({
      checkpointId: 'checkpoint-1', runId: 'run-1', lastEventSequence: 3,
      lastEventHash: 'a'.repeat(64), status: 'running', updatedAt: '2026-08-28T01:00:00.000Z',
    });
    expect(checkpoint).toEqual({
      schemaVersion: '1.0.0', checkpointId: 'checkpoint-1', runId: 'run-1', lastEventSequence: 3,
      lastEventHash: 'a'.repeat(64), status: 'running', updatedAt: '2026-08-28T01:00:00.000Z',
    });
    try {
      const checkpointPath = path.join(root, 'state', 'checkpoint.json');
      writeAuditCheckpoint(checkpointPath, checkpoint);
      expect(readAuditCheckpoint(checkpointPath)).toEqual(checkpoint);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
