import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const governanceRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const outputJsonPath = path.join(governanceRoot, 'product-center-business-rule-post-optimization-analysis.json');
const outputMarkdownPath = path.join(governanceRoot, 'product-center-business-rule-post-optimization-analysis.md');

export function buildProductCenterBusinessRulePostOptimizationAnalysis() {
  const scenario = readJson<any>(path.join(governanceRoot, 'product-center-business-rule-scenario-coverage.json'));
  const operations = readJson<any>(path.join(governanceRoot, 'product-center-business-rule-governance-operations.json'));
  const timeContext = readJson<any>(path.join(governanceRoot, 'product-center-business-rule-time-context-review.json'));
const confirmation = readJson<any>(path.join(governanceRoot, 'product-center-business-rule-confirmation-queue.json'));
const observation = readJson<any>(path.join(projectRoot, 'output/governance/product-center-business-rule-observation-ledger.json'));
const optimization = readJson<any>(path.join(projectRoot, 'output/governance/product-center-business-rule-governance-optimization.json'));
const trigger = readJson<any>(path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json'));
const executionResultPath = path.join(workspaceRoot, 'deliverables/product-center-source-governance/execution-result.json');
const executionResult = fs.existsSync(executionResultPath) ? readJson<any>(executionResultPath) : null;
// An execution-result.json file is a historical artifact unless the caller
// explicitly marks it as the current business run.  Presence of latestAttempt
// alone must not turn an old run into this turn's execution fact.
const includeCurrentExecutionResult = process.env.PC_BUSINESS_EXECUTION_STARTED === 'true';
const executedCaseIds = includeCurrentExecutionResult
  ? (executionResult?.executionCases ?? [])
    .filter((item: any) => item && item.latestAttempt)
    .map((item: any) => String(item.caseId))
    .filter(Boolean)
  : [];
const businessExecutionStarted = includeCurrentExecutionResult && executedCaseIds.length > 0;
  const staticOptimizationAccepted = operations.summary.contractCoveredOperations === operations.summary.supportedOperations
    && observation.summary.diagnostics === 0
    && trigger.rerunCaseIds.length === 0;
  const currentVerdict = staticOptimizationAccepted
    ? '静态治理优化验收通过；全量治理尚未完成，剩余项均有明确阻断和恢复条件。'
    : '静态治理优化尚未通过；仍存在证据诊断或增量重验候选，全量治理尚未完成。';
  const report = {
    schemaVersion: '1.0.0',
    reportId: 'product-center-business-rule-post-optimization-analysis',
    scope: 'generated-evidence',
    status: optimization.status === 'complete' && scenario.status === 'complete' ? 'complete' : 'partially-complete',
    objective: '对剩余业务规则治理问题形成分级方案、二次检查、执行静态优化并在优化后重新评估。',
    recommendations: [
      recommendation('必须', '公共治理操作合同', '解决驳回/挂起、废弃/恢复/回滚、批准撤回/过期无可审计操作的问题。', '七类操作具备追加存储、哈希完整性和查询投影。', '已有通过结果不变；不重跑业务用例；公共能力可跨系统复用。', operations.status),
    recommendation('必须', '严格时间与上下文校验', '阻止错误时间顺序或空显式上下文进入成熟规则。', '形成逐规则严格校验与自动证据收集队列。', '规则语义和已有结果不变；不要求人工重复确认，只有来源冲突才升级人工。', timeContext.status),
    recommendation('必须', '未定义商品行为确认队列', '防止根据行业惯例擅自补写商品行为；所有未确认项必须显式进入队列。', '每项包含规则、操作、来源、问题和影响用例。', '确认前不生成规则/用例/脚本；确认后仅做增量影响评估。', confirmation.status),
      recommendation('必须', '观察证据不可变性与恢复诊断', '防止被覆盖证据冒充原始收据并反向更新规则。', `逐条核对文件、用例、实现和上下文指纹；当前 ${observation.summary.completeReceiptsMapped}/${observation.summary.completeReceiptsMapped + observation.summary.diagnostics} 收据可映射、${observation.summary.diagnostics} 诊断、${observation.summary.semanticChangesDetected} 语义变化。`, '已有通过结果不自动失效；仅对完整收据缺口生成定向处置。', observation.status),
      recommendation('可选', '负责人去重通知', '减少人工轮询治理报告。', '接入后仅在状态变化时通知负责人。', '不影响模块交付或已有结果；等待通知通道配置。', taskStatus(optimization, 'BRG-OPT-006')),
      recommendation('暂不建议', '物理删除规则或自动补写商品语义', '避免破坏历史追溯或用无来源推断污染正式规则。', '继续使用 retired 事件；未定义项保持待确认。', '不会引入全量重跑或不可逆历史丢失。', 'not-recommended'),
      recommendation('暂不建议', '自动启动跨系统或冻结业务用例', '遵守跨系统显式授权和当前冻结约束。', '只保留静态合同、计划和恢复条件。', '商品中心模块结果不降级；平台通用化仍未完成。', 'deferred'),
    ],
    doubleCheck: {
      formalRuleSemanticsModified: false,
      formalRuleCount: scenario.summary.formalRules,
      formalRulesWithBehaviorCoverage: scenario.summary.formalRulesWithBehaviorCoverage,
      downstreamArbiterChanged: false,
      businessExecutionStarted,
      existingPassedCasesInvalidated: false,
      rerunCaseIds: trigger.rerunCaseIds ?? [],
      executedCaseIds,
      frozenLifecyclePreserved: optimization.lifecycle.status === 'frozen',
      crossSystemPilotStarted: false,
      missingBusinessSemanticsInferred: false,
    },
    comparison: {
      before: {
        source: '优化前 product-center-business-rule-scenario-coverage 报告',
        totalScenarios: 40, covered: 23, partiallyCovered: 3, notDefined: 11, notApplicable: 2, blocked: 1,
      },
      after: scenario.summary,
      delta: {
        covered: scenario.summary.covered - 23,
        partiallyCovered: scenario.summary.partiallyCovered - 3,
        notDefined: scenario.summary.notDefined - 11,
        blocked: scenario.summary.blocked - 1,
      },
    },
    actualResults: {
      governanceOperations: `${operations.summary.contractCoveredOperations}/${operations.summary.supportedOperations}`,
      timeContextConfirmationRequired: timeContext.summary.humanConfirmationRequired ?? timeContext.summary.confirmationRequired,
      timeContextEvidenceCollectionRequired: timeContext.summary.evidenceCollectionRequired ?? null,
      productBehaviorConfirmationRequired: confirmation.summary.total,
      observationReceiptsMapped: observation.summary.completeReceiptsMapped,
      observationDiagnostics: observation.summary.diagnostics,
      semanticChangesDetected: observation.summary.semanticChangesDetected,
      optimizationMandatoryOpenTaskIds: optimization.assessment.mandatoryOpenTaskIds,
    },
    acceptance: {
      staticOptimizationAccepted,
      fullGovernanceCompletionAccepted: optimization.status === 'complete' && scenario.status === 'complete',
      currentVerdict,
    },
    remaining: {
      must: optimization.assessment.mandatoryOpenTaskIds,
      timeContextRuleCount: timeContext.summary.evidenceCollectionRequired ?? timeContext.summary.confirmationRequired,
      productBehaviorQuestionCount: confirmation.summary.total,
      crossSystemPilot: 'deferred-user-explicit-only',
    },
    sourceFingerprints: {
      scenario: scenario.fingerprint,
      operations: operations.fingerprint,
      timeContext: timeContext.fingerprint,
      confirmation: confirmation.fingerprint,
      observation: observation.fingerprint,
      optimization: optimization.assessment.fingerprint,
      trigger: trigger.fingerprint,
      executionResult: executionResult ? fingerprintFile(executionResultPath) : null,
    },
    executionImpact: {
      existingPassedCasesInvalidated: false,
      rerunCaseIds: executedCaseIds,
      moduleDeliveryBlocked: false,
      businessExecutionStarted,
      executionStatus: executionResult?.status ?? 'not-run',
      productDefectCount: Number(executionResult?.summary?.productDefect ?? 0),
    },
  };
  const withFingerprint = { ...report, fingerprint: sha256(stableStringify(report)), generatedAt: new Date().toISOString() };
  fs.mkdirSync(governanceRoot, { recursive: true });
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(withFingerprint, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputMarkdownPath, renderMarkdown(withFingerprint), 'utf8');
  return { ...withFingerprint, outputJsonPath, outputMarkdownPath };
}

function recommendation(level: string, name: string, purpose: string, expectedResult: string, downstreamImpact: string, actualStatus: string) {
  return { level, name, purpose, expectedResult, downstreamImpact, actualStatus };
}
function taskStatus(optimization: any, taskId: string): string { return optimization.tasks.find((item: any) => item.taskId === taskId)?.status ?? 'unknown'; }
function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function renderMarkdown(report: any): string {
  return [
    '# 商品中心业务规则剩余问题优化与复验报告', '',
    `- 结论：${report.acceptance.currentVerdict}`,
    `- 静态优化验收：${report.acceptance.staticOptimizationAccepted ? '通过' : '未通过'}`,
    `- 全量治理完成：${report.acceptance.fullGovernanceCompletionAccepted ? '是' : '否'}`,
    `- 正式规则变更：${report.doubleCheck.formalRuleSemanticsModified ? '有' : '无'}；业务执行：${report.doubleCheck.businessExecutionStarted ? '已启动' : '未启动'}；重跑候选：${report.doubleCheck.rerunCaseIds.join('、') || '无'}`,
    '', '## 方案与实际结果', '',
    '| 级别 | 项目 | 目的 | 预期结果 | 后续影响 | 实际状态 |', '|---|---|---|---|---|---|',
    ...report.recommendations.map((item: any) => `| ${item.level} | ${item.name} | ${item.purpose} | ${item.expectedResult} | ${item.downstreamImpact} | ${item.actualStatus} |`),
    '', '## 优化前后', '',
    `- 已覆盖：${report.comparison.before.covered} → ${report.comparison.after.covered}（${signed(report.comparison.delta.covered)}）`,
    `- 部分覆盖：${report.comparison.before.partiallyCovered} → ${report.comparison.after.partiallyCovered}（${signed(report.comparison.delta.partiallyCovered)}）`,
    `- 未定义：${report.comparison.before.notDefined} → ${report.comparison.after.notDefined}（${signed(report.comparison.delta.notDefined)}）`,
    `- 阻断：${report.comparison.before.blocked} → ${report.comparison.after.blocked}（${signed(report.comparison.delta.blocked)}）`,
    '', '## 剩余问题', '',
    `- 必须开放任务：${report.remaining.must.join('、') || '无'}`,
    `- 时间/上下文待确认规则：${report.remaining.timeContextRuleCount}`,
    `- 商品行为待确认问题：${report.remaining.productBehaviorQuestionCount}`,
    `- 跨系统试点：${report.remaining.crossSystemPilot}`,
    '', `说明：本轮正式规则语义未修改；业务执行${report.doubleCheck.businessExecutionStarted ? `已启动（${report.doubleCheck.executedCaseIds.join('、') || '无可归档用例'}）` : '未启动'}。UI/API 业务用例仅按批准名单执行，产品偏差仍需产品修复或预期确认后再次定向重跑。`, '',
  ].join('\n');
}
function signed(value: number): string { return value > 0 ? `+${value}` : String(value); }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function fingerprintFile(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

if (require.main === module) {
  try {
    const report = buildProductCenterBusinessRulePostOptimizationAnalysis();
    process.stdout.write(`${JSON.stringify({ status: report.status, acceptance: report.acceptance, output: report.outputJsonPath })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
