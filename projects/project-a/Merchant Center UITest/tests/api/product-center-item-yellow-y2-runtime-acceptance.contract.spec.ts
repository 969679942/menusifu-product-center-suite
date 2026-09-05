import { expect, test } from '@playwright/test';
import path from 'node:path';
import { buildProductCenterItemYellowY2RuntimeAcceptance } from '../../scripts/build-product-center-item-yellow-y2-runtime-acceptance';

test('Y2 runtime acceptance 应保留互斥规则冲突与3项零残留证据', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const reportPath = path.join(
    projectRoot,
    'output/audit/product-center-item-yellow-y2-runtime-AUTO_AUDIT_YELLOW_Y2_20260802_03.json',
  );
  const { artifact } = buildProductCenterItemYellowY2RuntimeAcceptance({
    projectRoot,
    reportPath,
    generatedAt: '2026-08-02T13:00:00.000Z',
  });
  expect(artifact).toMatchObject({
    status: 'accepted-with-canonical-conflict',
    caseId: 'TC-ITEM-STD-061',
    summary: {
      total: 1,
      accepted: 0,
      canonicalConflicts: 1,
      executorErrors: 0,
      createdServerObjects: 3,
      residueVerified: 3,
      generationPromotable: 0,
      exactTechnicalBindingRequired: 1,
    },
    conflict: {
      update: { method: 'PUT', status: 200 },
      conflictState: { checked: true, disabled: false, ariaDisabled: '' },
    },
  });
});
