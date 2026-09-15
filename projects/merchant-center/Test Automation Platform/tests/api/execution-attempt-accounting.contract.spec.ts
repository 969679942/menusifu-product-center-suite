import { test, expect } from '@playwright/test';
import { accountExecutionAttempts, type ExecutionAttempt } from '../../src/governance/execution-attempt-accounting';
const attempt = (caseId: string, retry = 0, status: ExecutionAttempt['status'] = 'passed', start = 0): ExecutionAttempt => ({
  runId: 'run-1', caseId, testId: caseId, retry, status, startedAt: new Date(start).toISOString(), durationMs: status === 'running' ? null : 100,
});
const project = (attempts: ExecutionAttempt[]) => accountExecutionAttempts({ runId: 'run-1', selectedCaseIds: ['A', 'B', 'C'], attempts });

test('重试、唯一执行、跳过和终态独立，最新尝试不按回调顺序推断', () => {
  const result = project([attempt('A', 1, 'passed', 100), attempt('B', 0, 'skipped'), attempt('A', 0, 'failed'), attempt('C', 0, 'running')]);
  expect(result.status).toBe('valid');
  expect(result.actualAttemptCount).toBe(3);
  expect(result.registrationResultCount).toBe(3);
  expect(result.executedCaseIds).toEqual(['A', 'C']);
  expect(result.terminalCaseIds).toEqual(['A']);
  expect(result.skippedCaseIds).toEqual(['B']);
  expect(result.incompleteCaseIds).toEqual(['B', 'C']);
  expect(result.testAttemptWorkMs).toBeNull();
  expect(result.testAttemptWallMs).toBeNull();
  expect(project([attempt('A'), attempt('A', 1, 'failed', 200)]).terminalAttempts[0].status).toBe('failed');
  expect(project([attempt('A'), attempt('A', 1, 'skipped', 200)]).terminalCaseIds).toEqual([]);
});

test('并发测试耗时用区间并集，累计工作耗时单独保存', () => {
  const result = project([attempt('A'), attempt('B', 0, 'failed', 50), attempt('C', 0, 'skipped')]);
  expect(result.testAttemptWorkMs).toBe(200);
  expect(result.testAttemptWallMs).toBe(150);
});

test('重复或断档重试、重复测试身份、越界与错误运行身份不得产生可信计数', () => {
  for (const values of [[attempt('A'), attempt('A')], [attempt('A', 1)],
    [attempt('A'), { ...attempt('A', 1), testId: 'other-test' }], [attempt('OUTSIDE')], [{ ...attempt('A'), runId: 'old-run' }],
    [{ ...attempt('A'), durationMs: -1 }]]) {
    const result = project(values);
    expect(result.status).toBe('invalid');
    expect(result.actualAttemptCount).toBeNull();
    expect(result.terminalCaseIds).toEqual([]);
  }
});
