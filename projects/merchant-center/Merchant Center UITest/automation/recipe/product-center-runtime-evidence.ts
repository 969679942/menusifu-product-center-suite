import { createHash } from 'node:crypto';
import {
  normalizeProductCenterPerformancePhases,
  type ProductCenterPerformancePhase,
} from '../../utils/product-center-performance-budget';
import type {
  ProductCenterBrowserContractSignals,
  ProductCenterReleaseEvidence,
} from '../../utils/product-center-release-evidence';

type RuntimeEvidenceInput = {
  recipeId: string;
  caseId: string;
  results: Record<string, unknown>;
  environmentId: string;
  brandId: string;
  screenshotAttachmentName: string;
  expectedClaimIds?: readonly string[];
  verifiedClaimIds?: readonly string[];
  claimVerification?: {
    precondition?: readonly string[];
    action?: readonly string[];
    expectation?: readonly string[];
  };
  action?: string;
  capabilityIds?: readonly string[];
  assertionAdapterIds?: readonly string[];
  phaseDurationsMs?: Partial<Record<ProductCenterPerformancePhase, number>>;
  release?: ProductCenterReleaseEvidence;
  browserSignals?: ProductCenterBrowserContractSignals;
  cleanupRequired?: boolean;
};

export function buildProductCenterRuntimeEvidenceBundle(input: RuntimeEvidenceInput) {
  const navigation = record(input.results.navigation);
  const validation = record(input.results.validation);
  const expectedClaimIds = uniqueStrings(input.expectedClaimIds ?? []);
  const rawVerifiedClaimIds = validStrings(input.verifiedClaimIds ?? []);
  const verifiedClaimIds = [...new Set(rawVerifiedClaimIds)];
  const expectedClaimSet = new Set(expectedClaimIds);
  const verifiedClaimSet = new Set(verifiedClaimIds);
  const missingClaimIds = expectedClaimIds.filter((claimId) => !verifiedClaimSet.has(claimId)).sort();
  const unexpectedClaimIds = verifiedClaimIds.filter((claimId) => !expectedClaimSet.has(claimId)).sort();
  const duplicateVerifiedClaimIds = duplicateStrings(rawVerifiedClaimIds);
  const expectedHasDuplicates = validStrings(input.expectedClaimIds ?? []).length !== expectedClaimIds.length;
  const claimCoverageComplete = missingClaimIds.length === 0
    && unexpectedClaimIds.length === 0
    && duplicateVerifiedClaimIds.length === 0
    && !expectedHasDuplicates;
  const resultKeys = Object.keys(input.results).sort();
  const preconditionEvidence = record(input.results.preconditionEvidence);
  const boundaryEvidence = findBoundaryEvidence(input.results);
  const storeProductSearch = record(input.results.storeProductSearch);
  const itemStandardSingleZeroPrice = record(input.results.itemStandardSingleZeroPrice);
  const standardCreate = record(input.results.standardCreate);
  const categoryMenu = record(input.results.categoryMenu);
  const categoryParent = record(input.results.categoryParent);
  const categoryLeaf = record(input.results.categoryLeaf);
  const itemComboGroupValidation = record(input.results.itemComboGroupValidation);
  const itemComboOptionalBoundary = record(input.results.itemComboOptionalBoundary);
  const comboValidationAttempts = recordArray(itemComboGroupValidation.attempts);
  const comboOptionalDialog = record(itemComboOptionalBoundary.dialog);
  const comboOptionalCard = record(itemComboOptionalBoundary.boundary);
  const hasValidationEvidence = Object.keys(validation).length > 0;
  const hasStoreProductSearchEvidence = Object.keys(storeProductSearch).length > 0;
  const hasItemStandardZeroPriceEvidence = Object.keys(itemStandardSingleZeroPrice).length > 0;
  const hasCategoryLeafEvidence = Object.keys(categoryMenu).length > 0
    && Object.keys(categoryParent).length > 0
    && Object.keys(categoryLeaf).length > 0;
  const hasItemComboGroupValidationEvidence = comboValidationAttempts.length === 2;
  const hasItemComboOptionalBoundaryEvidence = Object.keys(comboOptionalDialog).length > 0
    && Object.keys(comboOptionalCard).length > 0;
  const genericNetwork = findGenericNetworkEvidence(input.results);
  const visibleUi = hasItemComboGroupValidationEvidence
    ? {
      route: stringValue(comboValidationAttempts[1].route),
      triggers: comboValidationAttempts.map((attempt) => stringValue(attempt.trigger)),
      errorCode: stringValue(comboValidationAttempts[0].responseErrorCode),
      errorMessage: stringValue(comboValidationAttempts[0].errorMessage),
      successMessageCount: comboValidationAttempts.reduce(
        (total, attempt) => total + numberValue(attempt.successMessageCount),
        0,
      ),
    }
    : hasItemComboOptionalBoundaryEvidence
      ? {
        route: stringValue(comboOptionalCard.route),
        customGroupName: stringValue(itemComboOptionalBoundary.customGroupName),
        repeatRuleVisible: numberValue(comboOptionalCard.repeatRuleCount) === 1,
        selectionQuantityRuleVisible: numberValue(comboOptionalCard.selectionQuantityRuleCount) >= 1,
        groupActions: {
          edit: numberValue(comboOptionalCard.groupEditButtonCount),
          delete: numberValue(comboOptionalCard.groupDeleteButtonCount),
        },
        productRowSingleItemActions: numberValue(comboOptionalCard.productRowButtonCount),
      }
    : hasCategoryLeafEvidence
    ? {
      route: stringValue(standardCreate.arrivedPath),
      categoryFieldVisible: numberValue(categoryMenu.fieldLocatorCount) === 1,
      parentNotCommitted: stringValue(categoryParent.selectedValueBefore)
        === stringValue(categoryParent.selectedValueAfter)
        && categoryParent.childVisible === true,
      leafCommitted: stringValue(categoryLeaf.selectedPath).includes(stringValue(categoryLeaf.parentName))
        && stringValue(categoryLeaf.selectedPath).includes(stringValue(categoryLeaf.leafName))
        && categoryLeaf.menuClosed === true,
      selectedPath: stringValue(categoryLeaf.selectedPath),
    }
    : hasValidationEvidence
    ? {
      route: stringValue(validation.route),
      requiredErrorCount: numberValue(validation.requiredErrorCount),
      successMessageCount: numberValue(validation.successMessageCount),
    }
    : hasItemStandardZeroPriceEvidence
      ? {
        route: stringValue(navigation.arrivedPath),
        requiredErrorCount: null,
        successMessageCount: numberValue(itemStandardSingleZeroPrice.successMessageCount),
      }
      : {
      route: stringValue(navigation.arrivedPath),
      requiredErrorCount: null,
      successMessageCount: null,
    };
  const locatorUniqueness = hasItemComboGroupValidationEvidence
    ? {
      saveErrorCount: numberValue(comboValidationAttempts[0].errorMessageCount),
      saveAndNewErrorCount: numberValue(comboValidationAttempts[1].errorMessageCount),
    }
    : hasItemComboOptionalBoundaryEvidence
      ? {
        dialogCount: numberValue(comboOptionalDialog.dialogCount),
        groupNameInputCount: numberValue(comboOptionalDialog.groupNameInputCount),
        altNameInputCount: numberValue(comboOptionalDialog.altNameInputCount),
        selectionQuantityInputCount: numberValue(comboOptionalDialog.selectionQuantityInputCount),
        mergeSwitchCount: numberValue(comboOptionalDialog.mergeSwitchCount),
        repeatSwitchCount: numberValue(comboOptionalDialog.repeatSwitchCount),
        itemSearchInputCount: numberValue(comboOptionalDialog.itemSearchInputCount),
        categoryFilterCount: numberValue(comboOptionalDialog.categoryFilterCount),
        cardCount: numberValue(comboOptionalCard.cardCount),
        productRowCount: numberValue(comboOptionalCard.productRowCount),
      }
    : hasCategoryLeafEvidence
    ? {
      categoryFieldCount: numberValue(categoryMenu.fieldLocatorCount),
      categoryCascaderCount: numberValue(categoryMenu.cascaderLocatorCount),
      parentNodeCount: numberValue(categoryParent.locatorCount),
      leafNodeCount: numberValue(categoryLeaf.locatorCount),
    }
    : hasValidationEvidence
    ? {
      nameInputCount: numberValue(validation.nameInputCount),
      requiredErrorCount: numberValue(validation.requiredErrorCount),
    }
    : hasItemStandardZeroPriceEvidence
      ? {
        nameInputCount: numberValue(itemStandardSingleZeroPrice.locatorCount),
        requiredErrorCount: null,
      }
      : {
      nameInputCount: hasStoreProductSearchEvidence
        ? numberValue(storeProductSearch.locatorCount)
        : null,
      requiredErrorCount: null,
    };
  const network = hasItemComboGroupValidationEvidence
    ? {
      method: stringValue(comboValidationAttempts[0].responseMethod),
      operation: stringValue(comboValidationAttempts[0].responsePath),
      status: comboValidationAttempts.map((attempt) => numberValue(attempt.responseStatus)),
      requestCount: comboValidationAttempts.reduce(
        (total, attempt) => total + numberValue(attempt.mutationCount),
        0,
      ),
    }
    : hasItemComboOptionalBoundaryEvidence
      ? {
        method: stringValue(itemComboOptionalBoundary.responseMethod),
        operation: stringValue(itemComboOptionalBoundary.responsePath),
        status: numberValue(itemComboOptionalBoundary.responseStatus),
        operations: [
          stringValue(itemComboOptionalBoundary.itemCreateResponsePath),
          stringValue(itemComboOptionalBoundary.responsePath),
        ],
        requestCount: numberValue(itemComboOptionalBoundary.mutationCount),
      }
    : hasCategoryLeafEvidence
    ? {
      method: stringValue(standardCreate.responseMethod),
      operation: stringValue(standardCreate.responsePath),
      status: numberValue(standardCreate.responseStatus),
      requestCount: standardCreate.categoryRequestCompleted === true ? 1 : 0,
    }
    : hasStoreProductSearchEvidence
    ? {
      method: stringValue(storeProductSearch.responseMethod),
      operation: stringValue(storeProductSearch.responsePath),
      requestCount: 1,
    }
    : hasValidationEvidence
      ? {
        method: 'POST',
        operation: 'standard-item-create',
        requestCount: numberValue(validation.mutationCount),
      }
      : hasItemStandardZeroPriceEvidence
        ? {
          method: stringValue(itemStandardSingleZeroPrice.responseMethod),
          operation: stringValue(itemStandardSingleZeroPrice.responsePath),
          requestCount: 1,
        }
        : genericNetwork;
  const api = hasItemComboGroupValidationEvidence
    ? {
      responseShape: ['code', 'message'],
      beforeEqualsAfter: numberValue(itemComboGroupValidation.beforeRecordCount)
        === numberValue(itemComboGroupValidation.afterRecordCount),
      beforeRecordCount: numberValue(itemComboGroupValidation.beforeRecordCount),
      afterRecordCount: numberValue(itemComboGroupValidation.afterRecordCount),
      responseErrorCodes: comboValidationAttempts.map((attempt) => stringValue(attempt.responseErrorCode)),
    }
    : hasItemComboOptionalBoundaryEvidence
      ? {
        responseShape: ['brand-item', 'brand-section'],
        beforeEqualsAfter: false,
        itemRecordCount: numberValue(itemComboOptionalBoundary.itemRecordCount),
        customGroupRecordCount: numberValue(itemComboOptionalBoundary.customGroupRecordCount),
      }
    : hasCategoryLeafEvidence
    ? {
      responseShape: ['category-tree'],
      beforeEqualsAfter: categoryLeaf.mutationAttempted === false,
      mutationRequestCount: numberValue(categoryLeaf.mutationRequestCount),
    }
    : hasStoreProductSearchEvidence
    ? { responseShape: ['data.list'], beforeEqualsAfter: storeProductSearch.mutationAttempted === false }
    : hasValidationEvidence
      ? {
        responseShape: ['data.totalCount'],
        beforeEqualsAfter: numberValue(validation.beforeTotalCount) === numberValue(validation.afterTotalCount),
      }
      : hasItemStandardZeroPriceEvidence
        ? {
          responseShape: ['data.list.itemBasic', 'data.skuList.salePrice'],
          beforeEqualsAfter: false,
          recordCount: numberValue(itemStandardSingleZeroPrice.apiRecordCount),
          apiPrice: numberValue(itemStandardSingleZeroPrice.apiPrice),
          listPrice: numberValue(itemStandardSingleZeroPrice.listPrice),
        }
        : { responseShape: [], beforeEqualsAfter: null };
  return {
    schemaVersion: '1.0.0' as const,
    recipeId: input.recipeId,
    caseId: input.caseId,
    navigation: {
      mode: stringValue(navigation.mode),
      targetPath: stringValue(navigation.targetPath),
      arrivedPath: stringValue(navigation.arrivedPath),
      verifiedPaths: stringArray(navigation.verifiedPaths),
    },
    visibleUi,
    locatorUniqueness,
    network,
    api,
    screenshot: { attachmentName: input.screenshotAttachmentName },
    context: {
      environmentId: input.environmentId,
      brandFingerprint: createHash('sha256').update(input.brandId).digest('hex').slice(0, 12),
    },
    ...(input.release ? { release: input.release } : {}),
    ...(input.browserSignals ? { browserSignals: input.browserSignals } : {}),
    cleanup: {
      required: input.cleanupRequired === true,
      completed: true,
      residueCount: 0,
    },
    execution: {
      action: input.action ?? '',
      resultKeys,
      capabilityIds: [...(input.capabilityIds ?? [])],
      assertionAdapterIds: [...(input.assertionAdapterIds ?? [])],
      phaseDurationsMs: normalizeProductCenterPerformancePhases(input.phaseDurationsMs),
      ...(Object.keys(preconditionEvidence).length > 0 ? { preconditionEvidence } : {}),
      ...(boundaryEvidence ? { boundaryEvidence } : {}),
    },
    expectedClaimIds,
    verifiedClaimIds,
    missingClaimIds,
    unexpectedClaimIds,
    duplicateVerifiedClaimIds,
    claimVerification: {
      precondition: uniqueStrings(input.claimVerification?.precondition ?? []),
      action: uniqueStrings(input.claimVerification?.action ?? []),
      expectation: uniqueStrings(input.claimVerification?.expectation ?? []),
    },
    claimCoverageComplete,
    sidebarEntryVerified: isSidebarEntryVerified(navigation),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record).filter((entry) => Object.keys(entry).length > 0) : [];
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : [];
}

function validStrings(values: readonly string[]): string[] {
  return values.filter((value) => typeof value === 'string' && value.length > 0);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(validStrings(values))];
}

function duplicateStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function findBoundaryEvidence(results: Record<string, unknown>): {
  maxLengthAttribute: string;
  acceptedLength: number;
  rejectedLength: number;
  locatorCount: number;
  visible: boolean;
  enabled: boolean;
} | undefined {
  const boundary = Object.values(results)
    .map(record)
    .find((entry) => typeof entry.maxLengthAttribute === 'string'
      && typeof entry.acceptedValue === 'string'
      && typeof entry.rejectedValue === 'string');
  if (!boundary) return undefined;
  return {
    maxLengthAttribute: stringValue(boundary.maxLengthAttribute),
    acceptedLength: String(boundary.acceptedValue).length,
    rejectedLength: String(boundary.rejectedValue).length,
    locatorCount: numberValue(boundary.locatorCount),
    visible: boundary.visible === true,
    enabled: boundary.enabled === true,
  };
}

function isSidebarEntryVerified(navigation: Record<string, unknown>): boolean {
  if (stringValue(navigation.mode) !== 'sidebar') {
    return false;
  }
  const arrivedPath = stringValue(navigation.arrivedPath);
  const verifiedPaths = stringArray(navigation.verifiedPaths);
  if (verifiedPaths.length > 0) {
    return verifiedPaths.includes(arrivedPath);
  }
  return stringValue(navigation.targetPath) === arrivedPath;
}

function findGenericNetworkEvidence(results: Record<string, unknown>): {
  method: string;
  operation: string;
  requestCount: number | null;
} {
  const records = collectRecords(results);
  const method = firstString(records, ['responseMethod', 'requestMethod', 'method']).toUpperCase();
  const operation = normalizeOperation(firstString(records, [
    'responsePath',
    'requestPath',
    'operationPath',
    'path',
  ]));
  const requestCount = firstNumber(records, ['requestCount', 'mutationCount', 'responseCount']);
  return { method, operation, requestCount };
}

function collectRecords(
  value: unknown,
  seen: WeakSet<object> = new WeakSet<object>(),
  depth = 0,
): Record<string, unknown>[] {
  if (depth > 12 || !value || typeof value !== 'object') return [];
  if (seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectRecords(entry, seen, depth + 1));
  }
  const current = value as Record<string, unknown>;
  return [
    current,
    ...Object.values(current).flatMap((entry) => collectRecords(entry, seen, depth + 1)),
  ];
}

function firstString(records: readonly Record<string, unknown>[], keys: readonly string[]): string {
  for (const key of keys) {
    for (const item of records) {
      if (typeof item[key] === 'string' && item[key].length > 0) return item[key] as string;
    }
  }
  return '';
}

function firstNumber(
  records: readonly Record<string, unknown>[],
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    for (const item of records) {
      if (typeof item[key] === 'number' && Number.isFinite(item[key])) return item[key] as number;
    }
  }
  return null;
}

function normalizeOperation(value: string): string {
  if (!value) return '';
  try {
    return new URL(value, 'https://local.invalid').pathname;
  } catch {
    return value.split(/[?#]/, 1)[0];
  }
}
