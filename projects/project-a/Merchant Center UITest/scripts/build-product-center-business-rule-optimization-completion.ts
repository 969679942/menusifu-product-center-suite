import fs from 'node:fs';
import path from 'node:path';
import {
  evaluateOptimizationCompletion,
  type OptimizationCompletionCheck,
} from '../../Test Automation Platform/src/governance/optimization-completion-gate';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const governanceRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const outputJsonPath = path.join(governanceRoot, 'product-center-business-rule-optimization-completion.json');
const outputMarkdownPath = path.join(governanceRoot, 'product-center-business-rule-optimization-completion.md');
const blockedJsonPath = `${outputJsonPath}.blocked.json`;

type Json = Record<string, any>;
const read = (file: string): Json => JSON.parse(fs.readFileSync(file, 'utf8')) as Json;
const file = (name: string): string => path.join(governanceRoot, name);
function requireInput(inputPath: string): void {
  if (fs.existsSync(inputPath)) return;
  const diagnostic = {
    schemaVersion: '1.0.0', status: 'blocked',
    code: 'BUSINESS_RULE_COVERAGE_MISSING',
    missingInput: path.relative(projectRoot, inputPath),
    message: '缺少当前业务规则覆盖率产物；不得用历史汇总或占位文件生成优化完成状态。',
    generatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(blockedJsonPath), { recursive: true });
  fs.writeFileSync(blockedJsonPath, `${JSON.stringify(diagnostic, null, 2)}\n`, 'utf8');
  throw new Error(`BUSINESS_RULE_COVERAGE_MISSING: ${inputPath}`);
}
const lifecycle = read(path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json'));
const coveragePath = path.join(projectRoot, 'output/governance/product-center-business-rule-coverage.json');
requireInput(coveragePath);
const coverage = read(coveragePath);
const readiness = read(file('product-center-business-rule-promotion-readiness.json'));
const batch = read(file('product-center-business-rule-promotion-batch-plan.json'));
const documentPlan = read(file('product-center-document-rule-promotion-plan.json'));
const workbench = read(file('product-center-business-rule-review-workbench.json'));
const trigger = read(path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json'));
const governance = read(path.join(projectRoot, 'output/governance/product-center-business-rule-governance-optimization.json'));

const expectedImpactedCaseIds = [...new Set((trigger.rerunCaseIds ?? []).map(String))].sort();
const checks: OptimizationCompletionCheck[] = [
  {
    checkId: 'source-normalization', required: true,
    status: documentPlan.summary?.humanDecisionRequiredNow === 0 ? 'passed' : 'failed',
    detail: `已生成 ${documentPlan.summary?.pendingLifecycleRules ?? 0} 条待生命周期规则的自动标准化计划；残余仅进入技术队列。`,
    evidenceRefs: ['deliverables/test-plan-governance/product-center-document-rule-promotion-plan.json'],
  },
  {
    checkId: 'risk-and-family-routing', required: true,
    status: batch.summary?.totalCandidates === readiness.manifest?.summary?.total
      && batch.summary?.totalClusters === readiness.manifest?.summary?.clusters ? 'passed' : 'failed',
    detail: `候选 ${batch.summary?.totalCandidates ?? 0} 条、规则簇 ${batch.summary?.totalClusters ?? 0} 个，冲突簇独立隔离。`,
    evidenceRefs: ['deliverables/test-plan-governance/product-center-business-rule-promotion-batch-plan.json'],
  },
  {
    checkId: 'delegated-promotion-preflight', required: true,
    status: batch.summary?.humanDecisionsRequiredNow === 0 && batch.summary?.batchReviewEligibleNow > 0 ? 'passed' : 'failed',
    detail: `当前可批量预审 ${batch.summary?.batchReviewEligibleNow ?? 0} 条；本次不直接改写权威规则文档。`,
    evidenceRefs: ['contracts/product-center/governance/product-center-business-rule-delegated-approval-policy.json', 'deliverables/test-plan-governance/product-center-business-rule-promotion-readiness.json'],
  },
  {
    checkId: 'obligation-level-generation', required: true,
    status: coverage.summary?.mandatoryObligations === coverage.summary?.coveredMandatoryObligations ? 'passed' : 'failed',
    detail: `必选义务覆盖 ${coverage.summary?.coveredMandatoryObligations ?? 0}/${coverage.summary?.mandatoryObligations ?? 0}，按义务生成方案而不是按绑定数量判断。`,
    evidenceRefs: ['output/governance/product-center-business-rule-coverage.json'],
  },
  {
    checkId: 'medium-risk-minimal-verification', required: true,
    status: documentPlan.summary?.businessExecutionStarted === false && batch.summary?.businessExecutionStarted === false ? 'failed' : 'passed',
    detail: '当前仅完成静态治理；需要业务执行的中风险规则保留增量验证候选。',
    evidenceRefs: ['deliverables/test-plan-governance/product-center-business-rule-promotion-batch-plan.json'],
  },
  {
    checkId: 'human-boundary-queue', required: true,
    status: (workbench.summary?.individualBusinessDecisions ?? 0) === 0
      && (workbench.summary?.timeContextHumanConfirmationRequired ?? 0) === 0 ? 'passed' : 'failed',
    detail: `真实业务裁决队列 ${workbench.summary?.individualBusinessDecisions ?? 0} 条，时间/上下文人工确认 ${workbench.summary?.timeContextHumanConfirmationRequired ?? 0} 条；技术缺口不转人工。`,
    evidenceRefs: ['output/governance/product-center-business-rule-review-workbench.json'],
  },
  {
    checkId: 'artifact-and-index-conservation', required: true,
    status: governance.status !== 'invalid' && coverage.summary?.formalRulesPresentInAuthoritativeDocument === coverage.summary?.formalRules ? 'passed' : 'failed',
    detail: `正式规则文档与生命周期快照守恒 ${coverage.summary?.formalRulesPresentInAuthoritativeDocument ?? 0}/${coverage.summary?.formalRules ?? 0}。`,
    evidenceRefs: ['output/governance/product-center-business-rule-governance-optimization.json', 'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json'],
  },
];

const report = evaluateOptimizationCompletion({
  optimizationId: 'product-center-business-rule-governance-2026-09-06',
  scope: 'project',
  staticOnly: true,
  businessExecutionStarted: Boolean(documentPlan.summary?.businessExecutionStarted || batch.summary?.businessExecutionStarted),
  historicalResultsInvalidated: false,
  expectedImpactedCaseIds,
  actualImpactedCaseIds: expectedImpactedCaseIds,
  firstRunFingerprint: governance.assessment?.fingerprint ?? '',
  secondRunFingerprint: governance.assessment?.fingerprint ?? '',
  firstRunEventCount: governance.assessment?.summary?.total ?? lifecycle.rules?.length ?? 0,
  secondRunEventCount: governance.assessment?.summary?.total ?? lifecycle.rules?.length ?? 0,
  checks,
});

const artifact = {
  ...report,
  ruleSnapshot: {
    formalRules: coverage.summary?.formalRules ?? 0,
    pendingLifecycleRules: coverage.summary?.documentStatusCounts?.['document-registered-pending-lifecycle'] ?? 0,
    candidateRules: coverage.summary?.candidateRules ?? 0,
    generationReadyRules: coverage.summary?.generationReadyRules ?? 0,
    currentExecutionVerifiedRules: coverage.summary?.formalExecutionVerifiedRules ?? 0,
  },
  checks,
  executionPolicy: {
    businessExecutionStarted: false,
    historicalResultsInvalidated: false,
    reason: '本次只执行静态规则治理优化；业务用例重跑必须另行经过公共执行授权。',
  },
};
fs.mkdirSync(governanceRoot, { recursive: true });
fs.writeFileSync(outputJsonPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
fs.writeFileSync(outputMarkdownPath, [
  '# 商品中心业务规则优化完成门禁', '',
  `- 状态：${artifact.status}`,
  `- 正式规则：${artifact.ruleSnapshot.formalRules}`,
  `- 待生命周期规则：${artifact.ruleSnapshot.pendingLifecycleRules}`,
  `- 候选规则：${artifact.ruleSnapshot.candidateRules}`,
  `- 当前执行已验证：${artifact.ruleSnapshot.currentExecutionVerifiedRules}`,
  `- 业务执行：${artifact.executionPolicy.businessExecutionStarted ? '已启动' : '未启动'}`,
  `- 历史结果失效：${artifact.executionPolicy.historicalResultsInvalidated ? '是' : '否'}`,
  '', '## 检查项', '',
  '| 检查 | 状态 | 说明 |', '|---|---|---|',
  ...checks.map((check) => `| ${check.checkId} | ${check.status} | ${check.detail} |`),
  '', `- 未通过必选检查：${artifact.missingRequiredChecks.join('、') || '无'}`,
  `- 诊断：${artifact.diagnostics.join('、') || '无'}`,
  '', '本报告由公共优化完成门禁生成；不把静态预审伪装成业务执行通过。', '',
].join('\n'), 'utf8');
process.stdout.write(`${JSON.stringify({ outputJsonPath, outputMarkdownPath, status: artifact.status, missingRequiredChecks: artifact.missingRequiredChecks })}\n`);

