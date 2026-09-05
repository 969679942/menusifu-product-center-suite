import { expect, test } from '@playwright/test';
import { createChangeSnapshot } from '../../src/audit/change-snapshot';
import { FileAuditEventStore } from '../../src/audit/event-log';
import { recordChangeEvent, saveFileWithChangeEvent } from '../../src/audit/change-event';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test.describe('统一变更快照合同', () => {
  test('应保存脱敏前后内容、字段和逐行差异', () => {
    const snapshot = createChangeSnapshot({
      before: { price: 1, authorization: 'Bearer secret' },
      after: { price: 0, authorization: 'Bearer new-secret' },
      changedFields: ['price'], changedBy: 'operator-1', changeSource: 'git-commit',
    });
    expect(snapshot.contentAvailable).toEqual({ before: true, after: true });
    expect(snapshot.beforeContent).toMatchObject({ price: 1, authorization: { redacted: true } });
    expect(snapshot.afterContent).toMatchObject({ price: 0, authorization: { redacted: true } });
    expect(snapshot.unifiedDiff).toContain('-   "price": 1');
    expect(snapshot.unifiedDiff).toContain('+   "price": 0');
    expect(snapshot.changedFields).toEqual(['price']);
  });

  test('内容缺失时不得伪造为空内容，超大内容必须截断', () => {
    const missing = createChangeSnapshot({ beforeFingerprint: 'a', afterFingerprint: 'b' });
    expect(missing.contentAvailable).toEqual({ before: false, after: false });
    expect(missing.beforeContent).toBeUndefined();
    const large = createChangeSnapshot({ before: 'x'.repeat(100), after: 'y', maxContentBytes: 16 });
    expect(large.beforeContent).toMatchObject({ truncated: true });
  });

  test('受管文件保存应在写入同一动作中追加变更事件', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'change-event-'));
    try {
      const filePath = path.join(root, 'rule.md'); const logPath = path.join(root, 'events.jsonl');
      fs.writeFileSync(filePath, '价格必须大于 0', 'utf8');
      const result = saveFileWithChangeEvent({ eventLogPath: logPath, applicationId: 'app', objectType: 'business-rule', objectId: 'BR-1', filePath, content: '价格必须大于等于 0', changedBy: 'tester', changeSource: 'manual-save' });
      expect(result.event.eventType).toBe('business-rule.decision');
      expect(result.event.details).toMatchObject({ changeSnapshot: expect.objectContaining({ contentAvailable: { before: true, after: true } }) });
      expect(new FileAuditEventStore({ filePath: logPath }).verifyIntegrity().valid).toBe(true);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
