import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Public, domain-neutral event names. Adapters may add namespaced values. */
export type AuditEventType =
  | 'flow.started' | 'flow.completed' | 'flow.failed'
  | 'plan.compiled' | 'audit.started' | 'audit.completed'
  | 'review.created' | 'review.approved' | 'review.rejected'
  | 'case.created' | 'case.updated' | 'case.fingerprint_changed'
  | 'binding.created' | 'binding.updated' | 'implementation.fingerprint_changed'
  | 'correction.candidate' | 'correction.approved' | 'correction.started'
  | 'correction.completed' | 'correction.blocked'
  | 'run.authorized' | 'run.started' | 'case.started' | 'case.completed'
  | 'evidence.recorded' | 'state.changed' | 'report.generated'
  | (string & {});

export type AuditActorType = 'human' | 'ai' | 'runner' | 'system';
export type AuditOutcome = 'success' | 'failed' | 'blocked' | 'skipped' | 'cancelled';

export type AuditRetryMetadata = {
  attempt?: number;
  retryOfEventId?: string | null;
  retryAfterMs?: number;
  transientFailure?: boolean;
};

export type AuditEventInput = AuditRetryMetadata & {
  schemaVersion?: '1.0.0';
  eventId: string;
  eventType: AuditEventType;
  occurredAt?: string;
  actorType: AuditActorType;
  actorId?: string;
  applicationId: string;
  businessDomainId?: string;
  planId?: string;
  runId?: string;
  caseId?: string;
  correctionId?: string;
  traceId?: string;
  parentEventId?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  outcome?: AuditOutcome;
  beforeFingerprint?: string | null;
  afterFingerprint?: string | null;
  checkpointId?: string;
  dataChanged?: boolean;
  effectiveSuccess?: boolean;
  evidenceRefs?: string[];
  /** Adapter-owned structured details. Sensitive values are redacted before persistence. */
  details?: unknown;
};

export type AuditEvent = Omit<AuditEventInput, 'schemaVersion'> & {
  schemaVersion: '1.0.0';
  occurredAt: string;
  attempt: number;
  retryOfEventId: string | null;
  eventSequence: number;
  previousEventHash: string | null;
  eventHash: string;
  redacted: true;
};

export type AuditCheckpoint = {
  schemaVersion: '1.0.0';
  checkpointId: string;
  runId?: string;
  lastEventSequence: number;
  lastEventHash: string | null;
  updatedAt: string;
  status: 'running' | 'completed' | 'failed' | 'blocked';
};

export type AuditEventFilter = {
  eventType?: AuditEventType | readonly AuditEventType[];
  applicationId?: string;
  businessDomainId?: string;
  planId?: string;
  runId?: string;
  caseId?: string;
  correctionId?: string;
  actorType?: AuditActorType;
  outcome?: AuditOutcome;
  from?: string | Date;
  to?: string | Date;
  retriesOnly?: boolean;
  dataChangedOnly?: boolean;
};

export type AuditAggregate = {
  total: number;
  effectiveSuccesses: number;
  retries: number;
  dataChanges: number;
  byEventType: Record<string, number>;
  byApplicationId: Record<string, number>;
  byOutcome: Record<string, number>;
  correction: { triggered: number; started: number; completed: number; blocked: number; affectedCases: number };
  firstOccurredAt?: string;
  lastOccurredAt?: string;
};

const SENSITIVE_KEY = /(password|passwd|token|secret|cookie|authorization|set-cookie|access[-_]?key|private[-_]?key|session)/i;

/** Redacts credentials recursively while retaining safe metadata for audit diagnostics. */
export function redactAuditValue(value: unknown, keyHint?: string): unknown {
  if (keyHint && SENSITIVE_KEY.test(keyHint)) {
    if (typeof value === 'string') return { redacted: true, type: 'string', length: value.length, fingerprint: sha256(value) };
    return '[REDACTED]';
  }
  if (Array.isArray(value)) return value.map((item) => redactAuditValue(item));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) result[key] = redactAuditValue(item, key);
    return result;
  }
  return value;
}

export function createAuditEvent(input: AuditEventInput, sequence = 1, previousEventHash: string | null = null): AuditEvent {
  if (!input.eventId?.trim()) throw new Error('AUDIT_EVENT_ID_REQUIRED');
  if (!input.applicationId?.trim()) throw new Error('AUDIT_EVENT_APPLICATION_ID_REQUIRED');
  if (!input.eventType?.trim()) throw new Error('AUDIT_EVENT_TYPE_REQUIRED');
  const event: Omit<AuditEvent, 'eventHash'> = {
    ...input,
    schemaVersion: '1.0.0',
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    attempt: input.attempt ?? 1,
    retryOfEventId: input.retryOfEventId ?? null,
    eventSequence: sequence,
    previousEventHash,
    redacted: true,
    ...(input.details === undefined ? {} : { details: redactAuditValue(input.details) }),
  };
  return { ...event, eventHash: hashAuditEvent(event) };
}

export function hashAuditEvent(event: Omit<AuditEvent, 'eventHash'> | AuditEvent): string {
  const { eventHash: _ignored, ...payload } = event as AuditEvent;
  return sha256(stableStringify(payload));
}

export class FileAuditEventStore {
  readonly filePath: string;
  constructor(options: { filePath: string }) { this.filePath = path.resolve(options.filePath); }

  append(input: AuditEventInput): { event: AuditEvent; duplicate: boolean } {
    return this.appendManyWithResults([input])[0];
  }

  appendMany(inputs: readonly AuditEventInput[]): AuditEvent[] {
    return this.appendManyWithResults(inputs).map((result) => result.event);
  }

  private appendManyWithResults(inputs: readonly AuditEventInput[]): Array<{ event: AuditEvent; duplicate: boolean }> {
    return withFileLock(`${this.filePath}.lock`, () => {
      const state = loadAppendState(this.filePath);
      const byEventId = state.byEventId;
      const results: Array<{ event: AuditEvent; duplicate: boolean }> = [];
      const appended: AuditEvent[] = [];
      let previous = state.lastEvent;
      for (const input of inputs) {
        const duplicate = byEventId.get(input.eventId);
        if (duplicate) {
          if (!matchesExistingEvent(input, duplicate)) {
            throw new Error(`AUDIT_EVENT_ID_CONFLICT:${input.eventId}`);
          }
          results.push({ event: duplicate, duplicate: true });
          continue;
        }
        const event = createAuditEvent(
          input,
          (previous?.eventSequence ?? 0) + 1,
          previous?.eventHash ?? null,
        );
        byEventId.set(event.eventId, event);
        appended.push(event);
        results.push({ event, duplicate: false });
        previous = event;
      }
      if (appended.length > 0) {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.appendFileSync(this.filePath, `${appended.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8');
        state.lastEvent = appended.at(-1);
        state.size = fs.statSync(this.filePath).size;
      }
      return results;
    });
  }

  readAll(): AuditEvent[] {
    if (!fs.existsSync(this.filePath)) return [];
    const lines = fs.readFileSync(this.filePath, 'utf8').split(/\r?\n/).filter(Boolean);
    return lines.map((line, index) => {
      let event: AuditEvent;
      try { event = JSON.parse(line) as AuditEvent; } catch { throw new Error(`AUDIT_EVENT_INVALID_JSON:${index + 1}`); }
      if (event.redacted !== true || event.schemaVersion !== '1.0.0' || event.eventSequence !== index + 1) throw new Error(`AUDIT_EVENT_INVALID_SEQUENCE:${index + 1}`);
      if (hashAuditEvent(event) !== event.eventHash) throw new Error(`AUDIT_EVENT_HASH_MISMATCH:${event.eventId}`);
      if ((event.previousEventHash ?? null) !== (index === 0 ? null : lines[index - 1] ? (JSON.parse(lines[index - 1]) as AuditEvent).eventHash : null)) throw new Error(`AUDIT_EVENT_CHAIN_MISMATCH:${event.eventId}`);
      return event;
    });
  }

  query(filter: AuditEventFilter = {}): AuditEvent[] { return queryAuditEvents(this.readAll(), filter); }
  aggregate(filter: AuditEventFilter = {}): AuditAggregate { return aggregateAuditEvents(this.query(filter)); }
  verifyIntegrity(): { valid: boolean; count: number; diagnostics: string[] } {
    try { const events = this.readAll(); return { valid: true, count: events.length, diagnostics: [] }; }
    catch (error) { return { valid: false, count: 0, diagnostics: [error instanceof Error ? error.message : String(error)] }; }
  }
}

type AppendState = {
  size: number;
  lastEvent?: AuditEvent;
  byEventId: Map<string, AuditEvent>;
};

const appendStates = new Map<string, AppendState>();

function loadAppendState(filePath: string): AppendState {
  const absolutePath = path.resolve(filePath);
  const stat = fs.existsSync(absolutePath) ? fs.statSync(absolutePath) : undefined;
  const size = stat?.size ?? 0;
  const cached = appendStates.get(absolutePath);
  if (!cached || size < cached.size) {
    const events = new FileAuditEventStore({ filePath: absolutePath }).readAll();
    const state: AppendState = { size, lastEvent: events.at(-1), byEventId: new Map(events.map((event) => [event.eventId, event])) };
    appendStates.set(absolutePath, state);
    return state;
  }
  if (size === cached.size) return cached;

  const handle = fs.openSync(absolutePath, 'r');
  try {
    const buffer = Buffer.alloc(size - cached.size);
    fs.readSync(handle, buffer, 0, buffer.length, cached.size);
    const lines = buffer.toString('utf8').split(/\r?\n/).filter(Boolean);
    let previous = cached.lastEvent;
    for (const line of lines) {
      const event = JSON.parse(line) as AuditEvent;
      if (event.redacted !== true || event.schemaVersion !== '1.0.0'
        || event.eventSequence !== (previous?.eventSequence ?? 0) + 1
        || hashAuditEvent(event) !== event.eventHash
        || (event.previousEventHash ?? null) !== (previous?.eventHash ?? null)) {
        throw new Error(`AUDIT_EVENT_INVALID_APPEND:${event.eventId ?? 'unknown'}`);
      }
      cached.byEventId.set(event.eventId, event);
      previous = event;
    }
    cached.lastEvent = previous;
    cached.size = size;
    return cached;
  } finally { fs.closeSync(handle); }
}

/** Lightweight integration point for compilers, runners, reporters and lifecycle scripts. */
export function appendAuditEvent(filePath: string, event: AuditEventInput): { event: AuditEvent; duplicate: boolean } {
  return new FileAuditEventStore({ filePath }).append(event);
}

export function queryAuditEvents(events: readonly AuditEvent[], filter: AuditEventFilter = {}): AuditEvent[] {
  const types = filter.eventType === undefined ? undefined : new Set(Array.isArray(filter.eventType) ? filter.eventType : [filter.eventType]);
  const from = filter.from ? Date.parse(filter.from instanceof Date ? filter.from.toISOString() : filter.from) : undefined;
  const to = filter.to ? Date.parse(filter.to instanceof Date ? filter.to.toISOString() : filter.to) : undefined;
  return events.filter((event) => (
    (!types || types.has(event.eventType))
    && (!filter.applicationId || event.applicationId === filter.applicationId)
    && (!filter.businessDomainId || event.businessDomainId === filter.businessDomainId)
    && (!filter.planId || event.planId === filter.planId)
    && (!filter.runId || event.runId === filter.runId)
    && (!filter.caseId || event.caseId === filter.caseId)
    && (!filter.correctionId || event.correctionId === filter.correctionId)
    && (!filter.actorType || event.actorType === filter.actorType)
    && (!filter.outcome || event.outcome === filter.outcome)
    && (from === undefined || Date.parse(event.occurredAt) >= from)
    && (to === undefined || Date.parse(event.occurredAt) <= to)
    && (!filter.retriesOnly || event.attempt > 1 || Boolean(event.retryOfEventId))
    && (!filter.dataChangedOnly || event.dataChanged === true)
  ));
}

export function aggregateAuditEvents(events: readonly AuditEvent[]): AuditAggregate {
  const byEventType: Record<string, number> = {}, byApplicationId: Record<string, number> = {}, byOutcome: Record<string, number> = {};
  let triggered = 0, started = 0, completed = 0, blocked = 0;
  const cases = new Set<string>();
  for (const event of events) {
    byEventType[event.eventType] = (byEventType[event.eventType] ?? 0) + 1;
    byApplicationId[event.applicationId] = (byApplicationId[event.applicationId] ?? 0) + 1;
    const outcome = event.outcome ?? 'unknown'; byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
    if (event.eventType === 'correction.candidate') { triggered++; if (event.caseId) cases.add(event.caseId); }
    if (event.eventType === 'correction.started') started++;
    if (event.eventType === 'correction.completed') completed++;
    if (event.eventType === 'correction.blocked') blocked++;
  }
  return {
    total: events.length,
    effectiveSuccesses: events.filter((event) => event.effectiveSuccess === true).length,
    retries: events.filter((event) => event.attempt > 1 || Boolean(event.retryOfEventId)).length,
    dataChanges: events.filter((event) => event.dataChanged === true).length,
    byEventType, byApplicationId, byOutcome,
    correction: { triggered, started, completed, blocked, affectedCases: cases.size },
    firstOccurredAt: events[0]?.occurredAt,
    lastOccurredAt: events.at(-1)?.occurredAt,
  };
}

export function createAuditCheckpoint(input: Omit<AuditCheckpoint, 'schemaVersion' | 'updatedAt'> & { updatedAt?: string }): AuditCheckpoint {
  return { schemaVersion: '1.0.0', ...input, updatedAt: input.updatedAt ?? new Date().toISOString() };
}

export function writeAuditCheckpoint(filePath: string, checkpoint: AuditCheckpoint): void {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, absolutePath);
}

export function readAuditCheckpoint(filePath: string): AuditCheckpoint | null {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) return null;
  const value = JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as AuditCheckpoint;
  if (value.schemaVersion !== '1.0.0' || !value.checkpointId || !Number.isInteger(value.lastEventSequence)) {
    throw new Error('AUDIT_CHECKPOINT_INVALID');
  }
  return value;
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function stableStringify(value: unknown): string {
  // Match JSON persistence semantics so optional undefined properties do not
  // change the hash before/after a JSONL round trip.
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value as object)
    .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}

function matchesExistingEvent(input: AuditEventInput, existing: AuditEvent): boolean {
  const normalizedInput = {
    ...input,
    schemaVersion: '1.0.0',
    attempt: input.attempt ?? 1,
    retryOfEventId: input.retryOfEventId ?? null,
    ...(input.details === undefined ? {} : { details: redactAuditValue(input.details) }),
  } as Record<string, unknown>;
  return Object.entries(normalizedInput).every(([key, value]) => stableStringify(existing[key as keyof AuditEvent]) === stableStringify(value));
}

function withFileLock<T>(lockPath: string, action: () => T): T {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const startedAt = Date.now();
  const timeoutMs = readPositiveInteger(process.env.SYSTEM_TEST_AUDIT_LOCK_TIMEOUT_MS, 15_000);
  const staleAfterMs = readPositiveInteger(process.env.SYSTEM_TEST_AUDIT_LOCK_STALE_AFTER_MS, 30_000);
  let attempt = 0;
  let acquired = false;
  while (!acquired) {
    try {
      // mkdir is an atomic cross-process primitive on Windows and POSIX;
      // unlike create+write it cannot expose a partially written lock file.
      fs.mkdirSync(lockPath);
      fs.writeFileSync(path.join(lockPath, 'owner.json'), JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }), 'utf8');
      acquired = true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw error;
      let ageMs = 0;
      try { ageMs = Date.now() - fs.statSync(lockPath).mtimeMs; }
      catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw statError;
      }
      // PID liveness is advisory only: on Windows a just-started child may
      // briefly report as non-existent while it is already writing. Reclaim
      // solely by age to avoid deleting an active lock and corrupting order.
      if (ageMs > staleAfterMs) {
        fs.rmSync(lockPath, { recursive: true, force: true });
        continue;
      }
      if (Date.now() - startedAt >= timeoutMs) throw new Error(`AUDIT_EVENT_LOCK_TIMEOUT:${lockPath}`);
      const baseDelay = Math.min(250, 10 * 2 ** Math.min(attempt++, 5));
      const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(baseDelay / 2)));
      sleepSync(baseDelay + jitter);
    }
  }
  try { return action(); }
  finally {
    fs.rmSync(lockPath, { recursive: true, force: true });
  }
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}
