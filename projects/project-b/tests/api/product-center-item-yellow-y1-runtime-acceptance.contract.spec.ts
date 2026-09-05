import { expect, test } from '@playwright/test';
import path from 'node:path';
import { buildProductCenterItemYellowY1RuntimeAcceptance } from '../../scripts/build-product-center-item-yellow-y1-runtime-acceptance';

test('Y1 runtime acceptance 应保留12条通过与2条canonical conflict', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const reportPath = path.join(
    projectRoot,
    'output/audit/product-center-item-yellow-y1-runtime-AUTO_AUDIT_YELLOW_Y1_20260731_01.json',
  );
  const { artifact } = buildProductCenterItemYellowY1RuntimeAcceptance({
    projectRoot,
    reportPath,
    generatedAt: '2026-07-31T15:30:00.000Z',
  });
  expect(artifact).toMatchObject({
    collectionId: 'product-center-item-yellow-y1-runtime-acceptance',
    status: 'accepted-with-canonical-conflicts',
    summary: {
      total: 14,
      accepted: 12,
      canonicalConflicts: 2,
      environmentBlocked: 0,
      executorErrors: 0,
      mutationCount: 0,
      generationPromotable: 0,
      exactTechnicalBindingRequired: 14,
    },
    policy: {
      runtimeEvidenceAccepted: true,
      canonicalConflictsDoNotFailHarness: true,
      runtimeEvidenceDoesNotReplaceExactRecipeBinding: true,
      caseLevelEvidenceRequired: true,
      evidenceInheritanceAllowed: false,
    },
  });
  expect(artifact.acceptedCaseIds).toHaveLength(12);
  expect(artifact.canonicalConflictCases.map((item) => item.caseId).sort()).toEqual([
    'TC-ITEM-ADD-035',
    'TC-ITEM-STD-071',
  ]);
});
