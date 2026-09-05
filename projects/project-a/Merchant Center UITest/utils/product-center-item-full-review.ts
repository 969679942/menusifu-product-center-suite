import { createHash } from 'node:crypto';
import type {
  ProductCenterItemRebuiltCase,
  ProductCenterItemXmindRebuildPlan,
} from './product-center-item-xmind-rebuild';

export type ProductCenterItemFullReviewIssueCode =
  | 'SOURCE_CONFIRMATION_REQUIRED'
  | 'SOURCE_REFERENCE_MISSING'
  | 'PAGE_OBSERVATION_NOT_FORMAL_RULE'
  | 'WEAK_INHERITANCE_SOURCE'
  | 'VAGUE_ACTION'
  | 'NON_USER_ACTION_STEP'
  | 'VAGUE_EXPECTATION'
  | 'GENERIC_DISPLAY_ASSERTION'
  | 'IMPLEMENTATION_DETAIL_ASSERTION'
  | 'UNSUPPORTED_ORDER_ASSERTION'
  | 'MULTIPLE_VALIDATION_TARGETS'
  | 'SEMANTIC_DUPLICATE'
  | 'STEP_REFERENCE_OUT_OF_RANGE'
  | 'OUTDATED_COMBO_RULE';

export type ProductCenterItemFullReviewIssue = {
  code: ProductCenterItemFullReviewIssueCode;
  dimension: 'source' | 'focus' | 'steps' | 'expectations' | 'duplication' | 'current-rule';
  severity: 'blocker' | 'major';
  message: string;
  evidence: string[];
};

export type ProductCenterItemFullReviewEntry = {
  caseId: string;
  title: string;
  priority: ProductCenterItemRebuiltCase['priority'];
  source: string;
  origin: ProductCenterItemRebuiltCase['origin'];
  originalStatus: ProductCenterItemRebuiltCase['status'];
  decision: 'approved' | 'revision-required' | 'source-confirmation-required' | 'deprecated';
  reviewedBy: 'Codex 测试专家';
  reviewedAt: string;
  reviewMethod: 'evidence-bound-full-static-review';
  dimensions: {
    source: 'pass' | 'blocked';
    focus: 'pass' | 'revision-required';
    steps: 'pass' | 'revision-required';
    expectations: 'pass' | 'revision-required';
    duplication: 'pass' | 'revision-required';
    currentRule: 'pass' | 'blocked';
  };
  issues: ProductCenterItemFullReviewIssue[];
  automationDisposition:
    | 'eligible-for-technical-binding-review'
    | 'technical-contract-required'
    | 'blocked-by-content-review'
    | 'not-applicable';
  automationReasons: string[];
  generationAllowed: false;
};

export type ProductCenterItemFullReviewDocument = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-full-review';
  status: 'approved' | 'review-complete-with-actions';
  generatedAt: string;
  sourcePlanFingerprint: string;
  fingerprint: string;
  summary: {
    total: number;
    expertReviewed: number;
    approved: number;
    revisionRequired: number;
    sourceConfirmationRequired: number;
    deprecated: number;
    pending: 0;
    byIssueCode: Record<string, number>;
  };
  generationAllowed: boolean;
  guardrails: {
    fullReviewRequiredForEveryCase: true;
    samplingAllowed: false;
    partialDownstreamReleaseAllowed: false;
    pageEvidenceMayDefineBusinessRule: false;
    allActiveCasesMustBeApprovedTogether: true;
  };
  entries: ProductCenterItemFullReviewEntry[];
};

type ReviewInput = {
  plan: ProductCenterItemXmindRebuildPlan;
  sourceCorpus: string;
  confirmedEvidenceByCaseId?: Readonly<Record<string, readonly string[]>>;
  authoritativeReleaseByCaseId?: Readonly<Record<string, {
    reviewDecision: 'approved';
    scope: 'executable';
    source: string;
  }>>;
  reviewedAt?: string;
};

export function buildProductCenterItemFullReview(
  input: ReviewInput,
): ProductCenterItemFullReviewDocument {
  const reviewedAt = input.reviewedAt ?? new Date().toISOString();
  const duplicateCaseIds = semanticDuplicateCaseIds(input.plan.cases);
  const confirmedEvidenceByCaseId = input.confirmedEvidenceByCaseId ?? {};
  const entries = input.plan.cases.map((item) => reviewCase({
    item,
    sourceCorpus: input.sourceCorpus,
    confirmedEvidence: confirmedEvidenceByCaseId[item.id] ?? [],
    authoritativeRelease: input.authoritativeReleaseByCaseId?.[item.id],
    duplicateCaseIds,
    reviewedAt,
  }));
  const summary = {
    total: entries.length,
    expertReviewed: entries.length,
    approved: entries.filter((item) => item.decision === 'approved').length,
    revisionRequired: entries.filter((item) => item.decision === 'revision-required').length,
    sourceConfirmationRequired: entries
      .filter((item) => item.decision === 'source-confirmation-required').length,
    deprecated: entries.filter((item) => item.decision === 'deprecated').length,
    pending: 0 as const,
    byIssueCode: countBy(entries.flatMap((item) => item.issues.map((issue) => issue.code))),
  };
  const activeCases = entries.filter((item) => item.decision !== 'deprecated');
  const generationAllowed = activeCases.length > 0
    && activeCases.every((item) => item.decision === 'approved');
  const value = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-full-review' as const,
    status: generationAllowed ? 'approved' as const : 'review-complete-with-actions' as const,
    generatedAt: reviewedAt,
    sourcePlanFingerprint: input.plan.fingerprint,
    summary,
    generationAllowed,
    guardrails: {
      fullReviewRequiredForEveryCase: true as const,
      samplingAllowed: false as const,
      partialDownstreamReleaseAllowed: false as const,
      pageEvidenceMayDefineBusinessRule: false as const,
      allActiveCasesMustBeApprovedTogether: true as const,
    },
    entries,
  };
  return {
    ...value,
    fingerprint: hashValue(value),
  };
}

export function assertProductCenterItemFullReviewGate(
  review: ProductCenterItemFullReviewDocument,
  options: { expectedSourcePlanFingerprint?: string } = {},
): void {
  if (options.expectedSourcePlanFingerprint
    && review.sourcePlanFingerprint !== options.expectedSourcePlanFingerprint) {
    throw new Error('商品用例全审已过期：重建计划指纹不一致');
  }
  if (review.summary.expertReviewed !== review.summary.total || review.summary.pending !== 0) {
    throw new Error('商品用例尚未完成逐条全审');
  }
  if (!review.generationAllowed || review.status !== 'approved') {
    throw new Error(
      `商品用例全审未通过：修订=${review.summary.revisionRequired}；来源确认=${review.summary.sourceConfirmationRequired}`,
    );
  }
  const unapproved = review.entries.filter((item) =>
    item.decision !== 'approved' && item.decision !== 'deprecated');
  if (unapproved.length > 0) throw new Error(`商品用例仍有未批准项：${unapproved.length}`);
}

export function renderProductCenterItemFullReviewMarkdown(
  review: ProductCenterItemFullReviewDocument,
): string {
  const lines = [
    '# 商品中心商品测试用例逐条全审报告',
    '',
    `- 审核方式：证据约束的逐条静态专家审核`,
    `- 总数：${review.summary.total}`,
    `- 已逐条审核：${review.summary.expertReviewed}`,
    `- 审核通过：${review.summary.approved}`,
    `- 需要修订：${review.summary.revisionRequired}`,
    `- 来源/规则待确认：${review.summary.sourceConfirmationRequired}`,
    `- 已废弃：${review.summary.deprecated}`,
    `- 待审核：${review.summary.pending}`,
    `- 下游生成允许：${review.generationAllowed ? '是' : '否'}`,
    '- 发布原则：不抽审、不部分放行；全部活动用例通过前禁止进入技术绑定或 Recipe。',
    '',
    '## 问题分布',
    '',
    ...Object.entries(review.summary.byIssueCode).map(([code, count]) => `- ${code}：${count}`),
    '',
  ];
  for (const decision of [
    'source-confirmation-required',
    'revision-required',
    'approved',
    'deprecated',
  ] as const) {
    const entries = review.entries.filter((item) => item.decision === decision);
    lines.push(`## ${decision}（${entries.length}）`, '');
    for (const item of entries) {
      lines.push(
        `### ${item.caseId} ${item.title}`,
        '',
        `- 优先级：${item.priority}`,
        `- 来源：${item.source}`,
        `- 审核结论：${item.decision}`,
        `- 自动化处置：${item.automationDisposition}`,
        `- 维度：来源=${item.dimensions.source}；目标=${item.dimensions.focus}；步骤=${item.dimensions.steps}；预期=${item.dimensions.expectations}；重复=${item.dimensions.duplication}；当前规则=${item.dimensions.currentRule}`,
        ...(item.issues.length > 0
          ? item.issues.map((issue) =>
            `- 问题 ${issue.code}：${issue.message}；证据：${issue.evidence.join(' | ')}`)
          : ['- 问题：无']),
        ...(item.automationReasons.length > 0
          ? item.automationReasons.map((reason) => `- 自动化前置：${reason}`)
          : []),
        '',
      );
    }
  }
  return `${lines.join('\n').trim()}\n`;
}

function reviewCase(input: {
  item: ProductCenterItemRebuiltCase;
  sourceCorpus: string;
  confirmedEvidence: readonly string[];
  authoritativeRelease?: {
    reviewDecision: 'approved';
    scope: 'executable';
    source: string;
  };
  duplicateCaseIds: ReadonlySet<string>;
  reviewedAt: string;
}): ProductCenterItemFullReviewEntry {
  const { item } = input;
  if (item.status === 'deprecated') {
    return baseEntry(item, input.reviewedAt, 'deprecated', [], 'not-applicable', []);
  }
  const sourceContext = [item.source, ...input.confirmedEvidence].join(' ');
  const issues: ProductCenterItemFullReviewIssue[] = [];
  const hasAuthoritativeReleaseApproval = item.status === 'review-required'
    && input.authoritativeRelease?.reviewDecision === 'approved'
    && input.authoritativeRelease.scope === 'executable'
    && input.authoritativeRelease.source.trim().length > 0;
  if (item.status === 'review-required' && !hasAuthoritativeReleaseApproval) {
    addIssue(issues, 'SOURCE_CONFIRMATION_REQUIRED', 'source', 'blocker',
      '该用例的来源或规则尚未形成正式授权。', [item.source, ...item.diagnostics]);
  }
  if (item.origin === 'page-supplement'
    && !item.diagnostics.includes('PAGE_CAPABILITY_EXPERT_REVIEWED')) {
    addIssue(issues, 'PAGE_OBSERVATION_NOT_FORMAL_RULE', 'source', 'blocker',
      '页面观察只能证明入口或控件存在，不能授权业务结果。', [item.source]);
  }
  const missingRefs = extractRuleRefs(item.source).filter((ref) =>
    !input.sourceCorpus.includes(ref) && !input.confirmedEvidence.some((value) => value.includes(ref)));
  if (missingRefs.length > 0) {
    addIssue(issues, 'SOURCE_REFERENCE_MISSING', 'source', 'blocker',
      '来源中的规则编号无法在当前证据语料中定位。', missingRefs);
  }
  if (/基本信息与标准商品一致|基础字段与标准商品一致|其他设置也与标准商品一致/.test(item.source)) {
    addIssue(issues, 'WEAK_INHERITANCE_SOURCE', 'source', 'major',
      '“与标准商品一致”没有逐字段界定验证范围，必须补精确字段来源。', [item.source]);
  }
  const vagueActions = item.actions.filter(isVagueAction);
  if (vagueActions.length > 0) {
    addIssue(issues, 'VAGUE_ACTION', 'steps', 'major',
      '测试步骤未写清具体字段、输入值或选择目标。', vagueActions);
  }
  const nonUserActions = item.actions.filter(isNonUserAction);
  if (nonUserActions.length > 0) {
    addIssue(issues, 'NON_USER_ACTION_STEP', 'steps', 'major',
      '测试步骤中混入页面结果或等待描述，应移到预期或技术等待合同。', nonUserActions);
  }
  const vagueExpectations = item.expectedResults.filter(isVagueExpectation);
  if (vagueExpectations.length > 0) {
    addIssue(issues, 'VAGUE_EXPECTATION', 'expectations', 'major',
      '预期没有给出可核对的字段值、状态、计数或明确提示。', vagueExpectations);
  }
  if (/展示正确|文本展示正确|页面信息正确/.test(item.title)) {
    addIssue(issues, 'GENERIC_DISPLAY_ASSERTION', 'focus', 'major',
      '“展示正确”没有声明唯一验证目标和字段级验收标准。', [item.title]);
  }
  const implementationAssertions = item.expectedResults.filter((value) =>
    /数据库|\bDB\b|SQL|直接查询表|响应码/.test(value));
  if (implementationAssertions.length > 0) {
    addIssue(issues, 'IMPLEMENTATION_DETAIL_ASSERTION', 'expectations', 'major',
      '黑盒用例不应依赖数据库或未声明的实现细节断言。', implementationAssertions);
  }
  const orderAssertions = item.expectedResults.filter((value) => /第一条|创建时间倒序|列表顶部|最上面/.test(value));
  if (orderAssertions.length > 0 && !/第一条|创建时间倒序|列表顶部|最上面/.test(sourceContext)) {
    addIssue(issues, 'UNSUPPORTED_ORDER_ASSERTION', 'expectations', 'major',
      '列表位置或排序断言超出该用例当前来源。', orderAssertions);
  }
  if (hasMultipleValidationTargets(item.title)) {
    addIssue(issues, 'MULTIPLE_VALIDATION_TARGETS', 'focus', 'major',
      '一个用例混合多个可独立失败的验证目标，应拆分后分别审核。', [item.title]);
  }
  if (input.duplicateCaseIds.has(item.id)) {
    addIssue(issues, 'SEMANTIC_DUPLICATE', 'duplication', 'major',
      '存在同商品类型、同场景的语义重复用例。', [item.title]);
  }
  const badStepRefs = item.expectedResults.filter((value) =>
    [...value.matchAll(/步骤\s*(\d+)/g)].some((matched) => Number(matched[1]) > item.actions.length));
  if (badStepRefs.length > 0) {
    addIssue(issues, 'STEP_REFERENCE_OUT_OF_RANGE', 'expectations', 'major',
      '预期引用了不存在的步骤编号。', badStepRefs);
  }
  const activeContent = [item.title, ...item.actions, ...item.expectedResults].join(' ');
  if (/最少选择份数|最多选择份数|份数内免费/.test(activeContent)) {
    addIssue(issues, 'OUTDATED_COMBO_RULE', 'current-rule', 'blocker',
      '用例仍包含已废弃的套餐可选搭配字段。', [activeContent]);
  }

  const decision = issues.some((issue) => issue.severity === 'blocker')
    ? 'source-confirmation-required' as const
    : issues.length > 0
      ? 'revision-required' as const
      : 'approved' as const;
  const automationReasons = automationReviewReasons(item);
  const automationDisposition = decision !== 'approved'
    ? 'blocked-by-content-review' as const
    : automationReasons.length > 0
      ? 'technical-contract-required' as const
      : 'eligible-for-technical-binding-review' as const;
  return baseEntry(item, input.reviewedAt, decision, issues, automationDisposition, automationReasons);
}

function baseEntry(
  item: ProductCenterItemRebuiltCase,
  reviewedAt: string,
  decision: ProductCenterItemFullReviewEntry['decision'],
  issues: ProductCenterItemFullReviewIssue[],
  automationDisposition: ProductCenterItemFullReviewEntry['automationDisposition'],
  automationReasons: string[],
): ProductCenterItemFullReviewEntry {
  const has = (dimension: ProductCenterItemFullReviewIssue['dimension']) =>
    issues.some((issue) => issue.dimension === dimension);
  return {
    caseId: item.id,
    title: item.title,
    priority: item.priority,
    source: item.source,
    origin: item.origin,
    originalStatus: item.status,
    decision,
    reviewedBy: 'Codex 测试专家',
    reviewedAt,
    reviewMethod: 'evidence-bound-full-static-review',
    dimensions: {
      source: has('source') ? 'blocked' : 'pass',
      focus: has('focus') ? 'revision-required' : 'pass',
      steps: has('steps') ? 'revision-required' : 'pass',
      expectations: has('expectations') ? 'revision-required' : 'pass',
      duplication: has('duplication') ? 'revision-required' : 'pass',
      currentRule: has('current-rule') ? 'blocked' : 'pass',
    },
    issues,
    automationDisposition,
    automationReasons,
    generationAllowed: false,
  };
}

function addIssue(
  target: ProductCenterItemFullReviewIssue[],
  code: ProductCenterItemFullReviewIssueCode,
  dimension: ProductCenterItemFullReviewIssue['dimension'],
  severity: ProductCenterItemFullReviewIssue['severity'],
  message: string,
  evidence: readonly string[],
): void {
  target.push({ code, dimension, severity, message, evidence: [...evidence] });
}

function isVagueAction(value: string): boolean {
  const normalized = normalizeText(value);
  return /^(?:输入|填写|选择)(?:商品)?(?:必填)?信息(?:[，,。]|$)/.test(normalized)
    || /按(?:用例)?标题(?:描述)?执行|进行相关操作/.test(normalized);
}

function isNonUserAction(value: string): boolean {
  const normalized = normalizeText(value);
  return /^(?:页面|列表)(?:自动)?(?:返回|刷新|展示)/.test(normalized)
    || /^等待(?:页面|列表|数据)/.test(normalized);
}

function isVagueExpectation(value: string): boolean {
  const normalized = normalizeText(value).replace(/[。！!]+$/, '');
  return /^(?:正常|符合预期|展示正确|页面展示正确|操作成功|保存成功|创建成功|保存失败|创建失败)$/.test(normalized)
    || /未产生不符合预期的数据变更/.test(normalized)
    || /(?:页面|列表|结果|功能|操作|保存|创建|编辑|删除|查询|展示)(?:均)?正常$/.test(normalized);
}

function hasMultipleValidationTargets(title: string): boolean {
  return /负数或非数字|助记码或设备编码|描述标签多选、商品角标单选、统计标签多选|包装费与成本/.test(title);
}

function semanticDuplicateCaseIds(cases: readonly ProductCenterItemRebuiltCase[]): Set<string> {
  const byFingerprint = new Map<string, ProductCenterItemRebuiltCase[]>();
  for (const item of cases.filter((candidate) => candidate.status !== 'deprecated')) {
    const title = item.title
      .replace(/输入/g, '')
      .replace(/为/g, '')
      .replace(/时/g, '')
      .replace(/并提示\s*[A-Z]+-\d+/, '')
      .replace(/[\s，。；、]/g, '');
    const key = `${item.productType}:${item.scenarioFamily}:${title}`;
    byFingerprint.set(key, [...(byFingerprint.get(key) ?? []), item]);
  }
  return new Set([...byFingerprint.values()]
    .filter((items) => items.length > 1)
    .flatMap((items) => items.map((item) => item.id)));
}

function automationReviewReasons(item: ProductCenterItemRebuiltCase): string[] {
  const text = [item.title, ...item.actions, ...item.expectedResults].join(' ');
  const reasons: string[] = [];
  if (/C端|终端|门店|下发|POS|KDS/.test(text)) reasons.push('需要跨系统页面/API 证据和独立运行合同');
  if (/创建|新增|保存|编辑|修改|删除|启用|停用|上传/.test(text)) {
    reasons.push('需要唯一测试数据、服务端 ID、清理适配器和零残留验证');
  }
  return reasons;
}

function extractRuleRefs(value: string): string[] {
  return [...new Set(value.match(/(?:BR|CBR)-[A-Z0-9-]+/g) ?? [])];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
