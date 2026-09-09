import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterRemainingTechnicalBindingGap,
  renderProductCenterRemainingTechnicalBindingGapMarkdown,
} from '../utils/product-center-remaining-technical-binding-gap';
import { buildProductCenterUnifiedAudit } from '../utils/product-center-unified-audit-source';
import type { ProductCenterCaseStepTrace, ProductCenterPageObservationEvidence } from '../utils/product-center-remaining-scenario-execution';

const projectRoot = path.resolve(__dirname, '..');
const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info', '00-待转换测试方案');
const outputRoot = path.join(projectRoot, 'deliverables', 'product-center-audit', 'remaining-scenarios');
const defaultSources = [
  path.join(infoRoot, '用例库', '商品中心-商品管理-商品', '1.商品中心-商品管理-商品-正式测试用例.md'),
  path.join(infoRoot, '来源资料', '商品中心-商品管理-商品', '1.商品中心-商品管理-商品-重建试点.xmind'),
];

export function buildProductCenterRemainingTechnicalBindingGapArtifacts(options: {
  generatedAt?: string;
  pageObservationPath?: string;
  pageContractPath?: string;
} = {}) {
  const audit = buildProductCenterUnifiedAudit({
    sources: defaultSources,
    projectRoot,
    allowedRoots: [infoRoot],
    generatedAt: options.generatedAt,
  });
  const traces = readJson<{ traces: ProductCenterCaseStepTrace[] }>(path.join(outputRoot, 'product-center-case-step-traces.json'));
  const pageObservation = readOptionalJson<ProductCenterPageObservationEvidence>(path.resolve(projectRoot, options.pageObservationPath ?? 'deliverables/product-center-audit/remaining-scenarios/product-center-page-observation-evidence.json'));
  const pageContract = readOptionalJson<{ status?: string; summary?: { blockingFindings?: number }; fingerprint?: string }>(path.resolve(projectRoot, options.pageContractPath ?? 'output/page-contract/product-center-page-contract-observation.json'));
  const document = buildProductCenterRemainingTechnicalBindingGap({
    candidates: audit.candidates,
    traces: traces.traces,
    pageObservation,
    pageContract,
    sourceFingerprint: audit.sources.map((source) => `${source.sourceId}:${source.fingerprint ?? 'none'}`).join('|'),
    generatedAt: options.generatedAt,
  });
  const jsonPath = path.join(outputRoot, 'product-center-remaining-technical-binding-gap.json');
  const markdownPath = path.join(outputRoot, 'product-center-remaining-technical-binding-gap.md');
  writeJson(jsonPath, document);
  writeText(markdownPath, renderProductCenterRemainingTechnicalBindingGapMarkdown(document));
  return { document, jsonPath, markdownPath };
}

function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function readOptionalJson<T>(filePath: string): T | undefined { return fs.existsSync(filePath) ? readJson<T>(filePath) : undefined; }
function writeJson(filePath: string, value: unknown): void { writeText(filePath, `${JSON.stringify(value, null, 2)}\n`); }
function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  const result = buildProductCenterRemainingTechnicalBindingGapArtifacts();
  process.stdout.write(`商品中心剩余场景技术绑定缺口已生成：${result.jsonPath}\n`);
  process.stdout.write(`候选=${result.document.summary.candidateCount};稳定caseId=${result.document.summary.stableCaseIdCount};阻断=${result.document.summary.blockedCount};正式执行=false\n`);
}
