import { expect, test } from '@playwright/test';
import {
  buildBusinessRuleCandidate,
  type BusinessRuleDocument,
} from '../../src/automation/system-test/business-rule-lifecycle';
import {
  buildBusinessRuleChangeTrigger,
  promoteBusinessRuleSemanticBaseline,
} from '../../src/automation/system-test/business-rule-change-trigger';

function rule(statement: string, caseId = 'TC-INVENTORY-001'): BusinessRuleDocument {
  const candidate = buildBusinessRuleCandidate({
    ruleId: 'BR-INVENTORY-001',
    ruleType: 'normative',
    statement,
    scope: {
      applicationId: 'inventory-reference-app', businessDomainId: 'inventory',
      entityTypes: ['stock-item'], operationKeys: ['inventory.stock.update'], channels: ['admin-ui'],
    },
    sourceRegistry: [{
      sourceId: 'prd:inventory:section-3', kind: 'prd', path: 'requirements/inventory.md',
      locator: 'section:3', fingerprint: 'a'.repeat(64), verified: true,
    }],
    effectiveVersion: 'inventory-v1',
    effectiveContext: { environmentIds: ['qa'], tenantIds: [], roleIds: ['inventory-admin'], locales: ['zh-CN'], routes: ['/inventory'], featureFlags: [] },
    supersedes: [], conflictsWith: [], linkedCaseIds: [caseId], linkedBindingIds: [`binding:${caseId}`],
    verificationStatus: 'verified',
    semantics: {
      preconditions: ['存在库存商品。'], entities: ['stock-item'], actions: ['调整库存并保存。'],
      stateTransitions: [], constraints: [], outcomes: ['商品状态更新。'], sideEffects: [],
      assertionSurfaces: [{ assertionId: 'inventory-ui-status', fieldId: 'saleStatus', channel: 'ui', authority: 'inventory-detail', terminalCondition: '状态更新' }],
      cleanup: { policyStatus: 'verified', required: false, apiZeroResidueRequired: false, uiZeroResidueRequired: false },
    },
    previousRuleFingerprint: null,
  });
  return { ...candidate, approval: {
    decision: 'approved', approvedBy: 'product-owner', approvedAt: '2026-08-23T00:00:00.000Z',
    rationale: 'contract-test', candidateFingerprint: candidate.ruleFingerprint, candidateSourceFingerprint: candidate.sourceFingerprint,
  } };
}

function receipt(caseFingerprint: string, recordedAt = '2026-08-22T00:00:00.000Z', implementationFingerprint: string | null = null): { caseId: string; caseFingerprint: string; implementationFingerprint: string | null; status: 'passed'; evidenceStatus: 'complete'; assertionStatuses: ['verified']; recordedAt: string } {
  return {
    caseId: 'TC-INVENTORY-001', caseFingerprint, implementationFingerprint,
    status: 'passed', evidenceStatus: 'complete', assertionStatuses: ['verified'], recordedAt,
  };
}

test.describe('通用业务规则变更触发器合同', () => {
  test('规则指纹变化只触发有当前完整收据的受影响用例', () => {
    const current = rule('库存为零时商品不可售。');
    const baseline = rule('库存小于或等于零时商品不可售。');
    const result = buildBusinessRuleChangeTrigger({
      currentRules: [current],
      baseline: { schemaVersion: '1.0.0', baselineId: 'inventory-baseline-v1', applicationId: 'inventory-reference-app', businessDomainId: 'inventory', rules: [{ ruleId: current.ruleId, ruleFingerprint: baseline.ruleFingerprint }] },
      cases: [{ caseId: 'TC-INVENTORY-001', currentCaseFingerprint: 'case-v1', disposition: 'ready', receipts: [receipt('case-v1')] }],
    });
    expect(result).toMatchObject({ status: 'changed', changedRuleIds: ['BR-INVENTORY-001'], affectedCaseIds: ['TC-INVENTORY-001'], rerunCaseIds: ['TC-INVENTORY-001'], preservedPassedCaseIds: [] });
  });

  test('规则确认后的当前完整收据自动解除重验并形成基线晋级候选', () => {
    const current = rule('库存为零时商品不可售。');
    const baseline = rule('库存小于或等于零时商品不可售。');
    const result = buildBusinessRuleChangeTrigger({
      currentRules: [current],
      baseline: { schemaVersion: '1.0.0', baselineId: 'inventory-baseline-v1', applicationId: 'inventory-reference-app', businessDomainId: 'inventory', rules: [{ ruleId: current.ruleId, ruleFingerprint: baseline.ruleFingerprint }] },
      cases: [{ caseId: 'TC-INVENTORY-001', currentCaseFingerprint: 'case-v1', currentImplementationFingerprint: 'impl-v1', disposition: 'ready', receipts: [receipt('case-v1', '2026-08-24T00:00:00.000Z', 'impl-v1')] }],
    });
    expect(result).toMatchObject({ rerunCaseIds: [], revalidatedCaseIds: ['TC-INVENTORY-001'], verifiedRuleIds: ['BR-INVENTORY-001'], preservedPassedCaseIds: ['TC-INVENTORY-001'] });
    const promotion = promoteBusinessRuleSemanticBaseline({
      baseline: { schemaVersion: '1.0.0', baselineId: 'inventory-baseline-v1', applicationId: 'inventory-reference-app', businessDomainId: 'inventory', rules: [{ ruleId: current.ruleId, ruleFingerprint: baseline.ruleFingerprint }] },
      currentRules: [current],
      trigger: result,
    });
    expect(promotion).toMatchObject({
      status: 'promoted', promotedRuleIds: ['BR-INVENTORY-001'],
      revalidatedCaseIds: ['TC-INVENTORY-001'], formalRuleSemanticsModified: false,
      baseline: { rules: [{ ruleId: 'BR-INVENTORY-001', ruleFingerprint: current.ruleFingerprint }] },
    });
  });

  test('缺少基线只产生诊断，不把全部用例误判为重跑', () => {
    const current = rule('库存为零时商品不可售。');
    const result = buildBusinessRuleChangeTrigger({
      currentRules: [current],
      baseline: { schemaVersion: '1.0.0', baselineId: 'empty', applicationId: 'inventory-reference-app', businessDomainId: 'inventory', rules: [] },
      cases: [{ caseId: 'TC-INVENTORY-001', currentCaseFingerprint: 'case-v1', disposition: 'ready', receipts: [receipt('case-v1')] }],
    });
    expect(result.status).toBe('baseline-incomplete');
    expect(result.rerunCaseIds).toEqual([]);
    expect(result.diagnostics).toEqual(['BASELINE_RULE_MISSING:BR-INVENTORY-001']);
  });

  test('其他应用的规则基线不得用于当前方案', () => {
    const current = rule('库存为零时商品不可售。');
    const result = buildBusinessRuleChangeTrigger({
      currentRules: [current],
      baseline: { schemaVersion: '1.0.0', baselineId: 'foreign', applicationId: 'foreign-app', businessDomainId: 'inventory', rules: [{ ruleId: current.ruleId, ruleFingerprint: current.ruleFingerprint }] },
      cases: [],
    });
    expect(result.status).toBe('baseline-incomplete');
    expect(result.diagnostics).toEqual(['BASELINE_APPLICATION_MISMATCH']);
  });

  test('语义指纹模式只接受语义匹配收据且不受方案级指纹漂移影响', () => {
    const current = rule('库存为零时商品不可售。');
    const result = buildBusinessRuleChangeTrigger({
      currentRules: [current],
      baseline: {
        schemaVersion: '1.0.0', baselineId: 'semantic', applicationId: 'inventory-reference-app',
        businessDomainId: 'inventory', rules: [{ ruleId: current.ruleId, ruleFingerprint: current.ruleFingerprint }],
      },
      cases: [{
        caseId: 'TC-INVENTORY-001',
        currentCaseFingerprint: 'effective-v2',
        currentSemanticCaseFingerprint: 'semantic-v1',
        fingerprintMatchMode: 'semantic',
        disposition: 'ready',
        receipts: [
          { ...receipt('effective-v1'), semanticCaseFingerprint: 'semantic-v1' },
          { ...receipt('effective-v2'), semanticCaseFingerprint: 'semantic-stale' },
        ],
      }],
    });
    expect(result).toMatchObject({
      status: 'unchanged', rerunCaseIds: [], preservedPassedCaseIds: ['TC-INVENTORY-001'],
    });

    const stale = buildBusinessRuleChangeTrigger({
      currentRules: [current],
      baseline: {
        schemaVersion: '1.0.0', baselineId: 'semantic', applicationId: 'inventory-reference-app',
        businessDomainId: 'inventory', rules: [{ ruleId: current.ruleId, ruleFingerprint: current.ruleFingerprint }],
      },
      cases: [{
        caseId: 'TC-INVENTORY-001', currentCaseFingerprint: 'effective-v2',
        currentSemanticCaseFingerprint: 'semantic-v1', fingerprintMatchMode: 'semantic', disposition: 'ready',
        receipts: [{ ...receipt('effective-v2'), semanticCaseFingerprint: 'semantic-stale' }],
      }],
    });
    expect(stale).toMatchObject({ status: 'unchanged', rerunCaseIds: [], preservedPassedCaseIds: [] });
  });
});
