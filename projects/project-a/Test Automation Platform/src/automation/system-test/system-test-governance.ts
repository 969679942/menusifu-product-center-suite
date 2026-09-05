import { createHash } from 'node:crypto';
import type { RecipeAdapterCall } from '../recipe/automation-recipe';

export type SystemTestObservationChannel = 'ui' | 'api' | 'downstream' | 'cleanup';

export type SystemTestObservationAuthority =
  | 'user-visible'
  | 'persistence'
  | 'integration-terminal'
  | 'residue';

export type SystemTestSourceRecord = {
  sourceId: string;
  kind: 'prd' | 'xmind' | 'formal-case' | 'ui-audit' | 'network-audit' | 'human-rule' | 'runtime-evidence';
  path: string;
  fingerprint: string;
  verified: true;
  routes: `/${string}`[];
  contractIds: string[];
  observationChannels: SystemTestObservationChannel[];
};

export type SystemTestSourceRegistry = {
  schemaVersion: '1.0.0';
  sources: SystemTestSourceRecord[];
};

export type SystemTestExecutionContext = {
  environmentId: string;
  locale: string;
  roleId: string;
  tenantScope: string;
  featureFlagFingerprint: string;
};

export type SystemTestContextGuardPhase = 'before-action' | 'before-assertion';

export function buildSystemTestContextGuards(input: {
  adapterId: string;
  phases: readonly SystemTestContextGuardPhase[];
  route: `/${string}`;
  routeMatch?: 'exact' | 'exact-or-descendant';
  executionContext: SystemTestExecutionContext;
  businessIdentityStrategy: string;
}): RecipeAdapterCall[] {
  return input.phases.map((phase) => ({
    adapterId: input.adapterId,
    input: {
      phase,
      expectedRoute: input.route,
      routeMatch: input.routeMatch ?? 'exact',
      expectedLocale: input.executionContext.locale,
      expectedRoleId: input.executionContext.roleId,
      expectedTenantScope: input.executionContext.tenantScope,
      businessIdentityStrategy: input.businessIdentityStrategy,
    },
  }));
}

export type SystemTestExpectationContract = {
  expected: string;
  assertionAdapterId: string;
  observationChannel: SystemTestObservationChannel;
  authority: SystemTestObservationAuthority;
  terminalCondition: string;
  fieldId?: string;
  assertionSurfaceId?: string;
  feedback?: {
    mode: 'exact-message' | 'disabled-control' | 'confirmation-dialog';
    trigger: 'pre-submit' | 'submitted-operation';
    exactText?: string;
    operationKey?: string;
  };
  sourceIds: string[];
  contractIds: string[];
};

export function validateSystemTestSourceRegistry(input: {
  registry: SystemTestSourceRegistry | undefined;
  caseId: string;
  route: `/${string}`;
  sourceIds: readonly string[];
  contractIds: readonly string[];
  expectations: readonly SystemTestExpectationContract[];
}): string[] {
  if (!input.registry) return [`${input.caseId}:SOURCE_REGISTRY_REQUIRED`];
  const errors: string[] = [];
  const records = new Map<string, SystemTestSourceRecord>();
  for (const source of input.registry.sources) {
    if (records.has(source.sourceId)) errors.push(`SOURCE_REGISTRY_DUPLICATE:${source.sourceId}`);
    records.set(source.sourceId, source);
    if (!source.sourceId.trim() || !source.path.trim() || source.verified !== true) {
      errors.push(`SOURCE_REGISTRY_INVALID:${source.sourceId || '<empty>'}`);
    }
    if (!/^[a-f0-9]{64}$/i.test(source.fingerprint)) errors.push(`SOURCE_FINGERPRINT_INVALID:${source.sourceId}`);
    if (source.routes.length === 0 || source.contractIds.length === 0 || source.observationChannels.length === 0) {
      errors.push(`SOURCE_SCOPE_INCOMPLETE:${source.sourceId}`);
    }
  }
  const caseSources = resolveSources(input.caseId, input.sourceIds, records, errors);
  if (caseSources.length > 0 && !caseSources.some((source) => source.routes.includes(input.route))) {
    errors.push(`${input.caseId}:ROUTE_SOURCE_UNRESOLVED:${input.route}`);
  }
  validateContractIds(input.caseId, input.contractIds, caseSources, errors);
  input.expectations.forEach((expectation, index) => {
    const claim = `${input.caseId}:expectation-${index + 1}`;
    if (!expectation.expected.trim()) errors.push(`${claim}:EXPECTED_REQUIRED`);
    if (!expectation.terminalCondition.trim()) errors.push(`${claim}:TERMINAL_CONDITION_REQUIRED`);
    const expectationSources = resolveSources(claim, expectation.sourceIds, records, errors);
    if (expectationSources.some((source) => !input.sourceIds.includes(source.sourceId))) {
      errors.push(`${claim}:SOURCE_OUTSIDE_CASE_SCOPE`);
    }
    validateContractIds(claim, expectation.contractIds, expectationSources, errors);
    if (expectationSources.length > 0
      && !expectationSources.some((source) => source.observationChannels.includes(expectation.observationChannel))) {
      errors.push(`${claim}:OBSERVATION_CHANNEL_UNSUPPORTED:${expectation.observationChannel}`);
    }
    if (!authorityMatchesChannel(expectation.authority, expectation.observationChannel)) {
      errors.push(`${claim}:OBSERVATION_AUTHORITY_MISMATCH:${expectation.authority}:${expectation.observationChannel}`);
    }
  });
  return [...new Set(errors)].sort();
}

export function fingerprintSystemTestSourceRegistry(registry: SystemTestSourceRegistry | undefined): string {
  return createHash('sha256').update(stableJson(registry ?? null)).digest('hex');
}

export function fingerprintSystemTestSemanticSource(value: unknown): string {
  return createHash('sha256').update(stableJson(stripVolatileEvidenceMetadata(value))).digest('hex');
}

function stripVolatileEvidenceMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatileEvidenceMetadata);
  if (!value || typeof value !== 'object') return value;
  const volatileKeys = new Set(['generatedAt', 'collectedAt', 'observedAt', 'sha256', 'fingerprint']);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !volatileKeys.has(key))
    .map(([key, item]) => [key, stripVolatileEvidenceMetadata(item)]));
}

export function fingerprintSystemTestExecutionContext(context: SystemTestExecutionContext | undefined): string {
  return createHash('sha256').update(stableJson(context ?? null)).digest('hex');
}

export function validateSystemTestExecutionContext(context: SystemTestExecutionContext | undefined): string[] {
  if (!context) return ['EXECUTION_CONTEXT_REQUIRED'];
  const errors: string[] = [];
  for (const [key, value] of Object.entries(context)) {
    if (!String(value).trim()) errors.push(`EXECUTION_CONTEXT_VALUE_REQUIRED:${key}`);
  }
  if (!/^[a-f0-9]{64}$/i.test(context.featureFlagFingerprint)) {
    errors.push('EXECUTION_CONTEXT_FEATURE_FLAG_FINGERPRINT_INVALID');
  }
  return errors;
}

function resolveSources(
  ownerId: string,
  sourceIds: readonly string[],
  records: ReadonlyMap<string, SystemTestSourceRecord>,
  errors: string[],
): SystemTestSourceRecord[] {
  if (sourceIds.length === 0) errors.push(`${ownerId}:SOURCE_REQUIRED`);
  return sourceIds.flatMap((sourceId) => {
    const source = records.get(sourceId);
    if (!source) {
      errors.push(`${ownerId}:SOURCE_UNRESOLVED:${sourceId}`);
      return [];
    }
    return [source];
  });
}

function validateContractIds(
  ownerId: string,
  contractIds: readonly string[],
  sources: readonly SystemTestSourceRecord[],
  errors: string[],
): void {
  if (contractIds.length === 0) errors.push(`${ownerId}:CONTRACT_ID_REQUIRED`);
  const supported = new Set(sources.flatMap((source) => source.contractIds));
  for (const contractId of contractIds) {
    if (!supported.has(contractId)) errors.push(`${ownerId}:CONTRACT_UNRESOLVED:${contractId}`);
  }
}

function authorityMatchesChannel(
  authority: SystemTestObservationAuthority,
  channel: SystemTestObservationChannel,
): boolean {
  return (authority === 'user-visible' && channel === 'ui')
    || (authority === 'persistence' && channel === 'api')
    || (authority === 'integration-terminal' && channel === 'downstream')
    || (authority === 'residue' && channel === 'cleanup');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
