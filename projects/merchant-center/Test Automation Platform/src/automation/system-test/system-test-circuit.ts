import type { SystemTestManifest } from './system-test-contract';
import type { SystemTestProgressEvent } from './system-test-progress';

export type SystemTestCircuitDecision = {
  trip: boolean;
  code?: 'STALL' | 'MAX_RUN_TIME' | 'CONSECUTIVE_FAILURES' | 'DUPLICATE_FAILURE' | 'ENVIRONMENT_FAILURE_RATE';
  detail?: string;
};

export function evaluateSystemTestCircuit(input: {
  events: readonly SystemTestProgressEvent[];
  policy: Pick<SystemTestManifest['policies'],
    | 'stallMs'
    | 'maxRunMs'
    | 'maxConsecutiveFailures'
    | 'maxDuplicateFailureFingerprint'
    | 'minimumCompletedForFailureRate'
    | 'maximumEnvironmentFailureRate'>;
  startedAtMs: number;
  nowMs?: number;
}): SystemTestCircuitDecision {
  const nowMs = input.nowMs ?? Date.now();
  if (nowMs - input.startedAtMs > input.policy.maxRunMs) {
    return { trip: true, code: 'MAX_RUN_TIME', detail: String(nowMs - input.startedAtMs) };
  }
  const businessEvents = input.events.filter((event) => !event.caseId.startsWith('__'));
  const latestAt = businessEvents.length
    ? Date.parse(businessEvents[businessEvents.length - 1].updatedAt)
    : input.startedAtMs;
  if (nowMs - latestAt > input.policy.stallMs) {
    return { trip: true, code: 'STALL', detail: String(nowMs - latestAt) };
  }
  const terminal = businessEvents.filter((event) => event.phase !== 'started');
  // Case failures are recorded and classified, but never stop the remaining
  // selected cases. Only execution-health failures may trip the circuit.
  if (terminal.length >= input.policy.minimumCompletedForFailureRate) {
    const environmentFailures = terminal.filter((event) => (
      event.phase === 'failed' && event.failureCategory === 'environment-failure'
    )).length;
    const rate = environmentFailures / terminal.length;
    if (rate >= input.policy.maximumEnvironmentFailureRate) {
      return { trip: true, code: 'ENVIRONMENT_FAILURE_RATE', detail: rate.toFixed(4) };
    }
  }
  return { trip: false };
}
