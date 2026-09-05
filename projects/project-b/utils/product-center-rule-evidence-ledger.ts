import { createHash } from 'node:crypto';

export type ProductCenterRuleStatus =
  | 'formal'
  | 'legacy'
  | 'provisional'
  | 'observed'
  | 'supported'
  | 'conflict'
  | 'blocked'
  | 'obsolete';

export type ProductCenterCandidateRuleStatus = Exclude<ProductCenterRuleStatus, 'formal' | 'legacy'>;
export type ProductCenterRuleExecutionChannel = 'acceptance' | 'probe' | 'none';
export type ProductCenterRuleValidationDimension = 'positive' | 'negative' | 'boundary' | 'scope';

export type ProductCenterFormalRuleBinding = {
  bindingId: string;
  ruleId: string;
  module: string;
  statement: string;
  linkedCanonicalIds?: string[];
  authority: {
    sourcePath: string;
    section: string;
    matchedText: string;
    fingerprint: string;
    verified: boolean;
    sourceRole?: 'product-confirmed-rule';
  };
};

export type ProductCenterLegacyRuleBinding = {
  bindingId: string;
  ruleId: string;
  module: string;
  statement: string;
  sourceRole: 'legacy-rule-baseline';
  authority: {
    sourcePath: string;
    section: string;
    matchedText: string;
    fingerprint: string;
    textVerified: boolean;
    formallyApproved: false;
  };
};

export type ProductCenterCandidateRule = {
  ruleId: string;
  module: string;
  statement: string;
  conditionClaims: string[];
  actionClaims: string[];
  outcomeClaims: string[];
  sourceIds: string[];
  scope: string[];
  currentStatus: ProductCenterCandidateRuleStatus;
  formalRuleBindingIds: string[];
  legacyRuleBindingIds: string[];
  legacyConflictRuleIds: string[];
  conflictsWithRuleIds: string[];
  requiredValidationDimensions: ProductCenterRuleValidationDimension[];
};

export type ProductCenterRuleExecutionEvidence = {
  evidenceId: string;
  ruleId: string;
  observedAt: string;
  versionFingerprint: string;
  environmentId: string;
  roleId: string;
  dataVariantId: string;
  dimension: ProductCenterRuleValidationDimension;
  result: 'supports' | 'contradicts' | 'inconclusive';
  uiEvidenceIds: string[];
  apiEvidenceIds: string[];
  cleanupVerified: boolean;
};

export type ProductCenterRuleStatusRecommendation = {
  recommendedStatus: ProductCenterCandidateRuleStatus;
  coveredDimensions: ProductCenterRuleValidationDimension[];
  missingDimensions: ProductCenterRuleValidationDimension[];
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
};

export type ProductCenterFormalReviewPolicy = {
  minimumIndependentDataVariants: number;
  minimumDistinctVersionFingerprints: number;
  requireAllValidationDimensions: boolean;
  requireUiEvidence: boolean;
  requireApiEvidence: boolean;
  requireCleanupVerified: boolean;
  maximumContradictions: 0;
};

export type ProductCenterFormalReviewReadiness = {
  status: 'not-ready' | 'ready-for-human-review' | 'blocked-by-conflict';
  triggered: boolean;
  blockers: string[];
  metrics: {
    supportingEvidence: number;
    contradictingEvidence: number;
    independentDataVariants: number;
    distinctVersionFingerprints: number;
    coveredDimensions: ProductCenterRuleValidationDimension[];
    missingDimensions: ProductCenterRuleValidationDimension[];
  };
  policy: ProductCenterFormalReviewPolicy;
};

export type ProductCenterFormalReviewDecision = {
  ruleId: string;
  candidateFingerprint: string;
  decision: 'approve' | 'reject' | 'hold';
  confirmedBy: string;
  decidedAt: string;
  rationale: string;
  approvedStatement?: string;
};

export type ProductCenterFormalReviewQueueItem = {
  ruleId: string;
  module: string;
  statement: string;
  scope: string[];
  sourceIds: string[];
  candidateFingerprint: string;
  formalReview: ProductCenterFormalReviewReadiness;
};

export type ProductCenterReviewedFormalRule = {
  ruleId: string;
  module: string;
  statement: string;
  scope: string[];
  sourceIds: string[];
  candidateFingerprint: string;
  currentStatus: 'formal';
  authority: {
    sourceRole: 'human-formal-review';
    confirmedBy: string;
    decidedAt: string;
    rationale: string;
  };
};

export const defaultProductCenterFormalReviewPolicy: ProductCenterFormalReviewPolicy = {
  minimumIndependentDataVariants: 3,
  minimumDistinctVersionFingerprints: 2,
  requireAllValidationDimensions: true,
  requireUiEvidence: true,
  requireApiEvidence: true,
  requireCleanupVerified: true,
  maximumContradictions: 0,
};

export type ProductCenterRuleRegistry = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-rule-registry';
  summary: {
    legacy: number;
    formal: number;
    candidates: number;
    acceptance: number;
    probe: number;
    none: number;
    conflicts: number;
    legacyDiscrepancies: number;
    readyForFormalReview: number;
  };
  legacyRules: Array<ProductCenterLegacyRuleBinding & {
    sourceKind: 'legacy-rule-baseline';
    currentStatus: 'legacy';
    recommendedStatus: 'legacy';
    executionChannel: 'none';
  }>;
  formalRules: Array<ProductCenterFormalRuleBinding & {
    sourceKind: 'formal-binding';
    currentStatus: 'formal';
    recommendedStatus: 'formal';
    executionChannel: ProductCenterRuleExecutionChannel;
  }>;
  candidates: Array<ProductCenterCandidateRule & {
    sourceKind: 'candidate-ledger';
    recommendedStatus: ProductCenterCandidateRuleStatus;
    executionChannel: ProductCenterRuleExecutionChannel;
    evidenceCoverage: Omit<ProductCenterRuleStatusRecommendation, 'recommendedStatus'>;
    candidateFingerprint: string;
    formalReview: ProductCenterFormalReviewReadiness;
  }>;
};

export function selectProductCenterRuleExecutionChannel(
  status: ProductCenterRuleStatus,
  hasConflict: boolean,
): ProductCenterRuleExecutionChannel {
  if (hasConflict) return 'none';
  if (status === 'formal') return 'acceptance';
  if (status === 'provisional' || status === 'observed' || status === 'supported') return 'probe';
  return 'none';
}

export function recommendProductCenterRuleStatus(
  rule: ProductCenterCandidateRule,
  evidence: readonly ProductCenterRuleExecutionEvidence[],
): ProductCenterRuleStatusRecommendation {
  const applicable = evidence.filter((item) => item.ruleId === rule.ruleId && isCompleteEvidence(item));
  const contradicting = unique(applicable
    .filter((item) => item.result === 'contradicts')
    .map((item) => item.evidenceId));
  const supporting = applicable.filter((item) => item.result === 'supports');
  const seenDataVariants = new Set<string>();
  const independentSupporting = supporting.filter((item) => {
    if (seenDataVariants.has(item.dataVariantId)) return false;
    seenDataVariants.add(item.dataVariantId);
    return true;
  });
  const covered = unique(independentSupporting.map((item) => item.dimension))
    .sort(validationDimensionOrder);
  const missing = rule.requiredValidationDimensions
    .filter((dimension) => !covered.includes(dimension));

  let recommendedStatus: ProductCenterCandidateRuleStatus;
  if (rule.currentStatus === 'blocked' || rule.currentStatus === 'obsolete') {
    recommendedStatus = rule.currentStatus;
  } else if (rule.currentStatus === 'conflict' || contradicting.length > 0 || rule.conflictsWithRuleIds.length > 0) {
    recommendedStatus = 'conflict';
  } else if (independentSupporting.length === 0) {
    recommendedStatus = 'provisional';
  } else if (missing.length === 0) {
    recommendedStatus = 'supported';
  } else {
    recommendedStatus = 'observed';
  }

  return {
    recommendedStatus,
    coveredDimensions: covered,
    missingDimensions: missing,
    supportingEvidenceIds: unique(independentSupporting.map((item) => item.evidenceId)),
    contradictingEvidenceIds: contradicting,
  };
}

export function evaluateProductCenterFormalReviewReadiness(
  rule: ProductCenterCandidateRule,
  evidence: readonly ProductCenterRuleExecutionEvidence[],
  policy: ProductCenterFormalReviewPolicy = defaultProductCenterFormalReviewPolicy,
): ProductCenterFormalReviewReadiness {
  const applicable = evidence.filter((item) => item.ruleId === rule.ruleId);
  const contradicting = applicable.filter((item) => item.result === 'contradicts');
  const supporting = applicable.filter((item) => item.result === 'supports' && evidenceMeetsPolicy(item, policy));
  const coveredDimensions = unique(supporting.map((item) => item.dimension)).sort(validationDimensionOrder);
  const missingDimensions = policy.requireAllValidationDimensions
    ? rule.requiredValidationDimensions.filter((dimension) => !coveredDimensions.includes(dimension))
    : [];
  const dataVariants = unique(supporting.map((item) => item.dataVariantId));
  const versionFingerprints = unique(supporting.map((item) => item.versionFingerprint));
  const blockers: string[] = [];

  if (contradicting.length > policy.maximumContradictions
    || rule.currentStatus === 'conflict'
    || rule.conflictsWithRuleIds.length > 0) {
    blockers.push('CONTRADICTION_OR_RULE_CONFLICT');
  }
  if (missingDimensions.length > 0) blockers.push(`VALIDATION_DIMENSIONS_MISSING:${missingDimensions.join(',')}`);
  if (dataVariants.length < policy.minimumIndependentDataVariants) {
    blockers.push(`INDEPENDENT_DATA_VARIANTS_REQUIRED:${policy.minimumIndependentDataVariants}`);
  }
  if (versionFingerprints.length < policy.minimumDistinctVersionFingerprints) {
    blockers.push(`DISTINCT_VERSION_FINGERPRINTS_REQUIRED:${policy.minimumDistinctVersionFingerprints}`);
  }

  const blockedByConflict = blockers.includes('CONTRADICTION_OR_RULE_CONFLICT');
  const triggered = blockers.length === 0;
  return {
    status: blockedByConflict ? 'blocked-by-conflict' : triggered ? 'ready-for-human-review' : 'not-ready',
    triggered,
    blockers,
    metrics: {
      supportingEvidence: supporting.length,
      contradictingEvidence: contradicting.length,
      independentDataVariants: dataVariants.length,
      distinctVersionFingerprints: versionFingerprints.length,
      coveredDimensions,
      missingDimensions,
    },
    policy: { ...policy },
  };
}

export function fingerprintProductCenterRuleCandidate(input: {
  rule: ProductCenterCandidateRule;
  recommendation: ProductCenterRuleStatusRecommendation;
  formalReview: ProductCenterFormalReviewReadiness;
}): string {
  return createHash('sha256').update(stableJson({
    rule: input.rule,
    recommendation: input.recommendation,
    formalReview: input.formalReview,
  })).digest('hex');
}

export function buildProductCenterFormalReviewQueue(
  registry: ProductCenterRuleRegistry,
): ProductCenterFormalReviewQueueItem[] {
  return registry.candidates
    .filter((candidate) => candidate.formalReview.triggered)
    .map((candidate) => ({
      ruleId: candidate.ruleId,
      module: candidate.module,
      statement: candidate.statement,
      scope: [...candidate.scope],
      sourceIds: [...candidate.sourceIds],
      candidateFingerprint: candidate.candidateFingerprint,
      formalReview: candidate.formalReview,
    }));
}

export function compileProductCenterReviewedFormalRules(
  registry: ProductCenterRuleRegistry,
  decisions: readonly ProductCenterFormalReviewDecision[],
): ProductCenterReviewedFormalRule[] {
  const candidates = new Map(registry.candidates.map((candidate) => [candidate.ruleId, candidate]));
  const duplicateRuleIds = decisions
    .map((decision) => decision.ruleId)
    .filter((ruleId, index, all) => all.indexOf(ruleId) !== index);
  if (duplicateRuleIds.length > 0) throw new Error(`正式规则审核决定重复：${unique(duplicateRuleIds).join(',')}`);

  return decisions.flatMap((decision): ProductCenterReviewedFormalRule[] => {
    const candidate = candidates.get(decision.ruleId);
    if (!candidate) throw new Error(`正式规则审核指向未知候选：${decision.ruleId}`);
    if (!decision.confirmedBy.trim() || !decision.rationale.trim() || !isIsoDate(decision.decidedAt)) {
      throw new Error(`正式规则审核信息不完整：${decision.ruleId}`);
    }
    if (decision.candidateFingerprint !== candidate.candidateFingerprint) {
      throw new Error(`正式规则审核候选指纹已过期：${decision.ruleId}`);
    }
    if (decision.decision !== 'approve') return [];
    if (!candidate.formalReview.triggered) {
      throw new Error(`候选规则尚未达到人工审核门禁：${decision.ruleId}`);
    }
    if (decision.approvedStatement !== candidate.statement) {
      throw new Error(`批准表述必须与当前候选完全一致：${decision.ruleId}`);
    }
    return [{
      ruleId: candidate.ruleId,
      module: candidate.module,
      statement: candidate.statement,
      scope: [...candidate.scope],
      sourceIds: [...candidate.sourceIds],
      candidateFingerprint: candidate.candidateFingerprint,
      currentStatus: 'formal',
      authority: {
        sourceRole: 'human-formal-review',
        confirmedBy: decision.confirmedBy,
        decidedAt: decision.decidedAt,
        rationale: decision.rationale,
      },
    }];
  });
}

export function buildProductCenterRuleRegistry(input: {
  formalBindings: readonly ProductCenterFormalRuleBinding[];
  legacyBindings?: readonly ProductCenterLegacyRuleBinding[];
  candidates: readonly ProductCenterCandidateRule[];
  evidence: readonly ProductCenterRuleExecutionEvidence[];
}): ProductCenterRuleRegistry {
  const legacyRules = (input.legacyBindings ?? []).map((binding) => ({
    ...binding,
    sourceKind: 'legacy-rule-baseline' as const,
    currentStatus: 'legacy' as const,
    recommendedStatus: 'legacy' as const,
    executionChannel: 'none' as const,
  }));
  const formalRules = input.formalBindings.map((binding) => ({
    ...binding,
    sourceKind: 'formal-binding' as const,
    currentStatus: 'formal' as const,
    recommendedStatus: 'formal' as const,
    executionChannel: selectProductCenterRuleExecutionChannel('formal', false),
  }));
  const candidates = input.candidates.map((candidate) => {
    const recommendation = recommendProductCenterRuleStatus(candidate, input.evidence);
    const formalReview = evaluateProductCenterFormalReviewReadiness(candidate, input.evidence);
    const invalidFormalStatus = (candidate.currentStatus as ProductCenterRuleStatus) === 'formal';
    const hasConflict = candidate.conflictsWithRuleIds.length > 0
      || recommendation.recommendedStatus === 'conflict';
    return {
      ...candidate,
      sourceKind: 'candidate-ledger' as const,
      recommendedStatus: recommendation.recommendedStatus,
      executionChannel: invalidFormalStatus
        ? 'none' as const
        : selectProductCenterRuleExecutionChannel(candidate.currentStatus, hasConflict),
      evidenceCoverage: {
        coveredDimensions: recommendation.coveredDimensions,
        missingDimensions: recommendation.missingDimensions,
        supportingEvidenceIds: recommendation.supportingEvidenceIds,
        contradictingEvidenceIds: recommendation.contradictingEvidenceIds,
      },
      candidateFingerprint: fingerprintProductCenterRuleCandidate({
        rule: candidate,
        recommendation,
        formalReview,
      }),
      formalReview,
    };
  });
  const all = [...legacyRules, ...formalRules, ...candidates];
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-rule-registry',
    summary: {
      legacy: legacyRules.length,
      formal: formalRules.length,
      candidates: candidates.length,
      acceptance: all.filter((item) => item.executionChannel === 'acceptance').length,
      probe: all.filter((item) => item.executionChannel === 'probe').length,
      none: all.filter((item) => item.executionChannel === 'none').length,
      conflicts: candidates.filter((item) => item.recommendedStatus === 'conflict').length,
      legacyDiscrepancies: candidates.filter((item) => item.legacyConflictRuleIds.length > 0).length,
      readyForFormalReview: candidates.filter((item) => item.formalReview.triggered).length,
    },
    legacyRules,
    formalRules,
    candidates,
  };
}

export function validateProductCenterRuleRegistry(registry: ProductCenterRuleRegistry): string[] {
  const errors: string[] = [];
  const legacyRuleIds = registry.legacyRules.map((item) => item.ruleId);
  const formalRuleIds = registry.formalRules.map((item) => item.ruleId);
  const candidateRuleIds = registry.candidates.map((item) => item.ruleId);
  const bindingIds = new Set(registry.formalRules.map((item) => item.bindingId));
  const legacyBindingIds = new Set(registry.legacyRules.map((item) => item.bindingId));
  // A migrated legacy rule intentionally keeps its historical ID while the
  // current formal binding takes over that ID. Duplicate IDs are still invalid
  // within one namespace, or between candidates and either authoritative set.
  const duplicateInNamespace = (ids: readonly string[]) => new Set(ids).size !== ids.length;
  const legacySet = new Set(legacyRuleIds);
  const formalSet = new Set(formalRuleIds);
  const candidateSet = new Set(candidateRuleIds);
  const candidateOverlapsAuthoritative = candidateRuleIds.some((id) => legacySet.has(id) || formalSet.has(id));
  if (duplicateInNamespace(legacyRuleIds)
    || duplicateInNamespace(formalRuleIds)
    || duplicateInNamespace(candidateRuleIds)
    || candidateOverlapsAuthoritative) errors.push('RULE_ID_DUPLICATE');
  if (bindingIds.size !== registry.formalRules.length) errors.push('FORMAL_BINDING_ID_DUPLICATE');
  if (legacyBindingIds.size !== registry.legacyRules.length) errors.push('LEGACY_BINDING_ID_DUPLICATE');

  for (const rule of registry.legacyRules) {
    if (rule.sourceRole !== 'legacy-rule-baseline'
      || !rule.authority.textVerified
      || rule.authority.formallyApproved
      || !rule.authority.sourcePath.trim()
      || !rule.authority.section.trim()
      || !rule.authority.matchedText.trim()
      || !/^[a-f0-9]{64}$/i.test(rule.authority.fingerprint)) {
      errors.push(`${rule.ruleId}:LEGACY_AUTHORITY_REQUIRED`);
    }
    if (rule.executionChannel !== 'none') {
      errors.push(`${rule.ruleId}:LEGACY_EXECUTION_FORBIDDEN`);
    }
  }

  for (const rule of registry.formalRules) {
    if (!rule.authority.verified
      || !rule.authority.sourcePath.trim()
      || !rule.authority.section.trim()
      || !rule.authority.matchedText.trim()
      || !/^[a-f0-9]{64}$/i.test(rule.authority.fingerprint)) {
      errors.push(`${rule.ruleId}:FORMAL_AUTHORITY_REQUIRED`);
    }
    if (rule.linkedCanonicalIds && (
      rule.linkedCanonicalIds.length === 0
      || new Set(rule.linkedCanonicalIds).size !== rule.linkedCanonicalIds.length
      || rule.linkedCanonicalIds.some((canonicalId) => !/^TC-ITEM-(?:STD|PKG|ADD)-\d{3}$/.test(canonicalId))
    )) {
      errors.push(`${rule.ruleId}:FORMAL_CANONICAL_LINK_INVALID`);
    }
    if (rule.executionChannel !== 'acceptance') {
      errors.push(`${rule.ruleId}:FORMAL_ACCEPTANCE_CHANNEL_REQUIRED`);
    }
  }

  for (const rule of registry.candidates) {
    if ((rule.currentStatus as ProductCenterRuleStatus) === 'formal') {
      errors.push(`${rule.ruleId}:CANDIDATE_STATUS_FORMAL_FORBIDDEN`);
    }
    if (rule.sourceIds.length === 0
      || rule.conditionClaims.length === 0
      || rule.actionClaims.length === 0
      || rule.outcomeClaims.length === 0) {
      errors.push(`${rule.ruleId}:CANDIDATE_CLAIM_SOURCE_REQUIRED`);
    }
    for (const bindingId of rule.formalRuleBindingIds) {
      if (!bindingIds.has(bindingId)) errors.push(`${rule.ruleId}:UNKNOWN_FORMAL_BINDING:${bindingId}`);
    }
    for (const bindingId of rule.legacyRuleBindingIds) {
      if (!legacyBindingIds.has(bindingId)) errors.push(`${rule.ruleId}:UNKNOWN_LEGACY_BINDING:${bindingId}`);
    }
    for (const ruleId of rule.legacyConflictRuleIds) {
      if (!registry.legacyRules.some((legacyRule) => legacyRule.ruleId === ruleId)) {
        errors.push(`${rule.ruleId}:UNKNOWN_LEGACY_CONFLICT:${ruleId}`);
      }
    }
    if (rule.executionChannel === 'acceptance') {
      errors.push(`${rule.ruleId}:CANDIDATE_ACCEPTANCE_CHANNEL_FORBIDDEN`);
    }
    if (!/^[a-f0-9]{64}$/i.test(rule.candidateFingerprint)) {
      errors.push(`${rule.ruleId}:CANDIDATE_FINGERPRINT_INVALID`);
    }
    if (rule.formalReview.triggered && rule.formalReview.status !== 'ready-for-human-review') {
      errors.push(`${rule.ruleId}:FORMAL_REVIEW_STATE_INVALID`);
    }
  }
  return errors;
}

function isCompleteEvidence(evidence: ProductCenterRuleExecutionEvidence): boolean {
  return Boolean(
    evidence.evidenceId.trim()
    && evidence.observedAt.trim()
    && /^[a-f0-9]{64}$/i.test(evidence.versionFingerprint)
    && evidence.environmentId.trim()
    && evidence.roleId.trim()
    && evidence.dataVariantId.trim()
    && evidence.uiEvidenceIds.length > 0
    && evidence.apiEvidenceIds.length > 0
    && evidence.cleanupVerified,
  );
}

function evidenceMeetsPolicy(
  evidence: ProductCenterRuleExecutionEvidence,
  policy: ProductCenterFormalReviewPolicy,
): boolean {
  return Boolean(
    evidence.evidenceId.trim()
    && evidence.observedAt.trim()
    && /^[a-f0-9]{64}$/i.test(evidence.versionFingerprint)
    && evidence.environmentId.trim()
    && evidence.roleId.trim()
    && evidence.dataVariantId.trim()
    && (!policy.requireUiEvidence || evidence.uiEvidenceIds.length > 0)
    && (!policy.requireApiEvidence || evidence.apiEvidenceIds.length > 0)
    && (!policy.requireCleanupVerified || evidence.cleanupVerified),
  );
}

function validationDimensionOrder(
  left: ProductCenterRuleValidationDimension,
  right: ProductCenterRuleValidationDimension,
): number {
  const order: ProductCenterRuleValidationDimension[] = ['positive', 'negative', 'boundary', 'scope'];
  return order.indexOf(left) - order.indexOf(right);
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function isIsoDate(value: string): boolean {
  return Boolean(value.trim() && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value);
}
