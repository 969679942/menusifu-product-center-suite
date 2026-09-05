import type { Page } from '@playwright/test';
import type { ProductCenterApi } from '../../api/product-center/product-center-api';
import type { CleanupRegistry } from '../../api/product-center/cleanup-registry';
import type { ProductCenterExecutionLedger, ProductCenterLedgerPhase } from '../../api/product-center/execution-ledger';
import {
  createProductCenterRecipeCapabilityRegistry,
  requireItemComboCreateResult,
  requireItemStandardCreateResult,
  type ProductCenterRecipeRuntime,
  type ProductCenterRecipeRuntimeRecord,
} from '../../adapters/product-center/product-center-recipe-capabilities';
import { ProductCenterCreateSopFlow } from './product-center-create-sop.flow';
import { ProductCenterHighDependencySopFlow } from './product-center-high-dependency-sop.flow';
import { ProductCenterLowDependencySopFlow } from './product-center-low-dependency-sop.flow';
import type {
  AutomationRecipe,
  RecipeAdapterCall,
  RecipeCapabilityStep,
  RecipeValue,
} from '../../automation/recipe/automation-recipe';
import { ProductCenterItemIntakePage } from '../../pages/product-center/product-center-item-intake.page';
import { createItemListPage } from '../../pages/product-management/item/item-list.page';
import { ProductCenterCreateSopPage } from '../../pages/product-center/product-center-create-sop.page';
import { ProductCenterNegativePage } from '../../pages/product-center/product-center-negative.page';
import { ProductCenterSopPage } from '../../pages/product-center/product-center-sop.page';
import { productCenterCreateSopCatalog, type ProductCenterCreateSopDefinition } from '../../sop/product-center/product-center-create-sop.catalog';
import { generateHighDependencySopCases, highDependencySopCatalog, type HighDependencyEntityKey, type HighDependencySopDefinition } from '../../sop/product-center/product-center-high-dependency-sop.catalog';
import { generateLowDependencySopCases, lowDependencySopCatalog, type LowDependencyEntityKey, type LowDependencySopDefinition } from '../../sop/product-center/product-center-low-dependency-sop.catalog';
import { productCenterNegativeSopCatalog, type ProductCenterNegativeCase } from '../../sop/product-center/product-center-negative-sop.catalog';
import { generateProductCenterSopCases } from '../../sop/product-center/product-center-sop-generator';
import { productCenterSopCatalog } from '../../sop/product-center/product-center-sop.catalog';
import type { ProductCenterCoreEntityKey, ProductCenterSopCase } from '../../sop/product-center/product-center-sop.types';
import { ProductCenterCreateDataFactory, type ProductCenterCreateContext } from '../../test-data/product-center/sop/product-center-create-data.factory';
import {
  ProductCenterCategoryNegativeDataFactory,
  type CategoryWithProductSeedRecord,
} from '../../test-data/product-center/sop/product-center-category-negative-data.factory';
import { ProductCenterHighDependencyDataFactory, type HighDependencySeedRecord } from '../../test-data/product-center/sop/product-center-high-dependency-data.factory';
import { ProductCenterLowDependencyDataFactory, type LowDependencySeedRecord } from '../../test-data/product-center/sop/product-center-low-dependency-data.factory';
import type { ProductCenterStoreProductSearchResult } from './product-center-store-product-search.flow';
import type {
  ProductCenterMainImagePreviewEvidence,
  ProductCenterOptionalComboDialogEvidence,
  ProductCenterSecondLanguageSearchEvidence,
} from './product-center-item-green-readonly.flow';
import { ProductCenterItemStandardCreateFlow } from './product-center-item-standard-create.flow';
import { ProductCenterItemComboCreateFlow } from './product-center-item-combo-create.flow';
import {
  ProductCenterItemCreateDataFactory,
  type ProductCenterItemCreateContext,
  type ProductCenterItemCreateRecord,
} from '../../test-data/product-center/product-center-item-create-data.factory';
import {
  ProductCenterSopDataFactory,
  type ProductCenterNamedRecord,
  type ProductCenterSopSeedRecord,
} from '../../test-data/product-center/sop/product-center-sop-data.factory';
import { step } from '../../utils/step';
import { waitUntil } from '../../utils/wait';
import {
  createEmptyProductCenterPerformancePhases,
  type ProductCenterPerformancePhase,
  type ProductCenterPerformancePhases,
} from '../../utils/product-center-performance-budget';
import {
  assertItemNotCreated,
  assertItemRequiredValidationUi,
  type ProductCenterItemRequiredValidationResult,
} from '../../utils/product-center-item-required-validation';
import {
  assertProductCenterCategoryLeafCommitted,
  assertProductCenterCategoryParentNotCommitted,
  type ProductCenterCategoryLeafSelectionResult,
  type ProductCenterCategoryParentSelectionResult,
} from '../../utils/product-center-item-category-leaf-runtime';
import {
  assertItemComboGroupRequiredApi,
  assertItemComboGroupRequiredUi,
  assertItemComboOptionalBoundaryApi,
  assertItemComboOptionalBoundaryUi,
  type ProductCenterItemComboGroupRequiredResult,
  type ProductCenterItemComboOptionalBoundaryResult,
} from '../../utils/product-center-item-combo-audit';

type LowDependencySopCase = LowDependencySopDefinition & { action: 'edit' | 'delete' };
type HighDependencySopCase = HighDependencySopDefinition & { action: 'edit' | 'delete' };
type ProductCenterRecipeContextGroup = 'core' | 'create' | 'low' | 'high' | 'negative' | 'item-create';
export type ProductCenterClaimStage = 'precondition' | 'action' | 'expectation';
export type ProductCenterClaimVerification = Record<ProductCenterClaimStage, string[]>;

export type ProductCenterRecipeExecutionContext = {
  recipe: AutomationRecipe;
  page?: Page;
  api?: ProductCenterApi;
  group?: ProductCenterRecipeContextGroup;
  sopCase?: ProductCenterSopCase;
  createDefinition?: ProductCenterCreateSopDefinition;
  lowDependencyCase?: LowDependencySopCase;
  highDependencyCase?: HighDependencySopCase;
  negativeCase?: ProductCenterNegativeCase;
  record?: ProductCenterRecipeRuntimeRecord;
  results: Record<string, unknown>;
  claimVerification?: ProductCenterClaimVerification;
  verifiedClaimIds?: string[];
  phaseDurationsMs?: ProductCenterPerformancePhases;
};

export type ProductCenterRecipeFlowPort = {
  initialize?: (recipe: AutomationRecipe) => Promise<ProductCenterRecipeExecutionContext>;
  beforeCleanup?: (context: ProductCenterRecipeExecutionContext) => Promise<void>;
  seed: (
    call: RecipeAdapterCall,
    recipe: AutomationRecipe,
  ) => Promise<ProductCenterRecipeExecutionContext>;
  executeCapability: (
    capability: RecipeCapabilityStep,
    context: ProductCenterRecipeExecutionContext,
    input: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>;
  assert: (
    call: RecipeAdapterCall,
    context: ProductCenterRecipeExecutionContext,
    input: Readonly<Record<string, unknown>>,
  ) => Promise<void>;
  cleanup: (
    call: RecipeAdapterCall,
    context: ProductCenterRecipeExecutionContext,
  ) => Promise<void>;
  markPhase?: (
    phase: ProductCenterLedgerPhase,
    context: ProductCenterRecipeExecutionContext,
  ) => void;
};

export class ProductCenterRecipeFlow {
  constructor(private readonly port: ProductCenterRecipeFlowPort) {}

  @step((recipe: AutomationRecipe) => `执行商品中心 Recipe：${recipe.title}`)
  async execute(recipe: AutomationRecipe): Promise<ProductCenterRecipeExecutionContext> {
    if (recipe.executionPolicy?.mode === 'wave-shared-chain') {
      throw new Error(
        `Recipe ${recipe.caseId} 禁止单例执行；请运行整波规格 ${recipe.executionPolicy.orchestratorSpecPath}`,
      );
    }
    let context: ProductCenterRecipeExecutionContext = this.port.initialize
      ? await this.port.initialize(recipe)
      : { recipe, results: {} };
    ensurePhaseDurations(context);
    try {
      if (recipe.seed) {
        const startedAt = Date.now();
        context = await this.port.seed(recipe.seed, recipe);
        ensurePhaseDurations(context);
        addPhaseDuration(context, 'seed', Date.now() - startedAt);
      }
      initializeClaimVerification(context);
      if (recipe.mutation) this.port.markPhase?.('ui-triggered', context);

      for (const [index, capability] of recipe.capabilities.entries()) {
        const input = resolveRecipeInput(capability.input ?? {}, context);
        const result = await measurePhase(
          context,
          index === 0 && capability.id === 'navigation.sidebar.open' ? 'sidebar' : 'uiAction',
          () => this.port.executeCapability(capability, context, input),
        );
        context.results[capability.saveAs ?? capability.id] = result;
        if (index === 0 && capability.id === 'navigation.sidebar.open') {
          verifyClaimsForStage(context, 'precondition');
        }
      }
      verifyClaimsForStage(context, 'action');

      if (recipe.mutation) this.port.markPhase?.('mutation-observed', context);
      for (const assertion of recipe.assertions) {
        await measurePhase(
          context,
          assertionPhase(assertion.adapterId),
          () => this.port.assert(
            assertion,
            context,
            resolveRecipeInput(assertion.input ?? {}, context),
          ),
        );
      }
      verifyClaimsForStage(context, 'expectation');
      return context;
    } finally {
      if (recipe.cleanup) {
        try {
          await this.port.beforeCleanup?.(context);
        } finally {
          await measurePhase(
            context,
            'cleanup',
            () => this.port.cleanup(recipe.cleanup!, context),
          );
        }
      }
    }
  }
}

function ensurePhaseDurations(context: ProductCenterRecipeExecutionContext): ProductCenterPerformancePhases {
  context.phaseDurationsMs ??= createEmptyProductCenterPerformancePhases();
  return context.phaseDurationsMs;
}

function addPhaseDuration(
  context: ProductCenterRecipeExecutionContext,
  phase: ProductCenterPerformancePhase,
  durationMs: number,
): void {
  const phases = ensurePhaseDurations(context);
  phases[phase] += Math.max(0, durationMs);
}

async function measurePhase<T>(
  context: ProductCenterRecipeExecutionContext,
  phase: ProductCenterPerformancePhase,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await operation();
  } finally {
    addPhaseDuration(context, phase, Date.now() - startedAt);
  }
}

function assertionPhase(adapterId: string): 'apiAssertion' | 'uiAssertion' {
  return /Api$/.test(adapterId) || adapterId === 'productCenter.verifyItemNotCreated'
    ? 'apiAssertion'
    : 'uiAssertion';
}

function initializeClaimVerification(context: ProductCenterRecipeExecutionContext): void {
  context.claimVerification = { precondition: [], action: [], expectation: [] };
  context.verifiedClaimIds = [];
}

function verifyClaimsForStage(
  context: ProductCenterRecipeExecutionContext,
  stage: ProductCenterClaimStage,
): void {
  const verified = (context.recipe.claimIds ?? []).filter((claimId) => claimStage(claimId) === stage);
  context.claimVerification ??= { precondition: [], action: [], expectation: [] };
  context.claimVerification[stage] = [...verified];
  context.verifiedClaimIds = [
    ...context.claimVerification.precondition,
    ...context.claimVerification.action,
    ...context.claimVerification.expectation,
  ];
}

function claimStage(claimId: string): ProductCenterClaimStage | undefined {
  return claimId.match(/:(precondition|action|expectation)(?::|-)\d+$/)?.[1] as ProductCenterClaimStage | undefined;
}

export function resolveRecipeInput(
  input: Readonly<Record<string, RecipeValue>>,
  context: ProductCenterRecipeExecutionContext,
): Record<string, unknown> {
  return resolveValue(input, context) as Record<string, unknown>;
}

export function createProductCenterRecipeFlowPort(options: {
  page: Page;
  api: ProductCenterApi;
  cleanupRegistry: CleanupRegistry;
  executionLedger: ProductCenterExecutionLedger;
  beforeCleanup?: ProductCenterRecipeFlowPort['beforeCleanup'];
}): ProductCenterRecipeFlowPort {
  const coreFactory = new ProductCenterSopDataFactory(options.api);
  const createFactory = new ProductCenterCreateDataFactory(options.api);
  const lowFactory = new ProductCenterLowDependencyDataFactory(options.api);
  const highFactory = new ProductCenterHighDependencyDataFactory(options.api);
  const categoryNegativeFactory = new ProductCenterCategoryNegativeDataFactory(options.api);
  const itemCreateFactory = new ProductCenterItemCreateDataFactory(options.api);
  const capabilities = createProductCenterRecipeCapabilityRegistry({
    registerItemCreated: async (context, responseBody) => {
      const record = await itemCreateFactory.registerCreated(
        context,
        responseBody,
        options.cleanupRegistry,
      );
      options.executionLedger.markPhase(record.checkpointEntryId, 'mutation-observed');
      return record;
    },
    registerComboGroupCreated: async (name, responseBody) => {
      const record = await itemCreateFactory.registerComboGroupCreated(
        name,
        responseBody,
        options.cleanupRegistry,
      );
      options.executionLedger.markPhase(record.checkpointEntryId, 'mutation-observed');
      return record;
    },
    readItemRecordCount: (identity) => itemCreateFactory.itemRecordCount(identity),
    readComboGroupRecordCount: (identity) => itemCreateFactory.comboGroupRecordCount(identity),
  });

  return {
    beforeCleanup: options.beforeCleanup,
    initialize: async (recipe) => ({
      recipe,
      page: options.page,
      api: options.api,
      negativeCase: findNegativeCase(recipe.caseId),
      results: {},
    }),
    seed: async (call, recipe) => {
      const input = resolveRecipeInput(call.input ?? {}, { recipe, results: {} });
      switch (call.adapterId) {
        case 'productCenter.seedCore': {
          const entityKey = requireCoreEntityKey(input.entityKey);
          const action = recipe.action === 'negative' ? 'delete' : requireCoreAction(recipe.action);
          const sopCase = requireSopCase(recipe, entityKey, action);
          const record = await coreFactory.seed(entityKey, options.cleanupRegistry);
          return {
            recipe,
            page: options.page,
            api: options.api,
            group: recipe.action === 'negative' ? 'negative' : 'core',
            sopCase,
            negativeCase: findNegativeCase(recipe.caseId),
            record,
            results: {},
          };
        }
        case 'productCenter.prepareCreate': {
          const entityKey = requireCoreEntityKey(input.entityKey);
          const createDefinition = requireCreateDefinition(entityKey);
          const record = await createFactory.prepare(entityKey, options.cleanupRegistry);
          return { recipe, page: options.page, api: options.api, group: 'create', createDefinition, record, results: {} };
        }
        case 'productCenter.seedLowDependency': {
          const entityKey = requireLowDependencyEntityKey(input.entityKey);
          const lowDependencyCase = requireLowDependencyCase(recipe, entityKey);
          const record = await lowFactory.seed(entityKey, options.cleanupRegistry);
          return { recipe, page: options.page, api: options.api, group: 'low', lowDependencyCase, record, results: {} };
        }
        case 'productCenter.seedDescriptionTagDeletionScenario': {
          const lowDependencyCase = requireLowDependencyCase(recipe, 'description-tag');
          const record = await lowFactory.seedDescriptionTagDeletionScenario(options.cleanupRegistry);
          return {
            recipe,
            page: options.page,
            api: options.api,
            group: 'low',
            lowDependencyCase,
            record,
            results: {
              preconditionEvidence: {
                groupTagCount: record.metadata.groupTagCount,
                referencedTagCount: record.metadata.referencedTagCount,
                targetReferenceCount: record.metadata.targetReferenceCount,
                productReferenceVerified: record.metadata.productReferenceVerified === 1,
              },
            },
          };
        }
        case 'productCenter.seedHighDependency': {
          const entityKey = requireHighDependencyEntityKey(input.entityKey);
          const highDependencyCase = requireHighDependencyCase(recipe, entityKey);
          const record = await highFactory.seed(entityKey, options.cleanupRegistry);
          return { recipe, page: options.page, api: options.api, group: 'high', highDependencyCase, record, results: {} };
        }
        case 'productCenter.seedCategoryWithProduct': {
          const record = await categoryNegativeFactory.seedCategoryWithProduct(options.cleanupRegistry);
          return {
            recipe,
            page: options.page,
            api: options.api,
            group: 'negative',
            negativeCase: findNegativeCase(recipe.caseId),
            record,
            results: {},
          };
        }
        case 'productCenter.prepareItemStandardSingleZeroPrice': {
          const record = await itemCreateFactory.prepare();
          return {
            recipe,
            page: options.page,
            api: options.api,
            group: 'item-create',
            record,
            results: {
              preconditionEvidence: {
                uniqueIdentityVerified: true,
              },
            },
          };
        }
        case 'productCenter.prepareItemComboRequiredOnly': {
          const record = await itemCreateFactory.prepareComboRequiredOnly(options.cleanupRegistry);
          return {
            recipe,
            page: options.page,
            api: options.api,
            group: 'item-create',
            record,
            results: {
              preconditionEvidence: {
                uniqueIdentityVerified: true,
                fixedComboGroupPrepared: record.comboGroupName,
              },
            },
          };
        }
        case 'productCenter.prepareItemComboGroupRequiredProbe': {
          const record = await itemCreateFactory.prepareComboGroupRequiredProbe(options.cleanupRegistry);
          return {
            recipe,
            page: options.page,
            api: options.api,
            group: 'item-create',
            record,
            results: {
              preconditionEvidence: {
                uniqueIdentityVerified: true,
                comboGroupAbsent: true,
                checkpointEntryId: record.checkpointEntryId,
              },
            },
          };
        }
        case 'productCenter.prepareItemComboOptionalBoundaryProbe': {
          const record = await itemCreateFactory.prepareComboOptionalBoundaryProbe(options.cleanupRegistry);
          return {
            recipe,
            page: options.page,
            api: options.api,
            group: 'item-create',
            record,
            results: {
              preconditionEvidence: {
                uniqueIdentityVerified: true,
                fixedComboGroupPrepared: record.comboGroupName,
                dependencyProductPrepared: true,
              },
            },
          };
        }
        default:
          throw new Error(`未知 seed 适配器：${call.adapterId}`);
      }
    },
    executeCapability: async (capability, context, input) => {
      const runtime = requireRuntime(context);
      const result = await capabilities.execute(
        capability.id,
        context.recipe.action,
        runtime,
        input,
      );
      context.record = runtime.record;
      return result;
    },
    assert: async (call, context, input) => {
      switch (call.adapterId) {
        case 'productCenter.verifyCreatedApi':
          await verifyCreatedApi(createFactory, context, options.cleanupRegistry, options.executionLedger);
          return;
        case 'productCenter.verifyCreatedUi':
          await new ProductCenterCreateSopFlow(options.page).verifyCreatedUi(
            requireCreateDefinitionContext(context),
            requireCoreSeedRecord(context),
          );
          options.executionLedger.markPhase(requireLedgerRecord(context).checkpointEntryId, 'ui-verified');
          return;
        case 'productCenter.verifyMethodDetailBoundary':
          await verifyMethodDetailBoundary(options.page, options.api, context, input);
          options.executionLedger.markPhase(requireLedgerRecord(context).checkpointEntryId, 'ui-verified');
          return;
        case 'productCenter.verifyEditedApi':
          await verifyApiState(context, coreFactory, lowFactory, highFactory, 'edit');
          options.executionLedger.markPhase(requireLedgerRecord(context).checkpointEntryId, 'api-verified');
          return;
        case 'productCenter.verifyAbsentApi':
          await verifyApiState(context, coreFactory, lowFactory, highFactory, 'delete');
          options.executionLedger.markPhase(requireLedgerRecord(context).checkpointEntryId, 'api-verified');
          return;
        case 'productCenter.verifyEditedUi':
          await verifyEditedUi(options.page, context);
          options.executionLedger.markPhase(requireLedgerRecord(context).checkpointEntryId, 'ui-verified');
          return;
        case 'productCenter.verifyDeletedUi':
          await verifyDeletedUi(options.page, context);
          options.executionLedger.markPhase(requireLedgerRecord(context).checkpointEntryId, 'ui-verified');
          return;
        case 'productCenter.verifyBoundary':
          verifyBoundary(input);
          return;
        case 'productCenter.verifyNegative':
          verifyNegative(input);
          return;
        case 'productCenter.verifyCategoryChildBlockedApi':
          await verifyCategoryChildBlockedApi(categoryNegativeFactory, context, options.cleanupRegistry);
          options.executionLedger.markPhase(requireLedgerRecord(context).checkpointEntryId, 'api-verified');
          return;
        case 'productCenter.verifyCategoryChildBlockedUi':
          await verifyCategoryChildBlockedUi(options.page, context);
          options.executionLedger.markPhase(requireLedgerRecord(context).checkpointEntryId, 'ui-verified');
          return;
        case 'productCenter.verifyItemListDisplayUi':
          await new ProductCenterItemIntakePage(options.page).expectListDisplay();
          return;
        case 'productCenter.verifyItemRequiredValidationUi':
          assertItemRequiredValidationUi(requireItemRequiredValidationResult(input.result));
          return;
        case 'productCenter.verifyItemNotCreated':
          assertItemNotCreated(requireItemRequiredValidationResult(input.result));
          return;
        case 'productCenter.verifyCategoryParentNotCommitted':
          assertProductCenterCategoryParentNotCommitted(
            input.result as ProductCenterCategoryParentSelectionResult,
          );
          return;
        case 'productCenter.verifyCategoryLeafCommitted':
          assertProductCenterCategoryLeafCommitted(
            input.result as ProductCenterCategoryLeafSelectionResult,
          );
          return;
        case 'productCenter.verifyItemStandardSingleZeroPriceApi': {
          const record = requireItemCreateRecord(context);
          const verified = await waitUntil(
            () => itemCreateFactory.verifyZeroPrice(record),
            (value) => value !== undefined,
            { timeout: 60_000, interval: 500, message: '单规格零元商品 API 终态未达到价格 0' },
          );
          if (!verified) throw new Error('单规格零元商品 API 终态验证失败');
          Object.assign(
            requireItemStandardCreateResult(context.results.itemStandardSingleZeroPrice),
            { apiRecordCount: verified.recordCount, apiPrice: verified.apiPrice },
          );
          options.executionLedger.markPhase(record.checkpointEntryId, 'api-verified');
          return;
        }
        case 'productCenter.verifyItemStandardSingleZeroPriceUi': {
          const result = requireItemStandardCreateResult(input.result);
          await new ProductCenterItemStandardCreateFlow(options.page).verifyUi(result);
          options.executionLedger.markPhase(requireItemCreateRecord(context).checkpointEntryId, 'ui-verified');
          return;
        }
        case 'productCenter.verifyItemComboRequiredOnlyApi': {
          const record = requireItemCreateRecord(context);
          const verified = await waitUntil(
            () => itemCreateFactory.verifyPrice(record, 10),
            (value) => value !== undefined,
            { timeout: 60_000, interval: 500, message: '仅必填套餐商品 API 终态未达到价格 10.00' },
          );
          if (!verified) throw new Error('仅必填套餐商品 API 终态验证失败');
          Object.assign(
            requireItemComboCreateResult(context.results.itemComboRequiredOnly),
            { apiRecordCount: verified.recordCount, apiPrice: verified.apiPrice },
          );
          options.executionLedger.markPhase(record.checkpointEntryId, 'api-verified');
          return;
        }
        case 'productCenter.verifyItemComboRequiredOnlyUi': {
          const result = requireItemComboCreateResult(input.result);
          await new ProductCenterItemComboCreateFlow(options.page).verifyUi(result);
          options.executionLedger.markPhase(requireItemCreateRecord(context).checkpointEntryId, 'ui-verified');
          return;
        }
        case 'productCenter.verifyItemComboGroupRequiredUi':
          assertItemComboGroupRequiredUi(
            input.result as ProductCenterItemComboGroupRequiredResult,
          );
          options.executionLedger.markPhase(requireLedgerRecord(context).checkpointEntryId, 'ui-verified');
          return;
        case 'productCenter.verifyItemComboGroupRequiredApi':
          assertItemComboGroupRequiredApi(
            input.result as ProductCenterItemComboGroupRequiredResult,
          );
          options.executionLedger.markPhase(requireLedgerRecord(context).checkpointEntryId, 'api-verified');
          return;
        case 'productCenter.verifyItemComboOptionalBoundaryUi':
          assertItemComboOptionalBoundaryUi(
            input.result as ProductCenterItemComboOptionalBoundaryResult,
          );
          options.executionLedger.markPhase(requireLedgerRecord(context).checkpointEntryId, 'ui-verified');
          return;
        case 'productCenter.verifyItemComboOptionalBoundaryApi':
          assertItemComboOptionalBoundaryApi(
            input.result as ProductCenterItemComboOptionalBoundaryResult,
          );
          options.executionLedger.markPhase(requireLedgerRecord(context).checkpointEntryId, 'api-verified');
          return;
        case 'productCenter.verifyStoreProductSearch':
          verifyStoreProductSearch(requireStoreProductSearchResult(input.result));
          return;
        case 'productCenter.verifySecondLanguageSearch':
          verifySecondLanguageSearch(input.result as ProductCenterSecondLanguageSearchEvidence);
          return;
        case 'productCenter.verifyOptionalComboDialog':
          verifyOptionalComboDialog(input.result as ProductCenterOptionalComboDialogEvidence);
          return;
        case 'productCenter.verifyImagePreview':
          verifyImagePreview(input.result as ProductCenterMainImagePreviewEvidence);
          return;
        default:
          throw new Error(`未知 assertion 适配器：${call.adapterId}`);
      }
    },
    cleanup: async (call, context) => {
      if (call.adapterId !== 'productCenter.cleanupSeed') throw new Error(`未知 cleanup 适配器：${call.adapterId}`);
      await options.cleanupRegistry.cleanupAll();
      if (['TC-ITEM-PKG-046', 'TC-ITEM-PKG-059'].includes(context.recipe.caseId)) {
        const record = requireItemCreateContextForCleanup(context);
        const itemListPage = createItemListPage(options.page);
        await itemListPage.open();
        await itemListPage.fillSearch(record.originalIdentity);
        await itemListPage.expectEmptySearchResults();
      }
    },
    markPhase: (phase, context) => {
      const record = optionalLedgerRecord(context);
      if (record) options.executionLedger.markPhase(record.checkpointEntryId, phase);
    },
  };
}

function verifySecondLanguageSearch(result: ProductCenterSecondLanguageSearchEvidence): void {
  if (
    result.keyword.toLowerCase() !== 'taco'
    || result.responseStatus < 200
    || result.responseStatus >= 300
    || !result.responsePath.endsWith('/ops-brand/brand-items/pageQuery')
    || result.currentPage !== 1
    || result.visibleRowCount < 1
    || result.matchingResponseTexts.length < 1
  ) {
    throw new Error('商品第二语言名称模糊查询未达到结果首页唯一接口证据终态');
  }
}

function verifyOptionalComboDialog(result: ProductCenterOptionalComboDialogEvidence): void {
  if (
    result.route !== '/pp/brand/create/combo'
    || result.dialogCount !== 1
    || result.groupNameInputCount !== 1
    || result.altNameInputCount !== 1
    || result.selectionQuantityInputCount !== 1
    || result.mergeSwitchCount !== 1
    || result.repeatSwitchCount !== 1
    || result.itemSearchInputCount !== 1
    || result.categoryFilterCount < 1
  ) {
    throw new Error('添加可选搭配弹窗未展示当前完整字段与商品筛选入口');
  }
}

function verifyImagePreview(result: ProductCenterMainImagePreviewEvidence): void {
  if (
    result.typeLabel !== 'Combo'
    || result.candidateCount < 1
    || result.rowIndex === null
    || result.previewCount !== 1
    || !result.source
    || !result.previewSource
    || !result.sameImage
  ) {
    throw new Error('套餐商品列表主图预览未达到可见且图片一致终态');
  }
}

function verifyStoreProductSearch(result: ProductCenterStoreProductSearchResult): void {
  if (
    result.trigger !== 'input-change'
    || result.locatorCount !== 1
    || result.resultCount !== 1
    || result.responseMethod !== 'POST'
    || result.responsePath !== '/ops-poi/poi-items/pageQuery'
    || result.responseStatus < 200
    || result.responseStatus >= 300
    || result.mutationAttempted !== false
    || result.cleanupVerified !== true
  ) {
    throw new Error('门店商品名称查询未达到唯一命中、只读执行和状态恢复终态');
  }
}

function requireStoreProductSearchResult(value: unknown): ProductCenterStoreProductSearchResult {
  if (!value || typeof value !== 'object') throw new Error('门店商品名称查询断言缺少执行结果');
  const result = value as Partial<ProductCenterStoreProductSearchResult>;
  if (
    typeof result.trigger !== 'string'
    || typeof result.locatorCount !== 'number'
    || typeof result.resultCount !== 'number'
    || typeof result.responseMethod !== 'string'
    || typeof result.responsePath !== 'string'
    || typeof result.responseStatus !== 'number'
    || typeof result.selectedServerId !== 'number'
    || typeof result.mutationAttempted !== 'boolean'
    || typeof result.cleanupVerified !== 'boolean'
  ) {
    throw new Error('门店商品名称查询执行结果结构无效');
  }
  return result as ProductCenterStoreProductSearchResult;
}

function resolveValue(value: unknown, context: ProductCenterRecipeExecutionContext): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, context));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (typeof record.$ref === 'string') return resolveReference(record.$ref, context);
  return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, resolveValue(child, context)]));
}

function resolveReference(reference: string, context: ProductCenterRecipeExecutionContext): unknown {
  const [root, ...segments] = reference.split('.');
  const roots: Record<string, unknown> = {
    $record: context.record,
    $case: context.sopCase ?? context.createDefinition ?? context.lowDependencyCase ?? context.highDependencyCase ?? context.negativeCase,
    $recipe: context.recipe,
    $result: context.results,
  };
  if (!(root in roots)) throw new Error(`无法解析 Recipe 绑定：${reference}`);
  let current = roots[root];
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      throw new Error(`无法解析 Recipe 绑定：${reference}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

async function verifyCreatedApi(
  factory: ProductCenterCreateDataFactory,
  context: ProductCenterRecipeExecutionContext,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<void> {
  const createContext = requireCreateContextRecord(context);
  const created = await waitUntil(
    () => factory.findPrimary(createContext),
    (value): value is ProductCenterNamedRecord => value?.name === createContext.originalIdentity,
    { timeout: 60_000, interval: 500, message: `${context.recipe.caseId} UI 创建后 API 未找到主实体` },
  );
  if (!created) throw new Error(`${context.recipe.caseId} UI 创建后 API 未返回主实体`);
  const record = await factory.registerCreated(createContext, created, cleanupRegistry);
  context.record = record;
  executionLedger.markPhase(record.checkpointEntryId, 'mutation-observed');
  executionLedger.markPhase(record.checkpointEntryId, 'api-verified');
}

async function verifyApiState(
  context: ProductCenterRecipeExecutionContext,
  coreFactory: ProductCenterSopDataFactory,
  lowFactory: ProductCenterLowDependencyDataFactory,
  highFactory: ProductCenterHighDependencyDataFactory,
  action: 'edit' | 'delete',
): Promise<void> {
  await waitUntil(
    () => {
      if (context.group === 'low') {
        const record = requireLowDependencyRecord(context);
        return action === 'edit' ? lowFactory.verifyEdited(record) : lowFactory.verifyAbsent(record);
      }
      if (context.group === 'high') {
        const record = requireHighDependencyRecord(context);
        return action === 'edit' ? highFactory.verifyEdited(record) : highFactory.verifyAbsent(record);
      }
      const record = requireCoreSeedRecord(context);
      return action === 'edit' ? coreFactory.verifyEdited(record) : coreFactory.verifyAbsent(record);
    },
    (verified) => verified,
    { timeout: 60_000, interval: 500, message: `${context.recipe.caseId} ${action} 后服务端终态不正确` },
  );
}

async function verifyEditedUi(page: Page, context: ProductCenterRecipeExecutionContext): Promise<void> {
  if (context.group === 'low') {
    return new ProductCenterLowDependencySopFlow(page).verifyEditedUi(
      requireLowDependencyCaseContext(context),
      requireLowDependencyRecord(context),
    );
  }
  if (context.group === 'high') {
    return new ProductCenterHighDependencySopFlow(page).verifyEditedUi(
      requireHighDependencyCaseContext(context),
      requireHighDependencyRecord(context),
    );
  }
  return new ProductCenterSopPage(page).verifyEditedUi(requireSopCaseContext(context), requireCoreSeedRecord(context));
}

async function verifyDeletedUi(page: Page, context: ProductCenterRecipeExecutionContext): Promise<void> {
  if (context.group === 'low') {
    return new ProductCenterLowDependencySopFlow(page).verifyDeletedUi(
      requireLowDependencyCaseContext(context),
      requireLowDependencyRecord(context),
    );
  }
  if (context.group === 'high') {
    return new ProductCenterHighDependencySopFlow(page).verifyDeletedUi(
      requireHighDependencyCaseContext(context),
      requireHighDependencyRecord(context),
    );
  }
  return new ProductCenterSopPage(page).verifyDeletedUi(requireSopCaseContext(context), requireCoreSeedRecord(context));
}

async function verifyCategoryChildBlockedApi(
  factory: ProductCenterCategoryNegativeDataFactory,
  context: ProductCenterRecipeExecutionContext,
  cleanupRegistry: CleanupRegistry,
): Promise<void> {
  const record = requireCategoryWithProductRecord(context);
  const [parent, product, childUnderParent, childGlobal] = await Promise.all([
    factory.findCategory(record.parentCategoryName),
    factory.findProduct(record.productName),
    factory.findChildCategory(record.parentCategoryId, record.childCategoryName),
    factory.findCategory(record.childCategoryName),
  ]);
  const createdChild = childUnderParent ?? childGlobal;
  if (createdChild) {
    factory.registerCreatedChild(cleanupRegistry, record, createdChild);
    throw new Error(`产品行为不符合规则：分类下已有商品时仍创建了子分类 ${record.childCategoryName}`);
  }
  if (parent?.id !== record.parentCategoryId) {
    throw new Error('分类关系阻断验证失败：前置父分类不存在');
  }
  if (product?.id !== record.productId) {
    throw new Error('分类关系阻断验证失败：前置商品不存在');
  }
}

async function verifyCategoryChildBlockedUi(
  page: Page,
  context: ProductCenterRecipeExecutionContext,
): Promise<void> {
  const record = requireCategoryWithProductRecord(context);
  const negativePage = new ProductCenterNegativePage(page);
  await negativePage.openCategoryTree();
  if (await negativePage.isChildCategoryVisible(record.parentCategoryName, record.childCategoryName)) {
    throw new Error('产品行为不符合规则：分类页面仍显示候选子分类');
  }
}

async function verifyMethodDetailBoundary(
  page: Page,
  api: ProductCenterApi,
  context: ProductCenterRecipeExecutionContext,
  input: Readonly<Record<string, unknown>>,
): Promise<void> {
  const result = requireMethodDetailBoundaryResult(input.result);
  const maxLength = requireNumber(input.maxLength, 'maxLength');
  const record = requireCoreSeedRecord(context);
  if (result.maxLengthAttribute !== String(maxLength)) {
    throw new Error('做法明细名称 maxlength 属性不正确');
  }
  if (result.inputLengthBeforeSubmit !== maxLength) {
    throw new Error('做法明细名称提交前未按最大长度截断');
  }
  if (result.responseMethod !== 'POST' || result.responseStatus < 200 || result.responseStatus >= 300) {
    throw new Error('做法明细名称保存请求未成功');
  }
  const detail = await api.methodDetail(record.id);
  const storedDetailName = findFirstMethodOptionName(detail);
  const expectedDetailName = result.requestedDetailName.slice(0, maxLength);
  if (storedDetailName !== expectedDetailName) {
    throw new Error('做法明细名称 API 终态未保留前一百个字符');
  }
  await new ProductCenterCreateSopPage(page).expectMethodDetailVisible(record.id, expectedDetailName);
}

function verifyBoundary(input: Readonly<Record<string, unknown>>): void {
  const result = input.result;
  if (!result || typeof result !== 'object') throw new Error('边界断言缺少执行结果');
  const boundary = result as Record<string, unknown>;
  const maxLength = requireNumber(input.maxLength, 'maxLength');
  const acceptedLength = requireNumber(input.acceptedLength, 'acceptedLength');
  if (boundary.maxLengthAttribute !== String(maxLength)) throw new Error('边界 maxlength 属性不正确');
  if (typeof boundary.acceptedValue !== 'string' || boundary.acceptedValue.length !== acceptedLength) {
    throw new Error('边界允许值长度不正确');
  }
  if (typeof boundary.rejectedValue !== 'string' || boundary.rejectedValue.length !== maxLength) {
    throw new Error('边界拒绝值未按最大长度截断');
  }
}

function verifyNegative(input: Readonly<Record<string, unknown>>): void {
  const result = input.result;
  if (!result || typeof result !== 'object') throw new Error('负向断言缺少执行结果');
  const negative = result as Record<string, unknown>;
  if (negative.success !== true) throw new Error('负向场景未达到预期终态');
  if (typeof negative.mutationCount === 'number' && negative.mutationCount !== 0) {
    throw new Error('负向场景触发了非预期变更请求');
  }
}

type MethodDetailBoundaryResult = {
  requestedDetailName: string;
  requestedLength: number;
  inputLengthBeforeSubmit: number;
  maxLengthAttribute: string | null;
  responseStatus: number;
  responseMethod: string;
  responsePath: string;
};

function requireMethodDetailBoundaryResult(value: unknown): MethodDetailBoundaryResult {
  if (!value || typeof value !== 'object') throw new Error('做法明细名称边界断言缺少执行结果');
  const result = value as Partial<MethodDetailBoundaryResult>;
  if (
    typeof result.requestedDetailName !== 'string'
    || typeof result.requestedLength !== 'number'
    || typeof result.inputLengthBeforeSubmit !== 'number'
    || (result.maxLengthAttribute !== null && typeof result.maxLengthAttribute !== 'string')
    || typeof result.responseStatus !== 'number'
    || typeof result.responseMethod !== 'string'
    || typeof result.responsePath !== 'string'
  ) {
    throw new Error('做法明细名称边界执行结果结构无效');
  }
  return result as MethodDetailBoundaryResult;
}

function findFirstMethodOptionName(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findFirstMethodOptionName(item);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.options)) {
    const option = record.options.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined;
    if (typeof option?.name === 'string') return option.name;
  }
  for (const child of Object.values(record)) {
    const match = findFirstMethodOptionName(child);
    if (match) return match;
  }
  return undefined;
}

function requireCoreEntityKey(value: unknown): ProductCenterCoreEntityKey {
  if (value === 'category' || value === 'method' || value === 'material' || value === 'seasoning' || value === 'bom') return value;
  throw new Error(`不支持核心实体：${String(value)}`);
}

function requireLowDependencyEntityKey(value: unknown): LowDependencyEntityKey {
  if (value === 'material-category' || value === 'taste' || value === 'spec' || value === 'addon' ||
    value === 'print-stall' || value === 'tax' || value === 'description-tag' || value === 'statistic-tag') return value;
  throw new Error(`不支持低依赖实体：${String(value)}`);
}

function requireHighDependencyEntityKey(value: unknown): HighDependencyEntityKey {
  if (value === 'recipe-ingredient' || value === 'menu' || value === 'printer' || value === 'combo') return value;
  throw new Error(`不支持高依赖实体：${String(value)}`);
}

function requireCoreAction(action: AutomationRecipe['action']): 'edit' | 'delete' {
  if (action === 'edit' || action === 'delete') return action;
  throw new Error(`核心 seed 不支持动作：${action}`);
}

function requireCreateDefinition(entityKey: ProductCenterCoreEntityKey): ProductCenterCreateSopDefinition {
  const match = productCenterCreateSopCatalog.find((item) => item.entityKey === entityKey);
  if (!match) throw new Error(`未找到创建 SOP：${entityKey}`);
  return match;
}

function requireSopCase(
  recipe: AutomationRecipe,
  entityKey: ProductCenterCoreEntityKey,
  action: 'edit' | 'delete',
): ProductCenterSopCase {
  const match = generateProductCenterSopCases(productCenterSopCatalog)
    .find((item) => item.entityKey === entityKey && item.action === action);
  if (!match) throw new Error(`未找到核心 SOP：${recipe.caseId}`);
  return match;
}

function requireLowDependencyCase(recipe: AutomationRecipe, entityKey: LowDependencyEntityKey): LowDependencySopCase {
  const action = requireCoreAction(recipe.action);
  const match = generateLowDependencySopCases(lowDependencySopCatalog)
    .find((item) => item.entityKey === entityKey && item.action === action);
  if (!match) throw new Error(`未找到低依赖 SOP：${recipe.caseId}`);
  return match;
}

function requireHighDependencyCase(recipe: AutomationRecipe, entityKey: HighDependencyEntityKey): HighDependencySopCase {
  const action = requireCoreAction(recipe.action);
  const match = generateHighDependencySopCases(highDependencySopCatalog)
    .find((item) => item.entityKey === entityKey && item.action === action);
  if (!match) throw new Error(`未找到高依赖 SOP：${recipe.caseId}`);
  return match;
}

function findNegativeCase(caseId: string): ProductCenterNegativeCase | undefined {
  const id = caseId.replace(/^negative:/, '');
  return productCenterNegativeSopCatalog.find((item) => item.id === id);
}

function requireRuntime(context: ProductCenterRecipeExecutionContext): ProductCenterRecipeRuntime {
  if (!context.page) throw new Error(`Recipe ${context.recipe.id} 缺少 Page 上下文`);
  if (!context.api) throw new Error(`Recipe ${context.recipe.id} 缺少 API 上下文`);
  return {
    page: context.page,
    api: context.api,
    recipe: context.recipe,
    sopCase: context.sopCase,
    createDefinition: context.createDefinition,
    lowDependencyCase: context.lowDependencyCase,
    highDependencyCase: context.highDependencyCase,
    negativeCase: context.negativeCase,
    record: context.record,
    results: context.results,
  };
}

function requireItemRequiredValidationResult(value: unknown): ProductCenterItemRequiredValidationResult {
  if (!value || typeof value !== 'object') throw new Error('商品名称必填断言缺少执行结果');
  const result = value as Partial<ProductCenterItemRequiredValidationResult>;
  const numericFields = [
    result.requiredErrorCount,
    result.successMessageCount,
    result.mutationCount,
    result.beforeTotalCount,
    result.afterTotalCount,
  ];
  if (typeof result.route !== 'string' || numericFields.some((field) => typeof field !== 'number')) {
    throw new Error('商品名称必填断言执行结果结构无效');
  }
  return result as ProductCenterItemRequiredValidationResult;
}

function requireSopCaseContext(context: ProductCenterRecipeExecutionContext): ProductCenterSopCase {
  if (!context.sopCase) throw new Error(`Recipe ${context.recipe.id} 缺少核心 SOP 定义`);
  return context.sopCase;
}

function requireCreateDefinitionContext(context: ProductCenterRecipeExecutionContext): ProductCenterCreateSopDefinition {
  if (!context.createDefinition) throw new Error(`Recipe ${context.recipe.id} 缺少创建 SOP 定义`);
  return context.createDefinition;
}

function requireLowDependencyCaseContext(context: ProductCenterRecipeExecutionContext): LowDependencySopCase {
  if (!context.lowDependencyCase) throw new Error(`Recipe ${context.recipe.id} 缺少低依赖 SOP 定义`);
  return context.lowDependencyCase;
}

function requireHighDependencyCaseContext(context: ProductCenterRecipeExecutionContext): HighDependencySopCase {
  if (!context.highDependencyCase) throw new Error(`Recipe ${context.recipe.id} 缺少高依赖 SOP 定义`);
  return context.highDependencyCase;
}

function requireCreateContextRecord(context: ProductCenterRecipeExecutionContext): ProductCenterCreateContext {
  if (!context.record || !('cleanupIdentities' in context.record) || !('metadata' in context.record)) {
    throw new Error(`Recipe ${context.recipe.id} 缺少创建上下文`);
  }
  return context.record as ProductCenterCreateContext;
}

function requireItemCreateRecord(context: ProductCenterRecipeExecutionContext): ProductCenterItemCreateRecord {
  if (
    !context.record
    || !('entityKey' in context.record)
    || context.record.entityKey !== 'item'
    || !('id' in context.record)
    || typeof context.record.id !== 'number'
    || !('checkpointEntryId' in context.record)
  ) {
    throw new Error(`Recipe ${context.recipe.id} 缺少已登记的零元商品记录`);
  }
  return context.record as ProductCenterItemCreateRecord;
}

function requireItemCreateContextForCleanup(
  context: ProductCenterRecipeExecutionContext,
): ProductCenterItemCreateContext {
  if (!context.record
    || !('entityKey' in context.record)
    || context.record.entityKey !== 'item'
    || !('originalIdentity' in context.record)
    || typeof context.record.originalIdentity !== 'string') {
    throw new Error(`Recipe ${context.recipe.id} 缺少商品 UI 零残留身份`);
  }
  return context.record as ProductCenterItemCreateContext;
}

function requireCoreSeedRecord(context: ProductCenterRecipeExecutionContext): ProductCenterSopSeedRecord {
  return requireSeedRecord(context, '核心') as ProductCenterSopSeedRecord;
}

function requireLowDependencyRecord(context: ProductCenterRecipeExecutionContext): LowDependencySeedRecord {
  return requireSeedRecord(context, '低依赖') as LowDependencySeedRecord;
}

function requireHighDependencyRecord(context: ProductCenterRecipeExecutionContext): HighDependencySeedRecord {
  return requireSeedRecord(context, '高依赖') as HighDependencySeedRecord;
}

function requireCategoryWithProductRecord(
  context: ProductCenterRecipeExecutionContext,
): CategoryWithProductSeedRecord {
  const record = requireSeedRecord(context, '分类关系阻断');
  if (!('parentCategoryId' in record) || !('childCategoryName' in record)) {
    throw new Error(`Recipe ${context.recipe.id} 缺少分类关系阻断前置记录`);
  }
  return record as CategoryWithProductSeedRecord;
}

function requireSeedRecord(context: ProductCenterRecipeExecutionContext, label: string): ProductCenterRecipeRuntimeRecord {
  if (!context.record || !('checkpointEntryId' in context.record)) {
    throw new Error(`Recipe ${context.recipe.id} 缺少${label}前置记录`);
  }
  return context.record;
}

function optionalLedgerRecord(context: ProductCenterRecipeExecutionContext): { checkpointEntryId: string } | undefined {
  return context.record && 'checkpointEntryId' in context.record && typeof context.record.checkpointEntryId === 'string'
    ? { checkpointEntryId: context.record.checkpointEntryId }
    : undefined;
}

function requireLedgerRecord(context: ProductCenterRecipeExecutionContext): { checkpointEntryId: string } {
  const record = optionalLedgerRecord(context);
  if (!record) throw new Error(`Recipe ${context.recipe.id} 缺少可登记的 checkpoint`);
  return record;
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== 'number') throw new Error(`断言输入 ${name} 必须为数字`);
  return value;
}
