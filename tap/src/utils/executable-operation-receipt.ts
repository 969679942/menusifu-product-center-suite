import { createHash } from 'node:crypto';

export type ExecutableOperationReceipt = {
  operationKey: string;
  title: string;
  sequence: number;
  method: string;
  observed: boolean;
  status: 'passed' | 'failed';
  durationMs: number;
  startedAt?: string;
  finishedAt?: string;
  occurredAt?: string;
  responseStatus?: number;
  attempt?: number;
  retryOfEventId?: string | null;
  beforeFingerprint?: string | null;
  afterFingerprint?: string | null;
  changedFields?: string[];
  dataChanged?: boolean;
  details?: unknown;
};

type PendingOperation = Omit<ExecutableOperationReceipt, 'observed' | 'status' | 'durationMs' | 'startedAt'> & {
  executionId: string;
  startedAt: number;
  auditContext?: ExecutableOperationAuditContext;
};

export type ExecutableOperationAuditContext = {
  eventLogPath?: string;
  applicationId?: string;
  businessDomainId?: string;
  planId?: string;
  runId?: string;
  caseId?: string;
};

const receiptsByExecution = new Map<string, ExecutableOperationReceipt[]>();
const sequenceByExecution = new Map<string, number>();

export function startExecutableOperation(input: {
  executionId: string;
  operationKey: string;
  title: string;
  method: string;
  /** Explicit context for non-Playwright runners and local/CI-neutral fixtures. */
  auditContext?: ExecutableOperationAuditContext;
}): PendingOperation {
  const sequence = (sequenceByExecution.get(input.executionId) ?? 0) + 1;
  sequenceByExecution.set(input.executionId, sequence);
  const operation = { ...input, sequence, startedAt: Date.now() };
  appendRealtimeOperationStarted(operation);
  return operation;
}

export function finishExecutableOperation(
  operation: PendingOperation,
  status: ExecutableOperationReceipt['status'],
  evidence: {
    responseStatus?: number;
    attempt?: number;
    retryOfEventId?: string | null;
    before?: unknown;
    after?: unknown;
    details?: unknown;
  } = {},
): ExecutableOperationReceipt {
  const change = evidence.before === undefined && evidence.after === undefined
    ? undefined : buildStructuredChangeEvidence(evidence.before, evidence.after);
  const receipt: ExecutableOperationReceipt = {
    operationKey: operation.operationKey,
    title: operation.title,
    sequence: operation.sequence,
    method: operation.method,
    observed: status === 'passed',
    status,
    durationMs: Math.max(0, Date.now() - operation.startedAt),
    startedAt: new Date(operation.startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    responseStatus: evidence.responseStatus,
    attempt: evidence.attempt,
    retryOfEventId: evidence.retryOfEventId,
    beforeFingerprint: change?.beforeFingerprint,
    afterFingerprint: change?.afterFingerprint,
    changedFields: change?.changedFields,
    dataChanged: change?.dataChanged,
    details: evidence.details,
  };
  const receipts = receiptsByExecution.get(operation.executionId) ?? [];
  receipts.push(receipt);
  receiptsByExecution.set(operation.executionId, receipts);
  appendRealtimeAuditEvent(operation, receipt);
  return receipt;
}

export function buildStructuredChangeEvidence(before: unknown, after: unknown): {
  beforeFingerprint: string;
  afterFingerprint: string;
  changedFields: string[];
  dataChanged: boolean;
} {
  const changedFields = collectChangedFields(before, after);
  return {
    beforeFingerprint: sha256(stableJson(before)),
    afterFingerprint: sha256(stableJson(after)),
    changedFields,
    dataChanged: changedFields.length > 0,
  };
}

function appendRealtimeAuditEvent(
  operation: PendingOperation,
  receipt: ExecutableOperationReceipt,
): void {
  const filePath = operation.auditContext?.eventLogPath ?? process.env.SYSTEM_TEST_AUDIT_EVENT_LOG;
  if (!filePath) return;
  // Loaded lazily so this utility remains usable outside the audit-enabled runner.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { appendAuditEvent } = require('../audit/event-log') as typeof import('../audit/event-log');
  const caseId = operation.auditContext?.caseId ?? readCaseIdFromPlaywrightContext();
  const runId = operation.auditContext?.runId ?? process.env.SYSTEM_TEST_RUN_ID;
  const applicationId = operation.auditContext?.applicationId
    ?? process.env.SYSTEM_TEST_APPLICATION_ID ?? process.env.SYSTEM_TEST_SYSTEM_ID ?? 'unknown-application';
  const businessDomainId = operation.auditContext?.businessDomainId ?? process.env.SYSTEM_TEST_BUSINESS_DOMAIN_ID;
  const planId = operation.auditContext?.planId ?? process.env.SYSTEM_TEST_PLAN_ID;
  const eventId = `realtime-operation:${runId ?? 'unknown-run'}:${operation.executionId}:${caseId ?? 'unknown-case'}:${operation.operationKey}:${operation.sequence}:${receipt.occurredAt}`;
  appendAuditEvent(filePath, {
    eventId,
    eventType: 'operation.called',
    occurredAt: receipt.occurredAt,
    startedAt: receipt.startedAt,
    finishedAt: receipt.finishedAt,
    durationMs: receipt.durationMs,
    actorType: receipt.method.toUpperCase() === 'UI' ? 'runner' : 'system',
    applicationId,
    businessDomainId,
    planId,
    runId,
    caseId,
    traceId: runId ?? operation.executionId,
    outcome: receipt.status === 'passed' ? 'success' : 'failed',
    effectiveSuccess: receipt.status === 'passed',
    beforeFingerprint: receipt.beforeFingerprint ?? null,
    afterFingerprint: receipt.afterFingerprint ?? null,
    dataChanged: receipt.dataChanged === true,
    details: {
      sourceKind: 'realtime-executable-operation',
      operationKey: receipt.operationKey,
      title: receipt.title,
      sequence: receipt.sequence,
      method: receipt.method,
      observed: receipt.observed,
      status: receipt.status,
      responseStatus: receipt.responseStatus,
      beforeFingerprint: receipt.beforeFingerprint,
      afterFingerprint: receipt.afterFingerprint,
      changedFields: receipt.changedFields ?? [],
      structuredDiffProvided: Boolean(receipt.beforeFingerprint && receipt.afterFingerprint),
      realtime: true,
      logicalRunId: process.env.SYSTEM_TEST_LOGICAL_RUN_ID,
      phase: inferOperationPhase(receipt.title, receipt.method),
      stepName: receipt.title,
      businessAction: receipt.title,
    },
  });
}

function collectChangedFields(before: unknown, after: unknown, prefix = ''): string[] {
  if (stableJson(before) === stableJson(after)) return [];
  if (!isRecord(before) || !isRecord(after)) return [prefix || '$'];
  const fields = new Set<string>();
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    for (const field of collectChangedFields(before[key], after[key], prefix ? `${prefix}.${key}` : key)) fields.add(field);
  }
  return [...fields].sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }

function appendRealtimeOperationStarted(operation: PendingOperation): void {
  const filePath = operation.auditContext?.eventLogPath ?? process.env.SYSTEM_TEST_AUDIT_EVENT_LOG;
  if (!filePath) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { appendAuditEvent } = require('../audit/event-log') as typeof import('../audit/event-log');
  const caseId = operation.auditContext?.caseId ?? readCaseIdFromPlaywrightContext();
  const runId = operation.auditContext?.runId ?? process.env.SYSTEM_TEST_RUN_ID;
  const applicationId = operation.auditContext?.applicationId
    ?? process.env.SYSTEM_TEST_APPLICATION_ID ?? process.env.SYSTEM_TEST_SYSTEM_ID ?? 'unknown-application';
  const startedAt = new Date(operation.startedAt).toISOString();
  appendAuditEvent(filePath, {
    eventId: `realtime-operation-started:${runId ?? 'unknown-run'}:${operation.executionId}:${caseId ?? 'unknown-case'}:${operation.operationKey}:${operation.sequence}:${startedAt}`,
    eventType: 'operation.started',
    occurredAt: startedAt,
    startedAt,
    actorType: operation.method.toUpperCase() === 'UI' ? 'runner' : 'system',
    applicationId,
    businessDomainId: operation.auditContext?.businessDomainId ?? process.env.SYSTEM_TEST_BUSINESS_DOMAIN_ID,
    planId: operation.auditContext?.planId ?? process.env.SYSTEM_TEST_PLAN_ID,
    runId,
    caseId,
    traceId: runId ?? operation.executionId,
    details: {
      sourceKind: 'realtime-executable-operation', operationKey: operation.operationKey, title: operation.title,
      sequence: operation.sequence, stepIndex: operation.sequence, method: operation.method,
      logicalRunId: process.env.SYSTEM_TEST_LOGICAL_RUN_ID,
      phase: inferOperationPhase(operation.title, operation.method), businessAction: operation.title, realtime: true,
    },
  });
}

function inferOperationPhase(title: string, method: string): string {
  const value = `${title} ${method}`.toLowerCase();
  if (/delete|clean|cleanup|清理|残留/.test(value)) return 'cleanup';
  if (/assert|expect|verify|validate|校验|验证|断言/.test(value)) return 'assertion';
  if (/route|locale|role|tenant|context|上下文|路由|语言|角色|租户/.test(value)) return 'context-guard';
  if (/get|read|list|query|读取|查询|打开|进入/.test(value)) return 'read';
  return 'business-operation';
}

function readCaseIdFromPlaywrightContext(): string | undefined {
  try {
    // Avoid a hard dependency in non-Playwright consumers.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { test } = require('@playwright/test') as { test: { info(): { annotations?: Array<{ type?: string; description?: string }> } } };
    const annotationTypes = (process.env.SYSTEM_TEST_CASE_ID_ANNOTATION_TYPES ?? 'system-test-case-id')
      .split(',').map((item) => item.trim()).filter(Boolean);
    const annotations = test.info().annotations ?? [];
    return annotationTypes
      .map((type) => annotations.find((item) => item.type === type)?.description)
      .find((value): value is string => Boolean(value?.trim()));
  } catch {
    return undefined;
  }
}

export function readExecutableOperationReceipts(executionId: string): ExecutableOperationReceipt[] {
  return [...(receiptsByExecution.get(executionId) ?? [])].sort((left, right) => left.sequence - right.sequence);
}

export function consumeExecutableOperationReceipts(executionId: string): ExecutableOperationReceipt[] {
  const receipts = readExecutableOperationReceipts(executionId);
  clearExecutableOperationReceipts(executionId);
  return receipts;
}

export function clearExecutableOperationReceipts(executionId: string): void {
  receiptsByExecution.delete(executionId);
  sequenceByExecution.delete(executionId);
}

export function assertObservedExecutableOperations(
  receipts: readonly ExecutableOperationReceipt[],
  caseId: string,
): void {
  if (receipts.length === 0) throw new Error(`${caseId}:FORMAL_CASE_EXECUTABLE_OPERATION_RECEIPT_MISSING`);
  const failed = receipts.filter((receipt) => !receipt.observed || receipt.status !== 'passed');
  if (failed.length > 0) {
    throw new Error(`${caseId}:FORMAL_CASE_EXECUTABLE_OPERATION_NOT_OBSERVED:${failed.map((item) => item.operationKey).join(',')}`);
  }
}
