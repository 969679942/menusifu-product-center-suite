export type ProductCenterRuntimeAcceptanceInput = {
  collectionId: string;
  fingerprint: string;
  recipes: readonly { recipeId: string; claimIds: readonly string[] }[];
  feedback?: {
    fingerprint?: string;
    entries?: readonly { recipeId?: string; caseId?: string; status?: string }[];
  };
  evidence?: {
    fingerprint?: string;
    entries?: readonly {
      recipeId?: string;
      caseId?: string;
      expectedClaimIds?: readonly string[];
      verifiedClaimIds?: readonly string[];
      duplicateVerifiedClaimIds?: readonly string[];
      claimCoverageComplete?: boolean;
      sidebarEntryVerified?: boolean;
    }[];
  };
  safety: {
    incompleteCheckpoints: number;
    sensitiveFindings: number;
    authStateArtifacts: number;
    forbiddenPatterns: number;
  };
};

export function evaluateProductCenterRuntimeAcceptance(input: ProductCenterRuntimeAcceptanceInput) {
  const globalIssues: string[] = [];
  if (input.feedback?.fingerprint !== input.fingerprint) globalIssues.push('FEEDBACK_FINGERPRINT_MISMATCH');
  if (input.evidence?.fingerprint !== input.fingerprint) globalIssues.push('EVIDENCE_FINGERPRINT_MISMATCH');
  const feedback = new Map((input.feedback?.entries ?? []).map((entry) => [entry.recipeId, entry]));
  const evidence = new Map((input.evidence?.entries ?? []).map((entry) => [entry.recipeId, entry]));
  const caseAcceptance: Array<{
    recipeId: string;
    caseId: string;
    accepted: boolean;
    issues: string[];
  }> = [];
  for (const recipe of input.recipes) {
    const recipeId = recipe.recipeId;
    const feedbackEntry = feedback.get(recipeId);
    const evidenceEntry = evidence.get(recipeId);
    const recipeIssues: string[] = [];
    if (feedbackEntry?.status !== 'passed') recipeIssues.push(`RECIPE_NOT_PASSED:${recipeId}`);
    const expectedClaimIds = evidenceEntry?.expectedClaimIds ?? [];
    const verifiedClaimIds = evidenceEntry?.verifiedClaimIds ?? [];
    const hasDuplicateVerifiedClaims = hasDuplicates(verifiedClaimIds)
      || (evidenceEntry?.duplicateVerifiedClaimIds?.length ?? 0) > 0;
    const claimVerificationMatches = sameUniqueSet(recipe.claimIds, expectedClaimIds)
      && sameUniqueSet(recipe.claimIds, verifiedClaimIds)
      && !hasDuplicates(recipe.claimIds)
      && !hasDuplicates(expectedClaimIds)
      && !hasDuplicateVerifiedClaims;
    if (!claimVerificationMatches) recipeIssues.push(`CLAIM_VERIFICATION_MISMATCH:${recipeId}`);
    if (hasDuplicateVerifiedClaims) recipeIssues.push(`DUPLICATE_VERIFIED_CLAIMS:${recipeId}`);
    if (!claimVerificationMatches || !evidenceEntry?.claimCoverageComplete) {
      recipeIssues.push(`CLAIM_COVERAGE_INCOMPLETE:${recipeId}`);
    }
    if (!evidenceEntry?.sidebarEntryVerified) recipeIssues.push(`SIDEBAR_ENTRY_NOT_VERIFIED:${recipeId}`);
    if (feedbackEntry?.caseId && evidenceEntry?.caseId && feedbackEntry.caseId !== evidenceEntry.caseId) {
      recipeIssues.push(`CASE_ID_MISMATCH:${recipeId}`);
    }
    const caseId = feedbackEntry?.caseId ?? evidenceEntry?.caseId ?? recipeId;
    caseAcceptance.push({
      recipeId,
      caseId,
      accepted: globalIssues.length === 0 && recipeIssues.length === 0,
      issues: recipeIssues,
    });
  }
  if (input.safety.incompleteCheckpoints > 0) globalIssues.push(`INCOMPLETE_CHECKPOINTS:${input.safety.incompleteCheckpoints}`);
  if (input.safety.sensitiveFindings > 0) globalIssues.push(`SENSITIVE_FINDINGS:${input.safety.sensitiveFindings}`);
  if (input.safety.authStateArtifacts > 0) globalIssues.push(`AUTH_STATE_ARTIFACTS:${input.safety.authStateArtifacts}`);
  if (input.safety.forbiddenPatterns > 0) globalIssues.push(`FORBIDDEN_PATTERNS:${input.safety.forbiddenPatterns}`);
  if (globalIssues.length > 0) {
    for (const item of caseAcceptance) item.accepted = false;
  }
  const issues = [
    ...globalIssues,
    ...caseAcceptance.flatMap((item) => item.issues),
  ];
  const accepted = issues.length === 0;
  return {
    collectionId: input.collectionId,
    accepted,
    acceptedCaseIds: caseAcceptance.filter((item) => item.accepted).map((item) => item.caseId).sort(),
    caseAcceptance,
    issues,
  };
}

function sameUniqueSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}
