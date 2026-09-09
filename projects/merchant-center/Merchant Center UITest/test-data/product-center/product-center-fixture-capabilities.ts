export type ProductCenterFixtureCapabilityId =
  | 'brand-product.single-sku.api'
  | 'brand-product.addon-candidate.api'
  | 'brand-product.combo-candidate.api'
  | 'brand-product.multi-sku.ui'
  | 'brand-product.group-reference-owner.ui'
  | 'brand-product.cleanup.api-ui'
  | 'terminal.observation.external'
  | 'industry-item.inheritance.external';

export type ProductCenterFixtureCapability = {
  capabilityId: ProductCenterFixtureCapabilityId;
  availability: 'local-automated' | 'external-required';
  provider: string;
  outputs: string[];
  humanReviewRequired: boolean;
  cleanupPolicy: 'api-ui-zero-residue' | 'external-owner';
};

export const productCenterFixtureCapabilities: readonly ProductCenterFixtureCapability[] = [
  {
    capabilityId: 'brand-product.single-sku.api',
    availability: 'local-automated',
    provider: 'ProductCenterItemCreateDataFactory.createSingleSkuBrandProduct',
    outputs: ['itemId', 'skuIds', 'identity', 'cleanupCheckpoint'],
    humanReviewRequired: false,
    cleanupPolicy: 'api-ui-zero-residue',
  },
  {
    capabilityId: 'brand-product.addon-candidate.api',
    availability: 'local-automated',
    provider: 'ProductCenterItemCreateDataFactory.createSingleSkuBrandProduct(addon-candidate)',
    outputs: ['itemId', 'skuIds', 'identity', 'cleanupCheckpoint'],
    humanReviewRequired: false,
    cleanupPolicy: 'api-ui-zero-residue',
  },
  {
    capabilityId: 'brand-product.combo-candidate.api',
    availability: 'local-automated',
    provider: 'ProductCenterItemCreateDataFactory.createSingleSkuBrandProduct(combo-candidate)',
    outputs: ['itemId', 'skuIds', 'identity', 'cleanupCheckpoint'],
    humanReviewRequired: false,
    cleanupPolicy: 'api-ui-zero-residue',
  },
  {
    capabilityId: 'brand-product.multi-sku.ui',
    availability: 'local-automated',
    provider: 'StandardItem216Flow.createMulti',
    outputs: ['itemId', 'skuIds', 'identity', 'cleanupCheckpoint'],
    humanReviewRequired: false,
    cleanupPolicy: 'api-ui-zero-residue',
  },
  {
    capabilityId: 'brand-product.group-reference-owner.ui',
    availability: 'local-automated',
    provider: 'StandardItem216Flow.createReferencedAttributeGroupFixture',
    outputs: ['ownerItemId', 'groupId', 'optionNames', 'cleanupCheckpoint'],
    humanReviewRequired: false,
    cleanupPolicy: 'api-ui-zero-residue',
  },
  {
    capabilityId: 'brand-product.cleanup.api-ui',
    availability: 'local-automated',
    provider: 'CleanupRegistry + ProductCenterExecutionLedger',
    outputs: ['serverIds', 'apiIdentityCounts', 'verifiedZero'],
    humanReviewRequired: false,
    cleanupPolicy: 'api-ui-zero-residue',
  },
  {
    capabilityId: 'terminal.observation.external',
    availability: 'external-required',
    provider: 'terminal/C-side observation harness',
    outputs: ['terminalState', 'syncEvidence'],
    humanReviewRequired: true,
    cleanupPolicy: 'external-owner',
  },
  {
    capabilityId: 'industry-item.inheritance.external',
    availability: 'external-required',
    provider: 'controlled industry-item source fixture',
    outputs: ['industryItemId', 'inheritanceEvidence'],
    humanReviewRequired: true,
    cleanupPolicy: 'external-owner',
  },
] as const;

export function hasLocalProductCenterFixtureCapability(capabilityId: ProductCenterFixtureCapabilityId): boolean {
  return productCenterFixtureCapabilities.some(
    (item) => item.capabilityId === capabilityId && item.availability === 'local-automated',
  );
}
