import fs from 'node:fs';
import path from 'node:path';

type BaselineCase = {
  caseId: string;
  module: string;
  title: string | null;
};

type ExecutionTask = BaselineCase & {
  action: 'execute' | 'blocked-source' | 'blocked-technical' | 'not-applicable';
  reason: string;
  runnerId: 'group' | 'item' | 'remaining' | null;
};

type ResolutionDisposition =
  | 'manual-product-decision'
  | 'automation-executable'
  | 'automation-implementation'
  | 'runtime-audit'
  | 'external-environment'
  | 'isolated-dataset'
  | 'confirmed-product-defect'
  | 'closed-not-applicable';

const EXTERNAL_ENVIRONMENT_CASE_IDS = new Set([
  'TC-FLV-POS-012',
  'TC-FLV-POS-013',
  'TC-GRP-PKG-034',
  'TC-GRP-PKG-035',
  'TC-ITEM-PKG-070',
  'TC-ITEM-STD-080',
  'TC-ITEM-STD-083',
  'TC-TAG-BDG-022',
  'TC-TAG-DESC-029',
  'TC-TAG-STAT-026',
  'TC-TAG-XMOD-001',
  'TC-TAG-XMOD-005',
  'TC-TAG-XMOD-006',
  'TC-TAG-XMOD-008',
]);

const ISOLATED_DATASET_CASE_IDS = new Set(['TC-TAG-STAT-025']);
const REMOVED_DEPRECATED_CASE_IDS = new Set(['TC-GRP-PKG-017', 'TC-GRP-PKG-020']);

export function buildProductCenterLegacy116Resolution(options: {
  projectRoot?: string;
  generatedAt?: string;
  write?: boolean;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const workspaceRoot = path.resolve(projectRoot, '..');
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const write = options.write ?? true;
  const baselinePath = path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-legacy-source-blocked-116-baseline.json',
  );
  const baseline = loadOrCreateBaseline(projectRoot, baselinePath, write);
  const plan = readJson<{ tasks: ExecutionTask[] }>(path.join(
    workspaceRoot,
    'deliverables/product-center-source-governance/execution-plan.json',
  ));
  const autoResolution = readJson<{
    cases: Array<{ caseId: string; humanRequired: boolean; disposition: string }>;
  }>(path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-source-auto-resolution.json',
  ));
  const executionResultPath = path.join(
    workspaceRoot,
    'deliverables/product-center-source-governance/execution-result.json',
  );
  const executionResult = fs.existsSync(executionResultPath)
    ? readJson<{ executionCases: Array<{ caseId: string; status: string }> }>(executionResultPath)
    : { executionCases: [] };
  const taskByCaseId = new Map(plan.tasks.map((item) => [item.caseId, item]));
  const latestStatusByCaseId = new Map(executionResult.executionCases
    .map((item) => [item.caseId, item.status]));
  const humanRequiredIds = new Set(autoResolution.cases
    .filter((item) => item.humanRequired)
    .map((item) => item.caseId));
  const confirmedProductDefectIds = new Set(autoResolution.cases
    .filter((item) => item.disposition === 'product-defect-confirmed')
    .map((item) => item.caseId));

  const cases = baseline.cases.map((baselineCase) => {
    const task = taskByCaseId.get(baselineCase.caseId) ?? (
      REMOVED_DEPRECATED_CASE_IDS.has(baselineCase.caseId)
        ? {
            ...baselineCase,
            action: 'not-applicable' as const,
            reason: '废弃用例已从当前权威方案和执行分母移除，仅保留历史台账追溯。',
            runnerId: null,
          }
        : null
    );
    if (!task) throw new Error(`原 116 条用例未进入当前执行计划：${baselineCase.caseId}`);
    const disposition = resolveDisposition(task, humanRequiredIds, confirmedProductDefectIds);
    return {
      ...baselineCase,
      disposition,
      humanRequired: disposition === 'manual-product-decision',
      currentAction: task.action,
      runnerId: task.runnerId,
      latestExecutionStatus: latestStatusByCaseId.get(task.caseId) ?? null,
      reason: task.reason,
      nextAction: nextActionFor(disposition),
    };
  });
  const report = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-legacy-source-blocked-116-resolution',
    generatedAt,
    baselineGeneratedAt: baseline.generatedAt,
    summary: {
      total: cases.length,
      humanRequired: cases.filter((item) => item.humanRequired).length,
      aiProcessOwned: cases.filter((item) => !item.humanRequired).length,
      executablePassed: cases.filter((item) => (
        item.disposition === 'automation-executable' && item.latestExecutionStatus === 'passed'
      )).length,
      executableNotPassed: cases.filter((item) => (
        item.disposition === 'automation-executable' && item.latestExecutionStatus !== 'passed'
      )).length,
      confirmedProductDefects: cases.filter((item) => item.disposition === 'confirmed-product-defect').length,
      byDisposition: countBy(cases, (item) => item.disposition),
      byModule: countBy(cases, (item) => item.module),
    },
    cases,
  };
  if (report.summary.total !== 116) throw new Error(`原来源阻断基线数量异常：${report.summary.total}`);
  const humanRequiredCaseIds = cases.filter((item) => item.humanRequired).map((item) => item.caseId);
  if (JSON.stringify(humanRequiredCaseIds) !== JSON.stringify(['TC-GRP-PKG-040'])) {
    throw new Error(`人工产品决策集合异常：${humanRequiredCaseIds.join(',')}`);
  }
  if (report.summary.confirmedProductDefects !== 0) {
    throw new Error(`已确认产品缺陷数量异常：${report.summary.confirmedProductDefects}`);
  }
  const outputRoot = path.join(workspaceRoot, 'deliverables/product-center-source-governance');
  const jsonPath = path.join(outputRoot, 'legacy-116-resolution.json');
  const markdownPath = path.join(outputRoot, 'legacy-116-resolution.md');
  if (write) {
    writeJson(jsonPath, report);
    writeText(markdownPath, renderMarkdown(report));
  }
  return { report, baselinePath, jsonPath, markdownPath };
}

function loadOrCreateBaseline(
  projectRoot: string,
  baselinePath: string,
  write: boolean,
): { generatedAt: string; cases: BaselineCase[] } {
  if (fs.existsSync(baselinePath)) return readJson(baselinePath);
  const historicalResult = readJson<{
    generatedAt: string;
    summary: { blockedSource: number };
    nonExecutionTasks: ExecutionTask[];
  }>(path.join(
    projectRoot,
    '../deliverables/product-center-source-governance/execution-result.json',
  ));
  const cases = historicalResult.nonExecutionTasks
    .filter((item) => item.action === 'blocked-source')
    .map(({ caseId, module, title }) => ({ caseId, module, title }))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  if (historicalResult.summary.blockedSource !== 116 || cases.length !== 116) {
    throw new Error('无法从历史执行结果冻结原 116 条来源阻断基线');
  }
  const baseline = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-legacy-source-blocked-116-baseline',
    generatedAt: historicalResult.generatedAt,
    cases,
  };
  if (write) writeJson(baselinePath, baseline);
  return baseline;
}

function resolveDisposition(
  task: ExecutionTask,
  humanRequiredIds: ReadonlySet<string>,
  confirmedProductDefectIds: ReadonlySet<string>,
): ResolutionDisposition {
  if (humanRequiredIds.has(task.caseId)) return 'manual-product-decision';
  if (confirmedProductDefectIds.has(task.caseId)) return 'confirmed-product-defect';
  if (EXTERNAL_ENVIRONMENT_CASE_IDS.has(task.caseId)) return 'external-environment';
  if (ISOLATED_DATASET_CASE_IDS.has(task.caseId)) return 'isolated-dataset';
  if (task.action === 'execute') return 'automation-executable';
  if (task.action === 'blocked-technical') return 'automation-implementation';
  if (task.action === 'not-applicable') return 'closed-not-applicable';
  return 'runtime-audit';
}

function nextActionFor(disposition: ResolutionDisposition): string {
  switch (disposition) {
    case 'manual-product-decision': return '由产品确认冲突业务合同后重新生成用例';
    case 'automation-executable': return '进入来源治理统一运行器并生成运行与清理证据';
    case 'automation-implementation': return '补齐严格自动化合同、数据工厂或断言后自动执行';
    case 'runtime-audit': return '执行真实 Merchant Center UI/API 审计，回写来源后生成自动化';
    case 'external-environment': return '等待对应终端或打印链路接入后由自动化运行，不转人工产品审核';
    case 'isolated-dataset': return '使用独立空数据租户或隔离数据集执行，禁止清空共享环境';
    case 'confirmed-product-defect': return '保留正确业务断言并由自动化持续复现，产品修复后转为通过';
    case 'closed-not-applicable': return '当前版本不适用，不执行';
  }
}

function renderMarkdown(report: ReturnType<typeof buildProductCenterLegacy116Resolution>['report']): string {
  return [
    '# 原 116 条来源阻断用例处置台账',
    '',
    `- 生成时间：${report.generatedAt}`,
    `- 总数：${report.summary.total}`,
    `- 需要人工产品决策：${report.summary.humanRequired}`,
    `- AI/自动化流程负责：${report.summary.aiProcessOwned}`,
    `- 已确认产品缺陷：${report.summary.confirmedProductDefects}`,
    `- 已实际运行通过：${report.summary.executablePassed}`,
    `- 可执行但尚未通过：${report.summary.executableNotPassed}`,
    '',
    '## 仅需人工产品决策',
    '',
    '| 用例 | 模块 | 阻断原因 |',
    '| --- | --- | --- |',
    ...report.cases
      .filter((item) => item.humanRequired)
      .map((item) => `| ${item.caseId} | ${item.module} | ${item.reason} |`),
    '',
    '## 全部处置',
    '',
    '| 用例 | 模块 | 是否人工 | 当前处置 | 最新运行 | 下一步 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.cases.map((item) => (
      `| ${item.caseId} | ${item.module} | ${item.humanRequired ? '是' : '否'} | ${item.disposition} | ${item.latestExecutionStatus ?? '-'} | ${item.nextAction} |`
    )),
    '',
  ].join('\n');
}

function countBy<T>(items: readonly T[], keyFor: (item: T) => string): Record<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFor(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  const result = buildProductCenterLegacy116Resolution();
  process.stdout.write(`${JSON.stringify(result.report.summary)}\n`);
}
