import {
  fingerprintExecutionIntent,
  fingerprintExecutionSelection,
  type ExecutionIntent,
} from '../../../../Test Automation Platform/src/governance/execution-intent';
import type { ProjectRemediationOptimizationPlan } from '../../../../Test Automation Platform/src/governance/project-remediation-optimization';
import type { ProjectRemediationOptimizationCase } from '../../../../Test Automation Platform/src/governance/project-remediation-optimization';

export function buildProductCenterBatchExecutionIntent(input: {
  runId: string;
  plan: ProjectRemediationOptimizationPlan;
  cases: readonly ProjectRemediationOptimizationCase[];
  plannedCaseIds?: readonly string[];
  selectedCaseIds?: readonly string[];
  classifiedExclusionCaseIds?: readonly string[];
}): ExecutionIntent {
  const selectedCaseIds = sortedUnique(input.selectedCaseIds ?? input.plan.executionEligibleCaseIds);
  const classifiedExclusionCaseIds = sortedUnique(input.classifiedExclusionCaseIds ?? []);
  const plannedCaseIds = sortedUnique(input.plannedCaseIds ?? selectedCaseIds);
  const selected = new Set(selectedCaseIds);
  const exclusions = new Set(classifiedExclusionCaseIds);
  const planned = new Set(plannedCaseIds);
  const caseById = new Map(input.cases.map((item) => [item.caseId, item]));
  const unknown = plannedCaseIds.filter((caseId) => !caseById.has(caseId));
  if (unknown.length > 0) throw new Error(`PRODUCT_CENTER_EXECUTION_INTENT_CASE_UNKNOWN:${sortedUnique(unknown).join(',')}`);
  const overlap = [...selected].filter((caseId) => exclusions.has(caseId));
  if (overlap.length > 0) throw new Error(`PRODUCT_CENTER_EXECUTION_INTENT_EXCLUSION_SELECTED:${overlap.sort().join(',')}`);
  const selectedOutsidePlan = selectedCaseIds.filter((caseId) => !planned.has(caseId));
  if (selectedOutsidePlan.length > 0) {
    throw new Error(`PRODUCT_CENTER_EXECUTION_INTENT_SELECTED_OUTSIDE_PLAN:${selectedOutsidePlan.join(',')}`);
  }

  const partitionCaseIds = Object.fromEntries(
    [...new Set(plannedCaseIds.map((caseId) => caseById.get(caseId)!.module))]
      .sort()
      .map((module) => [module, plannedCaseIds.filter((caseId) => caseById.get(caseId)!.module === module)]),
  );
  const routeCandidates = {
    seasoning: selectedCaseIds.filter((caseId) => caseById.get(caseId)!.module === 'seasoning'),
    item: selectedCaseIds.filter((caseId) => caseById.get(caseId)!.module === 'item'),
    sourceGoverned: selectedCaseIds.filter((caseId) => !['seasoning', 'item'].includes(caseById.get(caseId)!.module)),
  };
  const routes = Object.fromEntries(Object.entries(routeCandidates).filter(([, caseIds]) => caseIds.length > 0));
  const scopeFingerprint = hash({
    projectScopeFingerprint: input.plan.projectScopeFingerprint,
    changeId: input.plan.changeId,
    plannedCaseIds,
    classifiedExclusionCaseIds,
  });
  return {
    intentId: input.runId,
    mode: 'incremental',
    stage: 'batch',
    scopeId: `${input.plan.projectScopeId}:${input.plan.changeId ?? input.plan.planId}`,
    scopeFingerprint,
    plannedCaseIds,
    classifiedExclusionCaseIds,
    partitionCaseIds,
    selectedCaseIds,
    routes,
  };
}

export function buildProductCenterCanaryExecutionIntent(input: {
  runId: string;
  plan: ProjectRemediationOptimizationPlan;
  cases: readonly ProjectRemediationOptimizationCase[];
  selectedCaseIds?: readonly string[];
  canaryPartitionKeys?: readonly string[];
}): ExecutionIntent {
  const selectedCaseIds = [...input.selectedCaseIds ?? input.plan.canaryCaseIds];
  const byModule = Object.fromEntries(Object.keys(input.plan.moduleSummary).sort().map((module) => [
    module,
    input.cases.filter((item) => item.module === module).map((item) => item.caseId),
  ]));
  const routeCandidates = {
    seasoning: selectedCaseIds.filter((caseId) => input.cases.find((item) => item.caseId === caseId)?.module === 'seasoning'),
    sourceGoverned: selectedCaseIds.filter((caseId) => input.cases.find((item) => item.caseId === caseId)?.module !== 'seasoning'),
  };
  const routes = Object.fromEntries(
    Object.entries(routeCandidates).filter(([, caseIds]) => caseIds.length > 0),
  );
  return {
    intentId: input.runId,
    mode: 'incremental',
    stage: 'canary',
    scopeId: input.plan.projectScopeId,
    scopeFingerprint: input.plan.projectScopeFingerprint,
    plannedCaseIds: input.cases.map((item) => item.caseId),
    classifiedExclusionCaseIds: [],
    partitionCaseIds: byModule,
    canaryPartitionKeys: input.canaryPartitionKeys,
    selectedCaseIds,
    routes,
  };
}

export function buildProductCenterCanaryCheckpointMetadata(intent: ExecutionIntent): {
  executionIntentFingerprint: string;
  selectedFingerprint: string;
} {
  return {
    executionIntentFingerprint: fingerprintExecutionIntent(intent),
    selectedFingerprint: fingerprintExecutionSelection(intent.selectedCaseIds),
  };
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function hash(value: unknown): string {
  return require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
