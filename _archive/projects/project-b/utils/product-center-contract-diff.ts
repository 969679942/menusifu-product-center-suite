import { createHash } from 'node:crypto';
import { planContractChangeImpact, type ImpactedCase } from './contract-change-impact';
import {
  stableStringify,
  type EvidenceRecord,
  type ProductCenterContractCollection,
  type ProductCenterTestContract,
} from './product-center-test-contract';

type ContractChange = {
  collection: ProductCenterContractCollection;
  id: string;
  kind: 'added' | 'removed' | 'changed';
  route?: string;
  beforeHash?: string;
  afterHash?: string;
};

export type ProductCenterContractDiff = {
  fromVersion: string;
  toVersion: string;
  metadataChanged: boolean;
  summary: { added: number; removed: number; changed: number; unchanged: number };
  changes: ContractChange[];
  impactedRoutes: string[];
  impactedCases: string[];
  impactedCaseDetails: ImpactedCase[];
};

export function diffProductCenterContracts(
  before: ProductCenterTestContract,
  after: ProductCenterTestContract,
): ProductCenterContractDiff {
  const collections = [...new Set([...before.metadata.collections, ...after.metadata.collections])].sort();
  const changes: ContractChange[] = [];
  let unchanged = 0;

  for (const collection of collections) {
    const beforeRecords = byId(before[collection] ?? []);
    const afterRecords = byId(after[collection] ?? []);
    const ids = [...new Set([...beforeRecords.keys(), ...afterRecords.keys()])].sort();
    for (const id of ids) {
      const previous = beforeRecords.get(id);
      const current = afterRecords.get(id);
      if (!previous && current) changes.push(change(collection, id, 'added', undefined, current));
      else if (previous && !current) changes.push(change(collection, id, 'removed', previous));
      else if (previous && current && recordHash(previous) !== recordHash(current)) {
        changes.push(change(collection, id, 'changed', previous, current));
      } else unchanged += 1;
    }
  }

  const impactedRoutes = [...new Set(
    changes
      .filter((item) => item.collection !== 'traceability')
      .map((item) => item.route)
      .filter((route): route is string => Boolean(route)),
  )].sort();
  const impactedCaseDetails = planContractChangeImpact(
    changes,
    (after.traceability ?? []).flatMap((record) => {
      const caseId = record.evidence.caseId;
      if (typeof caseId !== 'string') return [];
      const sourceIds = Array.isArray(record.evidence.sourceIds)
        ? record.evidence.sourceIds.filter((sourceId): sourceId is string => typeof sourceId === 'string')
        : [];
      return [{ caseId, route: record.route, sourceIds }];
    }),
  );

  return {
    fromVersion: before.metadata.contractVersion,
    toVersion: after.metadata.contractVersion,
    metadataChanged: before.metadata.sourceFingerprint !== after.metadata.sourceFingerprint,
    summary: {
      added: changes.filter((item) => item.kind === 'added').length,
      removed: changes.filter((item) => item.kind === 'removed').length,
      changed: changes.filter((item) => item.kind === 'changed').length,
      unchanged,
    },
    changes,
    impactedRoutes,
    impactedCases: impactedCaseDetails.map((item) => item.caseId),
    impactedCaseDetails,
  };
}

function byId(records: EvidenceRecord[]): Map<string, EvidenceRecord> {
  return new Map(records.map((record) => [record.id, record]));
}

function change(
  collection: ProductCenterContractCollection,
  id: string,
  kind: ContractChange['kind'],
  before?: EvidenceRecord,
  after?: EvidenceRecord,
): ContractChange {
  return {
    collection,
    id,
    kind,
    route: after?.route ?? before?.route,
    ...(before ? { beforeHash: recordHash(before) } : {}),
    ...(after ? { afterHash: recordHash(after) } : {}),
  };
}

function recordHash(record: EvidenceRecord): string {
  const stableRecord = { ...record, verifiedAt: undefined, version: undefined };
  return createHash('sha256').update(stableStringify(stableRecord)).digest('hex');
}
