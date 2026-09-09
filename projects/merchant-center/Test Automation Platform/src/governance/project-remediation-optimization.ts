import { createHash } from 'node:crypto';
import {
  buildSystemTestOptimizationPlan,
  type SystemTestOptimizationCase,
  type SystemTestOptimizationPlan,
  type SystemTestOptimizationReceipt,
} from './system-test-optimization-gate';
import {
  assertProjectRemediationExecutionScope,
  type ProjectRemediationScopeArtifact,
} from './project-remediation-scope';

export type ProjectRemediationOptimizationCase = SystemTestOptimizationCase & {
  module: string;
};

export type ProjectRemediationOptimizationPlan = SystemTestOptimizationPlan & {
  projectScopeId: string;
  projectScopeFingerprint: string;
  includedModules: string[];
  moduleSummary: Record<string, {
    totalCases: number;
    groupCount: number;
    canaryCaseCount: number;
  }>;
  projectFingerprint: string;
};

export function buildProjectRemediationOptimizationPlan(input: {
  planId: string;
  scope: ProjectRemediationScopeArtifact;
  cases: readonly ProjectRemediationOptimizationCase[];
  maxBatchSize: number;
  canaryCaseIds?: readonly string[];
  includedModules?: readonly string[];
  executionCaseIds?: readonly string[];
  canaryReceipts?: readonly SystemTestOptimizationReceipt[];
  standardReceipts?: readonly SystemTestOptimizationReceipt[];
  impactedCaseIds?: readonly string[];
  impactTypes?: Readonly<Record<string, import('../automation/system-test/system-test-revalidation-policy').SystemTestRevalidationImpactType>>;
  maxCanaryCases?: number;
  maxCanaryRatio?: number;
  changeId?: string;
  generatedAt?: string;
}): ProjectRemediationOptimizationPlan {
  const moduleByCaseId = new Map(input.scope.cases.map((item) => [item.caseId, item.module]));
  const moduleIssues = input.cases.flatMap((item) => {
    const expectedModule = moduleByCaseId.get(item.caseId);
    if (!item.module.trim()) return [{ caseId: item.caseId, code: 'PROJECT_MODULE_REQUIRED' }];
    if (!expectedModule) return [{ caseId: item.caseId, code: 'PROJECT_CASE_OUTSIDE_SCOPE' }];
    if (expectedModule !== item.module) return [{ caseId: item.caseId, code: 'PROJECT_MODULE_MISMATCH' }];
    return [];
  });
  assertProjectRemediationExecutionScope({
    scope: input.scope,
    plannedCaseIds: input.cases.map((item) => item.caseId),
    classifiedExclusionCaseIds: [],
  });
  const availableModules = [...new Set(input.cases.map((item) => item.module))].sort();
  const includedModules = [...new Set(input.includedModules ?? availableModules)]
    .map((module) => module.trim())
    .filter(Boolean)
    .sort();
  if (includedModules.length === 0) throw new Error('PROJECT_OPTIMIZATION_MODULE_SET_EMPTY');
  const unknownModules = includedModules.filter((module) => !availableModules.includes(module));
  if (unknownModules.length > 0) {
    throw new Error(`PROJECT_OPTIMIZATION_MODULE_UNKNOWN:${unknownModules.join(',')}`);
  }
  const defaultExecutionCaseIds = input.cases
    .filter((item) => includedModules.includes(item.module))
    .map((item) => item.caseId);
  const executionCaseIds = input.executionCaseIds
    ? [...new Set(input.executionCaseIds)].sort()
    : defaultExecutionCaseIds;
  const caseById = new Map(input.cases.map((item) => [item.caseId, item]));
  const unknownExecutionCaseIds = executionCaseIds.filter((caseId) => !caseById.has(caseId));
  if (unknownExecutionCaseIds.length > 0) {
    throw new Error(`PROJECT_OPTIMIZATION_EXECUTION_CASE_UNKNOWN:${unknownExecutionCaseIds.join(',')}`);
  }
  const executionCasesOutsideModules = executionCaseIds.filter((caseId) => {
    const item = caseById.get(caseId);
    return item ? !includedModules.includes(item.module) : false;
  });
  if (executionCasesOutsideModules.length > 0) {
    throw new Error(`PROJECT_OPTIMIZATION_EXECUTION_CASE_OUTSIDE_MODULES:${executionCasesOutsideModules.join(',')}`);
  }
  const selectedCases = executionCaseIds.map((caseId) => caseById.get(caseId)!);
  const plan = buildSystemTestOptimizationPlan({
    planId: input.planId,
    contractFingerprint: fingerprint({
      projectScopeFingerprint: input.scope.fingerprint,
      cases: input.cases,
    }),
    cases: selectedCases,
    maxBatchSize: input.maxBatchSize,
    canaryCaseIds: input.canaryCaseIds,
    executionCaseIds,
    canaryReceipts: input.canaryReceipts,
    standardReceipts: input.standardReceipts,
    impactedCaseIds: input.impactedCaseIds,
    impactTypes: input.impactTypes,
    maxCanaryCases: input.maxCanaryCases,
    maxCanaryRatio: input.maxCanaryRatio,
    changeId: input.changeId,
    generatedAt: input.generatedAt,
  });
  if (moduleIssues.length > 0) {
    plan.staticIssues = uniqueIssues([...plan.staticIssues, ...moduleIssues]);
    plan.status = 'blocked';
    plan.batches = [];
  }
  const moduleSummary = Object.fromEntries([...new Set(input.scope.cases.map((item) => item.module))]
    .sort()
    .map((module) => {
      const cases = input.cases.filter((item) => item.module === module);
      const canarySet = new Set(plan.canaryCaseIds);
      return [module, {
        totalCases: cases.length,
        groupCount: new Set(cases.map((item) => item.groupKey)).size,
        canaryCaseCount: cases.filter((item) => canarySet.has(item.caseId)).length,
      }];
    }));
  const withoutProjectFingerprint = {
    ...plan,
    projectScopeId: input.scope.scopeId,
    projectScopeFingerprint: input.scope.fingerprint,
    includedModules,
    moduleSummary,
    scopeTotal: input.scope.cases.length,
    selectedTotal: plan.executionCaseIds.length,
    excludedTotal: input.scope.cases.length - plan.executionCaseIds.length,
    selectedCaseIds: [...plan.executionCaseIds].sort(),
    excludedCaseIds: input.scope.cases
      .filter((item) => !plan.executionCaseIds.includes(item.caseId))
      .map((item) => item.caseId)
      .sort(),
    excludedModules: [...new Set(input.scope.cases
      .filter((item) => !includedModules.includes(item.module))
      .map((item) => item.module))].sort(),
    browserExecutionAuthorized: plan.browserExecutionAuthorized === true,
  };
  const { fingerprint: _baseFingerprint, ...planBody } = withoutProjectFingerprint;
  const finalPlanFingerprint = fingerprint(planBody);
  const withPlanFingerprint = { ...withoutProjectFingerprint, fingerprint: finalPlanFingerprint };
  return {
    ...withPlanFingerprint,
    projectFingerprint: fingerprint(withPlanFingerprint),
  };
}

function uniqueIssues(issues: readonly { caseId: string; code: string }[]): Array<{ caseId: string; code: string }> {
  return [...new Map(issues.map((issue) => [`${issue.caseId}:${issue.code}`, issue])).values()]
    .sort((left, right) => `${left.caseId}:${left.code}`.localeCompare(`${right.caseId}:${right.code}`));
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
