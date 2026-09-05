import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterRemainingScenarioReport,
  type ProductCenterCaseStepTrace,
  type ProductCenterCleanupEvidence,
  type ProductCenterPageObservationEvidence,
  type ProductCenterRemainingScenarioReport,
} from '../utils/product-center-remaining-scenario-execution';
import {
  buildProductCenterUnifiedAudit,
  type ProductCenterAuditCandidate,
} from '../utils/product-center-unified-audit-source';

const projectRoot = path.resolve(__dirname, '..');
const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info', '00-待转换测试方案');
const defaultSources = [
  path.join(infoRoot, '用例库', '商品中心-商品管理-商品', '1.商品中心-商品管理-商品-正式测试用例.md'),
  path.join(infoRoot, '来源资料', '商品中心-商品管理-商品', '1.商品中心-商品管理-商品-重建试点.xmind'),
];
const outputRoot = path.join(projectRoot, 'deliverables', 'product-center-audit', 'remaining-scenarios');

export function buildProductCenterRemainingScenarioExecution(options: {
  candidates: readonly ProductCenterAuditCandidate[];
  generatedAt?: string;
  pageObservation?: ProductCenterPageObservationEvidence;
  cleanupEvidenceByCaseId?: Readonly<Record<string, ProductCenterCleanupEvidence>>;
  negativeCoverageDecision?: 'complete' | 'partial' | 'unknown';
  sourceFingerprint?: string;
  xmindMaxSegmentSize?: number;
}): {
  report: ProductCenterRemainingScenarioReport;
  traces: ProductCenterCaseStepTrace[];
  xmind: ReturnType<typeof buildProductCenterRemainingScenarioReport>['xmind'];
} {
  return buildProductCenterRemainingScenarioReport(options);
}

function main(): void {
  const sources = process.argv.filter((argument) => argument.startsWith('--source='))
    .map((argument) => argument.slice('--source='.length));
  const selectedSources = sources.length > 0 ? sources : defaultSources;
  const generatedAt = new Date().toISOString();
  const audit = buildProductCenterUnifiedAudit({
    sources: selectedSources,
    projectRoot,
    allowedRoots: [infoRoot],
    generatedAt,
  });
  const pageObservationPath = argumentValue('--page-observation');
  const pageObservation = pageObservationPath
    ? readJson<ProductCenterPageObservationEvidence>(pageObservationPath)
    : undefined;
  const cleanupPath = argumentValue('--cleanup-evidence');
  const cleanupEvidenceByCaseId = cleanupPath
    ? readJson<Record<string, ProductCenterCleanupEvidence>>(cleanupPath)
    : undefined;
  const result = buildProductCenterRemainingScenarioExecution({
    candidates: audit.candidates,
    generatedAt,
    pageObservation,
    cleanupEvidenceByCaseId,
    negativeCoverageDecision: argumentValue('--negative-coverage') as 'complete' | 'partial' | 'unknown' | undefined,
    sourceFingerprint: audit.sources.map((source) => `${source.sourceId}:${source.fingerprint ?? 'none'}`).join('|'),
    xmindMaxSegmentSize: numberArgument('--xmind-segment-size') ?? 250,
  });
  fs.mkdirSync(path.join(outputRoot, 'xmind-segments'), { recursive: true });
  writeJson(path.join(outputRoot, 'product-center-remaining-scenarios-execution.json'), result.report);
  writeJson(path.join(outputRoot, 'product-center-case-step-traces.json'), {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-case-step-traces',
    generatedAt,
    sourceFingerprint: result.report.sourceFingerprint,
    traces: result.traces,
  });
  writeJson(path.join(outputRoot, 'product-center-xmind-segment-manifest.json'), {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-xmind-segment-manifest',
    generatedAt,
    sourceFingerprint: result.report.sourceFingerprint,
    ...result.xmind,
  });
  for (const segment of result.xmind.segments) {
    writeJson(path.join(outputRoot, 'xmind-segments', `${safeFileName(segment.segmentId)}.json`), segment);
  }
  writeJson(path.join(outputRoot, 'product-center-remaining-scenarios-checkpoint.json'), {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-remaining-scenarios-checkpoint',
    generatedAt,
    phase: 'completed-static-evidence-coordination',
    sourceFingerprint: result.report.sourceFingerprint,
    completedWorkUnits: ['source-intake', 'step-trace', 'negative-scenario-discovery', 'xmind-segmentation', 'failure-taxonomy', 'authenticated-page-observation', 'technical-binding-gap-matrix', 'page-contract-static-refresh'],
    unresolvedWorkUnits: ['live-release-evidence-refresh', 'case-scoped-page-observation', 'context-evidence', 'data-factory-and-cleanup-receipts', 'execution-grant', 'business-execution'],
    executionAllowed: false,
    businessMutationAllowed: false,
    nextResumePoint: 'live-release-evidence-or-explicit-execution-grant',
  });
  writeText(path.join(outputRoot, 'product-center-remaining-scenarios-execution.md'), renderMarkdown(result.report));
  process.stdout.write(`商品中心剩余场景执行检查：resolved=${result.report.summary.resolved};partial=${result.report.summary.partial};blocked=${result.report.summary.blocked};businessExecution=false\n`);
  process.stdout.write(`报告：${path.join(outputRoot, 'product-center-remaining-scenarios-execution.json')}\n`);
}

function renderMarkdown(report: ProductCenterRemainingScenarioReport): string {
  return [
    '# 商品中心剩余场景执行检查',
    '',
    `- 状态：${report.status}`,
    `- 生成时间：${report.generatedAt}`,
    `- 来源指纹：${report.sourceFingerprint}`,
    '- 业务执行：否（本产物只做证据协调，不签发 execution grant）',
    `- 结果：resolved=${report.summary.resolved}，partial=${report.summary.partial}，blocked=${report.summary.blocked}`,
    '',
    '## 场景结果',
    '',
    ...report.scenarios.map((scenario) => `- ${scenario.id} ${scenario.name}：${scenario.status}；${scenario.reason}；下一步：${scenario.nextActions.join('、')}`),
    '',
    '## 追踪与分段',
    '',
    `- 逐步追踪：${report.traceSummary.candidateCount} candidates，${report.traceSummary.stepCount} steps，未绑定 ${report.traceSummary.unboundStepCount} steps，动作/预期数量冲突 ${report.traceSummary.mismatchCaseCount} cases。`,
    `- XMind：${report.xmindSummary.candidateCount} candidates，${report.xmindSummary.segmentCount} segments，最大段 ${report.xmindSummary.maxSegmentSize}。`,
    '',
    '## 影响',
    '',
    '- 既有通过结果：不重跑、不失效。',
    '- 正式用例和索引：不修改。',
    '- 业务写操作：不执行；没有完整数据和清理收据的用例不能进入执行授权。',
    '',
  ].join('\n');
}

function argumentValue(name: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function numberArgument(name: string): number | undefined {
  const value = argumentValue(name);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} 必须是正整数`);
  return parsed;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(projectRoot, filePath), 'utf8')) as T;
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

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

if (require.main === module) main();
