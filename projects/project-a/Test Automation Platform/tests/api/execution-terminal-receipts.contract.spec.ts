import { test, expect } from '@playwright/test';
import {
  resolveEvidenceLedgerTerminalCaseIds,
  resolvePlaywrightExecutionTerminalCaseIds,
  type PlaywrightExecutionReportManifest,
} from '../../src/governance/execution-terminal-receipts';

test.describe('公共逐案终态收据合同', () => {
  test('认证失败且没有真实报告时不得由 blocked 补集伪造终态', () => {
    expect(resolve({
      selectedCaseIds: ['CASE-A', 'CASE-B'], blockedCaseIds: [], reportPaths: [], runnerReports: [],
      authSetupStatus: 'failed', interruptionReason: 'batch-auth-setup-failed',
    }, {})).toEqual([]);
  });

  test('部分报告只能确认实际出现非跳过结果的用例', () => {
    expect(resolve(manifest(['CASE-A', 'CASE-B']), {
      'output/report.json': report([
        testResult('CASE-A', 'passed'),
        testResult('CASE-B', 'skipped'),
      ]),
    })).toEqual(['CASE-A']);
  });

  test('完整报告可确认通过和失败终态但拒绝未声明路由及阻断用例', () => {
    const value = manifest(['CASE-A', 'CASE-B', 'CASE-C']);
    value.blockedCaseIds = ['CASE-C'];
    expect(resolve(value, {
      'output/report.json': report([
        testResult('CASE-A', 'passed'),
        testResult('CASE-B', 'failed'),
        testResult('CASE-C', 'passed'),
        testResult('CASE-OUTSIDE', 'passed'),
      ]),
    })).toEqual(['CASE-A', 'CASE-B']);
  });

  test('批次中断或报告未列入 manifest 时不得授权任何终态', () => {
    const interrupted = manifest(['CASE-A']);
    interrupted.interruptionReason = 'signal:SIGTERM';
    expect(resolve(interrupted, { 'output/report.json': report([testResult('CASE-A', 'passed')]) })).toEqual([]);

    const unlisted = manifest(['CASE-A']);
    unlisted.reportPaths = ['output/other.json'];
    expect(resolve(unlisted, { 'output/report.json': report([testResult('CASE-A', 'passed')]) })).toEqual([]);
  });

  test('证据账本只接受当前双指纹的真实终态记录', () => {
    expect(resolveEvidenceLedgerTerminalCaseIds({
      selectedCaseIds: ['CASE-A', 'CASE-B', 'CASE-C'],
      currentCases: [
        { caseId: 'CASE-A', caseFingerprint: 'case-a', implementationFingerprint: 'impl-a' },
        { caseId: 'CASE-B', caseFingerprint: 'case-b', implementationFingerprint: 'impl-b' },
        { caseId: 'CASE-C', caseFingerprint: 'case-c', implementationFingerprint: 'impl-c' },
      ],
      ledgers: [{ cases: [
        { caseId: 'CASE-A', caseFingerprint: 'case-a', implementationFingerprint: 'impl-a', playwrightStatus: 'passed' },
        { caseId: 'CASE-B', caseFingerprint: 'stale', implementationFingerprint: 'impl-b', playwrightStatus: 'failed' },
        { caseId: 'CASE-C', caseFingerprint: 'case-c', implementationFingerprint: 'impl-c', playwrightStatus: 'skipped' },
      ] }],
    })).toEqual(['CASE-A']);
  });
});

function resolve(
  value: PlaywrightExecutionReportManifest,
  reports: Record<string, { suites: unknown[] }>,
): string[] {
  return resolvePlaywrightExecutionTerminalCaseIds({
    selectedCaseIds: value.selectedCaseIds ?? [],
    manifest: value,
    readReport: (reportPath) => reports[reportPath] ?? null,
  });
}

function manifest(caseIds: string[]): PlaywrightExecutionReportManifest {
  return {
    selectedCaseIds: caseIds,
    blockedCaseIds: [],
    reportPaths: ['output/report.json'],
    runnerReports: [{ reportPath: 'output/report.json', selectedCaseIds: caseIds }],
    authSetupStatus: 'passed',
  };
}

function report(tests: unknown[]): { suites: unknown[] } {
  return { suites: [{ specs: [{ tests }] }] };
}

function testResult(caseId: string, status: string): object {
  return {
    annotations: [{ type: 'canonical-case-id', description: caseId }],
    results: [{ status, startTime: '2026-09-05T00:00:00.000Z' }],
  };
}
