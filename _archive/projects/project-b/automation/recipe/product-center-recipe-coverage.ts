import { productCenterCreateSopCatalog } from '../../sop/product-center/product-center-create-sop.catalog';
import { highDependencySopCatalog } from '../../sop/product-center/product-center-high-dependency-sop.catalog';
import { lowDependencySopCatalog } from '../../sop/product-center/product-center-low-dependency-sop.catalog';
import { productCenterNegativeSopCatalog } from '../../sop/product-center/product-center-negative-sop.catalog';
import { productCenterSopCatalog } from '../../sop/product-center/product-center-sop.catalog';
import type { ProductCenterRecipeSourceIndex } from './product-center-recipe-source-index';

export type ProductCenterRecipeCoverageGroup =
  | 'core-create'
  | 'core-crud'
  | 'low-dependency-crud'
  | 'high-dependency-crud'
  | 'negative';

export type ProductCenterRecipeCoverageEntry = {
  caseId: string;
  traceabilityId: string;
  sourceIds: string[];
  group: ProductCenterRecipeCoverageGroup;
  status: 'compiled' | 'pending';
};

export type ProductCenterRecipeCoverage = {
  schemaVersion: '1.0.0';
  total: number;
  compiled: number;
  pending: number;
  entries: ProductCenterRecipeCoverageEntry[];
  unknownCaseIds: string[];
  duplicateCaseIds: string[];
};

export function buildProductCenterRecipeCoverage(
  sourceIndex: ProductCenterRecipeSourceIndex,
  compiledCaseIds: readonly string[],
): ProductCenterRecipeCoverage {
  const groups = buildCaseGroups();
  const compiled = new Set(compiledCaseIds);
  const entries: ProductCenterRecipeCoverageEntry[] = [];
  const unknownCaseIds: string[] = [];

  for (const source of sourceIndex.entries) {
    const group = groups.byCaseId.get(source.caseId);
    if (!group) {
      unknownCaseIds.push(source.caseId);
      continue;
    }
    entries.push({
      caseId: source.caseId,
      traceabilityId: source.traceabilityId,
      sourceIds: source.sourceIds,
      group,
      status: compiled.has(source.caseId) ? 'compiled' : 'pending',
    });
  }

  const compiledCount = entries.filter((entry) => entry.status === 'compiled').length;
  return {
    schemaVersion: '1.0.0',
    total: entries.length,
    compiled: compiledCount,
    pending: entries.length - compiledCount,
    entries: entries.sort((left, right) => left.caseId.localeCompare(right.caseId)),
    unknownCaseIds: unknownCaseIds.sort(),
    duplicateCaseIds: groups.duplicateCaseIds,
  };
}

function buildCaseGroups(): {
  byCaseId: Map<string, ProductCenterRecipeCoverageGroup>;
  duplicateCaseIds: string[];
} {
  const groups: Array<[ProductCenterRecipeCoverageGroup, string[]]> = [
    ['core-create', productCenterCreateSopCatalog.map((item) => `create:${item.entityKey}`)],
    ['core-crud', productCenterSopCatalog.flatMap((item) => [
      `edit:${item.entityKey}`,
      `delete:${item.entityKey}`,
    ])],
    ['low-dependency-crud', lowDependencySopCatalog.flatMap((item) =>
      item.actions.map((action) => `${action}:${item.entityKey}`))],
    ['high-dependency-crud', highDependencySopCatalog.flatMap((item) =>
      item.actions.map((action) => `${action}:${item.entityKey}`))],
    ['negative', productCenterNegativeSopCatalog.map((item) => `negative:${item.id}`)],
  ];
  const byCaseId = new Map<string, ProductCenterRecipeCoverageGroup>();
  const duplicateCaseIds = new Set<string>();
  for (const [group, caseIds] of groups) {
    for (const caseId of caseIds) {
      if (byCaseId.has(caseId)) duplicateCaseIds.add(caseId);
      byCaseId.set(caseId, group);
    }
  }
  return { byCaseId, duplicateCaseIds: [...duplicateCaseIds].sort() };
}
