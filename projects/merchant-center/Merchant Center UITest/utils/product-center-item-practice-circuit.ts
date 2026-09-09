import type { ProductCenterItemCircuitBreakerPolicy } from './product-center-item-practice-contract';
import type { ProductCenterItemProgress } from './product-center-item-progress';

export type ProductCenterItemCircuitDecision = {
  trip: boolean;
  code?: 'STALL' | 'MAX_RUN_TIME' | 'CONSECUTIVE_FAILURES' | 'DUPLICATE_FAILURE' | 'ENVIRONMENT_FAILURE_RATE';
  detail?: string;
};

export function evaluateProductCenterItemPracticeCircuit(input: {
  events: readonly ProductCenterItemProgress[];
  policy: ProductCenterItemCircuitBreakerPolicy;
  startedAtMs: number;
  nowMs?: number;
}): ProductCenterItemCircuitDecision {
  const nowMs = input.nowMs ?? Date.now();
  if (nowMs - input.startedAtMs > input.policy.maxRunMs) {
    return { trip: true, code: 'MAX_RUN_TIME', detail: String(nowMs - input.startedAtMs) };
  }
  const relevant = input.events.filter((item) => item.caseId !== '__setup__');
  const latestAt = relevant.length > 0
    ? Date.parse(relevant[relevant.length - 1].updatedAt)
    : input.startedAtMs;
  if (nowMs - latestAt > input.policy.stallMs) {
    return { trip: true, code: 'STALL', detail: String(nowMs - latestAt) };
  }
  const terminal = relevant.filter((item) => item.phase === 'completed' || item.phase === 'failed');
  const trailingFailures = [...terminal].reverse().findIndex((item) => item.phase !== 'failed');
  const consecutiveFailures = trailingFailures === -1 ? terminal.length : trailingFailures;
  if (consecutiveFailures >= input.policy.maxConsecutiveFailures) {
    return { trip: true, code: 'CONSECUTIVE_FAILURES', detail: String(consecutiveFailures) };
  }
  const fingerprints = terminal
    .filter((item) => item.phase === 'failed' && item.diagnosticFingerprint)
    .reduce<Record<string, number>>((counts, item) => {
      const fingerprint = item.diagnosticFingerprint!;
      counts[fingerprint] = (counts[fingerprint] ?? 0) + 1;
      return counts;
    }, {});
  const duplicate = Object.entries(fingerprints).find(([, count]) => count >= input.policy.maxDuplicateFailureFingerprint);
  if (duplicate) return { trip: true, code: 'DUPLICATE_FAILURE', detail: `${duplicate[0]}:${duplicate[1]}` };

  if (terminal.length >= input.policy.minimumCompletedForFailureRate) {
    const environmentFailures = terminal.filter((item) => item.phase === 'failed'
      && ['transient-platform', 'environment-auth', 'environment-data'].includes(item.failureCategory ?? '')).length;
    const failureRate = environmentFailures / terminal.length;
    if (failureRate >= input.policy.maximumEnvironmentFailureRate) {
      return { trip: true, code: 'ENVIRONMENT_FAILURE_RATE', detail: failureRate.toFixed(4) };
    }
  }
  return { trip: false };
}
