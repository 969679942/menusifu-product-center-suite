import { createHash } from 'node:crypto';
import type { BusinessRuleChangeTriggerResult } from './business-rule-change-trigger';
import type { ImpactedCase } from '../../utils/contract-change-impact';

export type CorrectionChangeType =
  | 'business-rule'
  | 'contract'
  | 'case'
  | 'implementation'
  | 'execution-context'
  | 'assertion-surface'
  | 'cleanup-strategy'
  | 'runtime-observation';

export type CorrectionStatus =
  | 'candidate'
  | 'impact-analyzed'
  | 'approved'
  | 'queued'
  | 'running'
  | 'handled'
  | 'revalidated'
  | 'accepted'
  | 'rejected'
  | 'blocked'
  | 'failed'
  | 'evidence-reconciliation-required'
  | 'cancelled';

export type CorrectionEventType = `correction.${CorrectionStatus}`;

export type CorrectionActor = {
  actorType: 'human' | 'ai' | 'runner' | 'system';
  actorId: string;
};

/**
 * Append-only audit event for a single affected case. Domain adapters may add
 * evidence references, but must not redefine lifecycle state or dedupe rules.
 */
export type CorrectionEvent = {
  schemaVersion: '1.0.0';
  eventId: string;
  eventType: CorrectionEventType;
  occurredAt: string;
  correctionId: string;
  dedupeKey: string;
  applicationId: string;
  planId: string;
  caseId: string;
  changeType: CorrectionChangeType;
  changeIds: string[];
  caseFingerprint: string;
  implementationFingerprint: string | null;
  fromStatus: CorrectionStatus | null;
  toStatus: CorrectionStatus;
  actor: CorrectionActor;
  reason: string;
  changedFields: string[];
  evidenceIds: string[];
  executionRunId: string | null;
  executionReceiptId: string | null;
  outcome: 'success' | 'failed' | 'blocked' | 'skipped' | null;
};

export type CorrectionCandidateInput = {
  applicationId: string;
  planId: string;
  caseId: string;
  changeType: CorrectionChangeType;
  changeIds: readonly string[];
  caseFingerprint: string;
  implementationFingerprint?: string | null;
  occurredAt: string;
  actor: CorrectionActor;
  reason: string;
};

export type CorrectionTransitionInput = {
  eventId: string;
  occurredAt: string;
  toStatus: Exclude<CorrectionStatus, 'candidate'>;
  actor: CorrectionActor;
  reason: string;
  changedFields?: readonly string[];
  evidenceIds?: readonly string[];
  executionRunId?: string | null;
  executionReceiptId?: string | null;
  outcome?: CorrectionEvent['outcome'];
};

export type CorrectionRecord = {
  correctionId: string;
  dedupeKey: string;
  applicationId: string;
  planId: string;
  caseId: string;
  changeType: CorrectionChangeType;
  changeIds: string[];
  caseFingerprint: string;
  implementationFingerprint: string | null;
  status: CorrectionStatus;
  handlingStatus: 'pending' | 'in-progress' | 'handled' | 'blocked' | 'cancelled';
  verificationStatus: 'not-started' | 'pending' | 'verified' | 'failed' | 'evidence-reconciliation-required';
  actionRequired: boolean;
  triggerCount: number;
  transitionCount: number;
  changedFields: string[];
  evidenceIds: string[];
  executionRunIds: string[];
  executionReceiptIds: string[];
  createdAt: string;
  updatedAt: string;
  history: CorrectionEvent[];
};

export type CorrectionAuditIssue = {
  eventId: string;
  correctionId: string;
  code:
    | 'EVENT_ID_CONFLICT'
    | 'DEDUPE_KEY_CONFLICT'
    | 'EVENT_INVALID'
    | 'CORRECTION_NOT_FOUND'
    | 'TRANSITION_FROM_MISMATCH'
    | 'TRANSITION_NOT_ALLOWED';
  message: string;
};

export type CorrectionAuditProjection = {
  records: CorrectionRecord[];
  acceptedEventCount: number;
  duplicateEventCount: number;
  duplicateTriggerCount: number;
  issues: CorrectionAuditIssue[];
};

export type CorrectionAuditMetrics = {
  candidateEventCount: number;
  triggerCount: number;
  duplicateTriggerCount: number;
  impactedCaseCount: number;
  approvedCount: number;
  startedCount: number;
  handledCount: number;
  effectiveCorrectionCount: number;
  revalidatedCount: number;
  closedCount: number;
  rejectedCount: number;
  blockedCount: number;
  failedCount: number;
  cancelledCount: number;
  actionRequiredCount: number;
  closureRate: number;
  changedCaseIds: string[];
  revalidatedCaseIds: string[];
  closedCaseIds: string[];
};

export type CorrectionCaseFingerprint = {
  caseId: string;
  caseFingerprint: string;
  implementationFingerprint?: string | null;
};

export type CorrectionCandidateBatch = {
  events: CorrectionEvent[];
  skippedCaseIds: string[];
};

const allowedTransitions: Record<CorrectionStatus, readonly CorrectionStatus[]> = {
  candidate: ['impact-analyzed', 'rejected', 'blocked', 'cancelled'],
  'impact-analyzed': ['approved', 'rejected', 'blocked', 'cancelled'],
  approved: ['queued', 'running', 'blocked', 'cancelled'],
  queued: ['running', 'blocked', 'cancelled'],
  running: ['handled', 'failed', 'blocked', 'evidence-reconciliation-required'],
  handled: ['revalidated', 'evidence-reconciliation-required', 'failed', 'blocked'],
  'evidence-reconciliation-required': ['revalidated', 'running', 'failed', 'blocked', 'cancelled'],
  revalidated: ['accepted', 'failed', 'evidence-reconciliation-required'],
  accepted: [],
  rejected: [],
  blocked: ['impact-analyzed', 'approved', 'queued', 'running', 'cancelled'],
  failed: ['approved', 'queued', 'running', 'cancelled'],
  cancelled: [],
};

export function buildCorrectionDedupeKey(input: Pick<
  CorrectionCandidateInput,
  'applicationId' | 'planId' | 'caseId' | 'caseFingerprint' | 'implementationFingerprint' | 'changeType'
>): string {
  return fingerprint({
    applicationId: input.applicationId.trim(),
    planId: input.planId.trim(),
    caseId: input.caseId.trim(),
    caseFingerprint: input.caseFingerprint.trim(),
    implementationFingerprint: input.implementationFingerprint?.trim() || null,
    changeType: input.changeType,
  });
}

export function createCorrectionCandidateEvent(input: CorrectionCandidateInput): CorrectionEvent {
  validateIdentity(input);
  const dedupeKey = buildCorrectionDedupeKey(input);
  const occurredAt = validTime(input.occurredAt);
  return {
    schemaVersion: '1.0.0',
    // The dedupe key identifies the semantic correction; occurredAt identifies
    // a later trigger attempt while preserving idempotency for the same input.
    eventId: `correction-event:${shortHash(`${dedupeKey}:candidate:${occurredAt}`)}`,
    eventType: 'correction.candidate',
    occurredAt,
    correctionId: `correction:${shortHash(dedupeKey)}`,
    dedupeKey,
    applicationId: input.applicationId.trim(),
    planId: input.planId.trim(),
    caseId: input.caseId.trim(),
    changeType: input.changeType,
    changeIds: unique(input.changeIds),
    caseFingerprint: input.caseFingerprint.trim(),
    implementationFingerprint: input.implementationFingerprint?.trim() || null,
    fromStatus: null,
    toStatus: 'candidate',
    actor: normalizeActor(input.actor),
    reason: required(input.reason, 'CORRECTION_REASON_REQUIRED'),
    changedFields: [],
    evidenceIds: [],
    executionRunId: null,
    executionReceiptId: null,
    outcome: null,
  };
}

/** Adapts the common business-rule trigger output into lifecycle audit events. */
export function createBusinessRuleCorrectionCandidates(input: {
  applicationId: string;
  planId: string;
  trigger: Pick<BusinessRuleChangeTriggerResult, 'changedRuleIds' | 'rerunCaseIds'>;
  cases: readonly CorrectionCaseFingerprint[];
  occurredAt: string;
  actor: CorrectionActor;
}): CorrectionCandidateBatch {
  return createCandidateBatch({
    applicationId: input.applicationId,
    planId: input.planId,
    impactedCaseIds: input.trigger.rerunCaseIds,
    changeType: 'business-rule',
    changeIdsByCase: new Map(input.trigger.rerunCaseIds.map((caseId) => [caseId, input.trigger.changedRuleIds])),
    cases: input.cases,
    occurredAt: input.occurredAt,
    actor: input.actor,
    reason: '正式业务规则语义变化使当前用例需要纠正或重新验证',
  });
}

/** Adapts source/route impact analysis without importing any domain policy. */
export function createContractCorrectionCandidates(input: {
  applicationId: string;
  planId: string;
  impacts: readonly ImpactedCase[];
  cases: readonly CorrectionCaseFingerprint[];
  occurredAt: string;
  actor: CorrectionActor;
}): CorrectionCandidateBatch {
  return createCandidateBatch({
    applicationId: input.applicationId,
    planId: input.planId,
    impactedCaseIds: input.impacts.map((impact) => impact.caseId),
    changeType: 'contract',
    changeIdsByCase: new Map(input.impacts.map((impact) => [impact.caseId, impact.changeIds])),
    cases: input.cases,
    occurredAt: input.occurredAt,
    actor: input.actor,
    reason: '来源合同变化命中用例追溯关系，需要影响分析与纠正裁决',
  });
}

export function createCorrectionTransitionEvent(
  current: Pick<CorrectionRecord, 'correctionId' | 'dedupeKey' | 'applicationId' | 'planId' | 'caseId' | 'changeType' | 'changeIds' | 'caseFingerprint' | 'implementationFingerprint' | 'status'>,
  input: CorrectionTransitionInput,
): CorrectionEvent {
  if (!allowedTransitions[current.status].includes(input.toStatus)) {
    throw new Error(`CORRECTION_TRANSITION_NOT_ALLOWED:${current.status}->${input.toStatus}`);
  }
  return {
    schemaVersion: '1.0.0',
    eventId: required(input.eventId, 'CORRECTION_EVENT_ID_REQUIRED'),
    eventType: `correction.${input.toStatus}`,
    occurredAt: validTime(input.occurredAt),
    correctionId: current.correctionId,
    dedupeKey: current.dedupeKey,
    applicationId: current.applicationId,
    planId: current.planId,
    caseId: current.caseId,
    changeType: current.changeType,
    changeIds: unique(current.changeIds),
    caseFingerprint: current.caseFingerprint,
    implementationFingerprint: current.implementationFingerprint,
    fromStatus: current.status,
    toStatus: input.toStatus,
    actor: normalizeActor(input.actor),
    reason: required(input.reason, 'CORRECTION_REASON_REQUIRED'),
    changedFields: unique(input.changedFields ?? []),
    evidenceIds: unique(input.evidenceIds ?? []),
    executionRunId: input.executionRunId?.trim() || null,
    executionReceiptId: input.executionReceiptId?.trim() || null,
    outcome: input.outcome ?? null,
  };
}

/** Rebuilds current correction state exclusively from the immutable event stream. */
export function projectCorrectionEvents(events: readonly CorrectionEvent[]): CorrectionAuditProjection {
  const records = new Map<string, CorrectionRecord>();
  const correctionIdByDedupeKey = new Map<string, string>();
  const eventFingerprintById = new Map<string, string>();
  const issues: CorrectionAuditIssue[] = [];
  let acceptedEventCount = 0;
  let duplicateEventCount = 0;
  let duplicateTriggerCount = 0;

  for (const event of events) {
    const eventHash = fingerprint(event);
    const previousHash = eventFingerprintById.get(event.eventId);
    if (previousHash) {
      duplicateEventCount += 1;
      if (previousHash !== eventHash) issue(issues, event, 'EVENT_ID_CONFLICT', '同一 eventId 对应不同事件内容');
      continue;
    }
    eventFingerprintById.set(event.eventId, eventHash);
    const diagnostics = validateEvent(event);
    if (diagnostics.length > 0) {
      issue(issues, event, 'EVENT_INVALID', diagnostics.join(','));
      continue;
    }

    const owner = correctionIdByDedupeKey.get(event.dedupeKey);
    if (owner && owner !== event.correctionId) {
      issue(issues, event, 'DEDUPE_KEY_CONFLICT', `去重键已由 ${owner} 占用`);
      if (event.toStatus === 'candidate') duplicateTriggerCount += 1;
      continue;
    }

    if (event.toStatus === 'candidate') {
      if (owner || records.has(event.correctionId)) {
        const existing = records.get(owner ?? event.correctionId);
        if (existing) {
          existing.triggerCount += 1;
          existing.history.push(event);
          if (event.occurredAt > existing.updatedAt) existing.updatedAt = event.occurredAt;
          acceptedEventCount += 1;
        }
        duplicateTriggerCount += 1;
        continue;
      }
      const record = createRecord(event);
      records.set(event.correctionId, record);
      correctionIdByDedupeKey.set(event.dedupeKey, event.correctionId);
      acceptedEventCount += 1;
      continue;
    }

    const record = records.get(event.correctionId);
    if (!record) {
      issue(issues, event, 'CORRECTION_NOT_FOUND', '状态转换缺少 candidate 事件');
      continue;
    }
    if (event.fromStatus !== record.status) {
      issue(issues, event, 'TRANSITION_FROM_MISMATCH', `当前状态为 ${record.status}，事件声明 ${event.fromStatus}`);
      continue;
    }
    if (!allowedTransitions[record.status].includes(event.toStatus)) {
      issue(issues, event, 'TRANSITION_NOT_ALLOWED', `${record.status} 不允许转换到 ${event.toStatus}`);
      continue;
    }
    applyEvent(record, event);
    acceptedEventCount += 1;
  }

  return {
    records: [...records.values()].sort((left, right) => left.correctionId.localeCompare(right.correctionId)),
    acceptedEventCount,
    duplicateEventCount,
    duplicateTriggerCount,
    issues,
  };
}

export function summarizeCorrectionAudit(projection: CorrectionAuditProjection): CorrectionAuditMetrics {
  const records = projection.records;
  const hasStatus = (record: CorrectionRecord, status: CorrectionStatus) => record.history.some((event) => event.toStatus === status);
  const effective = records.filter((record) => record.history.some((event) =>
    event.toStatus === 'handled' && event.outcome === 'success' && event.changedFields.length > 0));
  const revalidated = records.filter((record) => hasStatus(record, 'revalidated'));
  const closed = records.filter((record) => record.status === 'accepted');
  return {
    candidateEventCount: records.reduce((count, record) => count + record.triggerCount, 0),
    triggerCount: records.length,
    duplicateTriggerCount: projection.duplicateTriggerCount,
    impactedCaseCount: new Set(records.map((record) => record.caseId)).size,
    approvedCount: records.filter((record) => hasStatus(record, 'approved')).length,
    startedCount: records.filter((record) => hasStatus(record, 'running')).length,
    handledCount: records.filter((record) => hasStatus(record, 'handled')).length,
    effectiveCorrectionCount: effective.length,
    revalidatedCount: revalidated.length,
    closedCount: closed.length,
    rejectedCount: records.filter((record) => record.status === 'rejected').length,
    blockedCount: records.filter((record) => record.status === 'blocked').length,
    failedCount: records.filter((record) => record.status === 'failed').length,
    cancelledCount: records.filter((record) => record.status === 'cancelled').length,
    actionRequiredCount: records.filter((record) => record.actionRequired).length,
    closureRate: records.length === 0 ? 0 : closed.length / records.length,
    changedCaseIds: unique(effective.map((record) => record.caseId)),
    revalidatedCaseIds: unique(revalidated.map((record) => record.caseId)),
    closedCaseIds: unique(closed.map((record) => record.caseId)),
  };
}

function createRecord(event: CorrectionEvent): CorrectionRecord {
  return {
    correctionId: event.correctionId,
    dedupeKey: event.dedupeKey,
    applicationId: event.applicationId,
    planId: event.planId,
    caseId: event.caseId,
    changeType: event.changeType,
    changeIds: [...event.changeIds],
    caseFingerprint: event.caseFingerprint,
    implementationFingerprint: event.implementationFingerprint,
    status: 'candidate',
    handlingStatus: 'pending',
    verificationStatus: 'not-started',
    actionRequired: true,
    triggerCount: 1,
    transitionCount: 0,
    changedFields: [],
    evidenceIds: [],
    executionRunIds: [],
    executionReceiptIds: [],
    createdAt: event.occurredAt,
    updatedAt: event.occurredAt,
    history: [event],
  };
}

function createCandidateBatch(input: {
  applicationId: string;
  planId: string;
  impactedCaseIds: readonly string[];
  changeType: CorrectionChangeType;
  changeIdsByCase: ReadonlyMap<string, readonly string[]>;
  cases: readonly CorrectionCaseFingerprint[];
  occurredAt: string;
  actor: CorrectionActor;
  reason: string;
}): CorrectionCandidateBatch {
  const caseById = new Map(input.cases.map((item) => [item.caseId, item]));
  const events: CorrectionEvent[] = [];
  const skippedCaseIds: string[] = [];
  for (const caseId of unique(input.impactedCaseIds)) {
    const item = caseById.get(caseId);
    if (!item?.caseFingerprint.trim()) {
      skippedCaseIds.push(caseId);
      continue;
    }
    events.push(createCorrectionCandidateEvent({
      applicationId: input.applicationId,
      planId: input.planId,
      caseId,
      changeType: input.changeType,
      changeIds: input.changeIdsByCase.get(caseId) ?? [],
      caseFingerprint: item.caseFingerprint,
      implementationFingerprint: item.implementationFingerprint,
      occurredAt: input.occurredAt,
      actor: input.actor,
      reason: input.reason,
    }));
  }
  return { events, skippedCaseIds: unique(skippedCaseIds) };
}

function applyEvent(record: CorrectionRecord, event: CorrectionEvent): void {
  record.status = event.toStatus;
  record.transitionCount += 1;
  record.changedFields = unique([...record.changedFields, ...event.changedFields]);
  record.evidenceIds = unique([...record.evidenceIds, ...event.evidenceIds]);
  if (event.executionRunId) record.executionRunIds = unique([...record.executionRunIds, event.executionRunId]);
  if (event.executionReceiptId) record.executionReceiptIds = unique([...record.executionReceiptIds, event.executionReceiptId]);
  record.updatedAt = event.occurredAt;
  record.history.push(event);
  const derived = derivePublicState(event.toStatus);
  record.handlingStatus = derived.handlingStatus;
  record.verificationStatus = derived.verificationStatus;
  record.actionRequired = derived.actionRequired;
}

function derivePublicState(status: CorrectionStatus): Pick<CorrectionRecord, 'handlingStatus' | 'verificationStatus' | 'actionRequired'> {
  if (status === 'accepted') return { handlingStatus: 'handled', verificationStatus: 'verified', actionRequired: false };
  if (status === 'revalidated') return { handlingStatus: 'handled', verificationStatus: 'verified', actionRequired: false };
  if (status === 'handled') return { handlingStatus: 'handled', verificationStatus: 'pending', actionRequired: true };
  if (status === 'evidence-reconciliation-required') return { handlingStatus: 'handled', verificationStatus: 'evidence-reconciliation-required', actionRequired: true };
  if (status === 'failed') return { handlingStatus: 'blocked', verificationStatus: 'failed', actionRequired: true };
  if (status === 'blocked') return { handlingStatus: 'blocked', verificationStatus: 'pending', actionRequired: true };
  if (status === 'rejected' || status === 'cancelled') {
    return { handlingStatus: status === 'cancelled' ? 'cancelled' : 'handled', verificationStatus: 'not-started', actionRequired: false };
  }
  if (status === 'running') return { handlingStatus: 'in-progress', verificationStatus: 'pending', actionRequired: true };
  return { handlingStatus: 'pending', verificationStatus: 'not-started', actionRequired: true };
}

function validateEvent(event: CorrectionEvent): string[] {
  const errors: string[] = [];
  if (event.schemaVersion !== '1.0.0') errors.push('SCHEMA_UNSUPPORTED');
  if (!event.eventId.trim() || !event.correctionId.trim() || !event.dedupeKey.trim()) errors.push('IDENTITY_REQUIRED');
  if (!event.applicationId.trim() || !event.planId.trim() || !event.caseId.trim()) errors.push('SCOPE_REQUIRED');
  if (!event.caseFingerprint.trim()) errors.push('CASE_FINGERPRINT_REQUIRED');
  if (!Number.isFinite(Date.parse(event.occurredAt))) errors.push('OCCURRED_AT_INVALID');
  if (event.eventType !== `correction.${event.toStatus}`) errors.push('EVENT_TYPE_STATUS_MISMATCH');
  if (event.toStatus === 'candidate' && event.fromStatus !== null) errors.push('CANDIDATE_FROM_STATUS_INVALID');
  if (event.toStatus !== 'candidate' && event.fromStatus === null) errors.push('TRANSITION_FROM_STATUS_REQUIRED');
  if (event.dedupeKey !== buildCorrectionDedupeKey(event)) errors.push('DEDUPE_KEY_INVALID');
  if (!event.actor.actorType || !event.actor.actorId.trim() || !event.reason.trim()) errors.push('AUDIT_CONTEXT_REQUIRED');
  if (event.toStatus === 'handled' && event.outcome === null) errors.push('HANDLED_OUTCOME_REQUIRED');
  if (event.toStatus === 'revalidated' && (event.outcome !== 'success' || !event.executionReceiptId)) {
    errors.push('REVALIDATION_RECEIPT_REQUIRED');
  }
  return errors;
}

function validateIdentity(input: CorrectionCandidateInput): void {
  required(input.applicationId, 'CORRECTION_APPLICATION_ID_REQUIRED');
  required(input.planId, 'CORRECTION_PLAN_ID_REQUIRED');
  required(input.caseId, 'CORRECTION_CASE_ID_REQUIRED');
  required(input.caseFingerprint, 'CORRECTION_CASE_FINGERPRINT_REQUIRED');
  normalizeActor(input.actor);
}

function normalizeActor(actor: CorrectionActor): CorrectionActor {
  return { actorType: actor.actorType, actorId: required(actor.actorId, 'CORRECTION_ACTOR_ID_REQUIRED') };
}

function issue(issues: CorrectionAuditIssue[], event: CorrectionEvent, code: CorrectionAuditIssue['code'], message: string): void {
  issues.push({ eventId: event.eventId, correctionId: event.correctionId, code, message });
}

function unique(items: readonly string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].sort();
}

function required(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function validTime(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error('CORRECTION_TIME_INVALID');
  return value;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
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
