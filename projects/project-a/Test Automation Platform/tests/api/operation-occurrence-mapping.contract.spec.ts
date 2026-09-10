import { test, expect } from '@playwright/test';
import { isOperationOccurrenceMapping, mapOperationReceiptOccurrences, type OperationOccurrenceMapping } from '../../src/governance/operation-occurrence-mapping';
import type { RuntimeOperationReceipt } from '../../src/automation/system-test/system-test-runtime-contract';

const mapping = (): OperationOccurrenceMapping => ({ schemaVersion: '1.0.0', sourceStepIds: ['source:1', 'source:2'],
  business: [{ operationKey: 'select-first', sourceStepId: 'source:1', executableOperationKey: 'View.click', occurrence: 1 },
    { operationKey: 'select-second', sourceStepId: 'source:2', executableOperationKey: 'View.click', occurrence: 2 }],
  supporting: [{ executableOperationKey: 'Flow.execute', occurrence: 1, required: true },
    { executableOperationKey: 'View.read', occurrence: 1, required: true }] });
const raw = (): RuntimeOperationReceipt[] => [
  { sequence: 2, operationKey: 'View.click', method: 'click', observed: true, status: 'passed', startedAt: '2026-09-08T00:00:01Z', finishedAt: '2026-09-08T00:00:02Z' },
  { sequence: 3, operationKey: 'View.read', method: 'read', observed: true, status: 'passed', startedAt: '2026-09-08T00:00:02Z', finishedAt: '2026-09-08T00:00:03Z' },
  { sequence: 4, operationKey: 'View.click', method: 'click', observed: true, status: 'passed', startedAt: '2026-09-08T00:00:03Z', finishedAt: '2026-09-08T00:00:04Z' },
  { sequence: 1, operationKey: 'Flow.execute', method: 'execute', observed: true, status: 'passed', startedAt: '2026-09-08T00:00:00Z', finishedAt: '2026-09-08T00:00:05Z' },
];

test('重复方法按启动顺序绑定不同源步骤，嵌套完成顺序不改变身份', () => {
  const input = raw(); const before = JSON.stringify(input);
  const result = mapOperationReceiptOccurrences(mapping(), input);
  expect(result.status).toBe('complete');
  expect(result.businessReceipts.map((item) => [item.operationKey, item.sequence])).toEqual([['select-first', 2], ['select-second', 4]]);
  expect(result.supportingSequences).toEqual([1, 3]);
  expect(JSON.stringify(input)).toBe(before);
});

test('一份调用不得覆盖多条源步骤，整案包装不能代替缺失步骤', () => {
  const shared = mapping(); shared.business[1].occurrence = 1;
  expect(isOperationOccurrenceMapping(shared)).toBe(false);
  const collapsed = mapping(); collapsed.business.pop();
  expect(mapOperationReceiptOccurrences(collapsed, raw()).reasons).toContain('OPERATION_MAPPING_CONTRACT_INVALID');
  const incomplete = raw().filter((item) => item.sequence !== 4);
  expect(mapOperationReceiptOccurrences(mapping(), incomplete).reasons).toContain('BUSINESS_OPERATION_OCCURRENCE_MISSING');
});

test('未声明记录、缺少必需辅助记录与失败辅助调用均不能被过滤成成功', () => {
  const extra = [...raw(), { ...raw()[0], sequence: 5 }];
  expect(mapOperationReceiptOccurrences(mapping(), extra).reasons).toContain('UNDECLARED_OPERATION_OCCURRENCE');
  const missing = raw().filter((item) => item.operationKey !== 'View.read');
  expect(mapOperationReceiptOccurrences(mapping(), missing).reasons).toContain('SUPPORTING_OPERATION_OCCURRENCE_MISSING');
  const failed = raw(); failed[1].status = 'failed'; failed[1].observed = false;
  expect(mapOperationReceiptOccurrences(mapping(), failed).reasons).toContain('OPERATION_OCCURRENCE_EXECUTION_INCOMPLETE');
  const optional = mapping(); optional.supporting[1].required = false;
  expect(mapOperationReceiptOccurrences(optional, missing).status).toBe('complete');
});

test('缺失或重复序列不得猜测调用顺序，无时间观察不构成操作证据', () => {
  for (const sequence of [undefined, 0, 2]) {
    const data = raw(); data[1].sequence = sequence;
    expect(mapOperationReceiptOccurrences(mapping(), data).reasons).toContain('OPERATION_OCCURRENCE_SEQUENCE_INVALID');
  }
  const data = raw(); data[0].startedAt = 'unknown';
  expect(mapOperationReceiptOccurrences(mapping(), data).reasons).toContain('OPERATION_OCCURRENCE_EXECUTION_INCOMPLETE');
});
