export type ValueMetricEvent = {
  eventType: 'evidence-located' | 'history-searched' | 'rerun-skipped' | 'receipt-gap-found' | 'failure-classified' | 'rerun-completed' | 'human-intervention' | 'cross-project-reuse';
  runId: string;
  caseId?: string;
  /** Optional upstream id; when present it is used for exactly-once quality checks. */
  eventId?: string;
  /** Optional producer identifier for source attribution without payload content. */
  source?: string;
  durationMs?: number;
  effective?: boolean;
  occurredAt: string;
};

export type ValueMetricSummary = {
  sampleCount: number;
  durationMedianMs: number | null;
  effectiveCount: number;
  eventCountByType: Record<string, number>;
  from: string | null;
  to: string | null;
};

export type ValueMetricQualityReport = {
  valid: boolean;
  eventCount: number;
  uniqueEventIdCount: number;
  duplicateEventIds: string[];
  invalidEventIndexes: number[];
  outOfWindowIndexes: number[];
  missingCaseIdCount: number;
  errors: string[];
};

/** Aggregates only explicit, non-sensitive telemetry; no message or credential content is accepted. */
export function aggregateValueMetrics(events: readonly ValueMetricEvent[]): ValueMetricSummary {
  const durations = events.map((event) => event.durationMs).filter((value): value is number => Number.isFinite(value)).sort((a, b) => a - b);
  const eventCountByType: Record<string, number> = {};
  for (const event of events) eventCountByType[event.eventType] = (eventCountByType[event.eventType] ?? 0) + 1;
  const middle = Math.floor(durations.length / 2);
  const durationMedianMs = durations.length === 0 ? null : durations.length % 2 === 1
    ? durations[middle]!
    : (durations[middle - 1]! + durations[middle]!) / 2;
  const ordered = events.map((event) => event.occurredAt).sort();
  return {
    sampleCount: events.length,
    durationMedianMs,
    effectiveCount: events.filter((event) => event.effective === true).length,
    eventCountByType,
    from: ordered[0] ?? null,
    to: ordered.at(-1) ?? null,
  };
}

export function validateValueMetricEvent(event: ValueMetricEvent): string[] {
  const errors: string[] = [];
  if (!event.runId.trim()) errors.push('METRIC_RUN_ID_REQUIRED');
  if (!event.eventType.trim()) errors.push('METRIC_EVENT_TYPE_REQUIRED');
  if (!Number.isFinite(Date.parse(event.occurredAt))) errors.push('METRIC_TIMESTAMP_INVALID');
  if (event.durationMs !== undefined && (!Number.isFinite(event.durationMs) || event.durationMs < 0)) errors.push('METRIC_DURATION_INVALID');
  if (event.eventId !== undefined && !event.eventId.trim()) errors.push('METRIC_EVENT_ID_INVALID');
  if (event.source !== undefined && !event.source.trim()) errors.push('METRIC_SOURCE_INVALID');
  return errors;
}

/**
 * Validates a telemetry window before it is used as a baseline. This keeps the
 * aggregate honest without requiring or storing message/credential payloads.
 */
export function validateValueMetricBatch(input: {
  events: readonly ValueMetricEvent[];
  from: string;
  to: string;
  requireCaseId?: boolean;
}): ValueMetricQualityReport {
  const fromMs = Date.parse(input.from);
  const toMs = Date.parse(input.to);
  const invalidEventIndexes: number[] = [];
  const outOfWindowIndexes: number[] = [];
  const duplicateEventIds: string[] = [];
  const seenEventIds = new Set<string>();
  let missingCaseIdCount = 0;
  const errors: string[] = [];

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) errors.push('METRIC_WINDOW_INVALID');
  input.events.forEach((event, index) => {
    if (validateValueMetricEvent(event).length > 0) invalidEventIndexes.push(index);
    const occurredMs = Date.parse(event.occurredAt);
    if (Number.isFinite(fromMs) && Number.isFinite(toMs) && (!Number.isFinite(occurredMs) || occurredMs < fromMs || occurredMs > toMs)) {
      outOfWindowIndexes.push(index);
    }
    if (input.requireCaseId && !event.caseId?.trim()) missingCaseIdCount += 1;
    if (event.eventId) {
      if (seenEventIds.has(event.eventId)) duplicateEventIds.push(event.eventId);
      seenEventIds.add(event.eventId);
    }
  });
  if (invalidEventIndexes.length) errors.push('METRIC_EVENTS_INVALID');
  if (outOfWindowIndexes.length) errors.push('METRIC_EVENTS_OUT_OF_WINDOW');
  if (duplicateEventIds.length) errors.push('METRIC_DUPLICATE_EVENT_ID');
  if (missingCaseIdCount) errors.push('METRIC_CASE_ID_REQUIRED');
  return {
    valid: errors.length === 0,
    eventCount: input.events.length,
    uniqueEventIdCount: seenEventIds.size,
    duplicateEventIds: [...new Set(duplicateEventIds)].sort(),
    invalidEventIndexes,
    outOfWindowIndexes,
    missingCaseIdCount,
    errors,
  };
}
