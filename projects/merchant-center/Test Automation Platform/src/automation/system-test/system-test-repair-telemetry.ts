import fs from 'node:fs';
import path from 'node:path';

export type SystemTestRepairTelemetryEventType =
  | 'repair-session'
  | 'case-decision'
  | 'selection-drift'
  | 'unit-timing'
  | 'repair-attempt'
  | 'efficiency-observation';

export type SystemTestRepairTelemetryEvent = {
  schemaVersion: '1.0.0';
  eventType: SystemTestRepairTelemetryEventType;
  recordedAt: string;
  sessionId: string;
  applicationId: string;
  payload: Record<string, unknown>;
};

export function appendSystemTestRepairTelemetry(input: {
  filePath: string;
  eventType: SystemTestRepairTelemetryEventType;
  sessionId: string;
  applicationId: string;
  payload: Record<string, unknown>;
  recordedAt?: string;
}): SystemTestRepairTelemetryEvent {
  const event: SystemTestRepairTelemetryEvent = {
    schemaVersion: '1.0.0',
    eventType: input.eventType,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    sessionId: input.sessionId,
    applicationId: input.applicationId,
    payload: redactTelemetryValue(input.payload) as Record<string, unknown>,
  };
  fs.mkdirSync(path.dirname(input.filePath), { recursive: true });
  fs.appendFileSync(input.filePath, `${JSON.stringify(event)}\n`, 'utf8');
  return event;
}

export function summarizeSystemTestRepairTelemetry(filePath: string): {
  scope: 'telemetry-ledger-events';
  evidenceStatus: 'available' | 'missing' | 'invalid' | 'unreadable';
  eventCount: number | null;
  byType: Record<string, number>;
  avoidableDurationMs: number | null;
  browserStarts: number | null;
  avoidableBrowserStarts: number | null;
  selectionDriftCount: number | null;
  metricScope: 'single-session' | 'unavailable';
  currentRunCountsAvailable: false;
} {
  const empty = { scope: 'telemetry-ledger-events' as const, eventCount: null, byType: {},
    avoidableDurationMs: null, browserStarts: null, avoidableBrowserStarts: null, selectionDriftCount: null,
    metricScope: 'unavailable' as const, currentRunCountsAvailable: false as const };
  let source: string;
  try { source = fs.readFileSync(filePath, 'utf8'); }
  catch (error) { return { ...empty, evidenceStatus: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unreadable' }; }
  let events: SystemTestRepairTelemetryEvent[];
  try {
    events = source.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
    if (!events.every((event) => event && event.schemaVersion === '1.0.0'
      && typeof event.eventType === 'string' && ['repair-session', 'case-decision', 'selection-drift', 'unit-timing', 'repair-attempt', 'efficiency-observation'].includes(event.eventType)
      && typeof event.sessionId === 'string' && event.sessionId.trim()
      && typeof event.applicationId === 'string' && event.applicationId.trim()
      && typeof event.recordedAt === 'string' && Number.isFinite(Date.parse(event.recordedAt))
      && event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload))) throw new Error('invalid');
  } catch { return { ...empty, evidenceStatus: 'invalid' }; }
  const byType: Record<string, number> = {};
  let selectionDriftCount = 0;
  for (const event of events) {
    byType[event.eventType] = (byType[event.eventType] ?? 0) + 1;
    if (event.eventType === 'selection-drift') selectionDriftCount += 1;
  }
  const singleSession = new Set(events.map((event) => JSON.stringify([event.applicationId, event.sessionId]))).size === 1;
  const observations = events.filter((event) => event.eventType === 'efficiency-observation');
  const metric = (key: string, integer = false): number | null => {
    if (!singleSession || !observations.length) return null;
    const values = observations.map((event) => event.payload[key]);
    if (!values.every((value): value is number => typeof value === 'number' && Number.isFinite(value)
      && value >= 0 && (!integer || Number.isSafeInteger(value)))) return null;
    const total = values.reduce((sum, value) => sum + value, 0);
    return Number.isFinite(total) && (!integer || Number.isSafeInteger(total)) ? total : null;
  };
  return { scope: 'telemetry-ledger-events', evidenceStatus: 'available', eventCount: events.length, byType,
    avoidableDurationMs: metric('avoidableDurationMs'), browserStarts: metric('browserStarts', true),
    avoidableBrowserStarts: metric('avoidableBrowserStarts', true), selectionDriftCount,
    metricScope: singleSession ? 'single-session' : 'unavailable', currentRunCountsAvailable: false };
}

function redactTelemetryValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactTelemetryValue);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/password|token|cookie|authorization|storageState|accessToken|refreshToken/i.test(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redactTelemetryValue(item);
    }
  }
  return result;
}
