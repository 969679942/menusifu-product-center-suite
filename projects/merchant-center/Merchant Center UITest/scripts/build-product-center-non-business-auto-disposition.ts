import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const readinessPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-reverse-scenario-readiness-v1.json');
const businessRulePath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-business-rule-post-optimization-analysis.json');
const migrationPath = path.join(projectRoot, 'adapters/test-automation-platform/reports/merchant-center-migration-closure.json');
const maintainabilityPath = path.join(projectRoot, 'output/quality/product-center-maintainability-report.json');
const reconciliationPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-historical-evidence-reconciliation.json');
const outputPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-non-business-auto-disposition-v1.json');

const readiness = readJson<{ summary: { partial: number; missing: number; covered: number }; scenarios: Array<{ scenarioId: string; status: string; linkedCaseIds: string[] }> }>(readinessPath);
const businessRule = readJson<{ actualResults?: { productBehaviorConfirmationRequired?: number; timeContextEvidenceCollectionRequired?: number; optimizationMandatoryOpenTaskIds?: string[] }; remaining?: { productBehaviorQuestionCount?: number; timeContextRuleCount?: number; crossSystemPilot?: string } }>(businessRulePath);
const migration = readJson<{ summary: { inventoryChanged: number; bridgeViolations: number; unowned: number; brokenReferences: number }; status: string }>(migrationPath);
const maintainability = readJson<{ status: string; summary: { highPriorityFiles: number; directIdentityTemplates: number }; issues: string[] }>(maintainabilityPath);
const reconciliation = readJson<{ summary: { reconciliationRequired: number } }>(reconciliationPath);

const businessConfirmationRequired = businessRule.actualResults?.productBehaviorConfirmationRequired
  ?? businessRule.remaining?.productBehaviorQuestionCount ?? 0;
const timeContextEvidenceRequired = businessRule.actualResults?.timeContextEvidenceCollectionRequired
  ?? businessRule.remaining?.timeContextRuleCount ?? 0;
const tasks = businessRule.actualResults?.optimizationMandatoryOpenTaskIds ?? [];

const items = [
  {
    id: 'AUTO-REV-READINESS',
    category: 'reverse-scenario-evidence',
    count: readiness.summary.partial + readiness.summary.missing,
    disposition: 'auto-queue',
    action: '自动保持 partial/missing，等待适配器和标准收据；不转人工，不升级 covered。',
  },
  {
    id: 'AUTO-HISTORICAL-LINEAGE',
    category: 'historical-fingerprint-reconciliation',
    count: reconciliation.summary.reconciliationRequired,
    disposition: 'auto-queue',
    action: '自动按 caseId、用例指纹和执行上下文重算血缘；仅检测到业务语义变化时升级人工。',
  },
  {
    id: 'AUTO-TIME-CONTEXT',
    category: 'time-context-evidence',
    count: timeContextEvidenceRequired,
    disposition: 'auto-collection',
    action: '自动采集并校验时间、环境、角色、租户和版本；证据冲突才转人工。',
  },
  {
    id: 'AUTO-MIGRATION-DIAGNOSTIC',
    category: 'migration-integrity',
    count: migration.summary.inventoryChanged,
    disposition: 'auto-diagnostic',
    action: '自动生成变更清单和哈希链；基线接受仅保留一次性授权，不做人工逐条业务审核。',
  },
  {
    id: 'AUTO-MAINTAINABILITY',
    category: 'engineering-maintainability',
    count: maintainability.summary.highPriorityFiles + maintainability.summary.directIdentityTemplates,
    disposition: 'auto-engineering-queue',
    action: '自动生成拆分和身份工厂重构任务；不进入业务偏差队列。',
  },
  {
    id: 'MANUAL-BUSINESS-DEVIATION',
    category: 'business-semantic-deviation',
    count: businessConfirmationRequired,
    disposition: businessConfirmationRequired > 0 ? 'manual-required' : 'none',
    action: businessConfirmationRequired > 0 ? '仅业务语义与实际行为冲突时由产品负责人确认。' : '当前无业务偏差人工项。',
  },
];

const report = {
  schemaVersion: '1.0.0',
  reportId: 'product-center-non-business-auto-disposition-v1',
  generatedAt: new Date().toISOString(),
  policy: 'non-business-deviation-auto-only',
  summary: {
    autoQueueItems: items.filter((item) => item.disposition !== 'manual-required' && item.disposition !== 'none').length,
    manualBusinessDeviationCount: businessConfirmationRequired,
    businessExecutionStarted: false,
    crossSystemPilot: 'deferred',
    existingPassedCasesInvalidated: false,
  },
  items,
  guardrails: {
    noManualReviewForTechnicalEvidence: true,
    noAutomaticBusinessSemanticInference: true,
    noFullRegressionFromDocumentationChanges: true,
    noUnapprovedMutation: true,
    migrationStatus: migration.status,
    migrationDiagnostics: migration.summary,
    maintainabilityStatus: maintainability.status,
    maintainabilityIssues: maintainability.issues,
    openGovernanceTaskIds: tasks,
  },
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, summary: report.summary }, null, 2));

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
