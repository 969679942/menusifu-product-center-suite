import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterItemGreenComboMegaRuntimeAcceptance } from '../../scripts/build-product-center-item-green-combo-mega-runtime-acceptance';

const reportPath = path.resolve(
  'output/audit/product-center-item-green-combo-mega-runtime-AUTO_AUDIT_GREEN_COMBO_MEGA_20260805_01.json',
);

test.describe('GREEN-COMBO-MEGA runtime acceptance', () => {
  test('应接收二十八条实时证据并锁定机器处置', () => {
    expect(fs.existsSync(reportPath)).toBe(true);
    const { artifact, outputPath } = buildProductCenterItemGreenComboMegaRuntimeAcceptance({
      projectRoot: path.resolve(__dirname, '../..'),
      reportPath,
      generatedAt: '2026-08-05T04:30:00.000Z',
    });
    expect(artifact.status).toBe('accepted-with-dispositions');
    expect(artifact.summary).toMatchObject({
      total: 28,
      runtimeEvidenceAccepted: 28,
      generationPromotable: 10,
      canonicalRepairRequired: 16,
      environmentAdapterRequired: 2,
      humanReviewRequired: 0,
      executorErrors: 0,
      mutationIntents: 12,
      ledgerResidueVerified: 39,
    });
    expect(artifact.acceptedCaseIds).toHaveLength(10);
    expect(artifact.canonicalConflictCaseIds).toHaveLength(16);
    expect(artifact.environmentBlockedCaseIds).toHaveLength(2);
    expect(artifact.policy).toMatchObject({
      evidenceInheritanceAllowed: false,
      nonIdempotentReplayPerformedForDisposition: false,
      canonicalRepairBeforeGenerationRequired: true,
      blockedPromotionForbidden: true,
      humanCaseReviewRequired: false,
    });
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(artifact.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
