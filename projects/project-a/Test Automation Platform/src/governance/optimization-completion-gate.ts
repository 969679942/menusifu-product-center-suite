import { createHash } from 'node:crypto';

export type OptimizationCompletionCheck = {
  checkId: string;
  required: boolean;
  status: 'passed' | 'failed';
  detail: string;
  evidenceRefs: string[];
};

export type OptimizationCompletionInput = {
  optimizationId: string;
  scope: 'platform' | 'project';
  staticOnly: boolean;
  businessExecutionStarted: boolean;
  historicalResultsInvalidated: boolean;
  expectedImpactedCaseIds: string[];
  actualImpactedCaseIds: string[];
  firstRunFingerprint: string;
  secondRunFingerprint: string;
  firstRunEventCount: number;
  secondRunEventCount: number;
  checks: OptimizationCompletionCheck[];
};

export type OptimizationCompletionReport = {
  schemaVersion: '1.0.0';
  optimizationId: string;
  scope: OptimizationCompletionInput['scope'];
  status: 'complete' | 'incomplete' | 'invalid';
  staticOnly: boolean;
  businessExecutionStarted: boolean;
  historicalResultsInvalidated: boolean;
  expectedImpactedCaseIds: string[];
  actualImpactedCaseIds: string[];
  missingRequiredChecks: string[];
  diagnostics: string[];
  idempotency: {
    fingerprintsMatch: boolean;
    eventDelta: number;
    stable: boolean;
  };
  fingerprint: string;
};

export function evaluateOptimizationCompletion(
  input: OptimizationCompletionInput,
): OptimizationCompletionReport {
  const diagnostics: string[] = [];
  if (!input.optimizationId.trim()) diagnostics.push('OPTIMIZATION_ID_REQUIRED');
  if (input.staticOnly && input.businessExecutionStarted) diagnostics.push('STATIC_OPTIMIZATION_STARTED_BUSINESS_EXECUTION');
  if (input.historicalResultsInvalidated) diagnostics.push('OPTIMIZATION_INVALIDATED_HISTORICAL_RESULTS');
  if (!Number.isInteger(input.firstRunEventCount) || !Number.isInteger(input.secondRunEventCount)
    || input.firstRunEventCount < 0 || input.secondRunEventCount < 0) {
    diagnostics.push('OPTIMIZATION_EVENT_COUNT_INVALID');
  }
  const expected = unique(input.expectedImpactedCaseIds);
  const actual = unique(input.actualImpactedCaseIds);
  if (!sameSet(expected, actual)) diagnostics.push('OPTIMIZATION_IMPACT_SCOPE_DRIFT');
  const fingerprintsMatch = Boolean(input.firstRunFingerprint.trim())
    && input.firstRunFingerprint === input.secondRunFingerprint;
  const eventDelta = input.secondRunEventCount - input.firstRunEventCount;
  const stable = fingerprintsMatch && eventDelta === 0;
  if (!fingerprintsMatch) diagnostics.push('OPTIMIZATION_NON_IDEMPOTENT_FINGERPRINT');
  if (eventDelta !== 0) diagnostics.push('OPTIMIZATION_NON_IDEMPOTENT_EVENT_DELTA');
  const ids = new Set<string>();
  for (const check of input.checks) {
    if (!check.checkId.trim()) diagnostics.push('OPTIMIZATION_CHECK_ID_REQUIRED');
    if (ids.has(check.checkId)) diagnostics.push(`OPTIMIZATION_CHECK_ID_DUPLICATE:${check.checkId}`);
    ids.add(check.checkId);
    if (!check.detail.trim()) diagnostics.push(`OPTIMIZATION_CHECK_DETAIL_REQUIRED:${check.checkId}`);
    if (check.evidenceRefs.some((ref) => !ref.trim())) diagnostics.push(`OPTIMIZATION_CHECK_EVIDENCE_REF_INVALID:${check.checkId}`);
  }
  const missingRequiredChecks = input.checks
    .filter((check) => check.required && check.status !== 'passed')
    .map((check) => check.checkId)
    .sort();
  const body = {
    schemaVersion: '1.0.0' as const,
    optimizationId: input.optimizationId.trim(),
    scope: input.scope,
    staticOnly: input.staticOnly,
    businessExecutionStarted: input.businessExecutionStarted,
    historicalResultsInvalidated: input.historicalResultsInvalidated,
    expectedImpactedCaseIds: expected,
    actualImpactedCaseIds: actual,
    missingRequiredChecks,
    diagnostics: [...new Set(diagnostics)].sort(),
    idempotency: { fingerprintsMatch, eventDelta, stable },
  };
  const status: OptimizationCompletionReport['status'] = body.diagnostics.length > 0
    ? 'invalid'
    : missingRequiredChecks.length > 0 || !stable ? 'incomplete' : 'complete';
  return { ...body, status, fingerprint: fingerprint({ ...body, status }) };
}

export function assertOptimizationCompletion(report: OptimizationCompletionReport): void {
  if (report.status !== 'complete') {
    throw new Error(`OPTIMIZATION_COMPLETION_GATE_NOT_MET:${report.status}:${[...report.missingRequiredChecks, ...report.diagnostics].join(',')}`);
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
