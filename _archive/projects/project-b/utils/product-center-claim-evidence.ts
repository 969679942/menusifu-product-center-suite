import type { ProductCenterTestCaseInput } from './product-center-test-case-ir';

export type ProductCenterClaimEvidence = {
  claimId: string;
  claimKind?: 'precondition' | 'action' | 'expectation';
  evidenceType: 'visible-ui' | 'api' | 'network' | 'confirmed-rule';
  semanticKey: string;
  observableId: string;
  observableSemanticKey: string;
  observableVisibility: 'visible' | 'dom-only' | 'not-applicable';
  sourceIds: string[];
  assertionAdapterId?: string;
  capabilityId?: string;
  sequence?: number;
  pageState?: string;
};

export type ProductCenterAssertionEvidence = ProductCenterClaimEvidence;

export type ProductCenterClaimEvidenceIssueCode =
  | 'EXPECTATION_EVIDENCE_REQUIRED'
  | 'PRECONDITION_EVIDENCE_REQUIRED'
  | 'ACTION_EVIDENCE_REQUIRED'
  | 'UNKNOWN_CLAIM'
  | 'CLAIM_NOT_EXPECTATION'
  | 'SOURCE_REQUIRED'
  | 'VISIBLE_UI_EVIDENCE_REQUIRED'
  | 'SEMANTIC_EVIDENCE_MISMATCH'
  | 'ASSERTION_ADAPTER_REQUIRED'
  | 'OBSERVABLE_REQUIRED'
  | 'CAPABILITY_REQUIRED'
  | 'ACTION_SEQUENCE_REQUIRED'
  | 'PAGE_STATE_REQUIRED'
  | 'SIDEBAR_NAVIGATION_REQUIRED';

export type ProductCenterClaimEvidenceIssue = {
  claimId: string;
  code: ProductCenterClaimEvidenceIssueCode;
  message: string;
};

export function auditProductCenterClaimEvidence(
  testCase: ProductCenterTestCaseInput,
  evidence: readonly ProductCenterClaimEvidence[],
) {
  const claims = testCase.claims ?? [];
  const claimsById = new Map((testCase.claims ?? []).map((claim) => [claim.id, claim]));
  const evidenceByClaimId = new Map<string, ProductCenterClaimEvidence[]>();
  const issues: ProductCenterClaimEvidenceIssue[] = [];

  for (const item of evidence) {
    const claim = claimsById.get(item.claimId);
    if (!claim) {
      issues.push(issue(item.claimId, 'UNKNOWN_CLAIM', `断言证据引用了不存在的 Claim：${item.claimId}`));
      continue;
    }
    if (item.claimKind && item.claimKind !== claim.kind) {
      issues.push(issue(item.claimId, 'CLAIM_NOT_EXPECTATION', `证据类型与 Claim 类型不一致：${item.claimId}`));
      continue;
    }
    const existing = evidenceByClaimId.get(item.claimId) ?? [];
    existing.push(item);
    evidenceByClaimId.set(item.claimId, existing);
    validateEvidence(item, claim.kind, issues);
  }

  for (const claim of claims) {
    if ((evidenceByClaimId.get(claim.id) ?? []).length === 0) {
      const code = claim.kind === 'precondition'
        ? 'PRECONDITION_EVIDENCE_REQUIRED'
        : claim.kind === 'action'
          ? 'ACTION_EVIDENCE_REQUIRED'
          : 'EXPECTATION_EVIDENCE_REQUIRED';
      issues.push(issue(claim.id, code, `${claim.kind} Claim 缺少可执行证据：${claim.text}`));
    }
  }

  const sidebarNavigation = evidence.find((item) =>
    claimsById.get(item.claimId)?.kind === 'action'
    && item.capabilityId === 'navigation.sidebar.open'
    && item.sequence === 1);
  if (!sidebarNavigation) {
    issues.push(issue(testCase.id, 'SIDEBAR_NAVIGATION_REQUIRED', '所有用例第一项操作必须通过侧边栏进入目标模块'));
  }

  return {
    compileCandidate: issues.length === 0,
    runtimeAccepted: false,
    issues,
  };
}

function validateEvidence(
  evidence: ProductCenterClaimEvidence,
  claimKind: 'precondition' | 'action' | 'expectation',
  issues: ProductCenterClaimEvidenceIssue[],
): void {
  if (evidence.sourceIds.length === 0) {
    issues.push(issue(evidence.claimId, 'SOURCE_REQUIRED', `断言证据缺少来源：${evidence.claimId}`));
  }
  if (claimKind !== 'action' && !evidence.assertionAdapterId?.trim()) {
    issues.push(issue(evidence.claimId, 'ASSERTION_ADAPTER_REQUIRED', `断言证据缺少断言适配器：${evidence.claimId}`));
  }
  if (claimKind === 'action') {
    if (!evidence.capabilityId?.trim()) {
      issues.push(issue(evidence.claimId, 'CAPABILITY_REQUIRED', `操作证据缺少能力 ID：${evidence.claimId}`));
    }
    if (!Number.isInteger(evidence.sequence) || (evidence.sequence ?? 0) < 1) {
      issues.push(issue(evidence.claimId, 'ACTION_SEQUENCE_REQUIRED', `操作证据缺少有效顺序：${evidence.claimId}`));
    }
    if (!evidence.pageState?.trim()) {
      issues.push(issue(evidence.claimId, 'PAGE_STATE_REQUIRED', `操作证据缺少页面进入状态：${evidence.claimId}`));
    }
  }
  if (evidence.observableId.trim().length === 0) {
    issues.push(issue(evidence.claimId, 'OBSERVABLE_REQUIRED', `断言证据缺少可观测对象：${evidence.claimId}`));
  }
  if (evidence.evidenceType === 'visible-ui' && evidence.observableVisibility !== 'visible') {
    issues.push(issue(
      evidence.claimId,
      'VISIBLE_UI_EVIDENCE_REQUIRED',
      `UI 断言必须绑定真实可见对象，禁止使用隐藏 DOM：${evidence.observableId}`,
    ));
  }
  if (normalizeSemanticKey(evidence.semanticKey) !== normalizeSemanticKey(evidence.observableSemanticKey)) {
    issues.push(issue(
      evidence.claimId,
      'SEMANTIC_EVIDENCE_MISMATCH',
      `断言语义与可观测对象语义不一致：${evidence.semanticKey} != ${evidence.observableSemanticKey}`,
    ));
  }
}

function normalizeSemanticKey(value: string): string {
  return value.trim().toLowerCase();
}

function issue(
  claimId: string,
  code: ProductCenterClaimEvidenceIssueCode,
  message: string,
): ProductCenterClaimEvidenceIssue {
  return { claimId, code, message };
}
