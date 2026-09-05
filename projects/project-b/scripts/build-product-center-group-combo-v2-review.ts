import fs from 'node:fs';
import path from 'node:path';
import { productCenterTestPlanModuleRoot } from '../utils/product-center-test-plan-source';

type FormalCase = {
  id: string;
  title: string;
  module: string;
  priority: string;
  source: string;
  preconditions: string[];
  steps: string[];
  expectedResults: string[];
};

type AutomationBinding = {
  caseId: string;
  generationAllowed: boolean;
  handlerId: string | null;
  blockClassification: string | null;
  blockedReasons: string[];
  executionProfile: string;
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const infoRoot = path.join(workspaceRoot, 'Merchant Center Info');
const groupSourceRoot = productCenterTestPlanModuleRoot(infoRoot, 'group');
const formalPath = path.join(
  groupSourceRoot,
  '2.商品中心-商品管理-组-正式测试用例.md',
);
const bindingPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json');
const deliverableRoot = path.join(workspaceRoot, 'deliverables/product-center-group');
const legacyAssetRoot = path.join(
  workspaceRoot,
  'deliverables/product-center-source-governance/legacy-assets/商品中心-商品管理-组',
);
const generatedCasePath = path.join(deliverableRoot, 'test-cases.json');
const reviewMarkdownPath = path.join(deliverableRoot, 'combo-v2-test-cases-review.md');
const reviewJsonPath = path.join(deliverableRoot, 'combo-v2-test-cases-review.json');
const blockedReviewMarkdownPath = path.join(deliverableRoot, 'combo-v2-blocked-32-review.md');
const businessReviewPath = path.join(
  legacyAssetRoot,
  '2.商品中心-商品管理-组-套餐组V2-待人工审核用例.md',
);
const businessBlockedReviewPath = path.join(
  legacyAssetRoot,
  '2.商品中心-商品管理-组-套餐组V2-32条阻断用例审核.md',
);

export function buildProductCenterGroupComboV2Review(): {
  markdownPath: string;
  jsonPath: string;
  businessReviewPath: string;
  blockedReviewMarkdownPath: string;
  businessBlockedReviewPath: string;
  summary: Record<string, number>;
} {
  const formalCases = readFormalCases().filter((testCase) => testCase.id.startsWith('TC-GRP-PKG-'));
  const bindings = readBindings();
  const manualDecisions = readManualDecisions();
  const bindingById = new Map(bindings.map((binding) => [binding.caseId, binding]));
  const cases = formalCases.map((testCase) => {
    const disposition = dispositionFor(testCase.id);
    const binding = bindingById.get(testCase.id) ?? null;
    if (disposition !== 'deprecated' && !binding) throw new Error(`${testCase.id} 缺少自动化绑定`);
    const automationStatus = disposition === 'deprecated'
      ? 'not-generated'
      : binding?.generationAllowed
        ? 'generated'
        : 'blocked';
    return {
      ...testCase,
      disposition,
      reviewStatus: 'pending-human-review',
      evidenceLevel: evidenceLevelFor(testCase.id),
      evidencePaths: evidencePathsFor(testCase.id),
      reviewFocus: reviewFocusFor(testCase.id),
      manualDecision: manualDecisions[testCase.id] ?? null,
      automation: {
        status: automationStatus,
        runtimeVerified: false,
        handlerId: binding?.handlerId ?? null,
        executionProfile: binding?.executionProfile ?? null,
        blockClassification: binding?.blockClassification ?? (disposition === 'deprecated' ? 'deprecated' : null),
        blockedReasons: binding?.blockedReasons ?? (disposition === 'deprecated' ? ['废弃用例不生成自动化脚本'] : []),
      },
    };
  });
  const summary = {
    total: cases.length,
    active: cases.filter((testCase) => testCase.disposition !== 'deprecated').length,
    modified: cases.filter((testCase) => testCase.disposition === 'modified').length,
    added: cases.filter((testCase) => testCase.disposition === 'added').length,
    deprecated: cases.filter((testCase) => testCase.disposition === 'deprecated').length,
    automationGenerated: cases.filter((testCase) => testCase.automation.status === 'generated').length,
    automationBlocked: cases.filter((testCase) => testCase.automation.status === 'blocked').length,
  };
  const document = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-group-combo-v2-human-review',
    generatedAt: new Date().toISOString(),
    reviewStatus: 'pending-human-review',
    businessBaselineDate: '2026-08-16',
    summary,
    automationExecution: {
      planCommand: 'npm run plan:product-center:group-combo-v2-review',
      liveCommand: '$env:PC_GROUP_COMBO_V2_LIVE="1"; npm run test:product-center:group-combo-v2-review',
      warning: 'generated 仅表示已生成与步骤/预期逐项绑定的脚本，不表示运行通过；blocked 不会进入执行集合。',
    },
    cases,
  };
  const markdown = renderMarkdown(document);
  const blockedMarkdown = renderBlockedMarkdown(document);
  writeJson(reviewJsonPath, document);
  writeText(reviewMarkdownPath, markdown);
  writeText(businessReviewPath, markdown);
  writeText(blockedReviewMarkdownPath, blockedMarkdown);
  writeText(businessBlockedReviewPath, blockedMarkdown);
  return {
    markdownPath: reviewMarkdownPath,
    jsonPath: reviewJsonPath,
    businessReviewPath,
    blockedReviewMarkdownPath,
    businessBlockedReviewPath,
    summary,
  };
}

function readFormalCases(): FormalCase[] {
  const generatedDocument = JSON.parse(fs.readFileSync(generatedCasePath, 'utf8')) as { cases?: FormalCase[] };
  if (!Array.isArray(generatedDocument.cases)) throw new Error('组结构化用例文件结构错误');
  const activeCases = generatedDocument.cases.filter((testCase) => testCase.id.startsWith('TC-GRP-PKG-'));
  const markdown = fs.readFileSync(formalPath, 'utf8').replace(/\r\n/g, '\n');
  const deprecatedCases = markdown
    .split(/(?=^### 用例编号：)/m)
    .filter((block) => block.startsWith('### 用例编号：'))
    .map((block) => ({
      id: readField(block, '用例编号'),
      title: readField(block, '用例标题'),
      module: readField(block, '所属模块'),
      priority: readField(block, '优先级'),
      source: readField(block, '来源'),
      preconditions: readSection(block, '前置条件', '测试步骤'),
      steps: readSection(block, '测试步骤', '预期结果'),
      expectedResults: readSection(block, '预期结果'),
    }))
    .filter((testCase) => testCase.id.startsWith('TC-GRP-PKG-') && testCase.title.startsWith('【已废弃'));
  return [...activeCases, ...deprecatedCases].sort((left, right) => left.id.localeCompare(right.id));
}

function readBindings(): AutomationBinding[] {
  const document = JSON.parse(fs.readFileSync(bindingPath, 'utf8')) as { cases?: AutomationBinding[] };
  if (!Array.isArray(document.cases)) throw new Error('套餐组自动化绑定文件结构错误');
  return document.cases.filter((binding) => binding.caseId.startsWith('TC-GRP-PKG-'));
}

function readManualDecisions(): Record<string, string> {
  const decisions: Record<string, string> = {};
  decisions['TC-GRP-PKG-016'] = '确定场景正确，含商品套餐组允许删除，按删除成功规则处理并更新业务规则';
  if (!fs.existsSync(businessBlockedReviewPath)) return decisions;
  const markdown = fs.readFileSync(businessBlockedReviewPath, 'utf8').replace(/\r\n/g, '\n');
  for (const match of markdown.matchAll(/^###\s+(TC-GRP-PKG-\d{3})\s+[^\n]*\n###人工处理：([^\n]+)$/gm)) {
    decisions[match[1]] = match[2].trim();
  }
  let currentCaseId: string | null = null;
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^###\s+(TC-GRP-PKG-\d{3})\s+/);
    if (heading) currentCaseId = heading[1];
    const decision = line.match(/^- 人工审核：(.+)$/);
    if (currentCaseId && decision) decisions[currentCaseId] = decision[1].trim();
  }
  return decisions;
}

function dispositionFor(caseId: string): 'modified' | 'added' | 'deprecated' {
  const sequence = Number(caseId.slice(-3));
  if ([17, 20].includes(sequence)) return 'deprecated';
  if (sequence >= 36) return 'added';
  return 'modified';
}

function evidenceLevelFor(caseId: string): string {
  if (['TC-GRP-PKG-003', 'TC-GRP-PKG-027', 'TC-GRP-PKG-040'].includes(caseId)) return 'observed-negative-runtime';
  if (['TC-GRP-PKG-001', 'TC-GRP-PKG-002'].includes(caseId)) return 'observed-list-contract';
  if (/TC-GRP-PKG-0(?:08|36|37|38|39|41|42|43|44)$/.test(caseId)) return 'observed-ui-contract';
  if (['TC-GRP-PKG-015', 'TC-GRP-PKG-016', 'TC-GRP-PKG-023', 'TC-GRP-PKG-029', 'TC-GRP-PKG-030', 'TC-GRP-PKG-031', 'TC-GRP-PKG-032', 'TC-GRP-PKG-033', 'TC-GRP-PKG-045'].includes(caseId)) return 'human-confirmed-business-rule';
  if (caseId === 'TC-GRP-PKG-046') return 'ui-contract-observed-success-not-verified';
  if (['TC-GRP-PKG-017', 'TC-GRP-PKG-020'].includes(caseId)) return 'deprecated-by-current-contract';
  return 'business-rule-or-existing-case-pending-runtime-verification';
}

function evidencePathsFor(caseId: string): string[] {
  const paths = [
    'Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-组/2.商品中心-商品管理-组-正式测试用例.md',
    'deliverables/product-center-group/combo-v2-audit-review.md',
  ];
  if (['TC-GRP-PKG-001', 'TC-GRP-PKG-002'].includes(caseId)) {
    paths.push('Merchant Center UITest/output/audit/product-center-group-combo-v2-list-audit.json');
  }
  if (['TC-GRP-PKG-003', 'TC-GRP-PKG-027', 'TC-GRP-PKG-040'].includes(caseId)) {
    paths.push('Merchant Center UITest/output/audit/product-center-group-combo-v2-empty-submit-audit.json');
  }
  if (/TC-GRP-PKG-0(?:08|36|37|38|39|41|42|43|44|45|46)$/.test(caseId)) {
    paths.push('Merchant Center UITest/output/audit/product-center-group-combo-v2-audit.json');
    paths.push('Merchant Center UITest/output/audit/product-center-group-combo-v2-rule-state-audit.json');
    paths.push('Merchant Center UITest/output/audit/product-center-group-combo-v2-detail-audit.json');
  }
  if (['TC-GRP-PKG-030', 'TC-GRP-PKG-033'].includes(caseId)) {
    paths.push('deliverables/product-center-group/combo-v2-validation-feedback-audit.json');
  }
  return paths;
}

function reviewFocusFor(caseId: string): string[] {
  const focus: string[] = [];
  if (['TC-GRP-PKG-006', 'TC-GRP-PKG-007', 'TC-GRP-PKG-028'].includes(caseId)) {
    focus.push('确认名称唯一性是否按套餐类型隔离，以及大小写是否折叠。');
  }
  if (/TC-GRP-PKG-0(?:09|10|11|12|13|14)$/.test(caseId)) {
    focus.push('确认套餐组编辑后对已引用套餐商品的传播边界。');
  }
  if (/TC-GRP-PKG-0(?:15|23|30|31|32|33)$/.test(caseId)) {
    focus.push('确认随心配组级最少/最多与子项默认数量、最大数量之间的精确关系。');
  }
  if (['TC-GRP-PKG-034', 'TC-GRP-PKG-035'].includes(caseId)) {
    focus.push('需要真实 C 端展示证据，当前仅完成后台字段合同审计。');
  }
  if (caseId === 'TC-GRP-PKG-044') focus.push('确认跟随商品价和自定义价的保存载荷及回读字段。');
  if (caseId === 'TC-GRP-PKG-046') {
    focus.push('随心配成功创建尚未实际执行验证，不得在人工审核前标记通过。');
  }
  return focus;
}

function renderMarkdown(document: any): string {
  const lines = [
    '# 套餐组 V2 待人工审核用例',
    '',
    `- 业务基线：${document.businessBaselineDate}`,
    `- 总计：${document.summary.total} 条；有效 ${document.summary.active} 条；修改 ${document.summary.modified} 条；新增 ${document.summary.added} 条；废弃 ${document.summary.deprecated} 条`,
    `- 自动化：已生成 ${document.summary.automationGenerated} 条；阻断 ${document.summary.automationBlocked} 条；废弃不生成 ${document.summary.deprecated} 条`,
    '- 状态说明：`generated` 仅表示脚本已精确绑定，不表示运行通过；`blocked` 不进入执行集合。',
    `- 执行预览：\`${document.automationExecution.planCommand}\``,
    `- 实际执行：\`${document.automationExecution.liveCommand}\``,
    '',
    '## 变更总览',
    '',
    '| 处置 | 用例范围 | 数量 |',
    '| --- | --- | ---: |',
    '| 修改 | TC-GRP-PKG-001~035，排除 017、020 | 33 |',
    '| 新增 | TC-GRP-PKG-036~046 | 11 |',
    '| 废弃 | TC-GRP-PKG-017、020 | 2 |',
    '',
  ];
  for (const testCase of document.cases) {
    lines.push(
      `## ${testCase.id} ${testCase.title}`,
      '',
      `- 处置：${testCase.disposition}`,
      `- 优先级：${testCase.priority}`,
      `- 来源：${testCase.source}`,
      `- 证据级别：${testCase.evidenceLevel}`,
      `- 自动化：${testCase.automation.status}${testCase.automation.handlerId ? ` / ${testCase.automation.handlerId}` : ''}`,
    );
    if (testCase.automation.blockClassification) lines.push(`- 阻断分类：${testCase.automation.blockClassification}`);
    for (const reason of testCase.automation.blockedReasons) lines.push(`- 阻断原因：${reason}`);
    if (testCase.manualDecision) lines.push(`- 人工审核：${testCase.manualDecision}`);
    for (const focus of testCase.reviewFocus) lines.push(`- 人工重点：${focus}`);
    lines.push('', '### 前置条件', '');
    pushNumbered(lines, testCase.preconditions.length ? testCase.preconditions : ['无；废弃用例勿执行。']);
    lines.push('', '### 测试步骤', '');
    pushNumbered(lines, testCase.steps.length ? testCase.steps : ['勿执行。']);
    lines.push('', '### 预期结果', '');
    pushNumbered(lines, testCase.expectedResults);
    lines.push('', '### 证据路径', '');
    for (const evidencePath of testCase.evidencePaths) lines.push(`- \`${evidencePath}\``);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function renderBlockedMarkdown(document: any): string {
  const reviewedCases = document.cases.filter((testCase: any) => testCase.manualDecision);
  const blockedCases = reviewedCases.filter((testCase: any) => testCase.automation.status === 'blocked');
  const counts = blockedCases.reduce((result: Record<string, number>, testCase: any) => {
    const classification = testCase.automation.blockClassification ?? 'unknown';
    result[classification] = (result[classification] ?? 0) + 1;
    return result;
  }, {});
  const lines = [
    '# 套餐组 V2 原 32 条人工审核处理清单',
    '',
    `- 人工已审核：${reviewedCases.length} 条`,
    `- 已转为可生成自动化：${reviewedCases.filter((testCase: any) => testCase.automation.status === 'generated').length} 条`,
    `- 当前仍阻断：${blockedCases.length} 条`,
    `- 自动化能力缺口：${counts['automation-gap'] ?? 0} 条，由自动化继续补 handler`,
    `- 产品行为冲突：${counts['observed-product-drift'] ?? 0} 条，需要业务决策`,
    `- 外部依赖：${counts['external-dependency-blocked'] ?? 0} 条，需要确认 C 端范围和环境`,
    '- 当前状态：人工业务审核已完成；剩余阻断均进入自动化实现或人工启动队列，不再等待业务确认。',
    '',
    '## 快速索引',
    '',
    '| 用例编号 | 用例标题 | 当前自动化状态 | 人工审核结论 |',
    '| --- | --- | --- | --- |',
  ];
  for (const testCase of reviewedCases) {
    lines.push(`| ${testCase.id} | ${testCase.title} | ${testCase.automation.status}${testCase.automation.blockClassification ? ` / ${testCase.automation.blockClassification}` : ''} | ${testCase.manualDecision} |`);
  }
  lines.push('', '## 详细用例', '');
  for (const testCase of reviewedCases) {
    lines.push(
      `### ${testCase.id} ${testCase.title}`,
      '',
      `- 处置：${testCase.disposition}`,
      `- 优先级：${testCase.priority}`,
      `- 来源：${testCase.source}`,
      `- 自动化状态：${testCase.automation.status}`,
    );
    if (testCase.automation.blockClassification) lines.push(`- 阻断分类：${testCase.automation.blockClassification}`);
    for (const reason of testCase.automation.blockedReasons) lines.push(`- 阻断原因：${reason}`);
    if (testCase.manualDecision) lines.push(`- 人工审核：${testCase.manualDecision}`);
    for (const focus of testCase.reviewFocus) lines.push(`- 人工重点：${focus}`);
    lines.push('', '**前置条件**', '');
    pushNumbered(lines, testCase.preconditions);
    lines.push('', '**测试步骤**', '');
    pushNumbered(lines, testCase.steps);
    lines.push('', '**预期结果**', '');
    pushNumbered(lines, testCase.expectedResults);
    lines.push('', '**证据路径**', '');
    for (const evidencePath of testCase.evidencePaths) lines.push(`- \`${evidencePath}\``);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function readField(block: string, label: string): string {
  const match = block.match(new RegExp(`^(?:###\\s+)?${label}：\\s*(.+)$`, 'm'));
  return match?.[1]?.trim() ?? '';
}

function readSection(block: string, label: string, nextLabel?: string): string[] {
  const pattern = nextLabel
    ? `^${label}：\\s*\\n([\\s\\S]*?)(?=^${nextLabel}：)`
    : `^${label}：\\s*\\n([\\s\\S]*)`;
  const match = block.match(new RegExp(pattern, 'm'));
  if (!match) return [];
  return [...match[1].matchAll(/^\d+\.\s+(.+)$/gm)].map((item) => item[1].trim());
}

function pushNumbered(lines: string[], values: string[]): void {
  values.forEach((value, index) => lines.push(`${index + 1}. ${value}`));
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(buildProductCenterGroupComboV2Review(), null, 2)}\n`);
}
