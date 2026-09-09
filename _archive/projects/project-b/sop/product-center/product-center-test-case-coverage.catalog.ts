const productCenterTestCaseCoverage: Readonly<Record<string, readonly string[]>> = {
  'create:category': [
    'coverage:route:route:b0de43a7ecd9',
    'coverage:control:category-create',
  ],
  'edit:category': [
    'coverage:control:category-expand',
    'coverage:control:category-row-actions',
    'coverage:dialog:category-row-actions',
  ],
  'delete:category': [
    'coverage:control:category-expand',
    'coverage:control:category-row-actions',
    'coverage:dialog:category-row-actions',
  ],
  'negative:category-required': [
    'coverage:control:category-create',
    'coverage:validation:validation:0e0354674598',
  ],
  'negative:category-max-length': [
    'coverage:control:category-create',
  ],
  'negative:category-cancel-delete': [
    'coverage:control:category-expand',
    'coverage:control:category-row-actions',
    'coverage:dialog:category-row-actions',
  ],
  'negative:category-child-blocked-by-product': [
    'coverage:control:category-add-child',
  ],
};

export function coverageIdsForProductCenterCase(caseId: string): string[] {
  return [...(productCenterTestCaseCoverage[caseId] ?? [])];
}
