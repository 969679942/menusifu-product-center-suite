import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterItemGreenValidation01RuntimeAcceptance } from '../../scripts/build-product-center-item-green-validation-01-runtime-acceptance';

const reportPath = path.resolve(
  'output/audit/product-center-item-green-validation-01-runtime-AUTO_AUDIT_GREEN_VALIDATION_01_20260805_01.json',
);

test.describe('GREEN-VALIDATION-01 runtime acceptance', () => {
  test('应接收十一条实时证据并隔离七条 canonical conflict', () => {
    expect(fs.existsSync(reportPath)).toBe(true);
    const { artifact, outputPath } = buildProductCenterItemGreenValidation01RuntimeAcceptance({
      projectRoot: path.resolve(__dirname, '../..'),
      reportPath,
      generatedAt: '2026-08-05T02:00:00.000Z',
    });
    expect(artifact.status).toBe('accepted-with-canonical-conflicts');
    expect(artifact.summary).toMatchObject({
      total: 11,
      runtimeEvidenceAccepted: 11,
      generationPromotable: 4,
      canonicalRepairRequired: 7,
      humanReviewRequired: 0,
      executorErrors: 0,
    });
    expect(artifact.acceptedCaseIds).toHaveLength(4);
    expect(artifact.canonicalConflictCaseIds).toHaveLength(7);
    expect(artifact.policy).toMatchObject({
      runtimeEvidenceAccepted: true,
      evidenceInheritanceAllowed: false,
      canonicalRepairBeforeGenerationRequired: true,
      humanCaseReviewRequired: false,
    });
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(artifact.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
