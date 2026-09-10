export const LIFECYCLE_TELEMETRY_FIELDS = [
  'startedAt', 'completedAt', 'durationMs', 'inputFingerprint', 'outputFingerprint',
  'waitMs', 'retryCount', 'blockedReason', 'businessExecutionStarted', 'artifactPath',
] as const;

type Field = typeof LIFECYCLE_TELEMETRY_FIELDS[number];
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const timestamp = (value: unknown): value is string => text(value)
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)
  && Number.isFinite(Date.parse(value));

/** Structural telemetry qualification only; never authorizes business or platform completion. */
export function validateLifecycleTelemetry(input: Record<string, unknown>) {
  const validators: Record<Field, (value: unknown) => boolean> = {
    startedAt: timestamp, completedAt: timestamp, durationMs: nonnegative,
    inputFingerprint: text, outputFingerprint: text, waitMs: nonnegative,
    retryCount: (value) => nonnegative(value) && Number.isSafeInteger(value),
    blockedReason: (value) => value === null || typeof value === 'string',
    businessExecutionStarted: (value) => typeof value === 'boolean', artifactPath: text,
  };
  const missingTelemetry = LIFECYCLE_TELEMETRY_FIELDS.filter((key) => !Object.hasOwn(input, key));
  const invalid = new Set<Field>(LIFECYCLE_TELEMETRY_FIELDS.filter((key) => Object.hasOwn(input, key) && !validators[key](input[key])));
  if (timestamp(input.startedAt) && timestamp(input.completedAt) && Date.parse(input.completedAt) < Date.parse(input.startedAt)) invalid.add('completedAt');
  if (nonnegative(input.waitMs) && nonnegative(input.durationMs) && input.waitMs > input.durationMs) invalid.add('waitMs');
  const invalidTelemetry = LIFECYCLE_TELEMETRY_FIELDS.filter((key) => invalid.has(key));
  return {
    status: missingTelemetry.length || invalidTelemetry.length ? 'incomplete' as const : 'complete' as const,
    telemetryPresent: LIFECYCLE_TELEMETRY_FIELDS.filter((key) => !missingTelemetry.includes(key) && !invalid.has(key)),
    missingTelemetry, invalidTelemetry,
  };
}
