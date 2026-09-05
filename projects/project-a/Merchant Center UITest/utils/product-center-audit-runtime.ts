import path from 'node:path';
import { appendAuditEvent } from '../../../Test Automation Platform/src/audit/event-log';

const projectRoot = path.resolve(__dirname, '..');

export type ProductCenterAuditRunMetadata = {
  runId: string;
  logicalRunId: string;
  runType: string;
  triggerType: string;
  triggerSource: string;
  triggerActor: string;
  scope: string;
  purpose: string;
};

/** 在 Playwright worker 启动前建立统一的实时审计上下文。 */
export function configureProductCenterAuditRuntime(): ProductCenterAuditRunMetadata {
  const runId = process.env.SYSTEM_TEST_RUN_ID ?? `merchant-center-${Date.now()}`;
  const logicalRunId = process.env.SYSTEM_TEST_LOGICAL_RUN_ID ?? runId.replace(/(?:-retry)?-?\d{10,}$/i, '');
  const metadata: ProductCenterAuditRunMetadata = {
    runId,
    logicalRunId,
    runType: process.env.SYSTEM_TEST_RUN_TYPE ?? '业务执行',
    triggerType: process.env.SYSTEM_TEST_TRIGGER_TYPE ?? (process.env.CI ? '持续集成触发' : '人工试运行'),
    triggerSource: process.env.SYSTEM_TEST_TRIGGER_SOURCE ?? (process.env.CI ? 'CI' : '本地运行'),
    triggerActor: process.env.SYSTEM_TEST_TRIGGER_ACTOR ?? '执行器',
    scope: process.env.SYSTEM_TEST_SCOPE ?? '商品中心',
    purpose: process.env.SYSTEM_TEST_PURPOSE ?? '记录流程步骤、结果和证据，支持审计复盘',
  };
  process.env.SYSTEM_TEST_RUN_ID = runId;
  process.env.SYSTEM_TEST_LOGICAL_RUN_ID = logicalRunId;
  process.env.SYSTEM_TEST_APPLICATION_ID ??= 'merchant-center';
  process.env.SYSTEM_TEST_BUSINESS_DOMAIN_ID ??= 'product-center';
  process.env.SYSTEM_TEST_PLAN_ID ??= 'merchant-center-product-center';
  process.env.SYSTEM_TEST_AUDIT_EVENT_LOG ??= path.join(projectRoot, 'output', 'audit', 'product-center-events.jsonl');
  process.env.SYSTEM_TEST_AUDIT_RUN_METADATA = JSON.stringify(metadata);
  appendAuditEvent(process.env.SYSTEM_TEST_AUDIT_EVENT_LOG, {
    eventId: `run-started:${runId}`,
    eventType: 'run.started',
    occurredAt: new Date().toISOString(),
    actorType: 'runner',
    applicationId: 'merchant-center',
    businessDomainId: 'product-center',
    planId: 'merchant-center-product-center',
    runId,
    traceId: runId,
    details: { sourceKind: 'playwright-run-lifecycle', ...metadata, realtime: true },
  });
  return metadata;
}

export function appendProductCenterAuditRunCompleted(status: 'completed' | 'failed' | 'blocked' = 'completed'): void {
  const runId = process.env.SYSTEM_TEST_RUN_ID;
  const logPath = process.env.SYSTEM_TEST_AUDIT_EVENT_LOG;
  if (!runId || !logPath) return;
  let metadata: Record<string, unknown> = {};
  try { metadata = JSON.parse(process.env.SYSTEM_TEST_AUDIT_RUN_METADATA ?? '{}') as Record<string, unknown>; } catch { /* 保留最小终态事件 */ }
  appendAuditEvent(logPath, {
    eventId: `run-completed:${runId}:${status}`,
    eventType: status === 'completed' ? 'run.completed' : status === 'blocked' ? 'run.blocked' : 'run.failed',
    occurredAt: new Date().toISOString(),
    actorType: 'runner',
    applicationId: 'merchant-center',
    businessDomainId: 'product-center',
    planId: 'merchant-center-product-center',
    runId,
    traceId: runId,
    outcome: status === 'completed' ? 'success' : status,
    details: { sourceKind: 'playwright-run-lifecycle', ...metadata, terminalStatus: status, realtime: true },
  });
}
