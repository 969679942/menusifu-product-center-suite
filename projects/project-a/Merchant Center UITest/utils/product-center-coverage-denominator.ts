import type {
  EvidenceRecord,
  ProductCenterTestContract,
} from './product-center-test-contract';
import type { ProductCenterTestCaseInput, ProductCenterTestCasePriority } from './product-center-test-case-ir';

export type ProductCenterCoverageKind = 'route' | 'control' | 'dialog' | 'validation' | 'state' | 'role' | 'data-relation' | 'result';
export type ProductCenterCoverageDisposition = 'required' | 'blocked' | 'not-applicable';

export type ProductCenterCoverageItem = {
  id: string;
  kind: ProductCenterCoverageKind;
  module: string;
  route: string;
  sourceIds: string[];
  priority: ProductCenterTestCasePriority;
  disposition: ProductCenterCoverageDisposition;
  reason?: string;
};

export type ProductCenterCoverageGroup = ProductCenterCoverageItem;

export type ProductCenterCoverageMatchingMode = 'explicit-only' | 'explicit-or-source';

export function buildProductCenterCoverageDenominator(
  contract: ProductCenterTestContract,
  options: {
    moduleForRoute?: (route: string) => string;
    coverageGroups?: readonly ProductCenterCoverageGroup[];
  } = {},
) {
  const collections = [
    ['controls', 'control', 'P1'],
    ['dialogs', 'dialog', 'P1'],
    ['routes', 'route', 'P0'],
    ['validations', 'validation', 'P0'],
  ] as const;
  const items = collections.flatMap(([collection, kind, priority]) =>
    (contract[collection] ?? [])
      .filter((record) => record.generationAllowed || record.status === 'blocked' || record.status === 'not-applicable')
      .map((record) => coverageItem(record, kind, priority, options.moduleForRoute)));
  const groups = options.coverageGroups ?? [];
  const rawIds = new Set(items.flatMap((item) => item.sourceIds));
  const consumedSourceIds = new Set<string>();
  for (const group of groups) {
    for (const sourceId of group.sourceIds) {
      if (!rawIds.has(sourceId)) {
        throw new Error(`覆盖归并引用了不存在的原始来源：${group.id} -> ${sourceId}`);
      }
      if (consumedSourceIds.has(sourceId)) {
        throw new Error(`原始来源不得被多个覆盖归并重复消费：${sourceId}`);
      }
      consumedSourceIds.add(sourceId);
    }
  }
  const curatedItems = [
    ...items.filter((item) => !item.sourceIds.some((sourceId) => consumedSourceIds.has(sourceId))),
    ...groups.map((group) => ({ ...group, sourceIds: [...group.sourceIds] })),
  ];
  const duplicateIds = findDuplicateIds(curatedItems.map((item) => item.id));
  if (duplicateIds.length > 0) {
    throw new Error(`覆盖分母 ID 重复：${duplicateIds.join(', ')}`);
  }
  return {
    schemaVersion: '1.0.0' as const,
    contractVersion: contract.metadata.contractVersion,
    sourceFingerprint: contract.metadata.sourceFingerprint,
    items: curatedItems.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function auditProductCenterCoverage(
  cases: readonly ProductCenterTestCaseInput[],
  denominator: readonly ProductCenterCoverageItem[],
  options: { matchingMode?: ProductCenterCoverageMatchingMode } = {},
) {
  const referencedCoverageIds = new Set(cases.flatMap((item) => item.coverageIds ?? []));
  const referencedSourceIds = new Set(cases.flatMap((item) => item.sourceIds));
  const requiredItems = denominator.filter((item) => item.disposition === 'required');
  const matchingMode = options.matchingMode ?? 'explicit-or-source';
  const covered = requiredItems.filter((item) => referencedCoverageIds.has(item.id)
    || (matchingMode === 'explicit-or-source'
      && item.sourceIds.some((sourceId) => referencedSourceIds.has(sourceId))));
  const missing = requiredItems.filter((item) => !covered.includes(item));
  const knownCoverageIds = new Set(denominator.map((item) => item.id));
  const unknownCoverageIds = [...referencedCoverageIds]
    .filter((coverageId) => !knownCoverageIds.has(coverageId))
    .sort((left, right) => left.localeCompare(right));
  const required = requiredItems.length;
  return {
    summary: {
      required,
      covered: covered.length,
      missing: missing.length,
      blocked: denominator.filter((item) => item.disposition === 'blocked').length,
      notApplicable: denominator.filter((item) => item.disposition === 'not-applicable').length,
      coverageRate: required === 0 ? 1 : covered.length / required,
    },
    covered,
    missing,
    unknownCoverageIds,
  };
}

export function selectProductCenterCoverageDenominator(
  denominator: readonly ProductCenterCoverageItem[],
  target: {
    moduleIds: ReadonlySet<string>;
    routes?: ReadonlySet<string>;
  },
): ProductCenterCoverageItem[] {
  return denominator.filter((item) => target.moduleIds.has(item.module)
    && (!target.routes || target.routes.has(item.route)));
}

function coverageItem(
  record: EvidenceRecord,
  kind: ProductCenterCoverageKind,
  priority: ProductCenterTestCasePriority,
  moduleForRoute?: (route: string) => string,
): ProductCenterCoverageItem {
  const route = record.route ?? '';
  const disposition = record.status === 'blocked'
    ? 'blocked'
    : record.status === 'not-applicable'
      ? 'not-applicable'
      : 'required';
  return {
    id: `coverage:${kind}:${record.id}`,
    kind,
    module: moduleForRoute?.(route) ?? record.module ?? 'unassigned',
    route,
    sourceIds: [record.id],
    priority,
    disposition,
    ...(disposition === 'required' ? {} : { reason: String(record.evidence.reason ?? record.status) }),
  };
}

function findDuplicateIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates].sort((left, right) => left.localeCompare(right));
}
