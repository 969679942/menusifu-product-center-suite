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
  const outputDirectory = path.join(projectRoot, 'output/owner');
  const jsonPath = path.join(outputDirectory, 'product-center-owner-summary.json');
  const markdownPath = path.join(outputDirectory, 'product-center-owner-summary.md');
  const requiredInputs = [
    'output/recipes/product-center-pilot-acceptance.json',
    'output/recipes/product-center-test-plan-gold-set-acceptance.json',
    'output/recipes/product-center-approved-technical-bindings-acceptance.json',
    'output/recipes/product-center-acceptance-trend.json',
    'output/failure-analysis/product-center-failure-analysis.json',
    'output/page-contract/product-center-page-contract-diff.json',
    'output/page-contract/product-center-page-contract-impact.json',
    'output/page-contract/product-center-drift-lab.json',
    'output/maintenance/product-center-controlled-repair-approval-gate.json',
    'output/governance/product-center-artifact-governance.json',
    'output/test-case-audit/product-center/quality-program-latest.json',
    'contracts/product-center/reviews/unsupported-source-format-decisions.json',
  ];
  const missingInputs = requiredInputs.filter((relativePath) => !fs.existsSync(path.join(projectRoot, relativePath)));
  if (missingInputs.length > 0) {
    const summary = buildBlockedOwnerSummary({
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      missingInputs,
    });
    fs.mkdirSync(outputDirectory, { recursive: true });
    writeAtomic(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
    writeAtomic(markdownPath, renderBlockedOwnerSummaryMarkdown(summary));
    return { jsonPath, markdownPath, summary };
  }
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
  fs.mkdirSync(outputDirectory, { recursive: true });
  writeAtomic(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  writeAtomic(markdownPath, renderProductCenterOwnerSummaryMarkdown(summary));
  return { jsonPath, markdownPath, summary };
}

function buildBlockedOwnerSummary(input: { generatedAt: string; missingInputs: string[] }) {
  return {
    schemaVersion: '1.0.0' as const,
    generatedAt: input.generatedAt,
    status: 'blocked' as const,
    technicalReady: false,
    automationPlatformReady: false,
    testGenerationProductReady: false,
    blockers: [{ code: 'OWNER_SUMMARY_INPUT_MISSING', detail: `缺少 ${input.missingInputs.length} 个 report-only 输入` }],
    actions: [],
    actionSummary: { total: 0, P0: 0, P1: 0, P2: 0 },
    missingInputs: input.missingInputs,
    businessExecutionStarted: false,
    existingPassedCasesInvalidated: false,
  };
}

function renderBlockedOwnerSummaryMarkdown(summary: ReturnType<typeof buildBlockedOwnerSummary>): string {
  return [
    '# 商品中心质量总览',
    '',
    `状态：${summary.status}`,
    '技术就绪：false',
    '',
    '## 阻断',
    '',
    '| 代码 | 详情 |',
    '| --- | --- |',
    `| OWNER_SUMMARY_INPUT_MISSING | ${summary.blockers[0].detail} |`,
    '',
    '## 缺失输入',
    '',
    ...summary.missingInputs.map((item) => `- ${item}`),
    '',
    '业务执行：false；既有通过用例：未失效。',
    '',
  ].join('\n');
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
