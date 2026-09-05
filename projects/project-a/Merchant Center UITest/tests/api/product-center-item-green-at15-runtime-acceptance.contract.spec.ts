import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterItemGreenAt15RuntimeAcceptance } from '../../scripts/build-product-center-item-green-at15-runtime-acceptance';

test('GREEN-AT15 runtime acceptance 应固化主图替换冲突及零残留', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const reportPath = path.join(
    projectRoot,
    'output/audit/product-center-item-green-at15-runtime-AUTO_AUDIT_GREEN_AT15_20260803_01.json',
  );
  const { artifact } = buildProductCenterItemGreenAt15RuntimeAcceptance({
    projectRoot,
    reportPath,
    generatedAt: '2026-08-03T14:35:00.000Z',
  });
  expect(artifact).toMatchObject({
    status: 'accepted-with-canonical-conflict',
    summary: {
      total: 1,
      accepted: 0,
      canonicalConflicts: 1,
      executorErrors: 0,
      generationPromotable: 0,
      canonicalRepairRequired: 1,
      humanReviewRequired: 0,
      mutationIntents: 1,
      ledgerResidueVerified: 1,
    },
  });
  expect(artifact.canonicalConflicts.map((item) => item.caseId)).toEqual(['TC-ITEM-STD-078']);
  expect(artifact.canonicalConflicts[0]?.evidence).toMatchObject({
    firstUpload: { terminalState: 'preview-ready', responseStatus: 200 },
    interactionEvidenceAfterFirstUpload: { visibleUploadAreaCount: 0, fileInputCount: 0 },
    replacement: { attempted: false, outcome: 'no-visible-upload-control', requestObserved: false },
    submission: { responseStatus: 200, successMessageCount: 1 },
    persistedEvidence: { reopenedState: { count: 1 } },
  });
});
