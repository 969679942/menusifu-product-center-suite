import type { ProductCenterCoverageGroup } from '../../../utils/product-center-coverage-denominator';

const categoryRoute = '/pp/brand/category';

export const productCenterCoverageCuration: readonly ProductCenterCoverageGroup[] = [
  coverageGroup('coverage:control:category-expand', 'control', range(1, 3)),
  coverageGroup('coverage:control:category-row-actions', 'control', range(4, 6)),
  coverageGroup('coverage:control:category-add-child', 'control', range(7, 26)),
  coverageGroup('coverage:control:category-create', 'control', range(27, 29)),
  coverageGroup('coverage:dialog:category-row-actions', 'dialog', [
    '/pp/brand/category#action-2#primary-1',
    '/pp/brand/category#action-11#primary-1',
    '/pp/brand/category#action-25#primary-1',
  ]),
];

function coverageGroup(
  id: string,
  kind: ProductCenterCoverageGroup['kind'],
  sourceIds: string[],
): ProductCenterCoverageGroup {
  return {
    id,
    kind,
    module: 'brand-item',
    route: categoryRoute,
    sourceIds,
    priority: 'P0',
    disposition: 'required',
  };
}

function range(start: number, end: number): string[] {
  return Array.from(
    { length: end - start + 1 },
    (_, index) => `/pp/brand/category#control-${start + index}`,
  );
}
