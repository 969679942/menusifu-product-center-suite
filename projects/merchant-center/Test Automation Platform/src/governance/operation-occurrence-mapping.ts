import type { RuntimeOperationReceipt } from '../automation/system-test/system-test-runtime-contract';

type Occurrence = { executableOperationKey: string; occurrence: number };
export type OperationOccurrenceMapping = {
  schemaVersion: '1.0.0';
  sourceStepIds: string[];
  business: Array<Occurrence & { operationKey: string; sourceStepId: string }>;
  supporting: Array<Occurrence & { required: boolean }>;
};
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const key = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && value.trim() === value;
const uniqueKeys = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0
  && value.every(key) && new Set(value).size === value.length;
const occurrenceKey = (value: Occurrence) => JSON.stringify([value.executableOperationKey, value.occurrence]);
const occurrence = (value: unknown): value is Occurrence & Record<string, unknown> => record(value)
  && key(value.executableOperationKey) && Number.isSafeInteger(value.occurrence) && Number(value.occurrence) > 0;

/** Independent declarations: one concrete occurrence per source step, no wildcard or shared coverage. */
export function isOperationOccurrenceMapping(value: unknown): value is OperationOccurrenceMapping {
  if (!record(value) || value.schemaVersion !== '1.0.0' || !uniqueKeys(value.sourceStepIds)
    || !Array.isArray(value.business) || !Array.isArray(value.supporting)
    || !value.business.every((item) => occurrence(item) && key(item.operationKey) && key(item.sourceStepId))
    || !value.supporting.every((item) => occurrence(item) && typeof item.required === 'boolean')) return false;
  const business = value.business as OperationOccurrenceMapping['business'];
  const supporting = value.supporting as OperationOccurrenceMapping['supporting'];
  const sources = business.map((item) => item.sourceStepId);
  const operations = business.map((item) => item.operationKey);
  const occurrences = [...business, ...supporting].map(occurrenceKey);
  return business.length === value.sourceStepIds.length && new Set(sources).size === sources.length
    && sources.every((id) => (value.sourceStepIds as string[]).includes(id))
    && new Set(operations).size === operations.length && new Set(occurrences).size === occurrences.length;
}

export function mappingMatchesRequiredOperations(mapping: OperationOccurrenceMapping, required: readonly string[]): boolean {
  return isOperationOccurrenceMapping(mapping) && required.length === mapping.business.length
    && new Set(required).size === required.length && mapping.business.every((item) => required.includes(item.operationKey));
}

export type MappedBusinessOperationReceipt = RuntimeOperationReceipt & {
  sourceStepId: string;
  executableOperationKey: string;
  executableOccurrence: number;
};

/** Projects references to original observations; it never creates observed/passed evidence.
 * sequence orders starts, so nested completion order cannot change occurrence identity.
 */
export function mapOperationReceiptOccurrences(mapping: OperationOccurrenceMapping, raw: readonly RuntimeOperationReceipt[]): {
  status: 'complete' | 'incomplete'; reasons: string[]; businessReceipts: MappedBusinessOperationReceipt[];
  supportingSequences: number[];
} {
  const reasons = new Set<string>();
  const fail = (reason: string) => { reasons.add(reason); };
  if (!isOperationOccurrenceMapping(mapping)) return { status: 'incomplete', reasons: ['OPERATION_MAPPING_CONTRACT_INVALID'], businessReceipts: [], supportingSequences: [] };
  if (!Array.isArray(raw) || raw.some((item) => !record(item) || !key(item.operationKey) || !key(item.method)
    || !Number.isSafeInteger(item.sequence) || Number(item.sequence) <= 0)
    || new Set(raw.map((item) => item.sequence)).size !== raw.length) {
    return { status: 'incomplete', reasons: ['OPERATION_OCCURRENCE_SEQUENCE_INVALID'], businessReceipts: [], supportingSequences: [] };
  }
  const indexed = new Map<string, RuntimeOperationReceipt>();
  const counts = new Map<string, number>();
  for (const item of [...raw].sort((a, b) => a.sequence! - b.sequence!)) {
    const ordinal = (counts.get(item.operationKey) ?? 0) + 1;
    counts.set(item.operationKey, ordinal);
    indexed.set(occurrenceKey({ executableOperationKey: item.operationKey, occurrence: ordinal }), item);
    if (item.status !== 'passed' || item.observed !== true || !item.startedAt || !item.finishedAt
      || !Number.isFinite(Date.parse(item.startedAt)) || !Number.isFinite(Date.parse(item.finishedAt))
      || Date.parse(item.finishedAt) < Date.parse(item.startedAt)) fail('OPERATION_OCCURRENCE_EXECUTION_INCOMPLETE');
  }
  const consumed = new Set<string>();
  const businessReceipts: MappedBusinessOperationReceipt[] = [];
  const supportingSequences: number[] = [];
  for (const binding of mapping.business) {
    const id = occurrenceKey(binding);
    const observed = indexed.get(id);
    if (!observed) { fail('BUSINESS_OPERATION_OCCURRENCE_MISSING'); continue; }
    consumed.add(id);
    businessReceipts.push({ ...observed, operationKey: binding.operationKey, sourceStepId: binding.sourceStepId,
      executableOperationKey: observed.operationKey, executableOccurrence: binding.occurrence });
  }
  for (const binding of mapping.supporting) {
    const id = occurrenceKey(binding);
    const observed = indexed.get(id);
    if (!observed) { if (binding.required) fail('SUPPORTING_OPERATION_OCCURRENCE_MISSING'); continue; }
    consumed.add(id);
    supportingSequences.push(observed.sequence!);
  }
  if ([...indexed.keys()].some((id) => !consumed.has(id))) fail('UNDECLARED_OPERATION_OCCURRENCE');
  return { status: reasons.size ? 'incomplete' : 'complete', reasons: [...reasons].sort(), businessReceipts, supportingSequences };
}
