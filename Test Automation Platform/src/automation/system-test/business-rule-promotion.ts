import { createHash } from 'node:crypto';
import type {
  BusinessRuleEffectiveContext,
  BusinessRuleScope,
  BusinessRuleSemantics,
  BusinessRuleSource,
  BusinessRuleType,
} from './business-rule-lifecycle';

/**
 * Formal promotion is intentionally separate from execution verification.
 * A candidate may be reviewed after its source and semantics are complete;
 * current UI/API receipts are evaluated by the execution/evidence contracts.
 */
export type BusinessRulePromotionContextKind = 'explicit' | 'global' | 'unknown';
export type BusinessRulePromotionReadiness = 'green' | 'yellow' | 'red';

export type BusinessRulePromotionCandidate = {
  candidateId: string;
  ruleId: string;
  ruleType: BusinessRuleType;
  statement: string;
  scope: BusinessRuleScope;
  sourceRegistry: BusinessRuleSource[];
  sourceFingerprint: string;
  ruleFingerprint: string;
  effectiveVersion: string | null;
  effectiveContext: BusinessRuleEffectiveContext;
  effectiveContextKind: BusinessRulePromotionContextKind;
  supersedes: string[];
  conflictsWith: string[];
  linkedCaseIds: string[];
  linkedBindingIds: string[];
  requiredObligationIds: string[];
  semantics: BusinessRuleSemantics;
  currentStatus: 'candidate' | 'provisional' | 'observed' | 'supported' | 'conflict' | 'blocked' | 'deprecated';
  candidateKind?: 'normative' | 'ui-contract' | 'api-contract' | 'technical' | 'observed' | 'unknown';
  familyKey?: string;
  sourceCandidateFingerprint?: string;
  executionVerified?: boolean;
};

export type BusinessRulePromotionReadinessResult = {
  candidateId: string;
  ruleId: string;
  status: BusinessRulePromotionReadiness;
  formalPromotionEligible: boolean;
  testGenerationEligible: boolean;
  executionVerified: boolean;
  blockers: string[];
  reviewQuestions: string[];
  clusterKey: string;
};

export type BusinessRulePromotionCluster = {
  clusterId: string;
  clusterKey: string;
  candidateIds: string[];
  greenCandidateIds: string[];
  yellowCandidateIds: string[];
  redCandidateIds: string[];
  exceptionCandidateIds: string[];
  semanticVariants: boolean;
};

export type BusinessRulePromotionManifest = {
  schemaVersion: '1.0.0';
  promotionBatchId: string;
  status: 'dry-run';
  generatedAt: string;
  policyFingerprint: string;
  candidateSnapshotFingerprint: string;
  manifestFingerprint: string;
  summary: {
    total: number;
    green: number;
    yellow: number;
    red: number;
    clusters: number;
    batchApprovalEligible: number;
  };
  clusters: BusinessRulePromotionCluster[];
  candidates: BusinessRulePromotionReadinessResult[];
};

export type BusinessRulePromotionDecision = {
  candidateId: string;
  decision: 'approve' | 'reject' | 'hold';
  approvedBy: string;
  approvedAt: string;
  rationale: string;
  candidateFingerprint: string;
  sourceFingerprint: string;
};

export type BusinessRulePromotionDecisionResult = {
  promotionBatchId: string;
  status: 'approved' | 'partial' | 'rejected';
  approvedCandidateIds: string[];
  rejectedCandidateIds: string[];
  heldCandidateIds: string[];
  diagnostics: string[];
  eventIds: string[];
};

export type BusinessRuleReviewLane = 'batch-approval' | 'individual-review' | 'evidence-remediation';

export type BusinessRuleReviewUnit = {
  unitId: string;
  groupKey: string;
  formalApprovalEligible: boolean;
  semanticConflict: boolean;
  blockerCodes: string[];
  verificationStatus: 'verified' | 'pending';
};

export type BusinessRuleReviewPackage = {
  packageId: string;
  groupKey: string;
  lane: BusinessRuleReviewLane;
  unitIds: string[];
  verifiedUnitIds: string[];
  verificationPendingUnitIds: string[];
  blockerCodes: string[];
};

/**
 * Partitions review units by semantic decision lane before grouping them.
 * A verification gap is deliberately not a semantic-approval blocker, and a
 * blocked sibling may not hold an otherwise review-ready unit in the same
 * package. Product adapters provide the business grouping key only.
 */
export function buildBusinessRuleReviewPackages(
  units: readonly BusinessRuleReviewUnit[],
): BusinessRuleReviewPackage[] {
  const ids = units.map((unit) => unit.unitId.trim());
  if (ids.some((id) => !id)) throw new Error('BUSINESS_RULE_REVIEW_UNIT_ID_REQUIRED');
  if (new Set(ids).size !== ids.length) throw new Error('BUSINESS_RULE_REVIEW_UNIT_ID_DUPLICATE');
  if (units.some((unit) => !unit.groupKey.trim())) throw new Error('BUSINESS_RULE_REVIEW_GROUP_KEY_REQUIRED');

  const packages = new Map<string, BusinessRuleReviewPackage>();
  for (const unit of units) {
    const lane: BusinessRuleReviewLane = unit.semanticConflict
      ? 'individual-review'
      : unit.formalApprovalEligible ? 'batch-approval' : 'evidence-remediation';
    const packageKey = `${unit.groupKey.trim()}|${lane}`;
    const current = packages.get(packageKey) ?? {
      packageId: `business-rule-review-${shortHash(packageKey)}`,
      groupKey: unit.groupKey.trim(),
      lane,
      unitIds: [],
      verifiedUnitIds: [],
      verificationPendingUnitIds: [],
      blockerCodes: [],
    };
    current.unitIds.push(unit.unitId);
    if (unit.verificationStatus === 'verified') current.verifiedUnitIds.push(unit.unitId);
    else current.verificationPendingUnitIds.push(unit.unitId);
    current.blockerCodes.push(...unit.blockerCodes);
    packages.set(packageKey, current);
  }

  const result = [...packages.values()].map((item) => ({
    ...item,
    unitIds: [...item.unitIds].sort(),
    verifiedUnitIds: [...item.verifiedUnitIds].sort(),
    verificationPendingUnitIds: [...item.verificationPendingUnitIds].sort(),
    blockerCodes: [...new Set(item.blockerCodes)].sort(),
  })).sort((left, right) => `${left.groupKey}|${left.lane}`.localeCompare(`${right.groupKey}|${right.lane}`));
  const partitionedIds = result.flatMap((item) => item.unitIds);
  if (partitionedIds.length !== units.length || new Set(partitionedIds).size !== units.length) {
    throw new Error('BUSINESS_RULE_REVIEW_PARTITION_NOT_CONSERVED');
  }
  return result;
}

export function evaluateBusinessRulePromotionReadiness(
  candidate: BusinessRulePromotionCandidate,
): BusinessRulePromotionReadinessResult {
  const blockers: string[] = [];
  const reviewQuestions: string[] = [];
  if (!candidate.candidateId.trim()) blockers.push('CANDIDATE_ID_REQUIRED');
  if (!candidate.ruleId.trim()) blockers.push('RULE_ID_REQUIRED');
  if (candidate.ruleId.trim() && !/^[-A-Z0-9:.]+$/i.test(candidate.ruleId.trim())) blockers.push('RULE_ID_INVALID');
  if (candidate.candidateId.trim() && !/^[-A-Z0-9:.]+$/i.test(candidate.candidateId.trim())) blockers.push('CANDIDATE_ID_INVALID');
  if (!candidate.statement.trim()) blockers.push('STATEMENT_REQUIRED');
  if (!candidate.scope.applicationId.trim() || !candidate.scope.businessDomainId.trim()) {
    blockers.push('SCOPE_IDENTITY_REQUIRED');
  }
  if (candidate.scope.entityTypes.length === 0) blockers.push('ENTITY_SCOPE_REQUIRED');
  if (candidate.scope.operationKeys.length === 0) blockers.push('OPERATION_SCOPE_REQUIRED');
  if ([...candidate.scope.entityTypes, ...candidate.scope.operationKeys, ...candidate.scope.channels]
    .some((value) => !value.trim())) blockers.push('SCOPE_REFERENCE_INVALID');
  if ([
    ...candidate.supersedes,
    ...candidate.conflictsWith,
    ...candidate.linkedCaseIds,
    ...candidate.linkedBindingIds,
    ...candidate.requiredObligationIds,
  ].some((value) => !value.trim())) {
    blockers.push('REFERENCE_ID_INVALID');
  }
  if (candidate.sourceRegistry.length === 0) blockers.push('SOURCE_REGISTRY_REQUIRED');
  const sourceIds = candidate.sourceRegistry.map((source) => source.sourceId.trim());
  if (sourceIds.some((sourceId) => !sourceId)) blockers.push('SOURCE_ID_REQUIRED');
  if (new Set(sourceIds).size !== sourceIds.length) blockers.push('SOURCE_ID_DUPLICATE');
  if (candidate.sourceRegistry.some((source) => !source.path.trim() || !source.locator.trim() || !source.fingerprint.trim())) {
    blockers.push('SOURCE_LOCATION_AND_FINGERPRINT_REQUIRED');
  }
  if (candidate.sourceRegistry.some((source) => !source.verified)) blockers.push('SOURCE_NOT_VERIFIED');
  if (candidate.sourceFingerprint !== fingerprintSources(candidate.sourceRegistry)) {
    blockers.push('SOURCE_FINGERPRINT_STALE');
  }
  if (candidate.ruleFingerprint !== fingerprintCandidateSemantics(candidate)) {
    blockers.push('RULE_FINGERPRINT_STALE');
  }
  if (candidate.currentStatus === 'conflict' || candidate.currentStatus === 'blocked' || candidate.currentStatus === 'deprecated') {
    blockers.push(`CANDIDATE_STATUS_NOT_PROMOTABLE:${candidate.currentStatus}`);
  }
  if (candidate.conflictsWith.length > 0) blockers.push('OPEN_CONFLICT');
  if (candidate.ruleType === 'observed' || candidate.ruleType === 'technical' || candidate.ruleType === 'deferred') {
    blockers.push('RULE_TYPE_NOT_FORMALIZABLE');
  }
  if (candidate.effectiveVersion === null || !candidate.effectiveVersion.trim()) {
    reviewQuestions.push('请补充正式规则的生效版本或明确的当前生产版本。');
  }
  if (candidate.effectiveContextKind === 'unknown') {
    reviewQuestions.push('请确认规则是全局适用，还是限定环境、租户、角色、语言、路由或功能开关。');
  }
  if (candidate.effectiveContextKind === 'explicit'
    && !Object.values(candidate.effectiveContext).some((values) => values.some((value) => value.trim()))) {
    blockers.push('EFFECTIVE_CONTEXT_EMPTY');
  }
  if (candidate.requiredObligationIds.length === 0) reviewQuestions.push('请拆分该规则的必选义务并提供稳定 obligationId。');
  if (candidate.semantics.preconditions.length === 0
    || candidate.semantics.actions.length === 0
    || candidate.semantics.outcomes.length === 0
    || candidate.semantics.assertionSurfaces.length === 0) {
    reviewQuestions.push('请补齐前置条件、操作、可观测结果和断言面；不能根据经验补写。');
  }
  if (candidate.linkedCaseIds.length === 0) reviewQuestions.push('请补充至少一个可追溯正式用例，或明确该规则暂不生成用例。');
  if (candidate.candidateKind === 'ui-contract' || candidate.candidateKind === 'api-contract') {
    reviewQuestions.push('请确认该候选是业务规则，还是仅用于测试/接口合同；测试合同不能自动升级为业务规则。');
  }
  if (candidate.semantics.cleanup.policyStatus !== 'verified') {
    reviewQuestions.push('请补充数据清理策略；这只影响测试生成就绪，不阻断业务语义评审。');
  }

  const hardBlockers = blockers.length > 0;
  const status: BusinessRulePromotionReadiness = hardBlockers
    ? 'red'
    : reviewQuestions.length > 0 ? 'yellow' : 'green';
  const testGenerationEligible = status === 'green'
    && candidate.semantics.cleanup.policyStatus === 'verified'
    && candidate.linkedCaseIds.length > 0
    && candidate.linkedBindingIds.length > 0;
  return {
    candidateId: candidate.candidateId,
    ruleId: candidate.ruleId,
    status,
    formalPromotionEligible: status === 'green',
    testGenerationEligible,
    executionVerified: candidate.executionVerified === true,
    blockers,
    reviewQuestions,
    clusterKey: promotionClusterKey(candidate),
  };
}

export function buildBusinessRulePromotionManifest(input: {
  promotionBatchId: string;
  policyFingerprint: string;
  candidates: readonly BusinessRulePromotionCandidate[];
  generatedAt?: string;
}): BusinessRulePromotionManifest {
  if (!input.promotionBatchId.trim()) throw new Error('PROMOTION_BATCH_ID_REQUIRED');
  if (!input.policyFingerprint.trim()) throw new Error('PROMOTION_POLICY_FINGERPRINT_REQUIRED');
  const ids = input.candidates.map((candidate) => candidate.candidateId);
  if (new Set(ids).size !== ids.length) throw new Error('PROMOTION_CANDIDATE_ID_DUPLICATE');
  const assessments = input.candidates.map(evaluateBusinessRulePromotionReadiness);
  const byKey = new Map<string, BusinessRulePromotionCluster>();
  for (const assessment of assessments) {
    const cluster = byKey.get(assessment.clusterKey) ?? {
      clusterId: `promotion-cluster-${shortHash(assessment.clusterKey)}`,
      clusterKey: assessment.clusterKey,
      candidateIds: [],
      greenCandidateIds: [],
      yellowCandidateIds: [],
      redCandidateIds: [],
      exceptionCandidateIds: [],
      semanticVariants: false,
    };
    cluster.candidateIds.push(assessment.candidateId);
    if (assessment.status === 'green') cluster.greenCandidateIds.push(assessment.candidateId);
    if (assessment.status === 'yellow') cluster.yellowCandidateIds.push(assessment.candidateId);
    if (assessment.status === 'red') cluster.redCandidateIds.push(assessment.candidateId);
    byKey.set(assessment.clusterKey, cluster);
  }
  const clusters = [...byKey.values()].sort((left, right) => left.clusterKey.localeCompare(right.clusterKey));
  const candidateById = new Map(input.candidates.map((candidate) => [candidate.candidateId, candidate]));
  for (const cluster of clusters) {
    const members = cluster.candidateIds
      .map((candidateId) => candidateById.get(candidateId))
      .filter((candidate): candidate is BusinessRulePromotionCandidate => Boolean(candidate));
    const semanticFingerprints = new Set(members.map((candidate) => fingerprintPromotionMeaning(candidate)));
    cluster.semanticVariants = semanticFingerprints.size > 1;
    cluster.exceptionCandidateIds = members
      .filter((candidate) => candidate.conflictsWith.length > 0
        || candidate.currentStatus === 'conflict'
        || candidate.currentStatus === 'blocked'
        || candidate.currentStatus === 'deprecated')
      .map((candidate) => candidate.candidateId)
      .sort();
  }
  // Snapshot the canonical source/semantic content, not only the candidate's
  // self-reported fingerprints. This keeps an old manifest from being reused
  // when a candidate body changes but its stored fingerprint was not rebuilt.
  const snapshot = fingerprint(input.candidates.map(candidateSnapshotEntry)
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId)));
  const manifestBase = {
    schemaVersion: '1.0.0' as const,
    promotionBatchId: input.promotionBatchId,
    status: 'dry-run' as const,
    policyFingerprint: input.policyFingerprint,
    candidateSnapshotFingerprint: snapshot,
    summary: {
      total: assessments.length,
      green: assessments.filter((item) => item.status === 'green').length,
      yellow: assessments.filter((item) => item.status === 'yellow').length,
      red: assessments.filter((item) => item.status === 'red').length,
      clusters: clusters.length,
      batchApprovalEligible: assessments.filter((item) => item.formalPromotionEligible).length,
    },
    clusters,
    candidates: [...assessments].sort((left, right) => left.candidateId.localeCompare(right.candidateId)),
  };
  return {
    ...manifestBase,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    manifestFingerprint: fingerprint(manifestBase),
  };
}

export function applyBusinessRulePromotionDecisions(input: {
  manifest: BusinessRulePromotionManifest;
  candidates: readonly BusinessRulePromotionCandidate[];
  decisions: readonly BusinessRulePromotionDecision[];
}): BusinessRulePromotionDecisionResult {
  const expectedSnapshot = fingerprint(input.candidates.map(candidateSnapshotEntry)
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId)));
  if (input.manifest.candidateSnapshotFingerprint !== expectedSnapshot) throw new Error('PROMOTION_MANIFEST_SNAPSHOT_STALE');
  if (input.manifest.manifestFingerprint !== fingerprint({
    schemaVersion: input.manifest.schemaVersion,
    promotionBatchId: input.manifest.promotionBatchId,
    status: input.manifest.status,
    policyFingerprint: input.manifest.policyFingerprint,
    candidateSnapshotFingerprint: input.manifest.candidateSnapshotFingerprint,
    summary: input.manifest.summary,
    clusters: input.manifest.clusters,
    candidates: input.manifest.candidates,
  })) throw new Error('PROMOTION_MANIFEST_FINGERPRINT_STALE');
  const candidateMap = new Map(input.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const assessmentMap = new Map(input.manifest.candidates.map((assessment) => [assessment.candidateId, assessment]));
  const seen = new Set<string>();
  const approved: string[] = [];
  const rejected: string[] = [];
  const held: string[] = [];
  const diagnostics: string[] = [];
  const eventIds: string[] = [];
  for (const decision of input.decisions) {
    if (seen.has(decision.candidateId)) throw new Error(`PROMOTION_DECISION_DUPLICATE:${decision.candidateId}`);
    seen.add(decision.candidateId);
    const candidate = candidateMap.get(decision.candidateId);
    const assessment = assessmentMap.get(decision.candidateId);
    if (!candidate || !assessment) {
      diagnostics.push(`${decision.candidateId}:UNKNOWN_CANDIDATE`);
      held.push(decision.candidateId);
      continue;
    }
    if (!['approve', 'reject', 'hold'].includes(decision.decision)) {
      throw new Error(`PROMOTION_DECISION_INVALID:${decision.candidateId}`);
    }
    if (decision.candidateFingerprint !== candidate.ruleFingerprint || decision.sourceFingerprint !== candidate.sourceFingerprint) {
      throw new Error(`PROMOTION_DECISION_FINGERPRINT_STALE:${decision.candidateId}`);
    }
    const approvedAt = Date.parse(decision.approvedAt);
    const manifestGeneratedAt = Date.parse(input.manifest.generatedAt);
    if (!decision.approvedBy.trim() || !decision.rationale.trim() || !Number.isFinite(approvedAt)) {
      throw new Error(`PROMOTION_DECISION_INCOMPLETE:${decision.candidateId}`);
    }
    if (Number.isFinite(manifestGeneratedAt) && approvedAt < manifestGeneratedAt) {
      throw new Error(`PROMOTION_DECISION_TIME_ORDER_INVALID:${decision.candidateId}`);
    }
    if (decision.decision === 'approve' && !assessment.formalPromotionEligible) {
      diagnostics.push(`${decision.candidateId}:NOT_FORMAL_PROMOTION_ELIGIBLE`);
      held.push(decision.candidateId);
      continue;
    }
    if (decision.decision === 'approve') approved.push(decision.candidateId);
    if (decision.decision === 'reject') rejected.push(decision.candidateId);
    if (decision.decision === 'hold') held.push(decision.candidateId);
    eventIds.push(`business-rule-promotion:${input.manifest.promotionBatchId}:${decision.candidateId}`);
  }
  // A batch is never considered fully approved when any manifest candidate
  // has no explicit decision. This prevents callers from accidentally
  // approving a subset while silently omitting unresolved candidates.
  for (const candidateId of assessmentMap.keys()) {
    if (seen.has(candidateId)) continue;
    held.push(candidateId);
    diagnostics.push(`${candidateId}:MISSING_DECISION`);
  }
  const status = approved.length > 0 && rejected.length + held.length === 0 ? 'approved'
    : approved.length > 0 ? 'partial' : 'rejected';
  return {
    promotionBatchId: input.manifest.promotionBatchId,
    status,
    approvedCandidateIds: approved.sort(),
    rejectedCandidateIds: rejected.sort(),
    heldCandidateIds: held.sort(),
    diagnostics: diagnostics.sort(),
    eventIds: eventIds.sort(),
  };
}

export function fingerprintBusinessRulePromotionCandidate(candidate: BusinessRulePromotionCandidate): string {
  return fingerprintCandidateSemantics(candidate);
}

export function fingerprintBusinessRulePromotionSources(sources: readonly BusinessRuleSource[]): string {
  return fingerprintSources(sources);
}

function promotionClusterKey(candidate: BusinessRulePromotionCandidate): string {
  const family = candidate.familyKey?.trim() || `${candidate.ruleType}:${candidate.candidateKind ?? 'unknown'}`;
  return [
    candidate.scope.applicationId.trim(),
    candidate.scope.businessDomainId.trim(),
    [...candidate.scope.entityTypes].sort().join(','),
    [...candidate.scope.operationKeys].sort().join(','),
    [...candidate.scope.channels].sort().join(','),
    candidate.effectiveContextKind,
    shortHash(fingerprint(candidate.effectiveContext)),
    family,
  ].join('|');
}

function fingerprintSources(sources: readonly BusinessRuleSource[]): string {
  return fingerprint([...sources].map((source) => ({ ...source })).sort((left, right) => left.sourceId.localeCompare(right.sourceId)));
}

function fingerprintCandidateSemantics(candidate: BusinessRulePromotionCandidate): string {
  return fingerprint({
    ruleId: candidate.ruleId,
    ruleType: candidate.ruleType,
    statement: candidate.statement.trim(),
    scope: candidate.scope,
    effectiveContext: candidate.effectiveContext,
    semantics: candidate.semantics,
    supersedes: [...candidate.supersedes].sort(),
    conflictsWith: [...candidate.conflictsWith].sort(),
  });
}

function fingerprintPromotionMeaning(candidate: BusinessRulePromotionCandidate): string {
  return fingerprint({
    ruleType: candidate.ruleType,
    statement: candidate.statement.trim(),
    scope: candidate.scope,
    effectiveContext: candidate.effectiveContext,
    semantics: candidate.semantics,
    supersedes: [...candidate.supersedes].sort(),
    conflictsWith: [...candidate.conflictsWith].sort(),
  });
}

function candidateSnapshotEntry(candidate: BusinessRulePromotionCandidate): {
  candidateId: string;
  ruleId: string;
  sourceFingerprint: string;
  ruleFingerprint: string;
  sourceCandidateFingerprint: string | null;
  effectiveVersion: string | null;
  effectiveContextKind: BusinessRulePromotionContextKind;
  supersedes: string[];
  conflictsWith: string[];
  linkedCaseIds: string[];
  linkedBindingIds: string[];
  requiredObligationIds: string[];
  currentStatus: BusinessRulePromotionCandidate['currentStatus'];
  candidateKind: BusinessRulePromotionCandidate['candidateKind'] | null;
  familyKey: string | null;
  executionVerified: boolean;
} {
  return {
    candidateId: candidate.candidateId,
    ruleId: candidate.ruleId,
    sourceFingerprint: fingerprintSources(candidate.sourceRegistry),
    ruleFingerprint: fingerprintCandidateSemantics(candidate),
    sourceCandidateFingerprint: candidate.sourceCandidateFingerprint ?? null,
    effectiveVersion: candidate.effectiveVersion,
    effectiveContextKind: candidate.effectiveContextKind,
    supersedes: [...candidate.supersedes].sort(),
    conflictsWith: [...candidate.conflictsWith].sort(),
    linkedCaseIds: [...candidate.linkedCaseIds].sort(),
    linkedBindingIds: [...candidate.linkedBindingIds].sort(),
    requiredObligationIds: [...candidate.requiredObligationIds].sort(),
    currentStatus: candidate.currentStatus,
    candidateKind: candidate.candidateKind ?? null,
    familyKey: candidate.familyKey ?? null,
    executionVerified: candidate.executionVerified === true,
  };
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function shortHash(value: string): string {
  return fingerprint(value).slice(0, 12);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
