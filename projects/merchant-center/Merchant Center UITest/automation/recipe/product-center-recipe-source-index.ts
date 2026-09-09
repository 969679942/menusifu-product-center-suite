import { createHash } from 'node:crypto';
import {
  productCenterContractCollections,
  stableStringify,
  type EvidenceRecord,
  type ProductCenterTestContract,
} from '../../utils/product-center-test-contract';

export type ProductCenterRecipeSourceEntry = {
  caseId: string;
  traceabilityId: string;
  route: string;
  sourceIds: string[];
  legacySourceAliases: string[];
  stageGaps: string[];
};

export type ProductCenterRecipeSourceUnresolved = {
  caseId: string;
  traceabilityIds: string[];
  sourceIds: string[];
  reasonCode:
    | 'CASE_ID_MISSING'
    | 'AMBIGUOUS_TRACEABILITY'
    | 'SOURCE_CHAIN_EMPTY'
    | 'MISSING_SOURCE_RECORD'
    | 'STAGE_GAP';
  message: string;
};

export type ProductCenterRecipeSourceIndex = {
  schemaVersion: '1.0.0';
  contractVersion: string;
  fingerprint: string;
  entries: ProductCenterRecipeSourceEntry[];
  unresolved: ProductCenterRecipeSourceUnresolved[];
};

const sourceEvidenceKeys = [
  'requirementIds',
  'routeIds',
  'functionIds',
  'apiMappingIds',
  'sourceIds',
] as const;

export function buildProductCenterRecipeSourceIndex(
  contract: ProductCenterTestContract,
): ProductCenterRecipeSourceIndex {
  const entries: ProductCenterRecipeSourceEntry[] = [];
  const unresolved: ProductCenterRecipeSourceUnresolved[] = [];
  const traceabilityByCase = new Map<string, EvidenceRecord[]>();

  for (const traceability of contract.traceability ?? []) {
    const caseId = stringValue(traceability.evidence.caseId);
    if (!caseId) {
      unresolved.push({
        caseId: traceability.id,
        traceabilityIds: [traceability.id],
        sourceIds: [],
        reasonCode: 'CASE_ID_MISSING',
        message: `追溯记录缺少 caseId：${traceability.id}`,
      });
      continue;
    }
    const matches = traceabilityByCase.get(caseId) ?? [];
    matches.push(traceability);
    traceabilityByCase.set(caseId, matches);
  }

  const knownSourceIds = collectKnownSourceIds(contract);
  for (const [caseId, traceabilityRecords] of [...traceabilityByCase.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const traceabilityIds = traceabilityRecords.map((record) => record.id).sort();
    if (traceabilityRecords.length !== 1) {
      unresolved.push({
        caseId,
        traceabilityIds,
        sourceIds: [],
        reasonCode: 'AMBIGUOUS_TRACEABILITY',
        message: `caseId ${caseId} 对应 ${traceabilityRecords.length} 条追溯记录`,
      });
      continue;
    }

    const traceability = traceabilityRecords[0];
    const sourceChain = collectTraceabilitySourceIds(traceability, knownSourceIds);
    const sourceIds = sourceChain.sourceIds;
    const stageGaps = stringArray(traceability.evidence.stageGaps);
    if (stageGaps.length > 0) {
      unresolved.push({
        caseId,
        traceabilityIds,
        sourceIds,
        reasonCode: 'STAGE_GAP',
        message: `caseId ${caseId} 存在阶段缺口：${stageGaps.join(', ')}`,
      });
      continue;
    }
    if (sourceIds.length === 0) {
      unresolved.push({
        caseId,
        traceabilityIds,
        sourceIds,
        reasonCode: 'SOURCE_CHAIN_EMPTY',
        message: `caseId ${caseId} 没有真实合同来源`,
      });
      continue;
    }
    const missingSourceIds = sourceIds.filter((sourceId) => !knownSourceIds.has(sourceId));
    if (missingSourceIds.length > 0) {
      unresolved.push({
        caseId,
        traceabilityIds,
        sourceIds: missingSourceIds,
        reasonCode: 'MISSING_SOURCE_RECORD',
        message: `caseId ${caseId} 引用了不存在的合同记录：${missingSourceIds.join(', ')}`,
      });
      continue;
    }

    entries.push({
      caseId,
      traceabilityId: traceability.id,
      route: traceability.route ?? '',
      sourceIds,
      legacySourceAliases: sourceChain.legacySourceAliases,
      stageGaps,
    });
  }

  const normalizedEntries = entries.sort((left, right) => left.caseId.localeCompare(right.caseId));
  const normalizedUnresolved = unresolved.sort((left, right) => left.caseId.localeCompare(right.caseId));
  const fingerprint = createHash('sha256')
    .update(stableStringify({ entries: normalizedEntries, unresolved: normalizedUnresolved }))
    .digest('hex');

  return {
    schemaVersion: '1.0.0',
    contractVersion: contract.metadata.contractVersion,
    fingerprint,
    entries: normalizedEntries,
    unresolved: normalizedUnresolved,
  };
}

function collectKnownSourceIds(contract: ProductCenterTestContract): Set<string> {
  return new Set(productCenterContractCollections
    .filter((collection) => collection !== 'traceability')
    .flatMap((collection) => (contract[collection] ?? []).map((record) => record.id)));
}

function collectTraceabilitySourceIds(
  traceability: EvidenceRecord,
  knownSourceIds: ReadonlySet<string>,
): { sourceIds: string[]; legacySourceAliases: string[] } {
  const sourceIds = new Set<string>();
  const legacySourceAliases = new Set<string>();
  for (const rawSourceId of sourceEvidenceKeys.flatMap((key) => stringArray(traceability.evidence[key]))) {
    const normalizedSourceId = rawSourceId.startsWith('field-constraint:')
      ? rawSourceId.slice('field-constraint:'.length)
      : rawSourceId;
    if (knownSourceIds.has(normalizedSourceId)) {
      sourceIds.add(normalizedSourceId);
    } else if (rawSourceId.startsWith('runtime-negative-contract:')) {
      legacySourceAliases.add(rawSourceId);
    } else {
      sourceIds.add(normalizedSourceId);
    }
  }
  return {
    sourceIds: [...sourceIds].sort((left, right) => left.localeCompare(right)),
    legacySourceAliases: [...legacySourceAliases].sort((left, right) => left.localeCompare(right)),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
