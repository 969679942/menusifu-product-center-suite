import { createHash } from 'node:crypto';
import {
  diagnoseProductCenterMarkdownTestPlan,
  parseProductCenterMarkdownTestCase,
  type ProductCenterParsedMarkdownTestCase,
  type ProductCenterTestPlanSourceCitation,
} from './product-center-test-plan-markdown';

export const productCenterItemCoreScenarioFamilies = [
  'create',
  'required',
  'identity',
  'price-quantity',
  'spec',
  'query',
  'edit',
  'lifecycle',
  'package',
] as const;

export type ProductCenterItemCoreScenarioFamily =
  typeof productCenterItemCoreScenarioFamilies[number];

export const productCenterItemCoreFamilyMinimums: Readonly<
  Record<ProductCenterItemCoreScenarioFamily, number>
> = {
  create: 3,
  required: 2,
  identity: 3,
  'price-quantity': 2,
  spec: 1,
  query: 2,
  edit: 1,
  lifecycle: 3,
  package: 3,
};

export type ProductCenterItemCoreReviewCase = ProductCenterParsedMarkdownTestCase & {
  selectionRank: number;
  scenarioFamilies: ProductCenterItemCoreScenarioFamily[];
  riskScore: number;
  familyScores: Record<ProductCenterItemCoreScenarioFamily, number | null>;
  riskReasons: string[];
  reviewStatus: 'pending-human-review';
};

export type ProductCenterItemCoreReviewBatch = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-core-review-batch';
  generatedAt: string;
  fingerprint: string;
  sourcePlan: {
    path: string;
    sha256: string;
    diagnosedCaseCount: number;
    structurallyValidCaseCount: number;
    invalidCaseCount: number;
    diagnosticSummary: Record<string, number>;
  };
  selectionPolicy: {
    targetCount: number;
    maximumCount: number;
    acceptedPriorities: readonly ['P0'];
    familyMinimums: Readonly<Record<ProductCenterItemCoreScenarioFamily, number>>;
    guardrails: {
      invalidCasesExcluded: true;
      deprecatedCasesExcluded: true;
      auditableSourceRequired: true;
      inferredBusinessContentAllowed: false;
      recipesGenerated: false;
    };
  };
  summary: {
    eligibleCount: number;
    selectedCount: number;
    excludedInvalidCount: number;
    excludedDeprecatedCount: number;
    excludedUnsupportedPriorityCount: number;
    familyCoverage: Record<ProductCenterItemCoreScenarioFamily, number>;
  };
  cases: ProductCenterItemCoreReviewCase[];
};

type ScoredCase = ProductCenterParsedMarkdownTestCase & {
  scenarioFamilies: ProductCenterItemCoreScenarioFamily[];
  riskScore: number;
  familyScores: Record<ProductCenterItemCoreScenarioFamily, number | null>;
  riskReasons: string[];
};

const targetCount = 18;
const maximumCount = 20;

export function buildProductCenterItemCoreReviewBatch(input: {
  markdown: string;
  sourcePath: string;
  generatedAt?: string;
}): ProductCenterItemCoreReviewBatch {
  const diagnostic = diagnoseProductCenterMarkdownTestPlan(input.markdown);
  const invalidCaseIds = new Set(diagnostic.issues.flatMap((item) => item.caseId ? [item.caseId] : []));
  const caseBlocks = extractCaseBlocks(input.markdown);
  const uniqueCaseIds = [...new Set(caseBlocks.map((item) => item.caseId))];
  const deprecatedCaseIds = new Set(caseBlocks
    .filter((item) => /已废弃|deprecated/i.test(item.block))
    .map((item) => item.caseId));
  const parsedCases = uniqueCaseIds
    .filter((caseId) => !invalidCaseIds.has(caseId) && !deprecatedCaseIds.has(caseId))
    .map((caseId) => parseProductCenterMarkdownTestCase(input.markdown, caseId));
  const priorityEligible = parsedCases.filter((item) => item.priority === 'P0');
  const eligible = priorityEligible
    .filter(isAuditableItemCase)
    .map(scoreCase)
    .filter((item) => item.scenarioFamilies.length > 0);
  const selected = selectByFamilyMinimums(eligible);
  if (selected.length < targetCount) {
    throw new Error(`核心审核批次候选不足：${selected.length}/${targetCount}`);
  }
  if (selected.length > maximumCount) {
    throw new Error(`核心审核批次超过上限：${selected.length}/${maximumCount}`);
  }
  const familyCoverage = countFamilyCoverage(selected);
  for (const family of productCenterItemCoreScenarioFamilies) {
    if (familyCoverage[family] < productCenterItemCoreFamilyMinimums[family]) {
      throw new Error(`核心审核批次场景覆盖不足：${family}`);
    }
  }
  const cases = selected.map((item, index): ProductCenterItemCoreReviewCase => ({
    id: item.id,
    title: item.title,
    module: item.module,
    priority: item.priority,
    sourceCitations: item.sourceCitations,
    preconditions: item.preconditions,
    actions: item.actions,
    expectedResults: item.expectedResults,
    selectionRank: index + 1,
    scenarioFamilies: item.scenarioFamilies,
    riskScore: item.riskScore,
    familyScores: item.familyScores,
    riskReasons: item.riskReasons,
    reviewStatus: 'pending-human-review',
  }));
  const fingerprintInput = {
    sourceSha256: sha256(input.markdown),
    targetCount,
    maximumCount,
    familyMinimums: productCenterItemCoreFamilyMinimums,
    cases,
  };
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-core-review-batch',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    fingerprint: sha256(JSON.stringify(fingerprintInput)),
    sourcePlan: {
      path: input.sourcePath,
      sha256: sha256(input.markdown),
      diagnosedCaseCount: diagnostic.caseCount,
      structurallyValidCaseCount: uniqueCaseIds.length - invalidCaseIds.size,
      invalidCaseCount: invalidCaseIds.size,
      diagnosticSummary: diagnostic.summary,
    },
    selectionPolicy: {
      targetCount,
      maximumCount,
      acceptedPriorities: ['P0'],
      familyMinimums: productCenterItemCoreFamilyMinimums,
      guardrails: {
        invalidCasesExcluded: true,
        deprecatedCasesExcluded: true,
        auditableSourceRequired: true,
        inferredBusinessContentAllowed: false,
        recipesGenerated: false,
      },
    },
    summary: {
      eligibleCount: eligible.length,
      selectedCount: cases.length,
      excludedInvalidCount: invalidCaseIds.size,
      excludedDeprecatedCount: deprecatedCaseIds.size,
      excludedUnsupportedPriorityCount: parsedCases.length - priorityEligible.length,
      familyCoverage,
    },
    cases,
  };
}

export function renderProductCenterItemCoreReviewBatchMarkdown(
  batch: ProductCenterItemCoreReviewBatch,
): string {
  const lines = [
    '# 商品中心商品核心测试用例审核批次',
    '',
    `- 批次指纹：\`${batch.fingerprint}\``,
    `- 来源：\`${batch.sourcePlan.path}\``,
    `- 来源用例分母：${batch.sourcePlan.diagnosedCaseCount}`,
    `- 可选候选：${batch.summary.eligibleCount}`,
    `- 本批选中：${batch.summary.selectedCount}`,
    `- 审核状态：待人工审核`,
    '',
    '## 场景覆盖',
    '',
    ...productCenterItemCoreScenarioFamilies.map((family) =>
      `- ${family}：${batch.summary.familyCoverage[family]}（最低 ${batch.selectionPolicy.familyMinimums[family]}）`),
    '',
  ];
  for (const item of batch.cases) {
    lines.push(
      `## ${item.selectionRank}. ${item.id} ${item.title}`,
      '',
      `- 优先级：${item.priority}`,
      `- 所属模块：${item.module}`,
      `- 场景族：${item.scenarioFamilies.join('、')}`,
      `- 风险分：${item.riskScore}`,
      `- 风险理由：${item.riskReasons.join('；')}`,
      `- 来源：${item.sourceCitations.map((source) => `${source.kind} ← ${source.citation}`).join('；')}`,
      `- 审核状态：${item.reviewStatus}`,
      '',
      '### 前置条件',
      '',
      ...numbered(item.preconditions),
      '',
      '### 测试步骤',
      '',
      ...numbered(item.actions),
      '',
      '### 预期结果',
      '',
      ...numbered(item.expectedResults),
      '',
    );
  }
  return `${lines.join('\n').trim()}\n`;
}

function extractCaseBlocks(markdown: string): Array<{ caseId: string; block: string }> {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const matches = [...normalized.matchAll(/^### 用例编号：(.+)$/gm)];
  return matches.map((matched, index) => ({
    caseId: matched[1].trim(),
    block: normalized.slice(matched.index, matches[index + 1]?.index ?? normalized.length),
  }));
}

function isAuditableItemCase(item: ProductCenterParsedMarkdownTestCase): boolean {
  return /^TC-ITEM-(STD|PKG)-/.test(item.id)
    && item.sourceCitations.some((source) => source.kind !== 'single-step-inference');
}

function scoreCase(item: ProductCenterParsedMarkdownTestCase): ScoredCase {
  const scenarioFamilies = classifyScenarioFamilies(item);
  const sourceKinds = new Set(item.sourceCitations.map((source) => source.kind));
  const sourceScore = (sourceKinds.has('prd-explicit') ? 35 : 0)
    + (sourceKinds.has('business-rule-explicit') ? 30 : 0)
    + (sourceKinds.has('xmind-existing') ? 20 : 0)
    + (sourceKinds.size > 1 ? 15 : 0);
  const familyScores = Object.fromEntries(productCenterItemCoreScenarioFamilies.map((family) => [
    family,
    scenarioFamilies.includes(family)
      ? 100 + sourceScore + familyRiskWeight(family) + familySpecificBonus(family, item.title)
      : null,
  ])) as Record<ProductCenterItemCoreScenarioFamily, number | null>;
  const riskScore = Math.max(...Object.values(familyScores).filter((score): score is number => score !== null));
  return {
    ...item,
    scenarioFamilies,
    riskScore,
    familyScores,
    riskReasons: buildRiskReasons(item.sourceCitations, scenarioFamilies),
  };
}

function classifyScenarioFamilies(
  item: ProductCenterParsedMarkdownTestCase,
): ProductCenterItemCoreScenarioFamily[] {
  const families: ProductCenterItemCoreScenarioFamily[] = [];
  const createEvidence = [item.title, ...item.expectedResults].join(' ');
  if (/创建成功|创建页/.test(item.title)
    || (/提交成功/.test(createEvidence) && item.actions.some((action) => /创建.*商品/.test(action)))) {
    families.push('create');
  }
  if (/必填|缺失|为空|未选择|不可点击/.test(item.title)) families.push('required');
  if (/重复|同名|唯一|首尾.*空格|商品编码/.test(item.title)) families.push('identity');
  if (/价格|标准价|起售数量|负数|非数字|选择份数|份数内免费/.test(item.title)) {
    families.push('price-quantity');
  }
  if (/多规格|单规格|默认规格|称重商品|商品规格/.test(item.title)) families.push('spec');
  if (/查询|搜索|筛选|重置/.test(item.title) || /→ 查询$/.test(item.module)) families.push('query');
  if (/编辑|修改/.test(item.title)) families.push('edit');
  if (/删除|启用|停用|停售/.test(item.title)) families.push('lifecycle');
  if (/^TC-ITEM-PKG-/.test(item.id)) families.push('package');
  return productCenterItemCoreScenarioFamilies.filter((family) => families.includes(family));
}

function familyRiskWeight(family: ProductCenterItemCoreScenarioFamily): number {
  return {
    create: 45,
    required: 35,
    identity: 40,
    'price-quantity': 35,
    spec: 40,
    query: 30,
    edit: 35,
    lifecycle: 45,
    package: 40,
  }[family];
}

function familySpecificBonus(family: ProductCenterItemCoreScenarioFamily, title: string): number {
  if (family === 'create' && /创建成功/.test(title)) return 15;
  if (family === 'required' && /必填项缺失/.test(title)) return 20;
  if (family === 'identity' && /品牌内.*重复/.test(title)) return 15;
  if (family === 'identity' && /商品编码重复/.test(title)) return 12;
  if (family === 'identity' && /首尾.*空格/.test(title)) return 8;
  if (family === 'price-quantity' && /负数|非数字/.test(title)) return 20;
  if (family === 'lifecycle' && /停用.*成功/.test(title)) return 30;
  if (family === 'lifecycle' && /删除成功/.test(title)) return 25;
  if (family === 'lifecycle' && /被菜单引用.*不可删除/.test(title)) return 15;
  if (family === 'lifecycle' && /被.+引用.*不可删除/.test(title)) return 10;
  if (family === 'package' && /可选择已有/.test(title)) return 50;
  if (family === 'package' && /可新增/.test(title)) return 40;
  if (family === 'package' && /套餐组|固定搭配|组合搭配|可选搭配/.test(title)) return 15;
  return 0;
}

function buildRiskReasons(
  sources: ProductCenterTestPlanSourceCitation[],
  families: ProductCenterItemCoreScenarioFamily[],
): string[] {
  const sourceKinds = new Set(sources.map((source) => source.kind));
  const sourceReason = [
    sourceKinds.has('prd-explicit') ? 'PRD 明确来源' : '',
    sourceKinds.has('business-rule-explicit') ? '正式业务规则来源' : '',
    sourceKinds.has('xmind-existing') ? 'XMind 已有场景' : '',
  ].filter(Boolean).join(' + ');
  return [
    'P0 核心业务风险',
    sourceReason,
    ...families.map((family) => scenarioRiskReason(family)),
  ].filter(Boolean);
}

function scenarioRiskReason(family: ProductCenterItemCoreScenarioFamily): string {
  return {
    create: '覆盖商品创建主链路',
    required: '防止无效必填数据入库',
    identity: '防止商品身份冲突或脏数据',
    'price-quantity': '防止价格或销售数量异常',
    spec: '覆盖规格与称重模型',
    query: '保障列表检索和运营定位',
    edit: '保障存量商品变更',
    lifecycle: '保障启停与删除引用约束',
    package: '覆盖套餐及搭配组核心链路',
  }[family];
}

function selectByFamilyMinimums(candidates: readonly ScoredCase[]): ScoredCase[] {
  const selected = new Map<string, ScoredCase>();
  for (const family of productCenterItemCoreScenarioFamilies) {
    const ranked = candidates
      .filter((item) => item.scenarioFamilies.includes(family))
      .sort((left, right) => compareForFamily(left, right, family));
    const familySelection = ranked.slice(0, productCenterItemCoreFamilyMinimums[family]);
    if (familySelection.length < productCenterItemCoreFamilyMinimums[family]) {
      throw new Error(`核心审核批次缺少场景候选：${family}`);
    }
    familySelection.forEach((item) => selected.set(item.id, item));
  }
  while (selected.size < targetCount) {
    const primaryCounts = countPrimaryFamilies(selected.values());
    const next = candidates
      .filter((item) => !selected.has(item.id))
      .filter((item) => primaryCounts[primaryScenarioFamily(item)] < primaryFamilyMaximum(item))
      .sort((left, right) => {
        const leftAdjusted = left.riskScore - (primaryCounts[primaryScenarioFamily(left)] * 20);
        const rightAdjusted = right.riskScore - (primaryCounts[primaryScenarioFamily(right)] * 20);
        return rightAdjusted - leftAdjusted || right.riskScore - left.riskScore || left.id.localeCompare(right.id);
      })[0];
    if (!next) throw new Error(`核心审核批次无法补足目标数量：${selected.size}/${targetCount}`);
    selected.set(next.id, next);
  }
  return [...selected.values()].sort((left, right) => {
    const leftFamily = primaryScenarioFamily(left);
    const rightFamily = primaryScenarioFamily(right);
    const familyOrder = productCenterItemCoreScenarioFamilies.indexOf(leftFamily)
      - productCenterItemCoreScenarioFamilies.indexOf(rightFamily);
    return familyOrder || compareForFamily(left, right, leftFamily);
  });
}

function compareForFamily(
  left: ScoredCase,
  right: ScoredCase,
  family: ProductCenterItemCoreScenarioFamily,
): number {
  const leftStandardBonus = family === 'package' || left.id.startsWith('TC-ITEM-STD-') ? 0 : -25;
  const rightStandardBonus = family === 'package' || right.id.startsWith('TC-ITEM-STD-') ? 0 : -25;
  return ((right.familyScores[family] ?? 0) + rightStandardBonus)
    - ((left.familyScores[family] ?? 0) + leftStandardBonus)
    || right.riskScore - left.riskScore
    || left.id.localeCompare(right.id);
}

function primaryScenarioFamily(item: ScoredCase): ProductCenterItemCoreScenarioFamily {
  if (item.id.startsWith('TC-ITEM-PKG-')) return 'package';
  const ordered: ProductCenterItemCoreScenarioFamily[] = [
    'lifecycle',
    'query',
    'edit',
    'identity',
    'required',
    'price-quantity',
    'spec',
    'create',
  ];
  return ordered.find((family) => item.scenarioFamilies.includes(family)) ?? 'create';
}

function countPrimaryFamilies(
  cases: Iterable<ScoredCase>,
): Record<ProductCenterItemCoreScenarioFamily, number> {
  const counts = Object.fromEntries(productCenterItemCoreScenarioFamilies.map((family) => [family, 0])) as
    Record<ProductCenterItemCoreScenarioFamily, number>;
  for (const item of cases) counts[primaryScenarioFamily(item)] += 1;
  return counts;
}

function primaryFamilyMaximum(item: ScoredCase): number {
  return {
    create: 3,
    required: 3,
    identity: 4,
    'price-quantity': 3,
    spec: 3,
    query: 3,
    edit: 3,
    lifecycle: 4,
    package: 4,
  }[primaryScenarioFamily(item)];
}

function countFamilyCoverage(
  cases: readonly ScoredCase[],
): Record<ProductCenterItemCoreScenarioFamily, number> {
  return Object.fromEntries(productCenterItemCoreScenarioFamilies.map((family) => [
    family,
    cases.filter((item) => item.scenarioFamilies.includes(family)).length,
  ])) as Record<ProductCenterItemCoreScenarioFamily, number>;
}

function numbered(items: readonly string[]): string[] {
  return items.map((item, index) => `${index + 1}. ${item}`);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
