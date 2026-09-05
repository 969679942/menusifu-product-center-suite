import {
  fingerprintImplementationCheckpoint,
  type ImplementationCheckpoint,
  type ImplementationCheckpointEntry,
} from '../../automation/system-test/system-test-implementation-fingerprint';

export type ProductCenterItemFamily = 'standard' | 'package' | 'addon';

export function productCenterItemFamily(caseId: string): ProductCenterItemFamily {
  if (caseId.startsWith('TC-ITEM-STD-')) return 'standard';
  if (caseId.startsWith('TC-ITEM-PKG-')) return 'package';
  return 'addon';
}

export function fingerprintProductCenterItemImplementation(rootDir: string, caseId: string): string {
  const result = fingerprintImplementationCheckpoint(rootDir, productCenterItemImplementationCheckpoint(caseId));
  if (result.diagnostics.length > 0) throw new Error(result.diagnostics.join(','));
  return result.fingerprint;
}

export function productCenterItemImplementationCheckpoint(caseId: string): ImplementationCheckpoint {
  return {
    requiredCategories: ['flow', 'page-object', 'locator', 'data-factory'],
    entries: [
      ...productCenterItemImplementationEntries(productCenterItemFamily(caseId)),
      ...productCenterItemCaseSpecificImplementationEntries(caseId),
    ],
  };
}

export function productCenterItemImplementationCheckpointInputs(): string[] {
  return [...new Set([
    ...(['standard', 'package', 'addon'] as const)
      .flatMap((family) => productCenterItemImplementationEntries(family).map((entry) => entry.path)),
    ...productCenterItemCaseSpecificImplementationEntries('TC-ITEM-ADD-035').map((entry) => entry.path),
  ])].sort();
}

function productCenterItemCaseSpecificImplementationEntries(caseId: string): ImplementationCheckpointEntry[] {
  if (caseId === 'TC-ITEM-ADD-035') {
    return [{ category: 'flow', path: 'flows/product-center/item-216/addon-main-image-evidence.ts' }];
  }
  return [];
}

function productCenterItemImplementationEntries(family: ProductCenterItemFamily): ImplementationCheckpointEntry[] {
  const shared: ImplementationCheckpointEntry[] = [
    { category: 'flow', path: 'flows/item-create.flow.ts' },
    { category: 'flow', path: 'playwright.config.ts' },
    // Fingerprint the generator source instead of its self-referential output:
    // the generated file embeds each case fingerprint and can never hash to
    // the value computed before it is written.
    { category: 'flow', path: 'scripts/generate-product-center-item-216-spec.ts' },
    { category: 'flow', path: 'api/product-center/recovery-service.ts' },
    { category: 'page-object', path: 'pages/product-management/item/item-list.page.ts' },
    { category: 'locator', path: 'pages/product-management/item/item-create-form-locators.ts' },
    { category: 'data-factory', path: 'test-data/product-center/product-center-item-create-data.factory.ts' },
  ];
  const familyEntries: Record<ProductCenterItemFamily, ImplementationCheckpointEntry[]> = {
    standard: [
      { category: 'flow', path: 'flows/product-center/item-216/standard-item-216.flow.ts' },
      { category: 'flow', path: 'flows/product-center/item-216/standard-item-216.runner.ts' },
      { category: 'flow', path: 'flows/product-center/product-center-item-category-leaf-probe.flow.ts' },
      { category: 'page-object', path: 'pages/product-management/item/item-create-standard.page.ts' },
      { category: 'page-object', path: 'pages/product-management/item/item-edit.page.ts' },
      { category: 'locator', path: 'pages/product-management/item/item-create-standard-locators.ts' },
      { category: 'data-factory', path: 'test-data/product-center/item-216/standard-item-216.factory.ts' },
    ],
    package: [
      { category: 'flow', path: 'flows/product-center/item-216/package-item-216.flow.ts' },
      { category: 'flow', path: 'flows/product-center/product-center-item-combo-audit.flow.ts' },
      // Package cross-type rename scenarios open the standard editor as well;
      // include its base page/locator sources so readiness and repair guards
      // observe changes to the shared price/name hydration probes.
      { category: 'page-object', path: 'pages/product-management/item/item-create-standard.page.ts' },
      { category: 'page-object', path: 'pages/product-management/item/item-create-combo.page.ts' },
      { category: 'page-object', path: 'pages/product-management/item/item-edit.page.ts' },
      { category: 'locator', path: 'pages/product-management/item/item-create-standard-locators.ts' },
      { category: 'locator', path: 'pages/product-management/item/item-create-combo-locators.ts' },
      { category: 'data-factory', path: 'test-data/product-center/item-216/package-item-216.factory.ts' },
    ],
    addon: [
      { category: 'flow', path: 'flows/product-center/item-216/addon-item-216.flow.ts' },
      { category: 'page-object', path: 'pages/product-management/item/item-create-side.page.ts' },
      { category: 'locator', path: 'pages/product-management/item/item-create-side-locators.ts' },
      { category: 'data-factory', path: 'test-data/product-center/item-216/addon-item-216.factory.ts' },
    ],
  };
  return [...shared, ...familyEntries[family]];
}
