import { expect, test } from '@playwright/test';
import {
  classifyHistoricalReceiptCompatibility,
  type TestExecutionIndexRecord,
} from '../../src';

function receipt(overrides: Partial<TestExecutionIndexRecord> = {}): TestExecutionIndexRecord {
  return {
    caseId: 'TC-ORDER-001',
    applicationVersionFingerprint: null,
    releaseObservation: { status: 'unavailable', fingerprint: null, source: 'unavailable', stable: false, observedAt: null },
    executionEpochId: 'run-001',
    executionContextFingerprint: 'context-001',
    caseFingerprint: 'case-001',
    implementationFingerprint: 'a'.repeat(64),
    status: 'passed',
    evidenceStatus: 'complete',
    assertionStatuses: ['verified'],
    cleanupEvidence: { apiZeroResidue: true, uiZeroResidue: true },
    receiptEvidenceFingerprint: 'b'.repeat(64),
    evidenceFileFingerprint: 'c'.repeat(64),
    reuseStatus: 'run-only',
    runId: 'run-001',
    evidencePath: 'output/run-001.json',
    durationMs: 1,
    recordedAt: '2026-09-03T00:00:00.000Z',
    ...overrides,
  };
}

test.describe('系统无关历史收据当前兼容性合同', () => {
  test('只有用例、实现、上下文、断言、清理和证据均完整的收据可导入', () => {
    const result = classifyHistoricalReceiptCompatibility({
      cases: [{
        caseId: 'TC-ORDER-001',
        caseFingerprint: 'case-001',
        implementationFingerprint: 'a'.repeat(64),
        implementationFingerprintRequired: true,
        executionContextFingerprint: 'context-001',
      }],
      receipts: [receipt()],
    });
    expect(result.summary['exact-match-importable']).toBe(1);
    expect(result.importableRecords).toHaveLength(1);
    expect(result.cases[0].blockers).toEqual([]);
  });

  test('方案级或旧用例指纹不能冒充当前逐用例指纹', () => {
    const result = classifyHistoricalReceiptCompatibility({
      cases: [{ caseId: 'TC-ORDER-001', caseFingerprint: 'current-case' }],
      receipts: [receipt({ caseFingerprint: 'old-plan-wide-fingerprint' })],
    });
    expect(result.cases[0]).toMatchObject({
      status: 'case-fingerprint-mismatch',
      blockers: ['CASE_FINGERPRINT_MISMATCH'],
      importableRecordKey: null,
    });
    expect(result.importableRecords).toEqual([]);
  });

  test('实现、上下文、断言和清理缺口分别保持独立分类', () => {
    const current = [{
      caseId: 'TC-ORDER-001', caseFingerprint: 'case-001',
      implementationFingerprint: 'd'.repeat(64), implementationFingerprintRequired: true,
    }];
    expect(classifyHistoricalReceiptCompatibility({ cases: current, receipts: [receipt()] }).cases[0].status)
      .toBe('implementation-fingerprint-mismatch');
    expect(classifyHistoricalReceiptCompatibility({
      cases: [{ caseId: 'TC-ORDER-001', caseFingerprint: 'case-001' }],
      receipts: [receipt({ executionContextFingerprint: null })],
    }).cases[0].status).toBe('execution-context-mismatch');
    expect(classifyHistoricalReceiptCompatibility({
      cases: [{ caseId: 'TC-ORDER-001', caseFingerprint: 'case-001' }],
      receipts: [receipt({ assertionStatuses: [] })],
    }).cases[0].status).toBe('assertion-incomplete');
    expect(classifyHistoricalReceiptCompatibility({
      cases: [{ caseId: 'TC-ORDER-001', caseFingerprint: 'case-001' }],
      receipts: [receipt({ cleanupEvidence: { apiZeroResidue: true, uiZeroResidue: false } })],
    }).cases[0].status).toBe('cleanup-incomplete');
  });
});
