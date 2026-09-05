import { expect, test } from '@playwright/test';
import { planContractChangeImpact } from '../../src/utils/contract-change-impact';
import {
  createBusinessRuleCorrectionCandidates,
  createContractCorrectionCandidates,
  createCorrectionTransitionEvent,
  projectCorrectionEvents,
  summarizeCorrectionAudit,
  type CorrectionEvent,
  type CorrectionRecord,
} from '../../src/automation/system-test/system-test-correction-audit';

const actor = { actorType: 'system' as const, actorId: 'system-test-compiler' };

function transition(
  record: CorrectionRecord,
  toStatus: Parameters<typeof createCorrectionTransitionEvent>[1]['toStatus'],
  sequence: number,
  extras: Partial<Parameters<typeof createCorrectionTransitionEvent>[1]> = {},
): CorrectionEvent {
  return createCorrectionTransitionEvent(record, {
    eventId: `event:${sequence}`,
    occurredAt: `2026-08-28T00:00:${String(sequence).padStart(2, '0')}.000Z`,
    toStatus,
    actor,
    reason: `transition-to-${toStatus}`,
    ...extras,
  });
}

function append(events: CorrectionEvent[], next: CorrectionEvent): CorrectionRecord {
  events.push(next);
  return projectCorrectionEvents(events).records[0];
}

test.describe('跨系统用例纠正触发与影响审计合同', () => {
  test('合同变化复用追溯影响结果，并以系统、方案、用例及实现指纹稳定去重', () => {
    const impacts = planContractChangeImpact(
      [{ collection: 'fields', id: 'field:stock-limit', route: '/inventory' }],
      [{ caseId: 'TC-INVENTORY-001', route: '/inventory', sourceIds: ['field:stock-limit'] }],
    );
    const batch = createContractCorrectionCandidates({
      applicationId: 'inventory-reference-app',
      planId: 'inventory-regression',
      impacts,
      cases: [{ caseId: 'TC-INVENTORY-001', caseFingerprint: 'case-v2', implementationFingerprint: 'impl-v1' }],
      occurredAt: '2026-08-28T00:00:00.000Z',
      actor,
    });
    expect(batch.skippedCaseIds).toEqual([]);
    expect(batch.events[0]).toMatchObject({
      eventType: 'correction.candidate', caseId: 'TC-INVENTORY-001', changeType: 'contract',
      changeIds: ['field:stock-limit'], fromStatus: null, toStatus: 'candidate',
    });

    const projection = projectCorrectionEvents([batch.events[0], structuredClone(batch.events[0])]);
    expect(projection.records).toHaveLength(1);
    expect(projection).toMatchObject({ acceptedEventCount: 1, duplicateEventCount: 1, duplicateTriggerCount: 0, issues: [] });
    expect(summarizeCorrectionAudit(projection)).toMatchObject({ candidateEventCount: 1, triggerCount: 1, impactedCaseCount: 1 });

    const laterAttempt = createContractCorrectionCandidates({
      applicationId: 'inventory-reference-app', planId: 'inventory-regression', impacts,
      cases: [{ caseId: 'TC-INVENTORY-001', caseFingerprint: 'case-v2', implementationFingerprint: 'impl-v1' }],
      occurredAt: '2026-08-28T01:00:00.000Z', actor,
    }).events[0];
    const laterProjection = projectCorrectionEvents([batch.events[0], laterAttempt]);
    expect(laterProjection).toMatchObject({ acceptedEventCount: 2, duplicateEventCount: 0, duplicateTriggerCount: 1, issues: [] });
    expect(summarizeCorrectionAudit(laterProjection).candidateEventCount).toBe(2);
  });

  test('业务规则触发器只把明确 rerunCaseIds 转换为纠正候选，缺少指纹时安全跳过', () => {
    const batch = createBusinessRuleCorrectionCandidates({
      applicationId: 'inventory-reference-app',
      planId: 'inventory-regression',
      trigger: { changedRuleIds: ['BR-INVENTORY-001'], rerunCaseIds: ['TC-INVENTORY-001', 'TC-MISSING'] },
      cases: [{ caseId: 'TC-INVENTORY-001', caseFingerprint: 'case-v2', implementationFingerprint: null }],
      occurredAt: '2026-08-28T00:00:00.000Z',
      actor,
    });
    expect(batch.events.map((event) => event.caseId)).toEqual(['TC-INVENTORY-001']);
    expect(batch.events[0].changeIds).toEqual(['BR-INVENTORY-001']);
    expect(batch.skippedCaseIds).toEqual(['TC-MISSING']);
  });

  test('完整状态机独立投影 handling、verification、actionRequired 并统计有效闭环', () => {
    const events = createContractCorrectionCandidates({
      applicationId: 'inventory-reference-app', planId: 'inventory-regression',
      impacts: [{ caseId: 'TC-INVENTORY-001', match: 'source-id', changeIds: ['field:stock-limit'] }],
      cases: [{ caseId: 'TC-INVENTORY-001', caseFingerprint: 'case-v2', implementationFingerprint: 'impl-v2' }],
      occurredAt: '2026-08-28T00:00:00.000Z', actor,
    }).events;
    let record = projectCorrectionEvents(events).records[0];
    record = append(events, transition(record, 'impact-analyzed', 1));
    record = append(events, transition(record, 'approved', 2));
    record = append(events, transition(record, 'queued', 3));
    record = append(events, transition(record, 'running', 4, { executionRunId: 'run-001' }));
    record = append(events, transition(record, 'handled', 5, {
      outcome: 'success', changedFields: ['expectedResults', 'assertionSurfaces'], evidenceIds: ['diff:001'],
    }));
    expect(record).toMatchObject({ handlingStatus: 'handled', verificationStatus: 'pending', actionRequired: true });
    record = append(events, transition(record, 'revalidated', 6, {
      outcome: 'success', executionRunId: 'run-002', executionReceiptId: 'receipt-002', evidenceIds: ['evidence:002'],
    }));
    expect(record).toMatchObject({ handlingStatus: 'handled', verificationStatus: 'verified', actionRequired: false });
    record = append(events, transition(record, 'accepted', 7));

    const projection = projectCorrectionEvents(events);
    expect(projection.issues).toEqual([]);
    expect(summarizeCorrectionAudit(projection)).toEqual(expect.objectContaining({
      triggerCount: 1, approvedCount: 1, startedCount: 1, handledCount: 1,
      effectiveCorrectionCount: 1, revalidatedCount: 1, closedCount: 1,
      actionRequiredCount: 0, closureRate: 1,
      changedCaseIds: ['TC-INVENTORY-001'], revalidatedCaseIds: ['TC-INVENTORY-001'], closedCaseIds: ['TC-INVENTORY-001'],
    }));
  });

  test('非法跳转和没有标准执行收据的重验证事件不会进入当前状态', () => {
    const events = createContractCorrectionCandidates({
      applicationId: 'inventory-reference-app', planId: 'inventory-regression',
      impacts: [{ caseId: 'TC-INVENTORY-001', match: 'source-id', changeIds: ['field:stock-limit'] }],
      cases: [{ caseId: 'TC-INVENTORY-001', caseFingerprint: 'case-v2' }],
      occurredAt: '2026-08-28T00:00:00.000Z', actor,
    }).events;
    const candidate = projectCorrectionEvents(events).records[0];
    const invalid = { ...events[0], eventId: 'invalid-revalidation', eventType: 'correction.revalidated' as const,
      occurredAt: '2026-08-28T00:00:01.000Z', fromStatus: 'candidate' as const, toStatus: 'revalidated' as const };
    const projection = projectCorrectionEvents([...events, invalid]);
    expect(projection.records[0].status).toBe(candidate.status);
    expect(projection.issues.map((issue) => issue.code)).toEqual(['EVENT_INVALID']);
    expect(projection.issues[0].message).toContain('REVALIDATION_RECEIPT_REQUIRED');
  });
});
