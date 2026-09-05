import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  assertCanaryBudget,
  assertSelectionMatchesPlan,
  buildSystemTestRevalidationDecision,
  isReusableSystemTestReceipt,
} from '../../src/automation/system-test/system-test-revalidation-policy';
import { appendSystemTestRepairTelemetry, summarizeSystemTestRepairTelemetry } from '../../src/automation/system-test/system-test-repair-telemetry';

const item = {
  caseId: 'CASE-001',
  caseFingerprint: 'case-v1',
  implementationFingerprint: 'impl-v1',
  expectationCount: 2,
  mutationRequired: true,
};

const receipt = {
  caseId: 'CASE-001',
  caseFingerprint: 'case-v1',
  implementationFingerprint: 'impl-v1',
  status: 'passed' as const,
  evidenceComplete: true,
  operationReceiptCount: 1,
  assertionReceiptCount: 2,
  cleanupComplete: true,
  contextReceiptComplete: true,
};

test.describe('系统测试证据复用与执行兜底合同', () => {
  test('当前完整收据复用，不启动新的业务执行决策', () => {
    expect(isReusableSystemTestReceipt({ item, receipt })).toBe(true);
    expect(buildSystemTestRevalidationDecision({ item, receipt, impactType: 'business-implementation' })).toEqual(expect.objectContaining({
      decision: 'reuse',
      reasonCode: 'CURRENT_COMPLETE_RECEIPT_REUSED',
    }));
  });

  test('报告层变化不使业务实现收据失效', () => {
    expect(isReusableSystemTestReceipt({ item: { ...item, implementationFingerprint: 'report-v2' }, receipt, impactType: 'report-only' })).toBe(true);
    expect(buildSystemTestRevalidationDecision({ item, receipt: undefined, impactType: 'report-only' }).decision).toBe('static-verify');
  });

  test('平台层变化不把历史产品发现升级为业务执行', () => {
    const decision = buildSystemTestRevalidationDecision({
      item: {
        caseId: 'CASE-PLATFORM-ONLY', caseFingerprint: 'case-current', implementationFingerprint: 'impl-current',
        expectationCount: 1, mutationRequired: true, requiredCanary: true,
      },
      receipt: {
        caseId: 'CASE-PLATFORM-ONLY', caseFingerprint: 'case-current', implementationFingerprint: 'impl-current',
        status: 'failed', failureCategory: 'product-failure', evidenceComplete: false,
        operationReceiptCount: 1, assertionReceiptCount: 0, cleanupComplete: true, contextReceiptComplete: false,
      },
      impactType: 'platform-only',
    });
    expect(decision.decision).toBe('static-verify');
    expect(decision.reusable).toBe(false);
  });

  test('缺少上下文收据不得复用或接受产品发现', () => {
    expect(isReusableSystemTestReceipt({ item, receipt: { ...receipt, contextReceiptComplete: undefined } })).toBe(false);
    expect(buildSystemTestRevalidationDecision({ item, receipt: { ...receipt, status: 'failed', failureCategory: 'product-failure', contextReceiptComplete: undefined }, impactType: 'business-implementation' }).decision).toBe('targeted-execute');
  });

  test('哨兵超过数量或比例必须阻断', () => {
    expect(assertCanaryBudget({ candidateCaseIds: Array.from({ length: 21 }, (_, index) => `CASE-${index}`), totalCaseCount: 337 }).allowed).toBe(false);
    expect(assertCanaryBudget({ candidateCaseIds: ['CASE-1', 'CASE-2'], totalCaseCount: 10, maxCanaryRatio: 0.1 }).allowed).toBe(false);
    expect(assertCanaryBudget({ candidateCaseIds: ['CASE-1'], totalCaseCount: 10, maxCanaryRatio: 0.1 }).allowed).toBe(true);
  });

  test('计划与 runner 选择集漂移在浏览器前阻断', () => {
    expect(() => assertSelectionMatchesPlan({ plannedCaseIds: ['CASE-1'], runnerCaseIds: ['CASE-2'], phase: 'contract' }))
      .toThrow('SYSTEM_TEST_SELECTION_DRIFT:contract:missing=CASE-1:unexpected=CASE-2');
  });

  test('修复遥测追加记录且敏感字段脱敏', () => {
    const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-telemetry-')), 'repair-execution-ledger.jsonl');
    appendSystemTestRepairTelemetry({
      filePath,
      eventType: 'repair-attempt',
      sessionId: 'session-1',
      applicationId: 'application-a',
      payload: { attemptNo: 1, password: 'secret', phaseDurationsMs: { browser: 12 } },
      recordedAt: '2026-08-31T00:00:00.000Z',
    });
    const event = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { payload: { password: string } };
    expect(event.payload.password).toBe('[REDACTED]');
    expect(summarizeSystemTestRepairTelemetry(filePath)).toEqual(expect.objectContaining({ eventCount: 1, byType: { 'repair-attempt': 1 } }));
  });
});
