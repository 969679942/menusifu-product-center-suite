import path from 'node:path';
import { test, type Page, type Request } from '@playwright/test';
import type { CleanupRegistry } from '../api/product-center/cleanup-registry';
import type { ProductCenterApi } from '../api/product-center/product-center-api';
import type { ProductCenterExecutionLedger } from '../api/product-center/execution-ledger';
import { extractCreatedRecord } from '../api/product-center/created-record';
import { ProductCenterCreateSopFlow } from '../flows/product-center/product-center-create-sop.flow';
import { GroupListPage } from '../pages/product-management/group-list.page';
import { createAddOnsPage, createCombosPage, createFlavorsPage, createPreparationsPage, createSpecificationsPage } from '../pages/product-management/group-list.factory';
import { generateHighDependencySopCases, highDependencySopCatalog } from '../sop/product-center/product-center-high-dependency-sop.catalog';
import { generateLowDependencySopCases, lowDependencySopCatalog } from '../sop/product-center/product-center-low-dependency-sop.catalog';
import { productCenterCreateSopCatalog } from '../sop/product-center/product-center-create-sop.catalog';
import { productCenterSopCatalog } from '../sop/product-center/product-center-sop.catalog';
import { generateProductCenterSopCases } from '../sop/product-center/product-center-sop-generator';
import { ProductCenterHighDependencyDataFactory } from '../test-data/product-center/sop/product-center-high-dependency-data.factory';
import { ProductCenterLowDependencyDataFactory } from '../test-data/product-center/sop/product-center-low-dependency-data.factory';
import { ProductCenterCreateDataFactory } from '../test-data/product-center/sop/product-center-create-data.factory';
import { ProductCenterSopDataFactory } from '../test-data/product-center/sop/product-center-sop-data.factory';
import { ProductCenterItemCreateDataFactory, readSkuIds } from '../test-data/product-center/product-center-item-create-data.factory';
import { ItemCreateFlow } from '../flows/item-create.flow';
import { createItemListPage } from '../pages/product-management/item/item-list.page';
import { AddonItem216Factory } from '../test-data/product-center/item-216/addon-item-216.factory';
import { StandardItem216Flow } from '../flows/product-center/item-216/standard-item-216.flow';
import { StandardItem216Factory } from '../test-data/product-center/item-216/standard-item-216.factory';
import { type GroupAutomationBinding, type GroupEvidenceKind, type GroupExecutionHandlerId } from './product-center-group-automation';
import { waitUntil } from './wait';
import { finishExecutableOperation, startExecutableOperation } from './executable-operation-receipt';
import type { RuntimeAssertionReceipt } from '../automation/system-test/system-test-runtime-contract';
import { addonGroupContainsItem, businessMutationForEntity, containsNamedValue, containsScalarValue, entityForBinding, extractArray, findNamedAdditionalPrice, findNamedSelectionRule, groupQueryResetRestorationFailure as evaluateGroupQueryResetRestorationFailure, namedRecords, normalizeUiText, readFirstSkuId, requireGroupRecord, responseIndicatesBusinessRejection, type GroupEntity } from './product-center-group-runner-helpers';
import {
  runComboV2ListContractCase,
  runComboV2QueryContractCase,
  runComboV2FormContractCase,
  runComboV2CreateContractCase,
  runComboV2ReferenceContractCase,
  runComboV2PriceSourceContractCase,
} from '../adapters/product-center/product-center-group-combo-v2-cases';
import {
  ObservedProductDifferenceError,
  ensureChineseValidationLocale,
  ensureEnglishValidationLocale,
  assertAddonGroupRule,
  assertionReceipt,
  cleanupEvidence,
  readProductCenterGroupObservedDifferenceEvidence as readObservedDifferenceEvidence,
} from '../adapters/product-center/product-center-group-combo-v2-support';

export function groupQueryResetRestorationFailure(input: {
  identity: string;
  keyword: string;
  beforeCount: number;
  matchedRows: string[];
  resetRows: string[];
}): string | null {
  return evaluateGroupQueryResetRestorationFailure(input);
}

function groupPageForEntity(entity: GroupEntity, page: Page): GroupListPage {
  if (entity === 'spec') return createSpecificationsPage(page);
  if (entity === 'taste') return createFlavorsPage(page);
  if (entity === 'method') return createPreparationsPage(page);
  if (entity === 'addon') return createAddOnsPage(page);
  return createCombosPage(page);
}

export async function runProductCenterGroupCase(input: {
  binding: GroupAutomationBinding;
  page: Page;
  productCenterApi: ProductCenterApi;
  cleanupRegistry: CleanupRegistry;
  executionLedger: ProductCenterExecutionLedger;
  executionId?: string;
  allowObservedProductDrift?: boolean;
}): Promise<{
  handlerId: GroupExecutionHandlerId;
  evidence: GroupEvidenceKind[];
  assertionIds: string[];
  assertionReceipts?: RuntimeAssertionReceipt[];
  productDifference?: Record<string, unknown> | null;
  cleanup: {
    checkpointPath: string;
    runId: string;
    entries: ReturnType<ProductCenterExecutionLedger['snapshot']>['entries'];
  } | null;
}> {
  const { binding, page, productCenterApi, cleanupRegistry, executionLedger } = input;
  const findingReplayAllowed = input.allowObservedProductDrift === true
    && binding.blockClassification === 'observed-product-drift';
  const sourceRecoveryAllowed = (process.env.PC_GROUP_SOURCE_RECOVERY_CASE_IDS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .includes(binding.caseId)
    && binding.blockClassification === 'source-evidence-blocked';
  if ((!binding.generationAllowed && !findingReplayAllowed && !sourceRecoveryAllowed) || !binding.handlerId) {
    throw new Error(`${binding.caseId} 缺少已审核专用 handler，禁止执行通用探测`);
  }
  if (binding.handlerId === 'group-list-structure'
    || binding.handlerId === 'attribute-set-list-structure'
    || binding.handlerId === 'attribute-set-row-menu') {
    const assertionIds = await runReadOnlyCase(binding, page, input.executionId);
    return {
      handlerId: binding.handlerId,
      evidence: binding.handlerId === 'attribute-set-row-menu'
        ? ['navigation', 'ui-assertion', 'api-read', 'no-write']
        : ['navigation', 'ui-assertion', 'api-read'],
      assertionIds,
      cleanup: null,
    };
  }
  if (binding.handlerId === 'combo-v2-list-contract') {
    const assertionIds = await runComboV2ListContractCase(binding, page, productCenterApi);
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-read', 'no-write'],
      assertionIds,
      cleanup: null,
    };
  }
  if (binding.handlerId === 'combo-v2-query-contract') {
    const assertionIds = await runComboV2QueryContractCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-read', 'api-mutation', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'group-query-reset') {
    const assertionIds = await runGroupQueryResetCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-read', 'api-mutation', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'group-multilang-query') {
    const assertionIds = await runMultilangQueryCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-read', 'api-mutation', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'group-create-cancel') {
    const assertionIds = await runCreateCancelCase(binding, page, productCenterApi);
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'no-write', 'api-read'],
      assertionIds,
      cleanup: null,
    };
  }
  if (binding.handlerId === 'existing-detail-cancel') {
    const assertionIds = await runExistingDetailCancelCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'no-write', 'api-read', 'api-mutation', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'group-required-validation') {
    const assertionIds = await runRequiredValidationCase(binding, page, productCenterApi);
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'no-persist', 'api-read'],
      assertionIds,
      cleanup: null,
    };
  }
  if (binding.handlerId === 'group-empty-options-validation') {
    const assertionIds = await runEmptyOptionsValidationCase(binding, page, productCenterApi);
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'no-persist', 'api-read'],
      assertionIds,
      cleanup: null,
    };
  }
  if (binding.handlerId === 'group-name-duplicate-validation') {
    const assertionIds = await runGroupNameDuplicateValidationCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'no-persist', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'existing-detail-required-validation'
    || binding.handlerId === 'existing-detail-duplicate-validation'
    || binding.handlerId === 'method-group-and-detail-duplicate-validation') {
    const assertionIds = await runExistingDetailValidationCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'no-write', 'no-persist', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'empty-group-delete') {
    const assertionIds = await runEmptyGroupDeleteCase(binding, page, productCenterApi, cleanupRegistry, executionLedger);
    return {
      handlerId: binding.handlerId,
      evidence: [
        'navigation',
        'ui-assertion',
        ...(binding.mode === 'form-validation' ? ['no-persist' as const] : []),
        'api-mutation',
        'api-read',
        'cleanup',
      ],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'spec-cross-group-option-duplicate-validation') {
    const assertionIds = await runSpecCrossGroupOptionDuplicateCase(binding, page, productCenterApi, cleanupRegistry, executionLedger);
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'no-persist', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'spec-full-field-create') {
    const assertionIds = await runSpecFullFieldCreateCase(binding, page, productCenterApi, cleanupRegistry, executionLedger);
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'single-detail-delete-boundary') {
    const assertionIds = await runSingleDetailDeleteBoundaryCase(binding, page, productCenterApi, cleanupRegistry, executionLedger);
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'unreferenced-option-detail-delete') {
    const assertionIds = await runUnreferencedOptionDetailDeleteCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: binding.mode === 'form-validation'
        ? ['navigation', 'ui-assertion', 'no-persist', 'api-read']
        : ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'referenced-option-detail-delete-blocked') {
    const assertionIds = await runReferencedOptionDetailDeleteBlockedCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'downstream', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'referenced-option-detail-delete-confirmed') {
    const assertionIds = await runReferencedOptionDetailDeleteConfirmedCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'downstream', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'combo-empty-items-validation') {
    const assertionIds = await runComboEmptyItemsValidationCase(binding, page, productCenterApi);
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-read', 'no-persist'],
      assertionIds,
      cleanup: null,
    };
  }
  if (binding.handlerId === 'combo-v2-form-contract') {
    const assertionIds = await runComboV2FormContractCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-read', 'api-mutation', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'combo-v2-pkg030-validation') {
    const itemList = createItemListPage(page);
    await itemList.openForResidueCheck();
    await itemList.expectLoaded();
    const result = await runComboV2CreateContractCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'no-persist', 'api-read'],
      assertionIds: result.assertionIds,
      ...(result.assertionReceipts.length > 0 ? { assertionReceipts: result.assertionReceipts } : {}),
      ...(result.productDifference ? { productDifference: result.productDifference } : {}),
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'combo-v2-create-contract') {
    const result = await runComboV2CreateContractCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: binding.mode === 'form-validation'
        ? ['navigation', 'ui-assertion', 'no-persist', 'api-read']
        : ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'cleanup'],
      assertionIds: result.assertionIds,
      ...(result.assertionReceipts.length > 0 ? { assertionReceipts: result.assertionReceipts } : {}),
      ...(result.productDifference ? { productDifference: result.productDifference } : {}),
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'combo-v2-reference-contract') {
    const assertionIds = await runComboV2ReferenceContractCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'downstream', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'combo-v2-price-source-contract') {
    const assertionIds = await runComboV2PriceSourceContractCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'downstream', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'unreferenced-spec-detail-add') {
    const assertionIds = await runUnreferencedSpecDetailAddCase(binding, page, productCenterApi, cleanupRegistry, executionLedger);
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'cleanup', 'downstream'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'spec-option-twenty-character-boundary') {
    const assertionIds = await runSpecOptionTwentyCharacterBoundary(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'method-create-required-only') {
    const assertionIds = await runMethodCreateCase(binding, page, productCenterApi, cleanupRegistry, executionLedger);
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'option-group-create-required-only') {
    const assertionIds = await runSimpleOptionGroupCreateCase(binding, page, productCenterApi, cleanupRegistry, executionLedger);
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'option-group-boundary-create') {
    const assertionIds = await runOptionGroupBoundaryCase(binding, page, productCenterApi, cleanupRegistry, executionLedger);
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'addon-product-selection' || binding.handlerId === 'combo-product-selection') {
    const assertionIds = await runProductSelectionCase(binding, page, productCenterApi, cleanupRegistry, executionLedger);
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-read', 'api-mutation', 'no-write', 'no-persist', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'addon-group-create' || binding.handlerId === 'combo-group-create') {
    const assertionIds = await runProductBackedGroupCreateCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-read', 'api-mutation', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'product-backed-group-duplicate-validation') {
    const assertionIds = await runProductBackedGroupDuplicateValidationCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'no-persist', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'combo-cross-type-name-create') {
    const assertionIds = await runComboCrossTypeNameCreateCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'combo-product-selection-cancel') {
    const assertionIds = await runComboProductSelectionCancelCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'no-write', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'combo-multi-sku-create') {
    const assertionIds = await runComboMultiSkuCreateCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'referenced-attribute-group-sync') {
    const assertionIds = await runReferencedAttributeGroupSyncCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'downstream', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'detached-reference-group-delete') {
    const assertionIds = await runDetachedReferenceGroupDeleteCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'downstream', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'added-option-not-propagated'
    || binding.handlerId === 'renamed-option-propagated') {
    const assertionIds = await runAttributeOptionPropagationCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'downstream', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'addon-added-option-not-propagated') {
    const assertionIds = await runAddonAddedOptionNotPropagatedCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'downstream', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'addon-referenced-option-delete-sync') {
    const assertionIds = await runAddonReferencedOptionDeleteSyncCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'downstream', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'addon-nonprice-field-sync') {
    const assertionIds = await runAddonNonpriceFieldSyncCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'downstream', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'group-default-price-not-propagated') {
    const assertionIds = await runGroupDefaultPriceIsolationCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'downstream', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'addon-product-row-delete') {
    const assertionIds = await runAddonProductRowDeleteCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'referenced-group-delete-blocked') {
    const assertionIds = await runReferencedGroupDeleteBlockedCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'downstream', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'referenced-group-delete-confirmed') {
    const assertionIds = await runReferencedGroupDeleteConfirmedCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'downstream', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'unreferenced-group-delete-confirmed') {
    const assertionIds = await runUnreferencedGroupDeleteConfirmedCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'combo-nonempty-delete') {
    const assertionIds = await runComboNonemptyDeleteCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-mutation', 'api-read', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'addon-group-validation') {
    const assertionIds = await runAddonGroupValidationCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-read', 'api-mutation', 'no-persist', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  if (binding.handlerId === 'addon-single-surcharge-format') {
    const assertionIds = await runAddonSingleSurchargeFormatCase(
      binding,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    );
    return {
      handlerId: binding.handlerId,
      evidence: ['navigation', 'ui-assertion', 'api-read', 'api-mutation', 'no-persist', 'cleanup'],
      assertionIds,
      cleanup: cleanupEvidence(executionLedger),
    };
  }
  return assertNever(binding.handlerId);
}

async function runGroupQueryResetCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const entity = entityForBinding(binding);
  const pageObject = groupPageForEntity(entity, page);
  const assertionIds: string[] = [];
  let identity: string | undefined;
  let serverId: number | string | undefined;
  let executionError: unknown;

  try {
    const record = await seedGroupRecord(entity, productCenterApi, cleanupRegistry);
    identity = record.originalIdentity;
    serverId = record.serverId;
    const seededEntries = executionLedger.snapshot().entries;
    for (const entry of seededEntries) {
      executionLedger.markPhase(entry.entryId, 'mutation-observed');
      executionLedger.markPhase(entry.entryId, 'api-verified');
    }
    const apiRecords = await groupRecordsByEntity(entity, productCenterApi, identity);
    if (apiRecords.length !== 1) {
      throw new Error(`${binding.caseId} 查询夹具 API 回读不唯一：${identity} count=${apiRecords.length}`);
    }

    await pageObject.open();
    const beforeCount = await pageObject.readVisibleResultCount();
    if (beforeCount < 1) throw new Error(`${binding.caseId} 自建查询夹具未进入列表：${identity}`);
    const keyword = identity.slice(-Math.min(12, identity.length));
    await pageObject.searchAndWait(keyword);
    const matchedRows = await pageObject.readVisibleRowTexts();
    if (matchedRows.length < 1
      || matchedRows.some((text) => !text.includes(keyword))
      || !matchedRows.some((text) => text.includes(identity!))) {
      throw new Error(`${binding.caseId} 查询结果未精确命中自建夹具：${identity}`);
    }
    if (binding.expectedResults.length === 2) assertionIds.push(assertionReceipt(binding, 0));

    await pageObject.resetSearchAndWait();
    if (await pageObject.readSearchValue() !== '') throw new Error(`${binding.caseId} 重置后搜索条件未清空`);
    const resetRows = await pageObject.readVisibleRowTexts();
    const restorationFailure = groupQueryResetRestorationFailure({
      identity,
      keyword,
      beforeCount,
      matchedRows,
      resetRows,
    });
    if (restorationFailure) throw new Error(`${binding.caseId} ${restorationFailure}`);
    assertionIds.push(assertionReceipt(binding, binding.expectedResults.length - 1));
    executionLedger.markPhase(record.checkpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }

  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero || (serverId !== undefined && !cleanup.serverIds.map(String).includes(String(serverId)))) {
    throw new Error(`${binding.caseId} 查询夹具清理未覆盖服务端 ID ${serverId ?? '<seed-failed>'}`);
  }
  if (identity) await verifyUiResidueZero(pageObject, [identity]);
  if (executionError) throw executionError;
  if (assertionIds.length !== binding.expectedResults.length) {
    throw new Error(`${binding.caseId} 查询重置断言收据数量不完整：${assertionIds.length}/${binding.expectedResults.length}`);
  }
  return assertionIds;
}

async function runReferencedAttributeGroupSyncCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  let result: Record<string, unknown> | undefined;
  let cleanupCompleted = false;
  try {
    const entity = entityForBinding(binding);
    if (!['spec', 'taste', 'method', 'addon'].includes(entity)) {
      throw new Error(`${binding.caseId} 不支持的属性组同步实体：${entity}`);
    }
    result = await new StandardItem216Flow(page, productCenterApi, cleanupRegistry)
      .verifyAttributeGroupSynchronization(binding.caseId, entity as 'spec' | 'taste' | 'method' | 'addon');
    const rename = result.rename as { previousName: string; updatedName: string };
    const itemIdentities = result.itemIdentities as string[];
    const apiSnapshots = result.apiSnapshots as Array<{ itemId: number; updatedNamePresent: boolean }>;
    const uiSnapshots = result.uiSnapshots as Array<{
      itemId: number;
      updated: { selectedGroupCount: number };
      previous: { selectedGroupCount: number };
    }>;
    if (itemIdentities.length !== 2 || apiSnapshots.length !== 2 || uiSnapshots.length !== 2) {
      throw new Error(`${binding.caseId} 引用商品同步证据数量不完整`);
    }
    if (apiSnapshots.some((item) => !item.updatedNamePresent)
      || uiSnapshots.some((item) => item.updated.selectedGroupCount !== 1 || item.previous.selectedGroupCount !== 0)) {
      throw new Error(`${binding.caseId} 引用商品未全部同步属性组新名称`);
    }
    const assertionIds: string[] = [];
    const trackedEntryIds = result.checkpointEntryIds as string[];
    for (const entryId of trackedEntryIds) {
      executionLedger.markPhase(entryId, 'api-verified');
      executionLedger.markPhase(entryId, 'ui-verified');
    }
    const groupPage = groupPageForEntity(entityForBinding(binding), page);
    await groupPage.open();
    await groupPage.searchAndWait(rename.updatedName);
    await groupPage.expectIdentityRowContains(rename.updatedName, rename.updatedName);
    if (binding.expectedResults.length === 2) {
      assertionIds.push(assertionReceipt(binding, 0));
      if (apiSnapshots.length !== 2 || uiSnapshots.length !== 2) {
        throw new Error(`${binding.caseId} 商品同步 Claim 缺少双 owner 证据`);
      }
      assertionIds.push(assertionReceipt(binding, 1));
    } else {
      assertionIds.push(assertionReceipt(binding, 0));
    }
    const cleanup = await cleanupRegistry.cleanupAll();
    cleanupCompleted = true;
    if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 属性组同步夹具清理未收敛`);
    await verifyUiResidueZero(groupPage, [rename.previousName, rename.updatedName]);
    const itemList = createItemListPage(page);
    await itemList.openForResidueCheck();
    for (const identity of itemIdentities) {
      await itemList.fillSearchForResidueCheck(identity);
      await itemList.expectEmptySearchResults(10_000);
      if (namedRecords(await productCenterApi.productPage(identity), identity).length !== 0) {
        throw new Error(`${binding.caseId} 引用商品夹具仍有残留：${identity}`);
      }
    }
    return assertionIds;
  } finally {
    if (!cleanupCompleted) await cleanupRegistry.cleanupAll();
  }
}

async function runDetachedReferenceGroupDeleteCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const entity = entityForBinding(binding);
  if (!['spec', 'taste', 'method', 'addon'].includes(entity)) {
    throw new Error(`${binding.caseId} 不支持解除引用后删除：${entity}`);
  }
  const fixture = await new StandardItem216Flow(page, productCenterApi, cleanupRegistry)
    .detachReferencedAttributeGroup(binding.caseId, entity as 'spec' | 'taste' | 'method' | 'addon');
  const assertionIds: string[] = [];
  const ownerAfterDetach = JSON.stringify(await productCenterApi.productDetail(fixture.ownerId));
  if (ownerAfterDetach.includes(fixture.groupName)) {
    throw new Error(`${binding.caseId} owner API 仍保留组引用：${fixture.groupName}`);
  }
  if (binding.expectedResults.length > 1) assertionIds.push(assertionReceipt(binding, 0));
  const groupPage = groupPageForEntity(entity, page);
  let executionError: unknown;
  try {
    await groupPage.open();
    await groupPage.searchAndWait(fixture.groupName);
    await groupPage.waitForVisibleIdentityCount(fixture.groupName, 1);
    const response = await groupPage.deleteIdentityAndConfirm(fixture.groupName);
    const responseBody = await response.json().catch(() => null);
    if (!response.ok() || responseIndicatesBusinessRejection(response.status(), responseBody)) {
      throw new Error(`${binding.caseId} 解除引用后组删除失败 HTTP ${response.status()}：${JSON.stringify(responseBody)}`);
    }
    if ((await groupRecordsByEntity(entity, productCenterApi, fixture.groupName)).length !== 0) {
      throw new Error(`${binding.caseId} 组删除后 API 仍有记录：${fixture.groupName}`);
    }
    await groupPage.waitForVisibleIdentityCount(fixture.groupName, 0);
    await groupPage.expectEmptySearchResults();
    assertionIds.push(assertionReceipt(binding, binding.expectedResults.length - 1));
    executionLedger.markPhase(`standard-item-${entity}-${fixture.groupId}`, 'ui-verified');
    executionLedger.markPhase(`item-${fixture.ownerId}`, 'ui-verified');
  } catch (error) {
    executionError = error;
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 解除引用删除清理未收敛`);
  await verifyUiResidueZero(groupPage, [fixture.groupName]);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  await itemList.fillSearchForResidueCheck(fixture.ownerIdentity);
  await itemList.expectEmptySearchResults(10_000);
  if (namedRecords(await productCenterApi.productPage(fixture.ownerIdentity), fixture.ownerIdentity).length !== 0) {
    throw new Error(`${binding.caseId} owner 商品仍有残留`);
  }
  if (executionError) throw executionError;
  if (assertionIds.length !== binding.expectedResults.length) {
    throw new Error(`${binding.caseId} 解除引用删除断言收据数量不完整：${assertionIds.length}/${binding.expectedResults.length}`);
  }
  return assertionIds;
}

async function runAttributeOptionPropagationCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const entity = entityForBinding(binding);
  if (!['spec', 'taste', 'method'].includes(entity)) {
    throw new Error(`${binding.caseId} 不支持属性明细传播验证：${entity}`);
  }
  const flow = new StandardItem216Flow(page, productCenterApi, cleanupRegistry);
  const result = binding.handlerId === 'added-option-not-propagated'
    ? await flow.verifyAddedAttributeOptionNotPropagated(binding.caseId, entity as 'spec' | 'taste' | 'method')
    : await flow.verifyRenamedAttributeOptionSynchronization(binding.caseId, entity as 'spec' | 'taste' | 'method');
  const fixture = result.fixture as { checkpointEntryId: string; groupName: string };
  const groupPage = groupPageForEntity(entity, page);
  let executionError: unknown;
  const assertionIds: string[] = [];
  try {
    await groupPage.open();
    await groupPage.searchAndWait(fixture.groupName);
    if (binding.handlerId === 'added-option-not-propagated') {
      const originalOption = result.originalOption as string;
      const addedOption = result.addedOption as string;
      await groupPage.expectIdentityRowContains(fixture.groupName, originalOption);
      await groupPage.expectIdentityRowContains(fixture.groupName, addedOption);
      if (binding.expectedResults.length > 1) assertionIds.push(assertionReceipt(binding, 0));
      const ownerOptions = result.uiOptions as string[];
      if (!ownerOptions.includes(originalOption) || ownerOptions.includes(addedOption)) {
        throw new Error(`${binding.caseId} 商品侧未传播 Claim 证据不完整：${ownerOptions.join(',')}`);
      }
      assertionIds.push(assertionReceipt(binding, binding.expectedResults.length - 1));
    } else {
      const rename = result.rename as { previousName: string; updatedName: string };
      await groupPage.expectIdentityRowContains(fixture.groupName, rename.updatedName);
      assertionIds.push(assertionReceipt(binding, 0));
      if (binding.expectedResults.length > 1) {
        const apiSnapshots = result.apiSnapshots as Array<{ pricesBefore: unknown; pricesAfter: unknown }>;
        const uiSnapshots = result.uiSnapshots as Array<{ uiOptions: string[] }>;
        if (apiSnapshots.length !== 2
          || apiSnapshots.some((snapshot) => JSON.stringify(snapshot.pricesBefore) !== JSON.stringify(snapshot.pricesAfter))
          || uiSnapshots.length !== 2
          || uiSnapshots.some((snapshot) => !snapshot.uiOptions.includes(rename.updatedName)
            || snapshot.uiOptions.includes(rename.previousName))) {
          throw new Error(`${binding.caseId} 商品明细同步 Claim 证据不完整`);
        }
        assertionIds.push(assertionReceipt(binding, 1));
      }
    }
    for (const entryId of result.checkpointEntryIds as string[]) {
      executionLedger.markPhase(entryId, 'api-verified');
      executionLedger.markPhase(entryId, 'ui-verified');
    }
  } catch (error) {
    executionError = error;
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 属性明细传播夹具清理未收敛`);
  await verifyUiResidueZero(groupPage, [fixture.groupName]);
  const ownerIdentities = (result.ownerIdentities as string[] | undefined)
    ?? [result.ownerIdentity as string];
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  for (const identity of ownerIdentities) {
    await itemList.fillSearchForResidueCheck(identity);
    await itemList.expectEmptySearchResults(10_000);
    if (namedRecords(await productCenterApi.productPage(identity), identity).length !== 0) {
      throw new Error(`${binding.caseId} owner 商品仍有残留：${identity}`);
    }
  }
  if (executionError) throw executionError;
  if (assertionIds.length !== binding.expectedResults.length) {
    throw new Error(`${binding.caseId} 属性明细传播断言收据数量不完整：${assertionIds.length}/${binding.expectedResults.length}`);
  }
  return assertionIds;
}

async function runAddonAddedOptionNotPropagatedCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const flow = new StandardItem216Flow(page, productCenterApi, cleanupRegistry);
  const result = await flow.prepareAddedAddonOptionNotPropagated(binding.caseId);
  const fixture = result.fixture as { id: number; groupName: string; optionNames: string[]; checkpointEntryId: string };
  const owner = result.owner as { id: number; originalIdentity: string; checkpointEntryId: string };
  const addedProduct = result.addedProduct as { id: number; originalIdentity: string; checkpointEntryId: string };
  const originalProduct = fixture.optionNames[0];
  const groupPage = groupPageForEntity('addon', page);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await groupPage.open();
    await groupPage.searchAndWait(fixture.groupName);
    await groupPage.openEditSurface(fixture.groupName);
    const mutation = await (async () => {
      await groupPage.setAddonProductSelection(addedProduct.originalIdentity, true);
      return groupPage.saveAddonGroupEditAndReadMutation();
    })();
    if (!mutation.responses.some((response) => response.ok() && /\/brand-addon-group\/\d+\/?$/.test(new URL(response.url()).pathname))) {
      throw new Error(`${binding.caseId} 加料组新增明细未产生成功更新响应`);
    }
    const groupAfter = await productCenterApi.addonGroupDetail(fixture.id);
    if (!containsScalarValue(groupAfter, originalProduct) || !containsScalarValue(groupAfter, addedProduct.originalIdentity)) {
      throw new Error(`${binding.caseId} 加料组 API 未同时保留原商品和新增商品`);
    }
    const ownerAfter = await productCenterApi.productDetail(owner.id);
    if (!containsScalarValue(ownerAfter, originalProduct) || containsScalarValue(ownerAfter, addedProduct.originalIdentity)) {
      throw new Error(`${binding.caseId} 商品 API 自动传播了新增加料明细`);
    }
    const ownerOptions = await flow.verifyAddedAddonOptionOwnerUi(
      binding.caseId,
      owner.originalIdentity,
      fixture.groupName,
      originalProduct,
      addedProduct.originalIdentity,
    );
    await groupPage.open();
    await groupPage.searchAndWait(fixture.groupName);
    await groupPage.expectIdentityRowContains(fixture.groupName, addedProduct.originalIdentity);
    assertionIds.push(assertionReceipt(binding, 0));
    for (const entryId of result.checkpointEntryIds as string[]) {
      executionLedger.markPhase(entryId, 'api-verified');
      executionLedger.markPhase(entryId, 'ui-verified');
    }
  } catch (error) {
    executionError = error;
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 加料新增明细夹具清理未收敛`);
  await verifyUiResidueZero(groupPage, [fixture.groupName]);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  for (const identity of [owner.originalIdentity, ...(result.candidateIdentities as string[])]) {
    await itemList.fillSearchForResidueCheck(identity);
    await itemList.expectEmptySearchResults(10_000);
    if (namedRecords(await productCenterApi.productPage(identity), identity).length !== 0) {
      throw new Error(`${binding.caseId} 商品夹具仍有残留：${identity}`);
    }
  }
  if (executionError) throw executionError;
  if (assertionIds.length !== binding.expectedResults.length) {
    throw new Error(`${binding.caseId} 加料新增明细断言收据数量不完整：${assertionIds.length}/${binding.expectedResults.length}`);
  }
  return assertionIds;
}

async function runAddonReferencedOptionDeleteSyncCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const flow = new StandardItem216Flow(page, productCenterApi, cleanupRegistry);
  const prepared = await flow.prepareReferencedAddonOwners(binding.caseId, 2, 2);
  const fixture = prepared.fixture as { id: number; groupName: string; optionNames: string[] };
  const owners = prepared.owners as Array<{ id: number; originalIdentity: string }>;
  const removedIdentity = fixture.optionNames[0];
  const retainedIdentity = fixture.optionNames[1];
  const groupPage = groupPageForEntity('addon', page);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await groupPage.open();
    await groupPage.searchAndWait(fixture.groupName);
    await groupPage.openEditSurface(fixture.groupName);
    const cancelled = await groupPage.deleteAddonProductRowWithPreview(removedIdentity, 'cancel');
    if (!/change|before|after|affect|关联|影响/i.test(cancelled.previewText)) {
      throw new Error(`${binding.caseId} 变更预览缺少影响语义：${cancelled.previewText}`);
    }
    assertionIds.push(assertionReceipt(binding, 0));
    if (!cancelled.previewText.includes(removedIdentity) || !cancelled.previewText.includes(retainedIdentity)) {
      throw new Error(`${binding.caseId} 变更预览未展示删除前后加料明细：${cancelled.previewText}`);
    }
    assertionIds.push(assertionReceipt(binding, 1));
    const afterCancel = await productCenterApi.addonGroupDetail(fixture.id);
    if (!containsScalarValue(afterCancel, removedIdentity) || !containsScalarValue(afterCancel, retainedIdentity)) {
      throw new Error(`${binding.caseId} 取消后加料组 API 未保留 A/B`);
    }
    await groupPage.open();
    await groupPage.searchAndWait(fixture.groupName);
    await groupPage.openEditSurface(fixture.groupName);
    const confirmed = await groupPage.deleteAddonProductRowWithPreview(removedIdentity, 'confirm');
    if (!confirmed.saved) throw new Error(`${binding.caseId} 删除确认未形成成功保存`);
    const groupAfter = await productCenterApi.addonGroupDetail(fixture.id);
    if (containsScalarValue(groupAfter, removedIdentity) || !containsScalarValue(groupAfter, retainedIdentity)) {
      throw new Error(`${binding.caseId} 确认后组 API 明细终态不正确`);
    }
    assertionIds.push(assertionReceipt(binding, 2));
    for (const owner of owners) {
      const ownerAfter = await productCenterApi.productDetail(owner.id);
      if (containsScalarValue(ownerAfter, removedIdentity) || !containsScalarValue(ownerAfter, retainedIdentity)) {
        throw new Error(`${binding.caseId} owner ${owner.id} 未同步移除加料明细`);
      }
      await flow.verifyAddonOwnerUiTerminal(
        binding.caseId,
        owner.originalIdentity,
        fixture.groupName,
        [retainedIdentity],
        [removedIdentity],
      );
    }
    assertionIds.push(assertionReceipt(binding, 3));
    for (const entryId of prepared.checkpointEntryIds as string[]) {
      executionLedger.markPhase(entryId, 'api-verified');
      executionLedger.markPhase(entryId, 'ui-verified');
    }
  } catch (error) {
    executionError = error;
  }
  await cleanupReferencedAddonFixture(binding, prepared, groupPage, productCenterApi, cleanupRegistry, page);
  if (executionError) throw executionError;
  if (assertionIds.length !== binding.expectedResults.length) {
    throw new Error(`${binding.caseId} 加料删除同步断言收据数量不完整：${assertionIds.length}/${binding.expectedResults.length}`);
  }
  return assertionIds;
}

async function runAddonNonpriceFieldSyncCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const flow = new StandardItem216Flow(page, productCenterApi, cleanupRegistry);
  const prepared = await flow.prepareReferencedAddonOwners(binding.caseId, 1, 2);
  const fixture = prepared.fixture as { id: number; groupName: string; optionNames: string[] };
  const owners = prepared.owners as Array<{ id: number; originalIdentity: string }>;
  const optionName = fixture.optionNames[0];
  const groupPage = groupPageForEntity('addon', page);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    for (const owner of owners) {
      await flow.setAddonOwnerPriceOverride(binding.caseId, owner.originalIdentity, fixture.groupName, fixture.optionNames, optionName, '2.00');
    }
    await groupPage.open();
    await groupPage.searchAndWait(fixture.groupName);
    await groupPage.openEditSurface(fixture.groupName);
    const edited = await groupPage.fillAddonItemRules(optionName, '1', '3', '3.00');
    if (edited.minimum !== '1' || edited.maximum !== '3') {
      throw new Error(`${binding.caseId} 加料非价格字段输入未形成精确终态：${JSON.stringify(edited)}`);
    }
    await groupPage.fillAddonQuantityRules(1, 2, 0);
    const mutation = await groupPage.saveAddonGroupEditAndReadMutation();
    if (!mutation.responses.some((response) => response.ok())) throw new Error(`${binding.caseId} 加料非价格字段保存失败`);
    const impactText = mutation.confirmationTexts.join('\n');
    const selectedCount = owners.length;
    if (!/确认变更|Confirm Modification/i.test(impactText)
      || !/影响所有关联商品|all related products|all linked (?:products|items)/i.test(impactText)
      || !new RegExp(`(?:已选择\\s*[:：]?\\s*${selectedCount}\\s*\\/\\s*${selectedCount}|selected\\s*[:：]?\\s*${selectedCount}\\s*\\/\\s*${selectedCount})`, 'i').test(impactText)) {
      throw new Error(`${binding.caseId} 加料组变更弹窗缺少影响范围或 ${selectedCount}/${selectedCount} 统计：${impactText}`);
    }
    assertionIds.push(assertionReceipt(binding, 0));
    const groupAfter = await productCenterApi.addonGroupDetail(fixture.id);
    const groupRule = findNamedSelectionRule(groupAfter, optionName);
    if (groupRule.quantity !== 1 || groupRule.maxQuantity !== 3) {
      throw new Error(`${binding.caseId} 组 API 非价格字段回读不正确：${JSON.stringify(groupRule)}`);
    }
    assertionIds.push(assertionReceipt(binding, 1));
    const ownerSnapshots = [];
    for (const owner of owners) {
      const ownerAfter = await productCenterApi.productDetail(owner.id);
      const ownerRule = findNamedSelectionRule(ownerAfter, optionName);
      const ownerPrice = findNamedAdditionalPrice(ownerAfter, optionName);
      const ownerUi = await flow.verifyAddonOwnerUiTerminal(
        binding.caseId,
        owner.originalIdentity,
        fixture.groupName,
        [optionName],
        [],
        { optionName },
      );
      const ownerUiPrice = Number((ownerUi.price as { price: string }).price);
      ownerSnapshots.push({
        ownerId: owner.id,
        ownerIdentity: owner.originalIdentity,
        ownerRule,
        ownerApiPrice: ownerPrice,
        ownerUiPrice,
      });
    }
    const invalidOwnerSnapshots = ownerSnapshots.filter((snapshot) => (
      snapshot.ownerRule.quantity !== 1
      || snapshot.ownerRule.maxQuantity !== 3
      || snapshot.ownerApiPrice !== 3
      || snapshot.ownerUiPrice !== 3
    ));
    if (invalidOwnerSnapshots.length > 0) {
      throw new Error(`${binding.caseId} owner 同步或价格隔离终态不正确：${JSON.stringify(invalidOwnerSnapshots)}`);
    }
    assertionIds.push(assertionReceipt(binding, 2));
    for (const entryId of prepared.checkpointEntryIds as string[]) {
      executionLedger.markPhase(entryId, 'api-verified');
      executionLedger.markPhase(entryId, 'ui-verified');
    }
  } catch (error) {
    executionError = error;
  }
  await cleanupReferencedAddonFixture(binding, prepared, groupPage, productCenterApi, cleanupRegistry, page);
  if (executionError) throw executionError;
  if (assertionIds.length !== binding.expectedResults.length) {
    throw new Error(`${binding.caseId} 加料字段同步断言收据数量不完整：${assertionIds.length}/${binding.expectedResults.length}`);
  }
  return assertionIds;
}

async function cleanupReferencedAddonFixture(
  binding: GroupAutomationBinding,
  prepared: Record<string, unknown>,
  groupPage: GroupListPage,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  page: Page,
): Promise<void> {
  const fixture = prepared.fixture as { groupName: string };
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 被引用加料夹具清理未收敛`);
  await verifyUiResidueZero(groupPage, [fixture.groupName]);
  await ensureEnglishValidationLocale(page);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  for (const identity of [...prepared.candidateIdentities as string[], ...prepared.ownerIdentities as string[]]) {
    await itemList.fillSearchForResidueCheck(identity);
    await itemList.expectEmptySearchResults(10_000);
    if (namedRecords(await productCenterApi.productPage(identity), identity).length !== 0) {
      throw new Error(`${binding.caseId} 被引用加料商品夹具仍有残留：${identity}`);
    }
  }
}

async function runGroupDefaultPriceIsolationCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const entity = entityForBinding(binding);
  if (!['taste', 'method', 'addon'].includes(entity)) {
    throw new Error(`${binding.caseId} 不支持组默认项与加价隔离验证：${entity}`);
  }
  const kind = entity as 'taste' | 'method' | 'addon';
  const flow = new StandardItem216Flow(page, productCenterApi, cleanupRegistry);
  const prepared = await flow.prepareGroupDefaultPriceIsolation(binding.caseId, kind);
  const fixture = prepared.fixture as {
    checkpointEntryId: string;
    groupName: string;
    optionNames: string[];
  };
  const owner = prepared.owner as { originalIdentity: string };
  const groupPage = groupPageForEntity(entity, page);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await groupPage.open();
    await groupPage.searchAndWait(fixture.groupName);
    await groupPage.openEditSurface(fixture.groupName);
    const mutation = await groupPage.setOptionDefaultPriceAndSave(
      fixture.optionNames,
      fixture.optionNames[0],
      '3.00',
    );
    if (mutation.checkedNames.length !== 1
      || mutation.checkedNames[0] !== fixture.optionNames[0]
      || Number(mutation.price) !== 3
      || !mutation.responses.some((response) => response.ok())) {
      throw new Error(`${binding.caseId} 组 UI 保存证据不精确`);
    }
    assertionIds.push(assertionReceipt(binding, 0));

    const verified = await flow.verifyGroupDefaultPriceIsolationOwner(binding.caseId, prepared);
    const groupState = verified.groupState as { found: boolean; defaultSelected: boolean; price: number | null; path: string };
    if (!groupState.found || !groupState.defaultSelected || groupState.price !== 3) {
      throw new Error(`${binding.caseId} 组 API 回读不精确：${JSON.stringify(groupState)}`);
    }
    assertionIds.push(assertionReceipt(binding, 1));
    const ownerState = verified.ownerState as { found: boolean; defaultSelected: boolean; price: number | null; path: string };
    const ownerUi = verified.ownerUi as { checkedNames: string[]; checkedSwitches: number; price: string };
    if (!ownerState.found
      || !ownerState.defaultSelected
      || ownerState.price !== 2
      || ownerUi.checkedSwitches !== 1
      || ownerUi.checkedNames[0] !== fixture.optionNames[1]
      || Number(ownerUi.price) !== 2) {
      throw new Error(`${binding.caseId} 商品覆盖值 API/UI 回读不精确`);
    }
    assertionIds.push(assertionReceipt(binding, 2));
    for (const entryId of prepared.checkpointEntryIds as string[]) {
      executionLedger.markPhase(entryId, 'api-verified');
      executionLedger.markPhase(entryId, 'ui-verified');
    }
  } catch (error) {
    executionError = error;
  }

  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 默认项与加价隔离夹具清理未收敛`);
  await verifyUiResidueZero(groupPage, [fixture.groupName]);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  const itemIdentities = [owner.originalIdentity, ...(prepared.dependencyIdentities as string[])];
  for (const identity of itemIdentities) {
    await itemList.fillSearchForResidueCheck(identity);
    await itemList.expectEmptySearchResults(10_000);
    if (namedRecords(await productCenterApi.productPage(identity), identity).length !== 0) {
      throw new Error(`${binding.caseId} 隔离商品夹具 API 仍有残留：${identity}`);
    }
  }
  if (executionError) throw executionError;
  if (assertionIds.length !== binding.expectedResults.length) {
    throw new Error(`${binding.caseId} 默认项与加价隔离断言收据数量不完整：${assertionIds.length}/${binding.expectedResults.length}`);
  }
  return assertionIds;
}

async function runAddonProductRowDeleteCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const singleItemRejection = binding.caseId === 'TC-GRP-ADD-014';
  if (!singleItemRejection && binding.caseId !== 'TC-GRP-ADD-013') {
    throw new Error(`${binding.caseId} 不支持加料商品行删除 handler`);
  }
  if (binding.expectedUiFeedback?.locale === 'zh-CN') await ensureChineseValidationLocale(page);
  const timestamp = Date.now();
  const groupName = `AUTO_AUDIT_ADD_ROW_DELETE_${binding.caseId.replace(/[^A-Z0-9]+/gi, '_')}_${timestamp}`;
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const removedItem = await itemFactory.createSingleSkuBrandProduct('addon-candidate', cleanupRegistry, {
    identity: `AUTO_AUDIT_ADD_REMOVE_${timestamp}`,
    price: 10,
  });
  const retainedItem = singleItemRejection
    ? null
    : await itemFactory.createSingleSkuBrandProduct('addon-candidate', cleanupRegistry, {
      identity: `AUTO_AUDIT_ADD_RETAIN_${timestamp}`,
      price: 11,
    });
  const responseBody = await productCenterApi.createAddonGroup({
    name: groupName,
    secondName: '',
    itemIds: [removedItem.id, ...(retainedItem ? [retainedItem.id] : [])],
  });
  const groupRecord = await new AddonItem216Factory(productCenterApi, page.request)
    .registerAddonGroup(groupName, responseBody, cleanupRegistry);
  const trackedEntries = [
    removedItem.checkpointEntryId,
    ...(retainedItem ? [retainedItem.checkpointEntryId] : []),
    groupRecord.checkpointEntryId,
  ];
  const initialDetail = await productCenterApi.addonGroupDetail(groupRecord.id);
  if (!addonGroupContainsItem(initialDetail, removedItem.id)
    || (retainedItem && !addonGroupContainsItem(initialDetail, retainedItem.id))) {
    throw new Error(`${binding.caseId} 加料组 API 造数未形成预期商品关系`);
  }
  for (const entryId of trackedEntries) executionLedger.markPhase(entryId, 'api-verified');

  const groupPage = createAddOnsPage(page);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await groupPage.open();
    await groupPage.searchAndWait(groupName);
    await groupPage.openEditSurface(groupName);
    const capturedEditUrl = page.url();
    await groupPage.expectSelectedProducts(
      [removedItem.originalIdentity, ...(retainedItem ? [retainedItem.originalIdentity] : [])],
    );
    const deletion = await groupPage.deleteAddonProductRowAndSave(removedItem.originalIdentity);
    const mutationBodies = await Promise.all(deletion.responses.map(async (response) => ({
      method: response.request().method(),
      status: response.status(),
      pathname: new URL(response.url()).pathname,
      body: await response.json().catch(() => null),
    })));

    if (singleItemRejection) {
      if (!deletion.confirmationText || !/delete|remove|删除|移除|confirm|确认/i.test(deletion.confirmationText)) {
        throw new Error(`${binding.caseId} 未观察到删除确认弹窗：${deletion.confirmationText || '<empty>'}`);
      }
      assertionIds.push(assertionReceipt(binding, 0));
      const rejectionText = `${deletion.confirmationText} ${deletion.errorText} ${JSON.stringify(mutationBodies)}`;
      if (!/only\s*one|one\s*option|cannot\s*delete|can.?t\s*delete|只有一个|仅有一个|不能删除|无法删除/i.test(rejectionText)) {
        throw new Error(`${binding.caseId} 未观察到仅剩一项不可删除提示：${rejectionText}`);
      }
      const exactMessage = binding.expectedUiFeedback?.exactMessage;
      if (exactMessage && !normalizeUiText(rejectionText).includes(normalizeUiText(exactMessage))) {
        throw new Error(`${binding.caseId} 删除拦截提示与审计合同不一致：expected=${exactMessage} actual=${rejectionText}`);
      }
      const detailAfterRejection = await productCenterApi.addonGroupDetail(groupRecord.id);
      if (!addonGroupContainsItem(detailAfterRejection, removedItem.id)) {
        throw new Error(`${binding.caseId} 删除被拒绝后 API 丢失唯一加料商品`);
      }
      await groupPage.open();
      await groupPage.searchAndWait(groupName);
      await groupPage.openEditSurface(groupName);
      await groupPage.expectSelectedProducts([removedItem.originalIdentity]);
      assertionIds.push(assertionReceipt(binding, 1));
    } else {
      if (!deletion.rowRemoved || deletion.responses.length === 0) {
        throw new Error(`${binding.caseId} 删除加料商品后未形成业务写请求`);
      }
      const rejectedMutation = mutationBodies.find((mutation) => (
        mutation.status < 200 || mutation.status >= 300 || responseIndicatesBusinessRejection(mutation.status, mutation.body)
      ));
      if (rejectedMutation) {
        throw new Error(`${binding.caseId} 删除加料商品写入失败：${JSON.stringify(rejectedMutation)}`);
      }
      const businessWrite = mutationBodies.find((mutation) => (
        /\/brand-addon-group-item\/\d+\/?$/.test(mutation.pathname)
        || /\/brand-addon-group\/\d+\/?$/.test(mutation.pathname)
      ));
      if (!businessWrite) {
        throw new Error(`${binding.caseId} 仅观察到加料组校验请求，未观察到删除或更新请求：${JSON.stringify(mutationBodies)}`);
      }
      if (!deletion.confirmationText || !/delete|remove|删除|移除|confirm|确认/i.test(deletion.confirmationText)) {
        throw new Error(`${binding.caseId} 未观察到删除确认弹窗：${deletion.confirmationText || '<empty>'}`);
      }
      assertionIds.push(assertionReceipt(binding, 0));
      const detailAfterDelete = await waitUntil(
        () => productCenterApi.addonGroupDetail(groupRecord.id),
        (detail) => !addonGroupContainsItem(detail, removedItem.id)
          && retainedItem !== null
          && addonGroupContainsItem(detail, retainedItem.id),
        { timeout: 20_000, interval: 500, message: `${binding.caseId} 删除后加料组 API 关系未稳定` },
      );
      if (addonGroupContainsItem(detailAfterDelete, removedItem.id)
        || !retainedItem
        || !addonGroupContainsItem(detailAfterDelete, retainedItem.id)) {
        throw new Error(`${binding.caseId} 删除后加料组 API 商品关系不符合预期`);
      }
      await groupPage.openCapturedEditSurface(capturedEditUrl);
      await groupPage.expectSelectedProducts(
        [retainedItem.originalIdentity],
        [removedItem.originalIdentity],
      );
      assertionIds.push(assertionReceipt(binding, 1));
    }
    for (const entryId of trackedEntries) executionLedger.markPhase(entryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }

  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 加料商品行删除夹具清理未收敛`);
  await verifyUiResidueZero(groupPage, [groupName]);
  await ensureEnglishValidationLocale(page);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  for (const identity of [removedItem.originalIdentity, ...(retainedItem ? [retainedItem.originalIdentity] : [])]) {
    await itemList.fillSearchForResidueCheck(identity);
    await itemList.expectEmptySearchResults(10_000);
    if (namedRecords(await productCenterApi.productPage(identity), identity).length !== 0) {
      throw new Error(`${binding.caseId} 加料候选商品仍有残留：${identity}`);
    }
  }
  if (executionError) throw executionError;
  if (assertionIds.length !== binding.expectedResults.length) {
    throw new Error(`${binding.caseId} 加料商品行删除断言收据数量不完整：${assertionIds.length}/${binding.expectedResults.length}`);
  }
  return assertionIds;
}

async function runComboMultiSkuCreateCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const category = await new StandardItem216Factory(productCenterApi)
    .createCategoryFixture(binding.caseId, cleanupRegistry);
  const flow = new StandardItem216Flow(page, productCenterApi, cleanupRegistry);
  const product = await flow.createMulti(binding.caseId, false, {
    parentName: category.parentA.name,
    leafName: category.childA1.name,
  });
  const productSkuIds = readSkuIds(await productCenterApi.productDetail(product.id));
  if (productSkuIds.length < 2) throw new Error(`${binding.caseId} 多规格商品 SKU 数量不足：${productSkuIds.length}`);
  const groupIdentity = `AUTO_AUDIT_COMBO_MULTI_SKU_${Date.now()}`;
  const pageObject = createCombosPage(page);
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  let executionError: unknown;
  const assertionIds: string[] = [];
  try {
    await pageObject.open();
    await pageObject.openCreateSurface();
    await pageObject.selectComboType('Optional Combo');
    const selectedSkuRows = await pageObject.selectAllComboProductSkus(product.originalIdentity, category.parentA.name);
    if (selectedSkuRows !== productSkuIds.length) {
      throw new Error(`${binding.caseId} 组表单未展示全部规格明细：ui=${selectedSkuRows} api=${productSkuIds.length}`);
    }
    assertionIds.push(assertionReceipt(binding, 0));
    await pageObject.fillComboSelectionQuantity(1);
    await pageObject.fillGroupName(groupIdentity);
    const response = await pageObject.submitGroupCreate();
    const group = await itemFactory.registerComboGroupCreated(
      groupIdentity,
      await response.json().catch(() => null),
      cleanupRegistry,
    );
    const groupDetail = await productCenterApi.comboGroupDetail(group.id);
    const savedSkuIds = readSkuIds(groupDetail);
    if (savedSkuIds.length !== productSkuIds.length
      || productSkuIds.some((skuId) => !savedSkuIds.includes(skuId))) {
      throw new Error(`${binding.caseId} 套餐组未完整保存多规格 SKU：expected=${productSkuIds.join(',')} actual=${savedSkuIds.join(',')}`);
    }
    await pageObject.searchAndWait(groupIdentity);
    await pageObject.waitForVisibleIdentityCount(groupIdentity, 1);
    assertionIds.push(assertionReceipt(binding, 1));
    executionLedger.markPhase(product.checkpointEntryId, 'api-verified');
    executionLedger.markPhase(product.checkpointEntryId, 'ui-verified');
    executionLedger.markPhase(group.checkpointEntryId, 'api-verified');
    executionLedger.markPhase(group.checkpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 多规格套餐组清理未收敛`);
  await verifyUiResidueZero(pageObject, [groupIdentity]);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  await itemList.fillSearchForResidueCheck(product.originalIdentity);
  await itemList.expectEmptySearchResults(10_000);
  if (namedRecords(await productCenterApi.productPage(product.originalIdentity), product.originalIdentity).length !== 0) {
    throw new Error(`${binding.caseId} 多规格商品夹具 API 仍有残留`);
  }
  if (executionError) throw executionError;
  return assertionIds;
}

async function runProductBackedGroupDuplicateValidationCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const timestamp = Date.now();
  const isAddon = binding.caseId.startsWith('TC-GRP-ADD-');
  const caseInsensitive = ['TC-GRP-ADD-027', 'TC-GRP-PKG-028'].includes(binding.caseId);
  const originalIdentity = `AUTO_AUDIT_${isAddon ? 'ADD' : 'COMBO'}_DUP_Case_${timestamp}`;
  const attemptedIdentity = caseInsensitive
    ? `AUTO_AUDIT_${isAddon ? 'ADD' : 'COMBO'}_DUP_case_${timestamp}`
    : originalIdentity;
  const productIdentity = `AUTO_AUDIT_${isAddon ? 'ADD' : 'COMBO'}_DUP_PRODUCT_${timestamp}`;
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const pageObject = isAddon ? createAddOnsPage(page) : createCombosPage(page);
  let categoryName = '';
  let itemRecord: Awaited<ReturnType<ProductCenterItemCreateDataFactory['registerCreated']>>;

  if (isAddon) {
    await new ItemCreateFlow().createSideItem(page, { name: productIdentity, price: '10.00' });
    itemRecord = await itemFactory.registerCreated({
      entityKey: 'item',
      productType: 'side',
      originalIdentity: productIdentity,
      price: '10.00',
      minimumOrderQuantity: '1',
    }, null, cleanupRegistry);
  } else {
    const category = requireGroupRecord(namedRecords(await productCenterApi.categoryTree(), 'Special Offer')[0], 'Special Offer');
    categoryName = category.name;
    const productResponse = await productCenterApi.createBomProduct(productIdentity, category.id);
    itemRecord = await itemFactory.registerCreated({
      entityKey: 'item',
      productType: 'standard',
      originalIdentity: productIdentity,
      price: '1.00',
      minimumOrderQuantity: '1',
    }, productResponse, cleanupRegistry);
  }

  let originalRecord: { id: number; name: string; checkpointEntryId: string };
  if (isAddon) {
    const responseBody = await productCenterApi.createAddonGroup({
      name: originalIdentity,
      secondName: '',
      itemId: itemRecord.id,
    });
    originalRecord = await new AddonItem216Factory(productCenterApi, page.request)
      .registerAddonGroup(originalIdentity, responseBody, cleanupRegistry, itemRecord.id);
  } else {
    const detail = await productCenterApi.productDetail(itemRecord.id);
    const skuId = readFirstSkuId(detail);
    if (skuId === undefined) throw new Error(`${binding.caseId} 套餐组依赖商品缺少 SKU ID`);
    const responseBody = await productCenterApi.createComboGroup({
      name: originalIdentity,
      itemId: itemRecord.id,
      skuId,
      sectionType: 2,
    });
    originalRecord = await itemFactory.registerComboGroupCreated(originalIdentity, responseBody, cleanupRegistry);
  }
  executionLedger.markPhase(itemRecord.checkpointEntryId, 'api-verified');
  executionLedger.markPhase(originalRecord.checkpointEntryId, 'api-verified');

  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.openCreateSurface();
    if (isAddon) {
      await pageObject.setAddonProductSelection(productIdentity, true);
      await pageObject.fillAddonQuantityRules(0, 2, 0);
    } else {
      await pageObject.selectComboType('Optional Combo');
      await pageObject.selectComboProduct(productIdentity, categoryName);
      await pageObject.fillComboSelectionQuantity(1);
    }
    await pageObject.fillGroupName(attemptedIdentity);
    const rejection = await pageObject.submitGroupAndCaptureRejection();
    if (rejection.mutationCount > 1) {
      throw new Error(`${binding.caseId} 重名提交形成了多次后端请求：${JSON.stringify(rejection)}`);
    }
    if (rejection.mutationCount === 1 && rejection.responseStatus === null) {
      throw new Error(`${binding.caseId} 重名提交捕获到请求但缺少响应状态：${JSON.stringify(rejection)}`);
    }
    if (rejection.mutationCount === 1
      && !responseIndicatesBusinessRejection(rejection.responseStatus!, rejection.responseBody)) {
      throw new Error(`${binding.caseId} 重名提交未被后端拒绝：HTTP ${rejection.responseStatus}`);
    }
    if (rejection.mutationCount === 0 && !rejection.submitDisabled && !rejection.errorText) {
      throw new Error(`${binding.caseId} 重名提交既无前端拦截也无后端拒绝：${JSON.stringify(rejection)}`);
    }
    const rejectionText = `${rejection.errorText} ${JSON.stringify(rejection.responseBody)}`;
    if (!/duplicat|already exists?|conflict|repeat|不可重复|重复|冲突/i.test(rejectionText)) {
      throw new Error(`${binding.caseId} 重名拒绝缺少重复语义：${JSON.stringify(rejection)}`);
    }
    assertionIds.push(assertionReceipt(binding, 0));
    const originalRecords = await groupRecordsByEntity(isAddon ? 'addon' : 'combo', productCenterApi, originalIdentity);
    const attemptedRecords = attemptedIdentity === originalIdentity
      ? originalRecords
      : await groupRecordsByEntity(isAddon ? 'addon' : 'combo', productCenterApi, attemptedIdentity);
    if (originalRecords.length !== 1 || attemptedRecords.some((record) => requireGroupRecord(record, attemptedIdentity).id !== originalRecord.id)) {
      throw new Error(`${binding.caseId} 重名提交后产生额外组记录`);
    }
    executionLedger.markPhase(itemRecord.checkpointEntryId, 'ui-verified');
    executionLedger.markPhase(originalRecord.checkpointEntryId, 'ui-verified');
    await pageObject.cancelCurrentSurface();
    if (binding.expectedResults.length > 1) {
      await pageObject.searchAndWait(originalIdentity);
      await pageObject.waitForVisibleIdentityCount(originalIdentity, 1);
      assertionIds.push(assertionReceipt(binding, 1));
    }
  } catch (error) {
    executionError = error;
  }

  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 重名校验夹具清理未收敛`);
  await verifyUiResidueZero(pageObject, [...new Set([originalIdentity, attemptedIdentity])]);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  await itemList.fillSearchForResidueCheck(productIdentity);
  await itemList.expectEmptySearchResults(10_000);
  if (namedRecords(await productCenterApi.productPage(productIdentity), productIdentity).length !== 0) {
    throw new Error(`${binding.caseId} 重名校验商品夹具 API 仍有残留`);
  }
  if (executionError) throw executionError;
  return assertionIds;
}

async function runComboCrossTypeNameCreateCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const timestamp = Date.now();
  const groupIdentity = `AUTO_AUDIT_COMBO_CROSS_TYPE_${timestamp}`;
  const productIdentity = `AUTO_AUDIT_COMBO_CROSS_TYPE_PRODUCT_${timestamp}`;
  const category = requireGroupRecord(namedRecords(await productCenterApi.categoryTree(), 'Special Offer')[0], 'Special Offer');
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const productResponse = await productCenterApi.createBomProduct(productIdentity, category.id);
  const itemRecord = await itemFactory.registerCreated({
    entityKey: 'item',
    productType: 'standard',
    originalIdentity: productIdentity,
    price: '1.00',
    minimumOrderQuantity: '1',
  }, productResponse, cleanupRegistry);
  const detail = await productCenterApi.productDetail(itemRecord.id);
  const skuId = readFirstSkuId(detail);
  if (skuId === undefined) throw new Error(`${binding.caseId} 套餐组依赖商品缺少 SKU ID`);
  const fixedBody = await productCenterApi.createComboGroup({
    name: groupIdentity,
    itemId: itemRecord.id,
    skuId,
    sectionType: 1,
  });
  const fixedRecord = await itemFactory.registerComboGroupCreated(groupIdentity, fixedBody, cleanupRegistry);
  executionLedger.markPhase(itemRecord.checkpointEntryId, 'api-verified');
  executionLedger.markPhase(fixedRecord.checkpointEntryId, 'api-verified');

  const pageObject = createCombosPage(page);
  let optionalCheckpointEntryId = '';
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.openCreateSurface();
    await pageObject.selectComboType('Optional Combo');
    await pageObject.selectComboProduct(productIdentity, category.name);
    await pageObject.fillComboSelectionQuantity(1);
    await pageObject.fillGroupName(groupIdentity);
    const response = await pageObject.submitGroupCreate();
    const responseBody = await response.json().catch(() => null);
    const optionalRecord = await itemFactory.registerComboGroupCreated(groupIdentity, responseBody, cleanupRegistry);
    optionalCheckpointEntryId = optionalRecord.checkpointEntryId;
    executionLedger.markPhase(optionalCheckpointEntryId, 'ui-triggered');
    const records = await groupRecordsByEntity('combo', productCenterApi, groupIdentity);
    if (records.length !== 2) throw new Error(`${binding.caseId} 跨类型同名保存后 API 记录数量不是 2`);
    assertionIds.push(assertionReceipt(binding, 0));
    const serialized = records.map((record) => JSON.stringify(record));
    if (!serialized.some((value) => /"sectionType"\s*:\s*1/.test(value))
      || !serialized.some((value) => /"sectionType"\s*:\s*2/.test(value))) {
      throw new Error(`${binding.caseId} API 未同时返回固定搭配和组合搭配类型`);
    }
    await pageObject.searchAndWait(groupIdentity);
    await pageObject.waitForVisibleIdentityCount(groupIdentity, 2);
    assertionIds.push(assertionReceipt(binding, 1));
    executionLedger.markPhase(itemRecord.checkpointEntryId, 'ui-verified');
    executionLedger.markPhase(fixedRecord.checkpointEntryId, 'ui-verified');
    executionLedger.markPhase(optionalCheckpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }

  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 跨类型同名夹具清理未收敛`);
  await verifyUiResidueZero(pageObject, [groupIdentity]);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  await itemList.fillSearchForResidueCheck(productIdentity);
  await itemList.expectEmptySearchResults(10_000);
  if (namedRecords(await productCenterApi.productPage(productIdentity), productIdentity).length !== 0) {
    throw new Error(`${binding.caseId} 跨类型同名商品夹具 API 仍有残留`);
  }
  if (executionError) throw executionError;
  return assertionIds;
}

async function runComboProductSelectionCancelCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const timestamp = Date.now();
  const groupIdentity = `AUTO_AUDIT_COMBO_CANCEL_${timestamp}`;
  const originalProductIdentity = `AUTO_AUDIT_COMBO_CANCEL_ORIGINAL_${timestamp}`;
  const attemptedProductIdentity = `AUTO_AUDIT_COMBO_CANCEL_ATTEMPT_${timestamp}`;
  const category = requireGroupRecord(namedRecords(await productCenterApi.categoryTree(), 'Special Offer')[0], 'Special Offer');
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const itemRecords: Array<Awaited<ReturnType<ProductCenterItemCreateDataFactory['registerCreated']>>> = [];
  for (const identity of [originalProductIdentity, attemptedProductIdentity]) {
    const response = await productCenterApi.createBomProduct(identity, category.id);
    itemRecords.push(await itemFactory.registerCreated({
      entityKey: 'item',
      productType: 'standard',
      originalIdentity: identity,
      price: '1.00',
      minimumOrderQuantity: '1',
    }, response, cleanupRegistry));
  }
  const originalSkuId = readFirstSkuId(await productCenterApi.productDetail(itemRecords[0].id));
  if (originalSkuId === undefined) throw new Error(`${binding.caseId} 原套餐商品缺少 SKU ID`);
  const comboBody = await productCenterApi.createComboGroup({
    name: groupIdentity,
    itemId: itemRecords[0].id,
    skuId: originalSkuId,
    sectionType: 2,
  });
  const groupRecord = await itemFactory.registerComboGroupCreated(groupIdentity, comboBody, cleanupRegistry);
  for (const itemRecord of itemRecords) executionLedger.markPhase(itemRecord.checkpointEntryId, 'api-verified');
  executionLedger.markPhase(groupRecord.checkpointEntryId, 'api-verified');

  const pageObject = createCombosPage(page);
  const successfulUpdates: string[] = [];
  const listener = (response: import('@playwright/test').Response) => {
    const pathname = new URL(response.url()).pathname;
    if (['PUT', 'PATCH'].includes(response.request().method())
      && /\/brand-sections(?:\/|$)/.test(pathname)
      && response.status() >= 200
      && response.status() < 300) {
      successfulUpdates.push(`${response.request().method()} ${pathname}`);
    }
  };
  page.on('response', listener);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.searchAndWait(groupIdentity);
    await pageObject.openEditSurface(groupIdentity);
    await pageObject.expectSelectedProducts([originalProductIdentity], [attemptedProductIdentity]);
    await pageObject.selectComboProductAndKeepOverlayOpen(attemptedProductIdentity, category.name);
    await pageObject.cancelOpenProductSelection();
    if (successfulUpdates.length !== 0) throw new Error(`${binding.caseId} 取消商品选择仍产生更新请求：${successfulUpdates.join(', ')}`);
    await pageObject.expectSelectedProducts([originalProductIdentity], [attemptedProductIdentity]);
    assertionIds.push(assertionReceipt(binding, 0));
    await pageObject.cancelCurrentSurface();
    await pageObject.searchAndWait(groupIdentity);
    await pageObject.openEditSurface(groupIdentity);
    await pageObject.expectSelectedProducts([originalProductIdentity], [attemptedProductIdentity]);
    assertionIds.push(assertionReceipt(binding, 1));
    await pageObject.cancelCurrentSurface();
    for (const itemRecord of itemRecords) executionLedger.markPhase(itemRecord.checkpointEntryId, 'ui-verified');
    executionLedger.markPhase(groupRecord.checkpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  } finally {
    page.off('response', listener);
  }

  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 套餐选择取消夹具清理未收敛`);
  await verifyUiResidueZero(pageObject, [groupIdentity]);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  for (const identity of [originalProductIdentity, attemptedProductIdentity]) {
    await itemList.fillSearchForResidueCheck(identity);
    await itemList.expectEmptySearchResults(10_000);
    if (namedRecords(await productCenterApi.productPage(identity), identity).length !== 0) {
      throw new Error(`${binding.caseId} 套餐选择取消商品夹具仍有残留：${identity}`);
    }
  }
  if (executionError) throw executionError;
  return assertionIds;
}

async function runReferencedGroupDeleteBlockedCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const entity = entityForBinding(binding);
  const kind = entity === 'spec' ? 'spec'
    : entity === 'taste' ? 'taste'
      : entity === 'method' ? 'method'
        : entity === 'addon' ? 'addon'
          : null;
  if (!kind) throw new Error(`${binding.caseId} 不支持的引用组实体：${entity}`);
  const fixture = await new StandardItem216Flow(page, productCenterApi, cleanupRegistry)
    .createReferencedAttributeGroupFixture(binding.caseId, kind);
  const pageObject = groupPageForEntity(entity, page);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    const ownerBefore = JSON.stringify(await productCenterApi.productDetail(fixture.ownerId));
    if (!ownerBefore.includes(fixture.groupName)) {
      throw new Error(`${binding.caseId} owner 商品详情未回读真实组引用 ${fixture.groupName}`);
    }
    await pageObject.open();
    await pageObject.searchAndWait(fixture.groupName);
    await pageObject.waitForVisibleIdentityCount(fixture.groupName, 1);
    const rejection = await pageObject.attemptDeleteIdentityAndCaptureRejection(fixture.groupName);
    if (!responseIndicatesBusinessRejection(rejection.status, rejection.responseBody)) {
      throw new Error(`${binding.caseId} 被引用组删除未被后端拒绝：HTTP ${rejection.status}`);
    }
    const rejectionText = `${rejection.errorText} ${JSON.stringify(rejection.responseBody)}`;
    if (!/reference|referenced|linked|关联|引用|解除|cannot|fail|不可|不能/i.test(rejectionText)) {
      throw new Error(`${binding.caseId} 删除拒绝缺少引用语义：${rejectionText}`);
    }
    const records = await groupRecordsByEntity(entity, productCenterApi, fixture.groupName);
    if (records.length !== 1 || requireGroupRecord(records[0], fixture.groupName).id !== fixture.groupId) {
      throw new Error(`${binding.caseId} 删除拒绝后组记录未保留`);
    }
    const ownerAfter = JSON.stringify(await productCenterApi.productDetail(fixture.ownerId));
    if (!ownerAfter.includes(fixture.groupName)) {
      throw new Error(`${binding.caseId} 删除拒绝后 owner 商品引用丢失`);
    }
    await pageObject.searchAndWait(fixture.groupName);
    await pageObject.waitForVisibleIdentityCount(fixture.groupName, 1);
    assertionIds.push(assertionReceipt(binding, 0));
    const snapshot = executionLedger.snapshot();
    for (const entry of snapshot.entries.filter((item) => item.identityVariants.includes(fixture.groupName)
      || item.identityVariants.includes(fixture.ownerIdentity))) {
      executionLedger.markPhase(entry.entryId, 'ui-verified');
    }
  } catch (error) {
    executionError = error;
  }

  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 引用组删除阻断夹具清理未收敛`);
  await verifyUiResidueZero(pageObject, [fixture.groupName]);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  await itemList.fillSearchForResidueCheck(fixture.ownerIdentity);
  await itemList.expectEmptySearchResults(10_000);
  if (namedRecords(await productCenterApi.productPage(fixture.ownerIdentity), fixture.ownerIdentity).length !== 0) {
    throw new Error(`${binding.caseId} owner 商品 API 仍有残留`);
  }
  if (executionError) throw executionError;
  return assertionIds;
}

async function runReferencedGroupDeleteConfirmedCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  if (entityForBinding(binding) !== 'taste') {
    throw new Error(`${binding.caseId} 仅口味组支持引用后确认删除`);
  }
  const flow = new StandardItem216Flow(page, productCenterApi, cleanupRegistry);
  const fixture = await flow.createReferencedAttributeGroupFixture(binding.caseId, 'taste');
  const ownerBefore = JSON.stringify(await productCenterApi.productDetail(fixture.ownerId));
  if (!ownerBefore.includes(fixture.groupName)) {
    throw new Error(`${binding.caseId} owner 商品未建立口味组引用：${fixture.groupName}`);
  }
  const pageObject = createFlavorsPage(page);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.searchAndWait(fixture.groupName);
    const response = await pageObject.deleteIdentityAndConfirm(fixture.groupName);
    const responseBody = await response.json().catch(() => null);
    if (!response.ok() || responseIndicatesBusinessRejection(response.status(), responseBody)) {
      throw new Error(`${binding.caseId} 被引用口味组确认删除失败：HTTP ${response.status()}`);
    }
    await waitUntil(
      () => groupRecordsByEntity('taste', productCenterApi, fixture.groupName),
      (records) => records.length === 0,
      { timeout: 30_000, interval: 500, message: `${binding.caseId} 口味组 API 删除后仍有残留` },
    );
    await pageObject.searchAndWait(fixture.groupName);
    await pageObject.waitForVisibleIdentityCount(fixture.groupName, 0);
    assertionIds.push(assertionReceipt(binding, 0));
    const ownerAfter = await waitUntil(
      () => productCenterApi.productDetail(fixture.ownerId),
      (detail) => !JSON.stringify(detail).includes(fixture.groupName),
      { timeout: 30_000, interval: 500, message: `${binding.caseId} 原引用商品 API 仍保留已删除口味组` },
    );
    if (JSON.stringify(ownerAfter).includes(fixture.groupName)) {
      throw new Error(`${binding.caseId} 原引用商品仍保留已删除口味组`);
    }
    await flow.verifyAttributeGroupAbsentFromOwnerUi(binding.caseId, fixture.ownerIdentity, fixture.groupName);
    assertionIds.push(assertionReceipt(binding, 1));
    for (const entry of executionLedger.snapshot().entries.filter((item) => (
      item.identityVariants.includes(fixture.groupName) || item.identityVariants.includes(fixture.ownerIdentity)
    ))) executionLedger.markPhase(entry.entryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 被引用口味组删除夹具清理未收敛`);
  await verifyUiResidueZero(pageObject, [fixture.groupName]);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  await itemList.fillSearchForResidueCheck(fixture.ownerIdentity);
  await itemList.expectEmptySearchResults(10_000);
  if (executionError) throw executionError;
  return assertionIds;
}

async function runUnreferencedGroupDeleteConfirmedCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  if (entityForBinding(binding) !== 'method') {
    throw new Error(`${binding.caseId} 仅支持未引用做法组确认删除`);
  }
  const timestamp = Date.now();
  const identity = `AUTO_AUDIT_METHOD_UNREFERENCED_DELETE_${timestamp}`;
  const optionIdentity = `AUTO_AUDIT_METHOD_OPTION_${timestamp}`;
  await productCenterApi.createMethod({ name: identity, secondName: '', optionName: optionIdentity });
  const record = requireGroupRecord(await waitUntil(
    () => groupRecordsByEntity('method', productCenterApi, identity),
    (records) => records.length === 1,
    { timeout: 60_000, interval: 500, message: `${binding.caseId} 未引用做法组造数失败` },
  ).then((records) => records[0]), identity);
  const checkpointEntryId = `method-${record.id}`;
  cleanupRegistry.register({
    entity: '未引用做法组',
    identity,
    checkpoint: {
      entryId: checkpointEntryId,
      entityKind: 'method',
      serverId: record.id,
      identityVariants: [identity],
      cleanupOrder: 40,
    },
    execute: async () => {
      if ((await groupRecordsByEntity('method', productCenterApi, identity)).length > 0) {
        await productCenterApi.deleteMethod(record.id);
      }
    },
    verify: async () => (await groupRecordsByEntity('method', productCenterApi, identity)).length === 0,
  });
  executionLedger.markPhase(checkpointEntryId, 'mutation-observed');
  executionLedger.markPhase(checkpointEntryId, 'api-verified');
  const pageObject = groupPageForEntity('method', page);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.searchAndWait(identity);
    const deletion = await pageObject.deleteIdentityAndConfirmWithEvidence(identity);
    if (!/(?:被|used\s+by)\s*0\s*(?:个)?\s*(?:商品|products?|items?)|0\s*(?:个)?\s*(?:商品|products?|items?)/i.test(deletion.dialogText)) {
      throw new Error(`${binding.caseId} 删除确认弹窗未显示引用商品数为 0：${deletion.dialogText}`);
    }
    assertionIds.push(assertionReceipt(binding, 0));
    const response = deletion.response;
    const responseBody = await response.json().catch(() => null);
    if (!response.ok() || responseIndicatesBusinessRejection(response.status(), responseBody)) {
      throw new Error(`${binding.caseId} 未引用做法组确认删除失败：HTTP ${response.status()}`);
    }
    assertionIds.push(assertionReceipt(binding, 1));
    await waitUntil(
      () => groupRecordsByEntity('method', productCenterApi, identity),
      (records) => records.length === 0,
      { timeout: 30_000, interval: 500, message: `${binding.caseId} 做法组 API 删除后仍有残留` },
    );
    await pageObject.searchAndWait(identity);
    await pageObject.waitForVisibleIdentityCount(identity, 0);
    assertionIds.push(assertionReceipt(binding, 2));
    executionLedger.markPhase(checkpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 未引用做法组删除夹具清理未收敛`);
  await verifyUiResidueZero(pageObject, [identity]);
  if (executionError) throw executionError;
  return assertionIds;
}

async function runComboNonemptyDeleteCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const timestamp = Date.now();
  const groupIdentity = `AUTO_AUDIT_COMBO_NONEMPTY_DELETE_${timestamp}`;
  const productIdentity = `AUTO_AUDIT_COMBO_NONEMPTY_DELETE_PRODUCT_${timestamp}`;
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const productBody = await productCenterApi.createBomProduct(productIdentity, 142);
  const product = await itemFactory.registerCreated({
    entityKey: 'item',
    productType: 'standard',
    originalIdentity: productIdentity,
    price: '1.00',
    minimumOrderQuantity: '1',
  }, productBody, cleanupRegistry);
  const skuId = readFirstSkuId(await productCenterApi.productDetail(product.id));
  if (skuId === undefined) throw new Error(`${binding.caseId} 套餐商品缺少 SKU ID`);
  const groupBody = await productCenterApi.createComboGroup({
    name: groupIdentity,
    itemId: product.id,
    skuId,
    sectionType: 2,
  });
  const group = await itemFactory.registerComboGroupCreated(groupIdentity, groupBody, cleanupRegistry);
  executionLedger.markPhase(product.checkpointEntryId, 'api-verified');
  executionLedger.markPhase(group.checkpointEntryId, 'api-verified');
  const pageObject = createCombosPage(page);
  const assertionIds: string[] = [];
  const registeredGroupIds = new Set<number>();
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.searchAndWait(groupIdentity);
    const deletion = await pageObject.attemptDeleteIdentityAndCaptureRejection(groupIdentity);
    if (responseIndicatesBusinessRejection(deletion.status, deletion.responseBody)) {
      throw new Error(`${binding.caseId} 含商品套餐组删除失败：HTTP ${deletion.status} ${deletion.errorText}`);
    }
    assertionIds.push(assertionReceipt(binding, 0));
    const records = await waitUntil(
      () => groupRecordsByEntity('combo', productCenterApi, groupIdentity),
      (items) => items.length === 0,
      { timeout: 30_000, interval: 500, message: `${binding.caseId} 删除后套餐组 API 仍有残留` },
    );
    if (records.length !== 0) throw new Error(`${binding.caseId} 删除后套餐组 API 仍有残留`);
    await pageObject.searchAndWait(groupIdentity);
    await pageObject.waitForVisibleIdentityCount(groupIdentity, 0);
    assertionIds.push(assertionReceipt(binding, 1));
    executionLedger.markPhase(product.checkpointEntryId, 'ui-verified');
    executionLedger.markPhase(group.checkpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 含商品套餐组删除夹具清理未收敛`);
  await verifyUiResidueZero(pageObject, [groupIdentity]);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  await itemList.fillSearchForResidueCheck(productIdentity);
  await itemList.expectEmptySearchResults(10_000);
  if (namedRecords(await productCenterApi.productPage(productIdentity), productIdentity).length !== 0) {
    throw new Error(`${binding.caseId} 套餐组删除商品夹具 API 仍有残留`);
  }
  if (executionError) throw executionError;
  return assertionIds;
}

async function runAddonGroupValidationCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const timestamp = Date.now();
  const identity = `AUTO_AUDIT_${binding.caseId.replace(/[^A-Z0-9]+/g, '_')}_${timestamp}`;
  const productIdentity = `AUTO_AUDIT_GROUP_ADD_VALIDATION_PRODUCT_${timestamp}`;
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  await new ItemCreateFlow().createSideItem(page, { name: productIdentity, price: '10.00' });
  const itemRecord = await itemFactory.registerCreated({
    entityKey: 'item',
    productType: 'side',
    originalIdentity: productIdentity,
    price: '10.00',
    minimumOrderQuantity: '1',
  }, null, cleanupRegistry);
  executionLedger.markPhase(itemRecord.checkpointEntryId, 'ui-triggered');
  const pageObject = createAddOnsPage(page);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.openCreateSurface();
    await pageObject.setAddonProductSelection(productIdentity, true);
    if (binding.caseId !== 'TC-GRP-ADD-019') await pageObject.fillGroupName(identity);

    if (binding.caseId === 'TC-GRP-ADD-007') {
      await pageObject.fillAddonQuantityRules(3, 1, 0);
    } else if (binding.caseId === 'TC-GRP-ADD-008') {
      await pageObject.fillAddonQuantityRules(0, 0, 0);
    } else if (binding.caseId === 'TC-GRP-ADD-010') {
      await pageObject.fillAddonQuantityRules(0, 2, 0);
      await pageObject.fillAddonItemRules(productIdentity, '3', '3', '10.00');
    } else if (binding.caseId === 'TC-GRP-ADD-011') {
      await pageObject.fillAddonQuantityRules(2, 3, 0);
      await pageObject.fillAddonItemRules(productIdentity, '0', '1', '10.00');
    } else {
      await pageObject.fillAddonQuantityRules(0, 2, 0);
      await pageObject.fillAddonItemRules(productIdentity, '0', '2', '10.00');
    }

    const rejection = await pageObject.submitGroupAndCaptureRejection();
    const records = await groupRecordsByEntity('addon', productCenterApi, identity);
    if (records.length > 0) {
      await new AddonItem216Factory(productCenterApi, page.request)
        .registerAddonGroup(identity, null, cleanupRegistry);
    }
    if (binding.caseId === 'TC-GRP-ADD-019' && rejection.mutationCount !== 0) {
      throw new Error(`${binding.caseId} 前端校验失败场景仍发送了 ${rejection.mutationCount} 次创建请求`);
    }
    if (rejection.mutationCount > 0 && rejection.responseStatus !== null && rejection.responseStatus < 400) {
      throw new Error(`${binding.caseId} 负向提交产生成功创建响应 ${rejection.responseStatus}`);
    }
    if (!rejection.submitDisabled && !rejection.errorText && rejection.mutationCount === 0 && !rejection.leftCreateSurface) {
      throw new Error(`${binding.caseId} 未形成可观察的校验拒绝证据`);
    }
    assertionIds.push(assertionReceipt(binding, 0));
    if (records.length !== 0) throw new Error(`${binding.caseId} 负向提交仍生成加料组记录`);
    if (binding.expectedResults.length > 1) assertionIds.push(assertionReceipt(binding, 1));
    executionLedger.markPhase(itemRecord.checkpointEntryId, 'ui-verified');
    await pageObject.cancelCurrentSurface();
  } catch (error) {
    executionError = error;
  }

  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 加料校验夹具清理未收敛`);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  await itemList.fillSearchForResidueCheck(productIdentity);
  await itemList.expectEmptySearchResults(10_000);
  if (namedRecords(await productCenterApi.productPage(productIdentity), productIdentity).length !== 0) {
    throw new Error(`${binding.caseId} 加料商品夹具 API 仍有残留`);
  }
  if (executionError) throw executionError;
  return assertionIds;
}

async function runAddonSingleSurchargeFormatCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  if (binding.expectedResults.length !== 2) throw new Error(`${binding.caseId} 单次加价格式用例必须有两条独立预期`);
  const timestamp = Date.now();
  const identity = `AUTO_AUDIT_${binding.caseId.replace(/[^A-Z0-9]+/g, '_')}_${timestamp}`;
  const productIdentity = `AUTO_AUDIT_GROUP_ADD_SURCHARGE_PRODUCT_${timestamp}`;
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  await new ItemCreateFlow().createSideItem(page, { name: productIdentity, price: '10.00' });
  const itemRecord = await itemFactory.registerCreated({
    entityKey: 'item',
    productType: 'side',
    originalIdentity: productIdentity,
    price: '10.00',
    minimumOrderQuantity: '1',
  }, null, cleanupRegistry);
  executionLedger.markPhase(itemRecord.checkpointEntryId, 'ui-triggered');
  const pageObject = createAddOnsPage(page);
  const assertionIds: string[] = [];
  let groupCheckpointEntryId = '';
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.openCreateSurface();
    await pageObject.setAddonProductSelection(productIdentity, true);
    await pageObject.fillGroupName(identity);
    await pageObject.fillAddonQuantityRules(0, 2, 0);
    const invalidFieldState = await pageObject.fillAddonItemRules(productIdentity, '0', '2', 'abc@#');
    const invalid = await pageObject.submitGroupAndCaptureRejection({ allowSilentNoWrite: true });
    const invalidRecords = await groupRecordsByEntity('addon', productCenterApi, identity);
    if (invalidRecords.length > 0) {
      const invalidGroup = await new AddonItem216Factory(productCenterApi, page.request)
        .registerAddonGroup(identity, invalid.responseBody, cleanupRegistry, itemRecord.id);
      groupCheckpointEntryId = invalidGroup.checkpointEntryId;
    }
    if ((invalid.mutationCount > 0 && invalid.responseStatus !== null && invalid.responseStatus < 400)
      || invalidRecords.length > 0) {
      throw new Error(`${binding.caseId} 非数字单次加价产生了成功创建`);
    }
    const silentNoWriteEstablished = invalid.silentNoWrite
      && /[A-Za-z@#]/.test(invalidFieldState.singleSurcharge)
      && !invalid.leftCreateSurface;
    if (!invalid.submitDisabled && !invalid.errorText && !silentNoWriteEstablished
      && !(invalid.mutationCount > 0 && invalid.responseStatus !== null && invalid.responseStatus >= 400)) {
      throw new Error(`${binding.caseId} 非数字单次加价没有形成前端或后端校验证据`);
    }
    assertionIds.push(assertionReceipt(binding, 0));

    await pageObject.fillAddonItemRules(productIdentity, '0', '2', '1.999');
    const response = await pageObject.submitGroupCreate();
    const responseBody = await response.json().catch(() => null);
    const groupRecord = await new AddonItem216Factory(productCenterApi, page.request)
      .registerAddonGroup(identity, responseBody, cleanupRegistry, itemRecord.id);
    groupCheckpointEntryId = groupRecord.checkpointEntryId;
    executionLedger.markPhase(groupCheckpointEntryId, 'ui-triggered');
    const records = await waitUntil(
      () => groupRecordsByEntity('addon', productCenterApi, identity),
      (current) => current.length === 1,
      { timeout: 30_000, interval: 500, message: `${binding.caseId} 单次加价合法保存后 API 身份不唯一` },
    );
    const record = requireGroupRecord(records[0], identity);
    const detail = await productCenterApi.addonGroupDetail(record.id);
    const apiSurcharge = findNamedAdditionalPrice(detail, productIdentity);
    if (apiSurcharge !== 2) throw new Error(`${binding.caseId} API 单次加价未四舍五入为 2.00：${apiSurcharge}`);
    executionLedger.markPhase(groupCheckpointEntryId, 'api-verified');
    await pageObject.searchAndWait(identity);
    await pageObject.openEditSurface(identity);
    const uiSurcharge = Number(await pageObject.readAddonItemSingleSurcharge(productIdentity));
    if (uiSurcharge !== 2) throw new Error(`${binding.caseId} UI 单次加价未回显为 2.00：${uiSurcharge}`);
    assertionIds.push(assertionReceipt(binding, 1));
    executionLedger.markPhase(itemRecord.checkpointEntryId, 'ui-verified');
    executionLedger.markPhase(groupCheckpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }

  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 单次加价格式夹具清理未收敛`);
  await verifyUiResidueZero(pageObject, [identity]);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  await itemList.fillSearchForResidueCheck(productIdentity);
  await itemList.expectEmptySearchResults(10_000);
  if (namedRecords(await productCenterApi.productPage(productIdentity), productIdentity).length !== 0) {
    throw new Error(`${binding.caseId} 单次加价商品夹具 API 仍有残留`);
  }
  if (executionError) throw executionError;
  return assertionIds;
}

async function runProductBackedGroupCreateCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const timestamp = Date.now();
  const isAddon = binding.handlerId === 'addon-group-create';
  const requestedIdentity = buildRequestedGroupIdentity(binding.caseId, timestamp);
  const productIdentity = `AUTO_AUDIT_GROUP_${isAddon ? 'ADD' : 'COMBO'}_PRODUCT_${timestamp}`;
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const pageObject = isAddon ? createAddOnsPage(page) : createCombosPage(page);
  let categoryName = '';
  let itemRecord: Awaited<ReturnType<ProductCenterItemCreateDataFactory['registerCreated']>>;

  if (isAddon) {
    await new ItemCreateFlow().createSideItem(page, { name: productIdentity, price: '10.00' });
    itemRecord = await itemFactory.registerCreated({
      entityKey: 'item',
      productType: 'side',
      originalIdentity: productIdentity,
      price: '10.00',
      minimumOrderQuantity: '1',
    }, null, cleanupRegistry);
  } else {
    const category = requireGroupRecord(namedRecords(await productCenterApi.categoryTree(), 'Special Offer')[0], 'Special Offer');
    categoryName = category.name;
    const response = await productCenterApi.createBomProduct(productIdentity, category.id);
    itemRecord = await itemFactory.registerCreated({
      entityKey: 'item',
      productType: 'standard',
      originalIdentity: productIdentity,
      price: '1.00',
      minimumOrderQuantity: '1',
    }, response, cleanupRegistry);
    await waitUntil(
      () => productCenterApi.productPage(productIdentity),
      (value) => namedRecords(value, productIdentity).some((candidate) => (
        Number((candidate as Record<string, unknown>).id) === itemRecord.id
      )),
      {
        timeout: 60_000,
        interval: 500,
        probeTimeout: 10_000,
        message: `${binding.caseId} 套餐商品创建后未进入服务端商品索引`,
      },
    );
    executionLedger.markPhase(itemRecord.checkpointEntryId, 'api-verified');
  }
  executionLedger.markPhase(itemRecord.checkpointEntryId, 'ui-triggered');

  let groupIdentity = requestedIdentity;
  let comboAllTextFields: { name: string; secondName: string; description: string } | undefined;
  let groupCheckpointEntryId = '';
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.openCreateSurface();
    if (isAddon) {
      await pageObject.setAddonProductSelection(productIdentity, true);
      const quantityRules = binding.caseId === 'TC-GRP-ADD-008'
        ? { minimum: 0, maximum: 0, freeQuantity: 0 }
        : binding.caseId === 'TC-GRP-ADD-020'
          ? { minimum: 2, maximum: 2, freeQuantity: 0 }
          : { minimum: 0, maximum: 2, freeQuantity: 0 };
      await pageObject.fillAddonQuantityRules(
        quantityRules.minimum,
        quantityRules.maximum,
        quantityRules.freeQuantity,
      );
    } else {
      const comboType = comboCreateTypeForTitle(binding.title);
      await pageObject.selectComboType(comboType);
      await pageObject.selectComboProduct(productIdentity, categoryName);
      if (comboType === 'Optional Combo') {
        await pageObject.fillComboSelectionQuantity(1);
      }
    }
    if (binding.caseId === 'TC-GRP-PKG-021') {
      comboAllTextFields = await pageObject.fillComboAllTextFields(requestedIdentity);
      groupIdentity = comboAllTextFields.name;
      if (!comboAllTextFields.secondName || !comboAllTextFields.description) {
        throw new Error(`${binding.caseId} 套餐组全字段未全部接受输入`);
      }
    } else {
      groupIdentity = await pageObject.fillGroupName(requestedIdentity);
    }
    if (binding.caseId === 'TC-GRP-ADD-008') {
      const submit = pageObject.groupFormSubmitControl();
      if (!await submit.isEnabled()) throw new Error(`${binding.caseId} 数量为0且有加料商品时确定按钮未启用`);
      assertionIds.push(assertionReceipt(binding, 0));
    }
    const response = await pageObject.submitGroupCreate();
    const responseBody = await response.json().catch(() => null);
    const groupRecord = isAddon
      ? await new AddonItem216Factory(productCenterApi, page.request)
        .registerAddonGroup(groupIdentity, responseBody, cleanupRegistry, itemRecord.id)
      : await itemFactory.registerComboGroupCreated(groupIdentity, responseBody, cleanupRegistry);
    groupCheckpointEntryId = groupRecord.checkpointEntryId;
    executionLedger.markPhase(groupCheckpointEntryId, 'ui-triggered');

    const apiRecords = await waitUntil(
      () => groupRecordsByEntity(isAddon ? 'addon' : 'combo', productCenterApi, groupIdentity),
      (records) => records.length === 1,
      { timeout: 30_000, interval: 500, message: `${binding.caseId} 组创建后 API 身份不唯一` },
    );
    if (apiRecords.length !== 1) throw new Error(`${binding.caseId} 组创建后 API 记录数量错误`);
    if (!isAddon) {
      const expectedSectionType = comboTypeToSectionType(comboCreateTypeForTitle(binding.title));
      const groupDetail = await productCenterApi.comboGroupDetail(groupRecord.id);
      const persistedText = JSON.stringify([apiRecords[0], groupDetail]);
      if (!new RegExp(`"sectionType"\\s*:\\s*${expectedSectionType}`).test(persistedText)) {
        throw new Error(`${binding.caseId} API 回读套餐类型错误：expected sectionType=${expectedSectionType}`);
      }
      if (!persistedText.includes(productIdentity)) {
        throw new Error(`${binding.caseId} API 回读缺少已选择套餐商品：${productIdentity}`);
      }
    }
    if (binding.caseId === 'TC-GRP-ADD-008') {
      const detail = await productCenterApi.addonGroupDetail(groupRecord.id);
      assertAddonGroupRule(detail, { minimum: 0, maximum: 0, freeQuantity: 0 });
      if (!addonGroupContainsItem(detail, itemRecord.id)) {
        throw new Error(`${binding.caseId} API 回读缺少已选择加料商品：${itemRecord.id}`);
      }
      assertionIds.push(assertionReceipt(binding, 1));
    }
    if (comboAllTextFields) {
      const apiText = JSON.stringify(apiRecords[0]);
      for (const value of Object.values(comboAllTextFields)) {
        if (!apiText.includes(value)) throw new Error(`${binding.caseId} API 回读缺少套餐全字段值：${value}`);
      }
    }
    if (binding.caseId !== 'TC-GRP-ADD-008') assertionIds.push(assertionReceipt(binding, 0));

    await pageObject.searchAndWait(groupIdentity);
    await pageObject.waitForVisibleIdentityCount(groupIdentity, 1);
    if (binding.caseId === 'TC-GRP-ADD-008') {
      await pageObject.openEditSurface(groupIdentity);
      const actualRules = await pageObject.readAddonQuantityRules();
      if (actualRules.minimum !== '0' || actualRules.maximum !== '0' || actualRules.freeQuantity !== '0') {
        throw new Error(`${binding.caseId} UI 回读数量规则错误：${JSON.stringify(actualRules)}`);
      }
      const visibleProduct = page.getByText(productIdentity, { exact: true });
      if (await visibleProduct.count() !== 1 || !await visibleProduct.isVisible()) {
        throw new Error(`${binding.caseId} UI 编辑页缺少已选择加料商品：${productIdentity}`);
      }
      await pageObject.cancelCurrentSurface();
      assertionIds.push(assertionReceipt(binding, 2));
    }
    if (binding.caseId !== 'TC-GRP-ADD-008' && binding.expectedResults.length >= 2) {
      if (groupIdentity !== requestedIdentity.slice(0, 100)) {
        throw new Error(`${binding.caseId} 名称边界终态错误：${groupIdentity.length}`);
      }
      assertionIds.push(assertionReceipt(binding, 1));
    }
    if (binding.caseId !== 'TC-GRP-ADD-008' && binding.expectedResults.length >= 3) {
      const recordText = JSON.stringify(apiRecords[0]);
      if (!recordText.includes(groupIdentity)) throw new Error(`${binding.caseId} API 未回读已保存组名称`);
      assertionIds.push(assertionReceipt(binding, 2));
    }
    executionLedger.markPhase(itemRecord.checkpointEntryId, 'ui-verified');
    executionLedger.markPhase(groupCheckpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }

  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 组创建夹具清理未收敛`);
  await verifyUiResidueZero(pageObject, [groupIdentity]);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  await itemList.fillSearchForResidueCheck(productIdentity);
  await itemList.expectEmptySearchResults(10_000);
  if (namedRecords(await productCenterApi.productPage(productIdentity), productIdentity).length !== 0) {
    throw new Error(`${binding.caseId} 商品夹具 API 仍有残留：${productIdentity}`);
  }
  if (executionError) throw executionError;
  return assertionIds;
}

function comboCreateTypeForTitle(title: string): 'Fixed Combo' | 'Optional Combo' {
  if (title.startsWith('新增固定搭配')) return 'Fixed Combo';
  if (title.startsWith('新增可选搭配')) return 'Optional Combo';
  throw new Error(`${title} 未配置精确套餐创建类型，禁止复用通用创建 handler`);
}

function comboValidationTypeForTitle(title: string): 'Fixed Combo' | 'Optional Combo' | 'Pick & Mix' {
  if (/随心配|Pick\s*&\s*Mix/i.test(title)) return 'Pick & Mix';
  return comboCreateTypeForTitle(title);
}

function comboTypeToSectionType(comboType: 'Fixed Combo' | 'Optional Combo'): 1 | 2 {
  return comboType === 'Fixed Combo' ? 1 : 2;
}

function buildRequestedGroupIdentity(caseId: string, timestamp: number): string {
  const base = `AUTO_AUDIT_${caseId.replace(/[^A-Z0-9]+/g, '_')}_${timestamp}`;
  if (caseId === 'TC-GRP-ADD-025' || caseId === 'TC-GRP-PKG-029') {
    return `${base}_${'LONG'.repeat(30)}`;
  }
  return base;
}

async function runProductSelectionCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const timestamp = Date.now();
  const pageObject = groupPageForEntity(entityForBinding(binding), page);
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const identities = binding.handlerId === 'addon-product-selection'
    ? [`AUTO_AUDIT_GROUP_ADD_SELECT_${timestamp}_A`, `AUTO_AUDIT_GROUP_ADD_SELECT_${timestamp}_B`]
    : [`AUTO_AUDIT_GROUP_COMBO_SELECT_${timestamp}`];
  const records: Array<{ id: number; checkpointEntryId: string }> = [];
  let categoryName = '';

  if (binding.handlerId === 'addon-product-selection') {
    const createFlow = new ItemCreateFlow();
    for (const identity of identities) {
      await createFlow.createSideItem(page, { name: identity, price: '10.00' });
      records.push(await itemFactory.registerCreated({
        entityKey: 'item',
        productType: 'side',
        originalIdentity: identity,
        price: '10.00',
        minimumOrderQuantity: '1',
      }, null, cleanupRegistry));
    }
  } else {
    const category = requireGroupRecord(namedRecords(await productCenterApi.categoryTree(), 'Special Offer')[0], 'Special Offer');
    categoryName = category.name;
    const identity = identities[0];
    const response = await productCenterApi.createBomProduct(identity, category.id);
    records.push(await itemFactory.registerCreated({
      entityKey: 'item',
      productType: 'standard',
      originalIdentity: identity,
      price: '1.00',
      minimumOrderQuantity: '1',
    }, response, cleanupRegistry));
  }

  for (const record of records) executionLedger.markPhase(record.checkpointEntryId, 'ui-triggered');
  let executionError: unknown;
  const assertionIds: string[] = [];
  try {
    await pageObject.open();
    await pageObject.openCreateSurface();
    if (binding.handlerId === 'addon-product-selection') {
      const firstSelection = await pageObject.setAddonProductSelection(identities[0], true, true);
      const secondSelection = await pageObject.setAddonProductSelectionInOpenOverlay(identities[1], true);
      const secondRemoval = await pageObject.setAddonProductSelectionInOpenOverlay(identities[1], false);
      if (firstSelection.searchValue !== identities[0] || !firstSelection.checked
        || secondSelection.searchValue !== identities[1] || !secondSelection.checked
        || secondRemoval.searchValue !== identities[1] || secondRemoval.checked) {
        throw new Error(`${binding.caseId} 加料选择页搜索或多选证据不完整`);
      }
      assertionIds.push(assertionReceipt(binding, 0));
      await pageObject.confirmOpenProductSelection();
      await pageObject.expectSelectedProducts([identities[0]], [identities[1]]);
      assertionIds.push(assertionReceipt(binding, 1));
    } else {
      let interactionVerified = false;
      let selectedProductVerified = false;
      const comboTypes = ['Fixed Combo', 'Optional Combo', 'Pick & Mix'] as const;
      for (const [index, comboType] of comboTypes.entries()) {
        await pageObject.selectComboType(comboType);
        const selection = await pageObject.selectComboProduct(identities[0], categoryName);
        if (selection.searchValue !== identities[0] || !selection.checked || !selection.categorySelected) {
          throw new Error(`${binding.caseId} ${comboType} 套餐选择页搜索或多选证据不完整`);
        }
        if (!selection.confirmDisabledBeforeSelection || !selection.rowText.includes(identities[0])) {
          throw new Error(`${binding.caseId} ${comboType} 套餐选择弹层未满足未选择禁用或商品行展示合同`);
        }
        interactionVerified = true;
        await pageObject.expectSelectedProducts([identities[0]]);
        selectedProductVerified = true;
        if (index < comboTypes.length - 1) {
          await pageObject.cancelCurrentSurface();
          await pageObject.open();
          await pageObject.openCreateSurface();
        }
      }
      if (!interactionVerified || !selectedProductVerified) throw new Error(`${binding.caseId} 三种套餐组选择弹层证据不完整`);
      assertionIds.push(assertionReceipt(binding, 0));
      assertionIds.push(assertionReceipt(binding, 1));
      assertionIds.push(assertionReceipt(binding, 2));
    }
    for (const record of records) executionLedger.markPhase(record.checkpointEntryId, 'ui-verified');
    await pageObject.cancelCurrentSurface();
  } catch (error) {
    executionError = error;
  }

  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 商品选择夹具清理未收敛`);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  for (const identity of identities) {
    await itemList.fillSearchForResidueCheck(identity);
    await itemList.expectEmptySearchResults(10_000);
    if ((await productCenterApi.productPage(identity)) && namedRecords(await productCenterApi.productPage(identity), identity).length !== 0) {
      throw new Error(`${binding.caseId} 商品夹具 API 仍有残留：${identity}`);
    }
  }
  if (executionError) throw executionError;
  return assertionIds;
}

async function runMultilangQueryCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  if (binding.caseId !== 'TC-GRP-SPEC-003') throw new Error(`不支持的多语言查询用例：${binding.caseId}`);
  const timestamp = Date.now();
  const identity = `AUTO_AUDIT_SPEC_MULTILANG_${timestamp}`;
  const optionIdentity = `AUTO_AUDIT_SPEC_OPTION_${timestamp}`;
  const secondName = 'スペック';
  await productCenterApi.createSpec({ name: identity, secondName, optionName: optionIdentity });
  const record = requireGroupRecord(await waitUntil(
    () => groupRecordsByEntity('spec', productCenterApi, identity),
    (records) => records.length === 1,
    { timeout: 60_000, interval: 500, message: `${binding.caseId} API 造数后未找到唯一规格组` },
  ).then((records) => records[0]), identity);
  const checkpointEntryId = `spec-${record.id}`;
  cleanupRegistry.register({
    entity: '规格组',
    identity,
    checkpoint: {
      entryId: checkpointEntryId,
      entityKind: 'spec',
      serverId: record.id,
      identityVariants: [identity],
      cleanupOrder: 40,
    },
    execute: async () => {
      const residue = await groupRecordsByEntity('spec', productCenterApi, identity);
      if (residue.length) await productCenterApi.deleteSpec(requireGroupRecord(residue[0], identity).id);
    },
    verify: async () => (await groupRecordsByEntity('spec', productCenterApi, identity)).length === 0,
  });
  executionLedger.markPhase(checkpointEntryId, 'mutation-observed');
  const detail = await productCenterApi.specDetail(record.id) as Record<string, unknown>;
  if (!containsScalarValue(detail, secondName)) {
    throw new Error(`${binding.caseId} API 详情未保存第二语言 ${secondName}`);
  }
  executionLedger.markPhase(checkpointEntryId, 'api-verified');

  const pageObject = groupPageForEntity('spec', page);
  await pageObject.open();
  await pageObject.searchAndWait(secondName);
  await pageObject.waitForVisibleIdentityCount(identity, 1);
  executionLedger.markPhase(checkpointEntryId, 'ui-verified');
  const assertionIds = [assertionReceipt(binding, 0)];

  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero || !cleanup.serverIds.map(String).includes(String(record.id))) {
    throw new Error(`${binding.caseId} 清理证据未覆盖服务端 ID ${record.id}`);
  }
  await pageObject.open();
  await pageObject.searchAndWait(identity);
  await pageObject.expectEmptySearchResults();
  const ledgerEntry = executionLedger.snapshot().entries.find((entry) => entry.entryId === checkpointEntryId);
  if (ledgerEntry?.phase !== 'residue-verified') {
    throw new Error(`${binding.caseId} 清理检查点未收敛：${ledgerEntry?.phase ?? 'missing'}`);
  }
  return assertionIds;
}

async function runSimpleOptionGroupCreateCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const entity = entityForBinding(binding);
  if (entity !== 'spec' && entity !== 'taste') throw new Error(`不支持的简单选项组实体：${entity}`);
  const timestamp = Date.now();
  const identity = `AUTO_AUDIT_${entity.toUpperCase()}_CREATE_${timestamp}`;
  const optionIdentity = `AUTO_AUDIT_${entity.toUpperCase()}_OPTION_${timestamp}`;
  const pageObject = groupPageForEntity(entity, page);
  await pageObject.open();
  await pageObject.openCreateSurface();
  const creation = await pageObject.createSimpleOptionGroupWithEvidence(identity, optionIdentity);
  const assertionIds: string[] = [];
  if (binding.expectedResults.length === 3) {
    if (creation.groupValue !== identity || creation.optionValue !== optionIdentity) {
      throw new Error(`${binding.caseId} 表单未保留输入值：${JSON.stringify(creation)}`);
    }
    assertionIds.push(assertionReceipt(binding, 0));
    if (!creation.response.ok()) throw new Error(`${binding.caseId} 创建响应失败 HTTP ${creation.response.status()}`);
    const visibleErrors = await page.locator(
      '.ant-form-item-explain-error:visible, .ant-message-error:visible, .ant-notification-notice-error:visible, [role=alert]:visible',
    ).allTextContents();
    if (visibleErrors.some((value) => value.trim().length > 0)) {
      throw new Error(`${binding.caseId} 创建成功后仍有可见错误：${visibleErrors.join(' | ')}`);
    }
    assertionIds.push(assertionReceipt(binding, 1));
  }
  const record = await waitUntil(
    () => groupRecordsByEntity(entity, productCenterApi, identity),
    (records) => records.length === 1,
    { timeout: 60_000, interval: 500, message: `${binding.caseId} UI 创建后 API 未找到唯一记录` },
  ).then((records) => requireGroupRecord(records[0], identity));
  const checkpointEntryId = `${entity}-${record.id}`;
  cleanupRegistry.register({
    entity: entity === 'spec' ? '规格组' : '口味组',
    identity,
    checkpoint: {
      entryId: checkpointEntryId,
      entityKind: entity,
      serverId: record.id,
      identityVariants: [identity],
      cleanupOrder: 40,
    },
    execute: async () => {
      const residue = await groupRecordsByEntity(entity, productCenterApi, identity);
      const current = residue.length ? requireGroupRecord(residue[0], identity) : undefined;
      if (current) {
        if (entity === 'spec') await productCenterApi.deleteSpec(current.id);
        else await productCenterApi.deleteMethod(current.id);
      }
    },
    verify: async () => (await groupRecordsByEntity(entity, productCenterApi, identity)).length === 0,
  });
  executionLedger.markPhase(checkpointEntryId, 'mutation-observed');
  const detail = entity === 'spec'
    ? await productCenterApi.specDetail(record.id)
    : await productCenterApi.methodDetail(record.id);
  if (!containsNamedValue(detail, optionIdentity)) {
    throw new Error(`${binding.caseId} API 详情未包含创建的子项 ${optionIdentity}`);
  }
  executionLedger.markPhase(checkpointEntryId, 'api-verified');
  await pageObject.open();
  await pageObject.expectIdentityRowContains(identity, optionIdentity);
  assertionIds.push(assertionReceipt(binding, binding.expectedResults.length - 1));
  executionLedger.markPhase(checkpointEntryId, 'ui-verified');
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero || !cleanup.serverIds.map(String).includes(String(record.id))) {
    throw new Error(`${binding.caseId} 清理证据未覆盖服务端 ID ${record.id}`);
  }
  await verifyUiResidueZero(pageObject, [identity]);
  const ledgerEntry = executionLedger.snapshot().entries.find((entry) => entry.entryId === checkpointEntryId);
  if (ledgerEntry?.phase !== 'residue-verified') {
    throw new Error(`${binding.caseId} 清理检查点未收敛：${ledgerEntry?.phase ?? 'missing'}`);
  }
  return assertionIds;
}

async function runOptionGroupBoundaryCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const entity = entityForBinding(binding);
  if (!['spec', 'taste', 'method'].includes(entity)) throw new Error(`${binding.caseId} 不支持的边界实体：${entity}`);
  const timestamp = Date.now();
  const base = `AUTO_AUDIT_${entity.toUpperCase()}_BOUNDARY_${timestamp}`;
  const requested = `${base}${'X'.repeat(120)}`;
  const optionIdentity = `AUTO_AUDIT_${entity.toUpperCase()}_OPTION_${timestamp}`;
  const groupIdentity = binding.caseId === 'TC-GRP-SPEC-010' ? requested.slice(0, 100) : base;
  const optionExpected = requested.slice(0, 100);
  const pageObject = groupPageForEntity(entity, page);
  await pageObject.open();
  await pageObject.openCreateSurface();
  const evidence = binding.caseId === 'TC-GRP-SPEC-010'
    ? await pageObject.createSimpleOptionGroupWithEvidence(requested, optionIdentity)
    : await pageObject.createSimpleOptionGroupWithEvidence(groupIdentity, requested);
  const expectedGroupValue = binding.caseId === 'TC-GRP-SPEC-010' ? groupIdentity : base;
  const expectedOptionValue = binding.caseId === 'TC-GRP-SPEC-010' ? optionIdentity : optionExpected;
  if (evidence.groupValue !== expectedGroupValue || evidence.optionValue !== expectedOptionValue) {
    throw new Error(`${binding.caseId} 输入框实际值不符合 100 字符边界：group=${evidence.groupValue.length}, option=${evidence.optionValue.length}`);
  }
  const assertionIds = [assertionReceipt(binding, 0)];
  const responseBody = await evidence.response.json().catch(() => null);
  const created = extractCreatedRecord(responseBody, expectedGroupValue);
  const record = requireGroupRecord(created ?? await waitUntil(
    () => groupRecordsByEntity(entity, productCenterApi, expectedGroupValue),
    (items) => items.length === 1,
    { timeout: 60_000, interval: 500, message: `${binding.caseId} 边界保存后 API 未找到唯一组` },
  ).then((items) => items[0]), expectedGroupValue);
  const checkpointEntryId = `${entity}-${record.id}`;
  cleanupRegistry.register({
    entity: entity === 'spec' ? '规格组' : entity === 'taste' ? '口味组' : '做法组',
    identity: expectedGroupValue,
    checkpoint: {
      entryId: checkpointEntryId,
      entityKind: entity,
      serverId: record.id,
      identityVariants: [expectedGroupValue],
      cleanupOrder: 40,
    },
    execute: async () => {
      const residue = await groupRecordsByEntity(entity, productCenterApi, expectedGroupValue);
      if (!residue.length) return;
      const current = requireGroupRecord(residue[0], expectedGroupValue);
      if (entity === 'spec') await productCenterApi.deleteSpec(current.id);
      else await productCenterApi.deleteMethod(current.id);
    },
    verify: async () => (await groupRecordsByEntity(entity, productCenterApi, expectedGroupValue)).length === 0,
  });
  executionLedger.markPhase(checkpointEntryId, 'mutation-observed');
  const detail = entity === 'spec'
    ? await productCenterApi.specDetail(record.id)
    : entity === 'method'
      ? await productCenterApi.methodDetail(record.id)
      : await productCenterApi.tasteDetail(record.id);
  if (!containsNamedValue(detail, expectedOptionValue)) {
    throw new Error(`${binding.caseId} 服务端终态未包含边界子项 ${expectedOptionValue}`);
  }
  executionLedger.markPhase(checkpointEntryId, 'api-verified');
  await pageObject.open();
  await pageObject.expectIdentityRowContains(expectedGroupValue, expectedOptionValue);
  assertionIds.push(assertionReceipt(binding, 1));
  executionLedger.markPhase(checkpointEntryId, 'ui-verified');
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero || !cleanup.serverIds.map(String).includes(String(record.id))) {
    throw new Error(`${binding.caseId} 边界用例清理未覆盖服务端 ID ${record.id}`);
  }
  await verifyUiResidueZero(pageObject, [expectedGroupValue]);
  const ledgerEntry = executionLedger.snapshot().entries.find((entry) => entry.entryId === checkpointEntryId);
  if (ledgerEntry?.phase !== 'residue-verified') throw new Error(`${binding.caseId} 清理检查点未收敛`);
  return assertionIds;
}

async function runSpecOptionTwentyCharacterBoundary(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  if (!['TC-GRP-SPEC-011', 'TC-GRP-SPEC-027'].includes(binding.caseId)) {
    throw new Error(`不支持的规格20字符边界用例：${binding.caseId}`);
  }
  const timestamp = Date.now();
  const identity = `AUTO_AUDIT_SPEC_FIELD_${timestamp}`;
  const optionIdentity = `AUTO_AUDIT_SPEC_OPTION_${timestamp}`;
  const createBody = await productCenterApi.createSpec({ name: identity, secondName: '', optionName: optionIdentity });
  const record = extractCreatedRecord(createBody, identity);
  if (!record) {
    const residue = await groupRecordsByEntity('spec', productCenterApi, identity);
    if (residue.length) await productCenterApi.deleteSpec(requireGroupRecord(residue[0], identity).id);
    throw new Error(`${binding.caseId} API 创建成功但未返回可登记的 server ID`);
  }
  const checkpointEntryId = `spec-${record.id}`;
  cleanupRegistry.register({
    entity: '规格组',
    identity,
    checkpoint: {
      entryId: checkpointEntryId,
      entityKind: 'spec',
      serverId: record.id,
      identityVariants: [identity],
      cleanupOrder: 40,
    },
    execute: async () => {
      const residue = await groupRecordsByEntity('spec', productCenterApi, identity);
      if (residue.length) await productCenterApi.deleteSpec(requireGroupRecord(residue[0], identity).id);
    },
    verify: async () => (await groupRecordsByEntity('spec', productCenterApi, identity)).length === 0,
  });
  executionLedger.markPhase(checkpointEntryId, 'mutation-observed');
  await waitUntil(
    () => groupRecordsByEntity('spec', productCenterApi, identity),
    (records) => records.length === 1 && requireGroupRecord(records[0], identity).id === record.id,
    { timeout: 60_000, interval: 500, message: `${binding.caseId} API 造数后未找到已登记规格组` },
  );

  const header = binding.caseId === 'TC-GRP-SPEC-011' ? 'Device Code' : 'Spec Value';
  const apiField = binding.caseId === 'TC-GRP-SPEC-011' ? 'deviceCode' : 'value';
  const requestedValue = `${binding.caseId.endsWith('011') ? 'DEVICE_CODE_BOUNDARY_' : 'SPEC_VALUE_BOUNDARY__'}XYZ`;
  const expectedValue = requestedValue.slice(0, 20);
  const pageObject = createSpecificationsPage(page);
  await pageObject.open();
  await pageObject.searchAndWait(identity);
  await pageObject.openSpecEditSurface(identity);
  const uiEvidence = await pageObject.fillSpecOptionBoundaryAndSave(header, requestedValue);
  if (uiEvidence.persistedValue !== expectedValue) throw new Error(`${binding.caseId} UI 边界值不正确`);

  const detail = await productCenterApi.specDetail(record.id) as Record<string, unknown>;
  const options = extractArray(detail, 'options');
  if (options.length !== 1 || options[0]?.name !== optionIdentity || options[0]?.[apiField] !== expectedValue) {
    throw new Error(`${binding.caseId} API 终态与20字符边界不一致`);
  }
  executionLedger.markPhase(checkpointEntryId, 'api-verified');
  await pageObject.open();
  await pageObject.searchAndWait(identity);
  await pageObject.openSpecEditSurface(identity);
  const uiPersistedValue = await pageObject.readSpecOptionBoundary(header);
  if (uiPersistedValue !== expectedValue) throw new Error(`${binding.caseId} UI 回读终态与20字符边界不一致`);
  executionLedger.markPhase(checkpointEntryId, 'ui-verified');

  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero || !cleanup.serverIds.map(String).includes(String(record.id))) {
    throw new Error(`${binding.caseId} 清理证据未覆盖服务端 ID ${record.id}`);
  }
  await verifyUiResidueZero(pageObject, [identity]);
  const ledgerEntry = executionLedger.snapshot().entries.find((entry) => entry.entryId === checkpointEntryId);
  if (ledgerEntry?.phase !== 'residue-verified') throw new Error(`${binding.caseId} 清理检查点未收敛`);
  return [assertionReceipt(binding, 0)];
}

async function runMethodCreateCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  if (binding.caseId !== 'TC-GRP-MTH-003') throw new Error(`不支持的做法组创建用例：${binding.caseId}`);
  const definition = productCenterCreateSopCatalog.find((item) => item.entityKey === 'method');
  if (!definition) throw new Error('缺少做法组 UI 创建 SOP 定义');
  const factory = new ProductCenterCreateDataFactory(productCenterApi);
  const context = await factory.prepare('method', cleanupRegistry);
  const flow = new ProductCenterCreateSopFlow(page);
  await flow.create(definition, context);
  const record = await waitUntil(
    () => factory.findPrimary(context),
    (value) => value?.name === context.originalIdentity,
    { timeout: 60_000, interval: 500, message: '做法组 UI 创建后 API 未找到唯一记录' },
  );
  const registered = await factory.registerCreated(context, record!, cleanupRegistry);
  executionLedger.markPhase(registered.checkpointEntryId, 'mutation-observed');
  executionLedger.markPhase(registered.checkpointEntryId, 'api-verified');
  await flow.verifyCreatedUi(definition, registered);
  const assertionIds = [assertionReceipt(binding, 0)];
  executionLedger.markPhase(registered.checkpointEntryId, 'ui-verified');
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero || !cleanup.serverIds.map(String).includes(String(registered.id))) {
    throw new Error(`${binding.caseId} 清理证据未覆盖做法组服务端 ID ${registered.id}`);
  }
  await verifyUiResidueZero(groupPageForEntity('method', page), [registered.originalIdentity]);
  const ledgerEntry = executionLedger.snapshot().entries.find((entry) => entry.entryId === registered.checkpointEntryId);
  if (ledgerEntry?.phase !== 'residue-verified') {
    throw new Error(`${binding.caseId} 清理检查点未收敛：${ledgerEntry?.phase ?? 'missing'}`);
  }
  return assertionIds;
}

async function runCreateCancelCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
): Promise<string[]> {
  const entity = entityForBinding(binding);
  const pageObject = groupPageForEntity(entity, page);
  const identity = `AUTO_AUDIT_CANCEL_${binding.caseId.replace(/[^A-Z0-9]+/g, '_')}_${Date.now()}`;
  const businessMutations: string[] = [];
  const successfulBusinessMutations: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && businessMutationForEntity(entity, pathname)) {
      businessMutations.push(`${request.method()} ${pathname}`);
    }
  });
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(response.request().method())
      && businessMutationForEntity(entity, pathname)
      && response.status() >= 200
      && response.status() < 300) {
      successfulBusinessMutations.push(`${response.request().method()} ${pathname} ${response.status()}`);
    }
  });
  await pageObject.open();
  const surface = await pageObject.openCreateSurface();
  const editable = surface.locator('input:visible, textarea:visible, [contenteditable="true"]:visible').first();
  await editable.fill(identity);
  await pageObject.cancelCurrentSurface();
  if (businessMutations.length !== 0) throw new Error(`${binding.caseId} 取消新增发生业务写请求：${businessMutations.join(', ')}`);
  const assertionIds = [assertionReceipt(binding, 0)];
  await pageObject.searchAndWait(identity);
  await pageObject.expectEmptySearchResults();
  const apiRecords = await groupRecordsByEntity(entity, productCenterApi, identity);
  if (apiRecords.length !== 0) throw new Error(`${binding.caseId} API 仍存在取消后的记录：${identity}`);
  assertionIds.push(assertionReceipt(binding, 1));
  return assertionIds;
}

async function runExistingDetailCancelCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const entity = entityForBinding(binding);
  if (!['spec', 'taste', 'method'].includes(entity)) {
    throw new Error(`${binding.caseId} 不支持已有组明细取消：${entity}`);
  }
  const detailEntity = entity as 'spec' | 'taste' | 'method';
  const record = await seedGroupRecord(entity, productCenterApi, cleanupRegistry);
  const serverId = Number(record.serverId);
  const originalNames = await groupDetailNames(detailEntity, productCenterApi, serverId);
  if (originalNames.length !== 1) {
    throw new Error(`${binding.caseId} 前置组应仅有一个明细，实际为：${originalNames.join(', ')}`);
  }
  executionLedger.markPhase(record.checkpointEntryId, 'api-verified');

  const pageObject = groupPageForEntity(entity, page);
  const candidateIdentity = `AUTO_AUDIT_CANCEL_OPTION_${Date.now()}`;
  const businessMutations: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
      && businessMutationForEntity(entity, pathname)) {
      businessMutations.push(`${request.method()} ${pathname}`);
    }
  });

  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.searchAndWait(record.originalIdentity);
    await pageObject.openEditSurface(record.originalIdentity);
    await pageObject.openAddDetailSurface();
    const editedNames = await pageObject.fillNewestDetailName(candidateIdentity);
    if (editedNames.length !== 2
      || editedNames[0] !== originalNames[0]
      || editedNames[1] !== candidateIdentity) {
      throw new Error(`${binding.caseId} 取消前编辑页明细不符合“原明细+新增明细”：${editedNames.join(', ')}`);
    }
    await pageObject.cancelCurrentSurface();
    if (businessMutations.length !== 0) {
      throw new Error(`${binding.caseId} 取消已有组明细编辑时发生业务写请求：${businessMutations.join(', ')}`);
    }
    assertionIds.push(assertionReceipt(binding, 0));

    const apiNames = await groupDetailNames(detailEntity, productCenterApi, serverId);
    if (apiNames.length !== 1 || apiNames[0] !== originalNames[0]) {
      throw new Error(`${binding.caseId} 取消后 API 明细发生变化：${apiNames.join(', ')}`);
    }
    await pageObject.searchAndWait(record.originalIdentity);
    await pageObject.openEditSurface(record.originalIdentity);
    await pageObject.waitForCurrentDetailNames(originalNames);
    assertionIds.push(assertionReceipt(binding, 1));
    await pageObject.cancelCurrentSurface();
    executionLedger.markPhase(record.checkpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }

  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero || !cleanup.serverIds.map(String).includes(String(record.serverId))) {
    throw new Error(`${binding.caseId} 取消用例夹具清理未覆盖服务端 ID ${record.serverId}`);
  }
  await verifyUiResidueZero(pageObject, [record.originalIdentity]);
  if (executionError) throw executionError;
  return assertionIds;
}

async function runRequiredValidationCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
): Promise<string[]> {
  const entity = entityForBinding(binding);
  if (!['spec', 'taste', 'method', 'combo'].includes(entity)) throw new Error(`${binding.caseId} 尚无字段级必填校验 handler`);
  const pageObject = groupPageForEntity(entity, page);
  await pageObject.open();
  if (binding.expectedUiFeedback?.locale === 'zh-CN') await ensureChineseValidationLocale(page);
  const identity = `AUTO_AUDIT_REQUIRED_${binding.caseId.replace(/[^A-Z0-9]+/g, '_')}_${Date.now()}`;
  const successfulBusinessMutations: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && businessMutationForEntity(entity, pathname)) {
      return;
    }
  });
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(response.request().method())
      && businessMutationForEntity(entity, pathname)
      && response.status() >= 200
      && response.status() < 300) {
      successfulBusinessMutations.push(`${response.request().method()} ${pathname} ${response.status()}`);
    }
  });
  await pageObject.openCreateSurface();
  const exactGroupNameMessage = binding.caseId === 'TC-GRP-TASTE-004'
    ? binding.expectedUiFeedback?.exactMessage
    : null;
  if (binding.caseId === 'TC-GRP-TASTE-004' && !exactGroupNameMessage) {
    throw new Error(`${binding.caseId} 缺少口味组名称精确中文提示合同`);
  }
  const optionGroupValidation = entity === 'combo' || exactGroupNameMessage
    ? null
    : await pageObject.expectOptionGroupRequiredValidation(identity, binding.expectedUiFeedback?.exactMessage);
  if (exactGroupNameMessage) {
    await pageObject.expectGroupNameRequiredValidation(identity, exactGroupNameMessage);
  }
  const assertionIds: string[] = [];
  if (binding.caseId === 'TC-GRP-SPEC-005') {
    if (!optionGroupValidation?.groupNameRequired) throw new Error(`${binding.caseId} 缺少组名称必填 Claim 证据`);
    assertionIds.push(assertionReceipt(binding, 0));
  } else if (entity === 'combo') {
    await pageObject.expectComboNameRequiredValidation(identity);
  }
  if (successfulBusinessMutations.length !== 0) {
    throw new Error(`${binding.caseId} 负向提交出现成功写响应：${successfulBusinessMutations.join(', ')}`);
  }
  await pageObject.cancelCurrentSurface();
  const records = await groupRecordsByEntity(entity, productCenterApi, identity);
  if (records.length !== 0) throw new Error(`${binding.caseId} API 存在必填校验后的脏数据：${identity}`);
  if (binding.caseId === 'TC-GRP-SPEC-005') {
    if (!optionGroupValidation?.detailNameRequired) throw new Error(`${binding.caseId} 缺少规格明细必填 Claim 证据`);
    assertionIds.push(assertionReceipt(binding, 1));
  } else if (entity === 'combo' || binding.caseId === 'TC-GRP-TASTE-004') {
    assertionIds.push(assertionReceipt(binding, 0));
    assertionIds.push(assertionReceipt(binding, 1));
  } else if (binding.caseId === 'TC-GRP-MTH-005') {
    assertionIds.push(assertionReceipt(binding, 0));
    assertionIds.push(assertionReceipt(binding, 1));
  } else {
    assertionIds.push(assertionReceipt(binding, 0));
  }
  return assertionIds;
}

async function runEmptyOptionsValidationCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
): Promise<string[]> {
  const entity = entityForBinding(binding);
  if (!['spec', 'taste', 'method', 'addon'].includes(entity)) throw new Error(`${binding.caseId} 不支持无子项校验`);
  const pageObject = groupPageForEntity(entity, page);
  await pageObject.open();
  if (binding.expectedUiFeedback?.locale === 'zh-CN') await ensureChineseValidationLocale(page);
  const identity = `AUTO_AUDIT_EMPTY_${binding.caseId.replace(/[^A-Z0-9]+/g, '_')}_${Date.now()}`;
  const businessMutationRequests: string[] = [];
  const requestListener = (request: Request) => {
    const pathname = new URL(request.url()).pathname;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
      && businessMutationForEntity(entity, pathname)) {
      businessMutationRequests.push(`${request.method()} ${pathname}`);
    }
  };
  page.on('request', requestListener);
  try {
    await pageObject.openCreateSurface();
    const feedback = await pageObject.expectEmptyOptionsValidation(identity);
    const exactMessage = binding.expectedUiFeedback?.exactMessage;
    if (exactMessage && !feedback.split(' | ').some((value) => value.trim() === exactMessage)) {
      throw new Error(`${binding.caseId} 页面实际提示与审计期望不一致：expected=${exactMessage}; actual=${feedback}`);
    }
  } finally {
    page.off('request', requestListener);
  }
  if (businessMutationRequests.length !== 0) {
    throw new Error(`${binding.caseId} 无子项负向场景发送了业务写请求：${businessMutationRequests.join(', ')}`);
  }
  const assertionIds = [assertionReceipt(binding, 0)];
  await pageObject.cancelCurrentSurface();
  await pageObject.searchAndWait(identity);
  await pageObject.expectEmptySearchResults();
  const records = await groupRecordsByEntity(entity, productCenterApi, identity);
  if (records.length !== 0) throw new Error(`${binding.caseId} API 存在无子项提交后的脏数据：${identity}`);
  assertionIds.push(assertionReceipt(binding, 1));
  return assertionIds;
}

async function runGroupNameDuplicateValidationCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const supportedCaseIds = [
    'TC-GRP-SPEC-008',
    'TC-GRP-SPEC-012',
    'TC-GRP-TASTE-006',
    'TC-GRP-TASTE-022',
    'TC-GRP-MTH-021',
  ];
  if (!supportedCaseIds.includes(binding.caseId)) throw new Error(`不支持的组名称重复用例：${binding.caseId}`);
  const entity = entityForBinding(binding);
  if (!['spec', 'taste', 'method'].includes(entity)) throw new Error(`${binding.caseId} 不支持的重复校验实体：${entity}`);
  const timestamp = Date.now();
  const caseInsensitive = ['TC-GRP-SPEC-012', 'TC-GRP-TASTE-022', 'TC-GRP-MTH-021'].includes(binding.caseId);
  const originalIdentity = `AUTO_AUDIT_${entity.toUpperCase()}_DUP_Case_${timestamp}`;
  const attemptedIdentity = caseInsensitive
    ? `AUTO_AUDIT_${entity.toUpperCase()}_DUP_case_${timestamp}`
    : originalIdentity;
  const originalOption = `AUTO_AUDIT_${entity.toUpperCase()}_DUP_OPTION_${timestamp}`;
  const attemptedOption = `AUTO_AUDIT_${entity.toUpperCase()}_DUP_ATTEMPT_${timestamp}`;
  if (entity === 'spec') {
    await productCenterApi.createSpec({ name: originalIdentity, secondName: '', optionName: originalOption });
  } else if (entity === 'taste') {
    await productCenterApi.createTaste({ name: originalIdentity, secondName: '', optionName: originalOption });
  } else {
    await productCenterApi.createMethod({ name: originalIdentity, secondName: '', optionName: originalOption });
  }
  const record = requireGroupRecord(await waitUntil(
    () => groupRecordsByEntity(entity, productCenterApi, originalIdentity),
    (records) => records.length === 1,
    { timeout: 60_000, interval: 500, message: `${binding.caseId} API 前置造数后未找到唯一组` },
  ).then((records) => records[0]), originalIdentity);
  const checkpointEntryId = `${entity}-${record.id}`;
  cleanupRegistry.register({
    entity: entity === 'spec' ? '规格组' : entity === 'taste' ? '口味组' : '做法组',
    identity: originalIdentity,
    checkpoint: {
      entryId: checkpointEntryId,
      entityKind: entity,
      serverId: record.id,
      identityVariants: [originalIdentity, attemptedIdentity],
      cleanupOrder: 40,
    },
    execute: async () => {
      const residue = await groupRecordsByEntity(entity, productCenterApi, originalIdentity);
      if (!residue.length) return;
      const current = requireGroupRecord(residue[0], originalIdentity);
      if (entity === 'spec') await productCenterApi.deleteSpec(current.id);
      else await productCenterApi.deleteMethod(current.id);
    },
    verify: async () => (
      (await groupRecordsByEntity(entity, productCenterApi, originalIdentity)).length === 0
      && (await groupRecordsByEntity(entity, productCenterApi, attemptedIdentity)).length === 0
    ),
  });
  executionLedger.markPhase(checkpointEntryId, 'mutation-observed');
  executionLedger.markPhase(checkpointEntryId, 'api-verified');
  const pageObject = groupPageForEntity(entity, page);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.openCreateSurface();
    const rejection = await pageObject.submitDuplicateOptionGroup(attemptedIdentity, attemptedOption);
    if (!responseIndicatesBusinessRejection(rejection.status, rejection.responseBody)) {
      throw new Error(`${binding.caseId} 重复名称提交未被后端拒绝：HTTP ${rejection.status}`);
    }
    if (!/duplicat|already exists?|conflict|repeat|不可重复|重复|冲突/i.test(rejection.errorText)) {
      throw new Error(`${binding.caseId} 错误提示不具备重复或冲突语义：${rejection.errorText}`);
    }
    if (binding.expectedResults.length > 1) assertionIds.push(assertionReceipt(binding, 0));
    if (!rejection.pathname.endsWith('/create')) {
      throw new Error(`${binding.caseId} 重复提交后未停留在新增页：${rejection.pathname}`);
    }
    const records = await groupRecordsByEntity(entity, productCenterApi, originalIdentity);
    if (records.length !== 1 || String(requireGroupRecord(records[0], originalIdentity).id) !== String(record.id)) {
      throw new Error(`${binding.caseId} 重复提交后 API 原记录数量或身份异常`);
    }
    const attemptedRecords = attemptedIdentity === originalIdentity
      ? records
      : await groupRecordsByEntity(entity, productCenterApi, attemptedIdentity);
    if (attemptedIdentity !== originalIdentity && attemptedRecords.length > 1) {
      throw new Error(`${binding.caseId} 大小写变体产生了额外 API 记录`);
    }
    await pageObject.open();
    await pageObject.searchAndWait(originalIdentity);
    await pageObject.waitForVisibleIdentityCount(originalIdentity, 1);
    assertionIds.push(assertionReceipt(binding, binding.expectedResults.length - 1));
    executionLedger.markPhase(checkpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero || !cleanup.serverIds.map(String).includes(String(record.id))) {
    throw new Error(`${binding.caseId} 重复校验清理未覆盖服务端 ID ${record.id}`);
  }
  await verifyUiResidueZero(pageObject, [...new Set([originalIdentity, attemptedIdentity])]);
  const ledgerEntry = executionLedger.snapshot().entries.find((entry) => entry.entryId === checkpointEntryId);
  if (ledgerEntry?.phase !== 'residue-verified') throw new Error(`${binding.caseId} 清理检查点未收敛`);
  if (executionError) throw executionError;
  return assertionIds;
}

async function runExistingDetailValidationCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const entity = entityForBinding(binding);
  if (!['spec', 'taste', 'method'].includes(entity)) throw new Error(`${binding.caseId} 不支持已有组明细校验：${entity}`);
  const detailEntity = entity as 'spec' | 'taste' | 'method';
  const timestamp = Date.now();
  const identity = `AUTO_AUDIT_${entity.toUpperCase()}_DETAIL_${timestamp}`;
  const optionIdentity = `AUTO_AUDIT_${entity.toUpperCase()}_OPTION_${timestamp}`;
  if (entity === 'spec') await productCenterApi.createSpec({ name: identity, secondName: '', optionName: optionIdentity });
  else if (entity === 'taste') await productCenterApi.createTaste({ name: identity, secondName: '', optionName: optionIdentity });
  else await productCenterApi.createMethod({ name: identity, secondName: '', optionName: optionIdentity });
  const record = requireGroupRecord(await waitUntil(
    () => groupRecordsByEntity(entity, productCenterApi, identity),
    (records) => records.length === 1,
    { timeout: 60_000, interval: 500, message: `${binding.caseId} API 前置造数后未找到唯一组` },
  ).then((records) => records[0]), identity);
  const checkpointEntryId = `${entity}-${record.id}`;
  cleanupRegistry.register({
    entity: entity === 'spec' ? '规格组' : entity === 'taste' ? '口味组' : '做法组',
    identity,
    checkpoint: {
      entryId: checkpointEntryId,
      entityKind: entity,
      serverId: record.id,
      identityVariants: [identity],
      cleanupOrder: 40,
    },
    execute: async () => {
      const residue = await groupRecordsByEntity(entity, productCenterApi, identity);
      if (!residue.length) return;
      const current = requireGroupRecord(residue[0], identity);
      if (entity === 'spec') await productCenterApi.deleteSpec(current.id);
      else await productCenterApi.deleteMethod(current.id);
    },
    verify: async () => (await groupRecordsByEntity(entity, productCenterApi, identity)).length === 0,
  });
  executionLedger.markPhase(checkpointEntryId, 'mutation-observed');
  executionLedger.markPhase(checkpointEntryId, 'api-verified');

  const pageObject = groupPageForEntity(entity, page);
  const successfulBusinessMutations: string[] = [];
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(response.request().method())
      && businessMutationForEntity(entity, pathname)
      && response.status() >= 200
      && response.status() < 300) {
      successfulBusinessMutations.push(`${response.request().method()} ${pathname} ${response.status()}`);
    }
  });
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    if (binding.handlerId === 'method-group-and-detail-duplicate-validation') {
      await pageObject.open();
      await pageObject.openCreateSurface();
      const rejection = await pageObject.submitDuplicateOptionGroup(identity, `${optionIdentity}_ATTEMPT`);
      if (!responseIndicatesBusinessRejection(rejection.status, rejection.responseBody)
        || !/duplicat|already exists?|conflict|repeat|不可重复|重复|冲突/i.test(rejection.errorText)) {
        throw new Error(`${binding.caseId} 重复组名未获得明确业务拒绝：HTTP ${rejection.status} ${rejection.errorText}`);
      }
      if (!rejection.pathname.endsWith('/create')) throw new Error(`${binding.caseId} 重复组名提交后未停留在新增页`);
      const records = await groupRecordsByEntity(entity, productCenterApi, identity);
      if (records.length !== 1 || requireGroupRecord(records[0], identity).id !== record.id) {
        throw new Error(`${binding.caseId} 重复组名提交后产生额外记录`);
      }
      assertionIds.push(assertionReceipt(binding, 0));
      await pageObject.cancelCurrentSurface();
    }

    await pageObject.open();
    await pageObject.searchAndWait(identity);
    await pageObject.openEditSurface(identity);
    await pageObject.openAddDetailSurface();
    const namesAfterAdd = await pageObject.readCurrentDetailNames();
    if (namesAfterAdd.length !== 2 || namesAfterAdd[0] !== optionIdentity || namesAfterAdd[1] !== '') {
      throw new Error(`${binding.caseId} 新增明细界面不是“原明细+空新行”：${namesAfterAdd.join(', ')}`);
    }
    if (binding.handlerId === 'existing-detail-required-validation' && binding.expectedResults.length === 3) {
      assertionIds.push(assertionReceipt(binding, 0));
    }
    if (binding.handlerId === 'existing-detail-required-validation') {
      const result = await pageObject.submitExistingEmptyDetail();
      if (!result.pathname.endsWith('/create')) throw new Error(`${binding.caseId} 空明细提交后离开编辑页`);
      if (!result.submitDisabled && !result.errorText && detailEntity === 'spec') {
        throw new Error(`${binding.caseId} 空明细提交未形成字段错误或禁用证据`);
      }
    } else {
      const result = await pageObject.submitExistingDuplicateDetail(optionIdentity);
      if (!result.pathname.endsWith('/create')) throw new Error(`${binding.caseId} 重复明细提交后离开编辑页`);
    }
    if (successfulBusinessMutations.length !== 0) {
      throw new Error(`${binding.caseId} 负向明细提交出现成功写响应：${successfulBusinessMutations.join(', ')}`);
    }
    if (binding.handlerId === 'existing-detail-required-validation') {
      assertionIds.push(assertionReceipt(binding, binding.expectedResults.length === 3 ? 1 : 0));
    }

    const apiNames = await groupDetailNames(detailEntity, productCenterApi, record.id);
    if (apiNames.length !== 1 || apiNames[0] !== optionIdentity) {
      throw new Error(`${binding.caseId} 负向提交后 API 明细发生变化：${apiNames.join(', ')}`);
    }
    await pageObject.cancelCurrentSurface();
    await pageObject.searchAndWait(identity);
    await pageObject.expectIdentityRowContains(identity, optionIdentity);
    if (binding.handlerId === 'existing-detail-required-validation') {
      assertionIds.push(assertionReceipt(binding, binding.expectedResults.length - 1));
    } else if (binding.handlerId === 'existing-detail-duplicate-validation') {
      assertionIds.push(assertionReceipt(binding, 0));
    } else {
      assertionIds.push(assertionReceipt(binding, 1));
    }
    executionLedger.markPhase(checkpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero || !cleanup.serverIds.map(String).includes(String(record.id))) {
    throw new Error(`${binding.caseId} 明细校验清理未覆盖服务端 ID ${record.id}`);
  }
  await verifyUiResidueZero(pageObject, [identity]);
  const ledgerEntry = executionLedger.snapshot().entries.find((entry) => entry.entryId === checkpointEntryId);
  if (ledgerEntry?.phase !== 'residue-verified') throw new Error(`${binding.caseId} 清理检查点未收敛`);
  if (executionError) throw executionError;
  return assertionIds;
}

async function groupDetailNames(
  entity: 'spec' | 'taste' | 'method',
  productCenterApi: ProductCenterApi,
  id: number,
): Promise<string[]> {
  const detail = entity === 'spec'
    ? await productCenterApi.specDetail(id)
    : entity === 'taste'
      ? await productCenterApi.tasteDetail(id)
      : await productCenterApi.methodDetail(id);
  return extractArray(detail, 'options')
    .map((option) => option.name)
    .filter((name): name is string => typeof name === 'string');
}

async function runEmptyGroupDeleteCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const entity = entityForBinding(binding);
  if (!['spec', 'addon'].includes(entity)) throw new Error(`${binding.caseId} 不支持空组删除：${entity}`);
  const identity = `AUTO_AUDIT_${entity.toUpperCase()}_EMPTY_DELETE_${Date.now()}`;
  if (entity === 'spec') {
    await productCenterApi.createSpec({ name: identity, secondName: '', optionName: '', allowEmptyOptions: true });
  } else {
    await productCenterApi.createAddonGroup({ name: identity, secondName: '' });
  }
  const record = requireGroupRecord(await waitUntil(
    () => groupRecordsByEntity(entity, productCenterApi, identity),
    (records) => records.length === 1,
    { timeout: 60_000, interval: 500, message: `${binding.caseId} 空组造数后未找到唯一记录` },
  ).then((records) => records[0]), identity);
  const checkpointEntryId = `${entity}-${record.id}`;
  cleanupRegistry.register({
    entity: entity === 'spec' ? '空规格组' : '空加料组',
    identity,
    checkpoint: { entryId: checkpointEntryId, entityKind: entity, serverId: record.id, identityVariants: [identity], cleanupOrder: 40 },
    execute: async () => {
      const residue = await groupRecordsByEntity(entity, productCenterApi, identity);
      if (!residue.length) return;
      if (entity === 'spec') await productCenterApi.deleteSpec(record.id);
      else await productCenterApi.deleteAddonGroup(record.id);
    },
    verify: async () => (await groupRecordsByEntity(entity, productCenterApi, identity)).length === 0,
  });
  executionLedger.markPhase(checkpointEntryId, 'mutation-observed');
  executionLedger.markPhase(checkpointEntryId, 'api-verified');
  const pageObject = groupPageForEntity(entity, page);
  let executionError: unknown;
  const assertionIds: string[] = [];
  try {
    await pageObject.open();
    await pageObject.searchAndWait(identity);
    await pageObject.waitForVisibleIdentityCount(identity, 1);
    const response = await pageObject.deleteIdentityAndConfirm(identity);
    if (!response.ok()) throw new Error(`${binding.caseId} UI 删除接口失败 HTTP ${response.status()}`);
    assertionIds.push(assertionReceipt(binding, 0));
    const residue = await groupRecordsByEntity(entity, productCenterApi, identity);
    if (residue.length !== 0) throw new Error(`${binding.caseId} 删除后 API 仍有记录`);
    await pageObject.waitForVisibleIdentityCount(identity, 0);
    await pageObject.expectEmptySearchResults();
    if (binding.expectedResults.length > 1) assertionIds.push(assertionReceipt(binding, 1));
    executionLedger.markPhase(checkpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero || !cleanup.serverIds.map(String).includes(String(record.id))) {
    throw new Error(`${binding.caseId} 空组删除清理未覆盖服务端 ID ${record.id}`);
  }
  await verifyUiResidueZero(pageObject, [identity]);
  if (executionError) throw executionError;
  return assertionIds;
}

async function runSpecCrossGroupOptionDuplicateCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const timestamp = Date.now();
  const originalIdentity = `AUTO_AUDIT_SPEC_CROSS_ORIGINAL_${timestamp}`;
  const attemptedIdentity = `AUTO_AUDIT_SPEC_CROSS_ATTEMPT_${timestamp}`;
  const optionIdentity = `AUTO_AUDIT_SPEC_CROSS_OPTION_${timestamp}`;
  await productCenterApi.createSpec({ name: originalIdentity, secondName: '', optionName: optionIdentity });
  const record = requireGroupRecord(await waitUntil(
    () => groupRecordsByEntity('spec', productCenterApi, originalIdentity),
    (records) => records.length === 1,
    { timeout: 60_000, interval: 500, message: `${binding.caseId} 原规格组造数失败` },
  ).then((records) => records[0]), originalIdentity);
  const checkpointEntryId = `spec-${record.id}`;
  cleanupRegistry.register({
    entity: '跨组规格重名原记录', identity: originalIdentity,
    checkpoint: { entryId: checkpointEntryId, entityKind: 'spec', serverId: record.id, identityVariants: [originalIdentity, attemptedIdentity], cleanupOrder: 40 },
    execute: async () => {
      const original = await groupRecordsByEntity('spec', productCenterApi, originalIdentity);
      if (original.length) await productCenterApi.deleteSpec(record.id);
      const attempted = await groupRecordsByEntity('spec', productCenterApi, attemptedIdentity);
      if (attempted.length) await productCenterApi.deleteSpec(requireGroupRecord(attempted[0], attemptedIdentity).id);
    },
    verify: async () => (await groupRecordsByEntity('spec', productCenterApi, originalIdentity)).length === 0
      && (await groupRecordsByEntity('spec', productCenterApi, attemptedIdentity)).length === 0,
  });
  executionLedger.markPhase(checkpointEntryId, 'mutation-observed');
  executionLedger.markPhase(checkpointEntryId, 'api-verified');
  const pageObject = createSpecificationsPage(page);
  let executionError: unknown;
  const assertionIds: string[] = [];
  try {
    await pageObject.open();
    await pageObject.openCreateSurface();
    const rejection = await pageObject.submitDuplicateOptionGroup(attemptedIdentity, optionIdentity);
    if (!responseIndicatesBusinessRejection(rejection.status, rejection.responseBody)
      || !/duplicat|already exists?|conflict|repeat|不可重复|重复|冲突/i.test(rejection.errorText)) {
      throw new Error(`${binding.caseId} 跨组规格重名未明确拒绝：HTTP ${rejection.status} ${rejection.errorText}`);
    }
    assertionIds.push(assertionReceipt(binding, 0));
    if ((await groupRecordsByEntity('spec', productCenterApi, attemptedIdentity)).length !== 0) {
      throw new Error(`${binding.caseId} 生成了第二个含重名规格的组`);
    }
    const originalDetail = await productCenterApi.specDetail(record.id);
    if (groupDetailOptionCount(originalDetail, optionIdentity) !== 1) throw new Error(`${binding.caseId} 原规格明细数量不是1`);
    assertionIds.push(assertionReceipt(binding, 1));
    executionLedger.markPhase(checkpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 跨组规格重名清理未收敛`);
  await verifyUiResidueZero(pageObject, [originalIdentity, attemptedIdentity]);
  if (executionError) throw executionError;
  return assertionIds;
}

async function runSpecFullFieldCreateCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const identity = `AUTO_AUDIT_SPEC_FULL_${Date.now()}`;
  const pageObject = createSpecificationsPage(page);
  await pageObject.open();
  await pageObject.openCreateSurface();
  const created = await pageObject.createFullSpecificationGroup(identity);
  const record = requireGroupRecord(await waitUntil(
    () => groupRecordsByEntity('spec', productCenterApi, identity),
    (records) => records.length === 1,
    { timeout: 60_000, interval: 500, message: `${binding.caseId} 全字段创建后未找到唯一规格组` },
  ).then((records) => records[0]), identity);
  const checkpointEntryId = `spec-${record.id}`;
  cleanupRegistry.register({
    entity: '规格全字段组', identity,
    checkpoint: { entryId: checkpointEntryId, entityKind: 'spec', serverId: record.id, identityVariants: [identity], cleanupOrder: 40 },
    execute: async () => { if ((await groupRecordsByEntity('spec', productCenterApi, identity)).length) await productCenterApi.deleteSpec(record.id); },
    verify: async () => (await groupRecordsByEntity('spec', productCenterApi, identity)).length === 0,
  });
  executionLedger.markPhase(checkpointEntryId, 'mutation-observed');
  let executionError: unknown;
  const assertionIds: string[] = [];
  try {
    if (!created.response.ok()) throw new Error(`${binding.caseId} 全字段创建响应失败 HTTP ${created.response.status()}`);
    const visibleErrors = await page.locator(
      '.ant-message-error:visible, .ant-notification-notice-error:visible, [role=alert]:visible',
    ).allTextContents();
    if (visibleErrors.some((value) => value.trim().length > 0)) {
      throw new Error(`${binding.caseId} 全字段创建后存在可见错误：${visibleErrors.join(' | ')}`);
    }
    assertionIds.push(assertionReceipt(binding, 0));
    const detail = await productCenterApi.specDetail(record.id) as Record<string, unknown>;
    const values = created.values;
    for (const expected of [values.name, values.secondName, values.displayName, values.optionName, values.optionSecondName, values.specValue, values.deviceCode]) {
      if (!containsScalarValue(detail, expected)) throw new Error(`${binding.caseId} API 详情缺少全字段值：${expected}`);
    }
    executionLedger.markPhase(checkpointEntryId, 'api-verified');
    await pageObject.open();
    await pageObject.expectIdentityRowContains(identity, values.optionName);
    assertionIds.push(assertionReceipt(binding, 1));
    executionLedger.markPhase(checkpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 规格全字段创建清理未收敛`);
  await verifyUiResidueZero(pageObject, [identity]);
  if (executionError) throw executionError;
  return assertionIds;
}

function groupDetailOptionCount(value: unknown, identity: string): number {
  return extractArray(value, 'options').filter((option) => option.name === identity).length;
}

async function runSingleDetailDeleteBoundaryCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const entity = entityForBinding(binding);
  if (!['taste', 'method'].includes(entity)) throw new Error(`${binding.caseId} 不支持单子项删除边界：${entity}`);
  const detailEntity = entity as 'taste' | 'method';
  const timestamp = Date.now();
  const identity = `AUTO_AUDIT_${entity.toUpperCase()}_SINGLE_${timestamp}`;
  const optionIdentity = `AUTO_AUDIT_${entity.toUpperCase()}_ONLY_${timestamp}`;
  if (entity === 'taste') await productCenterApi.createTaste({ name: identity, secondName: '', optionName: optionIdentity });
  else await productCenterApi.createMethod({ name: identity, secondName: '', optionName: optionIdentity });
  const record = requireGroupRecord(await waitUntil(
    () => groupRecordsByEntity(entity, productCenterApi, identity),
    (records) => records.length === 1,
    { timeout: 60_000, interval: 500, message: `${binding.caseId} 单子项组造数失败` },
  ).then((records) => records[0]), identity);
  const checkpointEntryId = `${entity}-${record.id}`;
  cleanupRegistry.register({
    entity: entity === 'taste' ? '单子项口味组' : '单子项做法组', identity,
    checkpoint: { entryId: checkpointEntryId, entityKind: entity, serverId: record.id, identityVariants: [identity], cleanupOrder: 40 },
    execute: async () => { if ((await groupRecordsByEntity(entity, productCenterApi, identity)).length) await productCenterApi.deleteMethod(record.id); },
    verify: async () => (await groupRecordsByEntity(entity, productCenterApi, identity)).length === 0,
  });
  executionLedger.markPhase(checkpointEntryId, 'mutation-observed');
  executionLedger.markPhase(checkpointEntryId, 'api-verified');
  const pageObject = groupPageForEntity(entity, page);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await pageObject.open();
    if (binding.expectedUiFeedback?.locale === 'zh-CN') await ensureChineseValidationLocale(page);
    await pageObject.searchAndWait(identity);
    await pageObject.openEditSurface(identity);
    const result = await pageObject.attemptDeleteOnlyDetail(optionIdentity);
    if (!result.blocked) throw new Error(`${binding.caseId} 唯一子项删除未被页面拦截`);
    const exactMessage = binding.expectedUiFeedback?.exactMessage;
    if (exactMessage && !result.messageText.split(' | ').some((value) => value.includes(exactMessage))) {
      throw new Error(`${binding.caseId} 唯一子项删除提示不精确：expected=${exactMessage}; actual=${result.messageText}`);
    }
    assertionIds.push(assertionReceipt(binding, 0));
    const apiNames = await groupDetailNames(detailEntity, productCenterApi, record.id);
    if (apiNames.length !== 1 || apiNames[0] !== optionIdentity) {
      throw new Error(`${binding.caseId} 唯一子项删除后 API 未保留原明细：${apiNames.join(', ')}`);
    }
    await pageObject.cancelCurrentSurface();
    await pageObject.searchAndWait(identity);
    await pageObject.expectIdentityRowContains(identity, optionIdentity);
    assertionIds.push(assertionReceipt(binding, 1));
    executionLedger.markPhase(checkpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 单子项删除边界清理未收敛`);
  await verifyUiResidueZero(pageObject, [identity]);
  if (executionError) throw executionError;
  return assertionIds;
}

async function runUnreferencedOptionDetailDeleteCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  if (binding.caseId === 'TC-GRP-SPEC-015') {
    return runUnreferencedSpecOptionDetailDeleteWithOwnerCase(
      binding, page, productCenterApi, cleanupRegistry, executionLedger,
    );
  }
  const entity = entityForBinding(binding);
  if (!['spec', 'taste', 'method'].includes(entity)) {
    throw new Error(`${binding.caseId} 不支持未引用明细删除：${entity}`);
  }
  const detailEntity = entity as 'spec' | 'taste' | 'method';
  const timestamp = Date.now();
  const identity = `AUTO_AUDIT_${entity.toUpperCase()}_DELETE_${timestamp}`;
  const retainedOption = `AUTO_AUDIT_${entity.toUpperCase()}_KEEP_${timestamp}`;
  const deletedOption = `AUTO_AUDIT_${entity.toUpperCase()}_REMOVE_${timestamp}`;
  if (entity === 'spec') {
    await productCenterApi.createSpec({ name: identity, secondName: '', optionName: retainedOption, optionNames: [retainedOption, deletedOption] });
  } else if (entity === 'taste') {
    await productCenterApi.createTaste({ name: identity, secondName: '', optionName: retainedOption, optionNames: [retainedOption, deletedOption] });
  } else {
    await productCenterApi.createMethod({ name: identity, secondName: '', optionName: retainedOption, optionNames: [retainedOption, deletedOption] });
  }
  const record = requireGroupRecord(await waitUntil(
    () => groupRecordsByEntity(entity, productCenterApi, identity),
    (records) => records.length === 1,
    { timeout: 60_000, interval: 500, message: `${binding.caseId} 未引用明细删除造数失败` },
  ).then((records) => records[0]), identity);
  const checkpointEntryId = `${entity}-${record.id}`;
  cleanupRegistry.register({
    entity: `${entity} 未引用明细删除组`,
    identity,
    checkpoint: { entryId: checkpointEntryId, entityKind: entity, serverId: record.id, identityVariants: [identity], cleanupOrder: 40 },
    execute: async () => {
      if (!(await groupRecordsByEntity(entity, productCenterApi, identity)).length) return;
      if (entity === 'spec') await productCenterApi.deleteSpec(record.id);
      else await productCenterApi.deleteMethod(record.id);
    },
    verify: async () => (await groupRecordsByEntity(entity, productCenterApi, identity)).length === 0,
  });
  executionLedger.markPhase(checkpointEntryId, 'mutation-observed');
  executionLedger.markPhase(checkpointEntryId, 'api-verified');
  const pageObject = groupPageForEntity(entity, page);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.searchAndWait(identity);
    await pageObject.openEditSurface(identity);
    const deletion = await pageObject.deleteUnreferencedOptionDetailAndSave(deletedOption);
    assertionIds.push(assertionReceipt(binding, 0));
    if (binding.expectedResults.length === 3) assertionIds.push(assertionReceipt(binding, 1));
    const names = await waitUntil(
      () => groupDetailNames(detailEntity, productCenterApi, record.id),
      (current) => current.length === 1 && current[0] === retainedOption,
      { timeout: 30_000, interval: 500, message: `${binding.caseId} 删除后 API 明细未收敛` },
    );
    if (names.length !== 1 || names[0] !== retainedOption) {
      throw new Error(`${binding.caseId} 删除后 API 明细不精确：${names.join(', ')}；提交payload=${JSON.stringify(deletion.requestPayload)}`);
    }
    await pageObject.searchAndWait(identity);
    await pageObject.expectIdentityRowContains(identity, retainedOption);
    assertionIds.push(assertionReceipt(binding, binding.expectedResults.length - 1));
    executionLedger.markPhase(checkpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 未引用明细删除清理未收敛`);
  await verifyUiResidueZero(pageObject, [identity]);
  if (executionError) throw executionError;
  if (assertionIds.length !== binding.expectedResults.length) {
    throw new Error(`${binding.caseId} 断言收据数量不完整：${assertionIds.length}/${binding.expectedResults.length}`);
  }
  return assertionIds;
}

async function runUnreferencedSpecOptionDetailDeleteWithOwnerCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const flow = new StandardItem216Flow(page, productCenterApi, cleanupRegistry);
  const prepared = await flow.verifyAddedAttributeOptionNotPropagated(binding.caseId, 'spec');
  const fixture = prepared.fixture as { id: number; groupName: string };
  const ownerId = Number(prepared.ownerId);
  const ownerIdentity = String(prepared.ownerIdentity);
  const retainedOption = String(prepared.originalOption);
  const deletedOption = String(prepared.addedOption);
  const pageObject = createSpecificationsPage(page);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.searchAndWait(fixture.groupName);
    await pageObject.openEditSurface(fixture.groupName);
    const deletion = await pageObject.deleteUnreferencedOptionDetailAndSave(deletedOption);
    if (!deletion.response.ok()) throw new Error(`${binding.caseId} 未引用规格明细删除保存失败`);
    assertionIds.push(assertionReceipt(binding, 0));
    const names = await groupDetailNames('spec', productCenterApi, fixture.id);
    if (names.length !== 1 || names[0] !== retainedOption) {
      throw new Error(`${binding.caseId} 规格组 API 删除终态不正确：${names.join(', ')}`);
    }
    const ownerAfter = JSON.stringify(await productCenterApi.productDetail(ownerId));
    if (!ownerAfter.includes(fixture.groupName)
      || !ownerAfter.includes(retainedOption)
      || ownerAfter.includes(deletedOption)) {
      throw new Error(`${binding.caseId} 引用商品终态不正确`);
    }
    await pageObject.searchAndWait(fixture.groupName);
    await pageObject.expectIdentityRowContains(fixture.groupName, retainedOption);
    await flow.verifySpecOwnerUiTerminal(binding.caseId, ownerIdentity, [retainedOption], [deletedOption]);
    assertionIds.push(assertionReceipt(binding, 1));
    for (const entry of executionLedger.snapshot().entries.filter((item) => (
      item.identityVariants.includes(fixture.groupName) || item.identityVariants.includes(ownerIdentity)
    ))) executionLedger.markPhase(entry.entryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 未引用规格明细删除夹具清理未收敛`);
  await verifyUiResidueZero(pageObject, [fixture.groupName]);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  await itemList.fillSearchForResidueCheck(ownerIdentity);
  await itemList.expectEmptySearchResults(10_000);
  if (executionError) throw executionError;
  return assertionIds;
}

async function runReferencedOptionDetailDeleteBlockedCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const entity = entityForBinding(binding);
  if (!['spec', 'taste', 'method'].includes(entity)) {
    throw new Error(`${binding.caseId} 不支持被引用明细删除：${entity}`);
  }
  const detailEntity = entity as 'spec' | 'taste' | 'method';
  const fixture = await new StandardItem216Flow(page, productCenterApi, cleanupRegistry)
    .createReferencedAttributeGroupFixture(binding.caseId, detailEntity);
  const referencedOption = fixture.optionNames[0];
  const ownerBefore = await productCenterApi.productDetail(fixture.ownerId);
  const ownerText = JSON.stringify(ownerBefore);
  if (!ownerText.includes(fixture.groupName) || !ownerText.includes(referencedOption)) {
    throw new Error(`${binding.caseId} owner 商品未回读真实组及明细引用：${fixture.groupName}/${referencedOption}`);
  }
  if (binding.expectedUiFeedback?.locale === 'zh-CN') await ensureChineseValidationLocale(page);
  const pageObject = groupPageForEntity(entity, page);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.searchAndWait(fixture.groupName);
    await pageObject.openEditSurface(fixture.groupName);
    const deletion = await pageObject.attemptDeleteReferencedOptionDetail(referencedOption);
    const beforeNames = deletion.beforeNames;
    const afterNames = deletion.currentNames;
    if (!beforeNames.includes(referencedOption)) {
      throw new Error(`${binding.caseId} 删除前页面未展示被引用明细：${referencedOption}`);
    }
    const namesAfter = await groupDetailNames(detailEntity, productCenterApi, fixture.groupId);
    const ownerAfter = JSON.stringify(await productCenterApi.productDetail(fixture.ownerId));
    const responseBody = deletion.response ? await deletion.response.json().catch(() => null) : null;
    const rejectionText = `${deletion.confirmationText} ${JSON.stringify(responseBody)}`;
    const referencedSemantic = /used|using|referenc|associated|association|关联|引用|使用|占用|不可删除|不能删除/i.test(rejectionText);
    const uiBusinessRejected = /failed|already associated|不可删除|不能删除|删除失败|已关联|已引用/i.test(deletion.confirmationText);
    const responseRejected = deletion.response !== null
      && (!deletion.response.ok()
        || responseIndicatesBusinessRejection(deletion.response.status(), responseBody)
        || uiBusinessRejected);
    const exactMessage = binding.expectedUiFeedback?.exactMessage;
    const immediateUiRejected = deletion.response === null
      && Boolean(exactMessage)
      && deletion.confirmationText.split(' | ').some((value) => value.trim() === exactMessage);
    const retainedInGroup = namesAfter.includes(referencedOption);
    const retainedInOwner = ownerAfter.includes(fixture.groupName) && ownerAfter.includes(referencedOption);
    if ((!responseRejected && !immediateUiRejected) || !referencedSemantic) {
      throw new Error(`${binding.caseId} 被引用明细删除未形成明确拒绝提示：${rejectionText}`);
    }
    assertionIds.push(assertionReceipt(binding, 0));
    if (!retainedInGroup || !retainedInOwner || !afterNames.includes(referencedOption)) {
      throw new Error(`${binding.caseId} 被引用明细删除未形成拒绝终态：${JSON.stringify({
        responseStatus: deletion.response?.status() ?? null,
        responseRejected,
        referencedSemantic,
        beforeNames,
        afterNames,
        namesAfter,
        retainedInOwner,
        confirmationText: deletion.confirmationText,
      })}`);
    }
    if (binding.expectedResults.length > 1) assertionIds.push(assertionReceipt(binding, 1));
    executionLedger.markPhase(`standard-item-${detailEntity}-${fixture.groupId}`, 'ui-verified');
    executionLedger.markPhase(`item-${fixture.ownerId}`, 'ui-verified');
  } catch (error) {
    executionError = error;
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 被引用明细删除清理未收敛`);
  await verifyUiResidueZero(pageObject, [fixture.groupName]);
  if (binding.expectedUiFeedback?.locale === 'zh-CN') await ensureEnglishValidationLocale(page);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  await itemList.fillSearchForResidueCheck(fixture.ownerIdentity);
  await itemList.expectEmptySearchResults(10_000);
  if (namedRecords(await productCenterApi.productPage(fixture.ownerIdentity), fixture.ownerIdentity).length !== 0) {
    throw new Error(`${binding.caseId} 被引用明细 owner 商品仍有残留`);
  }
  if (executionError) throw executionError;
  return assertionIds;
}

async function runReferencedOptionDetailDeleteConfirmedCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const entity = entityForBinding(binding);
  if (!['taste', 'method'].includes(entity)) throw new Error(`${binding.caseId} 不支持引用后确认删除：${entity}`);
  const attributeEntity = entity as 'taste' | 'method';
  const flow = new StandardItem216Flow(page, productCenterApi, cleanupRegistry);
  const fixture = await flow.createReferencedAttributeGroupFixture(binding.caseId, attributeEntity);
  const removedOption = fixture.optionNames[0];
  const retainedOptions = fixture.optionNames.slice(1);
  const ownerBefore = JSON.stringify(await productCenterApi.productDetail(fixture.ownerId));
  if (!ownerBefore.includes(fixture.groupName) || !ownerBefore.includes(removedOption)) {
    throw new Error(`${binding.caseId} owner 商品未建立${entity === 'taste' ? '口味' : '做法'}引用：${fixture.groupName}/${removedOption}`);
  }
  const pageObject = groupPageForEntity(attributeEntity, page);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.searchAndWait(fixture.groupName);
    await pageObject.openEditSurface(fixture.groupName);
    const deletion = await pageObject.attemptDeleteReferencedOptionDetail(removedOption);
    const responseBody = deletion.response ? await deletion.response.json().catch(() => null) : null;
    if (!deletion.response || !deletion.response.ok()
      || responseIndicatesBusinessRejection(deletion.response.status(), responseBody)) {
      throw new Error(`${binding.caseId} 被引用${entity === 'taste' ? '口味' : '做法'}确认删除未成功：HTTP ${deletion.response?.status() ?? 'none'}`);
    }
    if (!/确认变更|Confirm Modification/i.test(deletion.confirmationText)
      || !deletion.confirmationText.includes(removedOption)
      || !/影响所有关联商品|affects? all related products|affects? all linked (?:products|items)/i.test(deletion.confirmationText)) {
      throw new Error(`${binding.caseId} 被引用${entity === 'taste' ? '口味' : '做法'}删除缺少准确影响预览：${deletion.confirmationText}`);
    }
    assertionIds.push(assertionReceipt(binding, 0));
    assertionIds.push(assertionReceipt(binding, 1));
    const namesAfter = await waitUntil(
      () => groupDetailNames(attributeEntity, productCenterApi, fixture.groupId),
      (names) => !names.includes(removedOption) && retainedOptions.every((name) => names.includes(name)),
      { timeout: 30_000, interval: 500, message: `${binding.caseId} ${entity === 'taste' ? '口味' : '做法'}组 API 未形成删除终态` },
    );
    const ownerAfter = await waitUntil(
      () => productCenterApi.productDetail(fixture.ownerId),
      (detail) => {
        const text = JSON.stringify(detail);
        return text.includes(fixture.groupName)
          && !text.includes(removedOption)
          && retainedOptions.every((name) => text.includes(name));
      },
      { timeout: 30_000, interval: 500, message: `${binding.caseId} 引用商品 API 未同步${entity === 'taste' ? '口味' : '做法'}删除` },
    );
    await flow.verifyAttributeOwnerUiTerminal(
      binding.caseId,
      fixture.ownerIdentity,
      fixture.groupName,
      retainedOptions,
      [removedOption],
    );
    if (namesAfter.includes(removedOption) || JSON.stringify(ownerAfter).includes(removedOption)) {
      throw new Error(`${binding.caseId} 被删除${entity === 'taste' ? '口味' : '做法'}仍存在于 API 终态`);
    }
    assertionIds.push(assertionReceipt(binding, 2));
    for (const entry of executionLedger.snapshot().entries.filter((item) => (
      item.identityVariants.includes(fixture.groupName) || item.identityVariants.includes(fixture.ownerIdentity)
    ))) executionLedger.markPhase(entry.entryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }
  if ((await groupRecordsByEntity(attributeEntity, productCenterApi, fixture.groupName)).length > 0) {
    await productCenterApi.deleteMethod(fixture.groupId);
    await waitUntil(
      () => groupRecordsByEntity(attributeEntity, productCenterApi, fixture.groupName),
      (records) => records.length === 0,
      { timeout: 30_000, interval: 500, message: `${binding.caseId} 清理前删除${entity === 'taste' ? '口味' : '做法'}组未收敛` },
    );
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 被引用${entity === 'taste' ? '口味' : '做法'}明细删除夹具清理未收敛`);
  await verifyUiResidueZero(pageObject, [fixture.groupName]);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  await itemList.fillSearchForResidueCheck(fixture.ownerIdentity);
  await itemList.expectEmptySearchResults(10_000);
  if (executionError) throw executionError;
  return assertionIds;
}

async function runComboEmptyItemsValidationCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
): Promise<string[]> {
  const comboType = comboValidationTypeForTitle(binding.title);
  const typeKey = comboType.replace(/\W+/g, '_').toUpperCase();
  const identity = `AUTO_AUDIT_COMBO_EMPTY_${typeKey}_${Date.now()}`;
  const pageObject = createCombosPage(page);
  await pageObject.open();
  await ensureChineseValidationLocale(page);
  await pageObject.openCreateSurface();
  const rejection = await pageObject.submitEmptyComboGroup(identity, comboType);
  const records = await groupRecordsByEntity('combo', productCenterApi, identity);
  if (records.length) {
    for (const record of records) await productCenterApi.deleteComboGroup(requireGroupRecord(record, identity).id);
    if ((await groupRecordsByEntity('combo', productCenterApi, identity)).length !== 0) {
      throw new Error(`${binding.caseId} 意外创建的套餐组清理失败：${identity}`);
    }
    throw new Error(`${binding.caseId} 无商品提交意外创建了套餐组：HTTP ${rejection.responseStatus}`);
  }
  const rejectedByResponse = rejection.responseStatus !== null
    && responseIndicatesBusinessRejection(rejection.responseStatus, rejection.responseBody);
  if (!rejectedByResponse && !rejection.errorText) {
    throw new Error(`${binding.caseId} 无商品提交既无业务拒绝响应也无可见错误`);
  }
  const expectedAuditMessage = binding.expectedUiFeedback?.exactMessage;
  if (!expectedAuditMessage) throw new Error(`${binding.caseId} 缺少无商品反馈审计合同`);
  if (!rejection.errorText.split(' | ').some((value) => value.trim() === expectedAuditMessage)) {
    throw new ObservedProductDifferenceError(
      `${binding.caseId} 页面实际提示与审计期望不一致：expected=${expectedAuditMessage}; actual=${rejection.errorText}`,
      {
        schemaVersion: '1.0.0',
        caseId: binding.caseId,
        title: binding.title,
        generatedAt: new Date().toISOString(),
        route: new URL(page.url()).pathname,
        inputValues: { identity, comboType, minimumSelectionQuantity: 1, maximumSelectionQuantity: 1 },
        expectedLocale: binding.expectedUiFeedback?.locale ?? null,
        expectedMessage: expectedAuditMessage,
        actualMessages: rejection.errorText.split(' | ').map((value) => value.trim()).filter(Boolean),
        responseStatus: rejection.responseStatus,
        rejectedByResponse,
        persistedGroupIds: records.map((record) => requireGroupRecord(record, identity).id),
        productMismatchConfirmed: true,
        executionPathEquivalent: true,
        evidenceComplete: true,
        productBehavior: 'observed-product-drift',
      },
    );
  }
  if (!/item|product|combo|required|add|商品|子项|必填/i.test(rejection.errorText)
    && !rejectedByResponse) {
    throw new Error(`${binding.caseId} 无商品错误缺少商品/子项语义：${rejection.errorText}`);
  }
  const assertionIds = [assertionReceipt(binding, 0)];
  if (binding.expectedResults.length > 1) assertionIds.push(assertionReceipt(binding, 1));
  await pageObject.cancelCurrentSurface();
  return assertionIds;
}

async function runUnreferencedSpecDetailAddCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  if (binding.caseId !== 'TC-GRP-SPEC-014') throw new Error(`不支持的未引用规格新增明细用例：${binding.caseId}`);
  const timestamp = Date.now();
  const identity = `AUTO_AUDIT_SPEC_UNREFERENCED_${timestamp}`;
  const originalOption = `AUTO_AUDIT_SPEC_ORIGINAL_${timestamp}`;
  const addedOption = `AUTO_AUDIT_SPEC_ADDED_${timestamp}`;
  await productCenterApi.createSpec({ name: identity, secondName: '', optionName: originalOption });
  const record = requireGroupRecord(await waitUntil(
    () => groupRecordsByEntity('spec', productCenterApi, identity),
    (records) => records.length === 1,
    { timeout: 60_000, interval: 500, message: `${binding.caseId} 未引用规格组造数失败` },
  ).then((records) => records[0]), identity);
  const checkpointEntryId = `spec-${record.id}`;
  cleanupRegistry.register({
    entity: '未引用规格组', identity,
    checkpoint: { entryId: checkpointEntryId, entityKind: 'spec', serverId: record.id, identityVariants: [identity], cleanupOrder: 40 },
    execute: async () => { if ((await groupRecordsByEntity('spec', productCenterApi, identity)).length) await productCenterApi.deleteSpec(record.id); },
    verify: async () => (await groupRecordsByEntity('spec', productCenterApi, identity)).length === 0,
  });
  executionLedger.markPhase(checkpointEntryId, 'mutation-observed');
  executionLedger.markPhase(checkpointEntryId, 'api-verified');
  const pageObject = createSpecificationsPage(page);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.searchAndWait(identity);
    await pageObject.openEditSurface(identity);
    await pageObject.openAddDetailSurface();
    const response = await pageObject.saveAddedSpecificationDetail(addedOption);
    if (!response.ok()) throw new Error(`${binding.caseId} UI 新增规格明细失败 HTTP ${response.status()}`);
    const names = await groupDetailNames('spec', productCenterApi, record.id);
    if (names.length !== 2 || !names.includes(originalOption) || !names.includes(addedOption)) {
      throw new Error(`${binding.caseId} API 回读未同时包含原明细和新增明细：${names.join(', ')}`);
    }
    await pageObject.searchAndWait(identity);
    await pageObject.expectIdentityRowContainsAll(identity, [originalOption, addedOption]);
    assertionIds.push(assertionReceipt(binding, 0));
    executionLedger.markPhase(checkpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero || !cleanup.serverIds.map(String).includes(String(record.id))) {
    throw new Error(`${binding.caseId} 未引用规格组清理未覆盖服务端 ID ${record.id}`);
  }
  await verifyUiResidueZero(pageObject, [identity]);
  if (executionError) throw executionError;
  return assertionIds;
}

async function groupRecordsByEntity(
  entity: GroupEntity,
  api: ProductCenterApi,
  identity: string,
): Promise<unknown[]> {
  const response = entity === 'spec'
    ? await api.specPage(identity)
    : entity === 'taste'
      ? await api.tastePage(identity)
      : entity === 'method'
        ? await api.methodPage(identity)
        : entity === 'addon'
          ? await api.addonGroupList(identity)
          : await api.comboGroupList();
  return namedRecords(response, identity);
}

function collectPriceEvidence(
  value: unknown,
  path: string[] = [],
  output: Array<{ path: string; value: unknown }> = [],
): Array<{ path: string; value: unknown }> {
  if (output.length >= 40) return output;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectPriceEvidence(item, [...path, String(index)], output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = [...path, key];
    if (/price/i.test(key) && (typeof child === 'string' || typeof child === 'number' || child === null)) {
      output.push({ path: childPath.join('.'), value: child });
    }
    collectPriceEvidence(child, childPath, output);
    if (output.length >= 40) break;
  }
  return output;
}

async function runProfileCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<void> {
  if (binding.module.includes('属性集管理')) {
    await runAttributeProfile(binding, page);
    return;
  }

  const entity = entityForBinding(binding);
  const pageObject = groupPageForEntity(entity, page);
  if (binding.executionProfile === 'cancel') {
    await pageObject.open();
    await pageObject.openCreateSurface();
    await pageObject.cancelCurrentSurface();
    return;
  }
  if (binding.executionProfile === 'form-validation') {
    await pageObject.open();
    await pageObject.openCreateSurface();
    await pageObject.submitEmptyFormAndExpectValidation();
    await pageObject.cancelCurrentSurface();
    return;
  }

  const record = await seedGroupRecord(entity, productCenterApi, cleanupRegistry);
  executionLedger.markPhase(record.checkpointEntryId, 'ui-triggered');
  await pageObject.open();
  await pageObject.searchAndWait(record.originalIdentity);
  await pageObject.waitForVisibleIdentityCount(record.originalIdentity, 1);

  if (binding.executionProfile === 'query-reset') {
    await pageObject.resetSearchAndWait();
    await pageObject.readVisibleResultCount();
  } else {
    await pageObject.openRowMenu(record.originalIdentity);
    await pageObject.expectRowMenuActions(/编辑|Edit|删除|Delete/i);
    await page.keyboard.press('Escape');
  }
  executionLedger.markPhase(record.checkpointEntryId, 'ui-verified');
}

async function runAttributeProfile(binding: GroupAutomationBinding, page: Page): Promise<void> {
  await page.goto(binding.route, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/^(搜索属性集|Search attribute sets)$/i).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: /(新建属性集|Create Attribute Set)/i }).waitFor({ state: 'visible', timeout: 10_000 });
  const row = page.locator('tbody tr:visible').first();
  await row.waitFor({ state: 'visible', timeout: 30_000 });
  const more = row.locator('.ant-dropdown-trigger:visible').first();
  await more.waitFor({ state: 'visible', timeout: 10_000 });
  await more.click();
  const menu = page.locator('[role=menu]:visible, .ant-dropdown:visible').last();
  await menu.waitFor({ state: 'visible', timeout: 10_000 });
  await menu.getByText(/编辑属性集|Edit Attribute Set/i).waitFor({ state: 'visible', timeout: 10_000 });
  await menu.getByText(/关联商品|Link(?:ed)? Products/i).waitFor({ state: 'visible', timeout: 10_000 });
  await menu.getByText(/删除|Delete/i).waitFor({ state: 'visible', timeout: 10_000 });
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden', timeout: 10_000 });
}

async function seedGroupRecord(
  entity: GroupEntity,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
): Promise<{ originalIdentity: string; checkpointEntryId: string; serverId: number | string }> {
  if (entity === 'method') {
    const record = await new ProductCenterSopDataFactory(productCenterApi).seed('method', cleanupRegistry);
    return { ...record, serverId: record.id };
  }
  if (entity === 'combo') {
    const record = await new ProductCenterHighDependencyDataFactory(productCenterApi).seed('combo', cleanupRegistry);
    return { ...record, serverId: record.id };
  }
  const record = await new ProductCenterLowDependencyDataFactory(productCenterApi).seed(entity, cleanupRegistry);
  return { ...record, serverId: record.id };
}

async function runReadOnlyCase(
  binding: GroupAutomationBinding,
  page: Page,
  executionId?: string,
): Promise<string[]> {
  if (binding.caseId === 'TC-GRP-ATTR-001' || binding.caseId === 'TC-GRP-ATTR-002') {
    return observeReadOnlyOperation(
      executionId,
      binding.handlerId ?? 'attribute-set-read-only',
      binding.title,
      'UI',
      async () => {
    const businessMutations: string[] = [];
    const listResponses: Array<{ status: number; pathname: string }> = [];
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
        && /\/attribute-group-sets?(?:\/|$)/.test(pathname)) {
        businessMutations.push(`${request.method()} ${pathname}`);
      }
    });
    page.on('response', (response) => {
      const pathname = new URL(response.url()).pathname;
      if (response.request().method() === 'GET' && /\/attribute-group-sets?(?:\/|$)/.test(pathname)) {
        listResponses.push({ status: response.status(), pathname });
      }
    });
    const assertionIds: string[] = [];
    const navigationResponse = await page.goto(binding.route, { waitUntil: 'domcontentloaded' });
    if (!navigationResponse?.ok() || new URL(page.url()).pathname !== binding.route) {
      throw new Error(`${binding.caseId} 属性集路由加载失败：${navigationResponse?.status() ?? 'no-response'} ${page.url()}`);
    }
    if (binding.caseId === 'TC-GRP-ATTR-001') assertionIds.push(assertionReceipt(binding, 0));
    const search = page.getByPlaceholder(/^(搜索属性集|Search attribute sets)$/i);
    const create = page.getByRole('button', { name: /(新建属性集|Create Attribute Set)/i });
    await search.waitFor({ state: 'visible', timeout: 30_000 });
    await create.waitFor({ state: 'visible', timeout: 10_000 });
    if (!await create.isEnabled()) throw new Error(`${binding.caseId} 新建属性集按钮不可用`);
    if (binding.caseId === 'TC-GRP-ATTR-001') assertionIds.push(assertionReceipt(binding, 1));
    const row = page.locator('tbody tr:visible').first();
    await row.waitFor({ state: 'visible', timeout: 30_000 });
    const more = row.getByRole('button', { name: /^(更多|more)$/i });
    await more.waitFor({ state: 'visible', timeout: 10_000 });
    if (!await more.isEnabled()) throw new Error(`${binding.caseId} 属性集更多入口不可用`);
    const listResponse = await waitUntil(
      () => listResponses.at(-1),
      (value) => value !== undefined,
      { timeout: 10_000, interval: 100, message: `${binding.caseId} 未观察到属性集列表读取响应` },
    );
    if (!listResponse) throw new Error(`${binding.caseId} 属性集列表读取响应为空`);
    if (listResponse.status < 200 || listResponse.status >= 300) {
      throw new Error(`${binding.caseId} 属性集列表读取失败 HTTP ${listResponse.status}：${listResponse.pathname}`);
    }
    const visibleErrors = await page.locator(
      '.ant-result-error:visible, .ant-message-error:visible, .ant-notification-notice-error:visible, [role=alert].ant-alert-error:visible',
    ).allTextContents();
    if (visibleErrors.some((value) => value.trim().length > 0)) {
      throw new Error(`${binding.caseId} 属性集列表存在可见错误：${visibleErrors.join(' | ')}`);
    }
    if (binding.caseId === 'TC-GRP-ATTR-001') {
      assertionIds.push(assertionReceipt(binding, 2));
      return assertionIds;
    }
    assertionIds.push(assertionReceipt(binding, 0));
    if (binding.caseId === 'TC-GRP-ATTR-002') {
      const beforeRowText = (await row.innerText()).trim();
      await more.click();
      const menu = page.locator('[role=menu]:visible').filter({ hasText: /(编辑属性集|Edit Attribute Set)/i });
      await menu.waitFor({ state: 'visible', timeout: 10_000 });
      if (businessMutations.length !== 0) {
        throw new Error(`${binding.caseId} 展开菜单时发生业务写请求：${businessMutations.join(', ')}`);
      }
      assertionIds.push(assertionReceipt(binding, 1));
      await menu.getByText(/^(编辑属性集|Edit Attribute Set)$/i).waitFor({ state: 'visible', timeout: 10_000 });
      await menu.getByText(/^(关联商品|Link(?:ed)? Products)$/i).waitFor({ state: 'visible', timeout: 10_000 });
      await menu.getByText(/^(删除|Delete)$/i).waitFor({ state: 'visible', timeout: 10_000 });
      assertionIds.push(assertionReceipt(binding, 2));
      await page.keyboard.press('Escape');
      await menu.waitFor({ state: 'hidden', timeout: 10_000 });
      if (businessMutations.length !== 0) {
        throw new Error(`${binding.caseId} 只读菜单操作发生业务写请求：${businessMutations.join(', ')}`);
      }
      const afterRowText = (await row.innerText()).trim();
      if (afterRowText !== beforeRowText) throw new Error(`${binding.caseId} 关闭菜单后属性集行数据发生变化`);
      assertionIds.push(assertionReceipt(binding, 3));
    }
        return assertionIds;
      },
    );
  }

  const entity = binding.module.includes('规格') ? 'spec'
    : binding.module.includes('口味') ? 'taste'
      : binding.module.includes('做法') ? 'method'
        : binding.module.includes('加料') ? 'addon'
          : 'combo';
  const pageObject: GroupListPage = entity === 'spec'
    ? createSpecificationsPage(page)
    : entity === 'taste'
      ? createFlavorsPage(page)
      : entity === 'method'
        ? createPreparationsPage(page)
        : entity === 'addon'
          ? createAddOnsPage(page)
          : createCombosPage(page);
  const listReadEvidence = await pageObject.open();
  if (listReadEvidence.status < 200 || listReadEvidence.status >= 300 || !listReadEvidence.pathname) {
    throw new Error(`${binding.caseId} 组列表 API 读取证据无效：${JSON.stringify(listReadEvidence)}`);
  }
  const count = await pageObject.readVisibleResultCount();
  if (count < 1) throw new Error(`${binding.caseId} 前置条件要求至少一条列表数据`);
  if (binding.caseId === 'TC-GRP-SPEC-001') {
    const identity = await pageObject.readFirstVisibleIdentity();
    await pageObject.openRowMenu(identity);
    await pageObject.expectRowMenuActions(/编辑|Edit/i);
    await pageObject.expectRowMenuActions(/删除|Delete/i);
    await page.keyboard.press('Escape');
    const assertionIds = [assertionReceipt(binding, 0)];
    await pageObject.expectTableStructureComplete();
    assertionIds.push(assertionReceipt(binding, 1));
    return assertionIds;
  }
  await pageObject.expectTableStructureComplete();
  return [assertionReceipt(binding, 0)];
}

async function observeReadOnlyOperation<T>(
  executionId: string | undefined,
  operationKey: string,
  title: string,
  method: string,
  action: () => Promise<T>,
): Promise<T> {
  const activeExecutionId = executionId ?? readActiveTestId();
  if (!activeExecutionId) return action();
  const operation = startExecutableOperation({ executionId: activeExecutionId, operationKey, title, method });
  try {
    const result = await action();
    finishExecutableOperation(operation, 'passed');
    return result;
  } catch (error) {
    finishExecutableOperation(operation, 'failed');
    throw error;
  }
}

function readActiveTestId(): string | undefined {
  try {
    return test.info().testId;
  } catch {
    return undefined;
  }
}

async function verifyUiResidueZero(pageObject: GroupListPage, identities: readonly string[]): Promise<void> {
  await pageObject.open();
  await pageObject.searchAndWait('');
  for (const identity of identities) {
    await pageObject.searchAndWait(identity);
    await waitUntil(
      () => pageObject.readVisibleIdentityCount(identity),
      (count) => count === 0,
      { timeout: 15_000, interval: 100, message: `组列表仍展示残留身份：${identity}` },
    );
  }
}

function assertNever(value: never): never {
  throw new Error(`未注册的组执行 handler：${String(value)}`);
}

function requireLowCase(entityKey: 'spec' | 'taste' | 'addon', action: 'edit') {
  const found = generateLowDependencySopCases(lowDependencySopCatalog)
    .find((item) => item.entityKey === entityKey && item.action === action);
  if (!found) throw new Error(`缺少低依赖组 SOP 定义：${entityKey}:${action}`);
  return found;
}

function requireCoreCase(entityKey: 'method', action: 'edit') {
  const found = generateProductCenterSopCases(productCenterSopCatalog)
    .find((item) => item.entityKey === entityKey && item.action === action);
  if (!found) throw new Error(`缺少核心组 SOP 定义：${entityKey}:${action}`);
  return found;
}

function requireHighCase(entityKey: 'combo', action: 'delete') {
  const found = generateHighDependencySopCases(highDependencySopCatalog)
    .find((item) => item.entityKey === entityKey && item.action === action);
  if (!found) throw new Error(`缺少高依赖组 SOP 定义：${entityKey}:${action}`);
  return found;
}

export function readProductCenterGroupObservedDifferenceEvidence(error: unknown): Record<string, unknown> | null {
  return readObservedDifferenceEvidence(error);
}
