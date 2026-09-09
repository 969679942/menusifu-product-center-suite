import { expect, test } from '@playwright/test';
import {
  buildProductCenterAssetLifecycle,
  selectCurrentExecution,
  type ExecutionRecord,
} from '../../scripts/build-product-center-asset-lifecycle';

test.describe('商品中心统一资产生命周期合同', () => {
  test('正式用例、绑定、执行、收据和索引使用同一 caseId 分母', () => {
    const result = buildProductCenterAssetLifecycle({ write: false });
    expect(result.ledger.identity).toEqual({
      applicationId: 'merchant-center',
      businessDomainId: 'product-center',
      scope: 'product-center-all-formal-cases',
    });
    expect(result.ledger.summary.planned).toBe(result.ledger.cases.length);
    expect(result.ledger.summary.planned).toBeGreaterThan(0);
    expect(result.ledger.summary.planned).toBe(
      result.ledger.summary.executionEligible + result.ledger.summary.classifiedExclusions,
    );
    expect(result.ledger.invariants.plannedEqualsEligiblePlusExclusions).toBe(true);
    expect(result.ledger.invariants.executionEligibleEqualsExecuted).toBe(false);
    expect(result.ledger.invariants.executedEqualsPassedPlusFailed).toBe(true);
    expect(result.ledger.invariants.noDuplicateCaseIds).toBe(true);
    expect(result.ledger.invariants.noOrphanIndexEntries).toBe(true);
    expect(result.ledger.invariants.noOrphanReferenceEntries).toBe(true);
    expect(result.ledger.invariants.noPassedWithoutCompleteReceipt).toBe(true);
    expect(result.ledger.summary.invariantStatus).toBe('violated');
    expect(result.ledger.summary.reconciliationIssues).toBeGreaterThanOrEqual(0);
  });

  test('生成物包含逐条派生状态和来源清单', () => {
    const result = buildProductCenterAssetLifecycle({ write: false });
    expect(result.ledger.sourceManifest.length).toBeGreaterThanOrEqual(6);
    expect(result.ledger.cases).toHaveLength(result.ledger.summary.planned);
    expect(result.ledger.cases.every((item) => item.canonical.caseFingerprint.length === 64)).toBe(true);
    expect(result.ledger.cases.every((item) => item.lifecycleStatus)).toBe(true);
  });

  test('历史收据用于对账但精确当前身份记录必须优先', () => {
    const current = 'a'.repeat(64);
    const stale = 'b'.repeat(64);
    const record: ExecutionRecord = {
      caseId: 'TC-FLV-SEA-041',
      caseFingerprint: current,
      implementationFingerprint: stale,
      executionContextFingerprint: current,
      status: 'passed',
      evidenceStatus: 'complete',
      receiptEvidenceFingerprint: current,
      evidenceFileFingerprint: current,
      recordedAt: '2026-09-05T00:00:00.000Z',
    };
    expect(selectCurrentExecution([record], record.caseId, current, current, current)).toEqual(record);
    expect(selectCurrentExecution([{ ...record, implementationFingerprint: current }], record.caseId, current, current, current))
      .toEqual(expect.objectContaining({ status: 'passed' }));
  });
});
