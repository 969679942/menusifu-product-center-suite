import { expect, test } from '@playwright/test';
import { buildProductCenterBusinessRuleObservationLedger } from '../../scripts/build-product-center-business-rule-observation-ledger';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from '../../scripts/build-product-center-business-rule-lifecycle-snapshot';

test.describe('商品中心业务规则执行观察账本合同', () => {
  test('当前收据核对证据文件与上下文后，语义未变化不得生成候选', () => {
    const report = buildProductCenterBusinessRuleObservationLedger();
    const lifecycle = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
    const linkedCaseRelationships = lifecycle.rules.reduce((total, rule) => total + rule.linkedCaseIds.length, 0);
    // 只有完整匹配当前语义、实现和上下文指纹的收据才计入映射；其余保持证据协调，
    // 不得自动升级为当前通过，也不得因报告重建自动启动重跑。
    expect(report.status).toBe('operational-with-mapping-gaps');
    expect(report.summary.formalRulesInspected).toBe(lifecycle.rules.length);
    expect(report.summary.linkedCasesInspected).toBe(linkedCaseRelationships);
    expect(report.summary.completeReceiptsMapped).toBeGreaterThan(0);
    expect(report.summary.completeReceiptsMapped).toBeLessThanOrEqual(linkedCaseRelationships);
    expect(report.summary.observationsEligibleForCandidate).toBe(0);
    expect(report.summary.semanticChangesDetected).toBe(0);
    expect(report.summary.requiredCaseRelationships).toBeGreaterThan(0);
    expect(report.summary.diagnostics).toBeLessThanOrEqual(report.summary.requiredCaseRelationships);
    expect(report.summary.historicalDiagnostics).toBeGreaterThan(0);
    expect(report.historicalDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'BR-ITEM-010',
        caseId: 'TC-ITEM-PKG-078',
        code: 'RECEIPT_IDENTITY_MISMATCH',
      }),
      expect.objectContaining({
        ruleId: 'BR-ITEM-010',
        caseId: 'TC-ITEM-PKG-079',
        code: 'RECEIPT_IDENTITY_MISMATCH',
      }),
    ]));
    expect(report.recoveryDiagnostics.length).toBeGreaterThan(0);
    expect(report.recoveryDiagnostics.every((item) => (
      item.ruleId.startsWith('BR-')
      && item.caseId.startsWith('TC-')
      && item.nextAction.includes('原始证据')
      && item.nextAction.includes('禁止用当前覆盖文件补录')
    ))).toBe(true);
    expect(report.executionImpact).toEqual({
      existingPassedCasesInvalidated: false,
      rerunCaseIds: [],
      moduleDeliveryBlocked: false,
    });
  });
});
