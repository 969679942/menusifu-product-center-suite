import { createHash } from 'node:crypto';
import {
  buildBusinessRuleEvaluationEvents,
  type BusinessRuleDecisionDetails,
} from '../../../../Test Automation Platform/src/automation/system-test/business-rule-change-event';
import type { AuditEventInput } from '../../../../Test Automation Platform/src/audit/event-log';
import type { BusinessRuleSemanticBaseline, BusinessRuleChangeTriggerResult } from '../../automation/system-test/business-rule-change-trigger';
import type { ProductCenterBusinessRuleLifecycleSnapshot } from './product-center-business-rule-lifecycle-adapter';

export const PRODUCT_CENTER_RULE_EVENT_APPLICATION_ID = 'merchant-center';
export const PRODUCT_CENTER_RULE_EVENT_DOMAIN_ID = 'product-center-item';

export type ProductCenterHistoricalRuleLanding = {
  runId: string;
  sourceArtifactPath: string;
  sourceArtifactFingerprint: string;
  occurredAt: string;
  sourceRole: string;
  ruleScopeStatus: 'unresolved';
  timeSource: 'artifactGeneratedAt';
  timePrecision: 'artifact-generated';
};

export type ProductCenterCurrentRuleEvaluationInput = {
  runId: string;
  occurredAt: string;
  sourceArtifactPath: string;
  sourceArtifactFingerprint: string;
  lifecycle: ProductCenterBusinessRuleLifecycleSnapshot;
  baseline: BusinessRuleSemanticBaseline;
  trigger: BusinessRuleChangeTriggerResult;
  testPlanFingerprint?: string | null;
  implementationFingerprint?: string | null;
  executionContextFingerprint?: string | null;
};

export type ProductCenterFormalRulePromotionInput = {
  runId: string;
  occurredAt: string;
  lifecycle: ProductCenterBusinessRuleLifecycleSnapshot;
  beforeBaseline: BusinessRuleSemanticBaseline;
  afterBaseline: BusinessRuleSemanticBaseline;
  trigger: BusinessRuleChangeTriggerResult;
  promotedRuleIds: readonly string[];
  executionReceiptRefsByCaseId: ReadonlyMap<string, string>;
};

/** Historical conversions prove that a landing happened, not which later rules changed. */
export function buildProductCenterHistoricalRuleLandingEvents(
  landing: ProductCenterHistoricalRuleLanding,
): AuditEventInput[] {
  if (landing.ruleScopeStatus !== 'unresolved') {
    throw new Error('PRODUCT_CENTER_HISTORICAL_RULE_SCOPE_MUST_BE_UNRESOLVED');
  }
  return buildBusinessRuleEvaluationEvents({
    applicationId: PRODUCT_CENTER_RULE_EVENT_APPLICATION_ID,
    businessDomainId: PRODUCT_CENTER_RULE_EVENT_DOMAIN_ID,
    runId: landing.runId,
    occurredAt: landing.occurredAt,
    actorId: 'product-center-business-rule-event-adapter',
    runDetails: {
      runType: 'historical-import',
      evaluationStatus: 'historical-import',
      sourceArtifacts: [landing.sourceArtifactPath],
      sourceArtifactFingerprints: {
        [landing.sourceArtifactPath]: landing.sourceArtifactFingerprint,
      },
      evaluatedRuleIds: [],
    },
    decisions: [],
  });
}

/**
 * Converts a current rule/baseline comparison into audit facts. This function
 * never changes rule state and never authorizes or schedules case execution.
 */
export function buildProductCenterCurrentRuleEvaluationEvents(
  input: ProductCenterCurrentRuleEvaluationInput,
): AuditEventInput[] {
  validateCurrentEvaluationInput(input);
  const baselineByRuleId = new Map(input.baseline.rules.map((rule) => [rule.ruleId, rule]));
  const decisions = input.lifecycle.rules
    .map((rule): BusinessRuleDecisionDetails => {
      const before = baselineByRuleId.get(rule.ruleId)!;
      const changed = before.ruleFingerprint !== rule.ruleFingerprint;
      return {
        evaluationStatus: 'current',
        ruleId: rule.ruleId,
        decision: changed ? 'revalidation-required' : 'no-change',
        decisionReason: changed
          ? '当前正式规则指纹与已验证基线不同；保留正式规则并等待当前用例指纹、实现指纹和完整执行收据完成复验。'
          : '本次测试方案到脚本落地未改变该规则的业务语义指纹。',
        beforeRuleFingerprint: before.ruleFingerprint,
        afterRuleFingerprint: rule.ruleFingerprint,
        beforeSourceFingerprint: null,
        afterSourceFingerprint: rule.sourceFingerprint,
        beforeRevision: null,
        afterRevision: rule.revision,
        beforeEffectiveVersion: null,
        afterEffectiveVersion: rule.effectiveVersion,
        linkedCaseIds: [...rule.linkedCaseIds],
        linkedBindingIds: [...rule.linkedBindingIds],
        approvalRef: rule.approval ? {
          approvedBy: rule.approval.approvedBy,
          approvedAt: rule.approval.approvedAt,
          candidateFingerprint: rule.approval.candidateFingerprint,
          candidateSourceFingerprint: rule.approval.candidateSourceFingerprint,
        } : null,
        executionProof: changed ? 'missing' : 'not-required',
        executionReceiptRefs: [],
        timeSource: 'sourceArtifact.generatedAt',
        timePrecision: 'artifact-generated',
      };
    })
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  const beforeFingerprint = ruleSetFingerprint(input.baseline.rules);
  const afterFingerprint = ruleSetFingerprint(input.lifecycle.rules);
  return buildBusinessRuleEvaluationEvents({
    applicationId: PRODUCT_CENTER_RULE_EVENT_APPLICATION_ID,
    businessDomainId: PRODUCT_CENTER_RULE_EVENT_DOMAIN_ID,
    runId: input.runId,
    occurredAt: input.occurredAt,
    actorId: 'product-center-business-rule-event-adapter',
    runDetails: {
      runType: 'test-plan-to-ui-script',
      evaluationStatus: 'current',
      baselineId: input.baseline.baselineId,
      triggerFingerprint: input.trigger.fingerprint,
      sourceArtifacts: [input.sourceArtifactPath],
      sourceArtifactFingerprints: {
        [input.sourceArtifactPath]: input.sourceArtifactFingerprint,
      },
      testPlanFingerprint: input.testPlanFingerprint ?? null,
      implementationFingerprint: input.implementationFingerprint ?? null,
      executionContextFingerprint: input.executionContextFingerprint ?? null,
      lifecycleSnapshotFingerprint: input.lifecycle.fingerprint,
      evaluatedRuleIds: decisions.map((decision) => decision.ruleId),
    },
    decisions,
    beforeFingerprint,
    afterFingerprint,
  });
}

/** Builds formal-update facts only after every dependent case has a complete receipt reference. */
export function buildProductCenterFormalRulePromotionEvents(
  input: ProductCenterFormalRulePromotionInput,
): AuditEventInput[] {
  const beforeByRuleId = new Map(input.beforeBaseline.rules.map((rule) => [rule.ruleId, rule]));
  const afterByRuleId = new Map(input.afterBaseline.rules.map((rule) => [rule.ruleId, rule]));
  const currentByRuleId = new Map(input.lifecycle.rules.map((rule) => [rule.ruleId, rule]));
  const promotedRuleIds = [...new Set(input.promotedRuleIds)].sort();
  if (promotedRuleIds.length === 0) throw new Error('PRODUCT_CENTER_RULE_PROMOTION_EMPTY');
  const decisions = promotedRuleIds.map((ruleId): BusinessRuleDecisionDetails => {
    const before = beforeByRuleId.get(ruleId);
    const after = afterByRuleId.get(ruleId);
    const current = currentByRuleId.get(ruleId);
    if (!before || !after || !current || before.ruleFingerprint === after.ruleFingerprint
      || after.ruleFingerprint !== current.ruleFingerprint) {
      throw new Error(`PRODUCT_CENTER_RULE_PROMOTION_FINGERPRINT_INVALID:${ruleId}`);
    }
    if (!current.approval?.approvedBy || !Number.isFinite(Date.parse(current.approval.approvedAt))) {
      throw new Error(`PRODUCT_CENTER_RULE_PROMOTION_APPROVAL_INVALID:${ruleId}`);
    }
    const executionReceiptRefs = current.linkedCaseIds.map((caseId) => {
      const receiptRef = input.executionReceiptRefsByCaseId.get(caseId);
      if (!receiptRef) throw new Error(`PRODUCT_CENTER_RULE_PROMOTION_RECEIPT_REQUIRED:${ruleId}:${caseId}`);
      return receiptRef;
    });
    return {
      evaluationStatus: 'current',
      ruleId,
      decision: 'formal-rule-updated',
      decisionReason: '规则变更已获得明确批准，所有关联用例已使用当前用例/实现上下文形成完整通过收据，验证基线完成晋级。',
      beforeRuleFingerprint: before.ruleFingerprint,
      afterRuleFingerprint: after.ruleFingerprint,
      beforeSourceFingerprint: null,
      afterSourceFingerprint: current.sourceFingerprint,
      beforeRevision: null,
      afterRevision: current.revision,
      beforeEffectiveVersion: null,
      afterEffectiveVersion: current.effectiveVersion,
      linkedCaseIds: [...current.linkedCaseIds],
      linkedBindingIds: [...current.linkedBindingIds],
      approvalRef: {
        approvedBy: current.approval.approvedBy,
        approvedAt: current.approval.approvedAt,
        candidateFingerprint: current.approval.candidateFingerprint,
        candidateSourceFingerprint: current.approval.candidateSourceFingerprint,
      },
      executionProof: 'passed-complete',
      executionReceiptRefs,
      timeSource: 'latest-complete-execution-receipt.recordedAt',
      timePrecision: 'instant',
    };
  });
  return buildBusinessRuleEvaluationEvents({
    applicationId: PRODUCT_CENTER_RULE_EVENT_APPLICATION_ID,
    businessDomainId: PRODUCT_CENTER_RULE_EVENT_DOMAIN_ID,
    runId: input.runId,
    occurredAt: input.occurredAt,
    actorId: 'product-center-business-rule-baseline-promotion',
    runDetails: {
      runType: 'rule-revalidation',
      evaluationStatus: 'current',
      baselineId: input.afterBaseline.baselineId,
      triggerFingerprint: input.trigger.fingerprint,
      sourceArtifacts: [
        'contracts/product-center/business-rules/product-center-business-rule-verified-baseline.json',
        'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
        ...[...input.executionReceiptRefsByCaseId.values()],
      ],
      lifecycleSnapshotFingerprint: input.lifecycle.fingerprint,
      evaluatedRuleIds: promotedRuleIds,
    },
    decisions,
    beforeFingerprint: ruleSetFingerprint(input.beforeBaseline.rules),
    afterFingerprint: ruleSetFingerprint(input.afterBaseline.rules),
  });
}

function validateCurrentEvaluationInput(input: ProductCenterCurrentRuleEvaluationInput): void {
  if (input.lifecycle.applicationId !== PRODUCT_CENTER_RULE_EVENT_APPLICATION_ID
    || input.baseline.applicationId !== PRODUCT_CENTER_RULE_EVENT_APPLICATION_ID) {
    throw new Error('PRODUCT_CENTER_RULE_EVENT_APPLICATION_MISMATCH');
  }
  if (input.lifecycle.businessDomainId !== PRODUCT_CENTER_RULE_EVENT_DOMAIN_ID
    || input.baseline.businessDomainId !== PRODUCT_CENTER_RULE_EVENT_DOMAIN_ID) {
    throw new Error('PRODUCT_CENTER_RULE_EVENT_DOMAIN_MISMATCH');
  }
  if (input.trigger.baselineId !== input.baseline.baselineId || input.trigger.status === 'baseline-incomplete') {
    throw new Error('PRODUCT_CENTER_RULE_BASELINE_INCOMPLETE');
  }
  const currentByRuleId = new Map(input.lifecycle.rules.map((rule) => [rule.ruleId, rule]));
  const baselineByRuleId = new Map(input.baseline.rules.map((rule) => [rule.ruleId, rule]));
  if (currentByRuleId.size !== baselineByRuleId.size
    || [...currentByRuleId.keys()].some((ruleId) => !baselineByRuleId.has(ruleId))) {
    throw new Error('PRODUCT_CENTER_RULE_BASELINE_INCOMPLETE');
  }
  const actualChangedRuleIds = input.lifecycle.rules
    .filter((rule) => baselineByRuleId.get(rule.ruleId)!.ruleFingerprint !== rule.ruleFingerprint)
    .map((rule) => rule.ruleId)
    .sort();
  if (stableStringify(actualChangedRuleIds) !== stableStringify([...input.trigger.changedRuleIds].sort())) {
    throw new Error('PRODUCT_CENTER_RULE_TRIGGER_STALE');
  }
}

function ruleSetFingerprint(rules: readonly { ruleId: string; ruleFingerprint: string }[]): string {
  return createHash('sha256').update(stableStringify(
    rules.map(({ ruleId, ruleFingerprint }) => ({ ruleId, ruleFingerprint }))
      .sort((left, right) => left.ruleId.localeCompare(right.ruleId)),
  )).digest('hex');
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
