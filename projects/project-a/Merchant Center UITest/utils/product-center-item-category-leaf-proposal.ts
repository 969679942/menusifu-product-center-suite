import { createHash } from 'node:crypto';
import type { ProductCenterCanonicalCase } from './product-center-canonical-item-test-plan';

type RouteObservation = {
  caseId: string;
  route: string;
  capabilityIds: string[];
  navigation: {
    mode: string;
    targetPath: string;
    arrivedPath: string;
    verifiedPaths: string[];
  };
  sidebarEntryVerified: boolean;
  runtimeAccepted: boolean;
  release?: {
    applicationFingerprint: string;
    routeFingerprint: string;
    observedAt: string;
  };
};

export type ProductCenterItemCategoryLeafProbeApproval = {
  schemaVersion: '1.0.0';
  approvalId: string;
  canonicalId: 'TC-ITEM-STD-007';
  decision: 'approved';
  approvedScope: readonly string[];
  reviewedBy: string;
  reviewedAt: string;
  executionPolicy: {
    readOnly: true;
    saveAllowed: false;
    createAllowed: false;
    updateAllowed: false;
    deleteAllowed: false;
    stopAfterLeafSelectionEvidence: true;
  };
};

const readOnlyProbeScope = [
  'navigation.sidebar.open',
  'item.openStandardCreate',
  'item.category.openCascader',
  'item.category.selectParentWithChildren',
  'item.category.selectLeaf',
] as const;

export function buildProductCenterItemCategoryLeafProposal(input: {
  canonicalCase: ProductCenterCanonicalCase;
  routeObservation: RouteObservation;
  approval?: ProductCenterItemCategoryLeafProbeApproval;
  now: string;
  maxAgeMs?: number;
}) {
  const canonical = input.canonicalCase;
  const observation = input.routeObservation;
  if (canonical.canonicalId !== 'TC-ITEM-STD-007'
    || canonical.priority !== 'P1'
    || canonical.status !== 'ready-for-technical-binding'
    || canonical.reviewRequired.length > 0) {
    throw new Error('商品分类叶子选择 canonical 尚未完成业务复核');
  }
  if (canonical.capabilityIds[0] !== 'navigation.sidebar.open') {
    throw new Error('商品分类叶子选择 canonical 缺少侧边栏首项');
  }
  const routeEntryVerified = observation.route === canonical.route
    && observation.navigation.mode === 'sidebar'
    && observation.navigation.targetPath === canonical.route
    && observation.navigation.arrivedPath === canonical.route
    && observation.navigation.verifiedPaths.includes(canonical.route)
    && observation.capabilityIds[0] === 'navigation.sidebar.open'
    && observation.sidebarEntryVerified
    && observation.runtimeAccepted;
  if (!routeEntryVerified) throw new Error('商品分类叶子选择缺少可复用的列表入口证据');
  if (!observation.release?.applicationFingerprint
    || !observation.release.routeFingerprint
    || !observation.release.observedAt) {
    throw new Error('商品分类叶子选择列表入口证据缺少版本信息');
  }

  const nowMs = Date.parse(input.now);
  const observedAtMs = Date.parse(observation.release.observedAt);
  const maxAgeMs = input.maxAgeMs ?? 24 * 60 * 60 * 1000;
  const ageMs = nowMs - observedAtMs;
  const fresh = Number.isFinite(nowMs)
    && Number.isFinite(observedAtMs)
    && ageMs >= 0
    && ageMs <= maxAgeMs;
  if (!fresh) throw new Error('商品分类叶子选择列表入口证据已过期');

  const proposedCapabilities = [
    { id: 'navigation.sidebar.open', status: 'verified-route-entry', evidenceId: observation.caseId },
    { id: 'item.openStandardCreate', status: 'probe-required', evidenceId: null },
    { id: 'item.category.openCascader', status: 'probe-required', evidenceId: null },
    { id: 'item.category.selectParentWithChildren', status: 'probe-required', evidenceId: null },
    { id: 'item.category.selectLeaf', status: 'probe-required', evidenceId: null },
  ] as const;
  const proposedAssertions = [
    { id: 'productCenter.verifyCategoryParentNotCommitted', status: 'probe-required' as const },
    { id: 'productCenter.verifyCategoryLeafCommitted', status: 'probe-required' as const },
  ];
  const requiredEvidence = [
    { kind: 'visible-ui', target: '商品分类字段与级联菜单必须对用户可见' },
    { kind: 'locator-uniqueness', target: '分类字段、一级节点和二级节点均必须唯一' },
    { kind: 'network', target: '分类选项请求完成且层级数据已加载' },
    { kind: 'observable-ui', target: '点击有子级的一级分类后不得成为最终已选值' },
    { kind: 'observable-ui', target: '点击二级分类后字段展示该二级分类' },
  ] as const;
  const blockingReasons = [
    'ASSERTION_ADAPTER_REQUIRED',
    'CATEGORY_CASCADER_LOCATOR_UNIQUENESS_REQUIRED',
    'CATEGORY_HIERARCHY_DATA_REQUIRED',
    'CREATE_PAGE_OBSERVATION_REQUIRED',
  ];
  const approval = input.approval;
  if (approval) validateReadOnlyProbeApproval(approval);
  const uiExecutionAuthorized = Boolean(approval);
  const proposal = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-category-leaf-technical-proposal',
    status: uiExecutionAuthorized ? 'probe-approved' : 'probe-approval-required',
    canonical: {
      canonicalId: canonical.canonicalId,
      title: canonical.title,
      priority: canonical.priority,
      status: canonical.status,
      route: canonical.route,
      claimIds: [...canonical.claimIds],
      executionChannel: canonical.executionChannel,
    },
    routeEntryEvidence: {
      scope: 'route-entry-only',
      evidenceId: observation.caseId,
      route: observation.route,
      sidebarEntryVerified: true,
      runtimeAccepted: true,
      observedAt: observation.release.observedAt,
      applicationFingerprint: observation.release.applicationFingerprint,
      routeFingerprint: observation.release.routeFingerprint,
      fresh,
      ageMs,
    },
    proposedCapabilities,
    proposedAssertions,
    requiredEvidence,
    blockingReasons,
    executionPolicy: {
      uiExecutionAuthorized,
      mutatesData: false,
      saveAllowed: false,
      createAllowed: false,
      updateAllowed: false,
      deleteAllowed: false,
      cleanupRequired: false,
      stopAfterLeafSelectionEvidence: true,
    },
    approval: approval
      ? {
          approvalId: approval.approvalId,
          decision: approval.decision,
          approvedScope: [...approval.approvedScope],
          reviewedBy: approval.reviewedBy,
          reviewedAt: approval.reviewedAt,
        }
      : {
          approvalId: null,
          decision: 'pending' as const,
          approvedScope: [] as string[],
          reviewedBy: null,
          reviewedAt: null,
        },
    guardrails: {
      sidebarFirstRequired: true,
      rawSelectorInRecipeForbidden: true,
      hiddenDomVisibleEvidenceForbidden: true,
      automationMayInferBusinessRule: false,
      existingCreateAutomationMayAuthorizeBinding: false,
    },
  } as const;
  return {
    ...proposal,
    fingerprint: createHash('sha256').update(JSON.stringify(proposal)).digest('hex'),
  };
}

export type ProductCenterItemCategoryLeafProposal = ReturnType<
  typeof buildProductCenterItemCategoryLeafProposal
>;

type ItemCategoryLeafRuntimeAcceptance = {
  fingerprint: string;
  runId: string;
  accepted: boolean;
  acceptedCaseIds: string[];
  safety: {
    incompleteCheckpoints: number;
    sensitiveFindings: number;
    authStateArtifacts: number;
    forbiddenPatterns: number;
  };
};

type ItemCategoryLeafRuntimeEvidence = {
  fingerprint: string;
  runId: string;
  entries: Array<{
    caseId: string;
    claimCoverageComplete: boolean;
    sidebarEntryVerified: boolean;
    visibleUi: {
      categoryFieldVisible: boolean;
      parentNotCommitted: boolean;
      leafCommitted: boolean;
    };
    locatorUniqueness: {
      categoryFieldCount: number;
      categoryCascaderCount: number;
      parentNodeCount: number;
      leafNodeCount: number;
    };
    network: {
      method: string;
      operation: string;
      status: number;
    };
    api: {
      beforeEqualsAfter: boolean;
      mutationRequestCount: number;
    };
    release: {
      applicationFingerprint: string;
      observedAt: string;
    };
  }>;
};

export function closeProductCenterItemCategoryLeafProposal(input: {
  proposal: ProductCenterItemCategoryLeafProposal;
  recipeFingerprint: string;
  acceptance: ItemCategoryLeafRuntimeAcceptance;
  evidence: ItemCategoryLeafRuntimeEvidence;
}) {
  const { proposal, recipeFingerprint, acceptance, evidence } = input;
  if (acceptance.fingerprint !== recipeFingerprint
    || evidence.fingerprint !== recipeFingerprint) {
    throw new Error('商品分类叶子选择运行证据与 Recipe 指纹不一致');
  }
  if (acceptance.runId !== evidence.runId) {
    throw new Error('商品分类叶子选择 acceptance 与 evidence runId 不一致');
  }
  if (proposal.status !== 'probe-approved') {
    throw new Error('商品分类叶子选择 proposal 尚未获得只读 Probe 授权');
  }
  if (!acceptance.accepted
    || acceptance.acceptedCaseIds.length !== 1
    || acceptance.acceptedCaseIds[0] !== proposal.canonical.canonicalId
    || Object.values(acceptance.safety).some((count) => count !== 0)) {
    throw new Error('商品分类叶子选择 runtime acceptance 未通过安全门禁');
  }

  const matchingEntries = evidence.entries.filter((entry) => (
    entry.caseId === proposal.canonical.canonicalId
  ));
  if (evidence.entries.length !== 1 || matchingEntries.length !== 1) {
    throw new Error('商品分类叶子选择 runtime evidence 必须唯一');
  }
  const entry = matchingEntries[0];
  const locatorCounts = Object.values(entry.locatorUniqueness);
  const evidenceComplete = entry.claimCoverageComplete
    && entry.sidebarEntryVerified
    && entry.visibleUi.categoryFieldVisible
    && entry.visibleUi.parentNotCommitted
    && entry.visibleUi.leafCommitted
    && locatorCounts.length === 4
    && locatorCounts.every((count) => count === 1)
    && entry.network.method === 'GET'
    && entry.network.operation === '/item/v1/ops-brand/brand-categories/treeList'
    && entry.network.status >= 200
    && entry.network.status < 300
    && entry.api.beforeEqualsAfter
    && entry.api.mutationRequestCount === 0
    && /^[a-f0-9]{64}$/u.test(entry.release.applicationFingerprint)
    && Number.isFinite(Date.parse(entry.release.observedAt));
  if (!evidenceComplete) {
    throw new Error('商品分类叶子选择 runtime evidence 不完整或包含写入');
  }

  const { fingerprint: _fingerprint, ...proposalWithoutFingerprint } = proposal;
  const closedProposal = {
    ...proposalWithoutFingerprint,
    status: 'runtime-accepted' as const,
    proposedCapabilities: proposal.proposedCapabilities.map((item) => ({
      ...item,
      status: 'runtime-verified' as const,
      evidenceId: acceptance.runId,
    })),
    proposedAssertions: proposal.proposedAssertions.map((item) => ({
      ...item,
      status: 'runtime-verified' as const,
    })),
    requiredEvidence: proposal.requiredEvidence.map((item) => ({
      ...item,
      status: 'observed' as const,
    })),
    blockingReasons: [] as string[],
    executionPolicy: {
      ...proposal.executionPolicy,
      uiExecutionAuthorized: false,
      executionCompleted: true,
      sourceRunId: acceptance.runId,
    },
  };
  return {
    ...closedProposal,
    fingerprint: createHash('sha256').update(JSON.stringify(closedProposal)).digest('hex'),
  };
}

function validateReadOnlyProbeApproval(
  approval: ProductCenterItemCategoryLeafProbeApproval,
): void {
  if (approval.schemaVersion !== '1.0.0'
    || approval.canonicalId !== 'TC-ITEM-STD-007'
    || approval.decision !== 'approved'
    || !approval.approvalId.trim()
    || !approval.reviewedBy.trim()
    || !Number.isFinite(Date.parse(approval.reviewedAt))) {
    throw new Error('商品分类叶子选择 Probe 授权记录无效');
  }
  const policy = approval.executionPolicy;
  if (policy.readOnly !== true
    || policy.saveAllowed !== false
    || policy.createAllowed !== false
    || policy.updateAllowed !== false
    || policy.deleteAllowed !== false
    || policy.stopAfterLeafSelectionEvidence !== true) {
    throw new Error('商品分类叶子选择 Probe 授权不得允许保存或数据写入');
  }
  if (approval.approvedScope.length !== readOnlyProbeScope.length
    || approval.approvedScope.some((item, index) => item !== readOnlyProbeScope[index])) {
    throw new Error('商品分类叶子选择 Probe 授权范围不精确');
  }
}
