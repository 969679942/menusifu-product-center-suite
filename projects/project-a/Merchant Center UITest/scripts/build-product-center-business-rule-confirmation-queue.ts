import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ProductCenterBusinessRuleScenario } from './build-product-center-business-rule-scenario-coverage';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const outputRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const outputJsonPath = path.join(outputRoot, 'product-center-business-rule-confirmation-queue.json');
const outputMarkdownPath = path.join(outputRoot, 'product-center-business-rule-confirmation-queue.md');
const scenarioCoveragePath = path.join(outputRoot, 'product-center-business-rule-scenario-coverage.json');

export function buildProductCenterBusinessRuleConfirmationQueue() {
  const coverage = JSON.parse(fs.readFileSync(scenarioCoveragePath, 'utf8')) as {
    fingerprint: string;
    scenarios: ProductCenterBusinessRuleScenario[];
  };
  const items = coverage.scenarios
    .filter((item) => item.category === 'product-behavior' && (item.status === 'not-defined' || item.status === 'partially-covered'))
    .map((item) => ({
      confirmationId: `business-rule-confirmation:${item.scenarioId}`,
      scenarioId: item.scenarioId,
      ruleId: item.ruleIds[0] ?? null,
      operation: item.operation,
      currentStatus: 'awaiting-source-or-human-confirmation' as const,
      question: questionFor(item.ruleIds[0] ?? '', item.operation, item.note),
      sourceRefs: item.sourceRefs,
      linkedCaseIds: item.caseIds,
      gapCode: item.gapCode ?? 'SCENARIO_COVERAGE_REVIEW_REQUIRED',
      impactIfConfirmed: {
        formalRuleSemanticChangePossible: true,
        ruleFingerprintMayChange: true,
        affectedCasesRequireIncrementalAssessment: item.caseIds,
        automaticExecutionAllowed: false,
      },
      guardrail: '没有 PRD、运行审计或人工明确确认时，保持未定义，不生成正式规则或测试用例。',
    }));
  const report = {
    schemaVersion: '1.0.0',
    reportId: 'product-center-business-rule-confirmation-queue',
    scope: 'generated-evidence',
    status: items.length === 0 ? 'complete' : 'confirmation-required',
    purpose: '把商品行为未定义项转为可追溯的人工确认入口；不根据行业惯例或已有标题补写业务语义。',
    source: {
      scenarioCoveragePath: 'deliverables/test-plan-governance/product-center-business-rule-scenario-coverage.json',
      scenarioCoverageFingerprint: coverage.fingerprint,
    },
    summary: { total: items.length, ruleIds: [...new Set(items.map((item) => item.ruleId).filter(Boolean))].sort() },
    items,
    executionImpact: { existingPassedCasesInvalidated: false, rerunCaseIds: [], moduleDeliveryBlocked: false, businessExecutionStarted: false },
    guardrails: { missingSourceMayNotCreateRule: true, confirmationMayNotAuthorizeExecution: true, currentRulesModified: false },
  };
  const withFingerprint = { ...report, fingerprint: sha256(stableStringify(report)), generatedAt: new Date().toISOString() };
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(withFingerprint, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputMarkdownPath, renderMarkdown(withFingerprint), 'utf8');
  return { ...withFingerprint, outputJsonPath, outputMarkdownPath };
}

function questionFor(ruleId: string, operation: string, note: string): string {
  return `${ruleId} 在“${operation}”场景的前置条件、操作、可观察终态和清理要求是什么？当前依据：${note}`;
}

function renderMarkdown(report: any): string {
  return [
    '# 商品中心业务规则未定义行为确认清单', '',
    `- 状态：${report.status}`,
    `- 待确认：${report.summary.total}；涉及规则：${report.summary.ruleIds.join('、') || '无'}`,
    '', '| 规则 | 操作 | 缺口 | 待确认问题 | 关联用例 |', '|---|---|---|---|---|',
    ...report.items.map((item: any) => `| ${item.ruleId} | ${item.operation} | ${item.gapCode} | ${item.question} | ${item.linkedCaseIds.join('、') || '-'} |`),
    '', '处理要求：有 PRD、页面/接口审计或人工明确确认后，先评估规则指纹和影响用例，再生成增量计划；本清单不授权执行。', '',
  ].join('\n');
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

if (require.main === module) {
  try {
    const report = buildProductCenterBusinessRuleConfirmationQueue();
    process.stdout.write(`${JSON.stringify({ status: report.status, total: report.summary.total, output: report.outputJsonPath })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
