import type { SystemTestCompiledCase } from './system-test-contract';
import type {
  SystemTestActionReadinessReceipt,
  SystemTestAssertionReceipt,
  SystemTestContextGuardReceipt,
  SystemTestExecutionTiming,
} from './system-test-recipe-executor';
import {
  evaluateSystemTestRuntimeContract,
  type RuntimeAssertionReceipt,
  type RuntimeOperationReceipt,
  type SystemTestRuntimeContractEvaluation,
} from './system-test-runtime-contract';

export type SystemTestRuntimeEvidence = {
  caseId: string;
  runtimeContractVersion?: '2.0.0';
  executionContext?: {
    applicationVersionFingerprint?: string | null;
    environmentId?: string | null;
    tenantScope?: string | null;
    locale?: string | null;
    roleId?: string | null;
    route?: string | null;
  };
  assertionReceipts: SystemTestAssertionReceipt[];
  contextGuardReceipts?: SystemTestContextGuardReceipt[];
  actionReadinessReceipts?: SystemTestActionReadinessReceipt[];
  executionTimings?: SystemTestExecutionTiming[];
  operationReceipts?: Array<{
    operationKey: string;
    observed: boolean;
    method: string;
    status?: 'started' | 'passed' | 'failed' | 'skipped';
    startedAt?: string;
    finishedAt?: string;
    durationMs?: number;
    responseStatus?: number;
    attempt?: number;
    retryOfEventId?: string | null;
    beforeFingerprint?: string | null;
    afterFingerprint?: string | null;
    changedFields?: string[];
  }>;
  changeReceipts?: Array<{
    entityType: string;
    entityId: string | number;
    changeType: 'requested' | 'persisted' | 'displayed';
    beforeFingerprint: string;
    afterFingerprint: string;
    changedFields: string[];
    evidenceRef?: string;
  }>;
  mutationObserved?: boolean;
  cleanup?: {
    apiIdentityCounts: Record<string, number>;
    uiIdentityCounts: Record<string, number | string>;
    objects?: Array<{
      entityType: string;
      serverId: string | number;
      businessIdentity: string;
      cleanupOperationKey?: string;
      cleanupAttempt: number;
      apiResidueCount: number;
      uiResidueCount?: number;
      outcome: 'verified-zero' | 'residue' | 'failed';
      failureCategory?: 'cleanup-residue' | 'cleanup-error';
      evidenceRefs?: string[];
    }>;
  };
};

export type SystemTestEvidenceEvaluation = {
  caseId: string;
  status: 'complete' | 'incomplete';
  missingClaimIds: string[];
  duplicateClaimIds: string[];
  missingContextGuards: string[];
  duplicateContextGuards: string[];
  missingActionReadiness: string[];
  duplicateActionReadiness: string[];
  mismatchedClaimIds: string[];
  missingOperationKeys: string[];
  operationEvidenceComplete: boolean;
  apiZeroResidue: boolean;
  uiZeroResidue: boolean;
  runtimeContract?: SystemTestRuntimeContractEvaluation;
};

export function resolveSystemTestMutationObserved(input: {
  declaredMutation: unknown;
  unexpectedMutationObserved?: boolean;
}): boolean {
  return input.unexpectedMutationObserved === true || input.declaredMutation !== undefined;
}

export function evaluateSystemTestRuntimeEvidence(
  item: SystemTestCompiledCase,
  evidence: SystemTestRuntimeEvidence | undefined,
): SystemTestEvidenceEvaluation {
  const counts = new Map<string, number>();
  for (const receipt of evidence?.assertionReceipts ?? []) {
    if (receipt.status === 'verified' || receipt.status === 'observed-mismatch') {
      counts.set(receipt.claimId, (counts.get(receipt.claimId) ?? 0) + 1);
    }
  }
  const expected = item.expectationClaims.map((claim) => claim.claimId);
  const missingClaimIds = expected.filter((claimId) => !counts.has(claimId));
  const duplicateClaimIds = expected.filter((claimId) => (counts.get(claimId) ?? 0) > 1);
  const mismatchedClaimIds = [...new Set((evidence?.assertionReceipts ?? [])
    .filter((receipt) => receipt.status === 'observed-mismatch')
    .map((receipt) => receipt.claimId))]
    .sort();
  const contextCounts = new Map<string, number>();
  for (const receipt of evidence?.contextGuardReceipts ?? []) {
    if (receipt.status !== 'verified') continue;
    const key = `${receipt.contextGuardAdapterId}:${receipt.phase}`;
    contextCounts.set(key, (contextCounts.get(key) ?? 0) + 1);
  }
  const expectedContextGuards = item.requiredContextGuards.map((guard) => `${guard.adapterId}:${guard.phase}`);
  const missingContextGuards = expectedContextGuards.filter((key) => !contextCounts.has(key));
  const duplicateContextGuards = expectedContextGuards.filter((key) => (contextCounts.get(key) ?? 0) > 1);
  const readinessCounts = new Map<string, number>();
  for (const receipt of evidence?.actionReadinessReceipts ?? []) {
    if (receipt.status !== 'verified') continue;
    readinessCounts.set(
      receipt.actionReadinessAdapterId,
      (readinessCounts.get(receipt.actionReadinessAdapterId) ?? 0) + 1,
    );
  }
  const expectedReadiness = item.requiredActionReadiness ? [item.requiredActionReadiness.adapterId] : [];
  const missingActionReadiness = expectedReadiness.filter((id) => !readinessCounts.has(id));
  const duplicateActionReadiness = expectedReadiness.filter((id) => (readinessCounts.get(id) ?? 0) > 1);
  const mutation = item.mutationMode !== 'none' || evidence?.mutationObserved === true;
  const observedOperations = new Set((evidence?.operationReceipts ?? [])
    .filter((receipt) => receipt.observed)
    .map((receipt) => receipt.operationKey));
  const missingOperationKeys = mutation
    ? item.requiredOperationKeys.filter((operationKey) => !observedOperations.has(operationKey))
    : [];
  const operationEvidenceComplete = observedOperations.size > 0
    && (!mutation || missingOperationKeys.length === 0);
  const apiValues = Object.values(evidence?.cleanup?.apiIdentityCounts ?? {});
  const uiValues = Object.values(evidence?.cleanup?.uiIdentityCounts ?? {});
  const apiZeroResidue = !mutation || (apiValues.length > 0 && apiValues.every((value) => value === 0));
  const uiZeroResidue = !mutation || (uiValues.length > 0 && uiValues.every((value) => value === 0));
  const runtimeContract = evidence?.runtimeContractVersion === '2.0.0'
    ? evaluateSystemTestRuntimeContract({
      caseId: evidence.caseId,
      requiredOperationKeys: item.requiredOperationKeys,
      requiredAssertionIds: expected,
      operationReceipts: (evidence.operationReceipts ?? []) as readonly RuntimeOperationReceipt[],
      assertionReceipts: (evidence.assertionReceipts ?? []) as readonly RuntimeAssertionReceipt[],
    })
    : undefined;
  const complete = evidence?.caseId === item.caseId
    && missingClaimIds.length === 0
    && duplicateClaimIds.length === 0
    && missingContextGuards.length === 0
    && duplicateContextGuards.length === 0
    && missingActionReadiness.length === 0
    && duplicateActionReadiness.length === 0
    && operationEvidenceComplete
    && apiZeroResidue
    && uiZeroResidue
    && (runtimeContract === undefined || runtimeContract.status === 'complete');
  return {
    caseId: item.caseId,
    status: complete ? 'complete' : 'incomplete',
    missingClaimIds,
    duplicateClaimIds,
    missingContextGuards,
    duplicateContextGuards,
    missingActionReadiness,
    duplicateActionReadiness,
    mismatchedClaimIds,
    missingOperationKeys,
    operationEvidenceComplete,
    apiZeroResidue,
    uiZeroResidue,
    ...(runtimeContract ? { runtimeContract } : {}),
  };
}
