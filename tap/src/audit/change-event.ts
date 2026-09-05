import fs from 'node:fs';
import path from 'node:path';
import { appendAuditEvent, type AuditEventInput, type AuditEventType } from './event-log';
import { createChangeSnapshot } from './change-snapshot';

export type ChangeObjectType = 'test-case' | 'business-rule' | 'api-script' | 'ui-script' | 'binding' | 'test-plan' | 'other';

export type RecordChangeInput = {
  eventLogPath: string;
  applicationId: string;
  businessDomainId?: string;
  planId?: string;
  objectType: ChangeObjectType;
  objectId: string;
  before?: unknown;
  after?: unknown;
  beforeFingerprint?: string | null;
  afterFingerprint?: string | null;
  changedFields?: string[];
  caseId?: string;
  affectedCaseIds?: string[];
  changedBy?: string;
  changeSource?: string;
  changeReason?: string;
  sourceRefs?: string[];
  bindingIds?: string[];
  runId?: string;
  occurredAt?: string;
};

/** 在保存/提交动作发生时写入一条不可变变更事件。 */
export function recordChangeEvent(input: RecordChangeInput): ReturnType<typeof appendAuditEvent> {
  if (!input.objectId.trim()) throw new Error('CHANGE_OBJECT_ID_REQUIRED');
  const snapshot = createChangeSnapshot({
    before: input.before, after: input.after,
    beforeFingerprint: input.beforeFingerprint, afterFingerprint: input.afterFingerprint,
    changedFields: input.changedFields, changedBy: input.changedBy,
    changeSource: input.changeSource, changeReason: input.changeReason,
  });
  const eventType = eventTypeFor(input.objectType);
  const event: AuditEventInput = {
    eventId: `change:${input.objectType}:${input.objectId}:${snapshot.afterFingerprint ?? snapshot.beforeFingerprint ?? input.occurredAt ?? Date.now()}`,
    eventType,
    occurredAt: input.occurredAt,
    actorType: input.changedBy ? 'human' : 'system',
    actorId: input.changedBy,
    applicationId: input.applicationId,
    businessDomainId: input.businessDomainId,
    planId: input.planId,
    runId: input.runId,
    caseId: input.caseId,
    outcome: 'success',
    effectiveSuccess: true,
    dataChanged: snapshot.beforeFingerprint !== snapshot.afterFingerprint || snapshot.changedFields.length > 0,
    beforeFingerprint: snapshot.beforeFingerprint,
    afterFingerprint: snapshot.afterFingerprint,
    evidenceRefs: input.sourceRefs,
    details: {
      sourceKind: 'governed-change-save',
      objectType: input.objectType,
      objectId: input.objectId,
      changedFields: snapshot.changedFields,
      decision: input.objectType === 'business-rule' ? 'change-observed' : undefined,
      affectedCaseIds: [...new Set([...(input.affectedCaseIds ?? []), ...(input.caseId ? [input.caseId] : [])])].sort(),
      changeSnapshot: snapshot,
      sourceRefs: input.sourceRefs,
      linkedBindingIds: input.bindingIds,
    },
  };
  return appendAuditEvent(input.eventLogPath, event);
}

/** 受管文件保存辅助：写入文件后立即产生变更事件；适用于脚本/规则/用例/绑定生成器。 */
export function saveFileWithChangeEvent(input: Omit<RecordChangeInput, 'before' | 'after'> & { filePath: string; content: string }): ReturnType<typeof appendAuditEvent> {
  const filePath = path.resolve(input.filePath);
  const before = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : undefined;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, input.content, 'utf8');
  return recordChangeEvent({ ...input, before, after: input.content });
}

function eventTypeFor(type: ChangeObjectType): AuditEventType {
  return ({
    'test-case': 'case.updated', 'business-rule': 'business-rule.decision',
    'api-script': 'implementation.fingerprint_changed', 'ui-script': 'implementation.fingerprint_changed',
    binding: 'binding.updated', 'test-plan': 'plan.compiled', other: 'state.changed',
  } as Record<ChangeObjectType, AuditEventType>)[type];
}
