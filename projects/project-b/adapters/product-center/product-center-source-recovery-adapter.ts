import {
  assessSystemTestSourceRecovery,
  type SystemTestSourceRecoveryAssessment,
} from '../../../../Test Automation Platform/src/automation/system-test/system-test-source-recovery';

export type ProductCenterSourceRecoveryBinding = {
  caseId: string;
  title: string;
  bindingFingerprint: string;
  handlerId: string | null;
  preconditions?: string[];
  steps?: string[];
  expectedResults?: string[];
  assertionIds: string[];
  requiredEvidence: string[];
};

export type ProductCenterSourceRecoveryRuntimeEvidence = {
  receiptVersion?: string | null;
  caseId?: string | null;
  caseFingerprint?: string | null;
  semanticCaseFingerprint?: string | null;
  implementationFingerprint?: string | null;
  executionContext?: {
    applicationVersionFingerprint?: string | null;
    environmentId?: string | null;
    tenantScope?: string | null;
    locale?: string | null;
    roleId?: string | null;
    route?: string | null;
  } | null;
  claims?: { required?: string[]; observed?: string[]; verified?: string[] };
  requiredAssertionIds?: string[];
  observedAssertionIds?: string[];
  operationReceipts?: Array<{
    operationKey?: string | null;
    method?: string | null;
    observed?: boolean;
    status?: string | null;
  }>;
  declaredOperations?: unknown[];
  complete?: boolean;
  missingEvidence?: string[];
  missingAssertions?: string[];
  unexpectedAssertions?: string[];
  cleanup?: {
    apiZeroResidue?: boolean;
    uiZeroResidue?: boolean;
    entries?: Array<{ phase?: string }>;
  } | null;
};

export function assessProductCenterSourceRecovery(input: {
  sourcePath: string;
  binding: ProductCenterSourceRecoveryBinding;
  currentImplementationFingerprint?: string | null;
  implementationImpactType?: 'report-only' | 'platform-only' | 'adapter-only' | 'business-implementation' | 'context-change' | 'unknown-impact';
  runtimeStatus?: string | null;
  runtimeEvidence?: ProductCenterSourceRecoveryRuntimeEvidence | null;
  businessRuleConflict?: boolean;
}): SystemTestSourceRecoveryAssessment {
  const evidence = input.runtimeEvidence;
  const requiredClaims = evidence?.claims?.required ?? evidence?.requiredAssertionIds ?? input.binding.assertionIds;
  const observedClaims = evidence?.claims?.observed ?? evidence?.observedAssertionIds ?? [];
  const verifiedClaims = evidence?.claims?.verified ?? evidence?.observedAssertionIds ?? [];
  const caseDefinitionComplete = Boolean(
    input.binding.caseId
      && input.binding.title.trim()
      && input.binding.handlerId
      && (input.binding.preconditions?.length ?? 0) > 0
      && (input.binding.steps?.length ?? 0) > 0
      && (input.binding.expectedResults?.length ?? 0) > 0
      && input.binding.assertionIds.length > 0,
  );
  return assessSystemTestSourceRecovery({
    source: { kind: 'existing-test-case', path: input.sourcePath, caseDefinitionComplete },
    currentIdentity: {
      caseFingerprint: input.binding.bindingFingerprint,
      implementationFingerprint: input.currentImplementationFingerprint ?? null,
      implementationImpactType: input.implementationImpactType,
    },
    runtimeReceipt: evidence ? {
      receiptVersion: evidence.receiptVersion,
      status: input.runtimeStatus === 'passed' ? 'passed' : input.runtimeStatus === 'failed' ? 'failed' : 'not-run',
      caseFingerprint: evidence.caseFingerprint,
      semanticCaseFingerprint: evidence.semanticCaseFingerprint,
      implementationFingerprint: evidence.implementationFingerprint,
      executionContext: evidence.executionContext,
      requiredClaimIds: requiredClaims,
      observedClaimIds: observedClaims,
      verifiedClaimIds: verifiedClaims,
      operationReceipts: evidence.operationReceipts ?? [],
      declaredOperationCount: Math.max(1, evidence.declaredOperations?.length ?? 0),
      evidenceComplete: evidence.complete === true
        && (evidence.missingEvidence?.length ?? 0) === 0
        && (evidence.missingAssertions?.length ?? 0) === 0
        && (evidence.unexpectedAssertions?.length ?? 0) === 0,
      cleanupRequired: input.binding.requiredEvidence.includes('cleanup'),
      cleanup: evidence.cleanup,
    } : null,
    businessRuleConflict: input.businessRuleConflict,
  });
}

export function buildProductCenterRecoveredRule(input: {
  sourcePath: string;
  binding: ProductCenterSourceRecoveryBinding;
  assessment: SystemTestSourceRecoveryAssessment;
  evidence: { path: string; sha256: string; startedAt: string; applicationVersionFingerprint: string | null };
}) {
  if (!input.assessment.promotionAllowed
    || input.assessment.disposition !== 'reconstructed-current-baseline') {
    throw new Error(`PRODUCT_CENTER_SOURCE_RECOVERY_NOT_PROMOTABLE:${input.binding.caseId}`);
  }
  return {
    ruleId: `BR-RECOVERED-${input.binding.caseId}`,
    caseId: input.binding.caseId,
    authority: 'reconstructed-current-baseline' as const,
    originalRequirementRecovered: false,
    source: {
      kind: 'existing-test-case' as const,
      path: input.sourcePath,
      title: input.binding.title,
    },
    semantics: {
      preconditions: input.binding.preconditions ?? [],
      actions: input.binding.steps ?? [],
      outcomes: input.binding.expectedResults ?? [],
      assertionIds: input.binding.assertionIds,
    },
    runtimeEvidence: input.evidence,
  };
}
