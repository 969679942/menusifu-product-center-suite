import { expect, test } from '@playwright/test';
import path from 'node:path';
import { buildProductCenterItemYellowY3B2RuntimeAcceptance } from '../../scripts/build-product-center-item-yellow-y3-b2-runtime-acceptance';

test('Y3-B2 runtime acceptance 应固化五条通过、六条冲突及跨断点零残留', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const reportPath = path.join(
    projectRoot,
    'output/audit/product-center-item-yellow-y3-b2-runtime-AUTO_AUDIT_YELLOW_Y3_B2_20260802_01.json',
  );
  const { artifact } = buildProductCenterItemYellowY3B2RuntimeAcceptance({
    projectRoot,
    reportPath,
    generatedAt: '2026-08-02T16:00:00.000Z',
  });
  expect(artifact).toMatchObject({
    status: 'accepted-with-canonical-conflicts',
    summary: {
      total: 11,
      accepted: 5,
      canonicalConflicts: 6,
      executorErrors: 0,
      generationPromotable: 5,
      canonicalRepairRequired: 6,
      humanReviewRequired: 0,
      apiResidueVerified: 40,
      uiResidueVerified: 40,
    },
    acceptedCaseIds: [
      'TC-ITEM-ADD-007',
      'TC-ITEM-ADD-009',
      'TC-ITEM-STD-019',
      'TC-ITEM-STD-084',
      'TC-ITEM-STD-085',
    ],
  });
  expect(artifact.canonicalConflicts.map((item) => item.caseId)).toEqual([
    'TC-ITEM-ADD-011',
    'TC-ITEM-ADD-022',
    'TC-ITEM-ADD-025',
    'TC-ITEM-ADD-038',
    'TC-ITEM-ADD-049',
    'TC-ITEM-STD-086',
  ]);
});
