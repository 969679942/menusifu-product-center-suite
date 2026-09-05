import { createHash } from 'node:crypto';

export type ProjectRemediationScopeCase = {
  caseId: string;
  module: string;
  canonicalPath: string;
  ownerPath: string;
  runnerId: string;
};

export type ProjectRemediationScopeExclusion = {
  caseId: string;
  module: string;
  status: string;
  reason: string;
};

export type ProjectRemediationScopeIssue = {
  code: string;
  caseId?: string;
  module?: string;
  details?: string;
};

export type ProjectRemediationScopeArtifact = {
  schemaVersion: '1.0.0';
  scopeId: string;
  applicationId: string;
  projectId: string;
  generatedAt: string;
  status: 'ready' | 'blocked';
  expectedLandedByModule: Record<string, number>;
  expectedExclusionsByStatus: Record<string, number>;
  summary: {
    expectedLanded: number;
    actualLanded: number;
    expectedExclusions: number;
    actualExclusions: number;
  };
  cases: ProjectRemediationScopeCase[];
  exclusions: ProjectRemediationScopeExclusion[];
  issues: ProjectRemediationScopeIssue[];
  sourceFingerprints: Record<string, string>;
  fingerprint: string;
};

export function buildProjectRemediationScope(input: {
  scopeId: string;
  applicationId: string;
  projectId: string;
  expectedLandedByModule: Readonly<Record<string, number>>;
  expectedExclusionsByStatus: Readonly<Record<string, number>>;
  cases: readonly ProjectRemediationScopeCase[];
  exclusions: readonly ProjectRemediationScopeExclusion[];
  sourceFingerprints: Readonly<Record<string, string>>;
  ownerRegistration: Readonly<Record<string, boolean>>;
  generatedAt?: string;
}): ProjectRemediationScopeArtifact {
  if (!input.scopeId.trim()) throw new Error('PROJECT_REMEDIATION_SCOPE_ID_REQUIRED');
  if (!input.applicationId.trim()) throw new Error('PROJECT_REMEDIATION_APPLICATION_ID_REQUIRED');
  if (!input.projectId.trim()) throw new Error('PROJECT_REMEDIATION_PROJECT_ID_REQUIRED');

  const cases = [...input.cases].sort((left, right) => left.caseId.localeCompare(right.caseId));
  const exclusions = [...input.exclusions].sort((left, right) => left.caseId.localeCompare(right.caseId));
  const issues: ProjectRemediationScopeIssue[] = [];
  const targetIds = new Set<string>();
  for (const item of cases) {
    if (!item.caseId.trim()) issues.push({ code: 'CASE_ID_REQUIRED', module: item.module });
    if (targetIds.has(item.caseId)) issues.push({ code: 'TARGET_CASE_DUPLICATE', caseId: item.caseId, module: item.module });
    targetIds.add(item.caseId);
    if (!item.module.trim()) issues.push({ code: 'CASE_MODULE_REQUIRED', caseId: item.caseId });
    if (!item.canonicalPath.trim()) issues.push({ code: 'CANONICAL_PATH_REQUIRED', caseId: item.caseId, module: item.module });
    if (!item.ownerPath.trim()) issues.push({ code: 'OWNER_PATH_REQUIRED', caseId: item.caseId, module: item.module });
    if (!item.runnerId.trim()) issues.push({ code: 'RUNNER_ID_REQUIRED', caseId: item.caseId, module: item.module });
    if (input.ownerRegistration[item.caseId] !== true) {
      issues.push({ code: 'OWNER_REGISTRATION_MISSING', caseId: item.caseId, module: item.module });
    }
  }

  const exclusionIds = new Set<string>();
  for (const item of exclusions) {
    if (targetIds.has(item.caseId)) issues.push({ code: 'TARGET_EXCLUSION_OVERLAP', caseId: item.caseId, module: item.module });
    if (exclusionIds.has(item.caseId)) issues.push({ code: 'EXCLUSION_CASE_DUPLICATE', caseId: item.caseId, module: item.module });
    exclusionIds.add(item.caseId);
    if (!item.status.trim()) issues.push({ code: 'EXCLUSION_STATUS_REQUIRED', caseId: item.caseId, module: item.module });
    if (!item.reason.trim()) issues.push({ code: 'EXCLUSION_REASON_REQUIRED', caseId: item.caseId, module: item.module });
  }

  compareCounts('LANDED', input.expectedLandedByModule, countBy(cases, (item) => item.module), issues);
  compareCounts('EXCLUSION', input.expectedExclusionsByStatus, countBy(exclusions, (item) => item.status), issues);
  const expectedLanded = sumCounts(input.expectedLandedByModule);
  const expectedExclusions = sumCounts(input.expectedExclusionsByStatus);
  if (cases.length !== expectedLanded) {
    issues.push({ code: 'LANDED_TOTAL_MISMATCH', details: `expected=${expectedLanded};actual=${cases.length}` });
  }
  if (exclusions.length !== expectedExclusions) {
    issues.push({ code: 'EXCLUSION_TOTAL_MISMATCH', details: `expected=${expectedExclusions};actual=${exclusions.length}` });
  }

  const withoutFingerprint = {
    schemaVersion: '1.0.0' as const,
    scopeId: input.scopeId.trim(),
    applicationId: input.applicationId.trim(),
    projectId: input.projectId.trim(),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status: issues.length === 0 ? 'ready' as const : 'blocked' as const,
    expectedLandedByModule: sortRecord(input.expectedLandedByModule),
    expectedExclusionsByStatus: sortRecord(input.expectedExclusionsByStatus),
    summary: {
      expectedLanded,
      actualLanded: cases.length,
      expectedExclusions,
      actualExclusions: exclusions.length,
    },
    cases,
    exclusions,
    issues: uniqueIssues(issues),
    sourceFingerprints: sortRecord(input.sourceFingerprints),
  };
  return { ...withoutFingerprint, fingerprint: hash(withoutFingerprint) };
}

export function assertProjectRemediationExecutionScope(input: {
  scope: ProjectRemediationScopeArtifact;
  plannedCaseIds: readonly string[];
  classifiedExclusionCaseIds: readonly string[];
}): void {
  if (input.scope.status !== 'ready') throw new Error(`PROJECT_REMEDIATION_SCOPE_BLOCKED:${input.scope.issues.map((item) => item.code).join(',')}`);
  const target = new Set(input.scope.cases.map((item) => item.caseId));
  const planned = new Set(input.plannedCaseIds);
  const exclusions = new Set(input.classifiedExclusionCaseIds);
  if (planned.size !== input.plannedCaseIds.length) throw new Error('PROJECT_REMEDIATION_PLANNED_CASE_DUPLICATE');
  if (exclusions.size !== input.classifiedExclusionCaseIds.length) throw new Error('PROJECT_REMEDIATION_EXCLUSION_CASE_DUPLICATE');
  const overlap = [...planned].filter((caseId) => exclusions.has(caseId));
  if (overlap.length > 0) throw new Error(`PROJECT_REMEDIATION_PLAN_EXCLUSION_OVERLAP:${overlap.sort().join(',')}`);
  const unknown = [...planned, ...exclusions].filter((caseId) => !target.has(caseId));
  if (unknown.length > 0) throw new Error(`PROJECT_REMEDIATION_UNKNOWN_CASE:${[...new Set(unknown)].sort().join(',')}`);
  const missing = [...target].filter((caseId) => !planned.has(caseId) && !exclusions.has(caseId));
  if (missing.length > 0) throw new Error(`PROJECT_REMEDIATION_SCOPE_INCOMPLETE:${missing.sort().join(',')}`);
}

function compareCounts(
  prefix: string,
  expected: Readonly<Record<string, number>>,
  actual: Readonly<Record<string, number>>,
  issues: ProjectRemediationScopeIssue[],
): void {
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    if ((expected[key] ?? 0) !== (actual[key] ?? 0)) {
      issues.push({ code: `${prefix}_COUNT_MISMATCH`, module: key, details: `expected=${expected[key] ?? 0};actual=${actual[key] ?? 0}` });
    }
  }
}

function countBy<T>(items: readonly T[], keyOf: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[keyOf(item)] = (counts[keyOf(item)] ?? 0) + 1;
  return counts;
}

function sumCounts(counts: Readonly<Record<string, number>>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function sortRecord<T>(value: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function uniqueIssues(issues: readonly ProjectRemediationScopeIssue[]): ProjectRemediationScopeIssue[] {
  return [...new Map(issues.map((issue) => [JSON.stringify(issue), issue])).values()]
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
