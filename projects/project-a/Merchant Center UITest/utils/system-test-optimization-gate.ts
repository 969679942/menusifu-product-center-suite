import {
  buildSystemTestOptimizationPlan,
  type SystemTestOptimizationCase,
  type SystemTestOptimizationPlan,
  type SystemTestOptimizationReceipt,
} from '../../../Test Automation Platform/src/governance/system-test-optimization-gate';
import type { SystemTestCompiledCase } from '../../../Test Automation Platform/src/automation/system-test/system-test-contract';
import type { SystemTestRevalidationImpactType } from '../../../Test Automation Platform/src/automation/system-test/system-test-revalidation-policy';

export type MerchantCenterOptimizationCase = SystemTestOptimizationCase;

export function mapMerchantCenterOptimizationCases(input: {
  cases: readonly SystemTestCompiledCase[];
  caseFingerprints: Readonly<Record<string, string>>;
  implementationFingerprints: Readonly<Record<string, string>>;
}): MerchantCenterOptimizationCase[] {
  return input.cases.map((item) => {
    const caseFingerprint = input.caseFingerprints[item.caseId];
    const implementationFingerprint = input.implementationFingerprints[item.caseId];
    if (!caseFingerprint || !implementationFingerprint) {
      throw new Error(`OPTIMIZATION_FINGERPRINT_MISSING:${item.caseId}`);
    }
    return {
      caseId: item.caseId,
      groupKey: [
        item.executionContextProfile ?? 'default-context',
        item.action,
        item.dataProfileId,
        item.requiredOperationKeys.join(','),
      ].join('|'),
      caseFingerprint,
      implementationFingerprint,
      mutationMode: item.mutationMode,
      requiredOperationKeys: [...item.requiredOperationKeys],
      expectationClaimIds: item.expectationClaims.map((claim) => claim.claimId),
      contextGuardPhases: item.requiredContextGuards.map((guard) => guard.phase),
      cleanupRequired: item.mutationMode !== 'none',
    };
  });
}

export function buildMerchantCenterOptimizationPlan(input: {
  planId: string;
  contractFingerprint: string;
  cases: readonly SystemTestCompiledCase[];
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
  caseFingerprints: Readonly<Record<string, string>>;
  implementationFingerprints: Readonly<Record<string, string>>;
}): SystemTestOptimizationPlan {
  return buildSystemTestOptimizationPlan({
    planId: input.planId,
    contractFingerprint: input.contractFingerprint,
    cases: mapMerchantCenterOptimizationCases(input),
    maxBatchSize: input.maxBatchSize,
    canaryCaseIds: input.canaryCaseIds,
    executionCaseIds: input.executionCaseIds,
    canaryReceipts: input.canaryReceipts,
    standardReceipts: input.standardReceipts,
    impactedCaseIds: input.impactedCaseIds,
    impactTypes: input.impactTypes,
    maxCanaryCases: input.maxCanaryCases,
    maxCanaryRatio: input.maxCanaryRatio,
    changeId: input.changeId,
  });
}
