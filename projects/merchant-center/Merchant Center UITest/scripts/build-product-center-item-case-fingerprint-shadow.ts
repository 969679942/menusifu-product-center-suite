import fs from 'node:fs';
import path from 'node:path';
import { assessCaseFingerprintLineage } from '../utils/case-semantic-fingerprint';
import { parseProductCenterItemCaseSemanticFingerprints } from '../utils/product-center-item-case-semantic-fingerprint';

type LandingCase = {
  caseId: string;
  status: string;
  disposition: string;
  automationBound: boolean;
  caseFingerprint: string | null;
  implementationFingerprint: string | null;
  executionReceipt?: {
    caseFingerprint: string;
    evidenceStatus: string;
    evidencePath: string | null;
  } | null;
};

type CompatibilityCase = {
  caseId: string;
  receiptCount: number;
  completeReceiptCount: number;
  receiptCaseFingerprints: string[];
  evidencePaths: string[];
};

type ShadowClassification =
  | 'safe-lineage-mappable'
  | 'historical-semantic-evidence-insufficient'
  | 'semantic-change-detected'
  | 'current-passed-impact'
  | 'not-bound-deferred-not-applicable';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const outputRoot = path.resolve(workspaceRoot, 'deliverables/test-plan-governance');
const canonicalPath = path.resolve(
  workspaceRoot,
  'Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
);
const landingPath = path.resolve(outputRoot, 'product-center-item-group-landing-audit.json');
const compatibilityPath = path.resolve(outputRoot, 'product-center-historical-receipt-compatibility.json');
const outputJsonPath = path.resolve(outputRoot, 'product-center-item-case-fingerprint-shadow.json');
const outputMarkdownPath = path.resolve(outputRoot, 'product-center-item-case-fingerprint-shadow.md');

const canonicalCases = parseProductCenterItemCaseSemanticFingerprints(canonicalPath);
const landing = readJson<{
  modules: Array<{ module: string; assessment: { cases: LandingCase[] } }>;
}>(landingPath);
const compatibility = readJson<{
  scope: { targetCaseCount: number };
  cases: CompatibilityCase[];
}>(compatibilityPath);
const landingCases = landing.modules.find((item) => item.module === '商品管理-商品')?.assessment.cases ?? [];
const landingById = new Map(landingCases.map((item) => [item.caseId, item]));
const compatibilityById = new Map(compatibility.cases.map((item) => [item.caseId, item]));

if (canonicalCases.length !== 218) throw new Error(`PRODUCT_CENTER_ITEM_SHADOW_TOTAL_INVALID:${canonicalCases.length}`);
if (landingCases.length !== canonicalCases.length) {
  throw new Error(`PRODUCT_CENTER_ITEM_SHADOW_LANDING_COUNT_MISMATCH:${landingCases.length}:${canonicalCases.length}`);
}

const cases = canonicalCases.map((canonical) => {
  const current = landingById.get(canonical.caseId);
  if (!current) throw new Error(`PRODUCT_CENTER_ITEM_SHADOW_LANDING_CASE_MISSING:${canonical.caseId}`);
  const compatibilityItem = compatibilityById.get(canonical.caseId);
  const receiptFingerprints = new Set<string>(compatibilityItem?.receiptCaseFingerprints ?? []);
  if (current.executionReceipt?.caseFingerprint) receiptFingerprints.add(current.executionReceipt.caseFingerprint);
  const allCompatibilityReceiptsComplete = Boolean(compatibilityItem
    && compatibilityItem.receiptCount > 0
    && compatibilityItem.completeReceiptCount === compatibilityItem.receiptCount);
  const lineage = assessCaseFingerprintLineage({
    currentSemanticFingerprint: canonical.fingerprint,
    receipts: [...receiptFingerprints].map((caseFingerprint) => ({
      caseFingerprint,
      semanticFingerprint: null,
      evidenceComplete: current.executionReceipt?.caseFingerprint === caseFingerprint
        ? current.executionReceipt.evidenceStatus === 'complete'
        : allCompatibilityReceiptsComplete,
    })),
  });
  const excluded = !current.automationBound
    || current.status === 'deferred'
    || current.status === 'not-applicable';
  const classification: ShadowClassification = excluded
    ? 'not-bound-deferred-not-applicable'
    : current.status === 'passed'
      ? 'current-passed-impact'
      : lineage.status === 'safe-lineage-mappable'
        ? 'safe-lineage-mappable'
        : lineage.status === 'semantic-change-detected'
          ? 'semantic-change-detected'
          : 'historical-semantic-evidence-insufficient';
  return {
    caseId: canonical.caseId,
    title: canonical.title,
    currentStatus: current.status,
    disposition: current.disposition,
    automationBound: current.automationBound,
    currentEffectiveCaseFingerprint: current.caseFingerprint,
    shadowSemanticFingerprint: canonical.fingerprint,
    implementationFingerprint: current.implementationFingerprint,
    historicalReceiptCount: compatibilityItem?.receiptCount
      ?? (current.executionReceipt ? 1 : 0),
    historicalCompleteReceiptCount: compatibilityItem?.completeReceiptCount
      ?? (current.executionReceipt?.evidenceStatus === 'complete' ? 1 : 0),
    historicalReceiptFingerprints: [...receiptFingerprints].sort(),
    evidencePaths: [...new Set([
      ...(compatibilityItem?.evidencePaths ?? []),
      ...(current.executionReceipt?.evidencePath ? [current.executionReceipt.evidencePath] : []),
    ])].sort(),
    lineageStatus: lineage.status,
    classification,
    reason: classificationReason(classification, lineage.reason),
    switchImpact: current.status === 'passed'
      ? '正式切换会使当前通过收据与新逐用例指纹失配；本次影子模式不产生该影响。'
      : '本次影子模式不修改当前裁决。',
  };
});

const classifications: ShadowClassification[] = [
  'safe-lineage-mappable',
  'historical-semantic-evidence-insufficient',
  'semantic-change-detected',
  'current-passed-impact',
  'not-bound-deferred-not-applicable',
];
const summary = Object.fromEntries(classifications.map((classification) => [
  classification,
  cases.filter((item) => item.classification === classification).length,
]));
const uniqueShadowFingerprints = new Set(cases.map((item) => item.shadowSemanticFingerprint));
if (uniqueShadowFingerprints.size !== cases.length) {
  throw new Error(`PRODUCT_CENTER_ITEM_SHADOW_FINGERPRINT_COLLISION:${uniqueShadowFingerprints.size}:${cases.length}`);
}
if (Object.values(summary).reduce((total, count) => total + count, 0) !== cases.length) {
  throw new Error('PRODUCT_CENTER_ITEM_SHADOW_CLASSIFICATION_NOT_CONSERVED');
}

const report = {
  schemaVersion: '1.0.0',
  collectionId: 'product-center-item-case-fingerprint-shadow',
  generatedAt: new Date().toISOString(),
  scope: {
    applicationId: 'merchant-center',
    module: '商品管理-商品',
    totalCases: cases.length,
    historicalCompatibilityTargetCases: compatibility.scope.targetCaseCount,
  },
  policy: {
    mode: 'shadow-only',
    activeFingerprintReplaced: false,
    executionStateModified: false,
    caseStatusModified: false,
    historicalReceiptModified: false,
    pageExecutionTriggered: false,
    browserExecutionCount: 0,
    migrationRequiresExplicitSemanticLineage: true,
    aggregateReportsAuthorizeLineage: false,
  },
  summary: {
    total: cases.length,
    uniqueShadowFingerprints: uniqueShadowFingerprints.size,
    ...summary,
    currentPassedResultsPreserved: cases.filter((item) => item.currentStatus === 'passed').length,
    currentHandledResultsPreserved: cases.filter((item) => item.currentStatus === 'handled').length,
    recommendedImmediateCutover: false,
  },
  conclusion: '当前历史收据未携带可验证的逐用例语义指纹，不能安全静默迁移；保留现有结果并继续影子模式。',
  cases,
};

fs.mkdirSync(outputRoot, { recursive: true });
writeJson(outputJsonPath, report);
fs.writeFileSync(outputMarkdownPath, renderMarkdown(report), 'utf8');
process.stdout.write(`${JSON.stringify({ outputJsonPath, summary: report.summary }, null, 2)}\n`);

function classificationReason(classification: ShadowClassification, lineageReason: string): string {
  if (classification === 'current-passed-impact') {
    return '当前完整通过收据使用旧方案级指纹；直接切换会错误使有效结果失配，必须保持影子状态。';
  }
  if (classification === 'not-bound-deferred-not-applicable') {
    return '未绑定、延期或不适用用例不参与本轮历史通过迁移。';
  }
  if (classification === 'historical-semantic-evidence-insufficient') {
    return `历史证据不能证明旧方案级指纹与当前逐用例语义等价：${lineageReason}`;
  }
  if (classification === 'semantic-change-detected') return '已有显式历史语义指纹与当前语义不同，必须重验而不是迁移。';
  return '完整历史收据具有与当前逐用例语义一致的显式指纹，可建立谱系。';
}

function renderMarkdown(value: typeof report): string {
  return [
    '# 商品用例逐用例指纹影子迁移报告',
    '',
    `- 正式用例：${value.scope.totalCases} 条`,
    `- 历史协调目标：${value.scope.historicalCompatibilityTargetCases} 条`,
    `- 新逐用例指纹：${value.summary.uniqueShadowFingerprints} 个（无共享、无碰撞）`,
    `- 可安全建立谱系：${value.summary['safe-lineage-mappable']} 条`,
    `- 历史语义证据不足：${value.summary['historical-semantic-evidence-insufficient']} 条`,
    `- 检出明确语义变化：${value.summary['semantic-change-detected']} 条`,
    `- 当前通过结果切换影响：${value.summary['current-passed-impact']} 条`,
    `- 未绑定/延期/不适用：${value.summary['not-bound-deferred-not-applicable']} 条`,
    '- 页面执行：0 次',
    '- 当前指纹、执行状态、历史收据：均未修改',
    '',
    '## 结论',
    '',
    value.conclusion,
    '',
    '| 用例ID | 当前状态 | 当前指纹 | 影子逐用例指纹 | 历史收据 | 分类 |',
    '| --- | --- | --- | --- | ---: | --- |',
    ...value.cases.map((item) => `| ${item.caseId} | ${item.currentStatus} | ${short(item.currentEffectiveCaseFingerprint)} | ${short(item.shadowSemanticFingerprint)} | ${item.historicalReceiptCount} | ${item.classification} |`),
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
