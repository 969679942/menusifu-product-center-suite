import { transientRetryDelaysMs } from '../api/transient-retry';

export type ProductCenterLiveProbeFailure = {
  route: string;
  status: string;
  diagnosticFingerprint: string;
  category?: string;
  retryable?: boolean;
  durationMs?: number;
  attempt?: number;
};

export type ProductCenterLiveProbeEntry = {
  route: string;
  durationMs?: number;
  attempt?: number;
  [key: string]: unknown;
};

export type ProductCenterLiveProbeAttempt = {
  attempt: number;
  durationMs: number;
  entries: ProductCenterLiveProbeEntry[];
  failures: ProductCenterLiveProbeFailure[];
};

export type ProductCenterLiveProbeRecoveryDecision =
  | 'complete'
  | 'retry-transient'
  | 'stop-deterministic'
  | 'stop-repeated-fingerprint'
  | 'stop-retry-exhausted'
  | 'stop-invalid-artifact';

export function parseProductCenterLiveProbeRouteSelection(
  rawSelection: string | undefined,
  expectedRoutesInput: readonly string[],
): string[] {
  const expectedRoutes = uniqueSorted(expectedRoutesInput.map(normalizeRoute));
  if (!rawSelection) return expectedRoutes;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawSelection);
  } catch {
    throw new Error('live Probe 路由选择必须是 JSON 数组');
  }
  if (!Array.isArray(parsed) || !parsed.every((route) => typeof route === 'string')) {
    throw new Error('live Probe 路由选择必须是字符串 JSON 数组');
  }
  if (parsed.length === 0) throw new Error('live Probe 路由选择不能为空');
  const selectedRoutes = uniqueSorted(parsed.map(normalizeRoute));
  if (selectedRoutes.length !== parsed.length) throw new Error('live Probe 路由选择不能重复');
  const expected = new Set(expectedRoutes);
  const unexpected = selectedRoutes.filter((route) => !expected.has(route));
  if (unexpected.length > 0) {
    throw new Error(`live Probe 路由不属于权威集合：${unexpected.join(',')}`);
  }
  return selectedRoutes;
}

export function validateProductCenterLiveProbeAttemptArtifact(input: {
  runId: string;
  attempt: number;
  selectedRoutes: readonly string[];
  artifact: {
    runId?: unknown;
    entries?: ReadonlyArray<Record<string, unknown>>;
    failures?: ReadonlyArray<Record<string, unknown>>;
  };
}): string[] {
  const selectedRoutes = uniqueSorted(input.selectedRoutes.map(normalizeRoute));
  const entries = Array.isArray(input.artifact.entries) ? input.artifact.entries : [];
  const failures = Array.isArray(input.artifact.failures) ? input.artifact.failures : [];
  const issues: string[] = [];
  if (selectedRoutes.length === 0) issues.push('EMPTY_SELECTED_DENOMINATOR');
  if (input.artifact.runId !== input.runId) issues.push('RUN_ID_MISMATCH');
  const selected = new Set(selectedRoutes);
  const reportedCounts = new Map<string, number>();

  for (const entry of entries) {
    const route = typeof entry.route === 'string' ? normalizeRoute(entry.route) : '/invalid';
    reportedCounts.set(route, (reportedCounts.get(route) ?? 0) + 1);
    if (!selected.has(route)) issues.push(`UNEXPECTED_ROUTE:${route}`);
    if (entry.attempt !== input.attempt) issues.push(`ENTRY_ATTEMPT_MISMATCH:${route}`);
    if (!Array.isArray(entry.capabilityIds)
      || entry.capabilityIds[0] !== 'navigation.sidebar.open') {
      issues.push(`SIDEBAR_CAPABILITY_MISSING:${route}`);
    }
  }
  for (const failure of failures) {
    const route = typeof failure.route === 'string' ? normalizeRoute(failure.route) : '/invalid';
    reportedCounts.set(route, (reportedCounts.get(route) ?? 0) + 1);
    if (!selected.has(route)) issues.push(`UNEXPECTED_ROUTE:${route}`);
    if (failure.attempt !== input.attempt) issues.push(`FAILURE_ATTEMPT_MISMATCH:${route}`);
    if (typeof failure.diagnosticFingerprint !== 'string'
      || !/^[a-f0-9]{64}$/.test(failure.diagnosticFingerprint)) {
      issues.push(`INVALID_FAILURE_FINGERPRINT:${route}`);
    }
    if (typeof failure.category !== 'string' || typeof failure.retryable !== 'boolean') {
      issues.push(`INVALID_FAILURE_CLASSIFICATION:${route}`);
    }
  }
  for (const route of selectedRoutes) {
    const count = reportedCounts.get(route) ?? 0;
    if (count === 0) issues.push(`MISSING_ROUTE:${route}`);
    if (count > 1) issues.push(`DUPLICATE_ROUTE:${route}`);
  }
  return uniqueSorted(issues);
}

export function buildProductCenterLiveProbeRecoveryState(input: {
  expectedRoutes: readonly string[];
  attempts: readonly ProductCenterLiveProbeAttempt[];
  routeBudgetMs?: number;
}) {
  const expectedRoutes = uniqueSorted(input.expectedRoutes.map(normalizeRoute));
  if (expectedRoutes.length === 0) throw new Error('live Probe 权威路由不能为空');
  if (input.attempts.length === 0) throw new Error('live Probe 至少需要一次执行记录');
  const routeBudgetMs = input.routeBudgetMs ?? 25_000;
  if (!Number.isFinite(routeBudgetMs) || routeBudgetMs <= 0) {
    throw new Error('live Probe 单路由耗时预算无效');
  }

  const expected = new Set(expectedRoutes);
  const successfulEntries = new Map<string, ProductCenterLiveProbeEntry>();
  const latestFailures = new Map<string, ProductCenterLiveProbeFailure>();
  const failureHistory = new Map<string, ProductCenterLiveProbeFailure[]>();
  const recoveredRoutes = new Set<string>();
  const artifactIssues: string[] = [];

  for (const [attemptIndex, attempt] of input.attempts.entries()) {
    if (attempt.attempt !== attemptIndex) {
      artifactIssues.push(`INVALID_ATTEMPT_SEQUENCE:${attempt.attempt}`);
    }
    const entryRoutes = attempt.entries.map((entry) => normalizeRoute(entry.route));
    const failureRoutes = attempt.failures.map((failure) => normalizeRoute(failure.route));
    for (const route of [...entryRoutes, ...failureRoutes]) {
      if (!expected.has(route)) artifactIssues.push(`UNEXPECTED_ROUTE:${route}`);
    }
    for (const route of uniqueSorted(entryRoutes)) {
      if (entryRoutes.filter((candidate) => candidate === route).length > 1) {
        artifactIssues.push(`DUPLICATE_ENTRY:${attempt.attempt}:${route}`);
      }
      if (failureRoutes.includes(route)) {
        artifactIssues.push(`SUCCESS_FAILURE_CONFLICT:${attempt.attempt}:${route}`);
      }
    }
    for (const entry of attempt.entries) {
      const route = normalizeRoute(entry.route);
      if (!successfulEntries.has(route)) successfulEntries.set(route, entry);
      if (latestFailures.has(route)) recoveredRoutes.add(route);
      latestFailures.delete(route);
    }
    for (const failure of attempt.failures) {
      const route = normalizeRoute(failure.route);
      if (successfulEntries.has(route)) {
        artifactIssues.push(`RETRY_OF_PASSED_ROUTE:${attempt.attempt}:${route}`);
        continue;
      }
      latestFailures.set(route, failure);
      const history = failureHistory.get(route) ?? [];
      history.push(failure);
      failureHistory.set(route, history);
    }
  }

  const entries = [...successfulEntries.values()]
    .sort((left, right) => left.route.localeCompare(right.route));
  const failures = [...latestFailures.values()]
    .sort((left, right) => left.route.localeCompare(right.route));
  const unresolvedRoutes = expectedRoutes.filter((route) => !successfulEntries.has(route));
  const deterministicFailures = failures
    .filter((failure) => failure.retryable !== true)
    .map((failure) => normalizeRoute(failure.route));
  const repeatedFailureRoutes = [...failureHistory.entries()]
    .filter(([, history]) => history.length >= 2
      && history.at(-1)?.diagnosticFingerprint === history.at(-2)?.diagnosticFingerprint)
    .map(([route]) => route)
    .sort();
  const lastAttempt = input.attempts.at(-1)!;
  const missingWithoutFailure = unresolvedRoutes.filter((route) => !latestFailures.has(route));

  let decision: ProductCenterLiveProbeRecoveryDecision;
  if (artifactIssues.length > 0 || missingWithoutFailure.length > 0) {
    decision = 'stop-invalid-artifact';
  } else if (unresolvedRoutes.length === 0) {
    decision = 'complete';
  } else if (deterministicFailures.length > 0) {
    decision = 'stop-deterministic';
  } else if (repeatedFailureRoutes.length > 0) {
    decision = 'stop-repeated-fingerprint';
  } else if (input.attempts.length > transientRetryDelaysMs.length) {
    decision = 'stop-retry-exhausted';
  } else {
    decision = 'retry-transient';
  }

  const retryRoutes = decision === 'retry-transient'
    ? failures.filter((failure) => failure.retryable === true).map((failure) => normalizeRoute(failure.route))
    : [];
  const nextDelayMs = decision === 'retry-transient'
    ? transientRetryDelaysMs[input.attempts.length - 1]
    : undefined;
  const routeDurations = entries
    .map((entry) => ({ route: entry.route, durationMs: Number(entry.durationMs ?? 0) }))
    .sort((left, right) => right.durationMs - left.durationMs || left.route.localeCompare(right.route));

  return {
    decision,
    attempts: input.attempts.length,
    entries,
    failures,
    retryRoutes,
    nextDelayMs,
    recoveredRoutes: [...recoveredRoutes].sort(),
    unresolvedRoutes,
    deterministicFailures: uniqueSorted(deterministicFailures),
    repeatedFailureRoutes,
    artifactIssues: uniqueSorted([
      ...artifactIssues,
      ...missingWithoutFailure.map((route) => `MISSING_FAILURE_RECORD:${lastAttempt.attempt}:${route}`),
    ]),
    retryRoutesByAttempt: input.attempts.map((attempt) => ({
      attempt: attempt.attempt,
      routes: uniqueSorted(attempt.failures
        .filter((failure) => failure.retryable === true)
        .map((failure) => normalizeRoute(failure.route))),
    })),
    performance: {
      totalAttemptDurationMs: input.attempts.reduce((total, attempt) => total + attempt.durationMs, 0),
      routeBudgetMs,
      slowestRoutes: routeDurations.slice(0, 5),
      budgetExceededRoutes: routeDurations
        .filter((entry) => entry.durationMs > routeBudgetMs)
        .map((entry) => entry.route)
        .sort(),
      affectsProductStatus: false,
    },
  };
}

export function evaluateProductCenterLiveProbeCoverage(input: {
  expectedRoutes: readonly string[];
  entries: ReadonlyArray<{ route?: unknown }>;
  failures: readonly ProductCenterLiveProbeFailure[];
}) {
  const expectedRoutes = uniqueSorted(input.expectedRoutes.map(normalizeRoute));
  const observedRoutes = input.entries
    .map((entry) => typeof entry.route === 'string' ? normalizeRoute(entry.route) : '')
    .filter(Boolean);
  const observedUnique = uniqueSorted(observedRoutes);
  const failedRoutes = uniqueSorted(input.failures.map((failure) => normalizeRoute(failure.route)));
  const expected = new Set(expectedRoutes);
  const observed = new Set(observedUnique);
  const duplicateRoutes = observedUnique.filter(
    (route) => observedRoutes.filter((candidate) => candidate === route).length > 1,
  );
  const missingRoutes = expectedRoutes.filter((route) => !observed.has(route));
  const unexpectedRoutes = observedUnique.filter((route) => !expected.has(route));
  const invalidFailureFingerprints = input.failures
    .filter((failure) => !/^[a-f0-9]{64}$/.test(failure.diagnosticFingerprint))
    .map((failure) => normalizeRoute(failure.route));
  const issues = [
    ...missingRoutes.map((route) => `MISSING_ROUTE:${route}`),
    ...unexpectedRoutes.map((route) => `UNEXPECTED_ROUTE:${route}`),
    ...duplicateRoutes.map((route) => `DUPLICATE_ROUTE:${route}`),
    ...failedRoutes.map((route) => `FAILED_ROUTE:${route}`),
    ...invalidFailureFingerprints.map((route) => `INVALID_FAILURE_FINGERPRINT:${route}`),
  ].sort();
  return {
    complete: issues.length === 0
      && observedUnique.length === expectedRoutes.length,
    total: expectedRoutes.length,
    observed: observedUnique.length,
    expectedRoutes,
    observedRoutes: observedUnique,
    failedRoutes,
    missingRoutes,
    unexpectedRoutes,
    duplicateRoutes,
    issues,
  };
}

function normalizeRoute(value: string): string {
  const route = value.trim();
  if (!route.startsWith('/')) throw new Error(`live Probe 路由无效：${route || 'missing'}`);
  return route;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
