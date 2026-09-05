import type { AuditEvent } from './event-log';

export type PlaywrightAuditStepKind =
  | 'business-operation'
  | 'assertion'
  | 'cleanup'
  | 'context-guard'
  | 'technical';

export type AuditStepLifecycleFinding = {
  code: 'STEP_START_MISSING' | 'STEP_TERMINAL_MISSING' | 'STEP_START_DUPLICATE' | 'STEP_TERMINAL_DUPLICATE' | 'STEP_IDENTITY_MISSING';
  stepId: string;
};

export type AuditStepLifecycleEvaluation = {
  status: 'complete' | 'incomplete';
  expectedStepIds: string[];
  terminalStepIds: string[];
  findings: AuditStepLifecycleFinding[];
};

export function evaluateAuditStepLifecycle(
  events: readonly Pick<AuditEvent, 'eventType' | 'caseId' | 'runId' | 'details'>[],
  expectedStepIds: readonly string[],
): AuditStepLifecycleEvaluation {
  const starts = new Map<string, number>();
  const terminals = new Map<string, number>();
  const findings: AuditStepLifecycleFinding[] = [];
  for (const event of events) {
    if (!['step.started', 'step.completed', 'step.failed', 'step.interrupted'].includes(event.eventType)) continue;
    const details = asRecord(event.details);
    const stepId = typeof details.stepId === 'string' ? details.stepId : '';
    if (!stepId || !event.caseId || !event.runId) {
      findings.push({ code: 'STEP_IDENTITY_MISSING', stepId: stepId || '<unknown>' });
      continue;
    }
    const target = event.eventType === 'step.started' ? starts : terminals;
    target.set(stepId, (target.get(stepId) ?? 0) + 1);
  }
  const expected = [...new Set(expectedStepIds)].sort();
  for (const stepId of expected) {
    const startCount = starts.get(stepId) ?? 0;
    const terminalCount = terminals.get(stepId) ?? 0;
    if (startCount === 0) findings.push({ code: 'STEP_START_MISSING', stepId });
    if (terminalCount === 0) findings.push({ code: 'STEP_TERMINAL_MISSING', stepId });
    if (startCount > 1) findings.push({ code: 'STEP_START_DUPLICATE', stepId });
    if (terminalCount > 1) findings.push({ code: 'STEP_TERMINAL_DUPLICATE', stepId });
  }
  return {
    status: findings.length === 0 ? 'complete' : 'incomplete',
    expectedStepIds: expected,
    terminalStepIds: [...terminals.keys()].filter((stepId) => expected.includes(stepId)).sort(),
    findings: findings.sort((left, right) => `${left.code}:${left.stepId}`.localeCompare(`${right.code}:${right.stepId}`)),
  };
}

/** Step telemetry is diagnostic only and can never substitute for an operation/assertion/cleanup receipt. */
export function isPassAuthorizingAuditStep(): false { return false; }

export function sanitizeAuditStepTitle(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(password|passwd|token|secret|authorization|cookie|session)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/([?&](?:access_token|token|secret|session)=)[^&#\s]+/gi, '$1[REDACTED]');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
