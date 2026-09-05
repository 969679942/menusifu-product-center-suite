import { createHash } from 'node:crypto';
import type { ProductCenterItemPracticeContract } from '../../utils/product-center-item-practice-contract';

export type ProductCenterSystemTestCompatibilityProjection = {
  schemaVersion: '1.0.0';
  systemId: 'merchant-center-product-center';
  integrationMode: 'legacy-runtime-preserved';
  sourceContractFingerprint: string;
  cases: Array<{ caseId: string; ruleId: string; dataProfileId: string; expectationClaimIds: string[] }>;
  policies: ProductCenterItemPracticeContract['evidencePolicy'] & ProductCenterItemPracticeContract['circuitBreaker'];
  platformGovernance: {
    contractVersion: '2.0.0';
    integration: 'legacy-equivalent-gates';
    commonCapabilities: string[];
    domainAdapterResponsibilities: string[];
  };
  fingerprint: string;
};

export function projectProductCenterPracticeCompatibility(
  contract: ProductCenterItemPracticeContract,
): ProductCenterSystemTestCompatibilityProjection {
  const withoutFingerprint = {
    schemaVersion: '1.0.0' as const,
    systemId: 'merchant-center-product-center' as const,
    integrationMode: 'legacy-runtime-preserved' as const,
    sourceContractFingerprint: contract.fingerprint,
    cases: contract.cases.map((item) => ({
      caseId: item.caseId,
      ruleId: item.ruleId,
      dataProfileId: item.dataProfile,
      expectationClaimIds: item.expectationClaims.map((claim) => claim.claimId),
    })).sort((left, right) => left.caseId.localeCompare(right.caseId)),
    policies: { ...contract.circuitBreaker, ...contract.evidencePolicy },
    platformGovernance: {
      contractVersion: '2.0.0' as const,
      integration: 'legacy-equivalent-gates' as const,
      commonCapabilities: [
        'semantic-duplicate-gate',
        'assertion-surface-authority',
        'feedback-operation-correlation',
        'context-guard-receipts',
        'evidence-completeness',
      ],
      domainAdapterResponsibilities: [
        'product-center-field-surface-catalog',
        'product-center-exact-feedback-contracts',
        'product-center-route-locale-business-identity-guards',
      ],
    },
  };
  return {
    ...withoutFingerprint,
    fingerprint: createHash('sha256').update(JSON.stringify(withoutFingerprint)).digest('hex'),
  };
}
