import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import { FileAuditEventStore } from '../../src/audit/event-log';
import {
  evaluateAuditStepLifecycle,
  isPassAuthorizingAuditStep,
} from '../../src/audit/playwright-step-audit';
import PlaywrightAuditStepReporter from '../../src/reporters/playwright-audit-step.reporter';
import { evaluateSystemTestRuntimeContract } from '../../src/automation/system-test/system-test-runtime-contract';

test.describe('系统无关 Playwright 步骤实时审计合同', () => {
  test('可见 test.step 应在开始时实时落盘并在结束时形成唯一终态', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-step-audit-'));
    const logPath = path.join(root, 'events.jsonl');
    const previous = snapshotEnvironment();
    Object.assign(process.env, {
      SYSTEM_TEST_AUDIT_EVENT_LOG: logPath,
      SYSTEM_TEST_RUN_ID: 'run-step-001',
      SYSTEM_TEST_APPLICATION_ID: 'application-neutral',
      SYSTEM_TEST_BUSINESS_DOMAIN_ID: 'domain-neutral',
      SYSTEM_TEST_PLAN_ID: 'plan-neutral',
    });
    try {
      const reporter = new PlaywrightAuditStepReporter({ classifyStep: () => 'assertion' });
      const testCase = fakeTestCase('CASE-STEP-001');
      const result = fakeResult('passed');
      const step = fakeStep({ id: 'step-1', title: '验证结果 token=raw-secret', category: 'test.step', duration: 12 });
      reporter.onTestBegin(testCase, result);
      reporter.onStepBegin(testCase, result, step);
      const store = new FileAuditEventStore({ filePath: logPath });
      expect(store.readAll()).toHaveLength(2);
      expect(fs.readFileSync(logPath, 'utf8')).not.toContain('raw-secret');
      reporter.onStepEnd(testCase, result, step);
      reporter.onTestEnd(testCase, result);
      const events = store.readAll();
      expect(events.map((event) => event.eventType)).toEqual(['case.started', 'step.started', 'step.completed', 'case.completed']);
      expect(events[2]).toMatchObject({
        caseId: 'CASE-STEP-001', runId: 'run-step-001', durationMs: 12, outcome: 'success',
        details: { stepId: '0:1', stepKind: 'assertion', authorizesPass: false, realtime: true },
      });
      expect(evaluateAuditStepLifecycle(events, ['0:1'])).toMatchObject({ status: 'complete', findings: [] });
      expect(store.verifyIntegrity()).toEqual({ valid: true, count: 4, diagnostics: [] });
    } finally {
      restoreEnvironment(previous);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('失败步骤必须形成失败终态，内部技术调用默认不得写入', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-step-audit-failure-'));
    const logPath = path.join(root, 'events.jsonl');
    const previous = snapshotEnvironment();
    Object.assign(process.env, {
      SYSTEM_TEST_AUDIT_EVENT_LOG: logPath,
      SYSTEM_TEST_RUN_ID: 'run-step-002',
      SYSTEM_TEST_APPLICATION_ID: 'application-neutral',
    });
    try {
      const reporter = new PlaywrightAuditStepReporter();
      const testCase = fakeTestCase('CASE-STEP-002');
      const result = fakeResult('failed');
      const internal = fakeStep({ id: 'internal', title: 'locator.click', category: 'pw:api', duration: 1 });
      reporter.onStepBegin(testCase, result, internal);
      reporter.onStepEnd(testCase, result, internal);
      expect(fs.existsSync(logPath)).toBe(false);
      const failed = fakeStep({ id: 'step-failed', title: '执行业务动作', category: 'test.step', duration: 8, error: new Error('expected failure') });
      reporter.onTestBegin(testCase, result);
      reporter.onStepBegin(testCase, result, failed);
      reporter.onStepEnd(testCase, result, failed);
      reporter.onTestEnd(testCase, result);
      expect(new FileAuditEventStore({ filePath: logPath }).readAll().map((event) => event.eventType))
        .toEqual(['case.started', 'step.started', 'step.failed', 'case.completed']);
    } finally {
      restoreEnvironment(previous);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('缺少开始或终态必须判不完整，步骤遥测不得替代业务收据', () => {
    const incomplete = evaluateAuditStepLifecycle([{
      eventType: 'step.completed', runId: 'run-1', caseId: 'CASE-1', details: { stepId: 'step-1' },
    }], ['step-1']);
    expect(incomplete).toMatchObject({ status: 'incomplete', findings: [{ code: 'STEP_START_MISSING', stepId: 'step-1' }] });
    expect(isPassAuthorizingAuditStep()).toBe(false);
    expect(evaluateSystemTestRuntimeContract({
      caseId: 'CASE-1', requiredOperationKeys: ['item:update'], requiredAssertionIds: [],
      operationReceipts: [], assertionReceipts: [],
    })).toMatchObject({ status: 'incomplete', missingOperationKeys: ['item:update'] });
  });
});

function fakeTestCase(caseId: string): TestCase {
  return { id: 'test-id', annotations: [{ type: 'system-test-case-id', description: caseId }] } as unknown as TestCase;
}

function fakeResult(status: TestResult['status']): TestResult {
  return { status, retry: 0, startTime: new Date('2026-09-01T00:00:00.000Z'), duration: 12 } as unknown as TestResult;
}

function fakeStep(input: { id: string; title: string; category: string; duration: number; error?: Error }): TestStep {
  return { ...input, startTime: new Date('2026-09-01T00:00:00.000Z') } as unknown as TestStep;
}

function snapshotEnvironment(): Record<string, string | undefined> {
  return Object.fromEntries(['SYSTEM_TEST_AUDIT_EVENT_LOG', 'SYSTEM_TEST_RUN_ID', 'SYSTEM_TEST_APPLICATION_ID', 'SYSTEM_TEST_BUSINESS_DOMAIN_ID', 'SYSTEM_TEST_PLAN_ID']
    .map((key) => [key, process.env[key]]));
}

function restoreEnvironment(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
