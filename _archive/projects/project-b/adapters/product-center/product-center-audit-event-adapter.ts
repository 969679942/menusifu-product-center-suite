import { createHash } from 'node:crypto';
import type { AuditEventInput, AuditOutcome } from '../../../../Test Automation Platform/src/audit/event-log';
import { createChangeSnapshot } from '../../../../Test Automation Platform/src/audit/change-snapshot';

export const PRODUCT_CENTER_AUDIT_IDENTITY = {
  applicationId: 'merchant-center',
  businessDomainId: 'product-center',
  planId: 'merchant-center-product-center',
} as const;

export type ProductCenterProgressRecord = {
  runId: string;
  caseId: string;
  phase: 'started' | 'completed' | 'failed';
  status?: string;
  failureCategory?: string;
  diagnosticFingerprint?: string;
  updatedAt: string;
};

export type ProductCenterExecutionIndexRecord = {
  caseId: string;
  runId?: string;
  executionEpochId?: string;
  recordedAt: string;
  status?: string;
  evidenceStatus?: string;
  durationMs?: number;
  caseFingerprint?: string | null;
  implementationFingerprint?: string | null;
  receiptEvidenceFingerprint?: string | null;
  evidenceFileFingerprint?: string | null;
  evidencePath?: string;
  cleanupEvidence?: { apiZeroResidue?: boolean; uiZeroResidue?: boolean };
  /** Optional inline receipts for indexes that embed runtime evidence. */
  operationReceipts?: ProductCenterOperationReceipt[];
  auditRequirements?: {
    schemaVersion?: string;
    operationExpected?: boolean;
    structuredDiffExpected?: boolean;
    cleanupExpected?: boolean;
    requiredOperationKeys?: string[];
    requiredEvidenceChannels?: string[];
  };
  [key: string]: unknown;
};

/**
 * Executable operation receipts emitted by governed UI/API flows.  Older
 * receipts only contain operationKey/method/status; newer producers may add
 * timing, response and structured diff fields.  The adapter preserves those
 * facts without inferring values that were not observed.
 */
export type ProductCenterOperationReceipt = {
  operationKey: string;
  title?: string;
  sequence?: number;
  method?: string;
  observed?: boolean;
  status?: string;
  durationMs?: number;
  occurredAt?: string;
  startedAt?: string;
  finishedAt?: string;
  attempt?: number;
  retryOfEventId?: string | null;
  responseStatus?: number | null;
  beforeFingerprint?: string | null;
  afterFingerprint?: string | null;
  changedFields?: string[];
  /** Optional脱敏前后内容；用于生成可读差异，缺失时仅保留指纹。 */
  beforeContent?: unknown;
  afterContent?: unknown;
  snapshotRef?: string;
  changedBy?: string;
  changeSource?: string;
  changeReason?: string;
  dataChanged?: boolean;
  details?: unknown;
  [key: string]: unknown;
};

export type ProductCenterRuntimeAuditCorrection = {
  caseId: string;
  reviewedCaseFingerprint?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  automatedDecision?: { decidedAt?: string; decidedBy?: string; policyId?: string; rationale?: string };
  status?: string;
  evidenceIds?: string[];
  evidencePaths?: string[];
  impacts?: Record<string, unknown>;
  resolution?: {
    action?: string;
    reason?: string;
    patches?: Record<string, unknown>;
    replacementCases?: unknown[];
    businessRuleChanges?: unknown[];
    technicalBindingChanges?: Array<{ caseId?: string; [key: string]: unknown }>;
    coverageChanges?: unknown[];
  };
};

export type ProductCenterAuditCompletenessCase = {
  caseId: string;
  status: 'complete' | 'incomplete' | 'excluded';
  requirements: ProductCenterExecutionIndexRecord['auditRequirements'];
  missing?: string[];
};

export function adaptProductCenterAuditCompleteness(
  cases: readonly ProductCenterAuditCompletenessCase[],
  context: { runId: string; occurredAt: string; sourcePath?: string },
): AuditEventInput[] {
  return cases.map((item) => compactAuditInput({
    ...PRODUCT_CENTER_AUDIT_IDENTITY,
    eventId: deterministicEventId('audit-completeness', context.runId, item.caseId, item.status, item.requirements),
    eventType: 'audit.case-classified',
    occurredAt: context.occurredAt,
    actorType: 'system',
    runId: context.runId,
    caseId: item.caseId,
    traceId: context.runId,
    outcome: item.status === 'complete' || item.status === 'excluded' ? 'success' : 'blocked',
    effectiveSuccess: item.status === 'complete',
    details: {
      sourceKind: 'system-test-audit-completeness-1.1',
      sourcePath: context.sourcePath,
      auditStatus: item.status,
      auditRequirements: item.requirements,
      missing: [...(item.missing ?? [])].sort(),
    },
  }));
}

export type ProductCenterRuntimeAuditDocument = {
  collectionId: string;
  planId?: string;
  generatedAt: string;
  corrections?: ProductCenterRuntimeAuditCorrection[];
};

export type ProductCenterClosureAudit = {
  collectionId: string;
  generatedAt: string;
  summary?: Record<string, number>;
  auditDecision?: unknown;
  incrementalSelection?: unknown;
  cases?: Array<{
    caseId: string;
    module?: string;
    title?: string;
    state?: string;
    currentCaseFingerprint?: string | null;
    currentImplementationFingerprint?: string | null;
    handlingStatus?: string;
    verificationStatus?: string;
    actionRequired?: boolean;
    historicalEvidenceRefs?: string[];
  }>;
};

export function adaptProductCenterProgress(
  records: readonly ProductCenterProgressRecord[],
): AuditEventInput[] {
  return records.map((record) => compactAuditInput({
    ...PRODUCT_CENTER_AUDIT_IDENTITY,
    eventId: deterministicEventId('progress', record.runId, record.caseId, record.phase, record.updatedAt),
    eventType: record.phase === 'started' ? 'case.started' : 'case.completed',
    occurredAt: record.updatedAt,
    actorType: 'runner',
    runId: record.runId,
    caseId: record.caseId,
    traceId: record.runId,
    outcome: progressOutcome(record),
    effectiveSuccess: record.phase === 'completed' && isSuccessfulStatus(record.status),
    details: {
      sourceKind: 'system-test-progress',
      phase: record.phase,
      status: record.status,
      failureCategory: record.failureCategory,
      diagnosticFingerprint: record.diagnosticFingerprint,
    },
  }));
}

/** Execution index records are receipts, not state decisions. */
export function adaptProductCenterExecutionReceipts(
  records: readonly ProductCenterExecutionIndexRecord[],
): AuditEventInput[] {
  return records.flatMap((record) => {
    const runId = record.runId ?? record.executionEpochId;
    const evidenceEvent = compactAuditInput({
      ...PRODUCT_CENTER_AUDIT_IDENTITY,
      eventId: deterministicEventId(
        'receipt', runId ?? 'unknown-run', record.caseId,
        record.receiptEvidenceFingerprint ?? record.evidenceFileFingerprint ?? record.recordedAt,
      ),
      eventType: 'evidence.recorded',
      occurredAt: record.recordedAt,
      actorType: 'system',
      runId,
      caseId: record.caseId,
      traceId: runId,
      durationMs: record.durationMs,
      outcome: receiptOutcome(record),
      effectiveSuccess: record.status === 'passed' && record.evidenceStatus === 'complete',
      evidenceRefs: record.evidencePath ? [record.evidencePath] : [],
      details: {
        sourceKind: 'standard-execution-receipt',
        receiptStatus: record.status,
        evidenceStatus: record.evidenceStatus,
        caseFingerprint: record.caseFingerprint,
        implementationFingerprint: record.implementationFingerprint,
        receiptEvidenceFingerprint: record.receiptEvidenceFingerprint,
        evidenceFileFingerprint: record.evidenceFileFingerprint,
        cleanupEvidence: record.cleanupEvidence,
        auditRequirements: record.auditRequirements,
      },
    });
    const operationEvents = adaptProductCenterOperationReceipts(record.operationReceipts ?? [], {
      runId,
      caseId: record.caseId,
      occurredAt: record.recordedAt,
      sourcePath: record.evidencePath,
    });
    return [evidenceEvent, ...operationEvents];
  });
}

/** Convert executable UI/API operation receipts into call-level audit events. */
export function adaptProductCenterOperationReceipts(
  receipts: readonly ProductCenterOperationReceipt[],
  context: { runId?: string; caseId?: string; occurredAt: string; sourcePath?: string } = { occurredAt: new Date(0).toISOString() },
): AuditEventInput[] {
  return receipts.map((receipt, index) => {
    const operationKey = String(receipt.operationKey ?? '').trim();
    if (!operationKey) return null;
    const sequence = Number.isInteger(receipt.sequence) ? Number(receipt.sequence) : index + 1;
    const occurredAt = receipt.occurredAt ?? receipt.finishedAt ?? receipt.startedAt ?? context.occurredAt;
    const status = String(receipt.status ?? '').toLowerCase();
    const observed = receipt.observed === true;
    const outcome: AuditOutcome = status === 'skipped'
      ? 'skipped'
      : observed && ['passed', 'success', 'completed', ''].includes(status) ? 'success' : 'failed';
    const changedFields = Array.isArray(receipt.changedFields)
      ? receipt.changedFields.filter((item): item is string => typeof item === 'string').sort()
      : [];
    const dataChanged = receipt.dataChanged === true || changedFields.length > 0
      || receipt.beforeFingerprint != null || receipt.afterFingerprint != null;
    const changeSnapshot = dataChanged ? createChangeSnapshot({
      before: receipt.beforeContent,
      after: receipt.afterContent,
      beforeFingerprint: receipt.beforeFingerprint,
      afterFingerprint: receipt.afterFingerprint,
      changedFields,
      snapshotRef: receipt.snapshotRef,
      changedBy: receipt.changedBy,
      changeSource: receipt.changeSource,
      changeReason: receipt.changeReason,
    }) : undefined;
    const eventId = deterministicEventId(
      'operation', context.runId ?? 'unknown-run', context.caseId ?? 'unknown-case',
      operationKey, sequence, occurredAt, receipt.beforeFingerprint ?? null, receipt.afterFingerprint ?? null,
    );
    return compactAuditInput({
      ...PRODUCT_CENTER_AUDIT_IDENTITY,
      eventId,
      eventType: 'operation.called',
      occurredAt,
      actorType: receipt.method?.toUpperCase() === 'UI' ? 'runner' : 'system',
      runId: context.runId,
      caseId: context.caseId,
      traceId: context.runId,
      startedAt: receipt.startedAt,
      finishedAt: receipt.finishedAt,
      durationMs: receipt.durationMs,
      attempt: receipt.attempt,
      retryOfEventId: receipt.retryOfEventId,
      outcome,
      effectiveSuccess: outcome === 'success',
      beforeFingerprint: receipt.beforeFingerprint ?? null,
      afterFingerprint: receipt.afterFingerprint ?? null,
      dataChanged,
      details: {
        sourceKind: 'executable-operation-receipt',
        sourcePath: context.sourcePath,
        operationKey,
        title: receipt.title,
        sequence,
        method: receipt.method,
        observed,
        status: receipt.status,
        responseStatus: receipt.responseStatus,
        changedFields,
        ...(changeSnapshot ? { changeSnapshot } : {}),
        structuredDiffProvided: changedFields.length > 0 || receipt.beforeFingerprint != null || receipt.afterFingerprint != null,
        ...(receipt.details === undefined ? {} : { receiptDetails: receipt.details }),
      },
    });
  }).filter((item): item is AuditEventInput => item !== null);
}

/**
 * A runtime-audit decision yields candidate/approval facts only. Starting or completing
 * remediation must come from the governed correction runner and is never inferred here.
 */
export function adaptProductCenterRuntimeAudit(
  document: ProductCenterRuntimeAuditDocument,
): AuditEventInput[] {
  return (document.corrections ?? []).flatMap((correction) => {
    const correctionId = deterministicEventId(document.collectionId, correction.caseId, correction.reviewedCaseFingerprint ?? 'unfingerprinted');
    const occurredAt = correction.reviewedAt ?? correction.automatedDecision?.decidedAt ?? document.generatedAt;
    const changedFields = correctionChangedFields(correction);
    const base = {
      ...PRODUCT_CENTER_AUDIT_IDENTITY,
      planId: document.planId ?? PRODUCT_CENTER_AUDIT_IDENTITY.planId,
      occurredAt,
      caseId: correction.caseId,
      correctionId,
      traceId: document.collectionId,
      actorType: correction.automatedDecision ? 'system' as const : 'human' as const,
      actorId: correction.reviewedBy ?? correction.automatedDecision?.decidedBy,
      beforeFingerprint: correction.reviewedCaseFingerprint ?? null,
      dataChanged: changedFields.length > 0,
      evidenceRefs: [...(correction.evidencePaths ?? []), ...(correction.evidenceIds ?? [])],
      details: {
        sourceKind: 'runtime-audit-correction',
        decisionStatus: correction.status,
        action: correction.resolution?.action,
        reason: correction.resolution?.reason,
        impacts: correction.impacts,
        changedFields,
        affectedCaseIds: affectedCorrectionCases(correction),
        policyId: correction.automatedDecision?.policyId,
        rationale: correction.automatedDecision?.rationale,
      },
    };
    const candidate: AuditEventInput = {
      ...base,
      eventId: deterministicEventId(correctionId, 'candidate'),
      eventType: 'correction.candidate',
      outcome: correction.status === 'review-required' ? 'blocked' : 'success',
    };
    if (!['auto-confirmed-runtime', 'human-confirmed-runtime'].includes(correction.status ?? '')) return [compactAuditInput(candidate)];
    return [compactAuditInput(candidate), compactAuditInput({
      ...base,
      eventId: deterministicEventId(correctionId, 'approved'),
      parentEventId: candidate.eventId,
      eventType: 'correction.approved',
      outcome: 'success',
      effectiveSuccess: true,
    })];
  });
}

/** Closure audit is a projection snapshot; it must not fabricate per-case state transitions. */
export function adaptProductCenterClosureAudit(document: ProductCenterClosureAudit): AuditEventInput[] {
  const actionRequiredCaseIds = (document.cases ?? []).filter((item) => item.actionRequired).map((item) => item.caseId);
  return [compactAuditInput({
    ...PRODUCT_CENTER_AUDIT_IDENTITY,
    eventId: deterministicEventId('closure-audit', document.collectionId, document.generatedAt),
    eventType: 'audit.completed',
    occurredAt: document.generatedAt,
    actorType: 'system',
    traceId: document.collectionId,
    outcome: 'success',
    effectiveSuccess: true,
    details: {
      sourceKind: 'closure-audit-projection',
      summary: document.summary ?? {},
      auditDecision: document.auditDecision,
      incrementalSelection: document.incrementalSelection,
      actionRequiredCaseIds,
      projectionOnly: true,
    },
  })];
}

export function deterministicEventId(...parts: readonly unknown[]): string {
  const fingerprint = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return `merchant-center-${fingerprint.slice(0, 32)}`;
}

function progressOutcome(record: ProductCenterProgressRecord): AuditOutcome | undefined {
  if (record.phase === 'started') return undefined;
  if (record.phase === 'failed') return record.failureCategory === 'external-dependency' ? 'blocked' : 'failed';
  return isSuccessfulStatus(record.status) ? 'success' : record.status === 'skipped' ? 'skipped' : 'failed';
}

function receiptOutcome(record: ProductCenterExecutionIndexRecord): AuditOutcome {
  if (record.status === 'passed' && record.evidenceStatus === 'complete') return 'success';
  if (record.status === 'skipped') return 'skipped';
  if (String(record.status).includes('blocked')) return 'blocked';
  return 'failed';
}

function isSuccessfulStatus(status?: string): boolean {
  return ['passed', 'completed', 'success'].includes(status ?? '');
}

function correctionChangedFields(correction: ProductCenterRuntimeAuditCorrection): string[] {
  const resolution = correction.resolution;
  const fields = new Set<string>();
  for (const key of Object.keys(resolution?.patches ?? {})) fields.add(key);
  if (resolution?.replacementCases?.length) fields.add('replacementCases');
  if (resolution?.businessRuleChanges?.length) fields.add('businessRules');
  if (resolution?.technicalBindingChanges?.length) fields.add('technicalBindings');
  if (resolution?.coverageChanges?.length) fields.add('coverage');
  return [...fields].sort();
}

function affectedCorrectionCases(correction: ProductCenterRuntimeAuditCorrection): string[] {
  return [...new Set([
    correction.caseId,
    ...(correction.resolution?.technicalBindingChanges ?? []).flatMap((item) => item.caseId ? [item.caseId] : []),
  ])].sort();
}

/** Keep adapter output stable across JSONL persistence by omitting optional undefined values. */
function compactAuditInput(input: AuditEventInput): AuditEventInput {
  return JSON.parse(JSON.stringify(input)) as AuditEventInput;
}
