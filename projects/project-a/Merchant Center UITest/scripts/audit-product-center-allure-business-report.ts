import fs from 'node:fs';
import path from 'node:path';
import {
  auditAllureBusinessReport,
  type AllureBusinessReportResult,
  type AllureReportStep,
} from '../../../Test Automation Platform/src/reporters/allure-report-integrity';
import { createMerchantCenterAllureIntegrityPolicy } from '../adapters/test-automation-platform/allure-reporting';

type CoverageAudit = {
  summary: { total: number; actualResultCases: number; notRun: number };
  cases: Array<{ caseId: string; executionStatus: string; governanceStatus: string }>;
};

type ReadabilityFinding = {
  caseId: string;
  code: string;
  message: string;
};

type ResultDocument = AllureBusinessReportResult & {
  name?: string;
  labels?: Array<{ name?: string; value?: string }>;
};

function main(): void {
  const resultsDir = path.resolve(readArg('--results'));
  const coveragePath = path.resolve(readArg('--coverage-audit'));
  const outputPath = path.resolve(readArg('--output'));
  const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8')) as CoverageAudit;
  const results = fs.readdirSync(resultsDir)
    .filter((name) => name.endsWith('-result.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(resultsDir, name), 'utf8')) as ResultDocument);
  const findings: ReadabilityFinding[] = [];
  const seen = new Set<string>();
  let fiveLayerCases = 0;
  let inlineExpectedActualCases = 0;
  let rootAttachmentCases = 0;
  let failedScreenshotBoundCases = 0;

  for (const result of results) {
    const caseId = findCaseId(result) ?? `UNKNOWN:${result.name ?? '未命名用例'}`;
    if (seen.has(caseId)) add(findings, caseId, 'DUPLICATE_CASE_RESULT', '同一 caseId 出现多条当前结果。');
    seen.add(caseId);
    for (const attachment of collectAttachments(result)) {
      if (typeof attachment.source !== 'string' || !attachment.source.trim()) continue;
      const sourcePath = path.resolve(resultsDir, attachment.source);
      if (!sourcePath.startsWith(`${path.resolve(resultsDir)}${path.sep}`) || !fs.existsSync(sourcePath)) {
        add(findings, caseId, 'ATTACHMENT_SOURCE_MISSING', `步骤附件引用的文件不存在：${attachment.source}`);
      }
    }
    const topLevelNames = (result.steps ?? []).map((step) => step.name ?? '');
    const technicalSuiteLabels = (result.labels ?? []).filter((label) => label.name === 'subSuite');
    if (technicalSuiteLabels.length > 0) {
      add(findings, caseId, 'TECHNICAL_SUB_SUITE', `存在不应展示的技术分组字段 subSuite：${technicalSuiteLabels.map((label) => label.value).join('、')}`);
    }
    const assertionLayer = (result.steps ?? []).find((step) => step.name?.startsWith('[断言]'));
    const operationLayer = (result.steps ?? []).find((step) => step.name?.startsWith('[业务操作]'));
    const conclusionLayer = (result.steps ?? []).find((step) => step.name?.startsWith('执行结论：'));
    if (conclusionLayer && conclusionLayer.status !== result.status) {
      add(findings, caseId, 'CONCLUSION_STATUS_MISMATCH', '执行结论状态与用例结果状态不一致。');
    }
    const flattenedNames = flattenSteps(result.steps ?? []).map((step) => step.name ?? '');
    if (flattenedNames.some((name) => name === 'Unknown' || name === 'unknown')) {
      add(findings, caseId, 'UNKNOWN_STEP_TITLE', '报告包含 Unknown 步骤，无法说明业务动作。');
    }
    if (result.status === 'passed' && flattenedNames.some((name) => /证据不完整|收据未生成|收据未验证/.test(name))) {
      add(findings, caseId, 'PASSED_EVIDENCE_INCOMPLETE', '用例状态为通过，但步骤仍标记证据不完整或收据未验证。');
    }
    const requiredLayers = [
      ['[环境]', topLevelNames.some((name) => name.startsWith('[环境]'))],
      ['[业务操作]', topLevelNames.some((name) => name.startsWith('[业务操作]'))],
      ['[断言]', topLevelNames.some((name) => name.startsWith('[断言]'))],
      ['[清理]', topLevelNames.some((name) => name.startsWith('[清理]'))],
      ['执行结论', topLevelNames.some((name) => name.startsWith('执行结论：'))],
    ] as const;
    const missingLayers = requiredLayers.filter(([, present]) => !present).map(([name]) => name);
    if (missingLayers.length === 0) fiveLayerCases += 1;
    else add(findings, caseId, 'MISSING_REPORT_LAYER', `缺少报告层级：${missingLayers.join('、')}`);

    const assertionNames = flattenSteps((result.steps ?? []).filter((step) => step.name?.startsWith('[断言]')))
      .map((step) => step.name ?? '');
    if (assertionNames.some((name) => name.includes('期望：') && name.includes('实际：'))) {
      inlineExpectedActualCases += 1;
    } else {
      add(findings, caseId, 'MISSING_INLINE_EXPECTED_ACTUAL', '断言步骤未同行展示期望值与实际值。');
    }

    if ((result.attachments?.length ?? 0) > 0) {
      rootAttachmentCases += 1;
      add(findings, caseId, 'ROOT_ATTACHMENT', '存在未绑定到业务步骤的根附件。');
    }
    const failureScreenshots = flattenSteps(result.steps ?? [])
      .filter((step) => (step.attachments ?? []).some((attachment) => /失败截图|screenshot|test-failed/i.test(attachment.name ?? '')));
    if (failureScreenshots.length > 0 && failureScreenshots.every((step) => step.status === 'failed')) {
      failedScreenshotBoundCases += 1;
    } else if (failureScreenshots.length > 0) {
      add(findings, caseId, 'FAILURE_SCREENSHOT_NOT_BOUND_TO_FAILED_STEP', '失败截图未全部绑定到实际失败步骤。');
    }
    if (!caseId.startsWith('TC-FLV-') && /PRODUCT-DEFECT/.test(String(result.statusDetails?.message ?? ''))) {
      const conclusionSummary = (conclusionLayer?.steps ?? []).map((step) => step.name ?? '').join(' ');
      if (operationLayer?.status !== 'passed' || assertionLayer?.status !== 'failed') {
        add(findings, caseId, 'MISMATCH_LAYER_STATUS_INVALID', '产品差异必须表现为业务操作通过、断言失败。');
      }
      if (!/断言收据 [1-9]\d* 条/.test(conclusionSummary) || !/证据完整/.test(conclusionSummary)) {
        add(findings, caseId, 'MISMATCH_RECEIPT_SUMMARY_INVALID', '产品差异结论必须显示 mismatch 断言收据且证据完整。');
      }
    }
    for (const finding of auditAllureBusinessReport(result, createMerchantCenterAllureIntegrityPolicy())) {
      add(findings, caseId, finding.code, `${finding.message} 位置：${finding.path}`);
    }
  }

  const notRunCases = coverage.cases.filter((item) => item.executionStatus === 'not-run');
  if (coverage.summary.total !== results.length + notRunCases.length) {
    add(findings, 'COVERAGE', 'COVERAGE_COUNT_MISMATCH', `总数 ${coverage.summary.total} != 实际结果 ${results.length} + 非执行分类 ${notRunCases.length}`);
  }
  const report = {
    schemaVersion: '1.0.0',
    reportId: 'merchant-center-product-center-allure-business-readability',
    generatedAt: new Date().toISOString(),
    status: findings.length === 0 ? 'pass' : 'incomplete',
    summary: {
      expectedCases: coverage.summary.total,
      actualResultCases: results.length,
      classifiedNotRunCases: notRunCases.length,
      passedCases: results.filter((result) => result.status === 'passed').length,
      failedCases: results.filter((result) => result.status === 'failed').length,
      uniqueCaseIds: seen.size,
      fiveLayerCases,
      inlineExpectedActualCases,
      rootAttachmentCases,
      failedScreenshotBoundCases,
      findings: findings.length,
    },
    classifiedNotRun: notRunCases,
    findings: findings.sort((left, right) => left.caseId.localeCompare(right.caseId) || left.code.localeCompare(right.code)),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputPath.replace(/\.json$/i, '.md'), renderMarkdown(report), 'utf8');
  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n审计结果：${outputPath}\n`);
  if (findings.length > 0 && process.argv.includes('--strict')) process.exitCode = 1;
}

function findCaseId(result: ResultDocument): string | undefined {
  return result.labels?.find((label) => label.name === 'caseId')?.value
    ?? result.labels?.find((label) => label.name === 'tag' && label.value?.startsWith('case-'))?.value?.slice(5);
}

function flattenSteps(steps: readonly AllureReportStep[]): AllureReportStep[] {
  return steps.flatMap((step) => [step, ...flattenSteps(step.steps ?? [])]);
}

function collectAttachments(value: unknown): Array<{ name?: string; source?: string }> {
  if (Array.isArray(value)) return value.flatMap(collectAttachments);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const own = Array.isArray(record.attachments)
    ? record.attachments.filter((item): item is { name?: string; source?: string } => Boolean(item && typeof item === 'object'))
    : [];
  return [...own, ...Object.values(record).flatMap(collectAttachments)];
}

function add(findings: ReadabilityFinding[], caseId: string, code: string, message: string): void {
  findings.push({ caseId, code, message });
}

function renderMarkdown(report: {
  status: string;
  summary: Record<string, number>;
  classifiedNotRun: Array<{ caseId: string; governanceStatus: string }>;
  findings: ReadabilityFinding[];
}): string {
  const lines = [
    '# 商品中心 Allure 业务可读性审计',
    '',
    `- 状态：${report.status}`,
    ...Object.entries(report.summary).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '## 非执行分类',
    ...report.classifiedNotRun.map((item) => `- ${item.caseId}: ${item.governanceStatus}`),
    '',
    '## 整改项',
    ...(report.findings.length === 0
      ? ['- 无']
      : report.findings.map((finding) => `- ${finding.caseId} | ${finding.code} | ${finding.message}`)),
    '',
  ];
  return lines.join('\n');
}

function readArg(name: string): string {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`缺少参数：${name}=...`);
  return value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) main();
