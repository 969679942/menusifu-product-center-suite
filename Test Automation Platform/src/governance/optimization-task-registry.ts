import { createHash } from 'node:crypto';

export type GovernanceOptimizationTask = {
  taskId: string;
  priority: 'must' | 'optional' | 'not-recommended';
  scope: 'common-infrastructure' | 'module-adapter' | 'external-integration' | 'migration' | 'cross-system-pilot';
  status: 'completed' | 'in-progress' | 'blocked' | 'not-started';
  purpose: string;
  expectedResults: string[];
  downstreamImpact: {
    passedCases: 'preserved' | 'selective-revalidation' | 'invalidated';
    rerunCaseIds: string[];
    humanWork: string;
    runtimeCost: string;
    moduleDeliveryBlocked: boolean;
    reuseImpact: string;
  };
  evidenceRefs: string[];
  blockers: string[];
  recoveryConditions: string[];
};

export type GovernanceOptimizationResumeCondition = {
  conditionId: string;
  description: string;
  source: string;
  required: boolean;
};

export type GovernanceOptimizationLifecycle = {
  status: 'active' | 'frozen';
  frozenAt?: string;
  frozenBy?: string;
  reason?: string;
  frozenTaskIds?: string[];
  resumePolicy?: 'all-required-conditions';
  resumeConditions?: GovernanceOptimizationResumeCondition[];
  onResume?: 'prompt-and-reassess-only';
};

export type GovernanceOptimizationRegistry = {
  schemaVersion: '1.0.0';
  registryId: string;
  applicationId: string;
  businessDomainId: string;
  lifecycle?: GovernanceOptimizationLifecycle;
  tasks: GovernanceOptimizationTask[];
};

export function assessGovernanceOptimizationRegistry(registry: GovernanceOptimizationRegistry): {
  status: 'complete' | 'incomplete' | 'invalid';
  summary: Record<GovernanceOptimizationTask['status'], number> & { total: number };
  mandatoryOpenTaskIds: string[];
  diagnostics: string[];
  fingerprint: string;
} {
  const diagnostics: string[] = [];
  const taskIds = new Set<string>();
  for (const task of registry.tasks) {
    if (!task.taskId.trim()) diagnostics.push('OPTIMIZATION_TASK_ID_REQUIRED');
    if (taskIds.has(task.taskId)) diagnostics.push(`OPTIMIZATION_TASK_ID_DUPLICATE:${task.taskId}`);
    taskIds.add(task.taskId);
    if (!task.purpose.trim()) diagnostics.push(`OPTIMIZATION_TASK_PURPOSE_REQUIRED:${task.taskId}`);
    if (task.expectedResults.length === 0 || task.expectedResults.some((item) => !item.trim())) {
      diagnostics.push(`OPTIMIZATION_TASK_EXPECTED_RESULT_REQUIRED:${task.taskId}`);
    }
    if (!task.downstreamImpact.humanWork.trim()
      || !task.downstreamImpact.runtimeCost.trim()
      || !task.downstreamImpact.reuseImpact.trim()) {
      diagnostics.push(`OPTIMIZATION_TASK_DOWNSTREAM_IMPACT_REQUIRED:${task.taskId}`);
    }
    if (task.status === 'completed' && (task.blockers.length > 0 || task.recoveryConditions.length > 0)) {
      diagnostics.push(`COMPLETED_OPTIMIZATION_TASK_HAS_BLOCKER:${task.taskId}`);
    }
    if (task.status === 'blocked' && (task.blockers.length === 0 || task.recoveryConditions.length === 0)) {
      diagnostics.push(`BLOCKED_OPTIMIZATION_TASK_RECOVERY_REQUIRED:${task.taskId}`);
    }
    if (task.downstreamImpact.passedCases === 'preserved' && task.downstreamImpact.rerunCaseIds.length > 0) {
      diagnostics.push(`PRESERVED_CASE_POLICY_HAS_RERUN:${task.taskId}`);
    }
  }
  if (registry.lifecycle?.status === 'frozen') {
    const frozenTaskIds = registry.lifecycle.frozenTaskIds ?? [];
    const taskById = new Map(registry.tasks.map((task) => [task.taskId, task]));
    if (!registry.lifecycle.frozenAt?.trim()) diagnostics.push('FROZEN_OPTIMIZATION_LIFECYCLE_TIMESTAMP_REQUIRED');
    if (!registry.lifecycle.reason?.trim()) diagnostics.push('FROZEN_OPTIMIZATION_LIFECYCLE_REASON_REQUIRED');
    if (frozenTaskIds.length === 0) diagnostics.push('FROZEN_OPTIMIZATION_TASK_IDS_REQUIRED');
    for (const taskId of frozenTaskIds) {
      const task = taskById.get(taskId);
      if (!task) diagnostics.push(`FROZEN_OPTIMIZATION_TASK_UNKNOWN:${taskId}`);
      else if (task.status === 'completed') diagnostics.push(`COMPLETED_TASK_CANNOT_BE_FROZEN:${taskId}`);
    }
    if (registry.lifecycle.resumePolicy !== 'all-required-conditions') {
      diagnostics.push('FROZEN_OPTIMIZATION_RESUME_POLICY_REQUIRED');
    }
    if ((registry.lifecycle.resumeConditions ?? []).length === 0) {
      diagnostics.push('FROZEN_OPTIMIZATION_RESUME_CONDITIONS_REQUIRED');
    }
    if (registry.lifecycle.onResume !== 'prompt-and-reassess-only') {
      diagnostics.push('FROZEN_OPTIMIZATION_AUTO_EXECUTION_FORBIDDEN');
    }
  }
  const summary = {
    total: registry.tasks.length,
    completed: registry.tasks.filter((task) => task.status === 'completed').length,
    'in-progress': registry.tasks.filter((task) => task.status === 'in-progress').length,
    blocked: registry.tasks.filter((task) => task.status === 'blocked').length,
    'not-started': registry.tasks.filter((task) => task.status === 'not-started').length,
  };
  const mandatoryOpenTaskIds = registry.tasks
    .filter((task) => task.priority === 'must' && task.status !== 'completed')
    .map((task) => task.taskId)
    .sort();
  const normalized = { ...registry, tasks: [...registry.tasks].sort((left, right) => left.taskId.localeCompare(right.taskId)) };
  return {
    status: diagnostics.length > 0 ? 'invalid' : mandatoryOpenTaskIds.length > 0 ? 'incomplete' : 'complete',
    summary,
    mandatoryOpenTaskIds,
    diagnostics: [...new Set(diagnostics)].sort(),
    fingerprint: createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),
  };
}
