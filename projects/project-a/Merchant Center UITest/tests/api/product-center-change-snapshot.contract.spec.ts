import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileAuditEventStore } from '../../../../Test Automation Platform/src/audit/event-log';
import { adaptProductCenterOperationReceipts } from '../../adapters/product-center/product-center-audit-event-adapter';
import { buildProductCenterAuditReport, renderProductCenterAuditHtml } from '../../adapters/product-center/product-center-audit-report';

test('商品中心 API/UI 操作变更应进入快照和可读报告', () => {
  const events = adaptProductCenterOperationReceipts([{
    operationKey: 'api:PUT /items/1', method: 'PUT', observed: true, status: 'passed',
    occurredAt: '2026-09-04T10:00:00Z', beforeContent: { price: 1 }, afterContent: { price: 0 },
    changedFields: ['price'], changedBy: 'qa-user', changeSource: 'manual-save',
  }], { runId: 'run-change-1', caseId: 'TC-CHANGE-001', occurredAt: '2026-09-04T10:00:00Z' });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-change-snapshot-'));
  try {
    const store = new FileAuditEventStore({ filePath: path.join(root, 'events.jsonl') });
    const persisted = store.appendMany(events);
    const report = buildProductCenterAuditReport(persisted);
  const change = report.changeLedger[0];
  expect(change.beforeContent).toEqual({ price: 1 });
  expect(change.afterContent).toEqual({ price: 0 });
  expect(change.unifiedDiff).toContain('price');
  expect(change.changedBy).toBe('qa-user');
    expect(renderProductCenterAuditHtml(report)).toContain('查看原内容与新内容');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
