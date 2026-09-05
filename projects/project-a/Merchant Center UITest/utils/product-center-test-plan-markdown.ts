import type {
  ProductCenterBusinessBasisKind,
  ProductCenterTestCasePriority,
} from './product-center-test-case-ir';

export type ProductCenterTestPlanSourceCitation = {
  kind: Extract<
    ProductCenterBusinessBasisKind,
    'prd-explicit' | 'business-rule-explicit' | 'xmind-existing' | 'single-step-inference'
  >;
  citation: string;
};

export type ProductCenterParsedMarkdownTestCase = {
  id: string;
  title: string;
  module: string;
  priority: ProductCenterTestCasePriority;
  sourceCitations: ProductCenterTestPlanSourceCitation[];
  preconditions: string[];
  actions: string[];
  expectedResults: string[];
};

export type ProductCenterMarkdownDiagnosticIssue = {
  code:
    | 'DUPLICATE_CASE_ID'
    | 'INVALID_CASE_HEADING'
    | 'MISSING_FIELD'
    | 'MISSING_SECTION'
    | 'NON_NUMBERED_STEP'
    | 'UNSUPPORTED_SOURCE_FORMAT'
    | 'INVALID_PRIORITY';
  caseId?: string;
  line: number;
  message: string;
  suggestion: string;
};

export function diagnoseProductCenterMarkdownTestPlan(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const headings = lines.flatMap((line, index) => {
    const matched = line.match(/^### 用例编号：(.+)$/);
    return matched ? [{ caseId: matched[1].trim(), line: index + 1 }] : [];
  });
  const issues: ProductCenterMarkdownDiagnosticIssue[] = [];
  if (headings.length === 0) {
    issues.push(issue('INVALID_CASE_HEADING', undefined, 1, '未找到标准用例编号标题', '使用“### 用例编号：<ID>”结构'));
  }
  const seen = new Set<string>();
  for (const heading of headings) {
    if (seen.has(heading.caseId)) {
      issues.push(issue('DUPLICATE_CASE_ID', heading.caseId, heading.line, '用例编号重复', '为每条用例分配全局唯一编号'));
      continue;
    }
    seen.add(heading.caseId);
    try {
      parseProductCenterMarkdownTestCase(normalized, heading.caseId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push(mapParseError(message, heading.caseId, lines, heading.line));
    }
  }
  return {
    status: issues.length === 0 ? 'valid' as const : 'invalid' as const,
    caseCount: headings.length,
    issues,
    summary: countIssues(issues),
    guardrails: {
      businessContentMutationAllowed: false,
      structuralSuggestionOnly: true,
    },
  };
}

export function parseProductCenterMarkdownTestCase(
  markdown: string,
  caseId: string,
): ProductCenterParsedMarkdownTestCase {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const heading = `### 用例编号：${caseId}`;
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) throw new Error(`测试方案未找到用例：${caseId}`);
  const nextHeading = lines.findIndex((line, index) =>
    index > start && line.startsWith('### 用例编号：'));
  const block = lines.slice(start + 1, nextHeading < 0 ? lines.length : nextHeading);
  const priority = requiredField(block, '优先级：');
  if (!['P0', 'P1', 'P2'].includes(priority)) {
    throw new Error(`测试方案优先级无效：${caseId} -> ${priority}`);
  }
  return {
    id: caseId,
    title: requiredField(block, '用例标题：'),
    module: requiredField(block, '所属模块：'),
    priority: priority as ProductCenterTestCasePriority,
    sourceCitations: parseSourceCitations(requiredField(block, '来源：'), caseId),
    preconditions: numberedSection(block, '前置条件：', '测试步骤：', caseId),
    actions: numberedSection(block, '测试步骤：', '预期结果：', caseId),
    expectedResults: numberedSection(block, '预期结果：', '---', caseId),
  };
}

export function parseProductCenterMarkdownTestPlan(
  markdown: string,
): ProductCenterParsedMarkdownTestCase[] {
  const caseIds = markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .flatMap((line) => {
      const matched = line.match(/^### 用例编号：(.+)$/);
      return matched ? [matched[1].trim()] : [];
    });
  return caseIds.map((caseId) => parseProductCenterMarkdownTestCase(markdown, caseId));
}

function requiredField(lines: readonly string[], label: string): string {
  const line = lines.find((item) => item.startsWith(label));
  const value = line?.slice(label.length).trim();
  if (!value) throw new Error(`测试方案字段缺失：${label}`);
  return value;
}

function parseSourceCitations(
  value: string,
  caseId: string,
): ProductCenterTestPlanSourceCitation[] {
  const citations = value
    .split('；')
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((item): ProductCenterTestPlanSourceCitation[] => parseSourceCitationItem(item, caseId));
  if (citations.length === 0) throw new Error(`测试方案缺少来源：${caseId}`);
  return citations;
}

function parseSourceCitationItem(
  item: string,
  caseId: string,
): ProductCenterTestPlanSourceCitation[] {
  const prd = item.match(/^PRD明确\s*←\s*(.+)$/);
  if (prd) return [{ kind: 'prd-explicit', citation: prd[1].trim() }];

  const xmind = item.match(/^XMind已有\s*←\s*(.+?)(?:\s*←\s*((?:BR-[A-Z0-9]+(?:-[A-Z0-9]+)*)(?:\s*\/\s*BR-[A-Z0-9]+(?:-[A-Z0-9]+)*)*))?$/);
  if (xmind) {
    return [
      { kind: 'xmind-existing', citation: xmind[1].trim() },
      ...parseBusinessRuleIds(xmind[2] ?? ''),
    ];
  }

  if (/^(?:BR-[A-Z0-9]+(?:-[A-Z0-9]+)*)(?:\s*[、,，/]\s*BR-[A-Z0-9]+(?:-[A-Z0-9]+)*)*$/.test(item)) {
    return parseBusinessRuleIds(item);
  }

  const explicitBusinessRule = item.match(/^(?:业务规则明确|BR明确|缺口补充|产品确认明确)\s*←\s*((?:BR-[A-Z0-9]+(?:-[A-Z0-9]+)*)(?:\s*\/\s*BR-[A-Z0-9]+(?:-[A-Z0-9]+)*)*)(?:\s*\/\s*§.+)?(?:（[^）]*(?:确认|证据)[^）]*）)?$/);
  if (explicitBusinessRule) return parseBusinessRuleIds(explicitBusinessRule[1]);

  const humanConfirmation = item.match(/^(?:人工确认|现网人工确认|人工审核确认)\s*(?:←\s*)?.+?\s*←\s*((?:BR-[A-Z0-9]+(?:-[A-Z0-9]+)*)(?:\s*\/\s*BR-[A-Z0-9]+(?:-[A-Z0-9]+)*)*)$/);
  if (humanConfirmation) return parseBusinessRuleIds(humanConfirmation[1]);

  const inference = item.match(/^可推导\s*←\s*(.+)$/);
  if (inference) return [{ kind: 'single-step-inference', citation: inference[1].trim() }];

  throw new Error(`测试方案来源格式无法审计：${caseId} -> ${item}`);
}

function parseBusinessRuleIds(value: string): ProductCenterTestPlanSourceCitation[] {
  const ids = value.match(/BR-[A-Z0-9]+(?:-[A-Z0-9]+)*/g) ?? [];
  return [...new Set(ids)].map((citation) => ({
    kind: 'business-rule-explicit' as const,
    citation,
  }));
}

function numberedSection(
  lines: readonly string[],
  startLabel: string,
  endLabel: string,
  caseId: string,
): string[] {
  const start = lines.findIndex((line) => line.trim() === startLabel);
  if (start < 0) throw new Error(`测试方案章节缺失：${caseId} -> ${startLabel}`);
  const end = lines.findIndex((line, index) =>
    index > start && (
      line.trim() === endLabel
      || line.startsWith(endLabel)
      || /^#{1,6}\s+/.test(line.trim())
    ));
  const section: string[] = [];
  for (const rawLine of lines.slice(start + 1, end < 0 ? lines.length : end)) {
    if (!rawLine.trim()) continue;
    const matched = rawLine.trim().match(/^\d+\.\s+(.+)$/);
    if (matched) {
      section.push(matched[1].trim());
      continue;
    }
    if (/^\s+\S/.test(rawLine) && section.length > 0) {
      section[section.length - 1] = `${section[section.length - 1]} ${rawLine.trim()}`;
      continue;
    }
    throw new Error(`测试方案步骤格式无效：${caseId} -> ${rawLine.trim()}`);
  }
  if (section.length === 0) throw new Error(`测试方案章节为空：${caseId} -> ${startLabel}`);
  return section;
}

function mapParseError(
  message: string,
  caseId: string,
  lines: readonly string[],
  fallbackLine: number,
): ProductCenterMarkdownDiagnosticIssue {
  const detail = message.split(' -> ').at(-1)?.trim();
  const line = detail ? Math.max(1, lines.findIndex((item) => item.trim() === detail) + 1) : fallbackLine;
  if (message.includes('步骤格式无效')) {
    return issue('NON_NUMBERED_STEP', caseId, line, message, '仅修正为“1. 步骤”编号结构，不改写步骤业务含义');
  }
  if (message.includes('来源格式无法审计')) {
    return issue('UNSUPPORTED_SOURCE_FORMAT', caseId, line, message, '使用可精确验证的 PRD明确、XMind已有或 BR-* 来源引用');
  }
  if (message.includes('优先级无效')) {
    return issue('INVALID_PRIORITY', caseId, line, message, '优先级仅允许 P0、P1 或 P2');
  }
  if (message.includes('章节')) {
    return issue('MISSING_SECTION', caseId, line, message, '补齐标准章节标签并保留原业务内容待人工确认');
  }
  return issue('MISSING_FIELD', caseId, line, message, '补齐缺失字段，业务内容需由来源或负责人确认');
}

function issue(
  code: ProductCenterMarkdownDiagnosticIssue['code'],
  caseId: string | undefined,
  line: number,
  message: string,
  suggestion: string,
): ProductCenterMarkdownDiagnosticIssue {
  return { code, ...(caseId ? { caseId } : {}), line, message, suggestion };
}

function countIssues(issues: readonly ProductCenterMarkdownDiagnosticIssue[]): Record<string, number> {
  const counts = new Map<string, number>();
  issues.forEach((item) => counts.set(item.code, (counts.get(item.code) ?? 0) + 1));
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}
