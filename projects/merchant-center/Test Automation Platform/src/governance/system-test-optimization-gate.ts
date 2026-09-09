import { createHash } from 'node:crypto';
import {
  assertCanaryBudget,
  buildSystemTestRevalidationDecision,
  type SystemTestRevalidationDecisionRecord,
  type SystemTestRevalidationImpactType,
} from '../automation/system-test/system-test-revalidation-policy';

export type SystemTestOptimizationCase = {
  caseId: string;
  groupKey: string;
  caseFingerprint: string;
  implementationFingerprint: string;
  businessImplementationFingerprint?: string;
  mutationMode: 'none' | 'reversible' | 'fixture-reversible';
  requiredOperationKeys: string[];
  expectationClaimIds: string[];
  contextGuardPhases: Array<'before-action' | 'before-assertion'>;
  cleanupRequired: boolean;
  staticIssueCodes?: string[];
  requiredCanary?: boolean;
};

export type SystemTestOptimizationReceipt = {
  caseId: string;
  caseFingerprint: string;
  implementationFingerprint: string;
  businessImplementationFingerprint?: string;
  status: 'passed' | 'failed' | 'blocked' | 'not-run';
  failureCategory?: string;
  evidenceComplete: boolean;
  operationReceiptCount: number;
  assertionReceiptCount: number;
  cleanupComplete: boolean;
  contextReceiptComplete?: boolean;
};

export type SystemTestOptimizationPlan = {
  schemaVersion: '1.0.0';
  planId: string;
  contractFingerprint: string;
  generatedAt: string;
  maxBatchSize: number;
  status: 'blocked' | 'canary-required' | 'canary-blocked' | 'ready-for-batch' | 'revalidation-complete';
  staticIssues: Array<{ caseId: string; code: string }>;
  canaryCaseIds: string[];
  candidateCanaryCaseIds: string[];
  targetedCaseIds: string[];
  sentinelCaseIds: string[];
  executionCaseIds: string[];
  executionEligibleCaseIds: string[];
  acceptedFindingCaseIds: string[];
  batches: Array<{ batchId: string; groupKey: string; sequence: number; caseIds: string[] }>;
  canaryReceipts: SystemTestOptimizationReceipt[];
  caseFingerprints: Record<string, string>;
  implementationFingerprints: Record<string, string>;
  businessImplementationFingerprints: Record<string, string>;
  reusableCaseIds: string[];
  caseDecisions: Record<string, SystemTestRevalidationDecisionRecord>;
  maxCanaryCases: number;
  maxCanaryRatio: number;
  impactTypes: Record<string, SystemTestRevalidationImpactType>;
  changeId?: string;
  scopeFingerprint?: string;
  selectionFingerprint?: string;
  scopeTotal?: number;
  selectedTotal?: number;
  excludedTotal?: number;
  selectedCaseIds?: string[];
  excludedCaseIds?: string[];
  excludedModules?: string[];
  browserExecutionAuthorized?: boolean;
  fingerprint: string;
};

export function assertSystemTestOptimizationPlanMetadata(plan: SystemTestOptimizationPlan): void {
  if (!plan.changeId?.trim() || !plan.selectionFingerprint || !plan.fingerprint) {
    throw new Error('OPTIMIZATION_PLAN_METADATA_REQUIRED');
  }
  const scopeTotal = plan.scopeTotal;
  const selectedTotal = plan.selectedTotal;
  const excludedTotal = plan.excludedTotal;
  if (typeof scopeTotal !== 'number' || typeof selectedTotal !== 'number' || typeof excludedTotal !== 'number') {
    throw new Error('OPTIMIZATION_PLAN_SCOPE_METADATA_INVALID');
  }
  if (!Number.isInteger(scopeTotal) || !Number.isInteger(selectedTotal)
    || !Number.isInteger(excludedTotal) || scopeTotal < 1
    || selectedTotal < 0 || excludedTotal < 0
    || selectedTotal + excludedTotal !== scopeTotal) {
    throw new Error('OPTIMIZATION_PLAN_SCOPE_METADATA_INVALID');
  }
  if (!Array.isArray(plan.selectedCaseIds) || !Array.isArray(plan.excludedCaseIds)
    || JSON.stringify([...plan.selectedCaseIds].sort()) !== JSON.stringify([...plan.executionCaseIds].sort())) {
    throw new Error('OPTIMIZATION_PLAN_SELECTION_METADATA_INVALID');
  }
  if (typeof plan.browserExecutionAuthorized !== 'boolean') {
    throw new Error('OPTIMIZATION_PLAN_EXECUTION_AUTHORIZATION_REQUIRED');
  }
}

export function buildSystemTestOptimizationPlan(input: {
  planId: string;
  contractFingerprint: string;
  cases: readonly SystemTestOptimizationCase[];
  maxBatchSize: number;
  canaryCaseIds?: readonly string[];
  executionCaseIds?: readonly string[];
  canaryReceipts?: readonly SystemTestOptimizationReceipt[];
  standardReceipts?: readonly SystemTestOptimizationReceipt[];
  impactedCaseIds?: readonly string[];
  impactTypes?: Readonly<Record<string, SystemTestRevalidationImpactType>>;
  maxCanaryCases?: number;
  maxCanaryRatio?: number;
  changeId?: string;
  generatedAt?: string;
}): SystemTestOptimizationPlan {
  if (!input.planId.trim()) throw new Error('OPTIMIZATION_PLAN_ID_REQUIRED');
  if (!input.contractFingerprint.trim()) throw new Error('OPTIMIZATION_CONTRACT_FINGERPRINT_REQUIRED');
  if (!Number.isInteger(input.maxBatchSize) || input.maxBatchSize < 1) {
    throw new Error(`OPTIMIZATION_BATCH_SIZE_INVALID:${input.maxBatchSize}`);
  }
  if (input.cases.length === 0) throw new Error('OPTIMIZATION_CASE_SET_EMPTY');

  const ids = new Set<string>();
  const staticIssues: Array<{ caseId: string; code: string }> = [];
  for (const item of input.cases) {
    if (!item.caseId.trim()) staticIssues.push({ caseId: item.caseId, code: 'CASE_ID_REQUIRED' });
    if (ids.has(item.caseId)) staticIssues.push({ caseId: item.caseId, code: 'CASE_ID_DUPLICATE' });
    ids.add(item.caseId);
    if (!item.groupKey.trim()) staticIssues.push({ caseId: item.caseId, code: 'GROUP_KEY_REQUIRED' });
    if (!item.caseFingerprint.trim()) staticIssues.push({ caseId: item.caseId, code: 'CASE_FINGERPRINT_REQUIRED' });
    if (!item.implementationFingerprint.trim()) staticIssues.push({ caseId: item.caseId, code: 'IMPLEMENTATION_FINGERPRINT_REQUIRED' });
    if (item.expectationClaimIds.length === 0) staticIssues.push({ caseId: item.caseId, code: 'ASSERTION_CLAIM_REQUIRED' });
    if (!item.contextGuardPhases.includes('before-action')) staticIssues.push({ caseId: item.caseId, code: 'CONTEXT_BEFORE_ACTION_REQUIRED' });
    if (!item.contextGuardPhases.includes('before-assertion')) staticIssues.push({ caseId: item.caseId, code: 'CONTEXT_BEFORE_ASSERTION_REQUIRED' });
    if (item.mutationMode !== 'none' && item.requiredOperationKeys.length === 0) {
      staticIssues.push({ caseId: item.caseId, code: 'MUTATION_OPERATION_REQUIRED' });
    }
    if (item.mutationMode !== 'none' && !item.cleanupRequired) {
      staticIssues.push({ caseId: item.caseId, code: 'MUTATION_CLEANUP_REQUIRED' });
    }
    for (const code of item.staticIssueCodes ?? []) {
      if (code.trim()) staticIssues.push({ caseId: item.caseId, code: code.trim() });
    }
  }

  const knownCaseIds = new Set(input.cases.map((item) => item.caseId));
  const requestedExecutionCaseIds = input.executionCaseIds?.map((caseId) => caseId.trim()).filter(Boolean);
  const executionCaseIds = requestedExecutionCaseIds === undefined
    ? input.cases.map((item) => item.caseId)
    : [...new Set(requestedExecutionCaseIds)];
  if (requestedExecutionCaseIds && executionCaseIds.length !== requestedExecutionCaseIds.length) {
    throw new Error('OPTIMIZATION_EXECUTION_CASE_ID_DUPLICATE');
  }
  if (executionCaseIds.length === 0) throw new Error('OPTIMIZATION_EXECUTION_CASE_SET_EMPTY');
  const unknownExecutionCaseIds = executionCaseIds.filter((caseId) => !knownCaseIds.has(caseId));
  if (unknownExecutionCaseIds.length > 0) {
    throw new Error(`OPTIMIZATION_EXECUTION_CASE_ID_UNKNOWN:${unknownExecutionCaseIds.join(',')}`);
  }
  const executionCaseSet = new Set(executionCaseIds);
  const executionCases = input.cases.filter((item) => executionCaseSet.has(item.caseId));
  const grouped = new Map<string, SystemTestOptimizationCase[]>();
  for (const item of [...executionCases].sort((left, right) => left.caseId.localeCompare(right.caseId))) {
    const group = grouped.get(item.groupKey) ?? [];
    group.push(item);
    grouped.set(item.groupKey, group);
  }
  const adapterRequiredCanaryCaseIds = executionCases.filter((item) => item.requiredCanary).map((item) => item.caseId);
  const requestedCanaryCaseIds = [...new Set((input.canaryCaseIds ?? []).map((caseId) => caseId.trim()).filter(Boolean))];
  for (const caseId of requestedCanaryCaseIds) {
    if (!knownCaseIds.has(caseId)) staticIssues.push({ caseId, code: 'CANARY_CASE_ID_UNKNOWN' });
    else if (!executionCaseSet.has(caseId)) staticIssues.push({ caseId, code: 'CANARY_CASE_ID_OUTSIDE_EXECUTION_SCOPE' });
  }
  const requestedImpactedCaseIds = input.impactedCaseIds === undefined
    ? executionCaseIds
    : [...new Set(input.impactedCaseIds.map((caseId) => caseId.trim()).filter(Boolean))];
  const unknownImpactedCaseIds = requestedImpactedCaseIds.filter((caseId) => !knownCaseIds.has(caseId) || !executionCaseSet.has(caseId));
  if (unknownImpactedCaseIds.length > 0) {
    throw new Error(`OPTIMIZATION_IMPACT_CASE_ID_UNKNOWN:${unknownImpactedCaseIds.join(',')}`);
  }
  const staticBlockedCaseIds = new Set(staticIssues
    .filter((issue) => executionCaseSet.has(issue.caseId))
    .map((issue) => issue.caseId));
  const eligibleAdapterRequiredCanaryCaseIds = adapterRequiredCanaryCaseIds.filter((caseId) => {
    const impactType = input.impactTypes?.[caseId]
      ?? (requestedImpactedCaseIds.includes(caseId) ? 'unknown-impact' : 'platform-only');
    return impactType !== 'report-only' && impactType !== 'platform-only';
  });
  const candidateCanaryCaseIds = [...new Set([
    ...requestedImpactedCaseIds.filter((caseId) => {
      const impactType = input.impactTypes?.[caseId] ?? 'unknown-impact';
      return impactType === 'unknown-impact';
    }),
    ...eligibleAdapterRequiredCanaryCaseIds,
    ...requestedCanaryCaseIds,
  ])]
    .filter((caseId) => !staticBlockedCaseIds.has(caseId));
  const receipts = mergeReceipts(input.standardReceipts ?? [], input.canaryReceipts ?? []);
  const receiptByCaseId = new Map(receipts.map((receipt) => [receipt.caseId, receipt]));
  const caseDecisions = Object.fromEntries(executionCases.map((item) => {
    const decision = buildSystemTestRevalidationDecision({
      item: {
        caseId: item.caseId,
        caseFingerprint: item.caseFingerprint,
        implementationFingerprint: item.implementationFingerprint,
        businessImplementationFingerprint: item.businessImplementationFingerprint,
        expectationCount: item.expectationClaimIds.length,
        mutationRequired: item.mutationMode !== 'none' && item.cleanupRequired,
        requiredCanary: item.requiredCanary,
      },
      receipt: receiptByCaseId.get(item.caseId),
      impactType: input.impactTypes?.[item.caseId]
      ?? (requestedImpactedCaseIds.includes(item.caseId) || item.requiredCanary ? 'unknown-impact' : 'platform-only'),
      staticIssueCodes: staticIssues.filter((issue) => issue.caseId === item.caseId).map((issue) => issue.code),
    });
    return [item.caseId, decision];
  })) as Record<string, SystemTestRevalidationDecisionRecord>;
  const reusableCaseIds = Object.values(caseDecisions).filter((decision) => decision.decision === 'reuse').map((decision) => decision.caseId).sort();
  const acceptedFindingCaseIds = Object.values(caseDecisions).filter((decision) => decision.decision === 'classified-exclusion').map((decision) => decision.caseId).sort();
  const unresolvedCandidateCaseIds = candidateCanaryCaseIds.filter((caseId) => {
    const decision = caseDecisions[caseId]?.decision;
    return decision === 'targeted-execute' || decision === 'sentinel-execute';
  });
  const canaryBudget = assertCanaryBudget({
    candidateCaseIds: unresolvedCandidateCaseIds,
    totalCaseCount: executionCases.length,
    maxCanaryCases: input.maxCanaryCases,
    maxCanaryRatio: input.maxCanaryRatio,
  });
  if (!canaryBudget.allowed) {
    staticIssues.push({ caseId: '__PLAN__', code: `${canaryBudget.code}:${canaryBudget.detail}` });
  }
  const canaryCaseIds = canaryBudget.allowed ? unresolvedCandidateCaseIds : [];
  const targetedCaseIds = Object.values(caseDecisions)
    .filter((decision) => decision.decision === 'targeted-execute')
    .map((decision) => decision.caseId)
    .sort();
  const sentinelCaseIds = Object.values(caseDecisions)
    .filter((decision) => decision.decision === 'sentinel-execute')
    .map((decision) => decision.caseId)
    .sort();
  const canaryFailures = canaryCaseIds.filter((caseId) => caseDecisions[caseId]?.decision !== 'reuse'
    && caseDecisions[caseId]?.decision !== 'classified-exclusion');
  const noReceipts = receipts.length === 0;
  const planBlocked = staticIssues.some((issue) => issue.caseId === '__PLAN__');
  const executionStaticIssues = staticIssues.filter((issue) => executionCaseSet.has(issue.caseId));
  const pendingExecutionCaseIds = executionCases
    .filter((item) => ['targeted-execute', 'sentinel-execute'].includes(caseDecisions[item.caseId]?.decision ?? ''))
    .map((item) => item.caseId)
    .sort();
  const status: SystemTestOptimizationPlan['status'] = planBlocked || canaryCaseIds.length === 0 && executionStaticIssues.length > 0
    ? 'blocked'
    : canaryFailures.length > 0
      ? noReceipts ? 'canary-required' : 'canary-blocked'
      : canaryCaseIds.length === 0
        ? pendingExecutionCaseIds.length > 0 ? 'ready-for-batch' : 'revalidation-complete'
        : 'ready-for-batch';
  const pendingExecutionSet = new Set(pendingExecutionCaseIds);
  const executionEligibleCaseIds = status === 'ready-for-batch'
    ? pendingExecutionCaseIds
      : canaryCaseIds.sort();
  const batches = status === 'ready-for-batch'
    ? [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).flatMap(([groupKey, items]) =>
      Array.from({ length: Math.ceil(items.filter((item) => pendingExecutionSet.has(item.caseId)).length / input.maxBatchSize) }, (_, index) => ({
        batchId: `optimization-${shortHash(`${input.planId}:${groupKey}`)}-${String(index + 1).padStart(2, '0')}`,
        groupKey,
        sequence: index + 1,
        caseIds: items.filter((item) => pendingExecutionSet.has(item.caseId))
          .slice(index * input.maxBatchSize, (index + 1) * input.maxBatchSize).map((item) => item.caseId),
      }))).filter((batch) => batch.caseIds.length > 0)
    : [];
  const withoutFingerprint = {
    schemaVersion: '1.0.0' as const,
    planId: input.planId.trim(),
    contractFingerprint: input.contractFingerprint.trim(),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    maxBatchSize: input.maxBatchSize,
    status,
    staticIssues: uniqueIssues(staticIssues),
    canaryCaseIds: [...canaryCaseIds].sort(),
    candidateCanaryCaseIds: [...candidateCanaryCaseIds].sort(),
    targetedCaseIds,
    sentinelCaseIds,
    executionCaseIds: [...executionCaseIds].sort(),
    executionEligibleCaseIds,
    acceptedFindingCaseIds,
    batches,
    canaryReceipts: receipts,
    caseFingerprints: Object.fromEntries(input.cases
      .map((item) => [item.caseId, item.caseFingerprint] as const)
      .sort(([left], [right]) => left.localeCompare(right))),
    implementationFingerprints: Object.fromEntries(input.cases
      .map((item) => [item.caseId, item.implementationFingerprint] as const)
      .sort(([left], [right]) => left.localeCompare(right))),
    businessImplementationFingerprints: Object.fromEntries(input.cases
      .map((item) => [item.caseId, item.businessImplementationFingerprint ?? item.implementationFingerprint] as const)
      .sort(([left], [right]) => left.localeCompare(right))),
    reusableCaseIds,
    caseDecisions,
    maxCanaryCases: input.maxCanaryCases ?? 20,
    maxCanaryRatio: input.maxCanaryRatio ?? 0.1,
    impactTypes: Object.fromEntries(executionCases.map((item) => [item.caseId, input.impactTypes?.[item.caseId]
      ?? (requestedImpactedCaseIds.includes(item.caseId) || item.requiredCanary ? 'unknown-impact' : 'platform-only')] as const).sort(([left], [right]) => left.localeCompare(right))),
    changeId: input.changeId?.trim() || undefined,
    scopeFingerprint: input.contractFingerprint.trim(),
    selectionFingerprint: fingerprint({ executionCaseIds: [...executionCaseIds].sort(), canaryCaseIds: [...canaryCaseIds].sort(), executionEligibleCaseIds }),
    scopeTotal: input.cases.length,
    selectedTotal: executionCaseIds.length,
    excludedTotal: input.cases.length - executionCaseIds.length,
    selectedCaseIds: [...executionCaseIds].sort(),
    excludedCaseIds: input.cases.filter((item) => !executionCaseSet.has(item.caseId)).map((item) => item.caseId).sort(),
    excludedModules: [],
    browserExecutionAuthorized: status === 'ready-for-batch' && executionEligibleCaseIds.length > 0,
  };
  return { ...withoutFingerprint, fingerprint: fingerprint(withoutFingerprint) };
}

function isAcceptedCanaryOutcome(receipt: SystemTestOptimizationReceipt): boolean {
  return receipt.status === 'passed' || isAcceptedProductFinding(receipt);
}

function isAcceptedProductFinding(receipt: SystemTestOptimizationReceipt | undefined): boolean {
  return receipt?.status === 'failed' && receipt.failureCategory === 'product-failure';
}

export function assertSystemTestOptimizationGate(input: {
  plan: SystemTestOptimizationPlan;
  requestedCaseIds: readonly string[];
  stage: 'canary' | 'batch';
  currentCases?: readonly Pick<SystemTestOptimizationCase, 'caseId' | 'caseFingerprint' | 'implementationFingerprint'>[];
}): void {
  const requested = [...new Set(input.requestedCaseIds)].sort();
  const eligible = new Set(input.plan.executionEligibleCaseIds);
  if (requested.length === 0) throw new Error('OPTIMIZATION_REQUEST_EMPTY');
  if (requested.some((caseId) => !eligible.has(caseId))) {
    throw new Error(`OPTIMIZATION_CASE_NOT_ELIGIBLE:${requested.filter((caseId) => !eligible.has(caseId)).join(',')}`);
  }
  if (input.stage === 'batch' && input.plan.status !== 'ready-for-batch') {
    throw new Error(`OPTIMIZATION_BATCH_GATE_NOT_READY:${input.plan.status}`);
  }
  if (input.stage === 'canary' && input.plan.status === 'blocked') {
    throw new Error('OPTIMIZATION_STATIC_GATE_BLOCKED');
  }
  if (input.currentCases) {
    const currentByCaseId = new Map(input.currentCases.map((item) => [item.caseId, item]));
    for (const caseId of requested) {
      const current = currentByCaseId.get(caseId);
      if (!current) throw new Error(`OPTIMIZATION_CURRENT_CASE_MISSING:${caseId}`);
      if (input.plan.caseFingerprints[caseId] !== current.caseFingerprint) {
        throw new Error(`OPTIMIZATION_CASE_FINGERPRINT_STALE:${caseId}`);
      }
      if (input.plan.implementationFingerprints[caseId] !== current.implementationFingerprint) {
        throw new Error(`OPTIMIZATION_IMPLEMENTATION_FINGERPRINT_STALE:${caseId}`);
      }
    }
  }
}

function normalizeReceipts(receipts: readonly SystemTestOptimizationReceipt[]): SystemTestOptimizationReceipt[] {
  const seen = new Set<string>();
  return [...receipts].sort((left, right) => left.caseId.localeCompare(right.caseId)).filter((receipt) => {
    if (seen.has(receipt.caseId)) throw new Error(`OPTIMIZATION_RECEIPT_DUPLICATE:${receipt.caseId}`);
    seen.add(receipt.caseId);
    return true;
  });
}

function mergeReceipts(
  standardReceipts: readonly SystemTestOptimizationReceipt[],
  canaryReceipts: readonly SystemTestOptimizationReceipt[],
): SystemTestOptimizationReceipt[] {
  const byCaseId = new Map<string, SystemTestOptimizationReceipt>();
  for (const receipt of standardReceipts) byCaseId.set(receipt.caseId, receipt);
  for (const receipt of canaryReceipts) byCaseId.set(receipt.caseId, receipt);
  return normalizeReceipts([...byCaseId.values()]);
}

function uniqueIssues(issues: readonly { caseId: string; code: string }[]): Array<{ caseId: string; code: string }> {
  return [...new Map(issues.map((issue) => [`${issue.caseId}:${issue.code}`, issue])).values()]
    .sort((left, right) => `${left.caseId}:${left.code}`.localeCompare(`${right.caseId}:${right.code}`));
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
