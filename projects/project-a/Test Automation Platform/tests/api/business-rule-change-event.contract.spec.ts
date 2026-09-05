import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildBusinessRuleEvaluationEvents,
  BUSINESS_RULE_CHANGE_EVENT_TYPES,
  validateBusinessRuleDecisionEvent,
  type BusinessRuleDecisionDetails,
} from '../../src/automation/system-test/business-rule-change-event';
import {
  createAuditEvent,
  FileAuditEventStore,
} from '../../src/audit/event-log';

const APPLICATION_ID = 'inventory-reference-app';
const DOMAIN_ID = 'inventory';
const RUN_ID = 'rule-evaluation:inventory:run-001';
const FINGERPRINT_A = 'a'.repeat(64);
const FINGERPRINT_B = 'b'.repeat(64);

function noChangeDecision(): BusinessRuleDecisionDetails {
  return {
    evaluationStatus: 'current',
    ruleId: 'BR-INVENTORY-001',
    decision: 'no-change',
    decisionReason: '测试方案转换未发现业务语义差异。',
    beforeRuleFingerprint: FINGERPRINT_A,
    afterRuleFingerprint: FINGERPRINT_A,
    beforeSourceFingerprint: FINGERPRINT_A,
    afterSourceFingerprint: FINGERPRINT_A,
    beforeRevision: 1,
    afterRevision: 1,
    beforeEffectiveVersion: 'inventory-v1',
    afterEffectiveVersion: 'inventory-v1',
    linkedCaseIds: ['TC-INVENTORY-001'],
    linkedBindingIds: ['binding:TC-INVENTORY-001'],
    executionProof: 'not-required',
    executionReceiptRefs: [],
    timeSource: 'test-fixture',
    timePrecision: 'instant',
  };
}

test.describe('业务规则评估事件合同', () => {
  test('每次评估生成开始、逐规则决策和结束事件', () => {
    const events = buildBusinessRuleEvaluationEvents({
      applicationId: APPLICATION_ID,
      businessDomainId: DOMAIN_ID,
      runId: RUN_ID,
      occurredAt: '2026-08-29T04:28:31.627Z',
      runDetails: {
        runType: 'test-plan-to-ui-script',
        evaluationStatus: 'current',
        baselineId: 'inventory-baseline-v1',
        triggerFingerprint: FINGERPRINT_A,
        sourceArtifacts: ['plan.json', 'bindings.json'],
        evaluatedRuleIds: ['BR-INVENTORY-001'],
      },
      decisions: [noChangeDecision()],
      beforeFingerprint: FINGERPRINT_A,
      afterFingerprint: FINGERPRINT_A,
    });

    expect(events.map((event) => event.eventType)).toEqual([
      BUSINESS_RULE_CHANGE_EVENT_TYPES.started,
      BUSINESS_RULE_CHANGE_EVENT_TYPES.decision,
      BUSINESS_RULE_CHANGE_EVENT_TYPES.completed,
    ]);
    expect(validateBusinessRuleDecisionEvent({
      ...events[1],
      details: events[1].details,
    } as never)).toEqual([]);
    expect((events[2].details as { decisionCounts: Record<string, number> }).decisionCounts['no-change']).toBe(1);
  });

  test('no-change 必须保持规则前后指纹一致', () => {
    const decision = { ...noChangeDecision(), afterRuleFingerprint: FINGERPRINT_B };
    expect(() => buildBusinessRuleEvaluationEvents({
      applicationId: APPLICATION_ID,
      businessDomainId: DOMAIN_ID,
      runId: RUN_ID,
      occurredAt: '2026-08-29T04:28:31.627Z',
      runDetails: {
        runType: 'test-plan-to-ui-script',
        evaluationStatus: 'current',
        sourceArtifacts: ['plan.json'],
        evaluatedRuleIds: [decision.ruleId],
      },
      decisions: [decision],
    })).toThrow('BUSINESS_RULE_EVENT_DECISION_INVALID:BUSINESS_RULE_NO_CHANGE_FINGERPRINT_MISMATCH');
  });

  test('正式规则更新缺少批准和完整执行收据时必须阻断', () => {
    const event = createAuditEvent({
      eventId: 'business-rule-decision:invalid-formal-update',
      eventType: BUSINESS_RULE_CHANGE_EVENT_TYPES.decision,
      actorType: 'system',
      applicationId: APPLICATION_ID,
      businessDomainId: DOMAIN_ID,
      runId: RUN_ID,
      beforeFingerprint: FINGERPRINT_A,
      afterFingerprint: FINGERPRINT_B,
      details: {
        ...noChangeDecision(),
        decision: 'formal-rule-updated',
        afterRuleFingerprint: FINGERPRINT_B,
        executionProof: 'missing',
        approvalRef: null,
        executionReceiptRefs: [],
      },
    });
    expect(validateBusinessRuleDecisionEvent(event)).toEqual([
      'BUSINESS_RULE_FORMAL_UPDATE_APPROVAL_REQUIRED',
      'BUSINESS_RULE_FORMAL_UPDATE_EXECUTION_PROOF_REQUIRED',
      'BUSINESS_RULE_FORMAL_UPDATE_RECEIPT_REQUIRED',
    ]);
  });

  test('历史导入不推断业务规则前后变化', () => {
    const events = buildBusinessRuleEvaluationEvents({
      applicationId: APPLICATION_ID,
      businessDomainId: DOMAIN_ID,
      runId: 'rule-evaluation:inventory:historical-001',
      occurredAt: '2026-08-14T13:55:54.823Z',
      runDetails: {
        runType: 'historical-import',
        evaluationStatus: 'historical-import',
        sourceArtifacts: ['legacy-conversion.json'],
        evaluatedRuleIds: ['BR-INVENTORY-001'],
      },
      decisions: [{
        evaluationStatus: 'historical-import',
        ruleId: 'BR-INVENTORY-001',
        decision: 'historical-import',
        decisionReason: '历史产物没有当次规则前后指纹，不能推断语义是否变化。',
        beforeRuleFingerprint: null,
        afterRuleFingerprint: null,
        linkedCaseIds: ['TC-INVENTORY-001'],
        linkedBindingIds: ['binding:TC-INVENTORY-001'],
        executionProof: 'historical-unavailable',
        executionReceiptRefs: [],
        timeSource: 'artifactGeneratedAt',
        timePrecision: 'artifact-generated',
      }],
    });
    expect(validateBusinessRuleDecisionEvent(events[1] as never)).toEqual([]);
  });

  test('历史落地范围未知时允许只记录运行事实而不伪造逐规则决策', () => {
    const events = buildBusinessRuleEvaluationEvents({
      applicationId: APPLICATION_ID,
      businessDomainId: DOMAIN_ID,
      runId: 'rule-evaluation:inventory:historical-scope-unknown',
      occurredAt: '2026-08-14T13:55:54.823Z',
      runDetails: {
        runType: 'historical-import',
        evaluationStatus: 'historical-import',
        sourceArtifacts: ['legacy-conversion.json'],
        sourceArtifactFingerprints: { 'legacy-conversion.json': FINGERPRINT_A },
        evaluatedRuleIds: [],
      },
      decisions: [],
    });
    expect(events.map((event) => event.eventType)).toEqual([
      BUSINESS_RULE_CHANGE_EVENT_TYPES.started,
      BUSINESS_RULE_CHANGE_EVENT_TYPES.completed,
    ]);
    expect((events[1].details as { decisionEventIds: string[] }).decisionEventIds).toEqual([]);
  });

  test('文件事件存储具备幂等追加和哈希链完整性', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'business-rule-events-'));
    try {
      const store = new FileAuditEventStore({ filePath: path.join(tempRoot, 'events.jsonl') });
      const input = {
        eventId: 'business-rule-evaluation:idempotent:start',
        eventType: BUSINESS_RULE_CHANGE_EVENT_TYPES.started,
        actorType: 'system' as const,
        applicationId: APPLICATION_ID,
        businessDomainId: DOMAIN_ID,
        runId: RUN_ID,
        occurredAt: '2026-08-29T04:28:31.627Z',
        details: { sourceArtifacts: ['plan.json'] },
      };
      expect(store.append(input).duplicate).toBe(false);
      expect(store.append(input).duplicate).toBe(true);
      expect(store.verifyIntegrity()).toMatchObject({ valid: true, count: 1, diagnostics: [] });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
