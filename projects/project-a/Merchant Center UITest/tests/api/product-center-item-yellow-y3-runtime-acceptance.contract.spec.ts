import { expect, test } from '@playwright/test';
import path from 'node:path';
import { buildProductCenterItemYellowY3RuntimeAcceptance } from '../../scripts/build-product-center-item-yellow-y3-runtime-acceptance';

test('Y3-B1 runtime acceptance 应固化五条通过、四条冲突及跨断点零残留', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const reportPath = path.join(
    projectRoot,
    'output/audit/product-center-item-yellow-y3-runtime-AUTO_AUDIT_YELLOW_Y3_20260802_02.json',
  );
  const { artifact } = buildProductCenterItemYellowY3RuntimeAcceptance({
    projectRoot,
    reportPath,
    generatedAt: '2026-08-02T15:30:00.000Z',
  });
  expect(artifact).toMatchObject({
    status: 'accepted-with-canonical-conflicts',
    summary: {
      total: 9,
      accepted: 5,
      canonicalConflicts: 4,
      executorErrors: 0,
      generationPromotable: 5,
      canonicalRepairRequired: 4,
      humanReviewRequired: 0,
    },
    acceptedCaseIds: [
      'TC-ITEM-UI-004',
      'TC-ITEM-UI-005',
      'TC-ITEM-UI-006',
      'TC-ITEM-UI-007',
      'TC-ITEM-UI-008',
    ],
  });
  expect(artifact.canonicalConflicts.map((item) => item.caseId).sort()).toEqual([
    'TC-ITEM-ADD-002',
    'TC-ITEM-ADD-041',
    'TC-ITEM-PKG-048',
    'TC-ITEM-STD-030',
  ]);
});
