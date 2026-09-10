import {
  fingerprintImplementationCheckpoint,
  type ImplementationCheckpoint,
  type ImplementationCheckpointEntry,
} from '../../automation/system-test/system-test-implementation-fingerprint';
import { standardListCaseIds } from './product-center-item-spec-routes';
import { queryReturnCaseIds } from './product-center-item-spec-dispatch';
import { weightUnitsCaseIds } from './product-center-item-execution-specs';
import {requiredNameCaseIds} from './product-center-item-required-name-specs';
import {advancedSettingsCaseIds} from './product-center-item-advanced-specs';
import {createControlsCaseIds} from './product-center-item-create-controls-specs';
import {addonOtherSettingsCaseIds} from './product-center-item-addon-other-settings-specs';
import {addonPriceCaseIds} from './product-center-item-addon-price-specs';

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
      ...(addonPriceCaseIds.includes(caseId) ? addonPriceImplementationEntries() : addonOtherSettingsCaseIds.includes(caseId) ? addonOtherSettingsImplementationEntries() : createControlsCaseIds.includes(caseId) ? createControlsImplementationEntries() : advancedSettingsCaseIds.includes(caseId) ? advancedSettingsImplementationEntries() : requiredNameCaseIds.includes(caseId) ? requiredNameImplementationEntries() : weightUnitsCaseIds.includes(caseId) ? weightUnitsImplementationEntries() : queryReturnCaseIds.includes(caseId) ? queryReturnImplementationEntries() : standardListCaseIds.includes(caseId) ? standardListImplementationEntries() : productCenterItemImplementationEntries(productCenterItemFamily(caseId))),
      ...productCenterItemCaseSpecificImplementationEntries(caseId),
    ],
  };
}

export function productCenterItemImplementationCheckpointInputs(): string[] {
  return [...new Set([
    ...(['standard', 'package', 'addon'] as const)
      .flatMap((family) => productCenterItemImplementationEntries(family).map((entry) => entry.path)),
    ...productCenterItemCaseSpecificImplementationEntries('TC-ITEM-ADD-035').map((entry) => entry.path),
    ...productCenterItemCaseSpecificImplementationEntries('TC-ITEM-ADD-005').map((entry) => entry.path),
    ...productCenterItemCaseSpecificImplementationEntries('TC-ITEM-STD-102').map((entry) => entry.path),
    ...standardListImplementationEntries().map(entry=>entry.path),
    ...queryReturnImplementationEntries().map(entry=>entry.path),
    ...weightUnitsImplementationEntries().map(entry=>entry.path),
    ...requiredNameImplementationEntries().map(entry=>entry.path),
    ...advancedSettingsImplementationEntries().map(entry=>entry.path),
    ...createControlsImplementationEntries().map(entry=>entry.path),
    ...addonOtherSettingsImplementationEntries().map(entry=>entry.path),
    ...addonPriceImplementationEntries().map(entry=>entry.path),
  ])].sort();
}

function weightUnitsImplementationEntries():ImplementationCheckpointEntry[] {
  return [
    ...['flows/product-center/item-216/standard-weight-units-acceptance.flow.ts','flows/item-create.flow.ts','fixtures/product-center-weight-units.fixture.ts','fixtures/product-center.fixture.ts','playwright.config.ts'].map(path=>({category:'flow' as const,path})),
    ...['standard-list-acceptance.page.ts','item-create-standard.page.ts','item-create-form.page.ts','item-create-type.page.ts','item-list.page.ts'].map(name=>({category:'page-object' as const,path:`pages/product-management/item/${name}`})),
    ...['item-create-standard-locators.ts','item-create-form-locators.ts','item-create-type-locators.ts','item-list-locators.ts'].map(name=>({category:'locator' as const,path:`pages/product-management/item/${name}`})),
    {category:'data-factory',path:'test-data/item-list.ts'},
    {category:'data-factory',path:'contracts/product-center/test-cases/standard-weight-units-acceptance.json'},
    {category:'binding',path:'tests/generated/product-center-item-weight-units.spec.ts'},
    {category:'binding',path:'adapters/product-center/product-center-item-execution-specs.ts'},
  ];
}

function queryReturnImplementationEntries():ImplementationCheckpointEntry[] {
  return [
    {category:'flow',path:'flows/product-center/item-216/standard-query-return.flow.ts'},
    {category:'flow',path:'fixtures/product-center-query.fixture.ts'},
    {category:'flow',path:'fixtures/product-center.fixture.ts'},
    {category:'page-object',path:'pages/product-management/item/standard-query-return.page.ts'},
    {category:'locator',path:'pages/product-management/item/standard-query-return.page.ts'},
    {category:'data-factory',path:'contracts/product-center/test-cases/standard-query-return.json'},
    {category:'binding',path:'tests/generated/product-center-item-query-return.spec.ts'},
    {category:'binding',path:'adapters/product-center/product-center-item-spec-dispatch.ts'},
    {category:'flow',path:'playwright.config.ts'},
  ];
}

function standardListImplementationEntries():ImplementationCheckpointEntry[] {
  return [
    {category:'flow',path:'flows/product-center/item-216/standard-list-acceptance.flow.ts'},
    {category:'flow',path:'fixtures/product-center-list.fixture.ts'},
    {category:'flow',path:'fixtures/product-center.fixture.ts'},
    {category:'page-object',path:'pages/product-management/item/standard-list-acceptance.page.ts'},
    {category:'locator',path:'pages/product-management/item/standard-list-acceptance.page.ts'},
    {category:'data-factory',path:'contracts/product-center/test-cases/standard-list-acceptance.json'},
    {category:'binding',path:'tests/generated/product-center-item-list-acceptance.spec.ts'},
    {category:'binding',path:'adapters/product-center/product-center-item-spec-routes.ts'},
    {category:'flow',path:'playwright.config.ts'},
  ];
}

function productCenterItemCaseSpecificImplementationEntries(caseId: string): ImplementationCheckpointEntry[] {
  if (caseId === 'TC-ITEM-ADD-016') {
    return [{ category: 'flow', path: 'flows/product-center/item-216/addon-name-conflict.ts' }];
  }
  if (['TC-ITEM-STD-102', 'TC-ITEM-STD-103'].includes(caseId)) return [
    {category:'page-object',path:'pages/product-management/item/standard-name-format.page.ts'},
    {category:'binding',path:'contracts/product-center/test-cases/standard-name-format-bindings.json'},
    {category:'binding',path:'scripts/sync-product-center-standard-name-bindings.ts'},
    {category:'binding',path:'tests/generated/product-center-item-standard-216.generated.spec.ts'},
    {category:'binding',path:'contracts/product-center/feedback/item-create-submitted.json'},
    {category:'page-object',path:'pages/product-management/item/item-create-form.page.ts'},
    {category:'locator',path:'pages/product-management/item/item-list-locators.ts'},
    {category:'cleanup',path:'api/product-center/cleanup-registry.ts'},
  ];
  if (['TC-ITEM-ADD-005', 'TC-ITEM-ADD-006', 'TC-ITEM-ADD-007'].includes(caseId)) {
    return [
      ...(['TC-ITEM-ADD-005', 'TC-ITEM-ADD-007'].includes(caseId)
        ? [{ category: 'flow' as const, path: 'contracts/product-center/feedback/item-create-submitted.json' }] : []),
      { category: 'flow', path: 'flows/product-center/item-216/addon-creation-acceptance.flow.ts' },
      { category: 'flow', path: 'fixtures/product-center.fixture.ts' },
      { category: 'page-object', path: 'pages/product-management/item/item-create-acceptance.page.ts' },
      { category: 'page-object', path: 'pages/product-management/item/item-list-creation-evidence.page.ts' },
      { category: 'page-object', path: 'pages/product-management/item/item-create-form.page.ts' },
      { category: 'page-object', path: 'pages/product-management/item/item-create-type.page.ts' },
      { category: 'page-object', path: 'pages/product-center/product-center-sidebar-navigation.page.ts' },
      { category: 'page-object', path: 'pages/sidebar.page.ts' },
      { category: 'locator', path: 'pages/product-management/item/item-list-locators.ts' },
      { category: 'locator', path: 'pages/product-management/item/item-create-type-locators.ts' },
      { category: 'data-factory', path: 'test-data/item-list.ts' },
      { category: 'cleanup', path: 'api/product-center/cleanup-registry.ts' },
    ];
  }
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
      { category: 'data-factory', path: 'test-data/product-center/item-216/standard-item-image-data.ts' },
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

function requiredNameImplementationEntries():ImplementationCheckpointEntry[] {
  return [
    {category:'page-object',path:'pages/product-center/product-center-sidebar-navigation.page.ts'},
    {category:'page-object',path:'pages/sidebar.page.ts'},
    ...['flows/product-center/item-216/standard-required-name.flow.ts','fixtures/product-center-required-name.fixture.ts','fixtures/product-center.fixture.ts','api/product-center/required-name-persistence.ts','api/operation-client.ts','api/auth-client.ts','api/runtime-config.ts','playwright.config.ts'].map(path=>({category:'flow' as const,path})),
    ...['standard-required-name.page.ts','standard-list-acceptance.page.ts','item-create-standard.page.ts','item-create-form.page.ts','item-create-type.page.ts','item-list.page.ts'].map(name=>({category:'page-object' as const,path:`pages/product-management/item/${name}`})),
    ...['item-create-standard-locators.ts','item-create-form-locators.ts','item-create-type-locators.ts','item-list-locators.ts'].map(name=>({category:'locator' as const,path:`pages/product-management/item/${name}`})),
    {category:'data-factory',path:'test-data/item-list.ts'},
    {category:'data-factory',path:'contracts/product-center/test-cases/standard-required-name-acceptance.json'},
    {category:'binding',path:'tests/generated/product-center-item-required-name.spec.ts'},
    {category:'binding',path:'adapters/product-center/product-center-item-required-name-specs.ts'},
  ];
}

function advancedSettingsImplementationEntries():ImplementationCheckpointEntry[] {
  return [
    ...['flows/product-center/item-216/standard-advanced-settings.flow.ts','flows/item-create.flow.ts','flows/item-list.flow.ts','fixtures/product-center-advanced-settings.fixture.ts','fixtures/product-center.fixture.ts','fixtures/product-center-api.fixture.ts','api/product-center/advanced-settings-preconditions.ts','api/operation-client.ts','api/auth-client.ts','api/runtime-config.ts','playwright.config.ts'].map(path=>({category:'flow' as const,path})),
    ...['standard-advanced-settings.page.ts','item-create-standard.page.ts','item-create-form.page.ts','item-create-type.page.ts','item-list.page.ts'].map(name=>({category:'page-object' as const,path:`pages/product-management/item/${name}`})),
    {category:'page-object',path:'pages/product-center/product-center-sidebar-navigation.page.ts'},
    {category:'page-object',path:'pages/sidebar.page.ts'},
    ...['item-create-standard-locators.ts','item-create-form-locators.ts','item-create-type-locators.ts','item-list-locators.ts'].map(name=>({category:'locator' as const,path:`pages/product-management/item/${name}`})),
    {category:'data-factory',path:'test-data/item-list.ts'},
    {category:'data-factory',path:'test-data/product-center/advanced-settings.ts'},
    {category:'data-factory',path:'contracts/product-center/test-cases/standard-advanced-settings-acceptance.json'},
    {category:'binding',path:'tests/generated/product-center-item-advanced-settings.spec.ts'},
    {category:'binding',path:'adapters/product-center/product-center-item-advanced-specs.ts'},
  ];
}

function createControlsImplementationEntries():ImplementationCheckpointEntry[] {
  return [
    ...['flows/product-center/item-216/standard-create-controls.flow.ts','flows/item-create.flow.ts','flows/item-list.flow.ts','fixtures/product-center-create-controls.fixture.ts','fixtures/product-center.fixture.ts','fixtures/product-center-api.fixture.ts','api/product-center/advanced-settings-preconditions.ts','api/operation-client.ts','api/auth-client.ts','api/runtime-config.ts','playwright.config.ts'].map(path=>({category:'flow' as const,path})),
    ...['standard-create-controls.page.ts','item-create-standard.page.ts','item-create-form.page.ts','item-create-type.page.ts','item-list.page.ts'].map(name=>({category:'page-object' as const,path:`pages/product-management/item/${name}`})),
    {category:'page-object',path:'pages/product-center/product-center-sidebar-navigation.page.ts'},
    {category:'page-object',path:'pages/sidebar.page.ts'},
    ...['item-create-standard-locators.ts','item-create-form-locators.ts','item-create-type-locators.ts','item-list-locators.ts'].map(name=>({category:'locator' as const,path:`pages/product-management/item/${name}`})),
    {category:'data-factory',path:'test-data/item-list.ts'},
    {category:'data-factory',path:'test-data/product-center/create-controls.ts'},
    {category:'data-factory',path:'contracts/product-center/test-cases/standard-create-controls-acceptance.json'},
    {category:'binding',path:'tests/generated/product-center-item-create-controls.spec.ts'},
    {category:'binding',path:'adapters/product-center/product-center-item-create-controls-specs.ts'},
  ];
}

function addonOtherSettingsImplementationEntries():ImplementationCheckpointEntry[]{return [
 ...['flows/product-center/item-216/addon-other-settings.flow.ts','fixtures/product-center-addon-other-settings.fixture.ts','fixtures/product-center.fixture.ts','playwright.config.ts'].map(path=>({category:'flow' as const,path})),
 ...['pages/product-management/item/addon-other-settings.page.ts','pages/product-management/item/item-create-side.page.ts','pages/product-management/item/item-create-form.page.ts','pages/product-management/item/item-list.page.ts','pages/product-center/product-center-sidebar-navigation.page.ts','pages/sidebar.page.ts'].map(path=>({category:'page-object' as const,path})),
 ...['pages/product-management/item/item-create-side-locators.ts','pages/product-management/item/item-create-form-locators.ts','pages/product-management/item/item-list-locators.ts'].map(path=>({category:'locator' as const,path})),
 ...['test-data/item-list.ts','contracts/product-center/test-cases/addon-other-settings-acceptance.json'].map(path=>({category:'data-factory' as const,path})),
 ...['tests/generated/product-center-item-addon-other-settings.spec.ts','adapters/product-center/product-center-item-addon-other-settings-specs.ts'].map(path=>({category:'binding' as const,path}))
];}

function addonPriceImplementationEntries():ImplementationCheckpointEntry[]{return [
 ...['flows/product-center/item-216/addon-price-acceptance.flow.ts','fixtures/product-center-addon-price.fixture.ts','fixtures/product-center.fixture.ts','fixtures/product-center-api.fixture.ts','api/product-center/addon-price-persistence.ts','api/product-center/product-center-api.ts','api/product-center/cleanup-registry.ts','api/product-center/execution-ledger.ts','api/operation-client.ts','api/auth-client.ts','api/runtime-config.ts','scripts/run-product-center-source-governed.ts','playwright.config.ts','utils/business-feedback-contract.ts'].map(path=>({category:'flow' as const,path})),
 ...['pages/product-management/item/addon-price-acceptance.page.ts','pages/product-management/item/item-create-acceptance.page.ts','pages/product-management/item/item-create-side.page.ts','pages/product-management/item/item-create-form.page.ts','pages/product-management/item/item-create-type.page.ts','pages/product-management/item/item-list.page.ts','pages/product-center/product-center-sidebar-navigation.page.ts','pages/sidebar.page.ts'].map(path=>({category:'page-object' as const,path})),
 ...['pages/product-management/item/item-create-side-locators.ts','pages/product-management/item/item-create-form-locators.ts','pages/product-management/item/item-create-type-locators.ts','pages/product-management/item/item-list-locators.ts'].map(path=>({category:'locator' as const,path})),
 ...['test-data/item-list.ts','test-data/product-center/addon-price.ts','contracts/product-center/test-cases/addon-price-acceptance.json','contracts/product-center/feedback/item-create-submitted.json'].map(path=>({category:'data-factory' as const,path})),
 ...['tests/generated/product-center-item-addon-price.spec.ts','adapters/product-center/product-center-item-addon-price-specs.ts'].map(path=>({category:'binding' as const,path}))
];}
