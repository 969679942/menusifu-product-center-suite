export const PUBLIC_CONTRACT_VERSION = '1.0.0' as const;

export const EXECUTION_PHASES = ['preflight', 'contract', 'pilot', 'full-regression'] as const;

export type AuditLifecycleEventIdInput = {
  runId: string;
  event: 'started' | 'completed' | 'failed' | 'blocked';
  namespace?: string;
};

export function buildAuditLifecycleEventId(input: AuditLifecycleEventIdInput): string {
  const runId = String(input.runId ?? '').trim();
  if (!runId) throw new Error('AUDIT_LIFECYCLE_RUN_ID_REQUIRED');
  const namespace = String(input.namespace ?? '').trim();
  if (namespace && !/^[A-Za-z0-9._-]{1,80}$/.test(namespace)) throw new Error('AUDIT_LIFECYCLE_NAMESPACE_INVALID');
  return `run-${input.event}:${runId}${namespace ? `:${namespace}` : ''}`;
}
