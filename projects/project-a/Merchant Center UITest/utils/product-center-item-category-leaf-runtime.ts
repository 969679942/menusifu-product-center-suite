import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import type { ProductCenterCanonicalCase } from './product-center-canonical-item-test-plan';

type ApprovedProposal = {
  status: string;
  canonical: { canonicalId: string; claimIds: string[] };
  executionPolicy: {
    uiExecutionAuthorized: boolean;
    mutatesData: boolean;
    saveAllowed: boolean;
    createAllowed: boolean;
    updateAllowed: boolean;
    deleteAllowed: boolean;
    executionCompleted?: boolean;
    sourceRunId?: string;
  };
  approval: { decision: string };
};

export type ProductCenterCategoryParentSelectionResult = {
  parentName: string;
  locatorCount: number;
  visibleMenuCount: number;
  selectedValueBefore: string;
  selectedValueAfter: string;
  childVisible: boolean;
};

export type ProductCenterCategoryLeafSelectionResult = {
  parentName: string;
  leafName: string;
  locatorCount: number;
  selectedPath: string;
  menuClosed: boolean;
  mutationAttempted: boolean;
  mutationRequestCount?: number;
  mutationPaths?: string[];
};

export function buildProductCenterItemCategoryLeafRecipe(input: {
  canonicalCase: ProductCenterCanonicalCase;
  proposal: ApprovedProposal;
  parentName: string;
  leafName: string;
}): AutomationRecipe {
  const { canonicalCase, proposal } = input;
  if (canonicalCase.canonicalId !== 'TC-ITEM-STD-007'
    || canonicalCase.status !== 'ready-for-technical-binding'
    || canonicalCase.reviewRequired.length > 0) {
    throw new Error('TC-ITEM-STD-007 canonical 尚未达到运行条件');
  }
  const authorizedForFirstRun = proposal.status === 'probe-approved'
    && proposal.executionPolicy.uiExecutionAuthorized === true;
  const acceptedForOfflineRebuild = proposal.status === 'runtime-accepted'
    && proposal.executionPolicy.uiExecutionAuthorized === false
    && proposal.executionPolicy.executionCompleted === true
    && Boolean(proposal.executionPolicy.sourceRunId);
  if ((!authorizedForFirstRun && !acceptedForOfflineRebuild)
    || proposal.canonical.canonicalId !== canonicalCase.canonicalId
    || proposal.approval.decision !== 'approved'
    || proposal.executionPolicy.mutatesData !== false
    || proposal.executionPolicy.saveAllowed !== false
    || proposal.executionPolicy.createAllowed !== false
    || proposal.executionPolicy.updateAllowed !== false
    || proposal.executionPolicy.deleteAllowed !== false) {
    throw new Error('TC-ITEM-STD-007 缺少精确只读 Probe 授权');
  }
  if (!input.parentName.trim() || !input.leafName.trim()) {
    throw new Error('TC-ITEM-STD-007 缺少已观察的父子分类业务身份');
  }
  if (!canonicalCase.route.startsWith('/')) {
    throw new Error('TC-ITEM-STD-007 canonical 路由无效');
  }
  const sourceIds = [...new Set(canonicalCase.claims.flatMap((claim) => claim.sourceIds))];
  return {
    schemaVersion: '1.0.0',
    id: 'product-center:item-category-leaf:TC-ITEM-STD-007',
    caseId: canonicalCase.canonicalId,
    title: canonicalCase.title,
    tags: ['@recipe', '@generated', '@item', '@read-only', '@p1'],
    route: canonicalCase.route as `/${string}`,
    action: 'read',
    traceabilityId: 'trace:sop:TC-ITEM-STD-007',
    sourceIds,
    claimIds: [...canonicalCase.claimIds],
    coverageIds: [],
    generationAllowed: true,
    capabilities: [
      {
        id: 'navigation.sidebar.open',
        input: { targetPath: canonicalCase.route },
        saveAs: 'navigation',
      },
      { id: 'item.openStandardCreate', saveAs: 'standardCreate' },
      { id: 'item.category.openCascader', saveAs: 'categoryMenu' },
      {
        id: 'item.category.selectParentWithChildren',
        input: { parentName: input.parentName, leafName: input.leafName },
        saveAs: 'categoryParent',
      },
      {
        id: 'item.category.selectLeaf',
        input: { parentName: input.parentName, leafName: input.leafName },
        saveAs: 'categoryLeaf',
      },
    ],
    assertions: [
      {
        adapterId: 'productCenter.verifyCategoryParentNotCommitted',
        input: { result: { $ref: '$result.categoryParent' } },
      },
      {
        adapterId: 'productCenter.verifyCategoryLeafCommitted',
        input: { result: { $ref: '$result.categoryLeaf' } },
      },
    ],
  };
}

export function assertProductCenterItemCategoryLeafProbeExecutionAuthorized(
  proposal: ApprovedProposal,
): void {
  if (proposal.status === 'runtime-accepted'
    && proposal.executionPolicy.uiExecutionAuthorized === false
    && proposal.executionPolicy.executionCompleted === true) {
    throw new Error('TC-ITEM-STD-007 只读 Probe 已完成并锁止重放');
  }
  if (proposal.status !== 'probe-approved'
    || proposal.approval.decision !== 'approved'
    || proposal.executionPolicy.uiExecutionAuthorized !== true
    || proposal.executionPolicy.mutatesData !== false
    || proposal.executionPolicy.saveAllowed !== false
    || proposal.executionPolicy.createAllowed !== false
    || proposal.executionPolicy.updateAllowed !== false
    || proposal.executionPolicy.deleteAllowed !== false) {
    throw new Error('TC-ITEM-STD-007 缺少精确只读 Probe 授权');
  }
}

export function assertProductCenterCategoryParentNotCommitted(
  result: ProductCenterCategoryParentSelectionResult,
): void {
  if (result.locatorCount !== 1
    || result.visibleMenuCount < 2
    || result.childVisible !== true
    || result.selectedValueAfter !== result.selectedValueBefore
    || result.selectedValueAfter.includes(result.parentName)) {
    throw new Error('一级分类不得成为最终已选值');
  }
}

export function assertProductCenterCategoryLeafCommitted(
  result: ProductCenterCategoryLeafSelectionResult,
): void {
  if (result.locatorCount !== 1
    || !result.selectedPath.includes(result.parentName)
    || !result.selectedPath.includes(result.leafName)
    || result.menuClosed !== true) {
    throw new Error('二级分类未成为最终已选值');
  }
  if (result.mutationAttempted
    || (result.mutationRequestCount ?? 0) !== 0
    || (result.mutationPaths?.length ?? 0) !== 0) {
    const paths = [...new Set(result.mutationPaths ?? [])].sort().join(',') || 'unknown';
    throw new Error(`只读分类 Probe 检测到数据写入请求：${paths}`);
  }
}

export function isProductCenterCategoryProbeMutationRequest(
  method: string,
  requestUrl: string,
): boolean {
  const normalizedMethod = method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod)) return false;
  if (['PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) return true;
  if (normalizedMethod !== 'POST') return true;
  const pathname = new URL(requestUrl).pathname;
  if (/\/(pageQuery|treeList)$/.test(pathname)) return false;
  if (pathname === '/g/collect' || /^\/api\/\d+\/envelope\/$/.test(pathname)) return false;
  return true;
}
