import type { SystemTestRevalidationImpactType } from '../../../../Test Automation Platform/src/automation/system-test/system-test-revalidation-policy';

export type ProductCenterFingerprintRevalidationItem = {
  caseId: string;
  module: string;
  status: string;
  action: string;
  driftDimensions: string[];
};

export type ProductCenterAssetRemediationQueues = {
  schemaVersion: string;
  generatedAt: string;
  identity: {
    applicationId: string;
    businessDomainId: string;
    scope: string;
  };
  source: {
    lifecyclePath: string;
    lifecycleGeneratedAt: string;
  };
  queues: {
    fingerprintRevalidation: ProductCenterFingerprintRevalidationItem[];
  };
};

export type ProductCenterFingerprintRevalidationImpactManifest = {
  schemaVersion: '1.0.0';
  changeId: string;
  applicationId: string;
  defaultImpactType: SystemTestRevalidationImpactType;
  impactedCaseIds: string[];
  caseImpactTypes: Record<string, SystemTestRevalidationImpactType>;
  source: {
    queueGeneratedAt: string;
    lifecyclePath: string;
    lifecycleGeneratedAt: string;
    module: string;
    driftDimensions: Record<string, number>;
  };
};

export function buildProductCenterFingerprintRevalidationImpact(input: {
  queue: ProductCenterAssetRemediationQueues;
  module: string;
  changeId: string;
  impactType: SystemTestRevalidationImpactType;
}): ProductCenterFingerprintRevalidationImpactManifest {
  const module = input.module.trim();
  const changeId = input.changeId.trim();
  if (!module) throw new Error('FINGERPRINT_REVALIDATION_MODULE_REQUIRED');
  if (!changeId) throw new Error('FINGERPRINT_REVALIDATION_CHANGE_ID_REQUIRED');
  if (input.queue.identity.applicationId !== 'merchant-center') {
    throw new Error(`FINGERPRINT_REVALIDATION_APPLICATION_INVALID:${input.queue.identity.applicationId}`);
  }

  const selected = input.queue.queues.fingerprintRevalidation
    .filter((item) => item.module === module)
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  if (selected.length === 0) throw new Error(`FINGERPRINT_REVALIDATION_QUEUE_EMPTY:${module}`);

  const uniqueCaseIds = new Set(selected.map((item) => item.caseId));
  if (uniqueCaseIds.size !== selected.length) throw new Error(`FINGERPRINT_REVALIDATION_CASE_DUPLICATE:${module}`);
  for (const item of selected) {
    if (item.status !== 'revalidation-required' || item.action !== 'execution-fingerprint-revalidation') {
      throw new Error(`FINGERPRINT_REVALIDATION_ITEM_INVALID:${item.caseId}`);
    }
    if (item.driftDimensions.length === 0) throw new Error(`FINGERPRINT_REVALIDATION_DIMENSION_MISSING:${item.caseId}`);
  }

  const impactedCaseIds = selected.map((item) => item.caseId);
  const driftDimensions = selected
    .flatMap((item) => item.driftDimensions)
    .reduce<Record<string, number>>((counts, dimension) => {
      counts[dimension] = (counts[dimension] ?? 0) + 1;
      return counts;
    }, {});

  return {
    schemaVersion: '1.0.0',
    changeId,
    applicationId: input.queue.identity.applicationId,
    defaultImpactType: input.impactType,
    impactedCaseIds,
    caseImpactTypes: Object.fromEntries(impactedCaseIds.map((caseId) => [caseId, input.impactType])),
    source: {
      queueGeneratedAt: input.queue.generatedAt,
      lifecyclePath: input.queue.source.lifecyclePath,
      lifecycleGeneratedAt: input.queue.source.lifecycleGeneratedAt,
      module,
      driftDimensions: Object.fromEntries(Object.entries(driftDimensions).sort(([left], [right]) => left.localeCompare(right))),
    },
  };
}
