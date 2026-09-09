import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterBusinessRuleScenarioCoverage } from '../../scripts/build-product-center-business-rule-scenario-coverage';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from '../../scripts/build-product-center-business-rule-lifecycle-snapshot';

const projectRoot = path.resolve(__dirname, '../..');

test.describe('商品中心业务规则相关场景覆盖合同', () => {
  test('报告应覆盖规则治理 CRUD 和全部正式规则的商品行为场景', () => {
    const report = buildProductCenterBusinessRuleScenarioCoverage();
    const lifecycle = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
    expect(report.summary.formalRules).toBe(lifecycle.rules.length);
    expect(report.summary.formalRulesWithBehaviorCoverage).toBe(lifecycle.rules.length);
    expect(report.summary.governanceScenarios).toBeGreaterThanOrEqual(15);
    expect(report.scenarios.some((item) => item.operation === 'create-candidate' && item.status === 'covered')).toBe(true);
    expect(report.scenarios.some((item) => item.operation === 'read-formal-rule' && item.status === 'covered')).toBe(true);
    expect(report.scenarios.some((item) => item.operation === 'update-revise-rule' && item.status === 'covered')).toBe(true);
    expect(report.scenarios.some((item) => item.operation === 'delete-or-retire-rule' && item.status === 'covered')).toBe(true);
    expect(report.scenarios.some((item) => item.operation === 'restore-or-rollback-rule' && item.status === 'covered')).toBe(true);
    expect(report.scenarios.some((item) => item.operation === 'reject-or-hold-candidate' && item.status === 'covered')).toBe(true);
    expect(report.scenarios.some((item) => item.operation === 'revoke-approval' && item.status === 'covered')).toBe(true);
    expect(report.scenarios.filter((item) => item.category === 'product-behavior').every((item) => item.ruleIds.length === 1)).toBe(true);
  });

  test('缺口应可追溯且不得修改执行状态', () => {
    const report = buildProductCenterBusinessRuleScenarioCoverage();
    expect(report.status).toBe('incomplete');
    expect(report.gaps.map((item) => item.gapCode)).toEqual(expect.arrayContaining([
      'RULE_TIME_CONTEXT_EVIDENCE_PENDING',
      'CROSS_SYSTEM_PILOT_REQUIRED',
    ]));
    expect(report.gaps.map((item) => item.gapCode)).not.toContain('RULE_BEHAVIOR_SYNC_NOT_VERIFIED');
    expect(report.executionImpact).toEqual({
      existingPassedCasesInvalidated: false,
      rerunCaseIds: [],
      moduleDeliveryBlocked: false,
      businessExecutionStarted: false,
    });
    expect(report.guardrails).toMatchObject({
      sourceBounded: true,
      missingSemanticsMayNotBeInferred: true,
      notDefinedDoesNotMeanProductFailure: true,
      reportMayNotAuthorizeExecution: true,
    });
  });

  test('报告产物应落盘且唯一场景 ID 可稳定复核', () => {
    const report = buildProductCenterBusinessRuleScenarioCoverage();
    const scenarioIds = report.scenarios.map((item) => item.scenarioId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(fs.existsSync(path.join(projectRoot, '../deliverables/test-plan-governance/product-center-business-rule-scenario-coverage.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, '../deliverables/test-plan-governance/product-center-business-rule-scenario-coverage.md'))).toBe(true);
  });
});
