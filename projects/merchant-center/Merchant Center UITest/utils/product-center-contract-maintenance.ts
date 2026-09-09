import { createHash } from 'node:crypto';
import type { ProductCenterProductionSopDescriptor } from '../sop/product-center/product-center-sop-generator';
import type { ProductCenterContractCurationSource, ProductCenterContractModule } from '../contracts/product-center/modules';
import {
  productCenterContractCollections,
  stableStringify,
  type EvidenceRecord,
  type ProductCenterContractCollection,
  type ProductCenterTestContract,
} from './product-center-test-contract';

type RecordReference = {
  key: string;
  id: string;
  collection: ProductCenterContractCollection;
  moduleIds: string[];
  route?: string;
  entity?: string;
};

type ModuleView = {
  metadata: {
    moduleId: string;
    moduleName: string;
    levelOne: string;
    routes: readonly string[];
    recordCount: number;
  };
  collections: Partial<Record<ProductCenterContractCollection, EvidenceRecord[]>>;
};

export type ProductCenterMaintenanceArtifacts = {
  manifest: {
    contractVersion: string;
    sourceFingerprint: string;
    modules: Array<{ id: string; name: string; levelOne: string; routes: number; records: number }>;
    sharedRecords: number;
  };
  moduleViews: Record<string, ModuleView>;
  sharedView: ModuleView;
  indexes: {
    byId: Record<string, RecordReference>;
    byRoute: Record<string, { moduleId: string; records: RecordReference[] }>;
    byEntity: Record<string, { moduleIds: string[]; records: RecordReference[] }>;
    byModule: Record<string, RecordReference[]>;
    byApiOperation: Record<string, { record: RecordReference; service?: string; path?: string; moduleIds: string[] }>;
  };
  snapshot: {
    contractVersion: string;
    sourceFingerprint: string;
    records: Array<{ key: string; sha256: string }>;
  };
  recordsByKey: Record<string, EvidenceRecord>;
};

export function validateProductCenterModuleRegistry(
  modules: readonly ProductCenterContractModule[],
  contract: ProductCenterTestContract,
  descriptors: readonly ProductCenterProductionSopDescriptor[],
): string[] {
  const errors: string[] = [];
  const moduleIds = new Set<string>();
  const routeOwners = new Map<string, string>();
  for (const module of modules) {
    if (moduleIds.has(module.id)) errors.push(`重复模块 ID：${module.id}`);
    moduleIds.add(module.id);
    for (const route of module.routes) {
      const owner = routeOwners.get(route);
      if (owner) errors.push(`路由重复归属：${route} -> ${owner},${module.id}`);
      routeOwners.set(route, module.id);
    }
  }
  const contractRoutes = new Set((contract.routes ?? []).map((record) => record.route).filter((route): route is string => Boolean(route)));
  for (const route of contractRoutes) if (!routeOwners.has(route)) errors.push(`合同路由未归属：${route}`);
  for (const route of routeOwners.keys()) if (!contractRoutes.has(route)) errors.push(`模块路由无合同证据：${route}`);
  for (const descriptor of descriptors) if (!routeOwners.has(descriptor.route)) errors.push(`SOP 未归属模块：${descriptor.id}`);
  return errors.sort();
}

export function buildProductCenterMaintenanceArtifacts(
  contract: ProductCenterTestContract,
  modules: readonly ProductCenterContractModule[],
): ProductCenterMaintenanceArtifacts {
  const routeOwner = new Map(modules.flatMap((module) => module.routes.map((route) => [route, module.id] as const)));
  const aliasOwners = new Map<string, Set<string>>();
  for (const module of modules) {
    for (const aliases of Object.values(module.routeAliases)) {
      for (const route of aliases) addSet(aliasOwners, route, module.id);
    }
  }
  const entityOwners = new Map<string, Set<string>>();
  modules.forEach((module) => module.entities.forEach((entity) => addSet(entityOwners, entity, module.id)));
  const operationOwners = buildOperationOwners(contract, routeOwner, aliasOwners);
  const recordsByKey: Record<string, EvidenceRecord> = {};
  const references: RecordReference[] = [];

  for (const collection of productCenterContractCollections) {
    for (const record of contract[collection] ?? []) {
      const key = `${collection}:${record.id}`;
      const moduleIds = resolveRecordModules(record, collection, modules, routeOwner, aliasOwners, entityOwners, operationOwners);
      recordsByKey[key] = record;
      references.push({ key, id: record.id, collection, moduleIds, route: record.route, entity: record.entity });
    }
  }

  const moduleViews = Object.fromEntries(modules.map((module) => [
    module.id,
    buildView(module.id, module.name, module.levelOne, module.routes, references.filter((reference) => reference.moduleIds.includes(module.id)), recordsByKey),
  ]));
  const sharedReferences = references.filter((reference) => reference.moduleIds.length === 0);
  const sharedView = buildView('shared', '共享合同', '共享', [], sharedReferences, recordsByKey);
  const byId = Object.fromEntries(references.map((reference) => [reference.key, reference]));
  const byRoute = Object.fromEntries(modules.flatMap((module) => module.routes.map((route) => [
    route,
    { moduleId: module.id, records: references.filter((reference) => reference.route === route) },
  ])));
  const byEntity = Object.fromEntries([...entityOwners.entries()].map(([entity, moduleIds]) => [
    entity,
    { moduleIds: [...moduleIds].sort(), records: references.filter((reference) => reference.entity === entity) },
  ]));
  const byModule: Record<string, RecordReference[]> = {
    ...Object.fromEntries(modules.map((module) => [module.id, references.filter((reference) => reference.moduleIds.includes(module.id))])),
    shared: sharedReferences,
  };
  const byApiOperation = buildApiOperationIndex(contract, references, operationOwners);
  const snapshotRecords = references.map((reference) => ({
    key: reference.key,
    sha256: createHash('sha256').update(stableStringify(recordsByKey[reference.key])).digest('hex'),
  })).sort((left, right) => left.key.localeCompare(right.key));

  return {
    manifest: {
      contractVersion: contract.metadata.contractVersion,
      sourceFingerprint: contract.metadata.sourceFingerprint,
      modules: modules.map((module) => ({
        id: module.id,
        name: module.name,
        levelOne: module.levelOne,
        routes: module.routes.length,
        records: byModule[module.id].length,
      })),
      sharedRecords: sharedReferences.length,
    },
    moduleViews,
    sharedView,
    indexes: { byId, byRoute, byEntity, byModule, byApiOperation },
    snapshot: {
      contractVersion: contract.metadata.contractVersion,
      sourceFingerprint: contract.metadata.sourceFingerprint,
      records: snapshotRecords,
    },
    recordsByKey,
  };
}

export function applyProductCenterModuleCurations<T extends ProductCenterContractCurationSource>(
  contract: ProductCenterTestContract,
  modules: readonly T[],
): ProductCenterTestContract {
  const curated = structuredClone(contract);
  for (const module of modules) {
    for (const override of module.curations?.overrides ?? []) {
      const records = curated[override.collection] ?? [];
      const index = records.findIndex((record) => record.id === override.id);
      if (index < 0) throw new Error(`模块覆盖目标不存在：${module.id}:${override.collection}:${override.id}`);
      records[index] = mergeEvidenceRecord(records[index], override.patch, override.reason, override.source);
      curated[override.collection] = records;
    }
    for (const addition of module.curations?.additions ?? []) {
      const records = curated[addition.collection] ?? [];
      if (records.some((record) => record.id === addition.record.id)) {
        throw new Error(`模块补充记录 ID 已存在：${module.id}:${addition.collection}:${addition.record.id}`);
      }
      records.push(addition.record as EvidenceRecord);
      curated[addition.collection] = records;
    }
    for (const tombstone of module.curations?.tombstones ?? []) {
      if (!tombstone.reviewedBy.trim()) throw new Error(`模块墓碑缺少审核人：${module.id}:${tombstone.id}`);
      curated[tombstone.collection] = (curated[tombstone.collection] ?? []).filter((record) => record.id !== tombstone.id);
    }
  }
  return curated;
}

export function queryProductCenterContract(
  artifacts: ProductCenterMaintenanceArtifacts,
  query: { moduleId?: string; route?: string; entity?: string; id?: string; operationKey?: string },
): { moduleIds: string[]; records: EvidenceRecord[] } {
  let references: RecordReference[] = [];
  if (query.moduleId) references = artifacts.indexes.byModule[query.moduleId] ?? [];
  else if (query.route) references = artifacts.indexes.byRoute[query.route]?.records ?? [];
  else if (query.entity) references = artifacts.indexes.byEntity[query.entity]?.records ?? [];
  else if (query.operationKey) references = artifacts.indexes.byApiOperation[query.operationKey] ? [artifacts.indexes.byApiOperation[query.operationKey].record] : [];
  else if (query.id) references = Object.values(artifacts.indexes.byId).filter((reference) => reference.id === query.id || reference.key === query.id);
  const moduleIds = query.moduleId
    ? [query.moduleId]
    : [...new Set(references.flatMap((reference) => reference.moduleIds.length ? reference.moduleIds : ['shared']))].sort();
  return { moduleIds, records: references.map((reference) => artifacts.recordsByKey[reference.key]) };
}

export function buildProductCenterReleaseRecord(
  contract: ProductCenterTestContract,
  input: { reviewedBy: string; version: string; note?: string; releasedAt?: string },
) {
  if (!input.reviewedBy.trim()) throw new Error('缺少人工审核人');
  if (input.version !== contract.metadata.contractVersion) throw new Error('发布版本与当前合同不一致');
  return {
    version: input.version,
    releasedAt: input.releasedAt ?? new Date().toISOString(),
    reviewedBy: input.reviewedBy.trim(),
    note: input.note?.trim() ?? '',
    sourceFingerprint: contract.metadata.sourceFingerprint,
    collectionCounts: contract.metadata.counts,
    sensitiveDataIncluded: false,
  };
}

function resolveRecordModules(
  record: EvidenceRecord,
  collection: ProductCenterContractCollection,
  modules: readonly ProductCenterContractModule[],
  routeOwner: Map<string, string>,
  aliasOwners: Map<string, Set<string>>,
  entityOwners: Map<string, Set<string>>,
  operationOwners: Map<string, Set<string>>,
): string[] {
  const owners = new Set<string>();
  if (record.route) {
    const directOwner = routeOwner.get(record.route);
    if (directOwner) owners.add(directOwner);
    aliasOwners.get(record.route)?.forEach((owner) => owners.add(owner));
  }
  if (record.entity) entityOwners.get(record.entity)?.forEach((owner) => owners.add(owner));
  if (collection === 'businessRules' && record.module) {
    modules.filter((module) => module.ruleModulePrefixes.some((prefix) => record.module?.startsWith(prefix)))
      .forEach((module) => owners.add(module.id));
  }
  if (collection === 'apiOperations') {
    const operationKey = String(record.evidence.operationKey ?? '');
    operationOwners.get(operationKey)?.forEach((owner) => owners.add(owner));
  }
  return [...owners].sort();
}

function buildOperationOwners(
  contract: ProductCenterTestContract,
  routeOwner: Map<string, string>,
  aliasOwners: Map<string, Set<string>>,
): Map<string, Set<string>> {
  const owners = new Map<string, Set<string>>();
  for (const mapping of contract.uiApiMappings ?? []) {
    const operationKey = mapping.evidence.operationKey;
    if (typeof operationKey !== 'string' || !mapping.route) continue;
    const directOwner = routeOwner.get(mapping.route);
    if (directOwner) addSet(owners, operationKey, directOwner);
    aliasOwners.get(mapping.route)?.forEach((owner) => addSet(owners, operationKey, owner));
  }
  return owners;
}

function buildApiOperationIndex(
  contract: ProductCenterTestContract,
  references: RecordReference[],
  operationOwners: Map<string, Set<string>>,
) {
  const operationReferences = new Map(references.filter((reference) => reference.collection === 'apiOperations').map((reference) => [reference.id, reference]));
  return Object.fromEntries((contract.apiOperations ?? []).map((record) => {
    const operationKey = String(record.evidence.operationKey ?? '');
    const reference = operationReferences.get(record.id)!;
    return [operationKey, {
      record: reference,
      service: typeof record.evidence.service === 'string' ? record.evidence.service : undefined,
      path: typeof record.evidence.path === 'string' ? record.evidence.path : undefined,
      moduleIds: [...(operationOwners.get(operationKey) ?? [])].sort(),
    }];
  }));
}

function buildView(
  moduleId: string,
  moduleName: string,
  levelOne: string,
  routes: readonly string[],
  references: RecordReference[],
  recordsByKey: Record<string, EvidenceRecord>,
): ModuleView {
  return {
    metadata: { moduleId, moduleName, levelOne, routes, recordCount: references.length },
    collections: Object.fromEntries(productCenterContractCollections.map((collection) => [
      collection,
      references.filter((reference) => reference.collection === collection).map((reference) => recordsByKey[reference.key]),
    ])),
  };
}

function addSet(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}

function mergeEvidenceRecord(
  record: EvidenceRecord,
  patch: Record<string, unknown>,
  reason: string,
  source: { path: string; locator?: string },
): EvidenceRecord {
  const next = { ...record, ...patch } as EvidenceRecord;
  if (patch.evidence && typeof patch.evidence === 'object') {
    next.evidence = { ...record.evidence, ...(patch.evidence as Record<string, unknown>) };
  }
  next.source = [...record.source, source];
  next.curation = { reason, source };
  return next;
}
