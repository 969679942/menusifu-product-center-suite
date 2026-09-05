export type BatchCasePolicy = {
  caseId: string;
  mode: 'read-only' | 'mutation';
  isolatedData: boolean;
  resourceKeys: string[];
};

export type BatchPerformanceObservation = {
  selectedCaseIds: readonly string[];
  registeredCaseIds: readonly string[];
  fixtureCaseIds: readonly string[];
  authenticationChecks: number;
  attemptedCaseIds: readonly string[];
};

export function buildCaseTagGrep(caseIds: readonly string[]): string {
  const uniqueCaseIds = [...new Set(caseIds)].sort();
  if (uniqueCaseIds.length === 0) throw new Error('批量运行至少需要一个 caseId');
  return `@case-(?:${uniqueCaseIds.map(escapeRegex).join('|')})(?:\\s|$)`;
}

export function resolveSafeBatchWorkers(
  requestedWorkers: number,
  policies: readonly BatchCasePolicy[],
): 1 | 2 {
  if (requestedWorkers < 2) return 1;
  if (policies.length === 0) return 1;
  const allParallelSafe = policies.every((policy) => policy.mode === 'read-only' || policy.isolatedData);
  if (!allParallelSafe) return 1;
  const usedResources = new Set<string>();
  for (const policy of policies) {
    for (const resourceKey of policy.resourceKeys) {
      if (usedResources.has(resourceKey)) return 1;
      usedResources.add(resourceKey);
    }
  }
  return 2;
}

export function assertBatchPerformanceGate(observation: BatchPerformanceObservation): void {
  const selected = [...new Set(observation.selectedCaseIds)].sort();
  const registered = [...new Set(observation.registeredCaseIds)].sort();
  const fixtures = [...new Set(observation.fixtureCaseIds)].sort();
  const attempted = new Set(observation.attemptedCaseIds);
  if (JSON.stringify(registered) !== JSON.stringify(selected)) {
    throw new Error(`注册用例数必须等于选中用例数：selected=${selected.length}, registered=${registered.length}`);
  }
  if (fixtures.some((caseId) => !selected.includes(caseId))) {
    throw new Error(`未选择用例初始化了 fixture：${fixtures.filter((caseId) => !selected.includes(caseId)).join(',')}`);
  }
  if (observation.authenticationChecks > 1) {
    throw new Error(`单批认证检查不得超过 1 次，实际 ${observation.authenticationChecks} 次`);
  }
  const unattempted = selected.filter((caseId) => !attempted.has(caseId));
  if (unattempted.length > 0) throw new Error(`失败后仍有用例未执行：${unattempted.join(',')}`);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
