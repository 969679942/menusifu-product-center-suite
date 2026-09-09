import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterBusinessRuleGovernanceOperations } from '../../scripts/build-product-center-business-rule-governance-operations';
import { buildProductCenterBusinessRuleTimeContextReview } from '../../scripts/build-product-center-business-rule-time-context-review';
import { buildProductCenterBusinessRuleScenarioCoverage } from '../../scripts/build-product-center-business-rule-scenario-coverage';
import { buildProductCenterBusinessRuleConfirmationQueue } from '../../scripts/build-product-center-business-rule-confirmation-queue';
import { assessEvidenceAttachmentFingerprint } from '../../scripts/build-product-center-business-rule-observation-ledger';
import { buildProductCenterBusinessRuleObservationLedger } from '../../scripts/build-product-center-business-rule-observation-ledger';
import { buildProductCenterBusinessRulePostOptimizationAnalysis } from '../../scripts/build-product-center-business-rule-post-optimization-analysis';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from '../../scripts/build-product-center-business-rule-lifecycle-snapshot';

const projectRoot = path.resolve(__dirname, '../..');
const workspaceRoot = path.resolve(projectRoot, '..');

test.describe('商品中心业务规则治理操作适配合同', () => {
  test('七类治理操作必须全部由公共合同覆盖且不修改正式规则或授权执行', () => {
    const report = buildProductCenterBusinessRuleGovernanceOperations();
    const lifecycle = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
    expect(report.status).toBe('contract-ready');
    expect(report.summary).toMatchObject({
      formalRulesInspected: lifecycle.rules.length,
      supportedOperations: 7,
      contractCoveredOperations: 7,
      currentFormalRulesMutated: 0,
      currentCasesRerun: 0,
    });
    expect(report.operations.map((item) => item.operation)).toEqual([
      'candidate-rejected', 'candidate-held', 'rule-retired', 'rule-restored',
      'rule-rolled-back', 'approval-revoked', 'approval-expired',
    ]);
    expect(report.guardrails).toMatchObject({
      appendOnly: true, formalRuleSemanticsMutated: false, operationMayAuthorizeBusinessExecution: false,
      consumersMustApplyEligibilityGate: true, rollbackTargetMustExistInHistory: true,
    });
  });

  test('时间上下文审查必须识别空显式上下文和权威时间证据缺口', () => {
    const report = buildProductCenterBusinessRuleTimeContextReview();
    const lifecycle = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
    expect(report.summary.totalRules).toBe(lifecycle.rules.length);
    // 时间、版本和执行上下文都可以由来源/发布记录自动采集，
    // 因此缺口应进入自动证据收集，而不是把用户重新拉入人工确认。
    expect(report.summary.confirmationRequired).toBe(0);
    expect(report.summary.humanConfirmationRequired).toBe(0);
    expect(report.summary.evidenceCollectionRequired).toBe(lifecycle.rules.length);
    expect(report.rules.find((item) => item.ruleId === 'BR-ITEM-010')).toMatchObject({
      contextEvidenceStatus: 'metadata-inconsistent',
      confirmationRequired: false,
      humanConfirmationRequired: false,
      evidenceCollectionRequired: true,
    });
    expect(report.guardrails).toMatchObject({ timeOrderValidated: true, explicitContextMayNotBeEmpty: true });
  });

  test('结构化下游契约关闭已确认语义缺口，确认队列只保留真实未定义项', () => {
    buildProductCenterBusinessRuleTimeContextReview();
    buildProductCenterBusinessRuleGovernanceOperations();
    const coverage = buildProductCenterBusinessRuleScenarioCoverage();
    const governanceOperations = coverage.scenarios.filter((item) => [
      'BR-SCENARIO-GOV-REJECT-HOLD', 'BR-SCENARIO-GOV-DELETE-RETIRE',
      'BR-SCENARIO-GOV-RESTORE-ROLLBACK', 'BR-SCENARIO-GOV-APPROVAL-REVOKE',
    ].includes(item.scenarioId));
    expect(governanceOperations.every((item) => item.status === 'covered')).toBe(true);

    const downstreamScenarios = coverage.scenarios.filter((item) =>
      item.ruleIds.includes('BR-ITEM-COMBO-OPTIONAL-EDIT-BOUNDARY') &&
      ['update/group-edit', 'delete/group-delete'].includes(item.operation),
    );
    expect(downstreamScenarios).toHaveLength(2);
    expect(downstreamScenarios.every((item) => item.status === 'covered')).toBe(true);

    const queue = buildProductCenterBusinessRuleConfirmationQueue();
    expect(queue.status).toBe('complete');
    expect(queue.summary.total).toBe(0);
    expect(queue.items).toEqual([]);
    expect(queue.executionImpact).toMatchObject({
      existingPassedCasesInvalidated: false, rerunCaseIds: [], businessExecutionStarted: false,
    });
  });

  test('证据覆盖恢复诊断必须阻止覆盖文件冒充不可变原始收据', () => {
    const report = JSON.parse(fs.readFileSync(path.join(
      projectRoot, 'output/governance/product-center-business-rule-observation-ledger.json',
    ), 'utf8'));
    expect(report.recoveryDiagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of report.recoveryDiagnostics) {
      expect(diagnostic.ruleId).toMatch(/^BR-/);
      expect(diagnostic.caseId).toMatch(/^TC-/);
      expect(['recoverable-from-immutable-artifact', 'rerun-approval-required', 'index-repair-required'])
        .toContain(diagnostic.recoveryStatus);
      expect(diagnostic.nextAction).toContain('原始证据');
      expect(diagnostic.nextAction).toContain('禁止用当前覆盖文件补录');
    }
    expect(assessEvidenceAttachmentFingerprint('a'.repeat(64), 'b'.repeat(64))).toEqual({
      status: 'mismatch', expected: 'a'.repeat(64), actual: 'b'.repeat(64),
      recoveryStatus: 'rerun-approval-required',
    });
    expect(report.guardrails).toMatchObject({
      overwrittenEvidenceMayNotBeReconstructed: true,
      rerunRequiresExplicitApproval: true,
    });
    const scenarioPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-business-rule-scenario-coverage.json');
    expect(fs.existsSync(scenarioPath)).toBe(true);
  });

  test('优化后分析必须保留规则变更影响、未启动业务执行并保留真实阻断', () => {
    const observation = buildProductCenterBusinessRuleObservationLedger();
    buildProductCenterBusinessRuleScenarioCoverage();
    const report = buildProductCenterBusinessRulePostOptimizationAnalysis();
    expect(report.acceptance.staticOptimizationAccepted).toBe(false);
    expect(report.acceptance.fullGovernanceCompletionAccepted).toBe(false);
    expect(report.doubleCheck).toMatchObject({
      formalRuleSemanticsModified: false,
      businessExecutionStarted: false,
      existingPassedCasesInvalidated: false,
      frozenLifecyclePreserved: true,
      crossSystemPilotStarted: false,
      missingBusinessSemanticsInferred: false,
    });
    expect(report.doubleCheck.rerunCaseIds).toEqual([]);
    expect(report.actualResults).toMatchObject({
      governanceOperations: '7/7', observationReceiptsMapped: observation.summary.completeReceiptsMapped,
      observationDiagnostics: observation.summary.diagnostics, semanticChangesDetected: 0,
    });
  });
});
