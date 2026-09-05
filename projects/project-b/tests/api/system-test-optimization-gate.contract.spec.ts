import { expect, test } from '@playwright/test';
import { buildMerchantCenterOptimizationPlan } from '../../utils/system-test-optimization-gate';
import type { SystemTestCompiledCase } from '../../../../Test Automation Platform/src/automation/system-test/system-test-contract';

function compiledCase(caseId: string): SystemTestCompiledCase {
  return {
    caseId,
    ruleId: `rule-${caseId}`,
    ruleStatus: 'observed',
    recipeId: `recipe-${caseId}`,
    action: 'create',
    dataProfileId: 'profile-a',
    mutationMode: 'reversible',
    expectationClaims: [{
      claimId: `claim-${caseId}`,
      expected: '业务结果符合来源要求',
      assertionAdapterId: 'assertion-a',
      observationChannel: 'ui',
      authority: 'user-visible',
      terminalCondition: '页面状态稳定',
      fieldId: 'field-a',
      assertionSurfaceId: 'surface-a',
    }],
    requiredContextGuards: [{ adapterId: 'context-a', phase: 'before-action' }, { adapterId: 'context-a', phase: 'before-assertion' }],
    requiredActionReadiness: { adapterId: 'readiness-a', contractIds: ['contract-a'], requiredIdentityKeys: ['id'], cleanupIdentityKeys: ['id'] },
    requiredOperationKeys: ['operation-shared'],
    probeAdapterIds: ['probe-a'],
    externalCapabilities: [],
  };
}

test.describe('Merchant Center 批量整改门禁适配', () => {
  test('适配器只负责映射，公共门禁负责显式影响集复核状态', () => {
    const plan = buildMerchantCenterOptimizationPlan({
      planId: 'merchant-plan', contractFingerprint: 'contract-fingerprint', cases: [compiledCase('CASE-001'), compiledCase('CASE-002')], maxBatchSize: 20,
      caseFingerprints: { 'CASE-001': 'case-fingerprint-1', 'CASE-002': 'case-fingerprint-2' },
      implementationFingerprints: { 'CASE-001': 'implementation-fingerprint-1', 'CASE-002': 'implementation-fingerprint-2' },
      impactedCaseIds: ['CASE-001'],
    });
    expect(plan.status).toBe('canary-required');
    expect(plan.canaryCaseIds).toEqual(['CASE-001']);
    expect(plan.executionEligibleCaseIds).toEqual(['CASE-001']);
  });

  test('适配器透传公共门禁的完整产品偏差排除结果', () => {
    const plan = buildMerchantCenterOptimizationPlan({
      planId: 'merchant-product-finding', contractFingerprint: 'contract-product-finding',
      cases: [compiledCase('CASE-101'), compiledCase('CASE-102')], maxBatchSize: 20,
      caseFingerprints: { 'CASE-101': 'case-fingerprint-101', 'CASE-102': 'case-fingerprint-102' },
      implementationFingerprints: { 'CASE-101': 'implementation-fingerprint-101', 'CASE-102': 'implementation-fingerprint-102' },
      impactedCaseIds: ['CASE-101'],
      canaryReceipts: [{
        caseId: 'CASE-101', caseFingerprint: 'case-fingerprint-101', implementationFingerprint: 'implementation-fingerprint-101',
        status: 'failed', failureCategory: 'product-failure', evidenceComplete: true,
        operationReceiptCount: 1, assertionReceiptCount: 1, cleanupComplete: true, contextReceiptComplete: true,
      }],
    });
    expect(plan.status).toBe('revalidation-complete');
    expect(plan.acceptedFindingCaseIds).toEqual(['CASE-101']);
    expect(plan.executionEligibleCaseIds).toEqual([]);
  });
});
