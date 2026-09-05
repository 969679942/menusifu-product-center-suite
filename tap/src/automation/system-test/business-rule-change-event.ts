import type {
  AuditEvent,
  AuditEventInput,
} from '../../audit/event-log';

export const BUSINESS_RULE_CHANGE_EVENT_TYPES = {
  started: 'business-rule.evaluation.started',
  decision: 'business-rule.decision',
  completed: 'business-rule.evaluation.completed',
} as const;

export type BusinessRuleDecision =
  | 'no-change'
  | 'candidate-created'
  | 'conflict-detected'
  | 'revalidation-required'
  | 'formal-rule-updated'
  | 'historical-import';

export type BusinessRuleEvaluationStatus = 'current' | 'historical-import';
export type BusinessRuleTimePrecision = 'instant' | 'day' | 'artifact-generated' | 'unknown';

export type BusinessRuleApprovalReference = {
  approvalId?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  candidateFingerprint?: string | null;
  candidateSourceFingerprint?: string | null;
};

export type BusinessRuleDecisionDetails = {
  evaluationStatus: BusinessRuleEvaluationStatus;
  ruleId: string;
  decision: BusinessRuleDecision;
  decisionReason: string;
  beforeRuleFingerprint: string | null;
  afterRuleFingerprint: string | null;
  beforeSourceFingerprint?: string | null;
  afterSourceFingerprint?: string | null;
  beforeRevision?: number | null;
  afterRevision?: number | null;
  beforeEffectiveVersion?: string | null;
  afterEffectiveVersion?: string | null;
  linkedCaseIds: string[];
  linkedBindingIds: string[];
  approvalRef?: BusinessRuleApprovalReference | null;
  executionProof?: 'passed-complete' | 'not-required' | 'missing' | 'historical-unavailable';
  executionReceiptRefs?: string[];
  timeSource: string;
  timePrecision: BusinessRuleTimePrecision;
};

export type BusinessRuleEvaluationRunDetails = {
  runType: 'test-plan-to-ui-script' | 'rule-revalidation' | 'historical-import';
  evaluationStatus: BusinessRuleEvaluationStatus;
  baselineId?: string | null;
  triggerFingerprint?: string | null;
  sourceArtifacts: string[];
  sourceArtifactFingerprints?: Record<string, string>;
  testPlanFingerprint?: string | null;
  implementationFingerprint?: string | null;
  executionContextFingerprint?: string | null;
  lifecycleSnapshotFingerprint?: string | null;
  historicalSourceRole?: string | null;
  evaluatedRuleIds: string[];
  decisionEventIds?: string[];
};

export type BusinessRuleDecisionEvent = AuditEvent & {
  eventType: typeof BUSINESS_RULE_CHANGE_EVENT_TYPES.decision;
  details: BusinessRuleDecisionDetails;
};

export type BusinessRuleEvaluationEventInput = {
  applicationId: string;
  businessDomainId: string;
  runId: string;
  occurredAt: string;
  actorId?: string;
  runDetails: BusinessRuleEvaluationRunDetails;
  decisions: readonly BusinessRuleDecisionDetails[];
  beforeFingerprint?: string | null;
  afterFingerprint?: string | null;
};

/**
 * Builds a start, one decision event per evaluated rule, and a terminal event.
 * The event store supplies sequence numbers and the hash chain when persisted.
 */
export function buildBusinessRuleEvaluationEvents(
  input: BusinessRuleEvaluationEventInput,
): AuditEventInput[] {
  validateEvaluationInput(input);
  const decisionEventIds = input.decisions.map((decision) => businessRuleDecisionEventId(input.runId, decision));
  const base = {
    applicationId: input.applicationId,
    businessDomainId: input.businessDomainId,
    runId: input.runId,
    traceId: input.runId,
    actorType: 'system' as const,
    actorId: input.actorId,
  };
  const startEventId = `business-rule-evaluation:${input.runId}:started`;
  const completedEventId = `business-rule-evaluation:${input.runId}:completed`;
  const hasBlockingDecision = input.decisions.some((decision) => (
    decision.decision === 'conflict-detected' || decision.decision === 'revalidation-required'
  ));
  const hasFormalUpdate = input.decisions.some((decision) => decision.decision === 'formal-rule-updated');
  return [
    {
      ...base,
      eventId: startEventId,
      eventType: BUSINESS_RULE_CHANGE_EVENT_TYPES.started,
      occurredAt: input.occurredAt,
      outcome: 'success',
      effectiveSuccess: true,
      beforeFingerprint: input.beforeFingerprint ?? null,
      afterFingerprint: input.afterFingerprint ?? null,
      details: {
        ...input.runDetails,
        eventRole: 'start',
        sourceArtifacts: [...input.runDetails.sourceArtifacts].sort(),
        evaluatedRuleIds: [...input.runDetails.evaluatedRuleIds].sort(),
      },
    },
    ...input.decisions.map((decision, index) => ({
      ...base,
      eventId: decisionEventIds[index],
      eventType: BUSINESS_RULE_CHANGE_EVENT_TYPES.decision,
      parentEventId: startEventId,
      occurredAt: input.occurredAt,
      outcome: decisionOutcome(decision.decision),
      effectiveSuccess: decision.decision === 'no-change' || decision.decision === 'formal-rule-updated',
      beforeFingerprint: decision.beforeRuleFingerprint,
      afterFingerprint: decision.afterRuleFingerprint,
      dataChanged: decision.decision === 'formal-rule-updated',
      evidenceRefs: [...(decision.executionReceiptRefs ?? [])],
      details: {
        ...decision,
        linkedCaseIds: [...decision.linkedCaseIds].sort(),
        linkedBindingIds: [...decision.linkedBindingIds].sort(),
        executionReceiptRefs: [...(decision.executionReceiptRefs ?? [])].sort(),
      },
    })),
    {
      ...base,
      eventId: completedEventId,
      eventType: BUSINESS_RULE_CHANGE_EVENT_TYPES.completed,
      parentEventId: startEventId,
      occurredAt: input.occurredAt,
      outcome: hasBlockingDecision ? 'blocked' : 'success',
      effectiveSuccess: !hasBlockingDecision,
      beforeFingerprint: input.beforeFingerprint ?? null,
      afterFingerprint: input.afterFingerprint ?? null,
      dataChanged: hasFormalUpdate,
      details: {
        ...input.runDetails,
        eventRole: 'completed',
        decisionEventIds,
        decisionCounts: countDecisions(input.decisions),
        sourceArtifacts: [...input.runDetails.sourceArtifacts].sort(),
        evaluatedRuleIds: [...input.runDetails.evaluatedRuleIds].sort(),
      },
    },
  ];
}

/** Validates both generic audit facts and business-rule-specific decision invariants. */
export function validateBusinessRuleDecisionEvent(event: AuditEvent): string[] {
  if (event.eventType !== BUSINESS_RULE_CHANGE_EVENT_TYPES.decision) return [];
  const details = event.details as Partial<BusinessRuleDecisionDetails> | null | undefined;
  const errors: string[] = [];
  if (!details || typeof details !== 'object') return ['BUSINESS_RULE_DECISION_DETAILS_REQUIRED'];
  if (typeof details.ruleId !== 'string' || !details.ruleId.trim()) errors.push('BUSINESS_RULE_DECISION_RULE_ID_REQUIRED');
  if (!isDecision(details.decision)) errors.push('BUSINESS_RULE_DECISION_INVALID');
  if (typeof details.decisionReason !== 'string' || !details.decisionReason.trim()) errors.push('BUSINESS_RULE_DECISION_REASON_REQUIRED');
  if (!isFingerprintOrNull(details.beforeRuleFingerprint) || !isFingerprintOrNull(details.afterRuleFingerprint)) {
    errors.push('BUSINESS_RULE_DECISION_RULE_FINGERPRINT_INVALID');
  }
  if (!Array.isArray(details.linkedCaseIds) || details.linkedCaseIds.some((item) => typeof item !== 'string' || !item.trim())) {
    errors.push('BUSINESS_RULE_DECISION_CASE_IDS_INVALID');
  }
  if (!Array.isArray(details.linkedBindingIds) || details.linkedBindingIds.some((item) => typeof item !== 'string' || !item.trim())) {
    errors.push('BUSINESS_RULE_DECISION_BINDING_IDS_INVALID');
  }
  if (typeof details.timeSource !== 'string' || !details.timeSource.trim()) errors.push('BUSINESS_RULE_DECISION_TIME_SOURCE_REQUIRED');
  if (!['instant', 'day', 'artifact-generated', 'unknown'].includes(details.timePrecision ?? '')) {
    errors.push('BUSINESS_RULE_DECISION_TIME_PRECISION_INVALID');
  }
  if (details.decision === 'no-change'
    && details.beforeRuleFingerprint !== details.afterRuleFingerprint) {
    errors.push('BUSINESS_RULE_NO_CHANGE_FINGERPRINT_MISMATCH');
  }
  if (details.decision === 'candidate-created') {
    if (!details.afterRuleFingerprint || details.beforeRuleFingerprint === details.afterRuleFingerprint) {
      errors.push('BUSINESS_RULE_CANDIDATE_SEMANTIC_CHANGE_REQUIRED');
    }
    if (details.executionProof !== 'passed-complete') errors.push('BUSINESS_RULE_CANDIDATE_EXECUTION_PROOF_REQUIRED');
    if (!details.executionReceiptRefs || details.executionReceiptRefs.length === 0) {
      errors.push('BUSINESS_RULE_CANDIDATE_RECEIPT_REQUIRED');
    }
  }
  if (details.decision === 'revalidation-required'
    && (!details.beforeRuleFingerprint || !details.afterRuleFingerprint
      || details.beforeRuleFingerprint === details.afterRuleFingerprint)) {
    errors.push('BUSINESS_RULE_REVALIDATION_SEMANTIC_CHANGE_REQUIRED');
  }
  if (details.decision === 'historical-import'
    && (details.beforeRuleFingerprint !== null || details.afterRuleFingerprint !== null)) {
    errors.push('BUSINESS_RULE_HISTORICAL_FINGERPRINT_MUST_BE_NULL');
  }
  if ((details.evaluationStatus === 'historical-import') !== (details.decision === 'historical-import')) {
    errors.push('BUSINESS_RULE_DECISION_EVALUATION_STATUS_MISMATCH');
  }
  if (details.decision === 'formal-rule-updated') {
    if (!details.approvalRef?.approvedBy || !details.approvalRef.approvedAt) errors.push('BUSINESS_RULE_FORMAL_UPDATE_APPROVAL_REQUIRED');
    if (details.approvalRef && (!Number.isFinite(Date.parse(details.approvalRef.approvedAt ?? ''))
      || details.approvalRef.candidateFingerprint !== details.afterRuleFingerprint
      || (details.afterSourceFingerprint
        && details.approvalRef.candidateSourceFingerprint !== details.afterSourceFingerprint))) {
      errors.push('BUSINESS_RULE_FORMAL_UPDATE_APPROVED_FINGERPRINT_MISMATCH');
    }
    if (details.executionProof !== 'passed-complete') errors.push('BUSINESS_RULE_FORMAL_UPDATE_EXECUTION_PROOF_REQUIRED');
    if (!details.executionReceiptRefs || details.executionReceiptRefs.length === 0) errors.push('BUSINESS_RULE_FORMAL_UPDATE_RECEIPT_REQUIRED');
    if (!details.beforeRuleFingerprint || !details.afterRuleFingerprint || details.beforeRuleFingerprint === details.afterRuleFingerprint) {
      errors.push('BUSINESS_RULE_FORMAL_UPDATE_SEMANTIC_CHANGE_REQUIRED');
    }
  }
  if (event.beforeFingerprint !== details.beforeRuleFingerprint || event.afterFingerprint !== details.afterRuleFingerprint) {
    errors.push('BUSINESS_RULE_DECISION_EVENT_FINGERPRINT_MISMATCH');
  }
  return [...new Set(errors)].sort();
}

export function businessRuleDecisionEventId(runId: string, decision: Pick<BusinessRuleDecisionDetails, 'ruleId' | 'decision' | 'afterRuleFingerprint'>): string {
  return `business-rule-decision:${runId}:${decision.ruleId}:${decision.decision}:${decision.afterRuleFingerprint ?? 'null'}`;
}

function validateEvaluationInput(input: BusinessRuleEvaluationEventInput): void {
  if (!input.applicationId.trim()) throw new Error('BUSINESS_RULE_EVENT_APPLICATION_ID_REQUIRED');
  if (!input.businessDomainId.trim()) throw new Error('BUSINESS_RULE_EVENT_BUSINESS_DOMAIN_ID_REQUIRED');
  if (!input.runId.trim()) throw new Error('BUSINESS_RULE_EVENT_RUN_ID_REQUIRED');
  if (!Number.isFinite(Date.parse(input.occurredAt))) throw new Error('BUSINESS_RULE_EVENT_OCCURRED_AT_INVALID');
  if (input.decisions.length === 0 && input.runDetails.evaluationStatus !== 'historical-import') {
    throw new Error('BUSINESS_RULE_EVENT_DECISIONS_REQUIRED');
  }
  const ruleIds = input.decisions.map((decision) => decision.ruleId);
  if (new Set(ruleIds).size !== ruleIds.length) throw new Error('BUSINESS_RULE_EVENT_DUPLICATE_RULE_ID');
  for (const decision of input.decisions) {
    const errors = validateBusinessRuleDecisionDetails(decision);
    if (errors.length > 0) throw new Error(`BUSINESS_RULE_EVENT_DECISION_INVALID:${errors.join(',')}`);
  }
}

function validateBusinessRuleDecisionDetails(details: BusinessRuleDecisionDetails): string[] {
  const syntheticEvent = {
    eventType: BUSINESS_RULE_CHANGE_EVENT_TYPES.decision,
    details,
    beforeFingerprint: details.beforeRuleFingerprint,
    afterFingerprint: details.afterRuleFingerprint,
  } as AuditEvent;
  return validateBusinessRuleDecisionEvent(syntheticEvent);
}

function isDecision(value: unknown): value is BusinessRuleDecision {
  return ['no-change', 'candidate-created', 'conflict-detected', 'revalidation-required', 'formal-rule-updated', 'historical-import'].includes(String(value));
}

function isFingerprintOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value));
}

function decisionOutcome(decision: BusinessRuleDecision): 'success' | 'blocked' {
  return decision === 'conflict-detected' || decision === 'revalidation-required' ? 'blocked' : 'success';
}

function countDecisions(decisions: readonly BusinessRuleDecisionDetails[]): Record<BusinessRuleDecision, number> {
  const counts: Record<BusinessRuleDecision, number> = {
    'no-change': 0,
    'candidate-created': 0,
    'conflict-detected': 0,
    'revalidation-required': 0,
    'formal-rule-updated': 0,
    'historical-import': 0,
  };
  for (const decision of decisions) counts[decision.decision] += 1;
  return counts;
}
