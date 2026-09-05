import { expect, test } from '@playwright/test';
import { evaluateGovernanceRequest, evaluateRetention, createGovernanceAuditRecord } from '../../src/governance/enterprise-governance';
import { aggregateValueMetrics, validateValueMetricBatch, validateValueMetricEvent } from '../../src/governance/value-metrics';
import { createRecoverySnapshot, verifyRecoverySnapshot } from '../../src/governance/disaster-recovery';

test.describe('公共平台企业治理与价值指标合同', () => {
  test('项目范围和只读角色必须阻断越权或变更', () => {
    expect(evaluateGovernanceRequest({ actorId: 'a', role: 'readonly', projectId: 'p', resourceProjectId: 'p', action: 'repair', sensitive: false })).toMatchObject({ allowed: false, reason: 'readonly-action-denied' });
    expect(evaluateGovernanceRequest({ actorId: 'a', role: 'test', projectId: 'p1', resourceProjectId: 'p2', action: 'view', sensitive: false })).toMatchObject({ allowed: false, reason: 'project-scope-denied' });
  });

  test('敏感证据只允许受控角色访问', () => {
    expect(evaluateGovernanceRequest({ actorId: 'a', role: 'developer', projectId: 'p', resourceProjectId: 'p', action: 'view', sensitive: true })).toMatchObject({ allowed: false, reason: 'sensitive-evidence-denied' });
    expect(evaluateGovernanceRequest({ actorId: 'a', role: 'audit', projectId: 'p', resourceProjectId: 'p', action: 'export', sensitive: true }).allowed).toBe(true);
  });

  test('审计记录形成可验证哈希链，保留策略尊重法律保留', () => {
    const first = createGovernanceAuditRecord({ actorId: 'a', projectId: 'p', action: 'view', objectId: 'o', outcome: 'allowed', reason: 'allowed', occurredAt: '2026-01-01T00:00:00Z' });
    const second = createGovernanceAuditRecord({ actorId: 'a', projectId: 'p', action: 'export', objectId: 'o', outcome: 'denied', reason: 'policy', occurredAt: '2026-01-02T00:00:00Z' }, first.recordHash);
    expect(second.previousHash).toBe(first.recordHash);
    expect(second.recordHash).toMatch(/^[a-f0-9]{64}$/);
    expect(evaluateRetention({ recordedAt: '2025-01-01T00:00:00Z', now: '2026-01-01T00:00:00Z', retentionDays: 30, legalHold: true, requestedDelete: true })).toMatchObject({ action: 'retain', reason: 'legal-hold' });
  });

  test('价值指标只接受显式遥测并可按运行聚合', () => {
    const events = [
      { eventType: 'evidence-located' as const, runId: 'r1', durationMs: 100, occurredAt: '2026-01-01T00:00:00Z', effective: true },
      { eventType: 'failure-classified' as const, runId: 'r1', durationMs: 300, occurredAt: '2026-01-02T00:00:00Z', effective: false },
      { eventType: 'rerun-skipped' as const, runId: 'r2', occurredAt: '2026-01-03T00:00:00Z' },
    ];
    expect(events.flatMap(validateValueMetricEvent)).toEqual([]);
    expect(aggregateValueMetrics(events)).toMatchObject({ sampleCount: 3, durationMedianMs: 200, effectiveCount: 1, eventCountByType: { 'rerun-skipped': 1 } });
    expect(validateValueMetricEvent({ ...events[0], runId: '', durationMs: -1 })).toEqual(['METRIC_RUN_ID_REQUIRED', 'METRIC_DURATION_INVALID']);
  });

  test('价值指标基线必须通过去重、窗口和分母完整性校验', () => {
    const events = [
      { eventId: 'e1', eventType: 'evidence-located' as const, runId: 'r1', caseId: 'c1', occurredAt: '2026-01-01T00:00:00Z' },
      { eventId: 'e1', eventType: 'failure-classified' as const, runId: 'r1', caseId: 'c1', occurredAt: '2026-01-02T00:00:00Z' },
      { eventId: 'e3', eventType: 'rerun-skipped' as const, runId: 'r2', occurredAt: '2026-01-04T00:00:00Z' },
    ];
    const quality = validateValueMetricBatch({ events, from: '2026-01-01T00:00:00Z', to: '2026-01-03T23:59:59Z', requireCaseId: true });
    expect(quality.valid).toBe(false);
    expect(quality.duplicateEventIds).toEqual(['e1']);
    expect(quality.outOfWindowIndexes).toEqual([2]);
    expect(quality.missingCaseIdCount).toBe(1);
    expect(quality.errors).toEqual(['METRIC_EVENTS_OUT_OF_WINDOW', 'METRIC_DUPLICATE_EVENT_ID', 'METRIC_CASE_ID_REQUIRED']);
  });

  test('灾备快照可验证内容哈希并拒绝恢复后漂移', () => {
    const objects = [{ id: 'o1', status: 'complete' }, { id: 'o2', status: 'archived' }];
    const snapshot = createRecoverySnapshot({ snapshotId: 'snap-1', createdAt: '2026-01-01T00:00:00Z', sourceKind: 'receipt', objects });
    expect(verifyRecoverySnapshot(snapshot, objects)).toMatchObject({ valid: true, reason: 'verified' });
    expect(verifyRecoverySnapshot(snapshot, [{ ...objects[0], status: 'changed' }, objects[1]])).toMatchObject({ valid: false, reason: 'content-hash-mismatch' });
  });
});
