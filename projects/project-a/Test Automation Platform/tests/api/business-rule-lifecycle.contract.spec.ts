import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  approveBusinessRuleCandidate,
  buildBusinessRuleCandidate,
  buildBusinessRuleChangeImpact,
  buildBusinessRuleCompletionReviewQueue,
  generateTestCasesFromBusinessRules,
  observeBusinessRuleExecution,
  reviseBusinessRule,
  validateBusinessRule,
  type BusinessRuleCandidateInput,
  type BusinessRuleExecutionReceipt,
} from '../../src/automation/system-test/business-rule-lifecycle';
import {
  FileBusinessRuleGovernanceStore,
  projectBusinessRuleGovernance,
  queryBusinessRuleGovernance,
  validateBusinessRuleGovernanceEligibility,
  validateBusinessRuleTemporalContext,
  type BusinessRuleGovernanceEvent,
} from '../../src/automation/system-test/business-rule-governance';

function candidateInput(overrides: Partial<BusinessRuleCandidateInput> = {}): BusinessRuleCandidateInput {
  return {
    ruleId: 'BR-INVENTORY-001',
    ruleType: 'normative',
    statement: '库存为零时商品不可售。',
    scope: {
      applicationId: 'inventory-reference-app',
      businessDomainId: 'inventory',
      entityTypes: ['stock-item'],
      operationKeys: ['inventory.stock.update'],
      channels: ['admin-ui'],
    },
    sourceRegistry: [{
      sourceId: 'prd:inventory:section-3',
      kind: 'prd',
      path: 'requirements/inventory.md',
      locator: 'section:3',
      fingerprint: 'a'.repeat(64),
      verified: true,
    }],
    effectiveVersion: null,
    effectiveContext: {
      environmentIds: ['qa'], tenantIds: [], roleIds: ['inventory-admin'],
      locales: ['zh-CN'], routes: ['/inventory'], featureFlags: [],
    },
    supersedes: [],
    conflictsWith: [],
    linkedCaseIds: ['TC-INVENTORY-001'],
    linkedBindingIds: ['binding:inventory-stock-zero'],
    verificationStatus: 'pending-review',
    semantics: {
      preconditions: ['存在可售库存商品。'],
      entities: ['stock-item'],
      actions: ['将库存调整为零并保存。'],
      stateTransitions: [{ from: 'in-stock', action: 'set-stock-zero', to: 'out-of-stock' }],
      constraints: ['库存数量不得小于零。'],
      outcomes: ['商品状态变为不可售。'],
      sideEffects: ['库存列表展示零库存。'],
      assertionSurfaces: [
        { assertionId: 'inventory-ui-status', fieldId: 'saleStatus', channel: 'ui', authority: 'inventory-detail', terminalCondition: '不可售' },
        { assertionId: 'inventory-api-status', fieldId: 'stock', channel: 'api', authority: 'inventory-api', terminalCondition: 'stock=0' },
        { assertionId: 'inventory-cleanup', fieldId: 'stock', channel: 'cleanup', authority: 'inventory-api', terminalCondition: 'restored' },
      ],
      cleanup: {
        policyStatus: 'verified', required: true, strategyId: 'cleanup:inventory-restore',
        apiZeroResidueRequired: true, uiZeroResidueRequired: true,
      },
    },
    previousRuleFingerprint: null,
    ...overrides,
  };
}

function completeReceipt(ruleFingerprint: string): BusinessRuleExecutionReceipt {
  return {
    receiptId: 'run-001:TC-INVENTORY-001',
    ruleId: 'BR-INVENTORY-001',
    ruleFingerprint,
    caseId: 'TC-INVENTORY-001',
    applicationId: 'inventory-reference-app',
    businessDomainId: 'inventory',
    executionStatus: 'passed',
    evidenceStatus: 'complete',
    assertionIdsRequired: ['inventory-ui-status', 'inventory-api-status', 'inventory-cleanup'],
    assertionIdsObserved: ['inventory-ui-status', 'inventory-api-status', 'inventory-cleanup'],
    operationReceiptIds: ['operation:set-stock-zero'],
    uiEvidenceIds: ['ui:inventory-detail'],
    apiEvidenceIds: ['api:inventory-stock'],
    downstreamEvidenceIds: [],
    cleanup: { required: true, apiZeroResidue: true, uiZeroResidue: true },
    observedStatement: '当前版本将库存调整为零后商品不可售。',
  };
}

function formalRule(): ReturnType<typeof buildBusinessRuleCandidate> {
  const candidate = buildBusinessRuleCandidate(candidateInput());
  return approveBusinessRuleCandidate({
    candidate,
    effectiveVersion: 'inventory-v1',
    decision: {
      decision: 'approved', approvedBy: 'product-owner', approvedAt: '2026-08-23T00:00:00.000Z',
      rationale: '产品规则确认', candidateFingerprint: candidate.ruleFingerprint,
      candidateSourceFingerprint: candidate.sourceFingerprint,
    },
  });
}

test.describe('通用业务规则生命周期合同', () => {
  test('正式规则必须绑定当前候选指纹并生成可追溯候选用例', () => {
    const candidate = buildBusinessRuleCandidate(candidateInput());
    expect(validateBusinessRule(candidate, 'candidate')).toEqual([]);

    const formal = approveBusinessRuleCandidate({
      candidate,
      effectiveVersion: 'inventory-v1',
      decision: {
        decision: 'approved', approvedBy: 'product-owner', approvedAt: '2026-08-23T00:00:00.000Z',
        rationale: '产品规则确认', candidateFingerprint: candidate.ruleFingerprint,
        candidateSourceFingerprint: candidate.sourceFingerprint,
      },
    });
    expect(validateBusinessRule(formal, 'formal')).toEqual([]);
    expect(generateTestCasesFromBusinessRules([formal])).toMatchObject({
      blocked: [],
      cases: [{
        caseId: 'TC-INVENTORY-001', ruleId: 'BR-INVENTORY-001', status: 'candidate',
        sourceIds: ['prd:inventory:section-3'],
        linkedBindingIds: ['binding:inventory-stock-zero'],
      }],
    });
  });

  test('批准语义但未取得当前执行证据时不得伪造成 verified 或进入用例生成', () => {
    const candidate = buildBusinessRuleCandidate(candidateInput());
    const formal = approveBusinessRuleCandidate({
      candidate,
      effectiveVersion: 'inventory-v1',
      verificationStatus: 'revalidation-required',
      decision: {
        decision: 'approved', approvedBy: 'product-owner', approvedAt: '2026-08-23T00:00:00.000Z',
        rationale: '语义已批准，等待当前执行证据', candidateFingerprint: candidate.ruleFingerprint,
        candidateSourceFingerprint: candidate.sourceFingerprint,
      },
    });

    expect(validateBusinessRule(formal, 'formal')).toEqual([]);
    expect(formal.verificationStatus).toBe('revalidation-required');
    expect(generateTestCasesFromBusinessRules([formal])).toMatchObject({
      cases: [],
      blocked: [{ ruleId: 'BR-INVENTORY-001', blockers: expect.arrayContaining(['VERIFIED_RULE_REQUIRED']) }],
    });
  });

  test('执行通过只能生成运行观察候选，不能自动晋级正式规则', () => {
    const rule = formalRule();
    const observation = observeBusinessRuleExecution({ rule, receipt: completeReceipt(rule.ruleFingerprint) });

    expect(observation).toMatchObject({ result: 'supports', eligibleForCandidate: true, blockers: [] });
    expect(observation.candidate).toMatchObject({
      ruleType: 'observed', approval: null, verificationStatus: 'pending-review',
      previousRuleFingerprint: rule.ruleFingerprint,
    });
    expect(() => approveBusinessRuleCandidate({
      candidate: observation.candidate!,
      effectiveVersion: 'inventory-v2',
      decision: {
        decision: 'approved', approvedBy: 'automation', approvedAt: '2026-08-23T00:00:00.000Z',
        rationale: '执行通过', candidateFingerprint: observation.candidate!.ruleFingerprint,
        candidateSourceFingerprint: observation.candidate!.sourceFingerprint,
      },
    })).toThrow('RULE_TYPE_NOT_FORMALIZABLE');
  });

  test('缺少断言覆盖、操作收据或清理终态时不得产生反向规则候选', () => {
    const rule = formalRule();
    const receipt = completeReceipt(rule.ruleFingerprint);
    receipt.assertionIdsObserved = ['inventory-ui-status'];
    receipt.operationReceiptIds = [];
    receipt.cleanup.apiZeroResidue = false;

    const observation = observeBusinessRuleExecution({ rule, receipt });
    expect(observation.result).toBe('inconclusive');
    expect(observation.candidate).toBeNull();
    expect(observation.blockers).toEqual(expect.arrayContaining([
      'OPERATION_RECEIPT_REQUIRED',
      'ASSERTION_COVERAGE_INCOMPLETE:inventory-api-status|inventory-cleanup',
      'CLEANUP_INCOMPLETE',
    ]));
  });

  test('非商品域缺少断言面和清理策略时必须由通用门禁拒绝方案生成', () => {
    const candidate = buildBusinessRuleCandidate(candidateInput({
      semantics: {
        ...candidateInput().semantics,
        assertionSurfaces: [],
        cleanup: {
          policyStatus: 'unknown', required: true,
          apiZeroResidueRequired: true, uiZeroResidueRequired: true,
        },
      },
    }));
    const approved = {
      ...candidate,
      effectiveVersion: 'inventory-v1',
      verificationStatus: 'verified' as const,
      approval: {
        decision: 'approved' as const,
        approvedBy: 'product-owner', approvedAt: '2026-08-23T00:00:00.000Z',
        rationale: '规则确认', candidateFingerprint: candidate.ruleFingerprint,
        candidateSourceFingerprint: candidate.sourceFingerprint,
      },
    };

    expect(generateTestCasesFromBusinessRules([approved])).toMatchObject({
      cases: [],
      blocked: [{
        ruleId: 'BR-INVENTORY-001',
        blockers: expect.arrayContaining([
          'ASSERTION_SURFACE_REQUIRED', 'CLEANUP_POLICY_REQUIRED', 'CLEANUP_STRATEGY_REQUIRED',
        ]),
      }],
    });
  });

  test('正式生成必须校验生效版本、审批时间和审批来源指纹', () => {
    const candidate = buildBusinessRuleCandidate(candidateInput());
    const incompleteFormal = {
      ...candidate,
      verificationStatus: 'verified' as const,
      approval: {
        decision: 'approved' as const,
        approvedBy: 'product-owner', approvedAt: 'not-recorded', rationale: '历史确认',
        candidateFingerprint: candidate.ruleFingerprint,
        candidateSourceFingerprint: 'stale-source-fingerprint',
      },
    };

    expect(generateTestCasesFromBusinessRules([incompleteFormal])).toMatchObject({
      cases: [],
      blocked: [{
        ruleId: 'BR-INVENTORY-001',
        blockers: expect.arrayContaining([
          'EFFECTIVE_VERSION_REQUIRED', 'APPROVAL_SOURCE_FINGERPRINT_STALE', 'APPROVAL_TIME_INVALID',
        ]),
      }],
    });
  });

  test('执行收据不得缩小规则断言合同或省略对应通道证据', () => {
    const rule = formalRule();
    const receipt = completeReceipt(rule.ruleFingerprint);
    receipt.assertionIdsRequired = ['inventory-ui-status'];
    receipt.assertionIdsObserved = ['inventory-ui-status'];
    receipt.apiEvidenceIds = [];

    const observation = observeBusinessRuleExecution({ rule, receipt });
    expect(observation.candidate).toBeNull();
    expect(observation.blockers).toEqual(expect.arrayContaining([
      'ASSERTION_CONTRACT_MISMATCH:missing=inventory-api-status|inventory-cleanup;unknown=',
      'ASSERTION_COVERAGE_INCOMPLETE:inventory-api-status|inventory-cleanup',
      'API_EVIDENCE_REQUIRED',
    ]));
  });

  test('规则语义变更必须产生新修订并精确计算用例和绑定影响', () => {
    const current = buildBusinessRuleCandidate(candidateInput());
    const next = reviseBusinessRule({
      current,
      next: candidateInput({
        statement: '库存小于或等于零时商品不可售。',
        semantics: {
          ...candidateInput().semantics,
          constraints: ['库存数量不得小于零。', '库存小于或等于零时不可售。'],
        },
      }),
    });
    const dependent = buildBusinessRuleCandidate(candidateInput({
      ruleId: 'BR-INVENTORY-002',
      statement: '零库存状态同步到销售渠道。',
      supersedes: ['BR-INVENTORY-001'],
      linkedCaseIds: ['TC-INVENTORY-002'],
      linkedBindingIds: ['binding:inventory-channel-sync'],
    }));

    expect(next).toMatchObject({ revision: 2, previousRuleFingerprint: current.ruleFingerprint, verificationStatus: 'revalidation-required' });
    expect(next.ruleFingerprint).not.toBe(current.ruleFingerprint);
    expect(buildBusinessRuleChangeImpact([next, dependent], ['BR-INVENTORY-001'])).toEqual({
      affectedRuleIds: ['BR-INVENTORY-001', 'BR-INVENTORY-002'],
      affectedCaseIds: ['TC-INVENTORY-001', 'TC-INVENTORY-002'],
      affectedBindingIds: ['binding:inventory-channel-sync', 'binding:inventory-stock-zero'],
    });
  });

  test('生成语义必须保留来源中的动作、状态迁移和预期顺序', () => {
    const input = candidateInput();
    input.semantics.actions = ['进入页面。', '填写字段。', '点击保存。'];
    input.semantics.stateTransitions = [
      { from: 'draft', action: 'save', to: 'saved' },
      { from: 'saved', action: 'publish', to: 'published' },
    ];
    input.semantics.outcomes = ['保存成功。', '列表展示记录。'];

    const candidate = buildBusinessRuleCandidate(input);
    expect(candidate.semantics.actions).toEqual(['进入页面。', '填写字段。', '点击保存。']);
    expect(candidate.semantics.stateTransitions).toEqual(input.semantics.stateTransitions);
    expect(candidate.semantics.outcomes).toEqual(['保存成功。', '列表展示记录。']);
  });

  test('补全评审队列只暴露证据值并区分元数据与语义变更影响', () => {
    const candidate = buildBusinessRuleCandidate(candidateInput({
      effectiveVersion: null,
      semantics: {
        ...candidateInput().semantics,
        preconditions: [],
        assertionSurfaces: [],
        cleanup: {
          policyStatus: 'unknown', required: false,
          apiZeroResidueRequired: false, uiZeroResidueRequired: false,
        },
      },
    }));
    const rule = {
      ...candidate,
      approval: {
        decision: 'approved' as const,
        approvedBy: 'product-owner', approvedAt: 'not-recorded', rationale: '历史确认',
        candidateFingerprint: candidate.ruleFingerprint,
        candidateSourceFingerprint: candidate.sourceFingerprint,
      },
    };

    const queue = buildBusinessRuleCompletionReviewQueue([rule]);
    expect(queue[0]).toMatchObject({
      status: 'review-required',
      evidenceBackedValues: { preconditions: [], actions: ['将库存调整为零并保存。'], assertionSurfaces: [] },
      executionImpact: {
        existingPassedCasesInvalidated: false,
        rerunRequiredNow: false,
        semanticCompletionMayRequireIncrementalRerun: true,
      },
    });
    expect(queue[0].requiredFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldPath: 'effectiveVersion', changesRuleFingerprint: false }),
      expect.objectContaining({ fieldPath: 'approval.approvedAt', changesRuleFingerprint: false }),
      expect.objectContaining({ fieldPath: 'semantics.preconditions', changesRuleFingerprint: true }),
      expect.objectContaining({ fieldPath: 'semantics.assertionSurfaces', changesRuleFingerprint: true }),
      expect.objectContaining({ fieldPath: 'semantics.cleanup', changesRuleFingerprint: true }),
    ]));
  });

  test('驳回和挂起决定必须持久化、可查询且不能晋级正式规则', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'business-rule-governance-'));
    try {
      const store = new FileBusinessRuleGovernanceStore(path.join(root, 'events.jsonl'));
      const rule = buildBusinessRuleCandidate(candidateInput());
      const event: BusinessRuleGovernanceEvent = {
        eventId: 'fixture:held', eventType: 'candidate-held', ruleId: rule.ruleId,
        ruleFingerprint: rule.ruleFingerprint, revision: rule.revision,
        occurredAt: '2026-09-01T00:00:00.000Z', actor: 'product-owner', reason: '等待范围确认',
      };
      expect(store.append(event)).toEqual({ appended: true, duplicate: false });
      expect(store.append(event)).toEqual({ appended: false, duplicate: true });
      expect(store.verifyIntegrity()).toEqual({ valid: true, count: 1, diagnostics: [] });
      expect(store.query([rule], { approvalStatus: 'held' })).toMatchObject([{
        ruleId: rule.ruleId, lifecycleStatus: 'candidate', approvalStatus: 'held',
      }]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('废弃、恢复和回滚必须追加审计事件并保留历史修订', () => {
    const rule = formalRule();
    const base = (eventId: string, eventType: BusinessRuleGovernanceEvent['eventType'], occurredAt: string): BusinessRuleGovernanceEvent => ({
      eventId, eventType, occurredAt, ruleId: rule.ruleId, ruleFingerprint: rule.ruleFingerprint,
      revision: rule.revision, actor: 'product-owner', reason: '治理合同验证',
    });
    const projection = projectBusinessRuleGovernance([
      { ...base('retire', 'rule-retired', '2026-09-01T00:00:00.000Z'), ruleFingerprint: 'c'.repeat(64), revision: 2, effectiveTo: '2026-09-01T00:00:00.000Z' },
      { ...base('restore', 'rule-restored', '2026-09-02T00:00:00.000Z'), ruleFingerprint: 'c'.repeat(64), revision: 2 },
      {
        ...base('rollback', 'rule-rolled-back', '2026-09-03T00:00:00.000Z'),
        ruleFingerprint: 'c'.repeat(64), revision: 2, targetRevision: 1, targetRuleFingerprint: rule.ruleFingerprint,
        resultingRevision: 3, resultingRuleFingerprint: 'b'.repeat(64),
      },
    ], [{ ...rule, revision: 2, ruleFingerprint: 'c'.repeat(64), previousRuleFingerprint: rule.ruleFingerprint }]);
    expect(projection.diagnostics).toEqual([]);
    expect(queryBusinessRuleGovernance(projection, { lifecycleStatus: 'formal' })).toMatchObject([{
      ruleId: rule.ruleId, currentRevision: 3, currentRuleFingerprint: 'b'.repeat(64),
      effectiveTo: null, history: ['retire', 'restore', 'rollback'],
    }]);
    expect(validateBusinessRuleGovernanceEligibility(
      { ...rule, revision: 3, ruleFingerprint: 'b'.repeat(64) },
      projection,
    )).toEqual([]);
  });

  test('批准撤回和过期必须成为独立终态，未来到期时间不得伪装已过期', () => {
    const rule = formalRule();
    const projection = projectBusinessRuleGovernance([{
      eventId: 'revoke', eventType: 'approval-revoked', ruleId: rule.ruleId,
      ruleFingerprint: rule.ruleFingerprint, revision: rule.revision,
      occurredAt: '2026-09-01T00:00:00.000Z', actor: 'product-owner', reason: '审批范围撤回',
    }], [rule]);
    expect(queryBusinessRuleGovernance(projection, { approvalStatus: 'revoked' })).toHaveLength(1);
    expect(validateBusinessRuleGovernanceEligibility(rule, projection)).toEqual([
      'BUSINESS_RULE_APPROVAL_NOT_ACTIVE:revoked',
    ]);
    const invalid = projectBusinessRuleGovernance([{
      eventId: 'expire', eventType: 'approval-expired', ruleId: rule.ruleId,
      ruleFingerprint: rule.ruleFingerprint, revision: rule.revision,
      occurredAt: '2026-09-01T00:00:00.000Z', expiresAt: '2026-09-02T00:00:00.000Z',
      actor: 'governance-bot', reason: '批准到期',
    }], [rule]);
    expect(invalid.diagnostics).toContain('expire:APPROVAL_NOT_EXPIRED');
  });

  test('时间和生效上下文必须校验完整性、先后顺序及显式上下文非空', () => {
    const rule = formalRule();
    const invalid = validateBusinessRuleTemporalContext({
      ...rule,
      effectiveContext: { environmentIds: [], tenantIds: [], roleIds: [], locales: [], routes: [], featureFlags: [] },
      governance: {
        createdAt: '2026-09-02T00:00:00.000Z', changedAt: '2026-09-01T00:00:00.000Z',
        effectiveFrom: null, effectiveTo: null, lastVerifiedAt: null, changeReason: null, changeEventId: null,
        timeEvidenceStatus: 'partial', effectiveContextStatus: 'explicit',
        conflictAssessment: { status: 'not-assessed', assessedAt: null, source: null, conflictsWithRuleIds: [], precedence: null },
      },
    });
    expect(invalid.timeStatus).toBe('invalid');
    expect(invalid.contextStatus).toBe('metadata-inconsistent');
    expect(invalid.diagnostics).toEqual(expect.arrayContaining([
      'TIME_ORDER_INVALID:createdAt>changedAt', 'EFFECTIVE_CONTEXT_METADATA_INCONSISTENT',
    ]));
  });
});
