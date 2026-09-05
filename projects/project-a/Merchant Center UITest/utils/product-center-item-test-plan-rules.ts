import { createHash } from 'node:crypto';
import type {
  ProductCenterCandidateRule,
  ProductCenterCandidateRuleStatus,
  ProductCenterRuleValidationDimension,
} from './product-center-rule-evidence-ledger';

export type ProductCenterItemTestPlanCase = {
  id: string;
  title: string;
  priority: string;
  productType: string;
  scenarioFamily: string;
  source: string;
  preconditions: string[];
  actions: string[];
  expectedResults: string[];
  origin: string;
  status: string;
  changeType: string;
  diagnostics: string[];
};

export type ProductCenterItemReleaseCase = {
  caseId: string;
  scope: 'executable' | 'not-applicable' | 'supplemental';
  runtime: {
    status: 'runtime-passed' | 'deferred' | 'not-applicable' | 'supplemental-reviewed' | 'unresolved';
    evidenceRefs: string[];
  };
  ruleDecision?: {
    disposition: string;
    directive: string;
    sourceType: string;
    confirmedBy?: string;
  };
};

export type ProductCenterItemCuratedCandidateRule = {
  ruleId: string;
  canonicalId: string;
  statement: string;
  sourceIds: string[];
  scope: string[];
  currentStatus: ProductCenterCandidateRuleStatus;
  formalRuleBindingIds: string[];
  legacyRuleBindingIds: string[];
  legacyConflictRuleIds: string[];
  conflictsWithRuleIds: string[];
  requiredValidationDimensions: ProductCenterRuleValidationDimension[];
};

export type ProductCenterItemTestPlanRuleCandidate = ProductCenterCandidateRule & {
  caseId: string;
  priority: string;
  productType: string;
  scenarioFamily: string;
  ruleKind: 'business-behavior' | 'field-validation' | 'lifecycle' | 'integration' | 'ui-contract';
  sourceCitation: string;
  sourceCaseFingerprint: string;
  declaredBusinessRuleIds: string[];
  conditions: string[];
  actions: string[];
  outcomes: string[];
  runtimeStatus: ProductCenterItemReleaseCase['runtime']['status'];
  runtimeEvidenceRefs: string[];
  observedRecommendation: 'observed' | 'provisional' | 'blocked';
  formalPromotionAllowed: false;
};

export type ProductCenterItemTestPlanRuleLedger = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-test-plan-rule-candidates';
  generatedAt: string;
  status: 'generated-with-governance';
  fingerprint: string;
  source: {
    testPlanPath: string;
    testPlanFingerprint: string;
    releasePath: string;
    releaseFingerprint: string;
  };
  authorityPolicy: {
    testPlanIsScenarioEvidenceNotFormalAuthority: true;
    runtimeMayPromoteToFormal: false;
    humanApprovalRequired: true;
    currentCandidateFingerprintRequired: true;
  };
  summary: {
    sourceCases: number;
    activeCandidates: number;
    deprecatedExcluded: number;
    runtimeObserved: number;
    deferredBlocked: number;
    supplementalReviewed: number;
    curatedOverrides: number;
    formalRuleLinked: number;
  };
  candidates: ProductCenterItemTestPlanRuleCandidate[];
  excluded: Array<{
    caseId: string;
    title: string;
    reason: 'deprecated-test-case';
    sourceCitation: string;
    diagnostics: string[];
  }>;
};

export function buildProductCenterItemTestPlanRuleLedger(input: {
  generatedAt: string;
  testPlanPath: string;
  testPlanFingerprint: string;
  releasePath: string;
  releaseFingerprint: string;
  testPlanCases: readonly ProductCenterItemTestPlanCase[];
  releaseCases: readonly ProductCenterItemReleaseCase[];
  curatedCandidates: readonly ProductCenterItemCuratedCandidateRule[];
  formalBindingIdsByCaseId: ReadonlyMap<string, readonly string[]>;
  canonicalClaimsByCaseId?: ReadonlyMap<
    string,
    readonly { id: string; kind: 'precondition' | 'action' | 'expectation' }[]
  >;
}): ProductCenterItemTestPlanRuleLedger {
  const releaseByCaseId = new Map(input.releaseCases.map((item) => [item.caseId, item]));
  const curatedByCaseId = new Map(input.curatedCandidates.map((item) => [item.canonicalId, item]));
  const duplicateCaseIds = input.testPlanCases
    .map((item) => item.id)
    .filter((caseId, index, all) => all.indexOf(caseId) !== index);
  if (duplicateCaseIds.length > 0) throw new Error(`商品测试方案规则候选用例重复：${unique(duplicateCaseIds).join(',')}`);

  const unknownReleaseCases = input.testPlanCases.filter((item) => !releaseByCaseId.has(item.id));
  if (unknownReleaseCases.length > 0) {
    throw new Error(`商品测试方案规则候选缺少权威发布状态：${unknownReleaseCases.map((item) => item.id).join(',')}`);
  }
  const unknownCuratedCases = input.curatedCandidates.filter((item) => !releaseByCaseId.has(item.canonicalId));
  if (unknownCuratedCases.length > 0) {
    throw new Error(`商品精修候选规则指向未知用例：${unknownCuratedCases.map((item) => item.ruleId).join(',')}`);
  }

  const excluded = input.testPlanCases
    .filter((item) => item.status === 'deprecated')
    .map((item) => ({
      caseId: item.id,
      title: item.title,
      reason: 'deprecated-test-case' as const,
      sourceCitation: item.source,
      diagnostics: [...item.diagnostics],
    }));
  const candidates = input.testPlanCases
    .filter((item) => item.status !== 'deprecated')
    .map((item) => buildCandidate(
      item,
      releaseByCaseId.get(item.id)!,
      curatedByCaseId.get(item.id),
      input.formalBindingIdsByCaseId.get(item.id) ?? [],
      input.testPlanFingerprint,
      input.canonicalClaimsByCaseId?.get(item.id),
    ));
  const ruleIds = candidates.map((item) => item.ruleId);
  if (new Set(ruleIds).size !== ruleIds.length) throw new Error('商品测试方案规则候选 ruleId 不唯一');

  const stablePayload = {
    source: {
      testPlanPath: input.testPlanPath,
      testPlanFingerprint: input.testPlanFingerprint,
      releasePath: input.releasePath,
      releaseFingerprint: input.releaseFingerprint,
    },
    candidates,
    excluded,
  };
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-test-plan-rule-candidates',
    generatedAt: input.generatedAt,
    status: 'generated-with-governance',
    fingerprint: createHash('sha256').update(stableJson(stablePayload)).digest('hex'),
    ...stablePayload,
    authorityPolicy: {
      testPlanIsScenarioEvidenceNotFormalAuthority: true,
      runtimeMayPromoteToFormal: false,
      humanApprovalRequired: true,
      currentCandidateFingerprintRequired: true,
    },
    summary: {
      sourceCases: input.testPlanCases.length,
      activeCandidates: candidates.length,
      deprecatedExcluded: excluded.length,
      runtimeObserved: candidates.filter((item) => item.runtimeStatus === 'runtime-passed').length,
      deferredBlocked: candidates.filter((item) => item.runtimeStatus === 'deferred').length,
      supplementalReviewed: candidates.filter((item) => item.runtimeStatus === 'supplemental-reviewed').length,
      curatedOverrides: candidates.filter((item) => curatedByCaseId.has(item.caseId)).length,
      formalRuleLinked: candidates.filter((item) => item.formalRuleBindingIds.length > 0).length,
    },
  };
}

export function renderProductCenterItemTestPlanRuleMarkdown(
  ledger: ProductCenterItemTestPlanRuleLedger,
): string {
  const lines = [
    '# 商品中心商品管理测试方案候选业务规则',
    '',
    `- 来源用例：${ledger.summary.sourceCases}`,
    `- 有效候选：${ledger.summary.activeCandidates}`,
    `- 废弃排除：${ledger.summary.deprecatedExcluded}`,
    `- 已有运行观察：${ledger.summary.runtimeObserved}`,
    `- 延期阻断：${ledger.summary.deferredBlocked}`,
    `- 页面补充审查：${ledger.summary.supplementalReviewed}`,
    '- 治理：测试方案只生成候选规则；运行通过不能自动晋级正式规则。',
    '',
  ];
  for (const productType of unique(ledger.candidates.map((item) => item.productType))) {
    lines.push(`## ${productType}`, '');
    for (const rule of ledger.candidates.filter((item) => item.productType === productType)) {
      lines.push(
        `### ${rule.ruleId} ${rule.statement}`,
        '',
        `- 用例：${rule.caseId}`,
        `- 状态：${rule.currentStatus}；运行观察：${rule.observedRecommendation}`,
        `- 类型：${rule.ruleKind}；场景：${rule.scenarioFamily}；优先级：${rule.priority}`,
        `- 来源：${rule.sourceCitation}`,
        `- 条件：${rule.conditions.join('；')}`,
        `- 触发：${rule.actions.join('；')}`,
        `- 结果：${rule.outcomes.join('；')}`,
        '',
      );
    }
  }
  if (ledger.excluded.length > 0) {
    lines.push('## 废弃用例排除', '');
    for (const item of ledger.excluded) lines.push(`- ${item.caseId} ${item.title}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function buildCandidate(
  item: ProductCenterItemTestPlanCase,
  release: ProductCenterItemReleaseCase,
  curated: ProductCenterItemCuratedCandidateRule | undefined,
  formalBindingIds: readonly string[],
  testPlanFingerprint: string,
  canonicalClaims: readonly { id: string; kind: 'precondition' | 'action' | 'expectation' }[] | undefined,
): ProductCenterItemTestPlanRuleCandidate {
  if (item.preconditions.length === 0 || item.actions.length === 0 || item.expectedResults.length === 0) {
    throw new Error(`商品测试方案规则候选缺少条件、动作或结果：${item.id}`);
  }
  const currentStatus: ProductCenterCandidateRuleStatus = release.runtime.status === 'deferred'
    ? 'blocked'
    : curated?.currentStatus ?? 'provisional';
  const declaredBusinessRuleIds = unique(item.source.match(/BR-[A-Z0-9-]+/g) ?? []);
  const resolvedFormalBindings = unique([
    ...(curated?.formalRuleBindingIds ?? []),
    ...formalBindingIds,
  ]);
  const sourceCaseFingerprint = createHash('sha256').update(stableJson({
    id: item.id,
    title: item.title,
    source: item.source,
    preconditions: item.preconditions,
    actions: item.actions,
    expectedResults: item.expectedResults,
  })).digest('hex');
  return {
    ruleId: curated?.ruleId ?? `CBR-${item.id.replace(/^TC-/u, '')}`,
    caseId: item.id,
    module: 'item',
    statement: curated?.statement ?? item.title,
    priority: item.priority,
    productType: item.productType,
    scenarioFamily: item.scenarioFamily,
    ruleKind: classifyRuleKind(item),
    sourceCitation: item.source,
    sourceCaseFingerprint,
    declaredBusinessRuleIds,
    conditionClaims: canonicalClaims
      ?.filter((claim) => claim.kind === 'precondition').map((claim) => claim.id)
      ?? item.preconditions.map((_, index) => `${item.id}:precondition-${index + 1}`),
    actionClaims: canonicalClaims
      ?.filter((claim) => claim.kind === 'action').map((claim) => claim.id)
      ?? item.actions.map((_, index) => `${item.id}:action-${index + 1}`),
    outcomeClaims: canonicalClaims
      ?.filter((claim) => claim.kind === 'expectation').map((claim) => claim.id)
      ?? item.expectedResults.map((_, index) => `${item.id}:expectation-${index + 1}`),
    sourceIds: unique([
      `test-plan-case:${item.id}`,
      `test-plan-fingerprint:${testPlanFingerprint}`,
      ...declaredBusinessRuleIds.map((ruleId) => `declared-business-rule:${ruleId}`),
      ...(curated?.sourceIds ?? []),
    ]),
    scope: curated?.scope ?? unique([item.productType, item.scenarioFamily]),
    currentStatus,
    formalRuleBindingIds: resolvedFormalBindings,
    legacyRuleBindingIds: curated?.legacyRuleBindingIds ?? [],
    legacyConflictRuleIds: curated?.legacyConflictRuleIds ?? [],
    conflictsWithRuleIds: curated?.conflictsWithRuleIds ?? [],
    requiredValidationDimensions: curated?.requiredValidationDimensions ?? inferValidationDimensions(item),
    conditions: [...item.preconditions],
    actions: [...item.actions],
    outcomes: [...item.expectedResults],
    runtimeStatus: release.runtime.status,
    runtimeEvidenceRefs: [...release.runtime.evidenceRefs],
    observedRecommendation: release.runtime.status === 'runtime-passed'
      ? 'observed'
      : release.runtime.status === 'deferred' ? 'blocked' : 'provisional',
    formalPromotionAllowed: false,
  };
}

function classifyRuleKind(item: ProductCenterItemTestPlanCase): ProductCenterItemTestPlanRuleCandidate['ruleKind'] {
  const text = `${item.scenarioFamily} ${item.title} ${item.expectedResults.join(' ')}`;
  if (/终端|POS|菜单|下发|同步|继承|引用/u.test(text)) return 'integration';
  if (/状态生命周期|删除|停用|启用|恢复/u.test(text)) return 'lifecycle';
  if (/必填|校验|价格规格|长度|字符|数量|上限|下限|最少|最多/u.test(text)) return 'field-validation';
  if (/展示|查询|筛选|页面|入口|按钮|弹窗|列表/u.test(text)) return 'ui-contract';
  return 'business-behavior';
}

function inferValidationDimensions(
  item: ProductCenterItemTestPlanCase,
): ProductCenterRuleValidationDimension[] {
  const text = `${item.title} ${item.source} ${item.preconditions.join(' ')} ${item.expectedResults.join(' ')}`;
  const dimensions: ProductCenterRuleValidationDimension[] = [];
  if (/失败|不可|禁止|不允许|缺失|未找到|不展示|不生效|拒绝|错误/u.test(text)) dimensions.push('negative');
  else dimensions.push('positive');
  if (/边界|超过|超长|最多|最少|上限|下限|为\s*0|负数|小数|字符/u.test(text)) dimensions.push('boundary');
  if (/同一|不同|分类|商品类型|套餐|加料|标准商品|商户|菜单|终端|POS|引用|渠道/u.test(text)) dimensions.push('scope');
  return unique(dimensions);
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
