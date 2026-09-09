import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BusinessRuleDocument } from './business-rule-lifecycle';

/**
 * Public, system-neutral governance operations for business rules.
 *
 * The operation log is append-only.  A projection is derived from the log and
 * is deliberately separate from the formal rule document so that retiring,
 * revoking, or rolling back a rule never mutates historical rule semantics.
 */
export type BusinessRuleGovernanceEventType =
  | 'candidate-rejected'
  | 'candidate-held'
  | 'rule-retired'
  | 'rule-restored'
  | 'rule-rolled-back'
  | 'approval-revoked'
  | 'approval-expired';

export type BusinessRuleGovernanceEvent = {
  eventId: string;
  eventType: BusinessRuleGovernanceEventType;
  ruleId: string;
  ruleFingerprint: string;
  revision: number;
  occurredAt: string;
  actor: string;
  reason: string;
  effectiveTo?: string | null;
  expiresAt?: string | null;
  targetRevision?: number | null;
  targetRuleFingerprint?: string | null;
  resultingRevision?: number | null;
  resultingRuleFingerprint?: string | null;
};

export type BusinessRuleApprovalProjection =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'held'
  | 'revoked'
  | 'expired';

export type BusinessRuleLifecycleProjection = 'candidate' | 'formal' | 'retired';

export type BusinessRuleGovernanceProjectionRecord = {
  ruleId: string;
  lifecycleStatus: BusinessRuleLifecycleProjection;
  approvalStatus: BusinessRuleApprovalProjection;
  currentRevision: number;
  currentRuleFingerprint: string;
  revisionFingerprints: Record<string, string>;
  effectiveTo: string | null;
  lastEventId: string | null;
  history: string[];
};

export type BusinessRuleGovernanceProjection = {
  schemaVersion: '1.0.0';
  records: BusinessRuleGovernanceProjectionRecord[];
  diagnostics: string[];
  fingerprint: string;
};

export type BusinessRuleGovernanceQuery = {
  ruleId?: string;
  lifecycleStatus?: BusinessRuleLifecycleProjection;
  approvalStatus?: BusinessRuleApprovalProjection;
};

type StoredBusinessRuleGovernanceEvent = {
  event: BusinessRuleGovernanceEvent;
  previousHash: string | null;
  hash: string;
};

export class FileBusinessRuleGovernanceStore {
  constructor(private readonly filePath: string) {}

  append(event: BusinessRuleGovernanceEvent): { appended: boolean; duplicate: boolean } {
    const errors = validateBusinessRuleGovernanceEvent(event);
    if (errors.length > 0) throw new Error(`BUSINESS_RULE_GOVERNANCE_EVENT_INVALID:${errors.join(',')}`);
    const current = this.readStored();
    if (current.some((item) => item.event.eventId === event.eventId)) return { appended: false, duplicate: true };
    const previousHash = current.at(-1)?.hash ?? null;
    const recordWithoutHash = { event, previousHash };
    const record: StoredBusinessRuleGovernanceEvent = {
      ...recordWithoutHash,
      hash: sha256(stableStringify(recordWithoutHash)),
    };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
    return { appended: true, duplicate: false };
  }

  readAll(): BusinessRuleGovernanceEvent[] { return this.readStored().map((item) => ({ ...item.event })); }

  query(initialRules: readonly BusinessRuleDocument[], query: BusinessRuleGovernanceQuery = {}) {
    return queryBusinessRuleGovernance(projectBusinessRuleGovernance(this.readAll(), initialRules), query);
  }

  verifyIntegrity(): { valid: boolean; count: number; diagnostics: string[] } {
    const records = this.readStored(false);
    const diagnostics: string[] = [];
    let previousHash: string | null = null;
    records.forEach((record, index) => {
      if (record.previousHash !== previousHash) diagnostics.push(`GOVERNANCE_LOG_PREVIOUS_HASH_MISMATCH:${index}`);
      const expected = sha256(stableStringify({ event: record.event, previousHash: record.previousHash }));
      if (record.hash !== expected) diagnostics.push(`GOVERNANCE_LOG_HASH_MISMATCH:${index}`);
      previousHash = record.hash;
    });
    return { valid: diagnostics.length === 0, count: records.length, diagnostics };
  }

  private readStored(requireIntegrity = true): StoredBusinessRuleGovernanceEvent[] {
    if (!fs.existsSync(this.filePath)) return [];
    const records = fs.readFileSync(this.filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
      try { return JSON.parse(line) as StoredBusinessRuleGovernanceEvent; }
      catch { throw new Error(`BUSINESS_RULE_GOVERNANCE_LOG_INVALID_JSON:${index}`); }
    });
    if (requireIntegrity) {
      const integrity = this.verifyIntegrity();
      if (!integrity.valid) throw new Error(`BUSINESS_RULE_GOVERNANCE_LOG_INTEGRITY_FAILED:${integrity.diagnostics.join(',')}`);
    }
    return records;
  }
}

export type BusinessRuleTemporalContextReview = {
  timeStatus: 'complete' | 'partial' | 'unknown' | 'invalid';
  contextStatus: 'explicit' | 'missing' | 'metadata-inconsistent' | 'invalid';
  missingTimeFields: string[];
  diagnostics: string[];
};

const timeFields = ['createdAt', 'changedAt', 'effectiveFrom', 'lastVerifiedAt'] as const;
const contextFields = ['environmentIds', 'tenantIds', 'roleIds', 'locales', 'routes', 'featureFlags'] as const;

export function validateBusinessRuleTemporalContext(rule: BusinessRuleDocument): BusinessRuleTemporalContextReview {
  const governance = rule.governance;
  const diagnostics: string[] = [];
  const missingTimeFields = timeFields.filter((field) => !governance?.[field]);
  const suppliedTimeValues = timeFields
    .map((field) => ({ field, value: governance?.[field] ?? null }))
    .filter((item): item is { field: typeof timeFields[number]; value: string } => Boolean(item.value));
  for (const item of suppliedTimeValues) {
    if (parseTimestamp(item.value) === null) diagnostics.push(`TIME_FIELD_INVALID:${item.field}`);
  }
  if (governance?.effectiveTo && parseTimestamp(governance.effectiveTo) === null) {
    diagnostics.push('TIME_FIELD_INVALID:effectiveTo');
  }
  if (governance?.effectiveFrom && governance.effectiveTo
    && parseTimestamp(governance.effectiveFrom) !== null
    && parseTimestamp(governance.effectiveTo) !== null
    && parseTimestamp(governance.effectiveFrom)! > parseTimestamp(governance.effectiveTo)!) {
    diagnostics.push('EFFECTIVE_INTERVAL_INVALID');
  }
  const chronology: Array<[typeof timeFields[number], typeof timeFields[number]]> = [
    ['createdAt', 'changedAt'],
    ['changedAt', 'effectiveFrom'],
    ['effectiveFrom', 'lastVerifiedAt'],
  ];
  for (const [before, after] of chronology) {
    const beforeValue = governance?.[before];
    const afterValue = governance?.[after];
    if (beforeValue && afterValue && parseTimestamp(beforeValue) !== null && parseTimestamp(afterValue) !== null
      && parseTimestamp(beforeValue)! > parseTimestamp(afterValue)!) {
      diagnostics.push(`TIME_ORDER_INVALID:${before}>${after}`);
    }
  }
  const populatedContextFields = contextFields.filter((field) => rule.effectiveContext[field].length > 0);
  let contextStatus: BusinessRuleTemporalContextReview['contextStatus'];
  if (governance?.effectiveContextStatus === 'explicit' && populatedContextFields.length > 0) contextStatus = 'explicit';
  else if (governance?.effectiveContextStatus === 'explicit') {
    contextStatus = 'metadata-inconsistent';
    diagnostics.push('EFFECTIVE_CONTEXT_METADATA_INCONSISTENT');
  } else {
    contextStatus = 'missing';
    diagnostics.push('EFFECTIVE_CONTEXT_EVIDENCE_REQUIRED');
  }
  if (diagnostics.some((item) => item.startsWith('TIME_') || item === 'EFFECTIVE_INTERVAL_INVALID')) {
    return { timeStatus: 'invalid', contextStatus, missingTimeFields, diagnostics: unique(diagnostics) };
  }
  const timeStatus = governance?.timeEvidenceStatus === 'complete' && missingTimeFields.length === 0
    ? 'complete'
    : governance?.timeEvidenceStatus === 'partial' || suppliedTimeValues.length > 0
      ? 'partial'
      : 'unknown';
  if (timeStatus !== 'complete') diagnostics.push('TIME_EVIDENCE_INCOMPLETE');
  return { timeStatus, contextStatus, missingTimeFields, diagnostics: unique(diagnostics) };
}

export function validateBusinessRuleGovernanceEvent(event: BusinessRuleGovernanceEvent): string[] {
  const errors: string[] = [];
  if (!event.eventId.trim()) errors.push('GOVERNANCE_EVENT_ID_REQUIRED');
  if (!event.ruleId.trim()) errors.push('GOVERNANCE_EVENT_RULE_ID_REQUIRED');
  if (!/^[a-f0-9]{64}$/i.test(event.ruleFingerprint)) errors.push('GOVERNANCE_EVENT_RULE_FINGERPRINT_INVALID');
  if (!Number.isInteger(event.revision) || event.revision < 1) errors.push('GOVERNANCE_EVENT_REVISION_INVALID');
  if (!event.actor.trim()) errors.push('GOVERNANCE_EVENT_ACTOR_REQUIRED');
  if (!event.reason.trim()) errors.push('GOVERNANCE_EVENT_REASON_REQUIRED');
  if (parseTimestamp(event.occurredAt) === null) errors.push('GOVERNANCE_EVENT_TIME_INVALID');
  if (event.eventType === 'rule-retired') {
    if (!event.effectiveTo || parseTimestamp(event.effectiveTo) === null) errors.push('RETIRE_EFFECTIVE_TO_REQUIRED');
  }
  if (event.eventType === 'approval-expired') {
    if (!event.expiresAt || parseTimestamp(event.expiresAt) === null) errors.push('APPROVAL_EXPIRY_REQUIRED');
    if (event.expiresAt && parseTimestamp(event.expiresAt) !== null && parseTimestamp(event.occurredAt) !== null
      && parseTimestamp(event.expiresAt)! > parseTimestamp(event.occurredAt)!) errors.push('APPROVAL_NOT_EXPIRED');
  }
  if (event.eventType === 'rule-rolled-back') {
    if (!Number.isInteger(event.targetRevision) || (event.targetRevision ?? 0) < 1) errors.push('ROLLBACK_TARGET_REVISION_REQUIRED');
    if (!event.targetRuleFingerprint || !/^[a-f0-9]{64}$/i.test(event.targetRuleFingerprint)) errors.push('ROLLBACK_TARGET_FINGERPRINT_REQUIRED');
    if (!Number.isInteger(event.resultingRevision) || (event.resultingRevision ?? 0) < 1) errors.push('ROLLBACK_RESULTING_REVISION_REQUIRED');
    if (!event.resultingRuleFingerprint || !/^[a-f0-9]{64}$/i.test(event.resultingRuleFingerprint)) errors.push('ROLLBACK_RESULTING_FINGERPRINT_REQUIRED');
  }
  return unique(errors);
}

export function projectBusinessRuleGovernance(
  events: readonly BusinessRuleGovernanceEvent[],
  initialRules: readonly BusinessRuleDocument[] = [],
): BusinessRuleGovernanceProjection {
  const diagnostics: string[] = [];
  const records = new Map<string, BusinessRuleGovernanceProjectionRecord>();
  for (const rule of initialRules) {
    const existing = records.get(rule.ruleId);
    const revisionFingerprints = { ...(existing?.revisionFingerprints ?? {}), [String(rule.revision)]: rule.ruleFingerprint };
    if (rule.previousRuleFingerprint && rule.revision > 1) revisionFingerprints[String(rule.revision - 1)] = rule.previousRuleFingerprint;
    if (existing && existing.currentRevision > rule.revision) {
      existing.revisionFingerprints = revisionFingerprints;
      continue;
    }
    records.set(rule.ruleId, {
      ruleId: rule.ruleId,
      lifecycleStatus: rule.approval?.decision === 'approved' ? 'formal' : 'candidate',
      approvalStatus: rule.approval?.decision ?? 'pending',
      currentRevision: rule.revision,
      currentRuleFingerprint: rule.ruleFingerprint,
      revisionFingerprints,
      effectiveTo: rule.governance?.effectiveTo ?? null,
      lastEventId: null,
      history: [],
    });
  }
  const ordered = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));
  const seenEventIds = new Set<string>();
  for (const event of ordered) {
    const errors = validateBusinessRuleGovernanceEvent(event);
    if (errors.length > 0) { diagnostics.push(`${event.eventId}:${errors.join('|')}`); continue; }
    if (seenEventIds.has(event.eventId)) { diagnostics.push(`${event.eventId}:GOVERNANCE_EVENT_DUPLICATE`); continue; }
    seenEventIds.add(event.eventId);
    const record = records.get(event.ruleId) ?? {
      ruleId: event.ruleId,
      lifecycleStatus: 'candidate' as const,
      approvalStatus: 'pending' as const,
      currentRevision: event.revision,
      currentRuleFingerprint: event.ruleFingerprint,
      revisionFingerprints: { [String(event.revision)]: event.ruleFingerprint },
      effectiveTo: null,
      lastEventId: null,
      history: [],
    };
    if (event.ruleFingerprint !== record.currentRuleFingerprint) {
      diagnostics.push(`${event.eventId}:GOVERNANCE_EVENT_FINGERPRINT_STALE`);
      continue;
    }
    if (event.revision !== record.currentRevision) {
      diagnostics.push(`${event.eventId}:GOVERNANCE_EVENT_REVISION_STALE`);
      continue;
    }
    switch (event.eventType) {
      case 'candidate-rejected': record.approvalStatus = 'rejected'; record.lifecycleStatus = 'candidate'; break;
      case 'candidate-held': record.approvalStatus = 'held'; record.lifecycleStatus = 'candidate'; break;
      case 'approval-revoked': record.approvalStatus = 'revoked'; break;
      case 'approval-expired': record.approvalStatus = 'expired'; break;
      case 'rule-retired':
        if (record.lifecycleStatus !== 'formal') { diagnostics.push(`${event.eventId}:RETIRE_FORMAL_RULE_REQUIRED`); continue; }
        record.lifecycleStatus = 'retired'; record.effectiveTo = event.effectiveTo ?? null; break;
      case 'rule-restored':
        if (record.lifecycleStatus !== 'retired') { diagnostics.push(`${event.eventId}:RESTORE_RETIRED_RULE_REQUIRED`); continue; }
        record.lifecycleStatus = 'formal'; record.effectiveTo = null; break;
      case 'rule-rolled-back':
        if ((event.targetRevision ?? 0) >= record.currentRevision) { diagnostics.push(`${event.eventId}:ROLLBACK_TARGET_MUST_BE_OLDER`); continue; }
        if (record.revisionFingerprints[String(event.targetRevision)] !== event.targetRuleFingerprint) {
          diagnostics.push(`${event.eventId}:ROLLBACK_TARGET_NOT_IN_HISTORY`);
          continue;
        }
        if ((event.resultingRevision ?? 0) <= record.currentRevision) {
          diagnostics.push(`${event.eventId}:ROLLBACK_MUST_CREATE_NEW_REVISION`);
          continue;
        }
        record.currentRevision = event.resultingRevision!;
        record.currentRuleFingerprint = event.resultingRuleFingerprint!;
        record.revisionFingerprints[String(event.resultingRevision)] = event.resultingRuleFingerprint!;
        break;
    }
    record.currentRevision = Math.max(record.currentRevision, event.resultingRevision ?? event.revision);
    record.lastEventId = event.eventId;
    record.history.push(event.eventId);
    records.set(event.ruleId, record);
  }
  const normalized = [...records.values()].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  const withoutFingerprint = { schemaVersion: '1.0.0' as const, records: normalized, diagnostics: unique(diagnostics) };
  return { ...withoutFingerprint, fingerprint: sha256(stableStringify(withoutFingerprint)) };
}

export function queryBusinessRuleGovernance(
  projection: BusinessRuleGovernanceProjection,
  query: BusinessRuleGovernanceQuery = {},
): BusinessRuleGovernanceProjectionRecord[] {
  return projection.records.filter((record) => (
    (!query.ruleId || record.ruleId === query.ruleId)
    && (!query.lifecycleStatus || record.lifecycleStatus === query.lifecycleStatus)
    && (!query.approvalStatus || record.approvalStatus === query.approvalStatus)
  )).map((record) => ({ ...record, revisionFingerprints: { ...record.revisionFingerprints }, history: [...record.history] }));
}

export function validateBusinessRuleGovernanceEligibility(
  rule: BusinessRuleDocument,
  projection: BusinessRuleGovernanceProjection,
): string[] {
  const record = projection.records.find((item) => item.ruleId === rule.ruleId);
  if (!record) return [];
  const blockers: string[] = [];
  if (record.currentRuleFingerprint !== rule.ruleFingerprint) blockers.push('GOVERNANCE_PROJECTION_FINGERPRINT_MISMATCH');
  if (record.lifecycleStatus === 'retired') blockers.push('BUSINESS_RULE_RETIRED');
  if (record.approvalStatus !== 'approved') blockers.push(`BUSINESS_RULE_APPROVAL_NOT_ACTIVE:${record.approvalStatus}`);
  return blockers;
}

export function governanceEventId(event: Omit<BusinessRuleGovernanceEvent, 'eventId'>): string {
  return `business-rule-governance:${sha256(stableStringify(event)).slice(0, 24)}`;
}

function unique(values: readonly string[]): string[] { return [...new Set(values)].sort(); }
function parseTimestamp(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
