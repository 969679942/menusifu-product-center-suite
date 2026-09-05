import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterItemGreenStandardMegaRuntimeAcceptance } from '../../scripts/build-product-center-item-green-standard-mega-runtime-acceptance';

const reportPath = path.resolve(
  'output/audit/product-center-item-green-standard-mega-runtime-AUTO_AUDIT_GREEN_STANDARD_MEGA_20260805_01.json',
);

test.describe('GREEN-STANDARD-MEGA runtime acceptance', () => {
  test('应接收十七条实时证据并完成机器重分类', () => {
    expect(fs.existsSync(reportPath)).toBe(true);
    const { artifact, outputPath } = buildProductCenterItemGreenStandardMegaRuntimeAcceptance({
      projectRoot: path.resolve(__dirname, '../..'),
      reportPath,
      generatedAt: '2026-08-05T03:00:00.000Z',
    });
    expect(artifact.status).toBe('accepted-with-dispositions');
    expect(artifact.summary).toMatchObject({
      total: 17,
      runtimeEvidenceAccepted: 17,
      generationPromotable: 7,
      canonicalRepairRequired: 7,
      environmentAdapterRequired: 3,
      humanReviewRequired: 0,
      executorErrors: 0,
      mutationIntents: 13,
      ledgerResidueVerified: 18,
    });
    expect(artifact.acceptedCaseIds).toHaveLength(7);
    expect(artifact.canonicalConflictCaseIds).toHaveLength(7);
    expect(artifact.environmentBlockedCaseIds).toHaveLength(3);
    expect(artifact.evidenceReclassifiedCaseIds).toHaveLength(5);
    expect(artifact.policy).toMatchObject({
      evidenceInheritanceAllowed: false,
      nonIdempotentReplayPerformedForReclassification: false,
      canonicalRepairBeforeGenerationRequired: true,
      blockedPromotionForbidden: true,
      humanCaseReviewRequired: false,
    });
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(artifact.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
