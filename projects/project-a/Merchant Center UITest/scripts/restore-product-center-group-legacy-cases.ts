import fs from 'node:fs';
import path from 'node:path';

type RestorableCase = {
  caseId: string;
  title: string;
  module: string;
  priority: 'P0' | 'P1' | 'P2';
  preconditions: string[];
  steps: string[];
  expectedResults: string[];
  sourceIds?: string[];
  disposition: string;
  classification?: string;
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const reconciliationPath = path.join(
  workspaceRoot,
  'deliverables/product-center-group/legacy-current-reconciliation.json',
);
const formalPath = path.join(
  workspaceRoot,
  'Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-组/2.商品中心-商品管理-组-正式测试用例.md',
);
const sectionTitle = '## 历史运行基线恢复用例（自动迁移）';
const xmindSourceByCaseId: Readonly<Record<string, string>> = {
  'TC-GRP-ADD-021': 'XMind已有 ← 加料组 / 展示 / 页面展示 / 加料商品选择页面交互验证',
  'TC-GRP-ADD-026': 'XMind已有 ← 加料组 / 新增 / 规则校验 / 新增加料组，配置相同的商品合并展示开关为关，加料明细有相同的商品，在C端合并展示',
  'TC-GRP-ADD-029': 'XMind已有 ← 加料组 / 新增 / 规则校验 / 新增加料组，最小选择1份和最多选择3份时，2份内免费',
  'TC-GRP-ADD-030': 'XMind已有 ← 加料组 / 新增 / 规则校验 / 新增加料组，最小选择1份和最多选择3份时，2份内免费',
  'TC-GRP-MTH-014': 'XMind已有 ← 做法组 / 新增 / 必填参数校验 / 已有的做法组，新增做法明细，缺少必填项，新的做法明细创建失败，做法组还是原来的信息',
  'TC-GRP-TASTE-015': 'XMind已有 ← 口味组 / 新增 / 必填参数校验 / 已有的口味组，新增口味明细，缺少必填项，新的口味明细创建失败，口味组还是原来的信息',
};

export function restoreProductCenterGroupLegacyCases(): { restored: number; total: number; formalPath: string } {
  const report = JSON.parse(fs.readFileSync(reconciliationPath, 'utf8')) as {
    historicalCases: RestorableCase[];
  };
  const current = fs.readFileSync(formalPath, 'utf8').replace(/\r\n/g, '\n').trimEnd();
  const currentIds = new Set(
    [...current.matchAll(/^### 用例编号：(TC-GRP-[A-Z]+-\d+(?:-[A-Z])?)$/gm)].map((match) => match[1]),
  );
  const restorable = report.historicalCases
    .filter((item) => ['restore-required', 'restored'].includes(item.disposition))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  if (restorable.length !== 31) {
    throw new Error(`恢复队列数量异常：${restorable.length}`);
  }
  for (const item of restorable) validateCase(item);

  const missing = restorable.filter((item) => !currentIds.has(item.caseId));
  const unexpectedExisting = restorable.length - missing.length;
  if (unexpectedExisting !== 0 && unexpectedExisting !== restorable.length) {
    throw new Error(`恢复状态不完整：已存在=${unexpectedExisting}，待恢复=${missing.length}`);
  }
  if (missing.length === 0) {
    const synchronized = synchronizeRestoredSources(current, restorable);
    if (synchronized !== current) writeText(formalPath, `${synchronized.trimEnd()}\n`);
    return { restored: 0, total: currentIds.size, formalPath };
  }
  if (current.includes(sectionTitle)) {
    throw new Error('正式方案已存在恢复章节但用例集合不完整，禁止重复追加');
  }

  const restoredContent = [
    current,
    '',
    sectionTitle,
    '',
    '> 来源为已执行历史运行基线；历史通过用例按原预期恢复，外部依赖阻断用例保留场景并继续标记环境阻断。',
    '',
    ...missing.flatMap((item) => [renderCase(item), '']),
  ].join('\n');
  writeText(formalPath, `${restoredContent.trimEnd()}\n`);
  return { restored: missing.length, total: currentIds.size + missing.length, formalPath };
}

function validateCase(item: RestorableCase): void {
  if (!['P0', 'P1', 'P2'].includes(item.priority)) throw new Error(`优先级非法：${item.caseId}`);
  if (!item.preconditions.length || !item.steps.length || !item.expectedResults.length) {
    throw new Error(`用例结构不完整：${item.caseId}`);
  }
  if (item.steps.length !== item.expectedResults.length) {
    throw new Error(`步骤与预期不一致：${item.caseId}`);
  }
}

function renderCase(item: RestorableCase): string {
  const numbered = (title: string, values: readonly string[]) => [
    `${title}：`,
    ...values.map((value, index) => `${index + 1}. ${value}`),
  ].join('\n');
  const source = restoredSource(item);
  return [
    `### 用例编号：${item.caseId}`,
    '',
    `用例标题：${item.title}`,
    '',
    `所属模块：${item.module}`,
    '',
    `优先级：${item.priority}`,
    '',
    `来源：${source}`,
    '',
    numbered('前置条件', item.preconditions),
    '',
    numbered('测试步骤', item.steps),
    '',
    numbered('预期结果', item.expectedResults),
  ].join('\n');
}

function synchronizeRestoredSources(content: string, cases: readonly RestorableCase[]): string {
  let synchronized = content;
  for (const item of cases) {
    const blockPattern = new RegExp(
      `(^### 用例编号：${item.caseId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n[\\s\\S]*?^来源：)(.+)$`,
      'm',
    );
    if (!blockPattern.test(synchronized)) throw new Error(`恢复用例来源字段缺失：${item.caseId}`);
    synchronized = synchronized.replace(blockPattern, `$1${restoredSource(item)}`);
  }
  return synchronized;
}

function restoredSource(item: RestorableCase): string {
  const businessRules = [...new Set((item.sourceIds ?? []).filter((sourceId) => /^BR-[A-Z0-9-]+$/i.test(sourceId)))];
  const formalSource = businessRules.length > 0
    ? businessRules.join(' / ')
    : xmindSourceByCaseId[item.caseId] ?? 'XMind已有';
  const runtimeEvidence = item.classification === 'external-dependency-blocked'
    ? '历史运行确认当前环境阻断'
    : '历史运行基线已通过';
  return `${formalSource}；${runtimeEvidence} ← deliverables/product-center-group/runtime-report.json#${item.caseId}`;
}

function writeText(filePath: string, value: string): void {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(restoreProductCenterGroupLegacyCases())}\n`);
}
