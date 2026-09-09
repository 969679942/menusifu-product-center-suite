import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterItemYellowY3B4RuntimeAcceptance } from '../../scripts/build-product-center-item-yellow-y3-b4-runtime-acceptance';

test('Y3-B4 runtime acceptance 应固化两条规则冲突及零残留', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const reportPath = path.join(
    projectRoot,
    'output/audit/product-center-item-yellow-y3-b4-runtime-AUTO_AUDIT_YELLOW_Y3_B4_20260803_01.json',
  );
  const { artifact } = buildProductCenterItemYellowY3B4RuntimeAcceptance({
    projectRoot,
    reportPath,
    generatedAt: '2026-08-03T03:30:00.000Z',
  });
  expect(artifact).toMatchObject({
    status: 'accepted-with-canonical-conflicts',
    summary: {
      total: 2,
      accepted: 0,
      canonicalConflicts: 2,
      executorErrors: 0,
      generationPromotable: 0,
      canonicalRepairRequired: 2,
      humanReviewRequired: 0,
      mutationIntents: 3,
      ledgerResidueVerified: 2,
    },
  });
  expect(artifact.canonicalConflicts.map((item) => item.caseId)).toEqual([
    'TC-ITEM-ADD-012',
    'TC-ITEM-ADD-013',
  ]);
});
