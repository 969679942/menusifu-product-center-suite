import fs from 'node:fs';
import path from 'node:path';
import { TestExecutionIndex } from '../utils/test-execution-index';
import { resolveSystemTestPlatformArtifact } from '../utils/system-test-platform-paths';

type LandingCase = {
  caseId: string;
  title: string;
  status: string;
  disposition: string;
  automationBound: boolean;
  caseFingerprint: string | null;
  semanticCaseFingerprint?: string | null;
  implementationFingerprint?: string | null;
  fingerprintMatchMode?: 'effective' | 'semantic';
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const outputRoot = path.resolve(workspaceRoot, 'deliverables/test-plan-governance');
const landingPath = path.resolve(outputRoot, 'product-center-item-group-landing-audit.json');
const outputJsonPath = path.resolve(outputRoot, 'product-center-item-dual-fingerprint-migration.json');
const outputMarkdownPath = path.resolve(outputRoot, 'product-center-item-dual-fingerprint-migration.md');
const landing = readJson<{
  modules: Array<{ module: string; assessment: { cases: LandingCase[] } }>;
}>(landingPath);
const itemCases = landing.modules.find((item) => item.module === '商品管理-商品')?.assessment.cases ?? [];
if (itemCases.length !== 218) throw new Error(`PRODUCT_CENTER_ITEM_DUAL_FINGERPRINT_TOTAL_INVALID:${itemCases.length}`);
const records = new TestExecutionIndex(resolveSystemTestPlatformArtifact('execution-index.json')).snapshot().records;
const recordsByCaseId = new Map<string, typeof records>();
for (const record of records) {
  recordsByCaseId.set(record.caseId, [...(recordsByCaseId.get(record.caseId) ?? []), record]);
}
const excludedStatuses = new Set(['deferred', 'not-applicable', 'blocked-source', 'blocked-technical']);
const requiredCases = itemCases.filter((item) => item.automationBound && !excludedStatuses.has(item.status));
const semanticReadyIds = new Set(requiredCases.filter((item) => /^[a-f0-9]{64}$/i.test(item.semanticCaseFingerprint ?? '')).map((item) => item.caseId));
const assessedById = new Map(requiredCases.map((item) => [item.caseId, {
  status: semanticReadyIds.has(item.caseId) ? 'eligible' : 'awaiting-semantic-fingerprint',
  reason: semanticReadyIds.has(item.caseId) ? 'current-semantic-fingerprint-is-authoritative' : 'current-semantic-fingerprint-missing',
}]));
const cases = itemCases.map((item) => {
  const transition = assessedById.get(item.caseId) ?? {
    status: 'excluded',
    reason: 'case-is-not-required-for-semantic-cutover',
  };
  return {
    caseId: item.caseId,
    title: item.title,
    currentStatus: item.status,
    disposition: item.disposition,
    activeFingerprintMode: item.fingerprintMatchMode ?? 'semantic',
    effectiveCaseFingerprint: item.caseFingerprint,
    semanticCaseFingerprint: item.semanticCaseFingerprint ?? null,
    implementationFingerprint: item.implementationFingerprint ?? null,
    transitionStatus: transition.status,
    transitionReason: transition.reason,
    nextAction: nextAction(transition.status),
    receiptCount: (recordsByCaseId.get(item.caseId) ?? []).length,
    legacyReceiptCount: (recordsByCaseId.get(item.caseId) ?? [])
      .filter((record) => !record.semanticCaseFingerprint).length,
  };
});
const report = {
  schemaVersion: '1.0.0',
  collectionId: 'product-center-item-dual-fingerprint-migration',
  generatedAt: new Date().toISOString(),
  scope: {
    applicationId: 'merchant-center',
    module: '商品管理-商品',
    totalCases: cases.length,
    requiredForCutover: requiredCases.length,
  },
  policy: {
    activeFingerprintMode: 'semantic',
    legacyEffectiveFingerprintField: 'caseFingerprint',
    receiptVersionForNewRuns: '4.0.0',
    legacyReceiptCompatible: true,
    semanticFingerprintRequiredForNewReceipt: true,
    dualFingerprintTransition: 'deprecated',
    naturalRevalidationOnly: true,
    automaticRerun: false,
    automaticApproval: false,
    pageExecutionTriggered: false,
    browserExecutionCount: 0,
    existingPassedResultsInvalidated: false,
    cutoverRequiresAllRequiredCasesEligible: true,
  },
  summary: {
    total: cases.length,
    requiredForCutover: requiredCases.length,
    eligible: semanticReadyIds.size,
    'awaiting-semantic-fingerprint': requiredCases.length - semanticReadyIds.size,
    'awaiting-dual-receipt': 0,
    'semantic-mismatch': 0,
    'implementation-mismatch': 0,
    excluded: cases.length - requiredCases.length,
    currentPassedResultsPreserved: cases.filter((item) => item.currentStatus === 'passed').length,
    currentHandledResultsPreserved: cases.filter((item) => item.currentStatus === 'handled').length,
    legacyReceiptsWithoutSemanticFingerprint: cases.reduce((total, item) => total + (item.legacyReceiptCount ?? 0), 0),
    dualFingerprintReceipts: 0,
    cutoverReady: semanticReadyIds.size === requiredCases.length,
  },
  conclusion: semanticReadyIds.size === requiredCases.length
    ? '已切换为单一语义用例指纹；旧生效指纹仅作历史追溯，不能参与当前裁决或过滤。'
    : '单一语义指纹仍有缺失，保持未完成；不以双指纹收据作为切换条件。',
  cases,
};
fs.mkdirSync(outputRoot, { recursive: true });
writeJson(outputJsonPath, report);
fs.writeFileSync(outputMarkdownPath, renderMarkdown(report), 'utf8');
process.stdout.write(`${JSON.stringify({ outputJsonPath, summary: report.summary }, null, 2)}\n`);

function nextAction(status: string): string {
  if (status === 'eligible') return '无需重跑；保留为正式切换合格证据。';
  if (status === 'excluded') return '保持当前延期、不适用或未绑定决策。';
  if (status === 'semantic-mismatch') return '存在明确语义变化时才进入增量重验，不得静默迁移。';
  if (status === 'implementation-mismatch') return '等待该用例因实现变化进入受控增量重验。';
  return '等待该用例下一次正常或真实变化触发的执行生成3.2双指纹收据；不为迁移单独重跑。';
}

function renderMarkdown(value: typeof report): string {
  return [
    '# 商品用例双指纹迁移进度',
    '',
    `- 正式用例：${value.summary.total} 条`,
    `- 正式切换分母：${value.summary.requiredForCutover} 条`,
    `- 已具备切换资格：${value.summary.eligible} 条`,
    `- 缺少语义指纹：${value.summary['awaiting-semantic-fingerprint']} 条`,
    `- 语义不匹配：${value.summary['semantic-mismatch']} 条`,
    `- 实现不匹配：${value.summary['implementation-mismatch']} 条`,
    `- 排除项：${value.summary.excluded} 条`,
    `- 当前通过结果保留：${value.summary.currentPassedResultsPreserved} 条`,
    `- 当前已处理结果保留：${value.summary.currentHandledResultsPreserved} 条`,
    '- 自动重跑：否；页面执行：0 次',
    `- 正式切换门禁：${value.summary.cutoverReady ? '已满足' : '未满足'}`,
    '',
    '## 结论',
    '',
    value.conclusion,
    '',
    '| 用例ID | 当前状态 | 旧生效指纹(历史) | 语义指纹(权威) | 迁移状态 | 后续动作 |',
    '| --- | --- | --- | --- | ---: | --- | --- |',
    ...value.cases.map((item) => `| ${item.caseId} | ${item.currentStatus} | ${short(item.effectiveCaseFingerprint)} | ${short(item.semanticCaseFingerprint)} | ${item.transitionStatus} | ${item.nextAction} |`),
    '',
  ].join('\n');
}

function short(value: string | null): string {
  return value ? value.slice(0, 12) : '-';
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
