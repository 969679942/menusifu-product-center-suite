import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildProductCenterBusinessRuleLifecycleSnapshot,
  type ProductCenterAutomationBinding,
  type ProductCenterFormalRuleBinding,
  type ProductCenterRuleConfirmation,
} from '../../adapters/product-center/product-center-business-rule-lifecycle-adapter';
import {
  buildBusinessRuleCandidate,
  observeBusinessRuleExecution,
  type BusinessRuleExecutionReceipt,
} from '../../automation/system-test/business-rule-lifecycle';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from '../../scripts/build-product-center-business-rule-lifecycle-snapshot';

const projectRoot = path.resolve(__dirname, '../..');
const formalBindingsPath = 'contracts/product-center/business-rules/product-center-item-formal-rule-bindings.json';
const confirmationsPath = 'contracts/product-center/reviews/product-center-item-rule-confirmations.json';
const automationBindingsPath = 'contracts/product-center/test-cases/canonical/product-center-item-authoritative-automation-bindings.json';
const changeTriggerPath = 'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json';

function currentSnapshot() {
  const formalBindings = readJson<{
    schemaVersion: string;
    collectionId: string;
    bindings: ProductCenterFormalRuleBinding[];
  }>(formalBindingsPath);
  const confirmations = readJson<{
    schemaVersion: string;
    collectionId: string;
    sourceRole?: string;
    confirmations: ProductCenterRuleConfirmation[];
  }>(confirmationsPath);
  const automationBindings = readJson<{
    schemaVersion: string;
    collectionId: string;
    releaseFingerprint?: string;
    bindings: ProductCenterAutomationBinding[];
  }>(automationBindingsPath);
  return buildProductCenterBusinessRuleLifecycleSnapshot({
    formalBindings: { ...formalBindings, sourcePath: formalBindingsPath },
    confirmations: { ...confirmations, sourcePath: confirmationsPath },
    automationBindings: { ...automationBindings, sourcePath: automationBindingsPath },
    executionImpact: readJson<{ rerunCaseIds: string[]; preservedPassedCaseIds: string[] }>(changeTriggerPath),
  });
}

test.describe('商品中心业务规则生命周期适配合同', () => {
  test('文档批量批准自动投影为正式规则但保留真实验证状态', () => {
    const snapshot = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
    const approval = JSON.parse(fs.readFileSync(path.resolve(
      projectRoot,
      '../deliverables/test-plan-governance/product-center-document-rule-promotion-decisions.json',
    ), 'utf8')) as { approvedRules: Array<{ ruleId: string; conflictAssessment?: { status: string } }> };

    expect(snapshot.summary).toMatchObject({ formalBindings: 28, mappedRules: 28, rejectedBindings: 0 });
    expect(snapshot.rules.filter((rule) => rule.verificationStatus === 'verified')).toHaveLength(15);
    expect(snapshot.rules.filter((rule) => rule.verificationStatus === 'revalidation-required')).toHaveLength(13);
    expect(snapshot.rules.find((rule) => rule.ruleId === 'BR-FMT-001')?.verificationStatus).toBe('revalidation-required');
    expect(snapshot.rules.find((rule) => rule.ruleId === 'BR-IMG-001')?.verificationStatus).toBe('revalidation-required');
    expect(snapshot.rules.every((rule) => rule.governance?.conflictAssessment.status === 'assessed-no-conflict')).toBe(true);
    expect(approval.approvedRules.every((rule) => rule.conflictAssessment?.status === 'assessed-no-conflict')).toBe(true);
  });

  test('原六条手工绑定均映射到有效人工确认', () => {
    const snapshot = currentSnapshot();

    expect(snapshot.summary).toMatchObject({ formalBindings: 6, mappedRules: 6, rejectedBindings: 0 });
    expect(snapshot.rules.map((rule) => rule.ruleId)).toEqual([
      'BR-ITEM-CATEGORY-OPTIONAL',
      'BR-ITEM-CATEGORY-LEAF-SELECTION',
      'BR-ITEM-CATEGORY-DIRECT-PARENT-CREATE',
      'BR-ITEM-COMBO-GROUP-REQUIRED',
      'BR-ITEM-COMBO-OPTIONAL-EDIT-BOUNDARY',
      'BR-ITEM-010',
    ]);
    expect(snapshot.rejectedBindings).toEqual([]);
    expect(snapshot.rules.find((rule) => rule.ruleId === 'BR-ITEM-CATEGORY-DIRECT-PARENT-CREATE')).toMatchObject({
      statement: '一级分类下无二级分类时，可以直接选择该一级分类并成功创建商品；编辑时一级分类正确回显，可修改或清空，保存后分类持久化且商品状态保持原状态',
      revision: 3,
      previousRuleFingerprint: '151579aab0bae44486d48faff7f9f7c6003adf60fedced8bb04d5320ea7469c9',
    });
  });

  test('已确认规则具备生效版本、结构化语义、断言面和清理策略并可生成用例', () => {
    const snapshot = currentSnapshot();

    expect(snapshot.summary).toMatchObject({ generationReadyRules: 6, generationBlockedRules: 0 });
    expect(snapshot.candidateCases).toHaveLength(6);
    for (const registration of snapshot.registrations) {
      expect(registration.status).toBe('mapped');
      expect(registration.formalValidationErrors).toEqual([]);
      expect(registration.generationBlockers).toEqual([]);
    }
  });

  test('规则基线未变化时不扩大重验且仅保留语义指纹匹配收据', () => {
    const snapshot = currentSnapshot();

    expect(snapshot.executionImpact).toMatchObject({
      existingPassedCasesInvalidated: false,
      preservedPassedCaseIds: [
        'TC-ITEM-ADD-009', 'TC-ITEM-ADD-040',
        'TC-ITEM-PKG-046', 'TC-ITEM-STD-006', 'TC-ITEM-STD-007', 'TC-ITEM-STD-037',
      ],
      moduleDeliveryBlocked: false,
    });
    expect(snapshot.executionImpact.rerunCaseIds).toEqual([]);
    expect(snapshot.executionImpact.invalidatedCaseIds).toEqual(snapshot.executionImpact.rerunCaseIds);
  });

  test('完整正式规则执行通过后仍只能形成 observed 候选', () => {
    const candidate = buildBusinessRuleCandidate({
      ruleId: 'BR-PC-FIXTURE-001',
      ruleType: 'normative',
      statement: '商品保存后列表展示当前名称。',
      scope: {
        applicationId: 'merchant-center', businessDomainId: 'product-center-item',
        entityTypes: ['item'], operationKeys: ['item.create'], channels: ['ui'],
      },
      sourceRegistry: [{
        sourceId: 'human-confirmation:fixture', kind: 'human-confirmation', path: 'fixture.json',
        locator: 'fixture', fingerprint: 'a'.repeat(64), verified: true,
      }],
      effectiveVersion: 'qa-2026-08-23',
      effectiveContext: {
        environmentIds: ['qa'], tenantIds: [], roleIds: ['admin'], locales: ['zh-CN'],
        routes: ['/pp/brand/list'], featureFlags: [],
      },
      supersedes: [], conflictsWith: [], linkedCaseIds: ['TC-PC-FIXTURE-001'],
      linkedBindingIds: ['automation-binding:TC-PC-FIXTURE-001'], verificationStatus: 'verified',
      semantics: {
        preconditions: ['已进入商品创建页。'], entities: ['item'], actions: ['填写名称并保存。'],
        stateTransitions: [], constraints: [], outcomes: ['列表展示当前名称。'], sideEffects: [],
        assertionSurfaces: [{
          assertionId: 'item-name-ui', fieldId: 'item.name', channel: 'ui',
          authority: 'item-list', terminalCondition: '当前名称可见',
        }],
        cleanup: {
          policyStatus: 'verified', required: true, strategyId: 'cleanup:item-delete',
          apiZeroResidueRequired: true, uiZeroResidueRequired: true,
        },
      },
      previousRuleFingerprint: null,
    });
    const rule = {
      ...candidate,
      approval: {
        decision: 'approved' as const,
        approvedBy: '产品负责人', approvedAt: '2026-08-23T00:00:00.000Z', rationale: '产品确认',
        candidateFingerprint: candidate.ruleFingerprint,
        candidateSourceFingerprint: candidate.sourceFingerprint,
      },
    };
    const receipt: BusinessRuleExecutionReceipt = {
      receiptId: 'receipt:fixture', ruleId: rule.ruleId, ruleFingerprint: rule.ruleFingerprint,
      caseId: 'TC-PC-FIXTURE-001', applicationId: 'merchant-center', businessDomainId: 'product-center-item',
      executionStatus: 'passed', evidenceStatus: 'complete',
      assertionIdsRequired: ['item-name-ui'], assertionIdsObserved: ['item-name-ui'],
      operationReceiptIds: ['operation:item-create'], uiEvidenceIds: ['ui:item-list'], apiEvidenceIds: [],
      downstreamEvidenceIds: [], cleanup: { required: true, apiZeroResidue: true, uiZeroResidue: true },
      observedStatement: '当前版本商品保存后列表展示当前名称。',
    };

    const observation = observeBusinessRuleExecution({ rule, receipt });
    expect(observation).toMatchObject({ result: 'supports', eligibleForCandidate: true, blockers: [] });
    expect(observation.candidate).toMatchObject({
      ruleType: 'observed', approval: null, verificationStatus: 'pending-review',
      previousRuleFingerprint: rule.ruleFingerprint,
    });
  });
});

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')) as T;
}
