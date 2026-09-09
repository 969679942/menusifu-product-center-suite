import { createHash } from 'node:crypto';

export type ProductCenterApiCatalogOperation = {
  operationKey: string;
  method: string;
  path: string;
  service?: string;
  runtimeBaseEnv?: string;
  summary?: string | null;
};

export type ProductCenterObservedApiExchange = {
  caseId: string;
  route: string;
  method: string;
  url?: string;
  path?: string;
  status?: number;
  operationKey?: string;
  requestBody?: unknown;
  responseBody?: unknown;
  evidencePath: string;
  observedAt: string;
};

export type ProductCenterApiObservationProposal = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-api-observation-proposal';
  generatedAt: string;
  fingerprint: string;
  status: 'no-change' | 'proposal' | 'review-required';
  contractMutationAllowed: false;
  summary: {
    exchanges: number;
    matched: number;
    newOperations: number;
    conflicts: number;
    insufficientEvidence: number;
  };
  entries: Array<{
    caseId: string;
    route: string;
    method: string;
    path: string;
    status?: number;
    evidencePath: string;
    evidenceQuality: 'complete' | 'partial' | 'insufficient';
    disposition: 'matched' | 'new-operation-proposal' | 'conflict' | 'insufficient-evidence';
    matchedOperationKey?: string;
    operationKeyCandidate: string;
    requestShape: string[];
    responseShape: string[];
    conflicts: string[];
  }>;
};

export function buildProductCenterApiObservationProposal(input: {
  exchanges: readonly ProductCenterObservedApiExchange[];
  catalog: readonly ProductCenterApiCatalogOperation[];
  generatedAt?: string;
}): ProductCenterApiObservationProposal {
  const entries = input.exchanges.map((exchange) => buildEntry(exchange, input.catalog));
  const matched = entries.filter((entry) => entry.disposition === 'matched').length;
  const newOperations = entries.filter((entry) => entry.disposition === 'new-operation-proposal').length;
  const conflicts = entries.filter((entry) => entry.disposition === 'conflict').length;
  const insufficientEvidence = entries.filter((entry) => entry.disposition === 'insufficient-evidence').length;
  const status = conflicts + insufficientEvidence > 0
    ? 'review-required' as const
    : newOperations > 0
      ? 'proposal' as const
      : 'no-change' as const;
  const normalizedEntries = entries.sort((left, right) => (
    left.path.localeCompare(right.path) || left.method.localeCompare(right.method) || left.caseId.localeCompare(right.caseId)
  ));
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-api-observation-proposal',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    fingerprint: sha256(JSON.stringify(normalizedEntries)),
    status,
    contractMutationAllowed: false,
    summary: {
      exchanges: entries.length,
      matched,
      newOperations,
      conflicts,
      insufficientEvidence,
    },
    entries: normalizedEntries,
  };
}

export function normalizeProductCenterObservedApiExchange(input: {
  caseId: string;
  route: string;
  method: string;
  url?: string;
  status?: number;
  operationKey?: string;
  requestBody?: unknown;
  responseBody?: unknown;
  evidencePath: string;
  observedAt: string;
}): ProductCenterObservedApiExchange {
  return {
    ...input,
    method: input.method.toUpperCase(),
    path: normalizePath(input.url ?? input.route),
    requestBody: scrubSecrets(input.requestBody),
    responseBody: scrubSecrets(input.responseBody),
  };
}

function buildEntry(
  exchange: ProductCenterObservedApiExchange,
  catalog: readonly ProductCenterApiCatalogOperation[],
) {
  const method = exchange.method.toUpperCase();
  const path = normalizePath(exchange.path ?? exchange.url ?? exchange.route);
  const requestShape = shapeOf(exchange.requestBody);
  const responseShape = shapeOf(exchange.responseBody);
  const conflicts: string[] = [];
  const pathMatches = catalog.filter((operation) => (
    operation.method.toUpperCase() === method && normalizePath(operation.path) === path
  ));
  const keyMatch = exchange.operationKey
    ? catalog.find((operation) => operation.operationKey === exchange.operationKey)
    : undefined;
  if (exchange.operationKey && !keyMatch) conflicts.push('OBSERVED_OPERATION_KEY_NOT_IN_CATALOG');
  if (keyMatch && (keyMatch.method.toUpperCase() !== method || normalizePath(keyMatch.path) !== path)) {
    conflicts.push('OBSERVED_OPERATION_KEY_SIGNATURE_MISMATCH');
  }
  const evidenceQuality = !exchange.evidencePath || !exchange.observedAt || !method || !path
    ? 'insufficient' as const
    : requestShape.length > 0 || responseShape.length > 0 || exchange.status !== undefined
      ? 'complete' as const
      : 'partial' as const;
  const matchedOperationKey = keyMatch?.operationKey ?? (pathMatches.length === 1 ? pathMatches[0].operationKey : undefined);
  // A new or conflicting signature is a proposal only; formal catalog mutation stays gated elsewhere.
  const disposition = evidenceQuality === 'insufficient'
    ? 'insufficient-evidence' as const
    : conflicts.length > 0
      ? 'conflict' as const
      : matchedOperationKey
        ? 'matched' as const
        : 'new-operation-proposal' as const;
  return {
    caseId: exchange.caseId,
    route: exchange.route,
    method,
    path,
    ...(exchange.status === undefined ? {} : { status: exchange.status }),
    evidencePath: exchange.evidencePath,
    evidenceQuality,
    disposition,
    ...(matchedOperationKey ? { matchedOperationKey } : {}),
    operationKeyCandidate: exchange.operationKey ?? `observed:${method} ${path}`,
    requestShape,
    responseShape,
    conflicts,
  };
}

function normalizePath(value: string): string {
  if (!value) return '';
  let pathname = value;
  try {
    pathname = decodeURIComponent(new URL(value, 'https://local.invalid').pathname);
  } catch {
    pathname = value.split(/[?#]/, 1)[0];
  }
  const servicePath = pathname.replace(/^\/(?:item|platform-item)\/v\d+(?=\/)/i, '');
  return servicePath.split('/').map((segment) => {
    if (/^\{[^}]+\}$/.test(segment) || /^\d+$/.test(segment) || /^[a-f0-9]{16,}$/i.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':id';
    return segment;
  }).join('/');
}

function shapeOf(value: unknown, prefix = ''): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.length === 0 ? [`${prefix}[]`] : shapeOf(value[0], `${prefix}[]`);
  if (typeof value !== 'object') return [prefix || typeof value];
  return Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, child]) => shapeOf(child, prefix ? `${prefix}.${key}` : key));
}

function scrubSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.length === 0 ? [] : [scrubSecrets(value[0])];
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return '<string>';
  if (typeof value === 'number') return 0;
  if (typeof value === 'boolean') return false;
  if (typeof value !== 'object') return `<${typeof value}>`;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/(token|secret|password|cookie|authorization|credential)/i.test(key))
    .map(([key, child]) => [key, scrubSecrets(child)]));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
