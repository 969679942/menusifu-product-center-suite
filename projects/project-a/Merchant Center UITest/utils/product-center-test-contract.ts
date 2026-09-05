import { createHash } from 'node:crypto';

export const productCenterContractCollections = [
  'routes',
  'controls',
  'fields',
  'dialogs',
  'validations',
  'apiOperations',
  'uiApiMappings',
  'businessRules',
  'testDataFactories',
  'cleanupAdapters',
  'assertions',
  'traceability',
  'unresolved',
] as const;

export type ProductCenterContractCollection = typeof productCenterContractCollections[number];
export type EvidenceStatus =
  | 'observed'
  | 'confirmed'
  | 'provisional'
  | 'inferred'
  | 'blocked'
  | 'unresolved'
  | 'not-applicable'
  | 'generated';

export type EvidenceRecord = {
  id: string;
  status: EvidenceStatus;
  sourceType: string;
  confidence: number;
  generationAllowed: boolean;
  source: Array<{ path: string; locator?: string; sha256?: string }>;
  verifiedAt: string;
  version: string;
  route?: string;
  entity?: string;
  module?: string;
  evidence: Record<string, unknown>;
  conflictStatus?: 'none' | 'open' | 'resolved';
  [key: string]: unknown;
};

export type ProductCenterContractMetadata = {
  contractVersion: string;
  generatedAt: string;
  sourceFingerprint: string;
  sourcePriority: string[];
  sourceArtifacts: string[];
  collections: ProductCenterContractCollection[];
  counts: Partial<Record<ProductCenterContractCollection, number>>;
};

export type ProductCenterTestContract = {
  metadata: ProductCenterContractMetadata;
} & Partial<Record<ProductCenterContractCollection, EvidenceRecord[]>>;

export type UpstreamContract = {
  metadata?: Record<string, unknown>;
} & Partial<Record<ProductCenterContractCollection, readonly EvidenceRecord[]>>;

type SopDescriptor = {
  id: string;
  entityKey: string;
  entityName: string;
  route: string;
  action: string;
  scenario?: string;
  sourceIds?: readonly string[];
  seedMode: string;
  cleanupMode: string;
  verifyModes: readonly string[];
  specFile: string;
  testTitle: string;
  rerunGrep: string;
};

export type ContractValidationError = {
  code: 'DUPLICATE_ID' | 'MISSING_METADATA' | 'INVALID_GENERATION_FLAG' | 'INVALID_CONFIDENCE';
  collection: string;
  recordId?: string;
  message: string;
};

const sourcePriority = [
  'ui-api-runtime',
  'reproducible-api-probe',
  'openapi-postman',
  'confirmed-prd-formal-case',
  'design-standard-br-traceability',
  'xmind-history',
  'unverified-ai-rule',
];

const generationStatuses = new Set<EvidenceStatus>(['observed', 'confirmed']);

export function buildProductCenterTestContract(input: {
  upstream: UpstreamContract;
  descriptors: readonly SopDescriptor[];
  version: string;
  verifiedAt: string;
  requirementRefs?: Readonly<Record<string, readonly string[]>>;
  routeAliases?: Readonly<Record<string, readonly string[]>>;
  sourceContext?: unknown;
}): ProductCenterTestContract {
  const normalizedCollections = Object.fromEntries(productCenterContractCollections.map((collection) => {
    const seenIds = new Map<string, number>();
    const records = (input.upstream[collection] ?? []).map((record) => {
      const normalized = normalizeRecord(record, input.version, input.verifiedAt);
      const occurrence = (seenIds.get(normalized.id) ?? 0) + 1;
      seenIds.set(normalized.id, occurrence);
      return occurrence === 1
        ? normalized
        : { ...normalized, id: `${normalized.id}~${occurrence}`, originalId: normalized.id };
    });
    return [collection, records.sort((left, right) => left.id.localeCompare(right.id))];
  })) as Record<ProductCenterContractCollection, EvidenceRecord[]>;

  normalizedCollections.traceability = input.descriptors
    .map((descriptor) => buildSopTraceability(
      descriptor,
      normalizedCollections,
      input.version,
      input.verifiedAt,
      input.requirementRefs?.[descriptor.entityName] ?? [],
      input.routeAliases?.[descriptor.route] ?? [],
    ))
    .sort((left, right) => left.id.localeCompare(right.id));

  const sourceArtifacts = [...new Set(productCenterContractCollections.flatMap((collection) =>
    normalizedCollections[collection].flatMap((record) => record.source.map((item) => item.path)),
  ))].sort();
  const fingerprintInput = {
    upstream: deepSanitize(input.upstream),
    descriptors: deepSanitize(input.descriptors),
    version: input.version,
    verifiedAt: input.verifiedAt,
    sourceContext: input.sourceContext ?? null,
  };

  return {
    metadata: {
      contractVersion: input.version,
      generatedAt: input.verifiedAt,
      sourceFingerprint: sha256(stableStringify(fingerprintInput)),
      sourcePriority,
      sourceArtifacts,
      collections: [...productCenterContractCollections],
      counts: Object.fromEntries(productCenterContractCollections.map((collection) => [
        collection,
        normalizedCollections[collection].length,
      ])),
    },
    ...normalizedCollections,
  };
}

export function validateProductCenterTestContract(contract: ProductCenterTestContract): ContractValidationError[] {
  const errors: ContractValidationError[] = [];
  const ids = new Set<string>();
  for (const collection of contract.metadata.collections) {
    for (const record of contract[collection] ?? []) {
      if (!record.id || !record.status || !record.sourceType || !record.source?.length || !record.verifiedAt || !record.version) {
        errors.push({ code: 'MISSING_METADATA', collection, recordId: record.id, message: '记录缺少来源或版本元数据' });
      }
      const scopedId = `${collection}:${record.id}`;
      if (ids.has(scopedId)) {
        errors.push({ code: 'DUPLICATE_ID', collection, recordId: record.id, message: '集合内存在重复 ID' });
      }
      ids.add(scopedId);
      if (record.generationAllowed && (!generationStatuses.has(record.status) || record.conflictStatus === 'open')) {
        errors.push({ code: 'INVALID_GENERATION_FLAG', collection, recordId: record.id, message: '未确认或冲突记录不得生成断言' });
      }
      if (record.confidence < 0 || record.confidence > 1) {
        errors.push({ code: 'INVALID_CONFIDENCE', collection, recordId: record.id, message: '置信度必须位于 0 到 1' });
      }
    }
  }
  return errors;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function normalizeRecord(record: EvidenceRecord, version: string, verifiedAt: string): EvidenceRecord {
  const sanitized = deepSanitize(record) as EvidenceRecord;
  return {
    ...sanitized,
    generationAllowed: generationStatuses.has(sanitized.status)
      && sanitized.conflictStatus !== 'open'
      && sanitized.generationAllowed,
    source: (sanitized.source ?? []).map((source) => ({ ...source, path: normalizeSourcePath(source.path) })),
    verifiedAt,
    version,
    evidence: (sanitized.evidence ?? {}) as Record<string, unknown>,
  };
}

function buildSopTraceability(
  descriptor: SopDescriptor,
  collections: Record<ProductCenterContractCollection, EvidenceRecord[]>,
  version: string,
  verifiedAt: string,
  requirementRefs: readonly string[],
  routeAliases: readonly string[],
): EvidenceRecord {
  const matchingRoutes = new Set([descriptor.route, ...routeAliases]);
  const routeRecords = collections.routes.filter((record) => record.route && matchingRoutes.has(record.route)).map((record) => record.id);
  const functionRecords = collections.controls.filter((record) => record.route && matchingRoutes.has(record.route)).map((record) => record.id);
  const mappingRecords = collections.uiApiMappings.filter((record) => record.route && matchingRoutes.has(record.route)).map((record) => record.id);
  const ruleRecords = collections.businessRules
    .filter((record) => record.entity === descriptor.entityName || record.module?.includes(descriptor.entityName))
    .map((record) => record.id);
  return {
    id: `trace:sop:${descriptor.id}`,
    status: 'generated',
    sourceType: 'generated',
    confidence: 1,
    generationAllowed: false,
    source: [{ path: `sop://${descriptor.id}`, locator: descriptor.testTitle }],
    verifiedAt,
    version,
    route: descriptor.route,
    entity: descriptor.entityName,
    evidence: {
      requirementIds: ruleRecords,
      requirementRefs,
      routeIds: routeRecords,
      functionIds: functionRecords,
      apiMappingIds: mappingRecords,
      stageGaps: [
        ...(requirementRefs.length === 0 ? ['prd-requirement-reference'] : []),
        ...(mappingRecords.length === 0 ? ['ui-api-operation-mapping'] : []),
      ],
      caseId: descriptor.id,
      sourceIds: descriptor.sourceIds ?? [],
      sop: {
        action: descriptor.action,
        scenario: descriptor.scenario ?? null,
        seedMode: descriptor.seedMode,
        verifyModes: descriptor.verifyModes,
        cleanupMode: descriptor.cleanupMode,
      },
      automation: { specFile: descriptor.specFile, testTitle: descriptor.testTitle, rerunGrep: descriptor.rerunGrep },
      resultRef: 'contracts/product-center/product-center-production-sop-acceptance.json',
    },
  };
}

function deepSanitize(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) return value.map((item) => deepSanitize(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => {
      if (/(password|token|cookie|authorization|storageState)/i.test(childKey)) return [childKey, '[REDACTED]'];
      return [childKey, deepSanitize(childValue, childKey)];
    }));
  }
  if (typeof value === 'string') {
    if (/(password|token|cookie|authorization)/i.test(key)) return '[REDACTED]';
    return normalizeSourcePath(value);
  }
  return value;
}

function normalizeSourcePath(value: string): string {
  return value
    .replace(/D:\\Menusifu\\Merchant Center/gi, 'merchant-center:')
    .replace(/D:\\Menusifu\\TestOps/gi, 'testops:')
    .replace(/\\/g, '/');
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortValue(child)]));
  }
  return value;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
