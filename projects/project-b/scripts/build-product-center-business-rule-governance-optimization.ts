import fs from 'node:fs';
import path from 'node:path';
import {
  assessGovernanceOptimizationRegistry,
  type GovernanceOptimizationRegistry,
} from '../utils/optimization-task-registry';
import { buildGovernanceIntegrationPrompts, readGovernanceIntegrationSnapshot } from '../utils/integration-status';
import { buildProductCenterHistoricalBusinessRuleMigration } from './build-product-center-historical-business-rule-migration';

const projectRoot = path.resolve(__dirname, '..');
const registryPath = path.join(projectRoot, 'contracts/product-center/governance/product-center-business-rule-governance-optimization.json');
const migrationPath = path.join(projectRoot, 'adapters/test-automation-platform/reports/merchant-center-migration-closure.json');
const externalDependencyPath = path.join(projectRoot, 'deliverables/system-test-platform/platform-external-dependency.json');
const triggerPath = path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json');
const outputJsonPath = path.join(projectRoot, 'output/governance/product-center-business-rule-governance-optimization.json');
const outputMarkdownPath = path.join(projectRoot, 'output/governance/product-center-business-rule-governance-optimization.md');

export function buildProductCenterBusinessRuleGovernanceOptimization() {
  const registry = readJson<GovernanceOptimizationRegistry>(registryPath);
  const assessment = assessGovernanceOptimizationRegistry(registry);
  const migration = readJson<any>(migrationPath);
  const externalDependency = readJson<any>(externalDependencyPath);
  const trigger = readJson<any>(triggerPath);
  const timeContextReview = readOptionalJson(path.join(workspaceRoot(projectRoot), 'deliverables/test-plan-governance/product-center-business-rule-time-context-review.json'));
  const confirmationQueue = readOptionalJson(path.join(workspaceRoot(projectRoot), 'deliverables/test-plan-governance/product-center-business-rule-confirmation-queue.json'));
  const observationLedger = readOptionalJson(path.join(projectRoot, 'output/governance/product-center-business-rule-observation-ledger.json'));
  const integration = readGovernanceIntegrationSnapshot();
  const integrationPrompts = buildGovernanceIntegrationPrompts(integration);
  const historicalMigration = fs.existsSync(path.join(projectRoot, 'output/governance/product-center-historical-business-rule-migration.json'))
    ? readJson<any>(path.join(projectRoot, 'output/governance/product-center-historical-business-rule-migration.json'))
    : buildProductCenterHistoricalBusinessRuleMigration();
  const lifecycle = buildLifecycleSnapshot(
    registry.lifecycle, integration, migration, historicalMigration, externalDependency,
    timeContextReview, confirmationQueue, observationLedger,
  );
  const report = {
    schemaVersion: '1.0.0',
    scope: 'product-center-business-rule-governance',
    status: assessment.status,
    moduleDeliveryBlocked: registry.tasks.some((task) => task.status !== 'completed' && task.downstreamImpact.moduleDeliveryBlocked),
    assessment,
    integration,
    integrationPrompts: [
      ...integrationPrompts,
      ...(lifecycle.status === 'frozen'
        ? ['GOVERNANCE_OPTIMIZATION_FROZEN_WAITING_FOR_ALL_RESUME_CONDITIONS']
        : []),
    ],
    lifecycle,
    historicalMigration: {
      status: historicalMigration.status,
      summary: historicalMigration.summary,
    },
    remainingGovernanceGaps: {
      timeContextHumanConfirmationRequired: timeContextReview?.summary?.humanConfirmationRequired
        ?? timeContextReview?.summary?.confirmationRequired ?? null,
      timeContextAutomaticEvidenceRequired: timeContextReview?.summary?.evidenceCollectionRequired ?? null,
      productBehaviorConfirmationRequired: confirmationQueue?.summary?.total ?? null,
      observationEvidenceDiagnostics: observationLedger?.summary?.diagnostics ?? null,
    },
    observations: {
      governedRuleCount: readJson<any>(path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json')).rules.length,
      currentRuleTrigger: {
        status: trigger.status,
        rerunCaseIds: trigger.rerunCaseIds,
        preservedPassedCaseIds: trigger.preservedPassedCaseIds,
      },
      migration: {
        status: migration.status,
        inputFingerprint: migration.inputFingerprint,
        inventoryChanged: migration.summary?.inventoryChanged ?? null,
        bridgeViolations: migration.summary?.bridgeViolations ?? null,
        historicalReferenceGaps: migration.summary?.historicalReferenceGaps ?? null,
      },
      platformExternalDependency: {
        status: externalDependency.status,
        blockers: externalDependency.blockers ?? [externalDependency.blocker].filter(Boolean),
      },
    },
    tasks: registry.tasks,
  };
  writeAtomic(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeAtomic(outputMarkdownPath, renderMarkdown(report));
  if (assessment.status === 'invalid') throw new Error(`BUSINESS_RULE_OPTIMIZATION_REGISTRY_INVALID:${assessment.diagnostics.join(',')}`);
  return report;
}

function renderMarkdown(report: ReturnType<typeof buildProductCenterBusinessRuleGovernanceOptimization>): string {
  const lines = [
    '# 商品中心业务规则治理优化任务', '',
    `- 总体状态：${report.status}`,
    `- 商品中心交付阻断：${report.moduleDeliveryBlocked ? '是' : '否'}`,
    `- Git接入：${report.integration.git.status}；Jenkins接入：${report.integration.jenkins.status}；PRD来源：${report.integration.prd.sourceMode}`,
    `- 接入提示：${report.integrationPrompts.join('、') || '无'}`,
    `- 治理任务生命周期：${report.lifecycle.status === 'frozen' ? '已冻结' : '活动'}；恢复条件：${report.lifecycle.resumeReady ? '全部满足' : '未满足'}`,
    `- 已治理规则：${report.observations.governedRuleCount}`,
    `- 当前增量重验：${report.observations.currentRuleTrigger.rerunCaseIds.join(', ') || '无'}`,
    `- 历史规则迁移：${report.historicalMigration.status}；待确认Legacy规则：${report.historicalMigration.summary.legacyAwaitingConfirmation}`,
    `- 迁移缺口：inventoryChanged=${report.observations.migration.inventoryChanged}, bridgeViolations=${report.observations.migration.bridgeViolations}, historicalReferenceGaps=${report.observations.migration.historicalReferenceGaps}`,
    `- 剩余治理缺口：时间/上下文自动补证=${report.remainingGovernanceGaps.timeContextAutomaticEvidenceRequired ?? '未生成'}，时间/上下文人工确认=${report.remainingGovernanceGaps.timeContextHumanConfirmationRequired ?? '未生成'}，商品行为确认=${report.remainingGovernanceGaps.productBehaviorConfirmationRequired ?? '未生成'}，观察证据诊断=${report.remainingGovernanceGaps.observationEvidenceDiagnostics ?? '未生成'}`,
    '', '| 任务 | 级别 | 状态 | 目的 |', '|---|---|---|---|',
    ...report.tasks.map((task) => `| ${task.taskId} | ${task.priority} | ${task.status} | ${task.purpose} |`),
    '', '说明：本报告只登记和裁决治理任务，不授权或执行任何UI/API业务用例。', '',
  ];
  return lines.join('\n');
}

function buildLifecycleSnapshot(
  lifecycle: GovernanceOptimizationRegistry['lifecycle'],
  integration: ReturnType<typeof readGovernanceIntegrationSnapshot>,
  migration: any,
  historicalMigration: any,
  externalDependency: any,
  timeContextReview: any,
  confirmationQueue: any,
  observationLedger: any,
) {
  const conditions = lifecycle?.resumeConditions ?? [];
  const conditionStatuses = conditions.map((condition) => ({
    ...condition,
    satisfied: condition.source === 'integration.git.status=connected'
      ? integration.git.status === 'connected'
      : condition.source === 'integration.jenkins.status=connected'
        ? integration.jenkins.status === 'connected'
        : condition.source === 'integration.prd.sourceMode=system-event'
          ? integration.prd.sourceMode === 'system-event'
          : condition.source === 'migration.status=complete'
            ? migration.status === 'complete'
            : condition.source === 'historicalMigration.summary.legacyAwaitingConfirmation=0'
              ? historicalMigration.summary?.legacyAwaitingConfirmation === 0
              : condition.source === 'platformExternalDependency.status=complete'
                ? externalDependency.status === 'complete'
                  : condition.source === 'timeContextReview.summary.evidenceCollectionRequired=0'
                    ? timeContextReview?.summary?.evidenceCollectionRequired === 0
                  : condition.source === 'confirmationQueue.summary.total=0'
                    ? confirmationQueue?.summary?.total === 0
                    : condition.source === 'observationLedger.summary.diagnostics=0'
                      ? observationLedger?.summary?.diagnostics === 0
                : false,
  }));
  return {
    status: lifecycle?.status ?? 'active',
    frozenAt: lifecycle?.frozenAt ?? null,
    frozenBy: lifecycle?.frozenBy ?? null,
    reason: lifecycle?.reason ?? null,
    frozenTaskIds: lifecycle?.frozenTaskIds ?? [],
    resumePolicy: lifecycle?.resumePolicy ?? null,
    onResume: lifecycle?.onResume ?? null,
    resumeReady: lifecycle?.status !== 'frozen' || conditionStatuses.every((condition) => !condition.required || condition.satisfied),
    conditionStatuses,
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function readOptionalJson(filePath: string): any | null {
  return fs.existsSync(filePath) ? readJson<any>(filePath) : null;
}

function workspaceRoot(root: string): string { return path.resolve(root, '..'); }

function writeAtomic(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const report = buildProductCenterBusinessRuleGovernanceOptimization();
    process.stdout.write(`${JSON.stringify({ status: report.status, mandatoryOpenTaskIds: report.assessment.mandatoryOpenTaskIds })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
