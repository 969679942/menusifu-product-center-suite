import { createHash } from 'node:crypto';
import type { ProductCenterXmindItemPlan } from './product-center-canonical-item-test-plan';
import { diagnoseProductCenterMarkdownTestPlan } from './product-center-test-plan-markdown';

export type ProductCenterItemPageCapability = {
  id: string;
  route: string;
  label: string;
  observedFacts: string[];
  formalCaseIds: string[];
  disposition: 'covered' | 'supplement-required' | 'conflict-review-required';
  supplementCaseId?: string;
};

export type ProductCenterItemPageSupplementCase = {
  id: string;
  title: string;
  proposedPriority: 'P1' | 'P2';
  module: string;
  route: string;
  sourceCitations: Array<{
    kind: 'ui-observed' | 'business-rule-explicit';
    citation: string;
    acceptanceEligible: boolean;
  }>;
  preconditions: string[];
  actions: string[];
  expectedResults: string[];
  status: 'review-required';
  generationAllowed: false;
  capabilityIds: ['navigation.sidebar.open', string];
  reviewRequired: string[];
};

export type ProductCenterItemPageRuleConflict = {
  id: string;
  route: string;
  formalCaseIds: string[];
  formalClaim: string;
  observedFact: string;
  disposition: 'review-required';
  generationAllowed: false;
  resolutionRequired: string;
};

export type ProductCenterItemPageObservation = {
  observationId: string;
  observedAt: string;
  mode: 'read-only';
  routes: string[];
  screenshots: Array<{
    path: string;
    status: 'verified-current-page' | 'invalid-loading-state';
    note: string;
  }>;
  capabilities: ProductCenterItemPageCapability[];
  supplementCases: ProductCenterItemPageSupplementCase[];
  conflicts: ProductCenterItemPageRuleConflict[];
};

export type ProductCenterItemPageGapReport = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-page-gap';
  status: 'review-required';
  fingerprint: string;
  generatedAt: string;
  observation: Omit<ProductCenterItemPageObservation, 'capabilities' | 'supplementCases' | 'conflicts'>;
  summary: {
    formalCases: number;
    structurallyValidFormalCases: number;
    invalidFormalCases: number;
    observedCapabilities: number;
    coveredCapabilities: number;
    supplementRequiredCapabilities: number;
    conflictCapabilities: number;
    supplementCases: number;
    xmindBlockedLeaves: number;
    xmindTemplateLeaves: number;
    xmindAlreadyCoveredLeaves: number;
    xmindStructureRepairableLeaves: number;
    xmindBusinessSourceRequiredLeaves: number;
  };
  capabilities: ProductCenterItemPageCapability[];
  supplementCases: ProductCenterItemPageSupplementCase[];
  conflicts: ProductCenterItemPageRuleConflict[];
  xmindBlockedLeaves: Array<{
    nodeId: string;
    title: string;
    path: string[];
    disposition: 'source-template' | 'already-covered' | 'structure-repairable' | 'business-source-required';
    matchedFormalCaseIds: string[];
  }>;
  guardrails: {
    pageEvidenceMayDefineBusinessRule: false;
    reviewRequiredMayGenerateRecipe: false;
    duplicateFormalCasesAllowed: false;
    unresolvedConflictMayGenerateRecipe: false;
  };
};

type FormalCaseBlock = { id: string; title: string; block: string };

export function buildProductCenterItemPageGapReport(input: {
  formalMarkdown: string;
  xmindPlan: ProductCenterXmindItemPlan;
  observation: ProductCenterItemPageObservation;
  generatedAt?: string;
}): ProductCenterItemPageGapReport {
  const formalCases = parseFormalCaseBlocks(input.formalMarkdown);
  const formalCaseIds = new Set(formalCases.map((item) => item.id));
  const diagnostics = diagnoseProductCenterMarkdownTestPlan(input.formalMarkdown);
  const invalidFormalCaseIds = new Set(diagnostics.issues.flatMap((item) => item.caseId ? [item.caseId] : []));
  const xmindBlockedLeaves = input.xmindPlan.blocked.map((item) => {
    const matchedFormalCaseIds = matchFormalCases(item.path, formalCases);
    const disposition = isSourceTemplate(item.path)
      ? 'source-template' as const
      : matchedFormalCaseIds.length > 0
      ? 'already-covered' as const
      : hasActionAndExpectationFragments(item.path)
        ? 'structure-repairable' as const
        : 'business-source-required' as const;
    return {
      nodeId: item.nodeId,
      title: item.title,
      path: item.path,
      disposition,
      matchedFormalCaseIds,
    };
  });
  const value = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-page-gap' as const,
    status: 'review-required' as const,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    observation: {
      observationId: input.observation.observationId,
      observedAt: input.observation.observedAt,
      mode: input.observation.mode,
      routes: input.observation.routes,
      screenshots: input.observation.screenshots,
    },
    summary: {
      formalCases: formalCases.length,
      structurallyValidFormalCases: formalCases.length - invalidFormalCaseIds.size,
      invalidFormalCases: invalidFormalCaseIds.size,
      observedCapabilities: input.observation.capabilities.length,
      coveredCapabilities: input.observation.capabilities.filter((item) => item.disposition === 'covered').length,
      supplementRequiredCapabilities: input.observation.capabilities
        .filter((item) => item.disposition === 'supplement-required').length,
      conflictCapabilities: input.observation.capabilities
        .filter((item) => item.disposition === 'conflict-review-required').length,
      supplementCases: input.observation.supplementCases.length,
      xmindBlockedLeaves: xmindBlockedLeaves.length,
      xmindTemplateLeaves: xmindBlockedLeaves.filter((item) => item.disposition === 'source-template').length,
      xmindAlreadyCoveredLeaves: xmindBlockedLeaves.filter((item) => item.disposition === 'already-covered').length,
      xmindStructureRepairableLeaves: xmindBlockedLeaves
        .filter((item) => item.disposition === 'structure-repairable').length,
      xmindBusinessSourceRequiredLeaves: xmindBlockedLeaves
        .filter((item) => item.disposition === 'business-source-required').length,
    },
    capabilities: input.observation.capabilities,
    supplementCases: input.observation.supplementCases,
    conflicts: input.observation.conflicts,
    xmindBlockedLeaves,
    guardrails: {
      pageEvidenceMayDefineBusinessRule: false as const,
      reviewRequiredMayGenerateRecipe: false as const,
      duplicateFormalCasesAllowed: false as const,
      unresolvedConflictMayGenerateRecipe: false as const,
    },
  };
  const errors = validateProductCenterItemPageGapReport(value, formalCaseIds);
  if (errors.length > 0) throw new Error(`商品页面差距报告校验失败：${errors.join(',')}`);
  return {
    ...value,
    fingerprint: createHash('sha256').update(stableStringify(value)).digest('hex'),
  };
}

export function validateProductCenterItemPageGapReport(
  report: Omit<ProductCenterItemPageGapReport, 'fingerprint'> | ProductCenterItemPageGapReport,
  formalCaseIds: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  const capabilityIds = report.capabilities.map((item) => item.id);
  const supplementCaseIds = report.supplementCases.map((item) => item.id);
  if (new Set(capabilityIds).size !== capabilityIds.length) errors.push('CAPABILITY_ID_DUPLICATE');
  if (new Set(supplementCaseIds).size !== supplementCaseIds.length) errors.push('SUPPLEMENT_CASE_ID_DUPLICATE');
  if (supplementCaseIds.some((caseId) => formalCaseIds.has(caseId))) errors.push('SUPPLEMENT_DUPLICATES_FORMAL_CASE');
  for (const capability of report.capabilities) {
    if (!capability.route.startsWith('/pp/')) errors.push(`${capability.id}:ROUTE_INVALID`);
    if (capability.observedFacts.length === 0) errors.push(`${capability.id}:OBSERVED_FACT_REQUIRED`);
    if (capability.formalCaseIds.some((caseId) => !formalCaseIds.has(caseId))) {
      errors.push(`${capability.id}:FORMAL_CASE_NOT_FOUND`);
    }
    if (capability.disposition === 'covered' && capability.formalCaseIds.length === 0) {
      errors.push(`${capability.id}:COVERED_CASE_REQUIRED`);
    }
    if (capability.disposition === 'supplement-required') {
      if (!capability.supplementCaseId || !supplementCaseIds.includes(capability.supplementCaseId)) {
        errors.push(`${capability.id}:SUPPLEMENT_CASE_REQUIRED`);
      }
    }
  }
  for (const item of report.supplementCases) {
    if (item.status !== 'review-required' || item.generationAllowed) {
      errors.push(`${item.id}:REVIEW_GATE_REQUIRED`);
    }
    if (item.capabilityIds[0] !== 'navigation.sidebar.open') {
      errors.push(`${item.id}:SIDEBAR_ENTRY_REQUIRED`);
    }
    if (item.preconditions.length === 0 || item.actions.length === 0 || item.expectedResults.length === 0) {
      errors.push(`${item.id}:EXECUTION_CHAIN_REQUIRED`);
    }
    if (item.sourceCitations.length === 0) errors.push(`${item.id}:SOURCE_REQUIRED`);
    const hasBusinessExpectation = item.expectedResults.some((value) =>
      /保存成功|创建成功|继承|更新成功|删除成功/.test(value));
    const hasAcceptanceSource = item.sourceCitations.some((source) => source.acceptanceEligible);
    if (hasBusinessExpectation && !hasAcceptanceSource) errors.push(`${item.id}:BUSINESS_AUTHORITY_REQUIRED`);
  }
  for (const conflict of report.conflicts) {
    if (conflict.generationAllowed || conflict.disposition !== 'review-required') {
      errors.push(`${conflict.id}:CONFLICT_GATE_REQUIRED`);
    }
    if (conflict.formalCaseIds.some((caseId) => !formalCaseIds.has(caseId))) {
      errors.push(`${conflict.id}:FORMAL_CASE_NOT_FOUND`);
    }
  }
  return errors;
}

export function renderProductCenterItemPageGapMarkdown(report: ProductCenterItemPageGapReport): string {
  const lines = [
    '# 商品中心商品页面能力差距与补充候选',
    '',
    `- 页面审计：${report.observation.observationId}（${report.observation.observedAt}，只读）`,
    `- 正式用例：${report.summary.formalCases} 条，其中结构有效 ${report.summary.structurallyValidFormalCases} 条`,
    `- 页面能力：${report.summary.observedCapabilities} 项；已覆盖 ${report.summary.coveredCapabilities} 项；需补充 ${report.summary.supplementRequiredCapabilities} 项；冲突 ${report.summary.conflictCapabilities} 项`,
    `- XMind 不完整叶子：${report.summary.xmindBlockedLeaves} 个；模板占位 ${report.summary.xmindTemplateLeaves} 个；正式方案已覆盖 ${report.summary.xmindAlreadyCoveredLeaves} 个；仅结构可修 ${report.summary.xmindStructureRepairableLeaves} 个；仍缺业务来源 ${report.summary.xmindBusinessSourceRequiredLeaves} 个`,
    '- 所有补充候选均为 review-required，未进入 Recipe。',
    '',
    '## 页面能力覆盖',
    '',
    ...report.capabilities.map((item) =>
      `- ${item.id}：${item.label}；${item.disposition}；正式用例=${item.formalCaseIds.join(', ') || '无'}`),
    '',
    '## 规则冲突',
    '',
    ...report.conflicts.flatMap((item) => [
      `### ${item.id}`,
      '',
      `- 关联用例：${item.formalCaseIds.join('、')}`,
      `- 正式声明：${item.formalClaim}`,
      `- 页面事实：${item.observedFact}`,
      `- 处理：${item.resolutionRequired}`,
      '',
    ]),
    '## 补充候选',
    '',
    ...report.supplementCases.flatMap(renderSupplementCase),
    '## XMind 不完整叶子去重结果',
    '',
    ...report.xmindBlockedLeaves.map((item) =>
      `- ${item.nodeId}：${compact(item.title)}；${item.disposition}；匹配=${item.matchedFormalCaseIds.join(', ') || '无'}`),
    '',
  ];
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function renderSupplementCase(item: ProductCenterItemPageSupplementCase): string[] {
  return [
    `### 用例编号：${item.id}`,
    '',
    `用例标题：${item.title}`,
    `所属模块：${item.module}`,
    `建议优先级：${item.proposedPriority}`,
    `状态：${item.status}`,
    `来源：${item.sourceCitations.map((source) => `${source.kind} ← ${source.citation}`).join('；')}`,
    '',
    '前置条件：',
    ...numbered(item.preconditions),
    '',
    '测试步骤：',
    ...numbered(item.actions),
    '',
    '预期结果：',
    ...numbered(item.expectedResults),
    '',
    `待确认项：${item.reviewRequired.join('；')}`,
    '',
  ];
}

function parseFormalCaseBlocks(markdown: string): FormalCaseBlock[] {
  const matches = [...markdown.replace(/\r\n/g, '\n').matchAll(/^### 用例编号：([^\n]+)$/gm)];
  return matches.map((matched, index) => {
    const block = markdown.slice(matched.index, matches[index + 1]?.index ?? markdown.length);
    const title = block.match(/^用例标题：(.+)$/m)?.[1]?.trim() ?? '';
    return { id: matched[1].trim(), title, block };
  });
}

function matchFormalCases(path: readonly string[], formalCases: readonly FormalCaseBlock[]): string[] {
  const completeFragments = hasActionAndExpectationFragments(path);
  const meaningfulSegments = path.slice(-4)
    .map((value, index, values) => ({
      value: compact(value),
      weight: completeFragments
        ? [40, 140, 0, 110][index] ?? 0
        : index === values.length - 1 ? 120 : 70,
    }))
    .filter((item) => item.value.length >= 6
      && !/^\d+(?:\.\d+)*[.]?\s*/.test(item.value)
      && !['标准商品', '套餐商品', '加料商品', '页面展示'].includes(item.value));
  const scores = formalCases
    .map((formalCase) => ({
      id: formalCase.id,
      score: Math.max(0, ...meaningfulSegments.map(({ value: segment, weight }) =>
        formalCase.block.includes(segment)
          ? 300 + weight + Math.min(segment.length, 100) / 100
          : Math.max(
            sharesMeaningfulSubstring(formalCase.title, segment) ? 250 + weight : 0,
            sharesMeaningfulSubstring(formalCase.block, segment) ? 150 + weight : 0,
            similarity(formalCase.title, segment) * 100 + weight,
          ))),
    }));
  const maximumScore = Math.max(0, ...scores.map((item) => item.score));
  return scores
    .filter((item) => item.score >= 120 && item.score >= maximumScore - 5)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, 5)
    .map((item) => item.id);
}

function isSourceTemplate(path: readonly string[]): boolean {
  return ['一级功能模块', '二级功能模块', '主要功能点', '概要', '预置条件', '操作步骤', '预期结果']
    .every((segment) => path.includes(segment));
}

function sharesMeaningfulSubstring(formalBlock: string, segment: string): boolean {
  const normalizedSegment = segment.replace(/[，。；：、（）()\s]/g, '');
  if (normalizedSegment.length < 6) return false;
  const windows = Array.from({ length: normalizedSegment.length - 5 }, (_, index) =>
    normalizedSegment.slice(index, index + 6));
  return windows.some((window) => formalBlock.replace(/\s/g, '').includes(window));
}

function similarity(left: string, right: string): number {
  const leftTokens = new Set(compact(left).split(/[，。；：、（）()\s/]+/).filter((item) => item.length >= 2));
  const rightTokens = new Set(compact(right).split(/[，。；：、（）()\s/]+/).filter((item) => item.length >= 2));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const overlap = [...leftTokens].filter((item) => rightTokens.has(item)).length;
  if (overlap < 2) return 0;
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function hasActionAndExpectationFragments(path: readonly string[]): boolean {
  if (path.length < 2) return false;
  const [actions, expected] = path.slice(-2);
  return hasNumberedLine(actions) && hasNumberedLine(expected);
}

function hasNumberedLine(value: string): boolean {
  return value.split(/\r?\n/).some((line) => /^\s*\d+(?:\.\d+)*[.、:]?\s*\S+/.test(line));
}

function numbered(items: readonly string[]): string[] {
  return items.map((item, index) => `${index + 1}. ${item}`);
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
