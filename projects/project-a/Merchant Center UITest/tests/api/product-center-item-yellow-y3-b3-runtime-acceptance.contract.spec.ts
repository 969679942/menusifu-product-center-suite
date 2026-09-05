import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterItemYellowY3B3RuntimeAcceptance } from '../../scripts/build-product-center-item-yellow-y3-b3-runtime-acceptance';

test('Y3-B3 runtime acceptance 应固化十五条证据及零残留', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const reportPath = path.join(
    projectRoot,
    'output/audit/product-center-item-yellow-y3-b3-runtime-AUTO_AUDIT_YELLOW_Y3_B3_20260803_01.json',
  );
  const { artifact } = buildProductCenterItemYellowY3B3RuntimeAcceptance({
    projectRoot,
    reportPath,
    generatedAt: '2026-08-03T02:00:00.000Z',
  });
  expect(artifact).toMatchObject({
    status: 'accepted-with-blocks',
    summary: {
      total: 15,
      accepted: 8,
      canonicalConflicts: 1,
      environmentBlocked: 6,
      executorErrors: 0,
      generationPromotable: 8,
      humanReviewRequired: 0,
      ledgerResidueVerified: 45,
      lateUiResidueDeleted: 2,
    },
  });
  expect(artifact.canonicalConflicts.map((item) => item.caseId)).toEqual(['TC-ITEM-UI-003']);
  expect(artifact.environmentBlocks).toHaveLength(6);
});
