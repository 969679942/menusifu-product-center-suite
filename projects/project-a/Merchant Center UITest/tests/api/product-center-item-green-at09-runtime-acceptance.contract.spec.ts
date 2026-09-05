import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterItemGreenAt09RuntimeAcceptance } from '../../scripts/build-product-center-item-green-at09-runtime-acceptance';

test.describe('商品中心绿色 AT09 运行验收产物', () => {
  test('应固化四条通过证据与三次创建零残留门禁', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const reportPath = path.join(
      projectRoot,
      'output/audit/product-center-item-green-at09-runtime-AUTO_AUDIT_GREEN_AT09_20260803_05.json',
    );
    const { artifact, outputPath } = buildProductCenterItemGreenAt09RuntimeAcceptance({
      projectRoot,
      reportPath,
      generatedAt: '2026-08-03T17:30:00.000Z',
    });
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(artifact).toMatchObject({
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-green-at09-runtime-acceptance',
      status: 'accepted',
      runId: 'AUTO_AUDIT_GREEN_AT09_20260803_05',
      batchId: 'GREEN-AT09',
      summary: {
        total: 4,
        accepted: 4,
        canonicalConflicts: 0,
        executorErrors: 0,
        generationPromotable: 4,
        canonicalRepairRequired: 0,
        humanReviewRequired: 0,
        mutationIntents: 3,
        ledgerResidueVerified: 3,
      },
      acceptedCaseIds: ['TC-ITEM-STD-020', 'TC-ITEM-STD-048', 'TC-ITEM-STD-050', 'TC-ITEM-STD-098'],
      policy: {
        runtimeEvidenceAccepted: true,
        evidenceInheritanceAllowed: false,
        checkpointResumeAccepted: true,
        interruptedMutationReconciliationRequired: true,
        controlledMutationRequired: true,
        uiAndApiResidueVerificationRequired: true,
        humanCaseReviewRequired: false,
      },
    });
    expect(artifact.acceptedEvidence).toHaveLength(4);
    expect(artifact.source.reportSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
