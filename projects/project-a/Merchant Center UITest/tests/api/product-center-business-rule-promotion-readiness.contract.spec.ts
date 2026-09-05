import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterBusinessRulePromotionReadiness } from '../../utils/product-center-business-rule-promotion';
import { buildProductCenterBusinessRulePromotionBatchPlan } from '../../scripts/build-product-center-business-rule-promotion-batch-plan';
import { buildProductCenterDocumentRulePromotionPlan } from '../../scripts/build-product-center-document-rule-promotion-plan';
import { buildProductCenterDocumentRuleEvidenceRecoveryPlan } from '../../scripts/build-product-center-document-rule-evidence-recovery-plan';
import { buildProductCenterBusinessRuleReviewWorkbench } from '../../scripts/build-product-center-business-rule-review-workbench';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from '../../scripts/build-product-center-business-rule-lifecycle-snapshot';
import {
  buildDocumentRuleBatchPreflight,
  type DocumentRuleObligationMapping,
} from '../../utils/product-center-document-rule-preflight';

const projectRoot = path.resolve(__dirname, '../..');
const workspaceRoot = path.resolve(projectRoot, '..');

function withSyntheticPreflight<T>(input: {
  lifecycleStatus?: string;
  obligationMappings: DocumentRuleObligationMapping[];
}, run: (report: ReturnType<typeof buildDocumentRuleBatchPreflight>) => T): T {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'document-rule-preflight-'));
  const canonicalRoot = path.join(tempRoot, 'cases');
  const landingPath = path.join(tempRoot, 'landing.json');
  const executionPath = path.join(tempRoot, 'execution.json');
  fs.mkdirSync(canonicalRoot, { recursive: true });
  fs.writeFileSync(path.join(canonicalRoot, '合成-正式测试用例.md'), [
    '### 用例编号：TC-SYNTHETIC-001',
    '用例标题：保存后列表展示名称',
    '来源：BR-SYNTHETIC-001',
    ...(input.lifecycleStatus ? [`状态：${input.lifecycleStatus}`] : []),
    '预期结果：',
    '1. 保存后列表展示名称。',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(landingPath, JSON.stringify({ modules: [] }), 'utf8');
  fs.writeFileSync(executionPath, JSON.stringify({ records: [] }), 'utf8');
  try {
    const report = buildDocumentRuleBatchPreflight({
      projectRoot: tempRoot,
      workspaceRoot: tempRoot,
      rules: [{
        ruleId: 'BR-SYNTHETIC-001',
        statement: '保存后列表展示名称',
        moduleSection: '合成模块',
        sourceLabels: ['合成来源'],
        sourceLine: 1,
        linkedCaseIds: ['TC-SYNTHETIC-001'],
      }],
      canonicalCaseRoot: canonicalRoot,
      landingAuditPath: landingPath,
      executionIndexPath: executionPath,
      implementationIdentities: [],
      formalRules: [],
      obligationMappings: input.obligationMappings,
      generatedAt: '2026-09-04T00:00:00.000Z',
    });
    return run(report);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

test.describe('商品中心业务规则候选晋级准备度', () => {
  test('当前候选只生成静态预审，不冒充正式规则或执行验证', () => {
    const report = buildProductCenterBusinessRulePromotionReadiness({ generatedAt: '2026-09-02T00:00:00.000Z' });
    expect(report.authorityBoundary).toMatchObject({
      generatedArtifactsReadOnly: true,
      decisionLedgerIsFormalAuthority: false,
      runtimeMayPromoteToFormal: false,
    });
    expect(report.manifest.summary.total).toBe(225);
    // Low-risk candidates may now be structurally ready for delegated semantic
    // promotion even when current execution verification is still pending.
    expect(report.manifest.summary.green).toBeGreaterThan(0);
    expect(report.manifest.summary.yellow).toBeGreaterThan(0);
    expect(report.manifest.summary.red).toBeLessThan(225);
    expect(report.manifest.summary.batchApprovalEligible).toBeGreaterThan(0);
    expect(report.manifest.candidates.some((item) => item.executionVerified)).toBe(true);
    expect(report.manifest.candidates.some((item) => !item.executionVerified)).toBe(true);
    expect(report.manifest.candidates.some((item) => !item.blockers.includes('SOURCE_NOT_VERIFIED'))).toBe(true);
    expect(report.sourceArtifacts.governanceLifecycle).toBe('frozen');
  });

  test('规则族聚类键包含业务域、操作、商品类型和候选类型', () => {
    const report = buildProductCenterBusinessRulePromotionReadiness({ generatedAt: '2026-09-02T00:00:00.000Z' });
    expect(report.manifest.clusters.length).toBeGreaterThan(1);
    expect(report.manifest.clusters.every((cluster) => cluster.clusterKey.includes('merchant-center|product-center-item|'))).toBe(true);
  });

  test('候选级工作通道分类守恒且不自动要求人工审批', () => {
    const plan = buildProductCenterBusinessRulePromotionBatchPlan();
    expect(plan.candidateWorkItems).toHaveLength(plan.summary.totalCandidates);
    expect(new Set(plan.candidateWorkItems.map((item) => item.candidateId)).size).toBe(plan.summary.totalCandidates);
    expect(plan.candidateWorkItems.every((item) => item.humanActionRequiredNow === false)).toBe(true);
    expect(
      plan.summary.sourceRepairCandidates
      + plan.summary.deferredHoldCandidates
      + plan.summary.formalCoveredCandidates
      + plan.summary.contractTriageCandidates
      + plan.summary.automatedEnrichmentCandidates
      + plan.summary.individualReviewCandidates
      + plan.summary.batchReviewCandidates,
    ).toBe(plan.summary.totalCandidates);
    expect(plan.summary.businessExecutionStarted).toBe(false);
    expect(plan.summary.formalRulesModified).toBe(false);
  });

  test('权威文档待核验规则独立分流，不与测试用例派生候选混为一池', () => {
    const plan = buildProductCenterDocumentRulePromotionPlan();
    expect(plan.summary.pendingLifecycleRules).toBe(plan.workItems.length);
    expect(
      plan.summary.sourceRepair
      + plan.summary.caseDesign
      + plan.summary.receiptJoin
      + plan.summary.batchPreflight,
    ).toBe(plan.summary.pendingLifecycleRules);
    expect(plan.workItems).toHaveLength(plan.summary.pendingLifecycleRules);
    expect(plan.workItems.every((item) => item.humanActionRequiredNow === false)).toBe(true);
    expect(plan.summary.businessExecutionStarted).toBe(false);
    expect(plan.summary.formalRulesModified).toBe(false);
    expect(plan.batchPreflight.summary.rules).toBe(plan.summary.batchPreflight);
    expect(plan.batchPreflight.rules).toHaveLength(plan.summary.batchPreflight);
    expect(plan.batchPreflight.summary.obligations).toBeGreaterThanOrEqual(plan.batchPreflight.summary.rules);
    expect(plan.batchPreflight.rules.every((item) => (
      item.obligations.length > 0
      && item.obligations.every((obligation) => obligation.obligationId.startsWith(`${item.ruleId}:O`))
    ))).toBe(true);
    expect(plan.batchPreflight.guardrails).toMatchObject({
      oneCaseLinkDoesNotImplyFullCoverage: true,
      onlyExplicitObligationMappingsCountAsCovered: true,
      semanticSimilarityCreatesCandidatesOnly: true,
      currentReceiptRequiresCaseImplementationAndContextIdentity: true,
      mutableOrMismatchedEvidenceIsRejected: true,
      noAutomaticApproval: true,
      noAutomaticExecution: true,
    });
    expect(plan.batchPreflight.summary.businessExecutionStarted).toBe(false);
    expect(plan.batchPreflight.summary.formalRulesModified).toBe(false);
    expect(plan.batchPreflight.approvalPackages).toHaveLength(plan.batchPreflight.summary.approvalPackages);
    expect(plan.batchPreflight.summary.approvalEligibleRules).toBeLessThanOrEqual(plan.batchPreflight.summary.rules);
    expect(plan.batchPreflight.summary.approvalReadyButVerificationPendingRules)
      .toBeLessThanOrEqual(plan.batchPreflight.summary.approvalEligibleRules);
    expect(plan.batchPreflight.approvalPackages.every((item) => item.lane === 'batch-approval')).toBe(true);
    expect(plan.batchPreflight.approvalPackages.every((item) => item.status === 'ready-for-human-batch-approval')).toBe(true);
    expect(plan.batchPreflight.approvalPackages.every((item) => item.executionAuthorized === false)).toBe(true);
  });

  test('快速晋级工作台只把批量语义审批和真实冲突交给人工', () => {
    const promotion = buildProductCenterDocumentRulePromotionPlan();
    buildProductCenterBusinessRulePromotionBatchPlan();
    const report = buildProductCenterBusinessRuleReviewWorkbench();
    const lifecycle = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
    const approval = JSON.parse(fs.readFileSync(path.join(
      workspaceRoot,
      'deliverables/test-plan-governance/product-center-document-rule-promotion-decisions.json',
    ), 'utf8')) as { approvedPackageIds: string[]; approvedRuleIds: string[] };
    expect(report.summary).toMatchObject({
      documentRules: 160,
      formalBusinessRules: lifecycle.rules.length,
      documentPendingRules: promotion.summary.pendingLifecycleRules,
      batchApprovalReadyRules: promotion.batchPreflight.summary.approvalEligibleRules,
      batchApprovalPackages: promotion.batchPreflight.summary.approvalPackages,
      approvalReadyAndExecutionVerifiedRules: promotion.batchPreflight.summary.executionVerifiedRules,
      approvalReadyButVerificationPendingRules: promotion.batchPreflight.summary.approvalReadyButVerificationPendingRules,
      individualBusinessDecisions: 0,
      timeContextHumanConfirmationRequired: 0,
      caseDerivedCandidates: 225,
      semanticCandidateClusters: 60,
      caseLevelConfirmedDecisions: 54,
      businessExecutionStarted: false,
      formalRulesModified: false,
      existingResultsInvalidated: false,
    });
    expect(report.reviewBatches.flatMap((item) => item.rules)).toHaveLength(report.summary.batchApprovalReadyRules);
    expect(report.reviewBatches.every((item) => item.executionAuthorized === false)).toBe(true);
    expect(report.individualBusinessDecisions).toEqual([]);
    expect(approval.approvedPackageIds.sort()).toEqual([
      'document-rule-approval-1484ca2864a3',
      'document-rule-approval-76d0bd89181f',
      'document-rule-approval-bb02236a24e9',
      'document-rule-approval-f5d72f252907',
    ]);
    expect(approval.approvedRuleIds.every((ruleId) => lifecycle.rules.some((rule) => rule.ruleId === ruleId))).toBe(true);
    expect(report.reviewBatches.flatMap((item) => item.rules.map((rule) => rule.ruleId))
      .filter((ruleId) => approval.approvedRuleIds.includes(ruleId))).toEqual([]);
    expect(report.terminology.caseLevelConfirmedDecisions).toContain('不等于正式业务规则数量');
  });

  test('语义相似候选不能替代显式义务覆盖声明', () => {
    withSyntheticPreflight({ obligationMappings: [] }, (report) => {
      expect(report.rules[0].obligations[0].caseClaims).toEqual([
        expect.objectContaining({ caseId: 'TC-SYNTHETIC-001', claimBasis: 'semantic-candidate' }),
      ]);
      expect(report.rules[0].obligations[0].structuralStatus).toBe('candidate-only');
      expect(report.rules[0].structuralCoverage).toBe('uncovered');
    });
  });

  test('义务正文漂移必须阻断预审', () => {
    expect(() => withSyntheticPreflight({
      obligationMappings: [{
        ruleId: 'BR-SYNTHETIC-001',
        obligationId: 'BR-SYNTHETIC-001:O01',
        obligationStatement: '已经发生漂移的正文',
        caseClaims: [{ caseId: 'TC-SYNTHETIC-001', assertionIndexes: [1], evidenceBasis: '合成证据' }],
      }],
    }, () => undefined)).toThrow(/规则义务映射正文已漂移/u);
  });

  test('不适用用例不得覆盖现行业务规则', () => {
    expect(() => withSyntheticPreflight({
      lifecycleStatus: 'not-applicable',
      obligationMappings: [{
        ruleId: 'BR-SYNTHETIC-001',
        obligationId: 'BR-SYNTHETIC-001:O01',
        obligationStatement: '保存后列表展示名称',
        caseClaims: [{ caseId: 'TC-SYNTHETIC-001', assertionIndexes: [1], evidenceBasis: '合成证据' }],
      }],
    }, () => undefined)).toThrow(/不适用用例不得覆盖当前规则义务/u);
  });

  test('义务映射引用不存在的预期结果序号必须阻断', () => {
    expect(() => withSyntheticPreflight({
      obligationMappings: [{
        ruleId: 'BR-SYNTHETIC-001',
        obligationId: 'BR-SYNTHETIC-001:O01',
        obligationStatement: '保存后列表展示名称',
        caseClaims: [{ caseId: 'TC-SYNTHETIC-001', assertionIndexes: [2], evidenceBasis: '合成证据' }],
      }],
    }, () => undefined)).toThrow(/规则义务映射断言索引越界/u);
  });

  test('批准后证据恢复工作台不得重开已晋级规则且最小重验集必须由批准收据保留', () => {
    buildProductCenterDocumentRulePromotionPlan();
    const report = buildProductCenterDocumentRuleEvidenceRecoveryPlan('2026-09-04T00:00:00.000Z');
    expect(report.summary.highConfidenceRelatedCases).toBe(0);
    expect(report.summary.immutableReceiptRecoveredCases).toBe(0);
    expect(report.summary.exactReportRecoveredCases).toBe(0);
    expect(report.summary.rawAllureRecoveredCases).toBe(0);
    expect(report.summary.classifiedExclusions).toBe(0);
    expect(report.summary.missingOriginalReceiptCases).toBe(0);
    expect(report.summary.currentReusableCases).toBe(0);
    expect(report.summary.historicalOnlyCases).toBe(0);
    expect(report.summary.minimalRevalidationCandidates).toBe(0);
    expect(report.summary.structuralGapRules).toBe(0);
    expect(report.summary.executionEligibilityGapRules).toBe(0);
    expect(report.minimalRevalidationCaseIds).toEqual(
      report.minimalCoverProof.selectedCases.map((item) => item.caseId).sort(),
    );
    expect(report.minimalCoverProof).toMatchObject({
      complete: true,
      irreducible: true,
      uncoveredObligationIds: [],
      redundantSelectedCaseIds: [],
    });
    expect(report.minimalCoverProof.executableObligationIds).toHaveLength(report.summary.executableObligations);
    expect(report.minimalCoverProof.reusableCoveredObligationIds).toHaveLength(report.summary.obligationsCoveredByCurrentReceipts);
    expect(report.minimalCoverProof.selectedCases).toHaveLength(report.summary.minimalRevalidationCandidates);
    expect(report.minimalCoverProof.selectedCases).toEqual([]);
    expect(report.rulePlans.filter((item) => item.disposition === 'case-design-first')).toHaveLength(0);
    expect(report.executionEligibilityGapRuleIds).toEqual([]);
    expect(report.caseAssessments.filter((item) => item.decision === 'classified-exclusion')).toEqual([]);
    expect(report.guardrails).toMatchObject({
      originalReceiptBytesOrRawAttachmentRequired: true,
      aggregatePassCountsNeverAuthorizeRecovery: true,
      semanticFingerprintIsCurrentItemCaseIdentity: true,
      structuralGapsCloseBeforeExecution: true,
      minimalRevalidationSetIsCompleteAndIrreducible: true,
      noAutomaticApproval: true,
      noAutomaticExecution: true,
    });
    expect(report.summary.businessExecutionStarted).toBe(false);
    expect(report.summary.formalRulesModified).toBe(false);
    expect(report.summary.existingResultsInvalidated).toBe(false);

    const approval = JSON.parse(fs.readFileSync(path.join(
      workspaceRoot,
      'deliverables/test-plan-governance/product-center-document-rule-promotion-decisions.json',
    ), 'utf8')) as {
      approvedRules: Array<{ ruleId: string; verificationStatus: string; revalidationCaseIds: string[]; revalidationSelectionBasis: string }>;
      executionAuthorization: { authorized: boolean };
    };
    const closure = JSON.parse(fs.readFileSync(path.join(
      workspaceRoot,
      'deliverables/test-plan-governance/product-center-closure-audit.json',
    ), 'utf8')) as { incrementalSelection: { recommendedCaseIds: string[] } };
    const receiptSelected = [...new Set(approval.approvedRules.flatMap((rule) => rule.revalidationCaseIds))].sort();
    expect(receiptSelected).toEqual([...closure.incrementalSelection.recommendedCaseIds].sort());
    expect(receiptSelected.length).toBeGreaterThan(0);
    expect(approval.approvedRules.filter((rule) => rule.revalidationCaseIds.length > 0)
      .every((rule) => rule.verificationStatus === 'revalidation-required'
        && rule.revalidationSelectionBasis === 'approved-preflight-minimum-obligation-cover')).toBe(true);
    expect(approval.executionAuthorization.authorized).toBe(false);
  });
});
