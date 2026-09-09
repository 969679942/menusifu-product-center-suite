import fs from 'node:fs';
import path from 'node:path';

type CaseSummary = {
  caseId: string;
  title: string;
  module: string;
  source?: string;
};

type HistoricalRuntimeCase = CaseSummary & {
  preconditions?: string[];
  steps?: string[];
  expectedResults?: string[];
  status?: string;
  classification?: string;
  blockedReasons?: string[];
  evidencePaths?: string[];
};

type ReconciliationEntry = CaseSummary & {
  disposition: 'retained' | 'restored' | 'restore-required' | 'confirmed-deprecated' | 'pending-confirmation';
  replacementCaseIds: string[];
  reason: string;
  evidencePaths: string[];
};

const HISTORICAL_RUNTIME_CASE_IDS = 139;
const CURRENT_FORMAL_CASE_IDS = 144;
const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');

export function reconcileProductCenterGroupLegacyCases(options: {
  projectRoot?: string;
  generatedAt?: string;
  write?: boolean;
} = {}) {
  const resolvedProjectRoot = path.resolve(options.projectRoot ?? projectRoot);
  const resolvedWorkspaceRoot = path.resolve(resolvedProjectRoot, '..');
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const historicalRuntimePath = path.join(
    resolvedWorkspaceRoot,
    'deliverables/product-center-group/runtime-report.json',
  );
  const legacyAssetPath = path.join(
    resolvedWorkspaceRoot,
    'deliverables/product-center-source-governance/legacy-assets/商品中心-商品管理-组/2.商品中心-商品管理-组-自动化测试用例.md',
  );
  const currentFormalPath = path.join(
    resolvedWorkspaceRoot,
    'Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-组/2.商品中心-商品管理-组-正式测试用例.md',
  );
  const historicalRuntime = readJson<{ cases: HistoricalRuntimeCase[] }>(historicalRuntimePath);
  const historicalCases = historicalRuntime.cases.filter((item) => item.caseId.startsWith('TC-GRP-'));
  const currentCases = parseFormalCases(currentFormalPath);
  const historicalById = new Map(historicalCases.map((item) => [item.caseId, item]));
  const currentById = new Map(currentCases.map((item) => [item.caseId, item]));

  if (historicalCases.length !== HISTORICAL_RUNTIME_CASE_IDS) {
    throw new Error(`历史运行分母异常：${historicalCases.length}`);
  }
  if (currentCases.length !== CURRENT_FORMAL_CASE_IDS) {
    throw new Error(`当前正式方案分母异常：${currentCases.length}`);
  }

  const entries: ReconciliationEntry[] = historicalCases
    .sort((left, right) => left.caseId.localeCompare(right.caseId))
    .map((item) => {
      const currentCase = currentById.get(item.caseId);
      if (currentCase) {
        const restored = currentCase.source?.includes('历史运行') ?? false;
        return {
          ...item,
          disposition: restored ? 'restored' : 'retained',
          replacementCaseIds: [],
          reason: restored
            ? '历史运行用例已按原 caseId、步骤和预期恢复到当前正式测试方案。'
            : '当前正式测试方案仍保留同一 caseId。',
          evidencePaths: [relativeWorkspace(resolvedWorkspaceRoot, currentFormalPath)],
        };
      }
      if (item.caseId === 'TC-GRP-PKG-017') {
        return {
          ...item,
          disposition: 'confirmed-deprecated',
          replacementCaseIds: ['TC-GRP-PKG-003', 'TC-GRP-PKG-027', 'TC-GRP-PKG-040'],
          reason: '新版套餐组三种类型均要求至少一个商品，旧清空商品后保存空组再删除流程不再成立。',
          evidencePaths: [
            'deliverables/product-center-group/combo-v2-audit-review.md',
            'Merchant Center UITest/scripts/build-product-center-group-combo-v2-review.ts',
          ],
        };
      }
      if (item.status === 'passed' && item.classification === 'passed') {
        return {
          ...item,
          disposition: 'restore-required',
          replacementCaseIds: [],
          reason: '历史运行已通过且证据完整，未发现废弃或替代依据；按防静默丢失规则自动进入恢复队列，无需人工审核。',
          evidencePaths: item.evidencePaths ?? [relativeWorkspace(resolvedWorkspaceRoot, historicalRuntimePath)],
        };
      }
      if (item.classification === 'external-dependency-blocked') {
        return {
          ...item,
          disposition: 'restore-required',
          replacementCaseIds: [],
          reason: '仅因外部终端或环境能力阻断，不能据此删除业务场景；自动进入恢复队列并保留环境阻断标记。',
          evidencePaths: item.evidencePaths ?? [relativeWorkspace(resolvedWorkspaceRoot, historicalRuntimePath)],
        };
      }
      return {
        ...item,
        disposition: 'pending-confirmation',
        replacementCaseIds: [],
        reason: '历史运行基线存在，但当前正式方案未保留；未找到逐条废弃、合并或替代决策。',
        evidencePaths: [
          relativeWorkspace(resolvedWorkspaceRoot, historicalRuntimePath),
          relativeWorkspace(resolvedWorkspaceRoot, currentFormalPath),
        ],
      };
    });
  const currentOnlyCases = currentCases
    .filter((item) => !historicalById.has(item.caseId))
    .sort((left, right) => left.caseId.localeCompare(right.caseId))
    .map((item) => ({
      ...item,
      disposition: 'new-in-current-baseline' as const,
      reason: item.caseId.startsWith('TC-GRP-PKG-036') || item.caseId.startsWith('TC-GRP-PKG-04')
        ? '新版套餐组 V2 字段与规则审计新增或重基线用例。'
        : '当前正式方案新增用例，历史运行基线中不存在同一 caseId。',
      evidencePaths: [relativeWorkspace(resolvedWorkspaceRoot, currentFormalPath)],
    }));

  const rawLegacy = parseFormalCases(legacyAssetPath);
  const rawLegacyIds = new Set(rawLegacy.map((item) => item.caseId));
  const historicalIds = new Set(historicalCases.map((item) => item.caseId));
  const rawLegacyArtifact = {
    path: relativeWorkspace(resolvedWorkspaceRoot, legacyAssetPath),
    blockCount: rawLegacy.length,
    uniqueCaseIds: rawLegacyIds.size,
    notInHistoricalRuntimeCaseIds: [...rawLegacyIds].filter((caseId) => !historicalIds.has(caseId)).sort(),
    runtimeOnlyCaseIds: [...historicalIds].filter((caseId) => !rawLegacyIds.has(caseId)).sort(),
    note: '该历史 Markdown 是旧自动化资产，不作为 139 条运行分母；运行分母以 runtime-report.cases 为准。',
  };
  const report = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-group-legacy-current-reconciliation',
    generatedAt,
    baseline: {
      historicalRuntime: relativeWorkspace(resolvedWorkspaceRoot, historicalRuntimePath),
      currentFormal: relativeWorkspace(resolvedWorkspaceRoot, currentFormalPath),
      historicalRuntimeCaseCount: historicalCases.length,
      currentFormalCaseCount: currentCases.length,
    },
    summary: {
      historicalRetained: entries.filter((item) => item.disposition === 'retained').length,
      restoredFromHistoricalBaseline: entries.filter((item) => item.disposition === 'restored').length,
      restoreRequired: entries.filter((item) => item.disposition === 'restore-required').length,
      confirmedDeprecated: entries.filter((item) => item.disposition === 'confirmed-deprecated').length,
      pendingConfirmation: entries.filter((item) => item.disposition === 'pending-confirmation').length,
      currentOnly: currentOnlyCases.length,
      historicalTotal: entries.length,
      currentTotal: entries.filter((item) => ['retained', 'restored'].includes(item.disposition)).length
        + currentOnlyCases.length,
    },
    manualReview: {
      path: 'Merchant Center Info/00-待转换测试方案/待处理/2.商品中心-商品管理-组-历史5条产品偏差人工确认.md',
      caseCount: entries.filter((item) => item.disposition === 'pending-confirmation').length,
      caseIds: entries
        .filter((item) => item.disposition === 'pending-confirmation')
        .map((item) => item.caseId),
    },
    rawLegacyArtifact,
    historicalCases: entries,
    currentOnlyCases,
  };
  if (report.summary.historicalTotal !== HISTORICAL_RUNTIME_CASE_IDS
    || report.summary.currentTotal !== CURRENT_FORMAL_CASE_IDS
    || report.summary.historicalRetained
      + report.summary.restoredFromHistoricalBaseline
      + report.summary.restoreRequired
      + report.summary.confirmedDeprecated
      + report.summary.pendingConfirmation !== HISTORICAL_RUNTIME_CASE_IDS) {
    throw new Error('历史与当前用例对账分母不守恒');
  }

  const outputRoot = path.join(resolvedWorkspaceRoot, 'deliverables/product-center-group');
  const jsonPath = path.join(outputRoot, 'legacy-current-reconciliation.json');
  const markdownPath = path.join(outputRoot, 'legacy-current-reconciliation.md');
  const manualReviewPath = path.join(resolvedWorkspaceRoot, report.manualReview.path);
  if (options.write !== false) {
    writeJson(jsonPath, report);
    writeText(markdownPath, renderMarkdown(report));
    writeManualReviewIfAbsent(
      manualReviewPath,
      renderManualReview(report, historicalById),
      report.manualReview.caseIds,
    );
  }
  return { report, jsonPath, markdownPath, manualReviewPath };
}

function parseFormalCases(filePath: string): CaseSummary[] {
  const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  return content
    .split(/(?=^### 用例编号：)/m)
    .filter((block) => block.startsWith('### 用例编号：'))
    .map((block) => ({
      caseId: readField(block, '### 用例编号'),
      title: readField(block, '用例标题'),
      module: readOptionalField(block, '所属模块') ?? inferModule(block),
      source: readOptionalField(block, '来源') ?? undefined,
    }))
    .filter((item) => item.caseId.startsWith('TC-GRP-'));
}

function readField(block: string, label: string): string {
  const match = block.match(new RegExp(`^${escapeRegExp(label)}：(.+)$`, 'm'));
  if (!match?.[1]?.trim()) throw new Error(`用例字段缺失：${label}`);
  return match[1].trim();
}

function readOptionalField(block: string, label: string): string | null {
  const match = block.match(new RegExp(`^${escapeRegExp(label)}：(.+)$`, 'm'));
  return match?.[1]?.trim() || null;
}

function inferModule(block: string): string {
  const caseId = readField(block, '### 用例编号');
  const moduleByCode: Record<string, string> = {
    SPEC: '商品管理 → 规格组',
    TASTE: '商品管理 → 口味组',
    MTH: '商品管理 → 做法组',
    ADD: '商品管理 → 加料组',
    PKG: '商品管理 → 套餐组',
    ATTR: '商品管理 → 属性集管理',
  };
  const moduleCode = caseId.split('-')[2];
  return moduleByCode[moduleCode] ?? '商品管理 → 组';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderMarkdown(report: ReturnType<typeof reconcileProductCenterGroupLegacyCases>['report']): string {
  return [
    '# 商品中心商品管理组历史用例对账',
    '',
    `- 历史运行基线：${report.summary.historicalTotal} 条`,
    `- 当前正式方案：${report.summary.currentTotal} 条`,
    `- 保留：${report.summary.historicalRetained} 条`,
    `- 已从历史基线恢复：${report.summary.restoredFromHistoricalBaseline} 条`,
    `- 自动恢复：${report.summary.restoreRequired} 条`,
    `- 已确认废弃：${report.summary.confirmedDeprecated} 条`,
    `- 待业务确认：${report.summary.pendingConfirmation} 条`,
    `- 当前新增：${report.summary.currentOnly} 条`,
    '',
    '## 历史用例逐条处置',
    '',
    '| 用例 | 标题 | 处置 | 替代用例 | 原因 |',
    '| --- | --- | --- | --- | --- |',
    ...report.historicalCases.map((item) => `| ${item.caseId} | ${item.title} | ${item.disposition} | ${item.replacementCaseIds.join(', ') || ''} | ${item.reason} |`),
    '',
    '## 当前新增用例',
    '',
    '| 用例 | 标题 | 处置 | 原因 |',
    '| --- | --- | --- | --- |',
    ...report.currentOnlyCases.map((item) => `| ${item.caseId} | ${item.title} | ${item.disposition} | ${item.reason} |`),
    '',
    '## 历史资产分母差异',
    '',
    `- 原始历史自动化 Markdown 区块：${report.rawLegacyArtifact.blockCount} 条。`,
    `- 本次不将其直接作为历史运行分母；实际运行分母以 \`${report.baseline.historicalRuntime}\` 的 \`cases\` 为准。`,
    `- 原始 Markdown 不在运行分母中的 ID：${report.rawLegacyArtifact.notInHistoricalRuntimeCaseIds.join(', ') || '无'}。`,
    `- 运行分母中原始 Markdown 未直接出现的 ID：${report.rawLegacyArtifact.runtimeOnlyCaseIds.join(', ') || '无'}。`,
    '',
  ].join('\n');
}

function renderManualReview(
  report: ReturnType<typeof reconcileProductCenterGroupLegacyCases>['report'],
  historicalById: ReadonlyMap<string, HistoricalRuntimeCase>,
): string {
  const pendingCases = report.historicalCases.filter((item) => item.disposition === 'pending-confirmation');
  return [
    `# 商品中心商品管理组历史 ${pendingCases.length} 条产品偏差人工确认`,
    '',
    `- 待审核：${pendingCases.length} 条`,
    `- 对账来源：\`${report.baseline.historicalRuntime}\` → \`${report.baseline.currentFormal}\``,
    '- 仅填写每条用例的“人工处理”部分，不要修改历史步骤、预期和证据。',
    '- 处置只允许填写：`按原预期保留并提缺陷`、`按实际行为更新规则`、`合并替代`、`确认废弃`。',
    '- 选择“合并替代”时必须填写当前替代用例 caseId；选择“确认废弃”时必须填写业务规则或版本依据。',
    '',
    ...pendingCases.flatMap((item) => {
      const historical = historicalById.get(item.caseId);
      return [
        `## ${item.caseId} ${item.title}`,
        '',
        `- 所属模块：${item.module}`,
        `- 历史运行状态：${historical?.status ?? 'unknown'}`,
        `- 历史分类：${historical?.classification ?? 'unknown'}`,
        `- 当前未保留原因：${item.reason}`,
        `- 历史阻断原因：${historical?.blockedReasons?.join('；') || '无'}`,
        `- 历史证据：${historical?.evidencePaths?.join('；') || '无'}`,
        '',
        '### 历史前置条件',
        '',
        ...renderNumbered(historical?.preconditions),
        '',
        '### 历史测试步骤',
        '',
        ...renderNumbered(historical?.steps),
        '',
        '### 历史预期结果',
        '',
        ...renderNumbered(historical?.expectedResults),
        '',
        '### 人工处理',
        '',
        '- 处置：待填写',
        '- 替代用例：无',
        '- 业务规则：待填写',
        '- 审核说明：待填写',
        '',
      ];
    }),
  ].join('\n');
}

function renderNumbered(values?: readonly string[]): string[] {
  return values?.length ? values.map((value, index) => `${index + 1}. ${value}`) : ['1. 无'];
}

function writeManualReviewIfAbsent(
  filePath: string,
  content: string,
  expectedCaseIds: readonly string[],
): void {
  if (!fs.existsSync(filePath)) {
    writeText(filePath, content);
    return;
  }
  const existing = fs.readFileSync(filePath, 'utf8');
  const existingCaseIds = [...existing.matchAll(/^## (TC-GRP-[A-Z]+-\d+(?:-[A-Z])?)\s+/gm)]
    .map((match) => match[1]);
  if (JSON.stringify(existingCaseIds) !== JSON.stringify(expectedCaseIds)) {
    throw new Error(`人工审核文件用例集合已变化，禁止覆盖：${filePath}`);
  }
}

function relativeWorkspace(workspaceRoot: string, filePath: string): string {
  return path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
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
  const result = reconcileProductCenterGroupLegacyCases();
  process.stdout.write(`${JSON.stringify({ summary: result.report.summary, jsonPath: result.jsonPath })}\n`);
}
