export type SystemTestSourceRecoveryDisposition =
  | 'reconstructed-current-baseline'
  | 'source-recovery-pending'
  | 'business-decision-required'
  | 'invalid-recovery-source';

export type SystemTestSourceRecoveryInput = {
  source: {
    kind: 'existing-test-case' | 'original-requirement' | 'runtime-observation-only' | 'automation-code';
    path: string;
    caseDefinitionComplete: boolean;
  };
  currentIdentity: {
    caseFingerprint: string;
    semanticCaseFingerprint?: string | null;
    implementationFingerprint?: string | null;
    implementationImpactType?: 'report-only' | 'platform-only' | 'adapter-only' | 'business-implementation' | 'context-change' | 'unknown-impact';
  };
  runtimeReceipt?: {
    receiptVersion?: string | null;
    status: 'passed' | 'failed' | 'not-run';
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
    requiredClaimIds: readonly string[];
    observedClaimIds: readonly string[];
    verifiedClaimIds: readonly string[];
    operationReceipts: ReadonlyArray<{
      operationKey?: string | null;
      method?: string | null;
      observed?: boolean;
      status?: string | null;
    }>;
    declaredOperationCount: number;
    evidenceComplete: boolean;
    cleanupRequired: boolean;
    cleanup?: {
      apiZeroResidue?: boolean;
      uiZeroResidue?: boolean;
      notRequiredNoCreatedData?: boolean;
    } | null;
  } | null;
  businessRuleConflict?: boolean;
};

export type SystemTestSourceRecoveryAssessment = {
  disposition: SystemTestSourceRecoveryDisposition;
  executionAllowed: boolean;
  promotionAllowed: boolean;
  humanRequired: boolean;
  sourceAuthority: 'reconstructed-current-baseline' | 'unverified-existing-case' | 'business-owner' | 'none';
  reasonCodes: string[];
};

const SUPPORTED_RECEIPT_VERSIONS = new Set(['3.1.0', '3.2.0', '4.0.0']);

export function assessSystemTestSourceRecovery(
  input: SystemTestSourceRecoveryInput,
): SystemTestSourceRecoveryAssessment {
  const invalidSourceReasons: string[] = [];
  if (!input.source.path.trim()) invalidSourceReasons.push('RECOVERY_SOURCE_PATH_REQUIRED');
  if (!input.source.caseDefinitionComplete) invalidSourceReasons.push('RECOVERY_CASE_DEFINITION_INCOMPLETE');
  if (input.source.kind === 'automation-code') invalidSourceReasons.push('AUTOMATION_CODE_CANNOT_AUTHORIZE_BUSINESS_SOURCE');
  if (input.source.kind === 'runtime-observation-only') invalidSourceReasons.push('RUNTIME_OBSERVATION_REQUIRES_EXISTING_CASE_SOURCE');
  if (invalidSourceReasons.length > 0) {
    return result('invalid-recovery-source', false, false, false, 'none', invalidSourceReasons);
  }

  if (input.businessRuleConflict === true) {
    return result(
      'business-decision-required', false, false, true, 'business-owner', ['BUSINESS_RULE_CONFLICT'],
    );
  }

  const receipt = input.runtimeReceipt;
  const pendingReasons: string[] = [];
  if (!receipt) pendingReasons.push('CURRENT_STANDARD_RECEIPT_REQUIRED');
  else {
    if (!SUPPORTED_RECEIPT_VERSIONS.has(receipt.receiptVersion ?? '')) {
      pendingReasons.push('RUNTIME_RECEIPT_VERSION_UNSUPPORTED');
    }
    if (receipt.status !== 'passed') pendingReasons.push('RUNTIME_PASS_REQUIRED');
    const semanticExpected = normalizeFingerprint(input.currentIdentity.semanticCaseFingerprint);
    const semanticActual = normalizeFingerprint(receipt.semanticCaseFingerprint);
    const effectiveExpected = normalizeFingerprint(input.currentIdentity.caseFingerprint);
    const effectiveActual = normalizeFingerprint(receipt.caseFingerprint);
    if (semanticExpected) {
      if (semanticActual !== semanticExpected) pendingReasons.push('RUNTIME_SEMANTIC_CASE_FINGERPRINT_MISMATCH');
    } else if (!effectiveExpected || effectiveActual !== effectiveExpected) {
      pendingReasons.push('RUNTIME_CASE_FINGERPRINT_MISMATCH');
    }
    const implementationExpected = normalizeFingerprint(input.currentIdentity.implementationFingerprint);
    const implementationReuseAllowed = input.currentIdentity.implementationImpactType === 'report-only'
      || input.currentIdentity.implementationImpactType === 'platform-only';
    if (!implementationReuseAllowed && implementationExpected
      && normalizeFingerprint(receipt.implementationFingerprint) !== implementationExpected) {
      pendingReasons.push('RUNTIME_IMPLEMENTATION_FINGERPRINT_MISMATCH');
    }
    if (!executionContextComplete(receipt.executionContext)) pendingReasons.push('RUNTIME_EXECUTION_CONTEXT_INCOMPLETE');
    if (!receipt.evidenceComplete) pendingReasons.push('RUNTIME_EVIDENCE_INCOMPLETE');
    if (!sameSet(receipt.requiredClaimIds, receipt.observedClaimIds)
      || !sameSet(receipt.requiredClaimIds, receipt.verifiedClaimIds)) {
      pendingReasons.push('RUNTIME_CLAIMS_INCOMPLETE');
    }
    if (receipt.declaredOperationCount > 0 && (
      receipt.operationReceipts.length === 0
      || receipt.operationReceipts.some((item) => (
        !item.operationKey || !item.method || item.observed !== true || item.status !== 'passed'
      ))
    )) {
      pendingReasons.push('RUNTIME_OPERATION_RECEIPTS_INCOMPLETE');
    }
    if (receipt.cleanupRequired && !(
      receipt.cleanup?.notRequiredNoCreatedData === true
      || (receipt.cleanup?.apiZeroResidue === true && receipt.cleanup?.uiZeroResidue === true)
    )) {
      pendingReasons.push('RUNTIME_CLEANUP_INCOMPLETE');
    }
  }

  if (pendingReasons.length > 0) {
    return result(
      'source-recovery-pending', true, false, false, 'unverified-existing-case', pendingReasons,
    );
  }
  return result(
    'reconstructed-current-baseline', false, true, false, 'reconstructed-current-baseline', [],
  );
}

function result(
  disposition: SystemTestSourceRecoveryDisposition,
  executionAllowed: boolean,
  promotionAllowed: boolean,
  humanRequired: boolean,
  sourceAuthority: SystemTestSourceRecoveryAssessment['sourceAuthority'],
  reasonCodes: readonly string[],
): SystemTestSourceRecoveryAssessment {
  return {
    disposition,
    executionAllowed,
    promotionAllowed,
    humanRequired,
    sourceAuthority,
    reasonCodes: [...new Set(reasonCodes)].sort(),
  };
}

function executionContextComplete(
  context: SystemTestSourceRecoveryInput['runtimeReceipt'] extends infer _ ? {
    applicationVersionFingerprint?: string | null;
    environmentId?: string | null;
    tenantScope?: string | null;
    locale?: string | null;
    roleId?: string | null;
    route?: string | null;
  } | null | undefined : never,
): boolean {
  if (!context || !normalizeFingerprint(context.applicationVersionFingerprint)) return false;
  return [context.environmentId, context.tenantScope, context.locale, context.roleId, context.route]
    .every((value) => typeof value === 'string' && value.trim().length > 0);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return [...new Set(left)].sort().join('\n') === [...new Set(right)].sort().join('\n');
}

function normalizeFingerprint(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^sha256:/i, '').toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}
