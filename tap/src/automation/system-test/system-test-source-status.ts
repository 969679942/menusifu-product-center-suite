import type { SystemTestObservationChannel } from './system-test-governance';

export const SYSTEM_TEST_SOURCE_STATUSES = [
  'api-not-found',
  'api-exists-but-unmapped',
  'ui-evidence-missing',
  'downstream-contract-missing',
  'business-rule-conflict',
] as const;

export type SystemTestSourceStatus = typeof SYSTEM_TEST_SOURCE_STATUSES[number];

export type SystemTestApiCatalog = {
  checked: boolean;
  sourcePath: string;
  fingerprint: string;
  operationKeys: readonly string[];
};

export type SystemTestSourceStatusInput = {
  apiCatalog: SystemTestApiCatalog;
  candidateOperationKeys?: readonly string[];
  mappedOperationKeys?: readonly string[];
  requiredOperationKeys?: readonly string[];
  requiredObservationChannels?: readonly SystemTestObservationChannel[];
  availableObservationChannels?: readonly SystemTestObservationChannel[];
  businessRuleConflict?: boolean;
};

export type SystemTestBlockedSourceInput = {
  apiCatalog: SystemTestApiCatalog;
  sourceStatus?: SystemTestSourceStatus | null;
};

export function validateSystemTestApiCatalog(catalog: SystemTestApiCatalog): string[] {
  const errors: string[] = [];
  if (catalog.checked !== true) errors.push('API_CATALOG_CHECK_REQUIRED');
  if (!catalog.sourcePath.trim()) errors.push('API_CATALOG_SOURCE_PATH_REQUIRED');
  if (!/^[a-f0-9]{64}$/i.test(catalog.fingerprint)) errors.push('API_CATALOG_FINGERPRINT_INVALID');
  if (!Array.isArray(catalog.operationKeys)) errors.push('API_CATALOG_OPERATION_KEYS_INVALID');
  return errors;
}

export function classifySystemTestSourceStatus(input: SystemTestSourceStatusInput): SystemTestSourceStatus | null {
  const catalogErrors = validateSystemTestApiCatalog(input.apiCatalog);
  if (catalogErrors.length > 0) {
    throw new Error(catalogErrors.join(','));
  }

  if (input.businessRuleConflict) return 'business-rule-conflict';

  const catalogOperationKeys = new Set(input.apiCatalog.operationKeys);
  const requiredOperationKeys = [...new Set(input.requiredOperationKeys ?? [])];
  const missingOperationKeys = requiredOperationKeys.filter((key) => !catalogOperationKeys.has(key));
  if (missingOperationKeys.length > 0) return 'api-not-found';

  const candidateOperationKeys = [...new Set(input.candidateOperationKeys ?? [])];
  const mappedOperationKeys = new Set(input.mappedOperationKeys ?? []);
  const unmappedCandidates = candidateOperationKeys.filter((key) => !mappedOperationKeys.has(key));
  if (unmappedCandidates.length > 0) return 'api-exists-but-unmapped';

  const requiredChannels = new Set(input.requiredObservationChannels ?? []);
  const availableChannels = new Set(input.availableObservationChannels ?? []);
  if (requiredChannels.has('ui') && !availableChannels.has('ui')) return 'ui-evidence-missing';
  if (requiredChannels.has('downstream') && !availableChannels.has('downstream')) return 'downstream-contract-missing';

  return null;
}

export function validateBlockedSourceClassification(input: SystemTestBlockedSourceInput): string[] {
  const errors = validateSystemTestApiCatalog(input.apiCatalog);
  if (!input.sourceStatus) errors.push('BLOCKED_SOURCE_STATUS_REQUIRED');
  if (input.sourceStatus !== undefined && input.sourceStatus !== null
    && !SYSTEM_TEST_SOURCE_STATUSES.includes(input.sourceStatus)) {
    errors.push('BLOCKED_SOURCE_STATUS_INVALID');
  }
  return errors;
}

export function assertBlockedSourceClassification(input: SystemTestBlockedSourceInput): void {
  const errors = validateBlockedSourceClassification(input);
  if (errors.length > 0) throw new Error(errors.join(','));
}
