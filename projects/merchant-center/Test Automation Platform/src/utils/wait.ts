import fs from 'node:fs';
import path from 'node:path';

export type WaitUntilOptions = {
  timeout?: number;
  interval?: number;
  message?: string;
  probeTimeout?: number;
  /** Absolute wall-clock deadline shared by a parent stage or test case. */
  deadlineAt?: number;
  waitId?: string;
  /** Optional redacted callback invoked exactly once when the wait terminates. */
  telemetry?: (event: WaitUntilTelemetry) => void;
  observation?: {
    channel: 'ui' | 'api' | 'audit' | 'network';
    operation: string;
    caseId?: string;
  };
};

export type WaitUntilTelemetry = {
  outcome: 'satisfied' | 'timeout' | 'probe-timeout' | 'aborted';
  durationMs: number;
  configuredTimeoutMs: number;
  effectiveTimeoutMs: number;
  attempts: number;
  waitId?: string;
  lastValueSummary?: string;
  observation?: WaitUntilOptions['observation'];
};

export function createRefreshGatedProbe<T>(options: {
  refresh: () => Promise<unknown> | unknown;
  observe: () => Promise<T> | T;
  refreshInterval: number;
  now?: () => number;
}): () => Promise<T> {
  const now = options.now ?? Date.now;
  let lastRefreshAt: number | undefined;
  return async () => {
    const current = now();
    if (lastRefreshAt === undefined || current - lastRefreshAt >= options.refreshInterval) {
      await options.refresh();
      lastRefreshAt = now();
    }
    return options.observe();
  };
}

export type WaitUntilFailureKind = 'condition-timeout' | 'probe-timeout';

export class WaitUntilError extends Error {
  readonly code = 'WAIT_UNTIL_TIMEOUT';
  readonly kind: WaitUntilFailureKind;
  readonly timeoutMs: number;
  readonly lastValue: unknown;
  readonly observation?: WaitUntilOptions['observation'];

  constructor(
    message: string,
    details: {
      kind: WaitUntilFailureKind;
      timeoutMs: number;
      lastValue?: unknown;
      observation?: WaitUntilOptions['observation'];
    },
  ) {
    const code = details.kind === 'probe-timeout'
      ? 'WAIT_UNTIL_PROBE_TIMEOUT'
      : 'WAIT_UNTIL_CONDITION_TIMEOUT';
    const observation = details.observation
      ? ` channel=${details.observation.channel} operation=${details.observation.operation}${details.observation.caseId ? ` caseId=${details.observation.caseId}` : ''}`
      : '';
    super(`[${code}]${observation} ${message}`);
    this.name = 'WaitUntilError';
    this.kind = details.kind;
    this.timeoutMs = details.timeoutMs;
    this.lastValue = details.lastValue;
    this.observation = details.observation;
  }
}

export async function waitUntil<T>(
  probe: () => Promise<T> | T,
  predicate: (value: T) => boolean,
  options: WaitUntilOptions = {},
): Promise<T> {
  const {
    timeout = 5_000,
    interval = 100,
    probeTimeout,
    message = 'Condition was not satisfied within the timeout.',
  } = options;
  const startedAt = Date.now();
  const configuredTimeout = timeout;
  const deadlineRemaining = options.deadlineAt === undefined ? timeout : Math.max(0, options.deadlineAt - startedAt);
  const effectiveTimeout = Math.min(timeout, deadlineRemaining);
  const minimumProbeBudget = Math.max(
    1,
    Math.min(50, probeTimeout ?? effectiveTimeout, effectiveTimeout),
  );

  let lastValue: T | undefined;
  let attempts = 0;

  const emit = (outcome: WaitUntilTelemetry['outcome']): void => {
    const event: WaitUntilTelemetry = {
      outcome,
      durationMs: Date.now() - startedAt,
      configuredTimeoutMs: configuredTimeout,
      effectiveTimeoutMs: effectiveTimeout,
      attempts,
      ...(options.waitId ? { waitId: options.waitId } : {}),
      ...(lastValue === undefined ? {} : { lastValueSummary: summarizeValue(lastValue) }),
      ...(options.observation ? { observation: options.observation } : {}),
    };
    try { options.telemetry?.(event); } catch { /* 性能遥测不得改写业务等待结果 */ }
    appendDefaultTelemetry(event);
  };

  while (Date.now() - startedAt <= effectiveTimeout) {
    const remainingTimeout = effectiveTimeout - (Date.now() - startedAt);
    if (remainingTimeout < minimumProbeBudget) break;
    const currentProbeTimeout = Math.max(
      1,
      Math.min(probeTimeout ?? remainingTimeout, remainingTimeout),
    );

    attempts += 1;
    try {
      lastValue = await runWithTimeout(
        probe,
        currentProbeTimeout,
        `${message} Probe did not settle within ${currentProbeTimeout}ms.`,
        options.observation,
      );
    } catch (error) {
      emit(error instanceof WaitUntilError && error.kind === 'probe-timeout' ? 'probe-timeout' : 'aborted');
      throw error;
    }

    if (predicate(lastValue)) {
      emit('satisfied');
      return lastValue;
    }

    const remainingAfterProbe = timeout - (Date.now() - startedAt);
    if (remainingAfterProbe < minimumProbeBudget) break;
    await delay(Math.min(interval, remainingAfterProbe - minimumProbeBudget));
  }

  const lastValueText =
    lastValue === undefined ? 'undefined' : safeStringify(lastValue);

  emit('timeout');
  throw new WaitUntilError(
    `${message} Last value: ${lastValueText}`,
    {
      kind: 'condition-timeout',
      timeoutMs: effectiveTimeout,
      lastValue,
      observation: options.observation,
    },
  );
}

async function runWithTimeout<T>(
  probe: () => Promise<T> | T,
  timeout: number,
  message: string,
  observation?: WaitUntilOptions['observation'],
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve().then(probe),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new WaitUntilError(
          message,
          { kind: 'probe-timeout', timeoutMs: timeout, observation },
        )), timeout);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function delay(timeout: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(length=${value.length})`;
  if (typeof value === 'string') return `string(length=${value.length})`;
  if (typeof value === 'object') return `object(keyCount=${Object.keys(value as object).length})`;
  return typeof value;
}

function appendDefaultTelemetry(event: WaitUntilTelemetry): void {
  const target = process.env.TEST_WAIT_TELEMETRY_PATH;
  if (!target) return;
  try {
    const resolved = path.resolve(target.replaceAll('{pid}', String(process.pid)));
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.appendFileSync(resolved, `${JSON.stringify({ schemaVersion: '1.0.0', occurredAt: new Date().toISOString(), ...event })}\n`, 'utf8');
  } catch { /* 可观测性失败不得伪装为产品失败 */ }
}
