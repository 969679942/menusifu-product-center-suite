import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterOwnerSummary,
  renderProductCenterOwnerSummaryMarkdown,
  type ProductCenterOwnerSummaryInput,
} from '../utils/product-center-owner-summary';
import { readLatestProductCenterPipelineReport } from '../utils/product-center-pipeline-artifacts';

export function buildProductCenterOwnerSummaryArtifacts(options: {
  projectRoot?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const input: ProductCenterOwnerSummaryInput = {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    pipeline: readLatestProductCenterPipelineReport(projectRoot),
    mainAcceptance: readJson(projectRoot, 'output/recipes/product-center-pilot-acceptance.json'),
    goldAcceptance: readJson(
      projectRoot,
      'output/recipes/product-center-test-plan-gold-set-acceptance.json',
    ),
    approvedAcceptance: readJson(
      projectRoot,
      'output/recipes/product-center-approved-technical-bindings-acceptance.json',
    ),
    trend: readJson(projectRoot, 'output/recipes/product-center-acceptance-trend.json'),
    failureAnalysis: readJson(
      projectRoot,
      'output/failure-analysis/product-center-failure-analysis.json',
    ),
    pageContractDiff: readJson(
      projectRoot,
      'output/page-contract/product-center-page-contract-diff.json',
    ),
    pageContractImpact: readJson(
      projectRoot,
      'output/page-contract/product-center-page-contract-impact.json',
    ),
    driftLab: readJson(
      projectRoot,
      'output/page-contract/product-center-drift-lab.json',
    ),
    approvalGate: readJson(
      projectRoot,
      'output/maintenance/product-center-controlled-repair-approval-gate.json',
    ),
    closure: readOptionalJson(
      projectRoot,
      'output/maintenance/product-center-controlled-repair-closure.json',
    ),
    governance: readJson(
      projectRoot,
      'output/governance/product-center-artifact-governance.json',
    ),
    quality: readJson(
      projectRoot,
      'output/test-case-audit/product-center/quality-program-latest.json',
    ),
    sourceDecisions: readJson(
      projectRoot,
      'contracts/product-center/reviews/unsupported-source-format-decisions.json',
    ),
  };
  const summary = buildProductCenterOwnerSummary(input);
  const outputDirectory = path.join(projectRoot, 'output/owner');
  const jsonPath = path.join(outputDirectory, 'product-center-owner-summary.json');
  const markdownPath = path.join(outputDirectory, 'product-center-owner-summary.md');
  fs.mkdirSync(outputDirectory, { recursive: true });
  writeAtomic(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  writeAtomic(markdownPath, renderProductCenterOwnerSummaryMarkdown(summary));
  return { jsonPath, markdownPath, summary };
}

function readJson<T>(projectRoot: string, relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')) as T;
}

function readOptionalJson<T>(projectRoot: string, relativePath: string): T | null {
  const filePath = path.join(projectRoot, relativePath);
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) as T : null;
}

function writeAtomic(filePath: string, content: string): void {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const result = buildProductCenterOwnerSummaryArtifacts();
    process.stdout.write(`商品中心负责人摘要：${result.jsonPath}\n状态：${result.summary.status}\n`);
    if (!result.summary.technicalReady) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
