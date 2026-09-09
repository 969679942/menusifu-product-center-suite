import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');
const statusPath = path.join(
  projectRoot,
  'contracts/product-center/test-cases/canonical/product-center-item-current-technical-status.json',
);

test.describe('商品测试用例当前技术闭环视图', () => {
  test('应聚合 W1-W9 并且只将 accepted 证据计入运行覆盖', async () => {
    const exists = fs.existsSync(statusPath);
    expect(exists).toBe(true);
    if (!exists) return;

    const document = JSON.parse(fs.readFileSync(statusPath, 'utf8')) as any;
    expect(document).toMatchObject({
      collectionId: 'product-center-item-current-technical-status',
      status: 'partial-runtime-accepted',
      summary: {
        total: 225,
        runtimeAccepted: 94,
        remaining: 131,
        runtimeCoverage: { accepted: 94, remaining: 131 },
        baselineCompatibility: {
          accepted: 89,
          canonicalReconciliationRequired: 5,
          notRuntimeAccepted: 131,
        },
        capabilityMappingRequired: 27,
        pageObservationRequired: 92,
        canonicalConflictRequired: 0,
        productDefectOpen: 6,
        productRuleConfirmationRequired: 4,
        externalTerminalBlocked: 1,
        byPriority: {
          P0: {
            total: 86,
            runtimeAccepted: 82,
            baselineCompatible: 79,
            canonicalReconciliationRequired: 3,
            remaining: 4,
          },
          P1: {
            total: 132,
            runtimeAccepted: 12,
            baselineCompatible: 10,
            canonicalReconciliationRequired: 2,
            remaining: 120,
          },
          P2: {
            total: 7,
            runtimeAccepted: 0,
            baselineCompatible: 0,
            canonicalReconciliationRequired: 0,
            remaining: 7,
          },
        },
      },
      runtimeSources: {
        baselineAccepted: 4,
        waveAccepted: 36,
        remainingWaveAccepted: 54,
        acceptedAfterReconciliation: 9,
        remainingWaveCanonicalConflict: 10,
        productDefectOpen: 6,
        productRuleConfirmationRequired: 4,
        externalTerminalBlocked: 1,
        overlap: 0,
        alternateCanonicalAccepted: 5,
      },
      remainingWaveEvidence: {
        scope: 65,
        accepted: 45,
        canonicalConflict: 19,
        blocked: 1,
        harnessError: 0,
        runtimeReports: 8,
        terminalGates: 1,
        acceptedAfterReconciliation: 9,
        unresolvedCanonicalConflict: 10,
      },
      canonicalReconciliation: {
        baselineCanonicalPath: 'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json',
        alternateCanonicalPath: 'contracts/product-center/test-cases/canonical/product-center-item-canonical-release.json',
        confirmedCaseIds: [
          'TC-ITEM-STD-007',
          'TC-ITEM-STD-011',
          'TC-ITEM-STD-012',
          'TC-ITEM-STD-013',
          'TC-ITEM-STD-014',
        ],
        unconfirmedCaseIds: [],
      },
    });
    expect(document.entries).toHaveLength(225);
    expect(new Set(document.entries.map((item: any) => item.caseId)).size).toBe(225);
    expect(document.entries.filter((item: any) => item.currentStatus === 'runtime-accepted')).toHaveLength(94);
    expect(document.entries.filter((item: any) => (
      item.priority === 'P0' && item.currentStatus !== 'runtime-accepted'
    ))).toHaveLength(4);
    expect(document.waveAcceptedCaseIds).toHaveLength(36);
    expect(document.remainingWaveAcceptedCaseIds).toHaveLength(54);
    expect(document.acceptedAfterReconciliationCaseIds).toHaveLength(9);
    expect(document.remainingWaveCanonicalConflictCaseIds).toHaveLength(10);
    expect(document.productDefectOpenCaseIds).toHaveLength(6);
    expect(document.productRuleConfirmationRequiredCaseIds).toHaveLength(4);
    expect(document.externalTerminalBlockedCaseIds).toEqual(['TC-ITEM-STD-080']);
    expect(document.overlappingAcceptedCaseIds).toEqual([]);
    expect(document.baselineCompatibleCaseIds).toHaveLength(89);
    expect(document.canonicalReconciliationCaseIds).toEqual([
      'TC-ITEM-STD-007',
      'TC-ITEM-STD-011',
      'TC-ITEM-STD-012',
      'TC-ITEM-STD-013',
      'TC-ITEM-STD-014',
    ]);
    const reconciliationEntries = document.entries.filter((item: any) => (
      item.canonicalCompatibility === 'canonical-reconciliation-required'
    ));
    expect(reconciliationEntries).toHaveLength(5);
    expect(reconciliationEntries.every((item: any) => (
      item.currentStatus === 'runtime-accepted'
      && item.releaseEligible === false
      && item.generationAllowed === false
      && item.remainingGapCodes.includes('canonical-reconciliation-required')
    ))).toBe(true);
    expect(document.entries.find((item: any) => item.caseId === 'TC-ITEM-ADD-029')).toMatchObject({
      currentStatus: 'runtime-accepted',
      runtimeSource: 'p0-remaining-wave-runtime-evidence',
      remainingWaveDisposition: 'accepted',
    });
    expect(document.entries.find((item: any) => item.caseId === 'TC-ITEM-STD-067')).toMatchObject({
      currentStatus: 'runtime-accepted',
      runtimeSource: 'p0-remaining-wave-reconciled-evidence',
      remainingWaveDisposition: 'accepted-after-canonical-reconciliation',
      generationAllowed: true,
    });
    expect(document.entries.find((item: any) => item.caseId === 'TC-ITEM-STD-021')).toMatchObject({
      currentStatus: 'product-defect-open',
      runtimeSource: 'not-runtime-accepted',
      remainingWaveDisposition: 'retain-canonical-file-bug',
      generationAllowed: false,
    });
    expect(document.entries.find((item: any) => item.caseId === 'TC-ITEM-PKG-019')).toMatchObject({
      currentStatus: 'product-rule-confirmation-required',
      runtimeSource: 'not-runtime-accepted',
      remainingWaveDisposition: 'needs-prd',
      generationAllowed: false,
    });
    expect(document.entries.find((item: any) => item.caseId === 'TC-ITEM-STD-080')).toMatchObject({
      currentStatus: 'blocked-until-terminal-access',
      runtimeSource: 'not-runtime-accepted',
      remainingWaveDisposition: 'blocked-until-terminal-access',
    });
  });
});
