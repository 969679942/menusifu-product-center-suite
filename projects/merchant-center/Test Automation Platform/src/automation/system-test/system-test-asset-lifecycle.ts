import { createHash } from 'node:crypto';

export type SystemTestAssetBindingStatus = 'bound' | 'unbound' | 'not-applicable';
export type SystemTestAssetExclusion =
  | 'handled'
  | 'deferred'
  | 'not-applicable'
  | 'blocked-source'
  | 'blocked-technical';
export type SystemTestAssetRuntimeStatus = 'passed' | 'failed' | 'not-run' | 'not-applicable';
export type SystemTestAssetLifecycleStatus =
  | 'passed'
  | 'failed'
  | 'ready'
  | 'deferred'
  | 'handled'
  | 'not-applicable'
  | 'blocked-source'
  | 'blocked-technical'
  | 'evidence-revalidation-required'
  | 'invalid';

export type SystemTestAssetLifecycleInput = {
  applicationId: string;
  businessDomainId: string;
  caseId: string;
  title: string;
  module: string;
  sourceIds: string[];
  canonical: {
    sourcePath: string;
    sourceFingerprint: string;
    caseFingerprint: string;
    indexPresent: boolean;
  };
  binding: {
    status: SystemTestAssetBindingStatus;
    fingerprint: string;
    scriptPath: string | null;
    indexStatus: 'landed' | 'unlanded' | 'not-applicable';
  };
  classification?: {
    disposition: SystemTestAssetExclusion;
    reason: string;
    recoveryCondition: string;
  } | null;
  currentExecution?: {
    implementationFingerprint: string | null;
    contextFingerprint: string | null;
  };
  execution: {
    caseFingerprint: string | null;
    implementationFingerprint: string | null;
    contextFingerprint: string | null;
    status: SystemTestAssetRuntimeStatus;
    evidenceStatus: string | null;
    receiptEvidenceFingerprint: string | null;
    evidenceFileFingerprint: string | null;
    recordedAt: string | null;
  };
};

export type SystemTestAssetLifecycleRecord = SystemTestAssetLifecycleInput & {
  executionEligible: boolean;
  classifiedExclusion: SystemTestAssetExclusion | null;
  executed: boolean;
  lifecycleStatus: SystemTestAssetLifecycleStatus;
  reconciliation: {
    canonicalPresent: boolean;
    bindingPresent: boolean;
    executionMatchesCase: boolean;
    executionMatchesImplementation: boolean;
    executionMatchesContext: boolean;
    receiptComplete: boolean;
    completedIndexPresent: boolean;
    unlandedIndexPresent: boolean;
    issues: string[];
  };
};

export type SystemTestAssetLifecycleLedger = {
  schemaVersion: '1.0.0';
  generatedAt: string;
  identity: {
    applicationId: string;
    businessDomainId: string;
    scope: string;
  };
  sourceManifest: Array<{ kind: string; path: string; fingerprint: string }>;
  orphanIndexCaseIds: string[];
  orphanReferenceCaseIds: {
    binding: string[];
    execution: string[];
    index: string[];
  };
  summary: {
    planned: number;
    executionEligible: number;
    classifiedExclusions: number;
    executed: number;
    passed: number;
    failed: number;
    notRun: number;
    receiptComplete: number;
    reconciliationIssues: number;
    invariantStatus: 'satisfied' | 'violated';
  };
  invariants: {
    plannedEqualsEligiblePlusExclusions: boolean;
    executionEligibleEqualsExecuted: boolean;
    executedEqualsPassedPlusFailed: boolean;
    noDuplicateCaseIds: boolean;
    noOrphanIndexEntries: boolean;
    noOrphanReferenceEntries: boolean;
    noPassedWithoutCompleteReceipt: boolean;
  };
  cases: SystemTestAssetLifecycleRecord[];
};

export function fingerprintSystemTestAssetValue(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function buildSystemTestAssetLifecycleLedger(input: {
  generatedAt?: string;
  scope: string;
  applicationId: string;
  businessDomainId: string;
  sourceManifest: Array<{ kind: string; path: string; fingerprint: string }>;
  orphanIndexCaseIds?: string[];
  orphanReferenceCaseIds?: {
    binding?: string[];
    execution?: string[];
    index?: string[];
  };
  cases: readonly SystemTestAssetLifecycleInput[];
}): SystemTestAssetLifecycleLedger {
  const duplicateCaseIds = findDuplicates(input.cases.map((item) => item.caseId));
  if (duplicateCaseIds.length > 0) throw new Error(`ASSET_LIFECYCLE_DUPLICATE_CASE_ID:${duplicateCaseIds.join(',')}`);
  const cases = input.cases.map(buildRecord);
  const planned = cases.length;
  const executionEligible = cases.filter((item) => item.executionEligible).length;
  const classifiedExclusions = cases.filter((item) => item.classifiedExclusion !== null).length;
  const executed = cases.filter((item) => item.lifecycleStatus === 'passed' || item.lifecycleStatus === 'failed').length;
  const passed = cases.filter((item) => item.lifecycleStatus === 'passed').length;
  const failed = cases.filter((item) => item.lifecycleStatus === 'failed').length;
  const notRun = cases.filter((item) => item.execution.status === 'not-run').length;
  const receiptComplete = cases.filter((item) => item.reconciliation.receiptComplete).length;
  const reconciliationIssues = cases.reduce((count, item) => count + item.reconciliation.issues.length, 0);
  const invariants = {
    plannedEqualsEligiblePlusExclusions: planned === executionEligible + classifiedExclusions,
    executionEligibleEqualsExecuted: executionEligible === executed,
    executedEqualsPassedPlusFailed: executed === passed + failed,
    noDuplicateCaseIds: duplicateCaseIds.length === 0,
    noOrphanIndexEntries: (input.orphanReferenceCaseIds?.index ?? input.orphanIndexCaseIds ?? []).length === 0,
    noOrphanReferenceEntries: (input.orphanReferenceCaseIds?.binding ?? []).length === 0
      && (input.orphanReferenceCaseIds?.execution ?? []).length === 0
      && (input.orphanReferenceCaseIds?.index ?? input.orphanIndexCaseIds ?? []).length === 0,
    noPassedWithoutCompleteReceipt: cases.every((item) => item.lifecycleStatus !== 'passed' || item.reconciliation.receiptComplete),
  };
  return {
    schemaVersion: '1.0.0',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    identity: { applicationId: input.applicationId, businessDomainId: input.businessDomainId, scope: input.scope },
    sourceManifest: deduplicateManifest(input.sourceManifest),
    orphanIndexCaseIds: [...(input.orphanIndexCaseIds ?? [])].sort(),
    orphanReferenceCaseIds: {
      binding: [...(input.orphanReferenceCaseIds?.binding ?? [])].sort(),
      execution: [...(input.orphanReferenceCaseIds?.execution ?? [])].sort(),
      index: [...(input.orphanReferenceCaseIds?.index ?? input.orphanIndexCaseIds ?? [])].sort(),
    },
    summary: {
      planned,
      executionEligible,
      classifiedExclusions,
      executed,
      passed,
      failed,
      notRun,
      receiptComplete,
      reconciliationIssues,
      invariantStatus: Object.values(invariants).every(Boolean) && reconciliationIssues === 0 ? 'satisfied' : 'violated',
    },
    invariants,
    cases: cases.sort((left, right) => left.caseId.localeCompare(right.caseId)),
  };
}

function buildRecord(input: SystemTestAssetLifecycleInput): SystemTestAssetLifecycleRecord {
  const issues: string[] = [];
  const classifiedExclusion = input.classification?.disposition ?? (input.binding.status === 'unbound' ? 'blocked-technical' : null);
  const executionEligible = classifiedExclusion === null && input.binding.status === 'bound';
  const executionMatchesCase = input.execution.caseFingerprint === null
    || normalizeFingerprint(input.execution.caseFingerprint) === normalizeFingerprint(input.canonical.caseFingerprint);
  const hasExecutionObservation = input.execution.status !== 'not-run'
    || input.execution.caseFingerprint !== null
    || input.execution.implementationFingerprint !== null
    || input.execution.contextFingerprint !== null
    || input.execution.recordedAt !== null;
  const executionMatchesImplementation = !hasExecutionObservation
    || input.currentExecution?.implementationFingerprint == null
    || normalizeFingerprint(input.execution.implementationFingerprint)
      === normalizeFingerprint(input.currentExecution.implementationFingerprint);
  const executionMatchesContext = !hasExecutionObservation
    || input.currentExecution?.contextFingerprint == null
    || normalizeFingerprint(input.execution.contextFingerprint)
      === normalizeFingerprint(input.currentExecution.contextFingerprint);
  const receiptComplete = input.execution.status === 'passed'
    && input.execution.evidenceStatus === 'complete'
    && Boolean(input.execution.receiptEvidenceFingerprint)
    && Boolean(input.execution.evidenceFileFingerprint);
  if (!input.canonical.indexPresent) issues.push('CANONICAL_INDEX_MISSING');
  if (input.binding.status === 'bound' && !input.binding.scriptPath) issues.push('BOUND_SCRIPT_MISSING');
  if (executionEligible && !executionMatchesCase) issues.push('EXECUTION_CASE_FINGERPRINT_MISMATCH');
  if (executionEligible && !executionMatchesImplementation) issues.push('EXECUTION_IMPLEMENTATION_FINGERPRINT_MISMATCH');
  if (executionEligible && !executionMatchesContext) issues.push('EXECUTION_CONTEXT_FINGERPRINT_MISMATCH');
  if (executionEligible && input.execution.status === 'passed' && !receiptComplete) {
    issues.push('PASSED_RECEIPT_INCOMPLETE');
  }
  const executed = executionMatchesCase && executionMatchesImplementation && executionMatchesContext
    && (input.execution.status === 'passed' || input.execution.status === 'failed');
  let lifecycleStatus: SystemTestAssetLifecycleStatus;
  if (issues.length > 0) lifecycleStatus = 'invalid';
  else if (classifiedExclusion) lifecycleStatus = classifiedExclusion;
  else if (input.execution.status === 'passed' && receiptComplete) lifecycleStatus = 'passed';
  else if (input.execution.status === 'failed') lifecycleStatus = 'failed';
  else if (input.binding.status === 'bound') lifecycleStatus = 'ready';
  else lifecycleStatus = 'evidence-revalidation-required';
  return {
    ...input,
    executionEligible,
    classifiedExclusion,
    executed,
    lifecycleStatus,
    reconciliation: {
      canonicalPresent: input.canonical.indexPresent,
      bindingPresent: input.binding.status !== 'unbound',
      executionMatchesCase,
      executionMatchesImplementation,
      executionMatchesContext,
      receiptComplete,
      completedIndexPresent: input.binding.indexStatus === 'landed',
      unlandedIndexPresent: input.binding.indexStatus !== 'landed',
      issues,
    },
  };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function deduplicateManifest(
  entries: readonly { kind: string; path: string; fingerprint: string }[],
): Array<{ kind: string; path: string; fingerprint: string }> {
  const result = new Map<string, { kind: string; path: string; fingerprint: string }>();
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.path}`;
    const existing = result.get(key);
    if (existing && existing.fingerprint !== entry.fingerprint) {
      throw new Error(`ASSET_LIFECYCLE_SOURCE_FINGERPRINT_CONFLICT:${key}`);
    }
    result.set(key, entry);
  }
  return [...result.values()].sort((left, right) => `${left.kind}:${left.path}`.localeCompare(`${right.kind}:${right.path}`));
}

function normalizeFingerprint(value: string | null): string | null {
  return value?.trim().replace(/^sha256:/i, '').toLowerCase() ?? null;
}
