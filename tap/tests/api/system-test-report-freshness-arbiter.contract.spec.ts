import { expect, test } from '@playwright/test';
import {
  arbitrateSystemTestReportFreshness,
  type SystemTestCurrentReceipt,
  type SystemTestReportCandidate,
} from '../../src/automation/system-test/system-test-report-freshness-arbiter';

const receipt: SystemTestCurrentReceipt = {
  caseId: 'CASE-001',
  caseFingerprint: 'case-v2',
  implementationFingerprint: 'impl-v2',
  receiptFingerprint: 'receipt-v2',
  recordedAt: '2026-09-01T10:00:00.000Z',
};

function report(overrides: Partial<SystemTestReportCandidate> = {}): SystemTestReportCandidate {
  return {
    applicationId: 'application-a',
    scope: 'scope-a',
    artifactId: 'report-current',
    generatedAt: '2026-09-01T10:05:00.000Z',
    authorityPath: 'output/report-current',
    cases: [{ ...receipt }],
    summary: { total: 1, passed: 1 },
    ...overrides,
  };
}

test.describe('系统测试报告当前状态仲裁合同', () => {
  test('旧报告与新局部收据并存时旧报告失效且隐藏数字', () => {
    const result = arbitrateSystemTestReportFreshness({
      applicationId: 'application-a',
      scope: 'scope-a',
      expectedCaseIds: ['CASE-001'],
      candidates: [report({ artifactId: 'report-old', generatedAt: '2026-09-01T09:00:00.000Z', cases: [{ ...receipt, receiptFingerprint: 'receipt-v1' }] })],
      currentReceipts: [receipt],
    });
    expect(result).toMatchObject({ status: 'stale', authorityPath: null, summary: null });
    expect(result.reasons).toContain('CURRENT_RECEIPT_NEWER_THAN_REPORT');
  });

  test('报告时间较新但收据指纹不匹配仍失效', () => {
    const result = arbitrateSystemTestReportFreshness({
      applicationId: 'application-a', scope: 'scope-a', expectedCaseIds: ['CASE-001'],
      candidates: [report({ cases: [{ ...receipt, receiptFingerprint: 'wrong' }] })], currentReceipts: [receipt],
    });
    expect(result.status).toBe('stale');
    expect(result.reasons).toContain('CURRENT_RECEIPT_FINGERPRINT_MISMATCH');
    expect(result.summary).toBeNull();
  });

  test('局部范围报告不得充当全量范围权威入口', () => {
    const result = arbitrateSystemTestReportFreshness({
      applicationId: 'application-a', scope: 'landed-420', expectedCaseIds: ['CASE-001'],
      candidates: [report({ scope: 'current-five' })], currentReceipts: [receipt],
    });
    expect(result).toMatchObject({ status: 'unknown', reasons: ['REPORT_SCOPE_NOT_FOUND'], summary: null });
  });

  test('未显式提供范围必须在仲裁前报错', () => {
    expect(() => arbitrateSystemTestReportFreshness({
      applicationId: 'application-a', scope: ' ', expectedCaseIds: [], candidates: [], currentReceipts: [],
    })).toThrow('CURRENT_REPORT_SCOPE_REQUIRED');
  });

  test('只有当前且指纹一致的报告可以暴露汇总数字', () => {
    const result = arbitrateSystemTestReportFreshness({
      applicationId: 'application-a', scope: 'scope-a', expectedCaseIds: ['CASE-001'],
      candidates: [report()], currentReceipts: [receipt],
    });
    expect(result).toMatchObject({
      status: 'current', authorityPath: 'output/report-current', summary: { total: 1, passed: 1 },
    });
  });
});
