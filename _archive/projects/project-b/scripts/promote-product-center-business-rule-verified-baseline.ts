import fs from 'node:fs';
import path from 'node:path';
import {
  promoteBusinessRuleSemanticBaseline,
  type BusinessRuleSemanticBaseline,
  type BusinessRuleChangeTriggerResult,
} from '../automation/system-test/business-rule-change-trigger';
import { FileAuditEventStore } from '../../../Test Automation Platform/src/audit/event-log';
import { buildProductCenterFormalRulePromotionEvents } from '../adapters/product-center/product-center-business-rule-event-adapter';
import { buildProductCenterBusinessRuleEventLedger } from './build-product-center-business-rule-event-ledger';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from './build-product-center-business-rule-lifecycle-snapshot';
import { resolveSystemTestPlatformArtifact } from '../utils/system-test-platform-paths';

const projectRoot = path.resolve(__dirname, '..');
const baselinePath = path.join(
  projectRoot,
  'contracts/product-center/business-rules/product-center-business-rule-verified-baseline.json',
);
const triggerPath = path.join(
  projectRoot,
  'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
);
const receiptPath = path.join(
  projectRoot,
  'contracts/product-center/business-rules/generated/product-center-business-rule-baseline-promotion.json',
);
const auditEventLogPath = path.join(projectRoot, 'output/audit/product-center-events.jsonl');

type LandingReport = {
  modules: Array<{ assessment: { cases: Array<{
    caseId: string;
    caseFingerprint: string | null;
    implementationFingerprint?: string | null;
    implementationFingerprintRequired?: boolean;
  }> } }>;
};

type ExecutionIndex = {
  records: Array<{
    caseId: string;
    caseFingerprint: string;
    implementationFingerprint?: string | null;
    executionContextFingerprint?: string | null;
    status: 'passed' | 'failed' | 'skipped' | 'not-run';
    evidenceStatus?: 'complete' | 'incomplete' | 'legacy-unverified';
    cleanupEvidence?: { apiZeroResidue?: boolean; uiZeroResidue?: boolean };
    recordedAt: string;
    evidencePath?: string | null;
  }>;
};

export function promoteProductCenterBusinessRuleVerifiedBaseline() {
  const baseline = readJson<BusinessRuleSemanticBaseline>(baselinePath);
  const trigger = readJson<BusinessRuleChangeTriggerResult>(triggerPath);
  const snapshot = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
  const promotion = promoteBusinessRuleSemanticBaseline({
    baseline,
    currentRules: snapshot.rules,
    trigger,
  });
  let promotionRecordedAt: string | null = null;
  if (promotion.status === 'promoted') {
    const receiptResolution = resolvePromotionReceiptRefs(snapshot, promotion.promotedRuleIds);
    promotionRecordedAt = receiptResolution.recordedAt;
    const eventStore = new FileAuditEventStore({ filePath: auditEventLogPath });
    const integrity = eventStore.verifyIntegrity();
    if (!integrity.valid) {
      throw new Error(`PRODUCT_CENTER_AUDIT_LOG_INTEGRITY_FAILED:${integrity.diagnostics.join(',')}`);
    }
    const events = buildProductCenterFormalRulePromotionEvents({
      runId: `product-center-item:rule-promotion:${trigger.fingerprint.slice(0, 24)}`,
      occurredAt: promotionRecordedAt,
      lifecycle: snapshot,
      beforeBaseline: baseline,
      afterBaseline: promotion.baseline,
      trigger,
      promotedRuleIds: promotion.promotedRuleIds,
      executionReceiptRefsByCaseId: receiptResolution.refsByCaseId,
    });
    for (const event of events) eventStore.append(event);
    writeJsonAtomic(baselinePath, promotion.baseline);
    buildProductCenterBusinessRuleEventLedger();
  }
  const receipt = {
    schemaVersion: '1.0.0',
    receiptId: 'product-center-business-rule-baseline-promotion',
    status: promotion.status,
    triggerFingerprint: trigger.fingerprint,
    promotedRuleIds: promotion.promotedRuleIds,
    revalidatedCaseIds: promotion.revalidatedCaseIds,
    beforeFingerprint: promotion.beforeFingerprint,
    afterFingerprint: promotion.afterFingerprint,
    formalRuleSemanticsModified: promotion.formalRuleSemanticsModified,
    recordedAt: promotionRecordedAt,
    businessRuleEventRecorded: promotion.status === 'promoted',
  };
  writeJsonAtomic(receiptPath, receipt);
  return receipt;
}

function resolvePromotionReceiptRefs(
  snapshot: ReturnType<typeof loadCurrentProductCenterBusinessRuleLifecycleSnapshot>,
  promotedRuleIds: readonly string[],
): { refsByCaseId: Map<string, string>; recordedAt: string } {
  const governanceRoot = path.resolve(projectRoot, '..', 'deliverables/test-plan-governance');
  const landingReportPath = path.join(
    governanceRoot,
    process.env.PC_LANDING_INPUT_BASENAME?.trim()
      ? `${process.env.PC_LANDING_INPUT_BASENAME.trim()}.json`
      : 'product-center-item-group-landing-audit.json',
  );
  const landing = readJson<LandingReport>(landingReportPath);
  const executionIndex = readJson<ExecutionIndex>(resolveSystemTestPlatformArtifact('execution-index.json'));
  const expectedByCaseId = new Map(landing.modules.flatMap((module) => module.assessment.cases)
    .map((item) => [item.caseId, item]));
  const promotedRules = snapshot.rules.filter((rule) => promotedRuleIds.includes(rule.ruleId));
  const requiredCaseIds = [...new Set(promotedRules.flatMap((rule) => rule.linkedCaseIds))].sort();
  const approvedAtByCaseId = new Map<string, string>();
  for (const rule of promotedRules) {
    if (!rule.approval || !Number.isFinite(Date.parse(rule.approval.approvedAt))) {
      throw new Error(`PRODUCT_CENTER_RULE_PROMOTION_APPROVAL_INVALID:${rule.ruleId}`);
    }
    for (const caseId of rule.linkedCaseIds) {
      const current = approvedAtByCaseId.get(caseId);
      if (!current || current < rule.approval.approvedAt) approvedAtByCaseId.set(caseId, rule.approval.approvedAt);
    }
  }
  const refsByCaseId = new Map<string, string>();
  const recordedTimes: string[] = [];
  for (const caseId of requiredCaseIds) {
    const expected = expectedByCaseId.get(caseId);
    if (!expected?.caseFingerprint) throw new Error(`PRODUCT_CENTER_RULE_PROMOTION_CURRENT_CASE_FINGERPRINT_REQUIRED:${caseId}`);
    if (!expected.implementationFingerprint) {
      throw new Error(`PRODUCT_CENTER_RULE_PROMOTION_CURRENT_IMPLEMENTATION_FINGERPRINT_REQUIRED:${caseId}`);
    }
    const affectedRules = promotedRules.filter((rule) => rule.linkedCaseIds.includes(caseId));
    const apiZeroResidueRequired = affectedRules.some((rule) => (
      rule.semantics.cleanup.required && rule.semantics.cleanup.apiZeroResidueRequired
    ));
    const uiZeroResidueRequired = affectedRules.some((rule) => (
      rule.semantics.cleanup.required && rule.semantics.cleanup.uiZeroResidueRequired
    ));
    const approvalTime = approvedAtByCaseId.get(caseId)!;
    const receipt = executionIndex.records
      .filter((item) => (
        item.caseId === caseId
        && item.status === 'passed'
        && item.evidenceStatus === 'complete'
        && Boolean(item.evidencePath)
        && item.caseFingerprint === expected.caseFingerprint
        && item.implementationFingerprint === expected.implementationFingerprint
        && Boolean(item.executionContextFingerprint?.match(/^[a-f0-9]{64}$/))
        && (!apiZeroResidueRequired || item.cleanupEvidence?.apiZeroResidue === true)
        && (!uiZeroResidueRequired || item.cleanupEvidence?.uiZeroResidue === true)
        && item.recordedAt >= approvalTime
      ))
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
      .at(-1);
    if (!receipt?.evidencePath) throw new Error(`PRODUCT_CENTER_RULE_PROMOTION_CURRENT_RECEIPT_REQUIRED:${caseId}`);
    refsByCaseId.set(caseId, receipt.evidencePath);
    recordedTimes.push(receipt.recordedAt);
  }
  const recordedAt = recordedTimes.sort().at(-1);
  if (!recordedAt) throw new Error('PRODUCT_CENTER_RULE_PROMOTION_CURRENT_RECEIPT_REQUIRED');
  return { refsByCaseId, recordedAt };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(promoteProductCenterBusinessRuleVerifiedBaseline())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
