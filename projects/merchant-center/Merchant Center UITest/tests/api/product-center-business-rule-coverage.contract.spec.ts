import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterBusinessRuleCoverage } from '../../scripts/build-product-center-business-rule-coverage';
import { buildProductCenterBusinessRuleObservationLedger } from '../../scripts/build-product-center-business-rule-observation-ledger';
import { observeProductCenterRuleExecution } from '../../adapters/product-center/product-center-business-rule-observation-adapter';
import { buildBusinessRuleCandidate, type BusinessRuleExecutionReceipt } from '../../automation/system-test/business-rule-lifecycle';

const projectRoot = path.resolve(__dirname, '../..');

test.describe('商品中心业务规则覆盖率与反向观察合同', () => {
  test('覆盖率报告消费真实迁移状态并明确时间/上下文缺口', () => {
    const report = buildProductCenterBusinessRuleCoverage();
    expect(report.summary.formalRules).toBe(28);
    expect(report.summary.generationReadyRules).toBe(15);
    expect(report.summary.formalRulesPresentInAuthoritativeDocument).toBe(28);
    expect(report.summary.formalRulesMissingFromAuthoritativeDocument).toBe(0);
    expect(report.summary.formalBusinessStructurallyCoveredRules).toBe(28);
    expect(report.summary.formalBusinessPartialRules).toBe(0);
    expect(report.summary.formalExecutionVerifiedRules).toBe(4);
    expect(report.summary.rulesWithConflictAssessment).toBe(report.summary.formalRules);
    expect(report.summary.rulesWithoutConflictAssessment).toBe(0);
    expect(report.summary.rulesWithUnknownEffectiveContext).toBe(27);
    expect(report.gaps).not.toContain('FORMAL_RULE_OBLIGATION_COVERAGE_PARTIAL');
    expect(report.gaps).toContain('CURRENT_EXECUTION_OBLIGATION_EVIDENCE_MISSING');
    expect(report.gaps).toContain('CURRENT_RECEIPT_FINGERPRINT_MISMATCH');
    expect(report.gaps).toContain('RULE_TIME_EVIDENCE_INCOMPLETE');
    expect(report.gaps).toContain('RULE_EFFECTIVE_CONTEXT_UNKNOWN');
    expect(report.gaps).toContain('TEST_PLAN_RULE_CANDIDATES_REMAIN_UNREVIEWED');
    const migration = JSON.parse(fs.readFileSync(path.join(
      projectRoot, 'adapters/test-automation-platform/reports/merchant-center-migration-closure.json',
    ), 'utf8'));
    if (migration.status === 'complete') expect(report.gaps).not.toContain('MIGRATION_ACCEPTANCE_PENDING');
    else expect(report.gaps).toContain('MIGRATION_ACCEPTANCE_PENDING');
    expect(report.sourceFingerprints.migration).toBe(migration.inputFingerprint);
  });

  test('BR-ITEM-010 的跨类型名称边界由正式用例和附加自动化共同覆盖', () => {
    const report = buildProductCenterBusinessRuleCoverage();
    const uniqueness = report.ruleCoverage.find((item) => item.ruleId === 'BR-ITEM-010');
    expect(uniqueness).toBeTruthy();
    expect(uniqueness?.businessAssessment.maturity).toBe('structurally-covered');
    expect(uniqueness?.businessAssessment.missingObligationIds).toEqual([]);
    expect(uniqueness?.automationAssessment.maturity).toBe('structurally-covered');
    expect(uniqueness?.automationAssessment.missingObligationIds).toEqual([]);
    expect(uniqueness?.missingObligations).toEqual([]);
    expect(report.coverageGapCandidates.filter((item) => item.sourceRuleId === 'BR-ITEM-010')).toEqual([]);

    const canonicalCaseDocument = fs.readFileSync(path.join(
      projectRoot,
      '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
    ), 'utf8');
    expect(canonicalCaseDocument).toContain('用例编号：TC-ITEM-PKG-078');
    const confirmations = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/reviews/product-center-item-rule-confirmations.json',
    ), 'utf8'));
    const confirmation = confirmations.confirmations.find((item: { ruleId?: string }) => item.ruleId === 'BR-ITEM-010');
    expect(confirmation?.linkedCanonicalIds).toContain('TC-ITEM-PKG-078');
    const bindings = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-cases/canonical/product-center-item-authoritative-automation-bindings.json',
    ), 'utf8'));
    expect((bindings.bindings ?? []).some((item: { caseId?: string }) => item.caseId === 'TC-ITEM-PKG-078')).toBe(false);
    const supplementalBindings = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-plan-additional-automation-bindings.json',
    ), 'utf8'));
    expect((supplementalBindings.bindings ?? []).map((item: { caseId?: string }) => item.caseId)).toEqual(expect.arrayContaining([
      'TC-ITEM-PKG-078', 'TC-ITEM-PKG-079',
    ]));
  });

  test('候选、历史、冲突和废弃规则不得进入二十八条正式规则分母', () => {
    const report = buildProductCenterBusinessRuleCoverage();
    const formal = report.documentRuleLedger.filter((item) => item.status === 'formal');
    expect(formal).toHaveLength(28);
    expect(new Set(formal.map((item) => item.ruleId)).size).toBe(28);
    expect(formal.map((item) => item.ruleId)).not.toContain('BR-ITEM-INDUSTRY-INHERITANCE');
    expect(report.summary.documentStatusCounts.deprecated).toBeGreaterThanOrEqual(1);
    expect(report.summary.documentStatusCounts.conflicted).toBe(0);
    expect(report.summary.candidateRules).toBe(225);
    expect(report.summary.formalRules).toBe(28);
  });

  test('相同输入连续构建保持输入指纹、报告指纹和生成时间不变', () => {
    const first = buildProductCenterBusinessRuleCoverage();
    const second = buildProductCenterBusinessRuleCoverage();
    expect(second.inputFingerprint).toBe(first.inputFingerprint);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.generatedAt).toBe(first.generatedAt);
  });

  test('当前完整收据语义未变化时不生成候选，新增用例仅保留映射缺口', () => {
    const report = buildProductCenterBusinessRuleObservationLedger();
    expect(report.status).toBe('operational-with-mapping-gaps');
    expect(report.summary.observationsEligibleForCandidate).toBe(0);
    expect(report.summary.completeReceiptsMapped).toBe(4);
    expect(report.diagnostics.length).toBeGreaterThanOrEqual(12);
    for (const diagnostic of report.recoveryDiagnostics) {
      expect(diagnostic.ruleId).toMatch(/^BR-/);
      expect(diagnostic.caseId).toMatch(/^TC-/);
      expect([
        'recoverable-from-immutable-artifact',
        'rerun-approval-required',
        'index-repair-required',
      ]).toContain(diagnostic.recoveryStatus);
      expect(diagnostic.nextAction).toContain('原始证据');
      expect(diagnostic.nextAction).toContain('禁止用当前覆盖文件补录');
    }
    expect(report.executionImpact).toEqual({ existingPassedCasesInvalidated: false, rerunCaseIds: [], moduleDeliveryBlocked: false });
  });

  test('观察到相同语义不得伪造候选，观察到不同语义才允许候选资格', () => {
    const candidate = buildBusinessRuleCandidate({
      ruleId: 'BR-PC-OBS-001', ruleType: 'normative', statement: '商品保存成功。',
      scope: { applicationId: 'merchant-center', businessDomainId: 'product-center-item', entityTypes: ['item'], operationKeys: ['item.create'], channels: ['ui'] },
      sourceRegistry: [{ sourceId: 'source:fixture', kind: 'human-confirmation', path: 'fixture', locator: 'fixture', fingerprint: 'a'.repeat(64), verified: true }],
      effectiveVersion: 'qa', effectiveContext: { environmentIds: ['qa'], tenantIds: [], roleIds: ['operator'], locales: ['zh-CN'], routes: ['/items'], featureFlags: [] },
      supersedes: [], conflictsWith: [], linkedCaseIds: ['TC-PC-OBS-001'], linkedBindingIds: ['binding:TC-PC-OBS-001'], verificationStatus: 'verified',
      semantics: { preconditions: ['已进入商品页'], entities: ['item'], actions: ['保存'], stateTransitions: [], constraints: [], outcomes: ['商品保存成功'], sideEffects: [], assertionSurfaces: [{ assertionId: 'item-saved', fieldId: 'item.id', channel: 'ui', authority: 'page', terminalCondition: '成功提示可见' }], cleanup: { policyStatus: 'verified', required: false, apiZeroResidueRequired: false, uiZeroResidueRequired: false } },
      previousRuleFingerprint: null,
    });
    const receipt: BusinessRuleExecutionReceipt = {
      receiptId: 'receipt:obs', ruleId: candidate.ruleId, ruleFingerprint: candidate.ruleFingerprint, caseId: 'TC-PC-OBS-001', applicationId: 'merchant-center', businessDomainId: 'product-center-item', executionStatus: 'passed', evidenceStatus: 'complete', assertionIdsRequired: ['item-saved'], assertionIdsObserved: ['item-saved'], operationReceiptIds: ['operation:save'], uiEvidenceIds: ['ui:save'], apiEvidenceIds: [], downstreamEvidenceIds: [], cleanup: { required: false, apiZeroResidue: false, uiZeroResidue: false }, observedStatement: '当前版本商品保存成功。',
    };
    const result = observeProductCenterRuleExecution({ rule: { ...candidate, approval: { decision: 'approved', approvedBy: 'fixture', approvedAt: '2026-08-30T00:00:00.000Z', rationale: 'fixture', candidateFingerprint: candidate.ruleFingerprint, candidateSourceFingerprint: candidate.sourceFingerprint } }, receipt, caseFingerprint: 'b'.repeat(64), expectedCaseFingerprint: 'b'.repeat(64), implementationFingerprint: null, expectedImplementationFingerprint: null, executionContextFingerprint: null, expectedExecutionContextFingerprint: null });
    expect(result.semanticChangeDetected).toBe(true);
    expect(result.eligibleForCandidate).toBe(true);
    expect(result.candidate?.ruleType).toBe('observed');
  });
});
