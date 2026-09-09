import { expect, test } from '@playwright/test';
import {
  buildBusinessRulePromotionManifest,
  buildBusinessRuleReviewPackages,
  evaluateBusinessRulePromotionReadiness,
  fingerprintBusinessRulePromotionCandidate,
  fingerprintBusinessRulePromotionSources,
  applyBusinessRulePromotionDecisions,
  type BusinessRulePromotionCandidate,
} from '../../src/automation/system-test/business-rule-promotion';

function candidate(overrides: Partial<BusinessRulePromotionCandidate> = {}): BusinessRulePromotionCandidate {
  const source = [{
    sourceId: 'prd:items:001',
    kind: 'prd' as const,
    path: 'requirements/items.md',
    locator: 'items/name-unique',
    fingerprint: 'a'.repeat(64),
    verified: true,
  }];
  const result: BusinessRulePromotionCandidate = {
    candidateId: 'CBR-ITEM-001',
    ruleId: 'BR-ITEM-001',
    ruleType: 'normative',
    statement: '同一商户内同类型商品名称不可重复',
    scope: { applicationId: 'sample-app', businessDomainId: 'sample-domain-item', entityTypes: ['item'], operationKeys: ['create'], channels: ['标准商品'] },
    sourceRegistry: source,
    sourceFingerprint: fingerprintBusinessRulePromotionSources(source),
    ruleFingerprint: '',
    effectiveVersion: 'current-production',
    effectiveContext: { environmentIds: ['qa'], tenantIds: ['brand-a'], roleIds: ['merchant-admin'], locales: ['zh-CN'], routes: ['/items'], featureFlags: [] },
    effectiveContextKind: 'explicit',
    supersedes: [],
    conflictsWith: [],
    linkedCaseIds: ['TC-ITEM-001'],
    linkedBindingIds: ['automation-binding:TC-ITEM-001'],
    requiredObligationIds: ['obligation:positive', 'obligation:negative'],
    semantics: {
      preconditions: ['已登录并选择商户'],
      entities: ['商品'],
      actions: ['创建商品'],
      stateTransitions: [{ from: '不存在', action: '保存', to: '创建成功' }],
      constraints: ['同一商户同类型名称唯一'],
      outcomes: ['同名创建失败并提示重复'],
      sideEffects: [],
      assertionSurfaces: [{ assertionId: 'item.name', fieldId: 'item.name', channel: 'ui', authority: 'item-create', terminalCondition: '提示重复' }],
      cleanup: { policyStatus: 'verified', required: true, strategyId: 'cleanup-item', apiZeroResidueRequired: true, uiZeroResidueRequired: true },
    },
    currentStatus: 'candidate',
    candidateKind: 'normative',
    familyKey: 'identity:item:create',
    executionVerified: false,
  };
  result.ruleFingerprint = fingerprintBusinessRulePromotionCandidate(result);
  return { ...result, ...overrides };
}

test.describe('公共业务规则正式评审准备度与批次合同', () => {
  test('语义审批与执行验证分离，待补证据同级项不得拖住已就绪规则', () => {
    const packages = buildBusinessRuleReviewPackages([
      {
        unitId: 'BR-READY-001', groupKey: '商品', formalApprovalEligible: true,
        semanticConflict: false, blockerCodes: [], verificationStatus: 'pending',
      },
      {
        unitId: 'BR-BLOCKED-001', groupKey: '商品', formalApprovalEligible: false,
        semanticConflict: false, blockerCodes: ['SOURCE_REQUIRED'], verificationStatus: 'pending',
      },
      {
        unitId: 'BR-CONFLICT-001', groupKey: '商品', formalApprovalEligible: false,
        semanticConflict: true, blockerCodes: ['OPEN_CONFLICT'], verificationStatus: 'verified',
      },
    ]);
    expect(packages).toHaveLength(3);
    expect(packages.find((item) => item.lane === 'batch-approval')).toMatchObject({
      unitIds: ['BR-READY-001'], verifiedUnitIds: [], verificationPendingUnitIds: ['BR-READY-001'],
    });
    expect(packages.find((item) => item.lane === 'evidence-remediation')?.unitIds).toEqual(['BR-BLOCKED-001']);
    expect(packages.find((item) => item.lane === 'individual-review')?.unitIds).toEqual(['BR-CONFLICT-001']);
  });

  test('评审分区必须拒绝重复身份和空分组', () => {
    const base = {
      unitId: 'BR-001', groupKey: '商品', formalApprovalEligible: true,
      semanticConflict: false, blockerCodes: [], verificationStatus: 'verified' as const,
    };
    expect(() => buildBusinessRuleReviewPackages([base, base])).toThrow('BUSINESS_RULE_REVIEW_UNIT_ID_DUPLICATE');
    expect(() => buildBusinessRuleReviewPackages([{ ...base, groupKey: '' }])).toThrow('BUSINESS_RULE_REVIEW_GROUP_KEY_REQUIRED');
  });

  test('完整来源和语义可进入绿色正式评审，但未执行不等于执行验证', () => {
    const item = candidate();
    expect(evaluateBusinessRulePromotionReadiness(item)).toMatchObject({
      status: 'green', formalPromotionEligible: true, testGenerationEligible: true, executionVerified: false,
    });
  });

  test('缺少版本、上下文或测试合同时只进入黄色，不阻断语义评审', () => {
    const item = candidate({ effectiveVersion: null, effectiveContextKind: 'unknown', linkedBindingIds: [], requiredObligationIds: [] });
    const result = evaluateBusinessRulePromotionReadiness(item);
    expect(result.status).toBe('yellow');
    expect(result.formalPromotionEligible).toBe(false);
    expect(result.blockers).toEqual([]);
    expect(result.reviewQuestions.length).toBeGreaterThan(0);
  });

  test('未验证来源或存在冲突时进入红色并禁止批次批准', () => {
    const item = candidate({
      sourceRegistry: [{ ...candidate().sourceRegistry[0], verified: false }],
      conflictsWith: ['BR-ITEM-OLD'],
    });
    item.sourceFingerprint = fingerprintBusinessRulePromotionSources(item.sourceRegistry);
    item.ruleFingerprint = fingerprintBusinessRulePromotionCandidate(item);
    const manifest = buildBusinessRulePromotionManifest({ promotionBatchId: 'batch-001', policyFingerprint: 'policy-001', candidates: [item], generatedAt: '2026-09-02T00:00:00.000Z' });
    expect(manifest.summary).toMatchObject({ total: 1, red: 1, batchApprovalEligible: 0 });
    expect(() => applyBusinessRulePromotionDecisions({
      manifest,
      candidates: [item],
      decisions: [{ candidateId: item.candidateId, decision: 'approve', approvedBy: 'product-owner', approvedAt: '2026-09-02T00:00:00.000Z', rationale: 'test', candidateFingerprint: item.ruleFingerprint, sourceFingerprint: item.sourceFingerprint }],
    })).not.toThrow();
    expect(applyBusinessRulePromotionDecisions({
      manifest,
      candidates: [item],
      decisions: [{ candidateId: item.candidateId, decision: 'approve', approvedBy: 'product-owner', approvedAt: '2026-09-02T00:00:00.000Z', rationale: 'test', candidateFingerprint: item.ruleFingerprint, sourceFingerprint: item.sourceFingerprint }],
    }).heldCandidateIds).toEqual([item.candidateId]);
  });

  test('候选指纹或批次快照变化时拒绝旧批次', () => {
    const item = candidate();
    const manifest = buildBusinessRulePromotionManifest({ promotionBatchId: 'batch-002', policyFingerprint: 'policy-001', candidates: [item], generatedAt: '2026-09-02T00:00:00.000Z' });
    expect(() => applyBusinessRulePromotionDecisions({
      manifest,
      candidates: [{ ...item, statement: '发生变化' }],
      decisions: [],
    })).toThrow('PROMOTION_MANIFEST_SNAPSHOT_STALE');
  });

  test('批次必须逐候选给出决定，遗漏候选不能伪装成整体批准', () => {
    const first = candidate();
    const second = candidate({ candidateId: 'CBR-ITEM-002', ruleId: 'BR-ITEM-002', statement: '同一商户内同类型商品规格不可重复' });
    second.ruleFingerprint = fingerprintBusinessRulePromotionCandidate(second);
    const manifest = buildBusinessRulePromotionManifest({
      promotionBatchId: 'batch-003', policyFingerprint: 'policy-001', candidates: [first, second], generatedAt: '2026-09-02T00:00:00.000Z',
    });
    const result = applyBusinessRulePromotionDecisions({
      manifest,
      candidates: [first, second],
      decisions: [{
        candidateId: first.candidateId,
        decision: 'approve',
        approvedBy: 'product-owner',
        approvedAt: '2026-09-02T00:00:00.000Z',
        rationale: 'test',
        candidateFingerprint: first.ruleFingerprint,
        sourceFingerprint: first.sourceFingerprint,
      }],
    });
    expect(result.status).toBe('partial');
    expect(result.heldCandidateIds).toEqual([second.candidateId]);
    expect(result.diagnostics).toContain(`${second.candidateId}:MISSING_DECISION`);
  });

  test('同一规则族的语义变体和例外候选必须显式标注', () => {
    const first = candidate();
    const second = candidate({ candidateId: 'CBR-ITEM-003', ruleId: 'BR-ITEM-003', statement: '同一商户内同类型商品规格不可重复' });
    second.ruleFingerprint = fingerprintBusinessRulePromotionCandidate(second);
    const exception = candidate({ candidateId: 'CBR-ITEM-004', ruleId: 'BR-ITEM-004', conflictsWith: ['BR-ITEM-OLD'] });
    exception.ruleFingerprint = fingerprintBusinessRulePromotionCandidate(exception);
    const manifest = buildBusinessRulePromotionManifest({
      promotionBatchId: 'batch-004', policyFingerprint: 'policy-001', candidates: [first, second, exception], generatedAt: '2026-09-02T00:00:00.000Z',
    });
    const cluster = manifest.clusters.find((item) => item.clusterKey === manifest.candidates.find((item) => item.candidateId === first.candidateId)?.clusterKey);
    expect(cluster?.semanticVariants).toBe(true);
    expect(cluster?.exceptionCandidateIds).toContain(exception.candidateId);
  });

  test('仅候选身份不同不应被误判为语义变体，显式上下文不同则必须分族', () => {
    const first = candidate();
    const sameMeaning = candidate({ candidateId: 'CBR-ITEM-005', ruleId: 'BR-ITEM-005' });
    sameMeaning.ruleFingerprint = fingerprintBusinessRulePromotionCandidate(sameMeaning);
    const otherContext = candidate({
      candidateId: 'CBR-ITEM-006',
      ruleId: 'BR-ITEM-006',
      effectiveContext: { ...first.effectiveContext, tenantIds: ['brand-b'] },
    });
    otherContext.ruleFingerprint = fingerprintBusinessRulePromotionCandidate(otherContext);
    const manifest = buildBusinessRulePromotionManifest({
      promotionBatchId: 'batch-005', policyFingerprint: 'policy-001', candidates: [first, sameMeaning, otherContext], generatedAt: '2026-09-02T00:00:00.000Z',
    });
    const sameMeaningCluster = manifest.clusters.find((item) => item.candidateIds.includes(first.candidateId));
    expect(sameMeaningCluster?.candidateIds).toEqual(expect.arrayContaining([sameMeaning.candidateId]));
    expect(sameMeaningCluster?.semanticVariants).toBe(false);
    expect(manifest.clusters.filter((item) => item.candidateIds.includes(otherContext.candidateId))).toHaveLength(1);
    expect(manifest.clusters.filter((item) => item.candidateIds.includes(first.candidateId))).toHaveLength(1);
    expect(manifest.clusters.find((item) => item.candidateIds.includes(first.candidateId))?.clusterId)
      .not.toBe(manifest.clusters.find((item) => item.candidateIds.includes(otherContext.candidateId))?.clusterId);
  });

  test('显式上下文为空时不能进入正式评审', () => {
    const item = candidate({
      effectiveContext: { environmentIds: [], tenantIds: [], roleIds: [], locales: [], routes: [], featureFlags: [] },
      effectiveContextKind: 'explicit',
    });
    const result = evaluateBusinessRulePromotionReadiness(item);
    expect(result.status).toBe('red');
    expect(result.blockers).toContain('EFFECTIVE_CONTEXT_EMPTY');
  });

  test('来源和引用 ID 不完整时必须阻断，而不是按数组长度放行', () => {
    const item = candidate({
      ruleId: 'BR ITEM INVALID',
      sourceRegistry: [{ ...candidate().sourceRegistry[0], sourceId: '' }],
      linkedCaseIds: [' '],
    });
    item.sourceFingerprint = fingerprintBusinessRulePromotionSources(item.sourceRegistry);
    item.ruleFingerprint = fingerprintBusinessRulePromotionCandidate(item);
    const result = evaluateBusinessRulePromotionReadiness(item);
    expect(result.status).toBe('red');
    expect(result.blockers).toEqual(expect.arrayContaining([
      'RULE_ID_INVALID', 'SOURCE_ID_REQUIRED', 'REFERENCE_ID_INVALID',
    ]));
  });
});
