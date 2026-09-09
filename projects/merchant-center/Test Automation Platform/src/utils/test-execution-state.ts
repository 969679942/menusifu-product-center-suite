import { createHash } from 'node:crypto';

export type ReleaseObservationStatus = 'verified' | 'derived' | 'unavailable';
export type ReleaseObservation = {
  status: ReleaseObservationStatus;
  fingerprint: string | null;
  source: string;
  stable: boolean;
  observedAt: string | null;
};

export type TestEvidenceStatus = 'complete' | 'incomplete' | 'legacy-unverified';
export type TestApplicabilityStatus =
  | 'current-confirmed'
  | 'valid-at-execution'
  | 'change-revalidation-required'
  | 'context-incompatible';
export type TestReuseStatus = 'reusable' | 'run-only' | 'invalidated';

export function normalizeReleaseObservation(input: {
  releaseObservation?: Partial<ReleaseObservation> | null;
  applicationVersionFingerprint?: string | null;
  observedAt?: string | null;
}): ReleaseObservation {
  const explicit = input.releaseObservation;
  const legacyFingerprint = normalizeFingerprint(input.applicationVersionFingerprint);
  const fingerprint = normalizeFingerprint(explicit?.fingerprint) ?? legacyFingerprint;
  const status = explicit?.status ?? (fingerprint ? 'verified' : 'unavailable');
  if (status === 'unavailable') {
    return {
      status,
      fingerprint: null,
      source: explicit?.source?.trim() || 'unavailable',
      stable: false,
      observedAt: normalizeTimestamp(explicit?.observedAt ?? input.observedAt),
    };
  }
  return {
    status,
    fingerprint,
    source: explicit?.source?.trim() || (legacyFingerprint ? 'legacy-application-version' : 'runtime-derived'),
    stable: explicit?.stable ?? status === 'verified',
    observedAt: normalizeTimestamp(explicit?.observedAt ?? input.observedAt),
  };
}

export function releaseObservationAllowsReuse(observation: ReleaseObservation): boolean {
  return Boolean(observation.fingerprint)
    && (observation.status === 'verified' || (observation.status === 'derived' && observation.stable));
}

export function resolveReuseStatus(input: {
  executionStatus: string;
  evidenceStatus: TestEvidenceStatus;
  releaseObservation: ReleaseObservation;
}): TestReuseStatus {
  if (input.executionStatus !== 'passed' || input.evidenceStatus !== 'complete') return 'invalidated';
  return releaseObservationAllowsReuse(input.releaseObservation) ? 'reusable' : 'run-only';
}

export function fingerprintExecutionContext(context: {
  environmentId?: string;
  tenantScope?: string;
  locale?: string;
  roleId?: string;
  route?: string;
  featureFlagFingerprint?: string;
}): string {
  const normalized = Object.fromEntries(Object.entries(context)
    .filter(([, value]) => value !== undefined && String(value).trim() !== '')
    .map(([key, value]) => [key, String(value).trim()])
    .sort(([left], [right]) => left.localeCompare(right)));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function normalizeFingerprint(value: unknown): string | null {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}
