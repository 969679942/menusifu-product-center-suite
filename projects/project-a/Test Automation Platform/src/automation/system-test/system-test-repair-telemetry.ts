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
  eventCount: number;
  byType: Record<string, number>;
  avoidableDurationMs: number;
  browserStarts: number;
  selectionDriftCount: number;
} {
  if (!fs.existsSync(filePath)) return { eventCount: 0, byType: {}, avoidableDurationMs: 0, browserStarts: 0, selectionDriftCount: 0 };
  const events = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean)
    .map((line) => JSON.parse(line) as SystemTestRepairTelemetryEvent);
  const byType: Record<string, number> = {};
  let avoidableDurationMs = 0;
  let browserStarts = 0;
  let selectionDriftCount = 0;
  for (const event of events) {
    byType[event.eventType] = (byType[event.eventType] ?? 0) + 1;
    if (event.eventType === 'efficiency-observation') {
      avoidableDurationMs += numberValue(event.payload.avoidableDurationMs);
      browserStarts += numberValue(event.payload.avoidableBrowserStarts);
    }
    if (event.eventType === 'selection-drift') selectionDriftCount += 1;
  }
  return { eventCount: events.length, byType, avoidableDurationMs, browserStarts, selectionDriftCount };
}

function numberValue(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }

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
