import { createHash } from 'node:crypto';
import type { BusinessRuleDownstreamSyncContract } from './business-rule-downstream-contract';

export type BusinessRuleType =
  | 'normative'
  | 'observed'
  | 'ui-contract'
  | 'api-contract'
  | 'technical'
  | 'deferred';

export type BusinessRuleVerificationStatus =
  | 'draft'
  | 'pending-review'
  | 'verified'
  | 'revalidation-required'
  | 'conflicted'
  | 'deferred';

export type BusinessRuleSourceKind =
  | 'prd'
  | 'xmind'
  | 'business-rule'
  | 'human-confirmation'
  | 'ui-audit'
  | 'api-audit'
  | 'execution-receipt';

export type BusinessRuleSource = {
  sourceId: string;
  kind: BusinessRuleSourceKind;
  path: string;
  locator: string;
  fingerprint: string;
  verified: boolean;
};

export type BusinessRuleScope = {
  applicationId: string;
  businessDomainId: string;
  entityTypes: string[];
  operationKeys: string[];
  channels: string[];
};

export type BusinessRuleEffectiveContext = {
  environmentIds: string[];
  tenantIds: string[];
  roleIds: string[];
  locales: string[];
  routes: string[];
  featureFlags: string[];
};

export type BusinessRuleSemantics = {
  preconditions: string[];
  entities: string[];
  actions: string[];
  stateTransitions: Array<{ from: string; action: string; to: string }>;
  constraints: string[];
  outcomes: string[];
  sideEffects: string[];
  assertionSurfaces: Array<{
    assertionId: string;
    fieldId: string;
    channel: 'ui' | 'api' | 'downstream' | 'cleanup';
    authority: string;
    terminalCondition: string;
  }>;
  cleanup: {
    policyStatus: 'verified' | 'unknown';
    required: boolean;
    strategyId?: string;
    apiZeroResidueRequired: boolean;
    uiZeroResidueRequired: boolean;
  };
  /** Structured propagation contract for cross-system side effects. */
  downstreamSyncContracts?: BusinessRuleDownstreamSyncContract[];
};

export type BusinessRuleApproval = {
  decision: 'approved' | 'rejected' | 'held';
  approvedBy: string;
  approvedAt: string;
  rationale: string;
  candidateFingerprint: string;
  candidateSourceFingerprint: string;
};

export type BusinessRuleGovernanceMetadata = {
  createdAt: string | null;
  changedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  lastVerifiedAt: string | null;
  changeReason: string | null;
  changeEventId: string | null;
  timeEvidenceStatus: 'complete' | 'partial' | 'unknown';
  effectiveContextStatus: 'explicit' | 'unknown';
  conflictAssessment: {
    status: 'assessed-no-conflict' | 'assessed-conflict' | 'not-assessed';
    assessedAt: string | null;
    source: string | null;
    conflictsWithRuleIds: string[];
    precedence: number | null;
  };
};

export type BusinessRuleDocument = {
  schemaVersion: '1.0.0';
  ruleId: string;
  ruleType: BusinessRuleType;
  statement: string;
  scope: BusinessRuleScope;
  sourceRegistry: BusinessRuleSource[];
  sourceFingerprint: string;
  ruleFingerprint: string;
  effectiveVersion: string | null;
  effectiveContext: BusinessRuleEffectiveContext;
  supersedes: string[];
  conflictsWith: string[];
  linkedCaseIds: string[];
  linkedBindingIds: string[];
  approval: BusinessRuleApproval | null;
  verificationStatus: BusinessRuleVerificationStatus;
  semantics: BusinessRuleSemantics;
  revision: number;
  previousRuleFingerprint: string | null;
  // Governance metadata is audit evidence, not rule semantics; it is excluded from ruleFingerprint.
  governance?: BusinessRuleGovernanceMetadata;
};

export type BusinessRuleCandidateInput = Omit<
  BusinessRuleDocument,
  'schemaVersion' | 'sourceFingerprint' | 'ruleFingerprint' | 'approval' | 'revision'
> & {
  approval?: null;
  revision?: number;
};

export type BusinessRuleValidationMode = 'candidate' | 'formal' | 'test-generation';

export function buildBusinessRuleCandidate(input: BusinessRuleCandidateInput): BusinessRuleDocument {
  const sourceRegistry = sortSources(input.sourceRegistry);
  const normalized = {
    ...input,
    statement: input.statement.trim(),
    scope: normalizeScope(input.scope),
    sourceRegistry,
    effectiveContext: normalizeContext(input.effectiveContext),
    supersedes: unique(input.supersedes),
    conflictsWith: unique(input.conflictsWith),
    linkedCaseIds: unique(input.linkedCaseIds),
    linkedBindingIds: unique(input.linkedBindingIds),
    semantics: normalizeSemantics(input.semantics),
    revision: input.revision ?? 1,
  };
  const sourceFingerprint = fingerprint(sourceRegistry);
  const ruleFingerprint = fingerprint(ruleSemanticValue(normalized));
  return {
    ...normalized,
    schemaVersion: '1.0.0',
    sourceFingerprint,
    ruleFingerprint,
    approval: null,
  };
}

export function validateBusinessRule(
  rule: BusinessRuleDocument,
  mode: BusinessRuleValidationMode,
): string[] {
  const errors: string[] = [];
  if (!/^[-A-Z0-9:.]+$/i.test(rule.ruleId)) errors.push('RULE_ID_INVALID');
  if (!rule.statement) errors.push('STATEMENT_REQUIRED');
  if (!rule.scope.applicationId || !rule.scope.businessDomainId) errors.push('SCOPE_IDENTITY_REQUIRED');
  if (rule.scope.entityTypes.length === 0) errors.push('ENTITY_SCOPE_REQUIRED');
  if (rule.sourceRegistry.length === 0) errors.push('SOURCE_REGISTRY_REQUIRED');
  if (rule.sourceRegistry.some((source) => !source.verified)) errors.push('SOURCE_NOT_VERIFIED');
  if (rule.sourceFingerprint !== fingerprint(rule.sourceRegistry)) {
    errors.push('SOURCE_FINGERPRINT_STALE');
  }
  if (rule.ruleFingerprint !== fingerprint(ruleSemanticValue(rule))) errors.push('RULE_FINGERPRINT_STALE');
  if (rule.conflictsWith.length > 0 || rule.verificationStatus === 'conflicted') errors.push('OPEN_CONFLICT');
  const downstreamChannels = rule.semantics.assertionSurfaces.some((surface) => surface.channel === 'downstream');
  if (downstreamChannels && (!rule.semantics.downstreamSyncContracts || rule.semantics.downstreamSyncContracts.length === 0)) {
    errors.push('DOWNSTREAM_SYNC_CONTRACT_REQUIRED');
  }
  if (mode === 'formal' || mode === 'test-generation') {
    if (rule.ruleType === 'observed' || rule.ruleType === 'technical' || rule.ruleType === 'deferred') {
      errors.push('RULE_TYPE_NOT_FORMALIZABLE');
    }
    if (!rule.effectiveVersion) errors.push('EFFECTIVE_VERSION_REQUIRED');
    if (!rule.approval || rule.approval.decision !== 'approved') errors.push('APPROVAL_REQUIRED');
    if (rule.approval && rule.approval.candidateFingerprint !== rule.ruleFingerprint) errors.push('APPROVAL_FINGERPRINT_STALE');
    if (rule.approval && rule.approval.candidateSourceFingerprint !== rule.sourceFingerprint) {
      errors.push('APPROVAL_SOURCE_FINGERPRINT_STALE');
    }
    if (rule.approval && !Number.isFinite(Date.parse(rule.approval.approvedAt))) {
      errors.push('APPROVAL_TIME_INVALID');
    }
    if (rule.approval && (!rule.approval.approvedBy.trim() || !rule.approval.rationale.trim())) {
      errors.push('APPROVAL_INCOMPLETE');
    }
  }
  if (mode === 'test-generation') {
    errors.push(...validateGenerationSemantics(rule));
    if (!rule.approval || rule.approval.decision !== 'approved') errors.push('FORMAL_RULE_REQUIRED');
    if (rule.verificationStatus !== 'verified') errors.push('VERIFIED_RULE_REQUIRED');
  }
  return unique(errors);
}

export function approveBusinessRuleCandidate(input: {
  candidate: BusinessRuleDocument;
  effectiveVersion: string;
  decision: BusinessRuleApproval;
  /**
   * Semantic approval and runtime verification are separate decisions.  Keep
   * the historical default for callers that already supply verified evidence,
   * while allowing adapters to formalise an approved rule without pretending
   * that its current execution evidence is complete.
   */
  verificationStatus?: Extract<BusinessRuleVerificationStatus, 'verified' | 'pending-review' | 'revalidation-required'>;
}): BusinessRuleDocument {
  const candidateErrors = validateBusinessRule(input.candidate, 'candidate');
  if (candidateErrors.length > 0) throw new Error(`BUSINESS_RULE_CANDIDATE_INVALID:${candidateErrors.join(',')}`);
  if (input.decision.candidateFingerprint !== input.candidate.ruleFingerprint) {
    throw new Error('BUSINESS_RULE_CANDIDATE_FINGERPRINT_MISMATCH');
  }
  if (input.decision.candidateSourceFingerprint !== input.candidate.sourceFingerprint) {
    throw new Error('BUSINESS_RULE_CANDIDATE_SOURCE_FINGERPRINT_MISMATCH');
  }
  if (input.decision.decision !== 'approved') throw new Error(`BUSINESS_RULE_NOT_APPROVED:${input.decision.decision}`);
  if (!input.decision.approvedBy.trim()
    || !input.decision.rationale.trim()
    || !Number.isFinite(Date.parse(input.decision.approvedAt))) {
    throw new Error('BUSINESS_RULE_APPROVAL_INCOMPLETE');
  }
  const formal: BusinessRuleDocument = {
    ...input.candidate,
    effectiveVersion: input.effectiveVersion,
    approval: { ...input.decision },
    verificationStatus: input.verificationStatus ?? 'verified',
  };
  const errors = validateBusinessRule(formal, 'formal');
  if (errors.length > 0) throw new Error(`BUSINESS_RULE_FORMAL_INVALID:${errors.join(',')}`);
  return formal;
}

export function reviseBusinessRule(input: {
  current: BusinessRuleDocument;
  next: BusinessRuleCandidateInput;
}): BusinessRuleDocument {
  if (input.current.ruleId !== input.next.ruleId) throw new Error('BUSINESS_RULE_ID_IMMUTABLE');
  const next = buildBusinessRuleCandidate({
    ...input.next,
    revision: input.current.revision + 1,
    previousRuleFingerprint: input.current.ruleFingerprint,
    verificationStatus: 'revalidation-required',
  });
  if (next.ruleFingerprint === input.current.ruleFingerprint) throw new Error('BUSINESS_RULE_SEMANTICS_UNCHANGED');
  return next;
}

export type BusinessRuleExecutionReceipt = {
  receiptId: string;
  ruleId: string;
  ruleFingerprint: string;
  caseId: string;
  applicationId: string;
  businessDomainId: string;
  executionStatus: 'passed' | 'failed' | 'blocked';
  evidenceStatus: 'complete' | 'incomplete';
  assertionIdsRequired: string[];
  assertionIdsObserved: string[];
  operationReceiptIds: string[];
  uiEvidenceIds: string[];
  apiEvidenceIds: string[];
  downstreamEvidenceIds: string[];
  cleanup: { required: boolean; apiZeroResidue: boolean; uiZeroResidue: boolean };
  observedStatement: string;
};

export type BusinessRuleObservation = {
  observationId: string;
  ruleId: string;
  sourceRuleFingerprint: string;
  result: 'supports' | 'contradicts' | 'inconclusive';
  eligibleForCandidate: boolean;
  blockers: string[];
  candidate: BusinessRuleDocument | null;
};

export function observeBusinessRuleExecution(input: {
  rule: BusinessRuleDocument;
  receipt: BusinessRuleExecutionReceipt;
}): BusinessRuleObservation {
  const { rule, receipt } = input;
  const blockers: string[] = [];
  const executionEligibilityErrors = validateBusinessRule(rule, 'test-generation');
  if (executionEligibilityErrors.length > 0) {
    blockers.push(`RULE_NOT_EXECUTION_ELIGIBLE:${executionEligibilityErrors.join('|')}`);
  }
  if (receipt.ruleId !== rule.ruleId) blockers.push('RULE_ID_MISMATCH');
  if (receipt.ruleFingerprint !== rule.ruleFingerprint) blockers.push('RULE_FINGERPRINT_MISMATCH');
  if (!rule.linkedCaseIds.includes(receipt.caseId)) blockers.push('CASE_LINK_MISMATCH');
  if (receipt.applicationId !== rule.scope.applicationId || receipt.businessDomainId !== rule.scope.businessDomainId) {
    blockers.push('EXECUTION_CONTEXT_MISMATCH');
  }
  if (receipt.evidenceStatus !== 'complete') blockers.push('EVIDENCE_INCOMPLETE');
  if (receipt.operationReceiptIds.length === 0) blockers.push('OPERATION_RECEIPT_REQUIRED');
  const contractAssertionIds = rule.semantics.assertionSurfaces.map((item) => item.assertionId);
  const missingRequiredAssertions = contractAssertionIds.filter((id) => !receipt.assertionIdsRequired.includes(id));
  const unknownRequiredAssertions = receipt.assertionIdsRequired.filter((id) => !contractAssertionIds.includes(id));
  if (missingRequiredAssertions.length > 0 || unknownRequiredAssertions.length > 0) {
    blockers.push(`ASSERTION_CONTRACT_MISMATCH:missing=${missingRequiredAssertions.join('|')};unknown=${unknownRequiredAssertions.join('|')}`);
  }
  const missingAssertions = contractAssertionIds.filter((id) => !receipt.assertionIdsObserved.includes(id));
  if (missingAssertions.length > 0) blockers.push(`ASSERTION_COVERAGE_INCOMPLETE:${missingAssertions.join('|')}`);
  const assertionChannels = new Set(rule.semantics.assertionSurfaces.map((item) => item.channel));
  if (assertionChannels.has('ui') && receipt.uiEvidenceIds.length === 0) blockers.push('UI_EVIDENCE_REQUIRED');
  if (assertionChannels.has('api') && receipt.apiEvidenceIds.length === 0) blockers.push('API_EVIDENCE_REQUIRED');
  if (assertionChannels.has('downstream') && receipt.downstreamEvidenceIds.length === 0) {
    blockers.push('DOWNSTREAM_EVIDENCE_REQUIRED');
  }
  if (receipt.cleanup.required && (!receipt.cleanup.apiZeroResidue || !receipt.cleanup.uiZeroResidue)) {
    blockers.push('CLEANUP_INCOMPLETE');
  }
  if (!receipt.observedStatement.trim()) blockers.push('OBSERVED_STATEMENT_REQUIRED');
  const result = blockers.length > 0 || receipt.executionStatus === 'blocked'
    ? 'inconclusive'
    : receipt.executionStatus === 'passed' ? 'supports' : 'contradicts';
  const eligibleForCandidate = blockers.length === 0;
  return {
    observationId: `observation:${receipt.receiptId}`,
    ruleId: rule.ruleId,
    sourceRuleFingerprint: rule.ruleFingerprint,
    result,
    eligibleForCandidate,
    blockers,
    candidate: eligibleForCandidate ? buildObservedCandidate(rule, receipt) : null,
  };
}

export type GeneratedBusinessRuleCase = {
  caseId: string;
  title: string;
  ruleId: string;
  ruleFingerprint: string;
  sourceIds: string[];
  preconditions: string[];
  actions: string[];
  expectedResults: string[];
  assertionSurfaces: BusinessRuleSemantics['assertionSurfaces'];
  cleanup: BusinessRuleSemantics['cleanup'];
  linkedBindingIds: string[];
  status: 'candidate';
};

export function generateTestCasesFromBusinessRules(rules: readonly BusinessRuleDocument[]): {
  cases: GeneratedBusinessRuleCase[];
  blocked: Array<{ ruleId: string; blockers: string[] }>;
} {
  const cases: GeneratedBusinessRuleCase[] = [];
  const blocked: Array<{ ruleId: string; blockers: string[] }> = [];
  for (const rule of rules) {
    const blockers = validateBusinessRule(rule, 'test-generation');
    if (blockers.length > 0) {
      blocked.push({ ruleId: rule.ruleId, blockers });
      continue;
    }
    cases.push({
      caseId: rule.linkedCaseIds[0] ?? `TC-${rule.ruleId.replace(/^BR-/, '')}`,
      title: rule.statement,
      ruleId: rule.ruleId,
      ruleFingerprint: rule.ruleFingerprint,
      sourceIds: rule.sourceRegistry.map((source) => source.sourceId),
      preconditions: [...rule.semantics.preconditions],
      actions: [...rule.semantics.actions],
      expectedResults: [...rule.semantics.outcomes, ...rule.semantics.sideEffects],
      assertionSurfaces: rule.semantics.assertionSurfaces.map((item) => ({ ...item })),
      cleanup: { ...rule.semantics.cleanup },
      linkedBindingIds: [...rule.linkedBindingIds],
      status: 'candidate',
    });
  }
  return { cases, blocked };
}

export type BusinessRuleCompletionField = {
  blocker: string;
  fieldPath: string;
  status: 'missing' | 'invalid' | 'conflicted';
  changesRuleFingerprint: boolean;
};

export type BusinessRuleCompletionReviewItem = {
  ruleId: string;
  statement: string;
  ruleFingerprint: string;
  sourceFingerprint: string;
  status: 'generation-ready' | 'review-required';
  blockers: string[];
  requiredFields: BusinessRuleCompletionField[];
  evidenceBackedValues: {
    sourceIds: string[];
    linkedCaseIds: string[];
    linkedBindingIds: string[];
    preconditions: string[];
    actions: string[];
    outcomes: string[];
    assertionSurfaces: BusinessRuleSemantics['assertionSurfaces'];
    cleanup: BusinessRuleSemantics['cleanup'];
  };
  executionImpact: {
    existingPassedCasesInvalidated: false;
    rerunRequiredNow: false;
    semanticCompletionMayRequireIncrementalRerun: boolean;
  };
};

export function buildBusinessRuleCompletionReviewQueue(
  rules: readonly BusinessRuleDocument[],
): BusinessRuleCompletionReviewItem[] {
  return rules.map((rule) => {
    const blockers = validateBusinessRule(rule, 'test-generation');
    const requiredFields = blockers.map(completionFieldForBlocker);
    return {
      ruleId: rule.ruleId,
      statement: rule.statement,
      ruleFingerprint: rule.ruleFingerprint,
      sourceFingerprint: rule.sourceFingerprint,
      status: blockers.length === 0 ? 'generation-ready' : 'review-required',
      blockers,
      requiredFields,
      evidenceBackedValues: {
        sourceIds: rule.sourceRegistry.map((source) => source.sourceId),
        linkedCaseIds: [...rule.linkedCaseIds],
        linkedBindingIds: [...rule.linkedBindingIds],
        preconditions: [...rule.semantics.preconditions],
        actions: [...rule.semantics.actions],
        outcomes: [...rule.semantics.outcomes, ...rule.semantics.sideEffects],
        assertionSurfaces: rule.semantics.assertionSurfaces.map((surface) => ({ ...surface })),
        cleanup: { ...rule.semantics.cleanup },
      },
      executionImpact: {
        existingPassedCasesInvalidated: false,
        rerunRequiredNow: false,
        semanticCompletionMayRequireIncrementalRerun: requiredFields.some((field) => field.changesRuleFingerprint),
      },
    };
  });
}

export function buildBusinessRuleChangeImpact(
  rules: readonly BusinessRuleDocument[],
  changedRuleIds: readonly string[],
): { affectedRuleIds: string[]; affectedCaseIds: string[]; affectedBindingIds: string[] } {
  const changed = new Set(changedRuleIds);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const rule of rules) {
      if (changed.has(rule.ruleId)) continue;
      if (rule.supersedes.some((id) => changed.has(id)) || rule.conflictsWith.some((id) => changed.has(id))) {
        changed.add(rule.ruleId);
        expanded = true;
      }
    }
  }
  const affected = rules.filter((rule) => changed.has(rule.ruleId));
  return {
    affectedRuleIds: unique(affected.map((rule) => rule.ruleId)),
    affectedCaseIds: unique(affected.flatMap((rule) => rule.linkedCaseIds)),
    affectedBindingIds: unique(affected.flatMap((rule) => rule.linkedBindingIds)),
  };
}

function buildObservedCandidate(
  rule: BusinessRuleDocument,
  receipt: BusinessRuleExecutionReceipt,
): BusinessRuleDocument {
  const receiptSource: BusinessRuleSource = {
    sourceId: `execution-receipt:${receipt.receiptId}`,
    kind: 'execution-receipt',
    path: `receipt://${receipt.receiptId}`,
    locator: receipt.caseId,
    fingerprint: fingerprint(receipt),
    verified: true,
  };
  return buildBusinessRuleCandidate({
    ...rule,
    ruleId: `OBS-${rule.ruleId}-${shortHash(receipt.receiptId)}`,
    ruleType: 'observed',
    statement: receipt.observedStatement,
    sourceRegistry: [receiptSource],
    effectiveVersion: null,
    supersedes: [],
    conflictsWith: receipt.executionStatus === 'failed' ? [rule.ruleId] : [],
    linkedCaseIds: [receipt.caseId],
    approval: null,
    verificationStatus: receipt.executionStatus === 'failed' ? 'conflicted' : 'pending-review',
    revision: 1,
    previousRuleFingerprint: rule.ruleFingerprint,
  });
}

function validateGenerationSemantics(rule: BusinessRuleDocument): string[] {
  const errors: string[] = [];
  if (rule.semantics.preconditions.length === 0) errors.push('PRECONDITIONS_REQUIRED');
  if (rule.semantics.entities.length === 0) errors.push('ENTITIES_REQUIRED');
  if (rule.semantics.actions.length === 0) errors.push('ACTIONS_REQUIRED');
  if (rule.semantics.outcomes.length === 0) errors.push('OUTCOMES_REQUIRED');
  if (rule.semantics.assertionSurfaces.length === 0) errors.push('ASSERTION_SURFACE_REQUIRED');
  if (rule.linkedCaseIds.length === 0) errors.push('LINKED_CASE_REQUIRED');
  if (rule.linkedBindingIds.length === 0) errors.push('AUTOMATION_BINDING_REQUIRED');
  if (rule.semantics.cleanup.policyStatus !== 'verified') errors.push('CLEANUP_POLICY_REQUIRED');
  if (rule.semantics.cleanup.required && !rule.semantics.cleanup.strategyId) errors.push('CLEANUP_STRATEGY_REQUIRED');
  return errors;
}

function completionFieldForBlocker(blocker: string): BusinessRuleCompletionField {
  const mapping: Record<string, Omit<BusinessRuleCompletionField, 'blocker'>> = {
    EFFECTIVE_VERSION_REQUIRED: {
      fieldPath: 'effectiveVersion', status: 'missing', changesRuleFingerprint: false,
    },
    APPROVAL_REQUIRED: {
      fieldPath: 'approval', status: 'missing', changesRuleFingerprint: false,
    },
    FORMAL_RULE_REQUIRED: {
      fieldPath: 'approval', status: 'missing', changesRuleFingerprint: false,
    },
    APPROVAL_TIME_INVALID: {
      fieldPath: 'approval.approvedAt', status: 'invalid', changesRuleFingerprint: false,
    },
    APPROVAL_INCOMPLETE: {
      fieldPath: 'approval', status: 'invalid', changesRuleFingerprint: false,
    },
    APPROVAL_FINGERPRINT_STALE: {
      fieldPath: 'approval.candidateFingerprint', status: 'invalid', changesRuleFingerprint: false,
    },
    APPROVAL_SOURCE_FINGERPRINT_STALE: {
      fieldPath: 'approval.candidateSourceFingerprint', status: 'invalid', changesRuleFingerprint: false,
    },
    PRECONDITIONS_REQUIRED: {
      fieldPath: 'semantics.preconditions', status: 'missing', changesRuleFingerprint: true,
    },
    ENTITIES_REQUIRED: {
      fieldPath: 'semantics.entities', status: 'missing', changesRuleFingerprint: true,
    },
    ACTIONS_REQUIRED: {
      fieldPath: 'semantics.actions', status: 'missing', changesRuleFingerprint: true,
    },
    OUTCOMES_REQUIRED: {
      fieldPath: 'semantics.outcomes', status: 'missing', changesRuleFingerprint: true,
    },
    ASSERTION_SURFACE_REQUIRED: {
      fieldPath: 'semantics.assertionSurfaces', status: 'missing', changesRuleFingerprint: true,
    },
    CLEANUP_POLICY_REQUIRED: {
      fieldPath: 'semantics.cleanup', status: 'missing', changesRuleFingerprint: true,
    },
    CLEANUP_STRATEGY_REQUIRED: {
      fieldPath: 'semantics.cleanup.strategyId', status: 'missing', changesRuleFingerprint: true,
    },
    LINKED_CASE_REQUIRED: {
      fieldPath: 'linkedCaseIds', status: 'missing', changesRuleFingerprint: false,
    },
    AUTOMATION_BINDING_REQUIRED: {
      fieldPath: 'linkedBindingIds', status: 'missing', changesRuleFingerprint: false,
    },
    VERIFIED_RULE_REQUIRED: {
      fieldPath: 'verificationStatus', status: 'invalid', changesRuleFingerprint: false,
    },
    OPEN_CONFLICT: {
      fieldPath: 'conflictsWith', status: 'conflicted', changesRuleFingerprint: true,
    },
  };
  return { blocker, ...(mapping[blocker] ?? {
    fieldPath: 'rule', status: 'invalid' as const, changesRuleFingerprint: true,
  }) };
}

function ruleSemanticValue(rule: Omit<BusinessRuleDocument, 'sourceFingerprint' | 'ruleFingerprint' | 'approval' | 'schemaVersion'> | BusinessRuleDocument) {
  return {
    ruleId: rule.ruleId,
    ruleType: rule.ruleType,
    statement: rule.statement,
    scope: rule.scope,
    effectiveContext: rule.effectiveContext,
    semantics: rule.semantics,
    supersedes: rule.supersedes,
    conflictsWith: rule.conflictsWith,
  };
}

function normalizeScope(value: BusinessRuleScope): BusinessRuleScope {
  return {
    applicationId: value.applicationId.trim(),
    businessDomainId: value.businessDomainId.trim(),
    entityTypes: unique(value.entityTypes),
    operationKeys: unique(value.operationKeys),
    channels: unique(value.channels),
  };
}

function normalizeContext(value: BusinessRuleEffectiveContext): BusinessRuleEffectiveContext {
  return {
    environmentIds: unique(value.environmentIds),
    tenantIds: unique(value.tenantIds),
    roleIds: unique(value.roleIds),
    locales: unique(value.locales),
    routes: unique(value.routes),
    featureFlags: unique(value.featureFlags),
  };
}

function normalizeSemantics(value: BusinessRuleSemantics): BusinessRuleSemantics {
  const normalized: BusinessRuleSemantics = {
    preconditions: orderedUnique(value.preconditions),
    entities: unique(value.entities),
    actions: orderedUnique(value.actions),
    stateTransitions: value.stateTransitions.map((transition) => ({ ...transition })),
    constraints: orderedUnique(value.constraints),
    outcomes: orderedUnique(value.outcomes),
    sideEffects: orderedUnique(value.sideEffects),
    assertionSurfaces: [...value.assertionSurfaces].sort((a, b) => a.assertionId.localeCompare(b.assertionId)),
    cleanup: { ...value.cleanup },
  };
  if (value.downstreamSyncContracts !== undefined) {
    normalized.downstreamSyncContracts = value.downstreamSyncContracts.map((contract) => ({
      ...contract,
      intermediateSystems: [...contract.intermediateSystems],
      targetSystems: [...contract.targetSystems],
      storePrerequisites: [...contract.storePrerequisites],
      terminalPrerequisites: [...contract.terminalPrerequisites],
      forbiddenPaths: [...contract.forbiddenPaths],
      verification: { ...contract.verification, channels: [...contract.verification.channels] },
    }));
  }
  return normalized;
}

function sortSources(sources: readonly BusinessRuleSource[]): BusinessRuleSource[] {
  return [...sources].map((source) => ({ ...source })).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}

function unique(items: readonly string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].sort();
}

function orderedUnique(items: readonly string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12).toUpperCase();
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
