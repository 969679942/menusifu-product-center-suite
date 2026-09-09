import { createHash } from 'node:crypto';

export type ExecutionIntentStage = 'canary' | 'batch' | 'full';
export type ExecutionIntentMode = 'incremental' | 'full-regression';

export type ExecutionIntent = {
  intentId: string;
  mode: ExecutionIntentMode;
  stage: ExecutionIntentStage;
  scopeId: string;
  scopeFingerprint: string;
  plannedCaseIds: readonly string[];
  classifiedExclusionCaseIds: readonly string[];
  partitionCaseIds: Readonly<Record<string, readonly string[]>>;
  canaryPartitionKeys?: readonly string[];
  selectedCaseIds: readonly string[];
  routes: Readonly<Record<string, readonly string[]>>;
};

export type ExecutionIntentCheckpoint = {
  intentFingerprint: string;
  selectedFingerprint: string;
};

export type ExecutionIntentCheckpointState = ExecutionIntentCheckpoint & {
  selectedCaseIds: readonly string[];
  terminalCaseIds: readonly string[];
  incompleteCaseIds: readonly string[];
};

/**
 * Validate the metadata required before a persisted execution checkpoint may
 * be resumed. This is deliberately independent of any project adapter.
 */
export function assertExecutionIntentCheckpointMetadata(value: unknown): asserts value is ExecutionIntentCheckpointState {
  if (!value || typeof value !== 'object') throw new Error('EXECUTION_INTENT_CHECKPOINT_METADATA_REQUIRED');
  const checkpoint = value as Partial<ExecutionIntentCheckpointState>;
  if (typeof checkpoint.intentFingerprint !== 'string' || checkpoint.intentFingerprint.length === 0
    || typeof checkpoint.selectedFingerprint !== 'string' || checkpoint.selectedFingerprint.length === 0
    || !Array.isArray(checkpoint.selectedCaseIds)
    || !Array.isArray(checkpoint.terminalCaseIds)
    || !Array.isArray(checkpoint.incompleteCaseIds)) {
    throw new Error('EXECUTION_INTENT_CHECKPOINT_METADATA_REQUIRED');
  }
}

export function fingerprintExecutionIntent(intent: ExecutionIntent): string {
  return hash({
    intentId: intent.intentId,
    mode: intent.mode,
    stage: intent.stage,
    scopeId: intent.scopeId,
    scopeFingerprint: intent.scopeFingerprint,
    plannedCaseIds: sortedUnique(intent.plannedCaseIds),
    classifiedExclusionCaseIds: sortedUnique(intent.classifiedExclusionCaseIds),
    partitionCaseIds: sortedRecord(intent.partitionCaseIds),
    canaryPartitionKeys: sortedUnique(intent.canaryPartitionKeys ?? Object.keys(intent.partitionCaseIds)),
    selectedCaseIds: sortedUnique(intent.selectedCaseIds),
    routes: sortedRecord(intent.routes),
  });
}

export function fingerprintExecutionSelection(caseIds: readonly string[]): string {
  return hash(sortedUnique(caseIds));
}

export function assertExecutionIntentContract(input: {
  intent: ExecutionIntent;
  checkpoint?: ExecutionIntentCheckpoint;
}): void {
  const { intent } = input;
  requireText(intent.intentId, 'EXECUTION_INTENT_ID_REQUIRED');
  requireText(intent.scopeId, 'EXECUTION_INTENT_SCOPE_ID_REQUIRED');
  requireText(intent.scopeFingerprint, 'EXECUTION_INTENT_SCOPE_FINGERPRINT_REQUIRED');
  assertUnique(intent.plannedCaseIds, 'EXECUTION_INTENT_PLANNED_CASE_DUPLICATE');
  assertUnique(intent.classifiedExclusionCaseIds, 'EXECUTION_INTENT_EXCLUSION_CASE_DUPLICATE');
  assertUnique(intent.selectedCaseIds, 'EXECUTION_INTENT_SELECTED_CASE_DUPLICATE');

  const planned = new Set(intent.plannedCaseIds);
  const exclusions = new Set(intent.classifiedExclusionCaseIds);
  const overlap = [...planned].filter((caseId) => exclusions.has(caseId));
  if (overlap.length > 0) throw new Error(`EXECUTION_INTENT_PLAN_EXCLUSION_OVERLAP:${overlap.sort().join(',')}`);
  if (planned.size === 0 && exclusions.size === 0) throw new Error('EXECUTION_INTENT_SCOPE_EMPTY');

  const partitionIds = flattenRecord(intent.partitionCaseIds, 'EXECUTION_INTENT_PARTITION');
  if (partitionIds.length === 0) throw new Error('EXECUTION_INTENT_PARTITION_EMPTY');
  const missingFromPartitions = [...planned].filter((caseId) => !partitionIds.includes(caseId));
  const unknownInPartitions = partitionIds.filter((caseId) => !planned.has(caseId));
  if (missingFromPartitions.length > 0) throw new Error(`EXECUTION_INTENT_PARTITION_INCOMPLETE:${missingFromPartitions.sort().join(',')}`);
  if (unknownInPartitions.length > 0) throw new Error(`EXECUTION_INTENT_PARTITION_UNKNOWN_CASE:${[...new Set(unknownInPartitions)].sort().join(',')}`);

  const unknownSelected = intent.selectedCaseIds.filter((caseId) => !planned.has(caseId));
  if (unknownSelected.length > 0) throw new Error(`EXECUTION_INTENT_SELECTED_CASE_OUTSIDE_SCOPE:${[...new Set(unknownSelected)].sort().join(',')}`);
  if (intent.mode === 'full-regression' && !sameSet(intent.selectedCaseIds, intent.plannedCaseIds)) {
    throw new Error('EXECUTION_INTENT_FULL_REGRESSION_NOT_COMPLETE_SCOPE');
  }
  if (intent.stage === 'canary') {
    const canaryPartitionKeys = intent.canaryPartitionKeys ?? Object.keys(intent.partitionCaseIds);
    assertUnique(canaryPartitionKeys, 'EXECUTION_INTENT_CANARY_PARTITION_DUPLICATE');
    const unknownCanaryPartitions = canaryPartitionKeys.filter((key) => !(key in intent.partitionCaseIds));
    if (unknownCanaryPartitions.length > 0) {
      throw new Error(`EXECUTION_INTENT_CANARY_PARTITION_UNKNOWN:${unknownCanaryPartitions.sort().join(',')}`);
    }
    if (canaryPartitionKeys.length === 0) throw new Error('EXECUTION_INTENT_CANARY_PARTITION_EMPTY');
    const missingPartitions = canaryPartitionKeys.map((key) => [key, intent.partitionCaseIds[key]] as const)
      .filter(([, caseIds]) => !caseIds.some((caseId) => intent.selectedCaseIds.includes(caseId)))
      .map(([partition]) => partition);
    if (missingPartitions.length > 0) throw new Error(`EXECUTION_INTENT_CANARY_PARTITION_MISSING:${missingPartitions.join(',')}`);
  }

  const routeIds = flattenRecord(intent.routes, 'EXECUTION_INTENT_ROUTE');
  if (routeIds.length !== intent.selectedCaseIds.length) {
    throw new Error(`EXECUTION_INTENT_ROUTE_SELECTION_MISMATCH:selected=${intent.selectedCaseIds.length};routed=${routeIds.length}`);
  }
  if (!sameSet(routeIds, intent.selectedCaseIds)) {
    const missing = intent.selectedCaseIds.filter((caseId) => !routeIds.includes(caseId));
    const unknown = routeIds.filter((caseId) => !intent.selectedCaseIds.includes(caseId));
    throw new Error(`EXECUTION_INTENT_ROUTE_COVERAGE_MISMATCH:missing=${missing.join(',')};unknown=${unknown.join(',')}`);
  }

  const intentFingerprint = fingerprintExecutionIntent(intent);
  const selectedFingerprint = fingerprintExecutionSelection(intent.selectedCaseIds);
  if (input.checkpoint && input.checkpoint.intentFingerprint !== intentFingerprint) {
    throw new Error('EXECUTION_INTENT_CHECKPOINT_FINGERPRINT_MISMATCH');
  }
  if (input.checkpoint && input.checkpoint.selectedFingerprint !== selectedFingerprint) {
    throw new Error('EXECUTION_INTENT_CHECKPOINT_SELECTION_MISMATCH');
  }
}

/**
 * Reconcile an incremental intent with its explicit impact manifest before
 * authentication, test-data setup, or browser startup. The change scope is
 * conserved by planned cases plus formally classified exclusions; unrelated
 * reusable cases must not be pulled into the current change.
 */
export function assertExecutionIntentImpactScope(input: {
  intent: ExecutionIntent;
  impactedCaseIds: readonly string[];
}): void {
  assertUnique(input.impactedCaseIds, 'EXECUTION_INTENT_IMPACT_CASE_DUPLICATE');
  const intentScope = [
    ...input.intent.plannedCaseIds,
    ...input.intent.classifiedExclusionCaseIds,
  ];
  if (!sameSet(intentScope, input.impactedCaseIds)) {
    const intended = new Set(intentScope);
    const impacted = new Set(input.impactedCaseIds);
    const missing = input.impactedCaseIds.filter((caseId) => !intended.has(caseId));
    const unexpected = intentScope.filter((caseId) => !impacted.has(caseId));
    throw new Error(
      `EXECUTION_INTENT_IMPACT_SCOPE_MISMATCH:missing=${missing.sort().join(',')};unexpected=${unexpected.sort().join(',')}`,
    );
  }
}

export function assertExecutionIntentCompletion(input: {
  intent: ExecutionIntent;
  status: 'completed' | 'completed-with-findings' | 'blocked';
  terminalCaseIds: readonly string[];
}): void {
  assertUnique(input.terminalCaseIds, 'EXECUTION_INTENT_TERMINAL_CASE_DUPLICATE');
  const unknown = input.terminalCaseIds.filter((caseId) => !input.intent.selectedCaseIds.includes(caseId));
  if (unknown.length > 0) throw new Error(`EXECUTION_INTENT_TERMINAL_CASE_OUTSIDE_SELECTION:${[...new Set(unknown)].sort().join(',')}`);
  if (input.status !== 'blocked' && !sameSet(input.terminalCaseIds, input.intent.selectedCaseIds)) {
    throw new Error('EXECUTION_INTENT_COMPLETION_WITHOUT_ALL_TERMINAL_CASES');
  }
}

export function assertExecutionIntentCheckpointState(input: {
  intent: ExecutionIntent;
  terminalCaseIds: readonly string[];
  incompleteCaseIds: readonly string[];
}): void {
  assertExecutionIntentCompletion({ intent: input.intent, status: 'blocked', terminalCaseIds: input.terminalCaseIds });
  assertUnique(input.incompleteCaseIds, 'EXECUTION_INTENT_INCOMPLETE_CASE_DUPLICATE');
  const terminal = new Set(input.terminalCaseIds);
  const incomplete = new Set(input.incompleteCaseIds);
  const overlap = [...terminal].filter((caseId) => incomplete.has(caseId));
  if (overlap.length > 0) throw new Error(`EXECUTION_INTENT_CHECKPOINT_TERMINAL_INCOMPLETE_OVERLAP:${overlap.sort().join(',')}`);
  const expectedIncomplete = input.intent.selectedCaseIds.filter((caseId) => !terminal.has(caseId));
  if (!sameSet(expectedIncomplete, input.incompleteCaseIds)) {
    throw new Error('EXECUTION_INTENT_CHECKPOINT_INCOMPLETE_SET_MISMATCH');
  }
}

function flattenRecord(record: Readonly<Record<string, readonly string[]>>, prefix: string): string[] {
  const all: string[] = [];
  for (const [key, values] of Object.entries(record)) {
    requireText(key, `${prefix}_KEY_REQUIRED`);
    if (!Array.isArray(values) || values.length === 0) throw new Error(`${prefix}_EMPTY:${key}`);
    assertUnique(values, `${prefix}_CASE_DUPLICATE:${key}`);
    all.push(...values);
  }
  return all;
}

function assertUnique(values: readonly string[], code: string): void {
  if (new Set(values).size !== values.length) throw new Error(code);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === new Set(right).size && left.every((value) => right.includes(value));
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sortedRecord(record: Readonly<Record<string, readonly string[]>>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)).map(([key, values]) => [key, sortedUnique(values)]));
}

function requireText(value: string, code: string): void {
  if (!value.trim()) throw new Error(code);
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
