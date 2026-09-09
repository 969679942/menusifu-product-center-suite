import { expect, test } from '@playwright/test';
import {
  auditProductCenterClaimEvidence,
  type ProductCenterClaimEvidence,
} from '../../utils/product-center-claim-evidence';
import type { ProductCenterTestCaseInput } from '../../utils/product-center-test-case-ir';

const testCase: ProductCenterTestCaseInput = {
  id: 'TC-ITEM-STD-002',
  module: 'brand-item',
  route: '/pp/brand/list',
  title: '商品列表页面展示正确',
  priority: 'P0',
  sourceIds: ['test-scheme:item:TC-ITEM-STD-002'],
  preconditions: ['已登录商品中心'],
  actions: ['打开商品列表页'],
  expectedResults: ['列表默认按创建时间倒序', '新增商品按钮可见'],
  mutatesData: false,
  cleanup: [],
  automationPreference: 'candidate',
  claims: [
    {
      id: 'claim:TC-ITEM-STD-002:expectation:1',
      kind: 'expectation',
      text: '列表默认按创建时间倒序',
      sourceIds: ['test-scheme:item:TC-ITEM-STD-002'],
      evidenceLevel: 'confirmed',
    },
    {
      id: 'claim:TC-ITEM-STD-002:expectation:2',
      kind: 'expectation',
      text: '新增商品按钮可见',
      sourceIds: ['test-scheme:item:TC-ITEM-STD-002'],
      evidenceLevel: 'confirmed',
    },
  ],
};

const visibleButtonEvidence: ProductCenterClaimEvidence = {
  claimId: 'claim:TC-ITEM-STD-002:expectation:2',
  evidenceType: 'visible-ui',
  semanticKey: 'add-item-entry',
  observableId: '/pp/brand/list#control-3',
  observableSemanticKey: 'add-item-entry',
  observableVisibility: 'visible',
  sourceIds: ['/pp/brand/list#control-3'],
  assertionAdapterId: 'productCenter.verifyItemListDisplayUi',
};

const completeExecutionEvidence: ProductCenterClaimEvidence[] = [
  {
    claimId: 'claim:TC-ITEM-STD-002:precondition:1',
    claimKind: 'precondition',
    evidenceType: 'visible-ui',
    semanticKey: 'merchant-session-ready',
    observableId: 'sidebar:product-management',
    observableSemanticKey: 'merchant-session-ready',
    observableVisibility: 'visible',
    sourceIds: ['runtime:merchant-session'],
    assertionAdapterId: 'productCenter.verifyMerchantSession',
  },
  {
    claimId: 'claim:TC-ITEM-STD-002:action:1',
    claimKind: 'action',
    evidenceType: 'visible-ui',
    semanticKey: 'sidebar-navigation',
    observableId: 'sidebar:/pp/brand/list',
    observableSemanticKey: 'sidebar-navigation',
    observableVisibility: 'visible',
    sourceIds: ['runtime:sidebar-navigation'],
    capabilityId: 'navigation.sidebar.open',
    sequence: 1,
    pageState: '/pp/brand/list',
  },
];

const executableTestCase: ProductCenterTestCaseInput = {
  ...testCase,
  claims: [
    {
      id: 'claim:TC-ITEM-STD-002:precondition:1',
      kind: 'precondition',
      text: '已登录商品中心',
      sourceIds: ['test-scheme:item:TC-ITEM-STD-002'],
      evidenceLevel: 'confirmed',
    },
    {
      id: 'claim:TC-ITEM-STD-002:action:1',
      kind: 'action',
      text: '从侧边栏打开商品列表页',
      sourceIds: ['test-scheme:item:TC-ITEM-STD-002'],
      evidenceLevel: 'confirmed',
    },
    ...(testCase.claims ?? []),
  ],
};

test.describe('商品中心 Claim 断言证据门禁', () => {
  test('隐藏 DOM 字段不得作为可见 UI 断言证据', async () => {
    const result = auditProductCenterClaimEvidence(executableTestCase, [
      ...completeExecutionEvidence,
      visibleButtonEvidence,
      {
        claimId: 'claim:TC-ITEM-STD-002:expectation:1',
        evidenceType: 'visible-ui',
        semanticKey: 'create-time',
        observableId: 'dom:brand-item-row:action-time',
        observableSemanticKey: 'create-time',
        observableVisibility: 'dom-only',
        sourceIds: ['mapping:139c6a17872d'],
        assertionAdapterId: 'productCenter.verifyItemListDisplayUi',
      },
    ]);

    expect(result.compileCandidate).toBe(false);
    expect(result.runtimeAccepted).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        claimId: 'claim:TC-ITEM-STD-002:expectation:1',
        code: 'VISIBLE_UI_EVIDENCE_REQUIRED',
      }),
    ]));
  });

  test('操作时间不得替代创建时间语义', async () => {
    const result = auditProductCenterClaimEvidence(executableTestCase, [
      ...completeExecutionEvidence,
      visibleButtonEvidence,
      {
        claimId: 'claim:TC-ITEM-STD-002:expectation:1',
        evidenceType: 'api',
        semanticKey: 'create-time',
        observableId: 'brand-item.actionTime',
        observableSemanticKey: 'action-time',
        observableVisibility: 'not-applicable',
        sourceIds: ['mapping:139c6a17872d'],
        assertionAdapterId: 'productCenter.verifyItemCreatedOrderApi',
      },
    ]);

    expect(result.compileCandidate).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        claimId: 'claim:TC-ITEM-STD-002:expectation:1',
        code: 'SEMANTIC_EVIDENCE_MISMATCH',
      }),
    ]));
  });

  test('任一预期缺少证据时整条用例不得晋级', async () => {
    const result = auditProductCenterClaimEvidence(executableTestCase, [
      ...completeExecutionEvidence,
      visibleButtonEvidence,
    ]);

    expect(result.compileCandidate).toBe(false);
    expect(result.runtimeAccepted).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        claimId: 'claim:TC-ITEM-STD-002:expectation:1',
        code: 'EXPECTATION_EVIDENCE_REQUIRED',
      }),
    ]));
  });

  test('静态证据完整只能成为编译候选不能推导运行通过', async () => {
    const result = auditProductCenterClaimEvidence(executableTestCase, [
      ...completeExecutionEvidence,
      visibleButtonEvidence,
      {
        claimId: 'claim:TC-ITEM-STD-002:expectation:1',
        evidenceType: 'api',
        semanticKey: 'create-time-order',
        observableId: 'brand-item.createdAt',
        observableSemanticKey: 'create-time-order',
        observableVisibility: 'not-applicable',
        sourceIds: ['operation:brand-menu:POST /ops-brand/brand-items/pageQuery'],
        assertionAdapterId: 'productCenter.verifyItemCreatedOrderApi',
      },
    ]);

    expect(result.compileCandidate).toBe(true);
    expect(result.runtimeAccepted).toBe(false);
    expect(result.issues).toEqual([]);
  });

  test('前置条件或操作缺少证据时整条用例不得编译', async () => {
    const result = auditProductCenterClaimEvidence(executableTestCase, [
      visibleButtonEvidence,
      {
        claimId: 'claim:TC-ITEM-STD-002:expectation:1',
        claimKind: 'expectation',
        evidenceType: 'api',
        semanticKey: 'create-time-order',
        observableId: 'brand-item.createdAt',
        observableSemanticKey: 'create-time-order',
        observableVisibility: 'not-applicable',
        sourceIds: ['runtime:item-order'],
        assertionAdapterId: 'productCenter.verifyItemCreatedOrderApi',
      },
    ]);

    expect(result.compileCandidate).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PRECONDITION_EVIDENCE_REQUIRED' }),
      expect.objectContaining({ code: 'ACTION_EVIDENCE_REQUIRED' }),
    ]));
  });

  test('侧边栏导航必须是第一条操作能力', async () => {
    const misplacedNavigation = completeExecutionEvidence.map((item) => item.claimKind === 'action'
      ? { ...item, sequence: 2 }
      : item);
    const result = auditProductCenterClaimEvidence(executableTestCase, [
      ...misplacedNavigation,
      visibleButtonEvidence,
      {
        claimId: 'claim:TC-ITEM-STD-002:expectation:1',
        claimKind: 'expectation',
        evidenceType: 'api',
        semanticKey: 'create-time-order',
        observableId: 'brand-item.createdAt',
        observableSemanticKey: 'create-time-order',
        observableVisibility: 'not-applicable',
        sourceIds: ['runtime:item-order'],
        assertionAdapterId: 'productCenter.verifyItemCreatedOrderApi',
      },
    ]);

    expect(result.compileCandidate).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SIDEBAR_NAVIGATION_REQUIRED' }),
    ]));
  });
});
