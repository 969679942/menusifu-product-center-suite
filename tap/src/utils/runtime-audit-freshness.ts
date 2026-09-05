export type RuntimeAuditFreshnessStatus = 'fresh' | 'stale' | 'invalid';

export type RuntimeAuditFreshnessInput = {
  generatedAt?: string;
  observedAt?: string;
  freshUntil?: string;
  maxAgeDays?: number;
  now?: Date;
  applicationVersionFingerprint?: string;
  expectedApplicationVersionFingerprint?: string;
  environmentId?: string;
  expectedEnvironmentId?: string;
  roleId?: string;
  expectedRoleId?: string;
  locale?: string;
  expectedLocale?: string;
};

export type RuntimeAuditFreshnessAssessment = {
  status: RuntimeAuditFreshnessStatus;
  reasons: string[];
  expiresAt: string | null;
};

const DAY_MS = 86_400_000;

export function assessRuntimeAuditFreshness(input: RuntimeAuditFreshnessInput): RuntimeAuditFreshnessAssessment {
  const now = input.now ?? new Date();
  const reasons: string[] = [];
  const timestamps = [input.generatedAt, input.observedAt].filter((value): value is string => Boolean(value));
  const sourceTime = timestamps.length > 0 ? Date.parse(timestamps[0]) : Number.NaN;
  if (!Number.isFinite(sourceTime)) reasons.push('AUDIT_TIMESTAMP_MISSING_OR_INVALID');

  let expiresAt: Date | null = null;
  if (input.freshUntil !== undefined) {
    const parsed = Date.parse(input.freshUntil);
    if (!Number.isFinite(parsed)) reasons.push('AUDIT_FRESH_UNTIL_INVALID');
    else expiresAt = new Date(parsed);
  } else if (Number.isFinite(sourceTime) && input.maxAgeDays !== undefined) {
    if (!Number.isFinite(input.maxAgeDays) || input.maxAgeDays <= 0) reasons.push('AUDIT_MAX_AGE_INVALID');
    else expiresAt = new Date(sourceTime + input.maxAgeDays * DAY_MS);
  }

  if (input.expectedApplicationVersionFingerprint
    && input.applicationVersionFingerprint !== input.expectedApplicationVersionFingerprint) {
    reasons.push('AUDIT_APPLICATION_VERSION_MISMATCH');
  }
  if (input.expectedEnvironmentId && input.environmentId !== input.expectedEnvironmentId) reasons.push('AUDIT_ENVIRONMENT_MISMATCH');
  if (input.expectedRoleId && input.roleId !== input.expectedRoleId) reasons.push('AUDIT_ROLE_MISMATCH');
  if (input.expectedLocale && input.locale !== input.expectedLocale) reasons.push('AUDIT_LOCALE_MISMATCH');
  if (expiresAt && now.getTime() >= expiresAt.getTime()) reasons.push('AUDIT_EXPIRED');

  const status: RuntimeAuditFreshnessStatus = reasons.length > 0
    ? reasons.some((reason) => reason.includes('INVALID') || reason.includes('MISSING')) ? 'invalid' : 'stale'
    : 'fresh';
  return {
    status,
    reasons,
    expiresAt: expiresAt?.toISOString() ?? null,
  };
}

export function runtimeAuditNeedsRefresh(input: RuntimeAuditFreshnessInput): boolean {
  return assessRuntimeAuditFreshness(input).status !== 'fresh';
}
