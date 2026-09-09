import { expect, test } from '@playwright/test';
import {
  buildProductCenterTestCaseReviewQueue,
} from '../../utils/product-center-test-case-review-queue';
import type {
  ProductCenterReviewRequiredTestCase,
  ProductCenterTestCaseInput,
} from '../../utils/product-center-test-case-ir';

const seasoningCase = testCase({
  id: 'create:seasoning',
  module: 'brand-seasoning',
  route: '/pp/brand/seasoning/list',
  title: '新增调味组仅填必填项保存成功',
  actions: ['进入调味管理。', '核对页面/列表/终端展示与业务规则。'],
  expectedResults: ['新增调味组，只填必填参数，能新增成功'],
  capabilityIds: ['navigation.sidebar.open', 'coreCreate.execute'],
});

const methodDetailCase = testCase({
  id: 'review:method-detail-max-length',
  module: 'brand-group',
  route: '/pp/brand/option-group/method',
  title: '做法明细名称超长保存后截断为100字符',
  actions: ['做法明细名称输入超过 100 字符，保存。'],
  expectedResults: ['名称为前 100 个有效字符。'],
  capabilityIds: ['navigation.sidebar.open', 'methodDetail.enforceNameMaxLength'],
});

test.describe('商品中心测试用例评审修复队列', () => {
  test('应按问题性质生成可复审且禁止直接晋级的修复项', async () => {
    const queue = buildProductCenterTestCaseReviewQueue({
      collectionId: 'product-center-test-plan-gold-set',
      fingerprint: 'gold-fingerprint',
      reviewRequired: [
        reviewCase(seasoningCase, ['VAGUE_ACTION'], ['动作缺少可执行细节']),
        reviewCase(methodDetailCase, ['UNKNOWN_CAPABILITY'], [
          '未知能力：methodDetail.enforceNameMaxLength',
        ]),
      ],
      cases: [seasoningCase, methodDetailCase],
      knownCapabilityIds: new Set(['navigation.sidebar.open', 'coreCreate.execute']),
    });

    expect(queue.status).toBe('pending-review');
    expect(queue.summary).toEqual({
      total: 2,
      pending: 2,
      readyForReaudit: 0,
      resolved: 0,
      deferred: 0,
      byRepairKind: {
        'automation-capability': 1,
        'test-plan-content': 1,
      },
      byIssueCode: {
        UNKNOWN_CAPABILITY: 1,
        VAGUE_ACTION: 1,
      },
    });
    expect(queue.items).toEqual([
      expect.objectContaining({
        id: 'test-case-review:create:seasoning',
        caseId: 'create:seasoning',
        status: 'pending',
        repairTrack: 'test-plan-revision',
        repairKinds: ['test-plan-content'],
        promotionPolicy: 'reaudit-required',
        requiredReauditGates: [
          'source-citation',
          'semantic-audit',
          'executability-audit',
          'recipe-compile',
          'runtime-acceptance',
        ],
        allowedDecisions: ['repair-and-reaudit', 'manual-only', 'defer'],
        requiredActions: [expect.objectContaining({
          kind: 'rewrite-action',
          issueCode: 'VAGUE_ACTION',
          requiredEvidence: ['source-citation', 'executable-action', 'observable-result'],
        })],
      }),
      expect.objectContaining({
        id: 'test-case-review:review:method-detail-max-length',
        caseId: 'review:method-detail-max-length',
        status: 'pending',
        repairTrack: 'automation-capability',
        repairKinds: ['automation-capability'],
        promotionPolicy: 'reaudit-required',
        requiredActions: [expect.objectContaining({
          kind: 'audit-capability',
          issueCode: 'UNKNOWN_CAPABILITY',
          targetIds: ['methodDetail.enforceNameMaxLength'],
          requiredEvidence: [
            'page-contract',
            'network-or-api',
            'assertion-adapter',
            'cleanup-adapter',
          ],
        })],
      }),
    ]);
  });

  test('评审项缺少对应规范化用例时应拒绝生成队列', async () => {
    expect(() => buildProductCenterTestCaseReviewQueue({
      collectionId: 'product-center-test-plan-gold-set',
      fingerprint: 'gold-fingerprint',
      reviewRequired: [reviewCase(seasoningCase, ['VAGUE_ACTION'], ['动作缺少可执行细节'])],
      cases: [],
      knownCapabilityIds: new Set(),
    })).toThrow('评审项缺少规范化用例：create:seasoning');
  });

  test('修复决定只能进入重新审计而不能直接晋级', async () => {
    const queue = buildProductCenterTestCaseReviewQueue({
      collectionId: 'product-center-test-plan-gold-set',
      fingerprint: 'gold-fingerprint',
      reviewRequired: [
        reviewCase(seasoningCase, ['VAGUE_ACTION'], ['动作缺少可执行细节']),
        reviewCase(methodDetailCase, ['UNKNOWN_CAPABILITY'], [
          '未知能力：methodDetail.enforceNameMaxLength',
        ]),
      ],
      cases: [seasoningCase, methodDetailCase],
      knownCapabilityIds: new Set(['navigation.sidebar.open', 'coreCreate.execute']),
      decisions: [
        {
          id: 'decision:seasoning-rewrite',
          caseId: 'create:seasoning',
          decision: 'repair-and-reaudit',
          reviewedBy: 'test-owner',
          reviewedAt: '2026-07-26T00:00:00.000Z',
          reason: '已形成可执行动作和可观测预期的审核版用例',
          evidenceRefs: ['TEST-CASE-REVISION:create:seasoning:v2'],
        },
        {
          id: 'decision:method-manual',
          caseId: 'review:method-detail-max-length',
          decision: 'manual-only',
          reviewedBy: 'test-owner',
          reviewedAt: '2026-07-26T00:00:00.000Z',
          reason: '真实 capability 尚未完成审计',
          evidenceRefs: ['REVIEW-NOTE:method-detail-capability-gap'],
        },
      ],
    });

    expect(queue.status).toBe('reaudit-required');
    expect(queue.summary).toMatchObject({
      pending: 0,
      readyForReaudit: 1,
      resolved: 1,
      deferred: 0,
    });
    expect(queue.items[0]).toMatchObject({
      caseId: 'create:seasoning',
      status: 'ready-for-reaudit',
      promotionPolicy: 'reaudit-required',
      reviewDecision: { decision: 'repair-and-reaudit' },
    });
    expect(queue.items[1]).toMatchObject({
      caseId: 'review:method-detail-max-length',
      status: 'resolved',
      reviewDecision: { decision: 'manual-only' },
    });
  });

  test('修复后重审决定缺少证据引用时应拒绝', async () => {
    expect(() => buildProductCenterTestCaseReviewQueue({
      collectionId: 'product-center-test-plan-gold-set',
      fingerprint: 'gold-fingerprint',
      reviewRequired: [reviewCase(seasoningCase, ['VAGUE_ACTION'], ['动作缺少可执行细节'])],
      cases: [seasoningCase],
      knownCapabilityIds: new Set(['navigation.sidebar.open', 'coreCreate.execute']),
      decisions: [{
        id: 'decision:seasoning-rewrite',
        caseId: 'create:seasoning',
        decision: 'repair-and-reaudit',
        reviewedBy: 'test-owner',
        reviewedAt: '2026-07-26T00:00:00.000Z',
        reason: '已修复',
        evidenceRefs: [],
      }],
    })).toThrow('修复后重审决定缺少证据引用：decision:seasoning-rewrite');
  });
});

function reviewCase(
  input: ProductCenterTestCaseInput,
  issueCodes: ProductCenterReviewRequiredTestCase['issueCodes'],
  issues: string[],
): ProductCenterReviewRequiredTestCase {
  return {
    caseId: input.id,
    title: input.title,
    module: input.module,
    route: input.route,
    coverageIds: input.coverageIds ?? [],
    sourceIds: input.sourceIds,
    businessBasisKinds: ['xmind-existing'],
    issueCodes,
    issues,
  };
}

function testCase(input: {
  id: string;
  module: string;
  route: string;
  title: string;
  actions: string[];
  expectedResults: string[];
  capabilityIds: string[];
}): ProductCenterTestCaseInput {
  return {
    ...input,
    priority: 'P1',
    sourceIds: ['route:source'],
    sourceRefs: ['XMIND:source#node'],
    preconditions: ['已进入目标模块。'],
    mutatesData: true,
    cleanup: ['清理测试数据。'],
    automationPreference: 'candidate',
    claims: [],
    coverageIds: ['coverage:route'],
    execution: {
      roleIds: ['merchant-center-product-admin'],
      environmentIds: ['balamxqa'],
      capabilityIds: input.capabilityIds,
      mutationMode: 'ui-create',
      verificationSignals: ['api', 'ui'],
      seedAdapterIds: [],
      cleanupAdapterIds: ['productCenter.cleanupSeed'],
      asyncPolicy: 'none',
    },
  };
}
