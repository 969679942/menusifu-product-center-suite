import type {
  ProductCenterReviewRequiredTestCase,
  ProductCenterTestCaseGenerationGateIssueCode,
  ProductCenterTestCaseInput,
} from './product-center-test-case-ir';

export type ProductCenterTestCaseRepairKind =
  | 'automation-capability'
  | 'execution-contract'
  | 'input-format'
  | 'source-trace'
  | 'test-plan-content';

export type ProductCenterTestCaseReviewDecision = {
  id: string;
  caseId: string;
  decision: 'repair-and-reaudit' | 'manual-only' | 'defer';
  reviewedBy: string;
  reviewedAt: string;
  reason: string;
  evidenceRefs: string[];
};

export type ProductCenterTestCaseReviewAction = {
  kind:
    | 'audit-capability'
    | 'repair-execution-contract'
    | 'repair-input'
    | 'resolve-source'
    | 'rewrite-action'
    | 'rewrite-expectation'
    | 'rewrite-test-case';
  issueCode: ProductCenterTestCaseGenerationGateIssueCode;
  description: string;
  targetIds: string[];
  requiredEvidence: string[];
};

export type ProductCenterTestCaseReviewQueueItem = {
  id: string;
  caseId: string;
  title: string;
  module: string;
  route: string;
  status: 'pending' | 'ready-for-reaudit' | 'resolved' | 'deferred';
  issueCodes: ProductCenterTestCaseGenerationGateIssueCode[];
  issues: string[];
  repairTrack: 'test-plan-revision' | 'automation-capability';
  repairKinds: ProductCenterTestCaseRepairKind[];
  requiredActions: ProductCenterTestCaseReviewAction[];
  requiredReauditGates: typeof PRODUCT_CENTER_REQUIRED_REAUDIT_GATES;
  sourceRefs: string[];
  original: {
    actions: string[];
    expectedResults: string[];
    capabilityIds: string[];
  };
  promotionPolicy: 'reaudit-required';
  allowedDecisions: readonly ['repair-and-reaudit', 'manual-only', 'defer'];
  reviewDecision?: ProductCenterTestCaseReviewDecision;
};

export const PRODUCT_CENTER_REQUIRED_REAUDIT_GATES = [
  'source-citation',
  'semantic-audit',
  'executability-audit',
  'recipe-compile',
  'runtime-acceptance',
] as const;

export function buildProductCenterReviewRepairContract() {
  return {
    schemaVersion: '1.0.0' as const,
    promotionPolicy: 'reaudit-required' as const,
    tracks: {
      'test-plan-revision': {
        owner: 'test-plan-owner',
        allowedMutations: ['formal-test-plan', 'source-citation'],
        businessContentRequiresSourceOrApproval: true,
      },
      'automation-capability': {
        owner: 'automation-owner',
        allowedMutations: ['page-object', 'capability-adapter', 'assertion-adapter', 'cleanup-adapter'],
        businessRuleMutationAllowed: false,
      },
    },
    requiredReauditGates: PRODUCT_CENTER_REQUIRED_REAUDIT_GATES,
  };
}

export type ProductCenterTestCaseReviewQueue = {
  schemaVersion: '1.0.0';
  collectionId: string;
  fingerprint: string;
  status: 'clear' | 'pending-review' | 'reaudit-required' | 'resolved';
  summary: {
    total: number;
    pending: number;
    readyForReaudit: number;
    resolved: number;
    deferred: number;
    byRepairKind: Record<string, number>;
    byIssueCode: Record<string, number>;
  };
  items: ProductCenterTestCaseReviewQueueItem[];
};

export function buildProductCenterTestCaseReviewQueue(input: {
  collectionId: string;
  fingerprint: string;
  reviewRequired: readonly ProductCenterReviewRequiredTestCase[];
  cases: readonly ProductCenterTestCaseInput[];
  knownCapabilityIds: ReadonlySet<string>;
  decisions?: readonly ProductCenterTestCaseReviewDecision[];
}): ProductCenterTestCaseReviewQueue {
  if (!input.collectionId.trim()) throw new Error('测试用例评审队列缺少集合标识');
  if (!input.fingerprint.trim()) throw new Error('测试用例评审队列缺少来源指纹');

  const casesById = uniqueMap(input.cases, (item) => item.id, '规范化用例重复');
  const reviewByCaseId = uniqueMap(input.reviewRequired, (item) => item.caseId, '评审项重复');
  const decisionsByCaseId = uniqueMap(input.decisions ?? [], (item) => item.caseId, '评审决定重复');
  for (const decision of decisionsByCaseId.values()) {
    if (!reviewByCaseId.has(decision.caseId)) {
      throw new Error(`评审决定没有对应评审项：${decision.caseId}`);
    }
    validateDecision(decision);
  }

  const items = [...reviewByCaseId.values()]
    .map((review) => {
      const testCase = casesById.get(review.caseId);
      if (!testCase) throw new Error(`评审项缺少规范化用例：${review.caseId}`);
      return buildItem(review, testCase, input.knownCapabilityIds, decisionsByCaseId.get(review.caseId));
    })
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  const summary = {
    total: items.length,
    pending: items.filter((item) => item.status === 'pending').length,
    readyForReaudit: items.filter((item) => item.status === 'ready-for-reaudit').length,
    resolved: items.filter((item) => item.status === 'resolved').length,
    deferred: items.filter((item) => item.status === 'deferred').length,
    byRepairKind: countBy(items.flatMap((item) => item.repairKinds)),
    byIssueCode: countBy(items.flatMap((item) => item.issueCodes)),
  };

  return {
    schemaVersion: '1.0.0',
    collectionId: input.collectionId,
    fingerprint: input.fingerprint,
    status: resolveQueueStatus(summary),
    summary,
    items,
  };
}

function buildItem(
  review: ProductCenterReviewRequiredTestCase,
  testCase: ProductCenterTestCaseInput,
  knownCapabilityIds: ReadonlySet<string>,
  decision: ProductCenterTestCaseReviewDecision | undefined,
): ProductCenterTestCaseReviewQueueItem {
  const issueCodes = [...new Set(review.issueCodes)].sort((left, right) => left.localeCompare(right));
  const requiredActions = issueCodes.map((code) => buildRequiredAction(code, testCase, knownCapabilityIds));
  const repairKinds = [...new Set(issueCodes.map(repairKindFor))]
    .sort((left, right) => left.localeCompare(right));
  const repairTrack = repairKinds.some((kind) =>
    kind === 'automation-capability' || kind === 'execution-contract')
    ? 'automation-capability' as const
    : 'test-plan-revision' as const;

  return {
    id: `test-case-review:${review.caseId}`,
    caseId: review.caseId,
    title: review.title,
    module: review.module,
    route: review.route,
    status: decisionStatus(decision),
    issueCodes,
    issues: [...review.issues],
    repairTrack,
    repairKinds,
    requiredActions,
    requiredReauditGates: PRODUCT_CENTER_REQUIRED_REAUDIT_GATES,
    sourceRefs: [...(testCase.sourceRefs ?? [])],
    original: {
      actions: [...testCase.actions],
      expectedResults: [...testCase.expectedResults],
      capabilityIds: [...(testCase.execution?.capabilityIds ?? [])],
    },
    promotionPolicy: 'reaudit-required',
    allowedDecisions: ['repair-and-reaudit', 'manual-only', 'defer'],
    ...(decision ? { reviewDecision: { ...decision, evidenceRefs: [...decision.evidenceRefs] } } : {}),
  };
}

function buildRequiredAction(
  code: ProductCenterTestCaseGenerationGateIssueCode,
  testCase: ProductCenterTestCaseInput,
  knownCapabilityIds: ReadonlySet<string>,
): ProductCenterTestCaseReviewAction {
  if (code === 'VAGUE_ACTION') {
    return action(code, 'rewrite-action', '补写字段、控件、操作对象和提交动作', [
      'source-citation',
      'executable-action',
      'observable-result',
    ]);
  }
  if (code === 'VAGUE_EXPECTATION' || code === 'EXPECTATION_REQUIRED') {
    return action(code, 'rewrite-expectation', '补写可见状态、计数、字段值或 API 终态', [
      'source-citation',
      'observable-result',
    ]);
  }
  if (code === 'UNKNOWN_CAPABILITY') {
    const targetIds = (testCase.execution?.capabilityIds ?? [])
      .filter((capabilityId) => !knownCapabilityIds.has(capabilityId));
    return action(code, 'audit-capability', '审计真实页面和接口后实现独立 capability', [
      'page-contract',
      'network-or-api',
      'assertion-adapter',
      'cleanup-adapter',
    ], targetIds);
  }
  if (repairKindFor(code) === 'source-trace') {
    return action(code, 'resolve-source', '补齐或修正业务来源、执行证据及其精确引用', [
      'source-citation',
      'source-fingerprint',
    ]);
  }
  if (repairKindFor(code) === 'automation-capability'
    || repairKindFor(code) === 'execution-contract') {
    return action(code, 'repair-execution-contract', '补齐可执行能力、验证信号、数据或清理合同', [
      'execution-contract',
      'runtime-observation',
    ]);
  }
  if (repairKindFor(code) === 'input-format') {
    return action(code, 'repair-input', '修正测试用例输入结构后重新解析', ['validated-test-case-input']);
  }
  return action(code, 'rewrite-test-case', '补齐可执行、可观测且有来源的正式测试用例', [
    'source-citation',
    'validated-test-case-input',
  ]);
}

function action(
  issueCode: ProductCenterTestCaseGenerationGateIssueCode,
  kind: ProductCenterTestCaseReviewAction['kind'],
  description: string,
  requiredEvidence: string[],
  targetIds: string[] = [],
): ProductCenterTestCaseReviewAction {
  return { kind, issueCode, description, targetIds, requiredEvidence };
}

function repairKindFor(code: ProductCenterTestCaseGenerationGateIssueCode): ProductCenterTestCaseRepairKind {
  if (['VAGUE_ACTION', 'VAGUE_EXPECTATION', 'ACTION_REQUIRED', 'EXPECTATION_REQUIRED', 'CLAIM_REQUIRED']
    .includes(code)) return 'test-plan-content';
  if (['UNKNOWN_CAPABILITY', 'CAPABILITY_REQUIRED', 'SEED_ADAPTER_REQUIRED', 'CLEANUP_ADAPTER_REQUIRED']
    .includes(code)) return 'automation-capability';
  if (['EXECUTION_CONTRACT_REQUIRED', 'ROLE_REQUIRED', 'UNKNOWN_ROLE', 'ENVIRONMENT_REQUIRED',
    'UNKNOWN_ENVIRONMENT', 'API_VERIFY_REQUIRED', 'UI_VERIFY_REQUIRED', 'ASYNC_SIGNAL_REQUIRED']
    .includes(code)) return 'execution-contract';
  if (['SOURCE_REQUIRED', 'UNKNOWN_SOURCE', 'CLAIM_SOURCE_REQUIRED', 'SOURCE_TRACE_REQUIRED',
    'UNKNOWN_CLAIM_SOURCE', 'UNKNOWN_EXECUTION_EVIDENCE', 'INFERRED_CLAIM',
    'INFERENCE_TRACE_REQUIRED', 'SOURCE_TRACE_MISMATCH', 'CONFLICTING_CLAIM', 'UNRESOLVED_SOURCE']
    .includes(code)) return 'source-trace';
  return 'input-format';
}

function validateDecision(decision: ProductCenterTestCaseReviewDecision): void {
  if (!decision.id.trim()) throw new Error('测试用例评审决定缺少 ID');
  if (!decision.reviewedBy.trim()) throw new Error(`测试用例评审决定缺少审核人：${decision.id}`);
  if (!decision.reviewedAt.trim()) throw new Error(`测试用例评审决定缺少审核时间：${decision.id}`);
  if (!decision.reason.trim()) throw new Error(`测试用例评审决定缺少理由：${decision.id}`);
  if (decision.decision === 'repair-and-reaudit' && decision.evidenceRefs.length === 0) {
    throw new Error(`修复后重审决定缺少证据引用：${decision.id}`);
  }
}

function decisionStatus(
  decision: ProductCenterTestCaseReviewDecision | undefined,
): ProductCenterTestCaseReviewQueueItem['status'] {
  if (!decision) return 'pending';
  if (decision.decision === 'repair-and-reaudit') return 'ready-for-reaudit';
  if (decision.decision === 'manual-only') return 'resolved';
  return 'deferred';
}

function resolveQueueStatus(summary: ProductCenterTestCaseReviewQueue['summary']): ProductCenterTestCaseReviewQueue['status'] {
  if (summary.total === 0) return 'clear';
  if (summary.pending > 0 || summary.deferred > 0) return 'pending-review';
  if (summary.readyForReaudit > 0) return 'reaudit-required';
  return 'resolved';
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function uniqueMap<T>(
  items: readonly T[],
  keyFor: (item: T) => string,
  duplicateLabel: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const key = keyFor(item);
    if (result.has(key)) throw new Error(`${duplicateLabel}：${key}`);
    result.set(key, item);
  }
  return result;
}
