type ProductCenterDataContractBase = {
  id: string;
  adapterId: string;
  sourcePaths: string[];
  adapterRegistered: boolean;
};

export type ProductCenterFactoryContractCandidate = ProductCenterDataContractBase & {
  requiredPrefix: string;
  returnsServerId: boolean;
  registersDependencyIds: boolean;
  reconciliationSupported?: boolean;
  retryReconciliationSupported?: boolean;
};

export type ProductCenterCleanupContractCandidate = ProductCenterDataContractBase & {
  identityVariants?: string[];
  verifiesApiAbsence?: boolean;
  verifiesUiAbsence?: boolean;
  finallyCleanupGuaranteed?: boolean;
  verifiesApiCountZero?: boolean;
  verifiesUiCountZero?: boolean;
};

export type ProductCenterFactoryContract = ReturnType<typeof promoteProductCenterFactoryContract>;
export type ProductCenterCleanupContract = ReturnType<typeof promoteProductCenterCleanupContract>;

export function promoteProductCenterFactoryContract(candidate: ProductCenterFactoryContractCandidate) {
  const issues: string[] = baseIssues(candidate);
  const reconciliationSupported = candidate.reconciliationSupported === true
    || candidate.retryReconciliationSupported === true;
  if (candidate.requiredPrefix !== 'AUTO_AUDIT_') issues.push('AUTO_AUDIT_PREFIX_REQUIRED');
  if (!candidate.returnsServerId) issues.push('SERVER_ID_REQUIRED');
  if (!candidate.registersDependencyIds) issues.push('DEPENDENCY_IDS_REQUIRED');
  if (!reconciliationSupported) {
    issues.push(candidate.retryReconciliationSupported !== undefined
      ? 'RETRY_RECONCILIATION_REQUIRED'
      : 'RECONCILIATION_REQUIRED');
  }
  const generationAllowed = issues.length === 0;
  return {
    ...candidate,
    id: candidate.id,
    status: generationAllowed ? 'confirmed' as const : 'provisional' as const,
    sourceType: 'implementation-contract' as const,
    confidence: generationAllowed ? 1 : 0.5,
    generationAllowed,
    source: candidate.sourcePaths.map((sourcePath) => ({ path: sourcePath })),
    evidence: {
      adapterId: candidate.adapterId,
      requiredPrefix: candidate.requiredPrefix,
      returnsServerId: candidate.returnsServerId,
      registersDependencyIds: candidate.registersDependencyIds,
      reconciliationSupported,
      retryReconciliationSupported: candidate.retryReconciliationSupported ?? reconciliationSupported,
    },
    reconciliationSupported,
    retryReconciliationSupported: candidate.retryReconciliationSupported ?? reconciliationSupported,
    issues,
    version: '1.0.0',
  };
}

export function promoteProductCenterCleanupContract(candidate: ProductCenterCleanupContractCandidate) {
  const issues: string[] = baseIssues(candidate);
  const identityVariants = candidate.identityVariants ?? [];
  const variants = new Set(identityVariants);
  const usesIdentityProfile = candidate.identityVariants !== undefined
    || candidate.verifiesApiAbsence !== undefined
    || candidate.verifiesUiAbsence !== undefined;
  const usesCountZeroProfile = candidate.finallyCleanupGuaranteed !== undefined
    || candidate.verifiesApiCountZero !== undefined
    || candidate.verifiesUiCountZero !== undefined;
  if (!usesIdentityProfile && !usesCountZeroProfile) issues.push('CLEANUP_PROFILE_REQUIRED');
  if (usesIdentityProfile) {
    if (!variants.has('server-id')) issues.push('SERVER_ID_REQUIRED');
    if (!variants.has('original-identity')) issues.push('ORIGINAL_IDENTITY_REQUIRED');
    if (!variants.has('edited-identity')) issues.push('EDITED_IDENTITY_REQUIRED');
    if (!variants.has('generated-alias')) issues.push('GENERATED_ALIAS_REQUIRED');
    if (!candidate.verifiesApiAbsence) issues.push('API_ABSENCE_REQUIRED');
    if (!candidate.verifiesUiAbsence) issues.push('UI_ABSENCE_REQUIRED');
  }
  if (usesCountZeroProfile) {
    if (!candidate.finallyCleanupGuaranteed) issues.push('FINALLY_CLEANUP_GUARANTEED_REQUIRED');
    if (!candidate.verifiesApiCountZero) issues.push('API_COUNT_ZERO_REQUIRED');
    if (!candidate.verifiesUiCountZero) issues.push('UI_COUNT_ZERO_REQUIRED');
  }
  const generationAllowed = issues.length === 0;
  return {
    ...candidate,
    id: candidate.id,
    status: generationAllowed ? 'confirmed' as const : 'provisional' as const,
    sourceType: 'implementation-contract' as const,
    confidence: generationAllowed ? 1 : 0.5,
    generationAllowed,
    source: candidate.sourcePaths.map((sourcePath) => ({ path: sourcePath })),
    evidence: {
      adapterId: candidate.adapterId,
      residueVerification: [...identityVariants],
      verifiesApiAbsence: candidate.verifiesApiAbsence ?? false,
      verifiesUiAbsence: candidate.verifiesUiAbsence ?? false,
      finallyCleanupGuaranteed: candidate.finallyCleanupGuaranteed ?? false,
      verifiesApiCountZero: candidate.verifiesApiCountZero ?? false,
      verifiesUiCountZero: candidate.verifiesUiCountZero ?? false,
    },
    identityVariants: [...identityVariants],
    verifiesApiAbsence: candidate.verifiesApiAbsence ?? false,
    verifiesUiAbsence: candidate.verifiesUiAbsence ?? false,
    finallyCleanupGuaranteed: candidate.finallyCleanupGuaranteed ?? false,
    verifiesApiCountZero: candidate.verifiesApiCountZero ?? false,
    verifiesUiCountZero: candidate.verifiesUiCountZero ?? false,
    issues,
    version: '1.0.0',
  };
}

function baseIssues(candidate: ProductCenterDataContractBase): string[] {
  const issues: string[] = [];
  if (!candidate.id.trim()) issues.push('CONTRACT_ID_REQUIRED');
  if (candidate.sourcePaths.length === 0) issues.push('SOURCE_REQUIRED');
  if (!candidate.adapterId.trim()) issues.push('ADAPTER_REQUIRED');
  if (!candidate.adapterRegistered) issues.push('ADAPTER_NOT_REGISTERED');
  return issues;
}
