import type { GovernanceOptimizationRegistry } from '../../utils/optimization-task-registry';
import type { readGovernanceIntegrationSnapshot } from '../../utils/integration-status';
import type { SystemTestExternalDependency } from '../../../Test Automation Platform/src/automation/system-test/system-test-external-dependency';

export function buildLifecycleSnapshot(
  lifecycle: GovernanceOptimizationRegistry['lifecycle'],
  integration: ReturnType<typeof readGovernanceIntegrationSnapshot>,
  migration: any,
  historicalMigration: any,
  externalDependency: Partial<SystemTestExternalDependency> | null,
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
              : condition.source === 'platformExternalDependency.status=resolved'
                ? externalDependency?.status === 'resolved'
                  && Array.isArray(externalDependency.blockers)
                  && externalDependency.blockers.length === 0
                  && !externalDependency.blocker
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
