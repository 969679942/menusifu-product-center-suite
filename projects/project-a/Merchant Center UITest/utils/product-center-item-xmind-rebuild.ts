import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import { diagnoseProductCenterMarkdownTestPlan } from './product-center-test-plan-markdown';
import type { ProductCenterItemPageSupplementCase } from './product-center-item-page-gap';
import {
  applyProductCenterItemEvidenceReview,
  applyProductCenterItemFullReviewCorrections,
} from './product-center-item-review-corrections';

export type ProductCenterItemRebuildCorrection = {
  canonicalId: string;
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  source?: string;
  actions: string[];
  expectedResults: string[];
  supersededDiagnostics: string[];
  removedRule?: string;
  currentRule?: string;
};

export type ProductCenterItemRebuiltCase = {
  id: string;
  title: string;
  priority: 'P0' | 'P1' | 'P2';
  productType: '标准商品' | '套餐商品' | '加料商品' | '页面补充';
  scenarioFamily: string;
  source: string;
  preconditions: string[];
  actions: string[];
  expectedResults: string[];
  origin: 'formal-plan' | 'page-supplement';
  status: 'pending-full-review' | 'review-required' | 'deprecated';
  changeType: 'unchanged' | 'product-corrected' | 'expert-reviewed-corrected' | 'source-normalized' | 'structure-normalized' | 'source-review-required' | 'added' | 'deprecated';
  diagnostics: string[];
};

export type ProductCenterItemXmindRebuildPlan = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-xmind-rebuild-pilot';
  status: 'review-required';
  generatedAt: string;
  fingerprint: string;
  summary: {
    originalXmindLeaves: number;
    originalXmindCompleteChains: number;
    formalCases: number;
    structurallyValidFormalCases: number;
    structurallyInvalidFormalCases: number;
    productCorrectedCases: number;
    expertCorrectedSourceCases: number;
    evidencePromotedCases: number;
    reviewSplitCases: number;
    sourceNormalizedCases: number;
    structureNormalizedCases: number;
    pageSupplementCases: number;
    rebuiltCases: number;
    pendingFullReview: number;
    reviewRequired: number;
    deprecated: number;
    p0: number;
    p1: number;
    p2: number;
  };
  cases: ProductCenterItemRebuiltCase[];
  diff: {
    productCorrections: Array<{
      caseId: string;
      oldTitle: string;
      newTitle: string;
      removedRule: string;
      currentRule: string;
    }>;
    addedCaseIds: string[];
    deprecatedCaseIds: string[];
    sourceNormalizedCaseIds: string[];
    structureNormalizedCaseIds: string[];
    sourceReviewCaseIds: string[];
    expertCorrectedCaseIds: string[];
    reviewSplitCaseIds: string[];
    evidencePromotedCaseIds: string[];
    productDecisionCaseIds: string[];
  };
  guardrails: {
    originalXmindOverwritten: false;
    pageEvidenceMayDefineBusinessRule: false;
    reviewRequiredMayGenerateRecipe: false;
    fullReviewRequiredBeforeTechnicalBinding: true;
    riskFirstOrdering: true;
  };
};

type ParsedFormalCase = {
  id: string;
  title: string;
  module: string;
  priority: 'P0' | 'P1' | 'P2';
  source: string;
  preconditions: string[];
  actions: string[];
  expectedResults: string[];
};

type XmindTopic = {
  id: string;
  class?: 'topic';
  title: string;
  structureClass?: string;
  children?: { attached: XmindTopic[] };
};

export function buildProductCenterItemXmindRebuildPlan(input: {
  formalMarkdown: string;
  corrections: readonly ProductCenterItemRebuildCorrection[];
  supplementCases: readonly ProductCenterItemPageSupplementCase[];
  originalXmindLeaves: number;
  originalXmindCompleteChains: number;
  generatedAt?: string;
}): ProductCenterItemXmindRebuildPlan {
  const formalCases = parseFormalCasesTolerantly(input.formalMarkdown);
  const diagnostic = diagnoseProductCenterMarkdownTestPlan(input.formalMarkdown);
  const invalidCaseIds = new Set(diagnostic.issues.flatMap((item) => item.caseId ? [item.caseId] : []));
  const diagnosticsByCaseId = new Map<string, string[]>();
  diagnostic.issues.forEach((item) => {
    if (!item.caseId) return;
    diagnosticsByCaseId.set(item.caseId, [
      ...(diagnosticsByCaseId.get(item.caseId) ?? []),
      item.code,
    ]);
  });
  const correctionsByCaseId = new Map(input.corrections.map((item) => [item.canonicalId, item]));
  const deprecatedIds = new Set(formalCases
    .filter((item) => /已废弃|deprecated/i.test(item.title))
    .map((item) => item.id));
  const rebuiltFormalCases = formalCases.map((item): ProductCenterItemRebuiltCase => {
    const correction = correctionsByCaseId.get(item.id);
    const deprecated = deprecatedIds.has(item.id);
    const diagnostics = diagnosticsByCaseId.get(item.id) ?? [];
    const normalizedSource = normalizeAuditableSource(item.source, diagnostics);
    const sourceNormalized = !correction && normalizedSource !== null;
    const structureNormalized = !correction && canNormalizeStepStructure(item, diagnostics);
    const originalContent = [item.title, ...item.actions, ...item.expectedResults].join(' ');
    const outdatedComboRule = !correction
      && /最少选择份数|最多选择份数|份数内免费/.test(originalContent);
    const sourceInvalid = invalidCaseIds.has(item.id)
      && !correction
      && !sourceNormalized
      && !structureNormalized;
    return {
      id: item.id,
      title: correction?.title ?? item.title,
      priority: correction?.priority ?? item.priority,
      productType: productType(item.id),
      scenarioFamily: scenarioFamily(correction?.title ?? item.title),
      source: correction
        ? correction.source
          ?? item.source
        : normalizedSource ?? item.source,
      preconditions: item.preconditions,
      actions: correction?.actions ?? item.actions,
      expectedResults: correction?.expectedResults ?? item.expectedResults,
      origin: 'formal-plan',
      status: deprecated
        ? 'deprecated'
        : sourceInvalid || outdatedComboRule
          ? 'review-required'
          : 'pending-full-review',
      changeType: deprecated
        ? 'deprecated'
        : correction
          ? 'product-corrected'
          : sourceNormalized
            ? 'source-normalized'
          : structureNormalized
            ? 'structure-normalized'
          : sourceInvalid || outdatedComboRule
            ? 'source-review-required'
            : 'unchanged',
      diagnostics: [
        ...(correction
          ? diagnostics.filter((code) => !correction.supersededDiagnostics.includes(code))
          : sourceNormalized
          ? ['SOURCE_FORMAT_NORMALIZED']
          : structureNormalized
            ? ['STEP_NUMBERING_NORMALIZED']
            : diagnostics),
        ...(outdatedComboRule ? ['OUTDATED_OPTIONAL_COMBO_QUANTITY_FIELDS'] : []),
        ...(correction?.supersededDiagnostics.map((code) => `SUPERSEDED:${code}`) ?? []),
      ],
    };
  });
  const rebuiltSupplements = input.supplementCases.map((item): ProductCenterItemRebuiltCase => ({
    id: item.id,
    title: item.title,
    priority: item.proposedPriority,
    productType: '页面补充',
    scenarioFamily: scenarioFamily(item.title),
    source: item.sourceCitations.map((source) => `${source.kind} ← ${source.citation}`).join('；'),
    preconditions: item.preconditions,
    actions: item.actions,
    expectedResults: item.expectedResults,
    origin: 'page-supplement',
    status: 'review-required',
    changeType: 'added',
    diagnostics: ['PAGE_ONLY_BUSINESS_OUTCOME_REVIEW_REQUIRED'],
  }));
  const fullReviewCorrections = applyProductCenterItemFullReviewCorrections(rebuiltFormalCases);
  const evidenceReview = applyProductCenterItemEvidenceReview([
    ...fullReviewCorrections.cases,
    ...rebuiltSupplements,
  ]);
  const cases = evidenceReview.cases.sort(compareCases);
  const value = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-xmind-rebuild-pilot' as const,
    status: 'review-required' as const,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    summary: {
      originalXmindLeaves: input.originalXmindLeaves,
      originalXmindCompleteChains: input.originalXmindCompleteChains,
      formalCases: formalCases.length,
      structurallyValidFormalCases: formalCases.length - invalidCaseIds.size,
      structurallyInvalidFormalCases: invalidCaseIds.size,
      productCorrectedCases: rebuiltFormalCases.filter((item) => item.changeType === 'product-corrected').length,
      expertCorrectedSourceCases: fullReviewCorrections.correctedSourceCaseIds.length,
      evidencePromotedCases: evidenceReview.evidencePromotedCaseIds.length,
      reviewSplitCases: fullReviewCorrections.splitCaseIds.length,
      sourceNormalizedCases: rebuiltFormalCases.filter((item) => item.changeType === 'source-normalized').length,
      structureNormalizedCases: rebuiltFormalCases
        .filter((item) => item.changeType === 'structure-normalized').length,
      pageSupplementCases: rebuiltSupplements.length,
      rebuiltCases: cases.length,
      pendingFullReview: cases.filter((item) => item.status === 'pending-full-review').length,
      reviewRequired: cases.filter((item) => item.status === 'review-required').length,
      deprecated: cases.filter((item) => item.status === 'deprecated').length,
      p0: cases.filter((item) => item.priority === 'P0').length,
      p1: cases.filter((item) => item.priority === 'P1').length,
      p2: cases.filter((item) => item.priority === 'P2').length,
    },
    cases,
    diff: {
      productCorrections: input.corrections.map((correction) => ({
        caseId: correction.canonicalId,
        oldTitle: formalCases.find((item) => item.id === correction.canonicalId)?.title ?? '',
        newTitle: correction.title,
        removedRule: correction.removedRule ?? '最少选择份数、最多选择份数、份数内免费',
        currentRule: correction.currentRule
          ?? '组名称、选择数量、相同商品合并展示、组内商品是否可重复选中、名称/分类筛选',
      })),
      addedCaseIds: rebuiltSupplements.map((item) => item.id),
      deprecatedCaseIds: [...deprecatedIds],
      sourceNormalizedCaseIds: rebuiltFormalCases
        .filter((item) => item.changeType === 'source-normalized')
        .map((item) => item.id),
      structureNormalizedCaseIds: rebuiltFormalCases
        .filter((item) => item.changeType === 'structure-normalized')
        .map((item) => item.id),
      sourceReviewCaseIds: cases
        .filter((item) => item.status === 'review-required')
        .map((item) => item.id),
      expertCorrectedCaseIds: fullReviewCorrections.correctedSourceCaseIds,
      reviewSplitCaseIds: fullReviewCorrections.splitCaseIds,
      evidencePromotedCaseIds: evidenceReview.evidencePromotedCaseIds,
      productDecisionCaseIds: evidenceReview.productDecisionCaseIds,
    },
    guardrails: {
      originalXmindOverwritten: false as const,
      pageEvidenceMayDefineBusinessRule: false as const,
      reviewRequiredMayGenerateRecipe: false as const,
      fullReviewRequiredBeforeTechnicalBinding: true as const,
      riskFirstOrdering: true as const,
    },
  };
  const errors = validateProductCenterItemXmindRebuildPlan(value);
  if (errors.length > 0) throw new Error(`商品 XMind 重建计划校验失败：${errors.join(',')}`);
  return {
    ...value,
    fingerprint: createHash('sha256').update(stableStringify(value)).digest('hex'),
  };
}

export function validateProductCenterItemXmindRebuildPlan(
  plan: Omit<ProductCenterItemXmindRebuildPlan, 'fingerprint'> | ProductCenterItemXmindRebuildPlan,
): string[] {
  const errors: string[] = [];
  const ids = plan.cases.map((item) => item.id);
  if (new Set(ids).size !== ids.length) errors.push('CASE_ID_DUPLICATE');
  if (plan.summary.rebuiltCases !== plan.cases.length) errors.push('SUMMARY_REBUILT_MISMATCH');
  if (plan.summary.formalCases + plan.summary.reviewSplitCases + plan.summary.pageSupplementCases
    !== plan.cases.length) {
    errors.push('CASE_DENOMINATOR_MISMATCH');
  }
  for (const item of plan.cases) {
    if (!item.title || !item.source) errors.push(`${item.id}:TITLE_OR_SOURCE_REQUIRED`);
    if (item.preconditions.length === 0 || item.actions.length === 0 || item.expectedResults.length === 0) {
      errors.push(`${item.id}:EXECUTION_CHAIN_REQUIRED`);
    }
    if (item.status === 'pending-full-review' && item.diagnostics.some((code) =>
      code === 'UNSUPPORTED_SOURCE_FORMAT' || code === 'NON_NUMBERED_STEP')) {
      errors.push(`${item.id}:INVALID_SOURCE_MAY_NOT_BE_READY`);
    }
    if (item.origin === 'page-supplement'
      && item.status !== 'review-required'
      && !item.diagnostics.includes('PAGE_CAPABILITY_EXPERT_REVIEWED')) {
      errors.push(`${item.id}:PAGE_SUPPLEMENT_REVIEW_REQUIRED`);
    }
  }
  for (const caseId of ['TC-ITEM-PKG-057', 'TC-ITEM-PKG-058']) {
    const item = plan.cases.find((candidate) => candidate.id === caseId);
    if (!item || item.changeType !== 'product-corrected') errors.push(`${caseId}:PRODUCT_CORRECTION_REQUIRED`);
    const content = item ? [item.title, ...item.actions, ...item.expectedResults].join(' ') : '';
    if (/最少选择份数|最多选择份数|份数内免费/.test(content)) {
      errors.push(`${caseId}:OUTDATED_RULE_REMAINS`);
    }
  }
  return errors;
}

export function buildProductCenterItemRebuiltXmind(plan: ProductCenterItemXmindRebuildPlan): Buffer {
  const rootTopic: XmindTopic = {
    id: stableId('root'),
    class: 'topic',
    title: '商品中心-商品管理-商品-重建试点',
    structureClass: 'org.xmind.ui.logic.right',
    children: {
      attached: [
        priorityTopic('P0', 'P0 核心必测', plan.cases),
        priorityTopic('P1', 'P1 重要分支', plan.cases),
        priorityTopic('P2', 'P2 补充覆盖', plan.cases),
        statusTopic('review-required', '待确认项', plan.cases),
        statusTopic('deprecated', '已废弃', plan.cases),
      ].filter((topic) => topic.children?.attached.length),
    },
  };
  const content = [{
    id: stableId('sheet'),
    revisionId: stableId(`revision:${plan.fingerprint}`),
    class: 'sheet',
    title: '商品管理重建试点',
    rootTopic,
  }];
  const zip = new AdmZip();
  zip.addFile('content.json', Buffer.from(JSON.stringify(content), 'utf8'));
  zip.addFile('metadata.json', Buffer.from(JSON.stringify({
    dataStructureVersion: '2',
    creator: { name: 'Codex', version: 'product-center-item-xmind-rebuild-v1' },
    layoutEngineVersion: '4',
  }), 'utf8'));
  zip.addFile('manifest.json', Buffer.from(JSON.stringify({
    'file-entries': { 'content.json': {}, 'metadata.json': {} },
  }), 'utf8'));
  const buffer = zip.toBuffer();
  const errors = validateProductCenterItemRebuiltXmind(buffer, plan.summary.rebuiltCases);
  if (errors.length > 0) throw new Error(`商品重建 XMind 校验失败：${errors.join(',')}`);
  return buffer;
}

export function buildProductCenterItemGeneratedXmind(
  cases: readonly ProductCenterItemRebuiltCase[],
  options: { title: string; fingerprint: string },
): Buffer {
  const rootTopic: XmindTopic = {
    id: stableId(`generated-root:${options.title}`),
    class: 'topic',
    title: options.title,
    structureClass: 'org.xmind.ui.logic.right',
      children: {
      attached: [
        generatedPriorityTopic('P0', 'P0 核心必测', cases),
        generatedPriorityTopic('P1', 'P1 重要分支', cases),
        generatedPriorityTopic('P2', 'P2 补充覆盖', cases),
      ].filter((topic) => topic.children?.attached.length),
    },
  };
  const content = [{
    id: stableId(`generated-sheet:${options.title}`),
    revisionId: stableId(`generated-revision:${options.fingerprint}`),
    class: 'sheet',
    title: options.title,
    rootTopic,
  }];
  const zip = new AdmZip();
  zip.addFile('content.json', Buffer.from(JSON.stringify(content), 'utf8'));
  zip.addFile('metadata.json', Buffer.from(JSON.stringify({
    dataStructureVersion: '2',
    creator: { name: 'Codex', version: 'product-center-item-generation-ready-v1' },
    layoutEngineVersion: '4',
  }), 'utf8'));
  zip.addFile('manifest.json', Buffer.from(JSON.stringify({
    'file-entries': { 'content.json': {}, 'metadata.json': {} },
  }), 'utf8'));
  const buffer = zip.toBuffer();
  const errors = validateProductCenterItemRebuiltXmind(buffer, cases.length);
  if (errors.length > 0) throw new Error(`商品准确生成 XMind 校验失败：${errors.join(',')}`);
  return buffer;
}

export function validateProductCenterItemRebuiltXmind(
  content: Buffer,
  expectedCaseCount: number,
): string[] {
  const errors: string[] = [];
  const zip = new AdmZip(content);
  const entries = new Set(zip.getEntries().map((item) => item.entryName));
  for (const required of ['content.json', 'metadata.json', 'manifest.json']) {
    if (!entries.has(required)) errors.push(`XMIND_ENTRY_MISSING:${required}`);
  }
  if (!entries.has('content.json')) return errors;
  const sheets = JSON.parse(zip.readAsText('content.json')) as Array<{ rootTopic?: XmindTopic }>;
  const ids = new Set<string>();
  let caseCount = 0;
  let nodeCount = 0;
  function walk(item: XmindTopic): void {
    nodeCount += 1;
    if (!item.id || !item.title) errors.push('XMIND_TOPIC_ID_OR_TITLE_REQUIRED');
    if (ids.has(item.id)) errors.push(`XMIND_TOPIC_ID_DUPLICATE:${item.id}`);
    ids.add(item.id);
    if (/^\[(?:P0|P1|P2)\] TC-/.test(item.title)) caseCount += 1;
    const attached = item.children?.attached;
    if (attached !== undefined && !Array.isArray(attached)) {
      errors.push(`XMIND_CHILDREN_ARRAY_REQUIRED:${item.id}`);
      return;
    }
    for (const child of attached ?? []) walk(child);
  }
  for (const sheet of sheets) {
    if (!sheet.rootTopic) errors.push('XMIND_ROOT_TOPIC_REQUIRED');
    else walk(sheet.rootTopic);
  }
  if (caseCount !== expectedCaseCount) errors.push(`XMIND_CASE_DENOMINATOR_MISMATCH:${caseCount}`);
  if (nodeCount > expectedCaseCount * 30) errors.push(`XMIND_NODE_COUNT_ABNORMAL:${nodeCount}`);
  return errors;
}

export function renderProductCenterItemXmindRebuildMarkdown(
  plan: ProductCenterItemXmindRebuildPlan,
): string {
  const lines = [
    '# 商品中心商品 XMind 全量重建试点',
    '',
    `- 原 XMind：${plan.summary.originalXmindLeaves} 个叶子，完整执行链 ${plan.summary.originalXmindCompleteChains} 条`,
    `- 正式用例：${plan.summary.formalCases} 条，原始结构有效 ${plan.summary.structurallyValidFormalCases} 条，原始结构/来源问题 ${plan.summary.structurallyInvalidFormalCases} 条`,
    `- 自动规范化来源：${plan.summary.sourceNormalizedCases} 条；步骤结构规范化：${plan.summary.structureNormalizedCases} 条；产品规则修正：${plan.summary.productCorrectedCases} 条`,
    `- 全审修订：${plan.summary.expertCorrectedSourceCases} 条原用例；拆分新增 ${plan.summary.reviewSplitCases} 条单目标用例`,
    `- 重建结果：${plan.summary.rebuiltCases} 条；待逐条全审 ${plan.summary.pendingFullReview} 条；来源/规则待确认 ${plan.summary.reviewRequired} 条；已废弃 ${plan.summary.deprecated} 条`,
    `- 优先级：P0=${plan.summary.p0}，P1=${plan.summary.p1}，P2=${plan.summary.p2}`,
    '- 原 XMind 未覆盖，所有页面补充候选禁止直接生成 Recipe。',
    '',
    '## 产品规则修正',
    '',
    ...plan.diff.productCorrections.map((item) =>
      `- ${item.caseId}：${item.oldTitle} → ${item.newTitle}；删除“${item.removedRule}”；采用“${item.currentRule}”`),
    '',
    '## 风险优先用例清单',
    '',
    ...plan.cases.map((item) =>
      `- [${item.priority}] ${item.id} ${item.title}；${item.productType}/${item.scenarioFamily}；${item.status}；${item.changeType}`),
    '',
  ];
  return `${lines.join('\n').trim()}\n`;
}

function parseFormalCasesTolerantly(markdown: string): ParsedFormalCase[] {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const headings = [...normalized.matchAll(/^### 用例编号：([^\n]+)$/gm)];
  return headings.map((heading, index) => {
    const block = normalized.slice(heading.index, headings[index + 1]?.index ?? normalized.length);
    const priority = field(block, '优先级：');
    if (priority !== 'P0' && priority !== 'P1' && priority !== 'P2') {
      throw new Error(`正式用例优先级无效：${heading[1]} -> ${priority}`);
    }
    return {
      id: heading[1].trim(),
      title: field(block, '用例标题：'),
      module: field(block, '所属模块：'),
      priority,
      source: field(block, '来源：'),
      preconditions: tolerantNumberedSection(block, '前置条件：', '测试步骤：'),
      actions: tolerantNumberedSection(block, '测试步骤：', '预期结果：'),
      expectedResults: tolerantNumberedSection(block, '预期结果：', '---'),
    };
  });
}

function field(block: string, label: string): string {
  const matched = block.match(new RegExp(`^${label}(.+)$`, 'm'));
  if (!matched?.[1]?.trim()) throw new Error(`正式用例字段缺失：${label}`);
  return matched[1].trim();
}

function tolerantNumberedSection(block: string, startLabel: string, endLabel: string): string[] {
  const start = block.indexOf(`\n${startLabel}`);
  if (start < 0) return [];
  const contentStart = start + startLabel.length + 1;
  const remainder = block.slice(contentStart).replace(/^\s*\n/, '');
  const end = endLabel === '---'
    ? remainder.search(/^---\s*$/m)
    : remainder.indexOf(`\n${endLabel}`);
  const section = remainder.slice(0, end < 0 ? remainder.length : end);
  const items: string[] = [];
  for (const rawLine of section.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const numbered = line.match(/^\d+(?:\.\d+)?[.、]\s*(.+)$/);
    if (numbered) {
      items.push(numbered[1].trim());
      continue;
    }
    if (items.length > 0) items[items.length - 1] = `${items[items.length - 1]} ${line}`;
    else items.push(line);
  }
  return items;
}

function normalizeAuditableSource(source: string, diagnostics: readonly string[]): string | null {
  if (diagnostics.length !== 1 || diagnostics[0] !== 'UNSUPPORTED_SOURCE_FORMAT') return null;
  const ruleIds = [...new Set(source.match(/BR-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}/g) ?? [])];
  if (ruleIds.length > 0) return `业务规则明确 ← ${ruleIds.join(' / ')}`;
  const explicitPrd = source.match(/^PRD明确\s*←\s*(.+)$/);
  if (explicitPrd) return `PRD明确 ← ${explicitPrd[1].trim()}`;
  const prdSection = source.match(/^PRD\s+(.+)$/);
  if (prdSection && /\d+(?:\.\d+)+/.test(prdSection[1])) {
    return `PRD明确 ← ${prdSection[1].trim()}`;
  }
  if (/商品中心业务规则\s*§\d+/.test(source)) {
    return `业务规则明确 ← ${source.replace(/；BR-[^；]+$/, '').trim()}`;
  }
  return null;
}

function canNormalizeStepStructure(
  item: ParsedFormalCase,
  diagnostics: readonly string[],
): boolean {
  return diagnostics.length === 1
    && diagnostics[0] === 'NON_NUMBERED_STEP'
    && item.preconditions.length > 0
    && item.actions.length > 0
    && item.expectedResults.length > 0;
}

function productType(caseId: string): ProductCenterItemRebuiltCase['productType'] {
  if (caseId.includes('-PKG-')) return '套餐商品';
  if (caseId.includes('-ADD-')) return '加料商品';
  return '标准商品';
}

function scenarioFamily(title: string): string {
  if (/创建页展示|页面展示|文本展示|展示正确|提供.+入口/.test(title)) return '展示与其他';
  if (/必填|缺失|为空|不可提交/.test(title)) return '必填校验';
  if (/删除/.test(title)) return '删除';
  if (/启用|停用|状态/.test(title)) return '状态生命周期';
  if (/查询|搜索|筛选|重置/.test(title)) return '查询筛选';
  if (/编辑|修改/.test(title)) return '编辑';
  if (/规格|称重|价格|包装费|成本|起售数量/.test(title)) return '价格规格';
  if (/套餐|搭配/.test(title)) return '套餐规则';
  if (/复制|导入|批量/.test(title)) return '批量与导入';
  if (/创建|新增|保存/.test(title)) return '创建';
  if (/图片|标签|角标|材料|档口/.test(title)) return '扩展配置';
  return '展示与其他';
}

function compareCases(left: ProductCenterItemRebuiltCase, right: ProductCenterItemRebuiltCase): number {
  return priorityRank(left.priority) - priorityRank(right.priority)
    || statusRank(left.status) - statusRank(right.status)
    || caseRiskRank(left) - caseRiskRank(right)
    || familyRank(left.scenarioFamily) - familyRank(right.scenarioFamily)
    || left.productType.localeCompare(right.productType, 'zh-CN')
    || left.id.localeCompare(right.id);
}

function priorityRank(priority: ProductCenterItemRebuiltCase['priority']): number {
  return { P0: 0, P1: 1, P2: 2 }[priority];
}

function statusRank(status: ProductCenterItemRebuiltCase['status']): number {
  return { 'pending-full-review': 0, 'review-required': 1, deprecated: 2 }[status];
}

function familyRank(family: string): number {
  const order = ['创建', '必填校验', '价格规格', '套餐规则', '查询筛选', '编辑', '状态生命周期', '删除', '批量与导入', '扩展配置', '展示与其他'];
  return order.indexOf(family) < 0 ? order.length : order.indexOf(family);
}

function caseRiskRank(item: ProductCenterItemRebuiltCase): number {
  const title = item.title;
  if (/仅填写必填项时创建成功|标准商品创建成功|套餐商品创建成功|加料商品创建成功/.test(title)) return 0;
  if (/必填项缺失|标准价缺失|起售数量为空|不可提交/.test(title)) return 1;
  if (/商品编码重复|同名|名称重复|首尾含空格/.test(title)) return 2;
  if (/价格|规格|称重|包装费|成本|起售数量/.test(title)) return 3;
  if (/套餐|搭配/.test(title)) return 4;
  if (/查询|搜索|筛选|重置/.test(title)) return 5;
  if (/编辑|修改/.test(title)) return 6;
  if (/启用|停用|状态/.test(title)) return 7;
  if (/删除/.test(title)) return 8;
  if (/复制|导入|批量/.test(title)) return 9;
  if (/图片|标签|角标|材料|档口/.test(title)) return 10;
  if (/展示|入口|文本/.test(title)) return 20;
  return 11;
}

function priorityTopic(
  priority: ProductCenterItemRebuiltCase['priority'],
  title: string,
  cases: readonly ProductCenterItemRebuiltCase[],
): XmindTopic {
  return groupedTopic(title, cases.filter((item) =>
    item.priority === priority && item.status === 'pending-full-review'));
}

function generatedPriorityTopic(
  priority: ProductCenterItemRebuiltCase['priority'],
  title: string,
  cases: readonly ProductCenterItemRebuiltCase[],
): XmindTopic {
  return groupedTopic(title, cases.filter((item) => item.priority === priority));
}

function statusTopic(
  status: ProductCenterItemRebuiltCase['status'],
  title: string,
  cases: readonly ProductCenterItemRebuiltCase[],
): XmindTopic {
  return groupedTopic(title, cases.filter((item) => item.status === status));
}

function groupedTopic(title: string, cases: readonly ProductCenterItemRebuiltCase[]): XmindTopic {
  const productTypes = ['标准商品', '套餐商品', '加料商品', '页面补充'] as const;
  return topic(title, productTypes.flatMap((type) => {
    const typeCases = cases.filter((item) => item.productType === type);
    if (typeCases.length === 0) return [];
    const families = [...new Set(typeCases.map((item) => item.scenarioFamily))]
      .sort((left, right) => familyRank(left) - familyRank(right));
    return [topic(type, families.map((family) =>
      topic(
        family,
        typeCases.filter((item) => item.scenarioFamily === family).map(caseTopic),
        `group:${title}:${type}:${family}`,
      )), `group:${title}:${type}`)];
  }), `group:${title}`);
}

function caseTopic(item: ProductCenterItemRebuiltCase): XmindTopic {
  return topic(`[${item.priority}] ${item.id} ${item.title}`, [
    topic(`来源：${item.source}`, [], `${item.id}:source`),
    topic('前置条件', numberedTopics(item.preconditions, item.id, 'precondition'), `${item.id}:preconditions`),
    topic('测试步骤', numberedTopics(item.actions, item.id, 'action'), `${item.id}:actions`),
    topic('预期结果', numberedTopics(item.expectedResults, item.id, 'expectation'), `${item.id}:expectations`),
    topic(`状态：${item.status}；变更：${item.changeType}`, [], `${item.id}:status`),
    ...(item.diagnostics.length > 0
      ? [topic(`诊断：${item.diagnostics.join('、')}`, [], `${item.id}:diagnostics`)]
      : []),
  ], item.id);
}

function numberedTopics(items: readonly string[], caseId: string, kind: string): XmindTopic[] {
  return items.map((item, index) =>
    topic(`${index + 1}. ${item}`, [], `${caseId}:${kind}:${index + 1}`));
}

function topic(title: string, children: XmindTopic[] = [], seed = title): XmindTopic {
  return {
    id: stableId(seed),
    class: 'topic',
    title,
    ...(children.length > 0 ? { children: { attached: children } } : {}),
  };
}

function stableId(seed: string): string {
  return createHash('sha256').update(seed).digest('hex').slice(0, 26);
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
