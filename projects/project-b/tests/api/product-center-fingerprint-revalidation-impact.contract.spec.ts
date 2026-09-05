import { expect, test } from '@playwright/test';
import {
  buildProductCenterFingerprintRevalidationImpact,
  type ProductCenterAssetRemediationQueues,
} from '../../adapters/product-center/product-center-fingerprint-revalidation-impact';

function queueFixture(): ProductCenterAssetRemediationQueues {
  return {
    schemaVersion: '1.0.0',
    generatedAt: '2026-09-05T00:00:00.000Z',
    identity: {
      applicationId: 'merchant-center',
      businessDomainId: 'product-center',
      scope: 'product-center-all-formal-cases',
    },
    source: {
      lifecyclePath: 'deliverables/system-test-platform/product-center-asset-lifecycle.json',
      lifecycleGeneratedAt: '2026-09-04T23:59:00.000Z',
    },
    queues: {
      fingerprintRevalidation: [
        {
          caseId: 'TC-FLV-SEA-018',
          module: 'seasoning',
          status: 'revalidation-required',
          action: 'execution-fingerprint-revalidation',
          driftDimensions: ['case', 'implementation', 'context'],
        },
        {
          caseId: 'TC-FLV-SEA-002',
          module: 'seasoning',
          status: 'revalidation-required',
          action: 'execution-fingerprint-revalidation',
          driftDimensions: ['implementation'],
        },
        {
          caseId: 'TC-GRP-ADD-001',
          module: 'group',
          status: 'revalidation-required',
          action: 'execution-fingerprint-revalidation',
          driftDimensions: ['case'],
        },
      ],
    },
  };
}

test.describe('商品中心指纹重验证影响清单合同', () => {
  test('仅选择指定模块并保留全部漂移维度', () => {
    const result = buildProductCenterFingerprintRevalidationImpact({
      queue: queueFixture(),
      module: 'seasoning',
      changeId: 'seasoning-current-fingerprint-revalidation-20260905',
      impactType: 'business-implementation',
    });

    expect(result.impactedCaseIds).toEqual(['TC-FLV-SEA-002', 'TC-FLV-SEA-018']);
    expect(result.caseImpactTypes).toEqual({
      'TC-FLV-SEA-002': 'business-implementation',
      'TC-FLV-SEA-018': 'business-implementation',
    });
    expect(result.source.driftDimensions).toEqual({ case: 1, context: 1, implementation: 2 });
  });

  test('模块无整改项时阻断空计划', () => {
    expect(() => buildProductCenterFingerprintRevalidationImpact({
      queue: queueFixture(),
      module: 'image',
      changeId: 'image-empty',
      impactType: 'unknown-impact',
    })).toThrow('FINGERPRINT_REVALIDATION_QUEUE_EMPTY:image');
  });
});
