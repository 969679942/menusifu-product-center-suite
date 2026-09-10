import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { summarizeIndexedRunTelemetry } from '../../src/governance/indexed-run-telemetry';
import { registerEvidenceInvocation } from '../../src/governance/run-evidence-index';
import { indexedInvocationFixture, syntheticAttempt } from '../helpers/indexed-run-fixture';

function isolated(run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'indexed-run-telemetry-'));
  try { run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('跨调用重试身份独立计数，历史范围与当前选择分离，重叠区间只计一次', () => isolated((root) => {
  const first = indexedInvocationFixture(root, ['A', 'B'], [syntheticAttempt('A', 0, 100), syntheticAttempt('B', 50, 100)]);
  const second = indexedInvocationFixture(root, ['A'], [syntheticAttempt('A', 120, 100, 'failed'), syntheticAttempt('A', 230, 20, 'skipped', 1)]);
  const result = summarizeIndexedRunTelemetry(root, 'run-1', second.entry.invocationId);
  expect(result.coverageStatus).toBe('complete');
  expect(result.historySelectedCaseIds).toEqual(['A', 'B']);
  expect(result.currentInvocation).toMatchObject({ selectedCaseIds: ['A'], terminalCaseIds: [], skippedCaseIds: ['A'], incompleteCaseIds: ['A'] });
  expect(result.observedExecutedCaseIds).toEqual(['A', 'B']);
  expect(result.totals).toMatchObject({ actualAttemptCount: 3, registrationResultCount: 4, uniqueExecutedCaseCount: 2,
    testAttemptWorkMs: 300, testAttemptWallMs: 220, averageTestAttemptDurationMs: 100 });
  expect(result.invocations.map((item) => item.invocationId)).toEqual([first.entry.invocationId, second.entry.invocationId]);
  expect(result.invocations.every((item) => item.ledgerHash?.length === 64)).toBe(true);
  expect(result).toMatchObject({ businessPassAuthorized: false, runnerWallMs: null, nonRunnerOverheadMs: null });
}));

test('历史缺head或尚未终结时只展示已观察下限，不伪造整体总数', () => isolated((root) => {
  const identity = { runId: 'run-1', selectedCaseIds: ['A'], contractFingerprint: '1'.repeat(64),
    implementationFingerprint: '2'.repeat(64), executionCandidateFingerprint: '3'.repeat(64) };
  registerEvidenceInvocation(root, identity);
  indexedInvocationFixture(root, ['A'], [syntheticAttempt('A', 0, 10)]);
  const result = summarizeIndexedRunTelemetry(root, 'run-1');
  expect(result.coverageStatus).toBe('partial');
  expect(result.reasons).toEqual(['HISTORICAL_INVOCATION_REPORT_MISSING']);
  expect(result.observed.actualAttemptCount).toBe(1);
  expect(Object.values(result.totals).every((value) => value === null)).toBe(true);
  expect(result.invocations[0]).toMatchObject({ ledgerHash: null, actualAttemptCount: null });
}));

test('进行中尝试保留启动事实但不估算结束耗时，跳过登记不增加实际执行', () => isolated((root) => {
  indexedInvocationFixture(root, ['A', 'B'], [syntheticAttempt('A', 0, null, 'running'), syntheticAttempt('B', 0, 0, 'skipped')], false);
  const result = summarizeIndexedRunTelemetry(root, 'run-1');
  expect(result.coverageStatus).toBe('partial');
  expect(result.observed).toMatchObject({ actualAttemptCount: 1, registrationResultCount: 1, uniqueExecutedCaseCount: 1,
    testAttemptWorkMs: null, testAttemptWallMs: null, averageTestAttemptDurationMs: null });
  expect(result.currentInvocation?.terminalCaseIds).toEqual([]);
  expect(result.totals.actualAttemptCount).toBeNull();
}));

test('只有跳过的已终结调用允许真实执行零值，但无平均耗时或业务通过', () => isolated((root) => {
  indexedInvocationFixture(root, ['A'], [syntheticAttempt('A', 0, 0, 'skipped')]);
  const result = summarizeIndexedRunTelemetry(root, 'run-1');
  expect(result.totals).toEqual({ actualAttemptCount: 0, registrationResultCount: 1, uniqueExecutedCaseCount: 0,
    testAttemptWorkMs: 0, testAttemptWallMs: 0, averageTestAttemptDurationMs: null });
  expect(result.currentInvocation?.incompleteCaseIds).toEqual(['A']);
}));

test('篡改主视图、快照或切换到未产报告的新调用均不能消费旧统计', () => isolated((root) => {
  const first = indexedInvocationFixture(root, ['A'], [syntheticAttempt('A', 0, 10)]);
  const view = path.join(root, 'evidence-ledger.json'); const bytes = fs.readFileSync(view);
  fs.writeFileSync(view, '{"password":"do-not-expose"');
  const altered = summarizeIndexedRunTelemetry(root, 'run-1');
  expect(altered.coverageStatus).toBe('unavailable');
  expect(altered.totals.actualAttemptCount).toBeNull();
  expect(JSON.stringify(altered)).not.toContain('do-not-expose');
  fs.writeFileSync(view, bytes);
  const hash = summarizeIndexedRunTelemetry(root, 'run-1').currentInvocation!.ledgerHash;
  const snapshot = path.join(root, `.artifact-history/objects/${hash}.bin`); const preserved = fs.readFileSync(snapshot);
  fs.writeFileSync(snapshot, '{}');
  expect(summarizeIndexedRunTelemetry(root, 'run-1').reasons).toEqual(['INDEXED_LEDGER_HASH_MISMATCH']);
  fs.writeFileSync(snapshot, preserved);
  registerEvidenceInvocation(root, first.identity);
  expect(summarizeIndexedRunTelemetry(root, 'run-1').reasons).toEqual(['CURRENT_INVOCATION_REPORT_MISSING']);
  expect(summarizeIndexedRunTelemetry(root, 'run-1', first.entry.invocationId).coverageStatus).toBe('unavailable');
}));

test('索引前旧账本按原字节保留但不伪造调用，总历史范围与次数保持未知', () => isolated((root) => {
  const legacy = '{ "schemaVersion": "1.0.0", "cases": [{"caseId":"OLD"}] }\n';
  fs.writeFileSync(path.join(root, 'evidence-ledger.json'), legacy);
  indexedInvocationFixture(root, ['A'], [syntheticAttempt('A', 0, 10)]);
  const result = summarizeIndexedRunTelemetry(root, 'run-1');
  expect(result.coverageStatus).toBe('partial');
  expect(result.reasons).toEqual(['UNINDEXED_RUN_HISTORY']);
  expect(result.indexedSelectedCaseIds).toEqual(['A']);
  expect(result.historySelectedCaseIds).toBeNull();
  expect(result.observed.actualAttemptCount).toBe(1);
  expect(result.totals.actualAttemptCount).toBeNull();
  expect(result.invocations).toHaveLength(1);
  const index = JSON.parse(fs.readFileSync(path.join(root, 'evidence-invocations/index.json'), 'utf8'));
  expect(fs.readFileSync(path.join(root, index.preIndexHistory.ledgerSnapshot), 'utf8')).toBe(legacy);
  fs.writeFileSync(path.join(root, 'evidence-invocations/index.json'), JSON.stringify({ ...index, preIndexHistory: { status: 'none' } }));
  expect(summarizeIndexedRunTelemetry(root, 'run-1').coverageStatus).toBe('unavailable');
  fs.writeFileSync(path.join(root, 'evidence-invocations/index.json'), JSON.stringify(index));
  fs.writeFileSync(path.join(root, index.preIndexHistory.ledgerSnapshot), '{}');
  expect(summarizeIndexedRunTelemetry(root, 'run-1').coverageStatus).toBe('unavailable');
}));

test('旧账本含敏感正文时注册停止，不将原文写入历史快照', () => isolated((root) => {
  fs.writeFileSync(path.join(root, 'evidence-ledger.json'), '{"password":"synthetic-private-before-index"}');
  expect(() => indexedInvocationFixture(root, ['A'], [syntheticAttempt('A', 0, 10)])).toThrow('EVIDENCE_SENSITIVE_CONTENT_REJECTED');
  expect(fs.existsSync(path.join(root, '.artifact-history/objects'))).toBe(false);
  expect(fs.existsSync(path.join(root, 'evidence-invocations/index.json'))).toBe(false);
}));

test('旧索引未声明历史起点时不得静默推断没有索引前执行', () => isolated((root) => {
  indexedInvocationFixture(root, ['A'], [syntheticAttempt('A', 0, 10)]);
  const file = path.join(root, 'evidence-invocations/index.json');
  const index = JSON.parse(fs.readFileSync(file, 'utf8')); delete index.preIndexHistory;
  fs.writeFileSync(file, JSON.stringify(index));
  const result = summarizeIndexedRunTelemetry(root, 'run-1');
  expect(result.coverageStatus).toBe('partial');
  expect(result.totals.actualAttemptCount).toBeNull();
  expect(result.historySelectedCaseIds).toBeNull();
}));
