import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterItemGreenAt39RuntimeAcceptance } from '../../scripts/build-product-center-item-green-at39-runtime-acceptance';

test('GREEN-AT39 runtime acceptance 应固化 MOQ=2 创建成功及零残留', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const reportPath = path.join(
    projectRoot,
    'output/audit/product-center-item-green-at39-runtime-AUTO_AUDIT_GREEN_AT39_20260803_01.json',
  );
  const { artifact } = buildProductCenterItemGreenAt39RuntimeAcceptance({
    projectRoot,
    reportPath,
    generatedAt: '2026-08-03T14:50:00.000Z',
  });
  expect(artifact).toMatchObject({
    status: 'accepted',
    summary: {
      total: 1,
      accepted: 1,
      canonicalConflicts: 0,
      executorErrors: 0,
      generationPromotable: 1,
      humanReviewRequired: 0,
      mutationIntents: 1,
      ledgerResidueVerified: 5,
    },
    acceptedCaseIds: ['TC-ITEM-PKG-016'],
  });
  expect(artifact.acceptedEvidence[0]?.evidence).toMatchObject({
    valueBeforeSave: '2',
    response: { method: 'POST', status: 200 },
    successMessageCount: 1,
    locatorCount: 1,
    listPrice: 10,
    reopenedMinimumOrderQuantity: '2',
    expectedSatisfied: true,
  });
});
