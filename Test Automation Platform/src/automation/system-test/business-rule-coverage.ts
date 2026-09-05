export type BusinessRuleCoverageDimension =
  | 'precondition'
  | 'condition-partition'
  | 'operation'
  | 'state-transition'
  | 'scope-variant'
  | 'constraint'
  | 'outcome'
  | 'assertion-surface'
  | 'side-effect'
  | 'cleanup';

export type BusinessRuleCoverageLayer = 'business-behavior' | 'execution-safety';

export type BusinessRuleCoverageApplicability = 'required' | 'optional' | 'not-applicable';

export type BusinessRuleCoverageDispositionEvidence = {
  sourceIds: string[];
  approvedBy: string;
  rationale: string;
};

export type BusinessRuleCoverageObligation = {
  obligationId: string;
  ruleId: string;
  dimension: BusinessRuleCoverageDimension;
  layer: BusinessRuleCoverageLayer;
  statement: string;
  applicability: BusinessRuleCoverageApplicability;
  sourceIds: string[];
  assertionSurfaceIds: string[];
  dispositionEvidence?: BusinessRuleCoverageDispositionEvidence;
};

export type BusinessRuleCoverageClaimKind = 'test-case' | 'automation-binding';

export type BusinessRuleCoverageCaseClaim = {
  claimId: string;
  ruleId: string;
  caseId: string;
  kind: BusinessRuleCoverageClaimKind;
  obligationIds: string[];
  sourceIds: string[];
};

export type BusinessRuleCoverageCurrentIdentity = {
  caseId: string;
  caseFingerprint: string;
  implementationFingerprint: string;
  executionContextFingerprint: string;
};

export type BusinessRuleCoverageEvidence = {
  evidenceId: string;
  caseId: string;
  executionStatus: 'passed' | 'failed' | 'blocked';
  evidenceStatus: 'complete' | 'incomplete';
  caseFingerprint: string;
  implementationFingerprint: string;
  executionContextFingerprint: string;
  verifiedObligationIds: string[];
  assertionSurfaceIdsObserved: string[];
};

export type BusinessRuleCoverageMaturity =
  | 'not-assessed'
  | 'uncovered'
  | 'partial'
  | 'structurally-covered'
  | 'execution-verified';

export type BusinessRuleCoverageAssessment = {
  ruleId: string;
  maturity: BusinessRuleCoverageMaturity;
  mandatoryObligations: number;
  coveredMandatoryObligations: number;
  executionVerifiedMandatoryObligations: number;
  mandatoryCoverageRate: number | null;
  executionVerifiedCoverageRate: number | null;
  coveredObligationIds: string[];
  missingObligationIds: string[];
  executionVerifiedObligationIds: string[];
  structurallyRelevantCaseIds: string[];
  currentEvidenceCaseIds: string[];
  diagnostics: string[];
};

export function assessBusinessRuleCoverage(input: {
  ruleId: string;
  obligations: readonly BusinessRuleCoverageObligation[];
  claims: readonly BusinessRuleCoverageCaseClaim[];
  currentIdentities?: readonly BusinessRuleCoverageCurrentIdentity[];
  evidence?: readonly BusinessRuleCoverageEvidence[];
}): BusinessRuleCoverageAssessment {
  const diagnostics: string[] = [];
  const obligations = input.obligations.filter((item) => item.ruleId === input.ruleId);
  const foreignObligations = input.obligations.filter((item) => item.ruleId !== input.ruleId);
  diagnostics.push(...foreignObligations.map((item) => `OBLIGATION_RULE_MISMATCH:${item.obligationId}`));

  const obligationIds = new Set<string>();
  for (const obligation of obligations) {
    if (obligationIds.has(obligation.obligationId)) diagnostics.push(`OBLIGATION_ID_DUPLICATE:${obligation.obligationId}`);
    obligationIds.add(obligation.obligationId);
    if (!obligation.statement.trim()) diagnostics.push(`OBLIGATION_STATEMENT_REQUIRED:${obligation.obligationId}`);
    if (obligation.sourceIds.length === 0) diagnostics.push(`OBLIGATION_SOURCE_REQUIRED:${obligation.obligationId}`);
    if (obligation.applicability === 'not-applicable') {
      const disposition = obligation.dispositionEvidence;
      if (!disposition
        || disposition.sourceIds.length === 0
        || !disposition.approvedBy.trim()
        || !disposition.rationale.trim()) {
        diagnostics.push(`NOT_APPLICABLE_DISPOSITION_REQUIRED:${obligation.obligationId}`);
      }
    }
  }

  const validClaims: BusinessRuleCoverageCaseClaim[] = [];
  const claimIds = new Set<string>();
  for (const claim of input.claims) {
    if (claim.ruleId !== input.ruleId) {
      diagnostics.push(`CLAIM_RULE_MISMATCH:${claim.claimId}`);
      continue;
    }
    if (claimIds.has(claim.claimId)) diagnostics.push(`CLAIM_ID_DUPLICATE:${claim.claimId}`);
    claimIds.add(claim.claimId);
    if (!claim.caseId.trim()) diagnostics.push(`CLAIM_CASE_REQUIRED:${claim.claimId}`);
    if (claim.sourceIds.length === 0) diagnostics.push(`CLAIM_SOURCE_REQUIRED:${claim.claimId}`);
    const unknown = claim.obligationIds.filter((id) => !obligationIds.has(id));
    if (unknown.length > 0) diagnostics.push(`CLAIM_UNKNOWN_OBLIGATION:${claim.claimId}:${unknown.join('|')}`);
    if (claim.obligationIds.length === 0) diagnostics.push(`CLAIM_OBLIGATION_REQUIRED:${claim.claimId}`);
    if (claim.caseId.trim() && claim.sourceIds.length > 0 && claim.obligationIds.length > 0 && unknown.length === 0) {
      validClaims.push(claim);
    }
  }

  const mandatory = obligations.filter((item) => item.applicability === 'required');
  const covered = mandatory.filter((obligation) => validClaims.some((claim) => claim.obligationIds.includes(obligation.obligationId)));
  const missing = mandatory.filter((obligation) => !covered.includes(obligation));
  const identities = new Map((input.currentIdentities ?? []).map((item) => [item.caseId, item]));
  const evidence = input.evidence ?? [];
  const executionVerified = mandatory.filter((obligation) => validClaims.some((claim) => {
    if (!claim.obligationIds.includes(obligation.obligationId)) return false;
    const identity = identities.get(claim.caseId);
    if (!identity) return false;
    return evidence.some((receipt) => receipt.caseId === claim.caseId
      && receipt.executionStatus === 'passed'
      && receipt.evidenceStatus === 'complete'
      && receipt.caseFingerprint === identity.caseFingerprint
      && receipt.implementationFingerprint === identity.implementationFingerprint
      && receipt.executionContextFingerprint === identity.executionContextFingerprint
      && receipt.verifiedObligationIds.includes(obligation.obligationId)
      && obligation.assertionSurfaceIds.every((id) => receipt.assertionSurfaceIdsObserved.includes(id)));
  }));

  const maturity: BusinessRuleCoverageMaturity = mandatory.length === 0
    ? 'not-assessed'
    : covered.length === 0
      ? 'uncovered'
      : covered.length < mandatory.length
        ? 'partial'
        : executionVerified.length === mandatory.length
          ? 'execution-verified'
          : 'structurally-covered';

  const structurallyRelevantCaseIds = unique(validClaims
    .filter((claim) => claim.obligationIds.some((id) => covered.some((item) => item.obligationId === id)))
    .map((claim) => claim.caseId));
  const currentEvidenceCaseIds = unique(evidence
    .filter((receipt) => {
      const identity = identities.get(receipt.caseId);
      return identity
        && receipt.executionStatus === 'passed'
        && receipt.evidenceStatus === 'complete'
        && receipt.caseFingerprint === identity.caseFingerprint
        && receipt.implementationFingerprint === identity.implementationFingerprint
        && receipt.executionContextFingerprint === identity.executionContextFingerprint;
    })
    .map((item) => item.caseId));

  return {
    ruleId: input.ruleId,
    maturity,
    mandatoryObligations: mandatory.length,
    coveredMandatoryObligations: covered.length,
    executionVerifiedMandatoryObligations: executionVerified.length,
    mandatoryCoverageRate: mandatory.length === 0 ? null : covered.length / mandatory.length,
    executionVerifiedCoverageRate: mandatory.length === 0 ? null : executionVerified.length / mandatory.length,
    coveredObligationIds: covered.map((item) => item.obligationId),
    missingObligationIds: missing.map((item) => item.obligationId),
    executionVerifiedObligationIds: executionVerified.map((item) => item.obligationId),
    structurallyRelevantCaseIds,
    currentEvidenceCaseIds,
    diagnostics: unique(diagnostics),
  };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
