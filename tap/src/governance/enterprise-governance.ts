import { createHash } from 'node:crypto';

export type GovernanceRole = 'product' | 'test' | 'developer' | 'audit' | 'readonly';
export type GovernanceAction = 'view' | 'export' | 'approve' | 'state-change' | 'repair' | 'rollback' | 'delete';

export type GovernanceRequest = {
  actorId: string;
  role: GovernanceRole;
  projectId: string;
  resourceProjectId: string;
  action: GovernanceAction;
  sensitive: boolean;
};

export type GovernanceDecision = {
  allowed: boolean;
  reason: 'allowed' | 'project-scope-denied' | 'readonly-action-denied' | 'sensitive-evidence-denied';
};

const MUTATING_ACTIONS = new Set<GovernanceAction>(['approve', 'state-change', 'repair', 'rollback', 'delete']);
const SENSITIVE_ROLES = new Set<GovernanceRole>(['product', 'test', 'audit']);

/** Deterministic, project-scoped RBAC decision used by public-core callers. */
export function evaluateGovernanceRequest(request: GovernanceRequest): GovernanceDecision {
  if (!request.actorId.trim() || !request.projectId.trim() || !request.resourceProjectId.trim()) {
    return { allowed: false, reason: 'project-scope-denied' };
  }
  if (request.projectId !== request.resourceProjectId) return { allowed: false, reason: 'project-scope-denied' };
  if (request.role === 'readonly' && MUTATING_ACTIONS.has(request.action)) {
    return { allowed: false, reason: 'readonly-action-denied' };
  }
  if (request.sensitive && !SENSITIVE_ROLES.has(request.role)) {
    return { allowed: false, reason: 'sensitive-evidence-denied' };
  }
  return { allowed: true, reason: 'allowed' };
}

export type GovernanceAuditRecord = {
  actorId: string;
  projectId: string;
  action: GovernanceAction;
  objectId: string;
  outcome: 'allowed' | 'denied';
  reason: string;
  occurredAt: string;
  previousHash: string | null;
};

export function createGovernanceAuditRecord(
  input: Omit<GovernanceAuditRecord, 'previousHash'>,
  previousHash: string | null = null,
): GovernanceAuditRecord & { recordHash: string } {
  const record = { ...input, previousHash };
  return { ...record, recordHash: sha256(JSON.stringify(record)) };
}

export type RetentionDecision = {
  action: 'retain' | 'archive' | 'delete';
  reason: 'within-retention' | 'expired' | 'legal-hold' | 'not-expired';
};

export function evaluateRetention(input: {
  recordedAt: string;
  now: string;
  retentionDays: number;
  legalHold: boolean;
  requestedDelete: boolean;
}): RetentionDecision {
  if (input.legalHold) return { action: 'retain', reason: 'legal-hold' };
  const ageMs = Date.parse(input.now) - Date.parse(input.recordedAt);
  const expired = Number.isFinite(ageMs) && ageMs >= input.retentionDays * 86_400_000;
  if (input.requestedDelete && expired) return { action: 'delete', reason: 'expired' };
  if (expired) return { action: 'archive', reason: 'expired' };
  return { action: 'retain', reason: input.requestedDelete ? 'within-retention' : 'not-expired' };
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
