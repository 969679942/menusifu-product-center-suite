import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');
const manifestPath = path.join(
  projectRoot,
  'contracts/product-center/test-manifests/product-center-item-p0-remaining-waves.json',
);
const statusPath = path.join(
  projectRoot,
  'contracts/product-center/test-cases/canonical/product-center-item-current-technical-status.json',
);

test.describe('商品中心剩余 P0 共享波次清单', () => {
  test('应以九个共享波次精确覆盖65条页面观察缺口', async () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as any;
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8')) as any;
    const expectedIds = status.remainingWaveEvidence.caseIds.slice().sort();
    const manifestIds = manifest.waves.flatMap((wave: any) => wave.caseIds);

    expect(manifest).toMatchObject({
      schemaVersion: '1.1.0',
      collectionId: 'product-center-item-p0-remaining-waves',
      status: 'executed-with-reconciled-conflicts-and-terminal-gate',
      summary: {
        total: 65,
        waves: 9,
        productTypes: { standard: 25, addon: 21, combo: 19 },
        accepted: 45,
        canonicalConflict: 19,
        effectiveAccepted: 54,
        acceptedAfterReconciliation: 9,
        unresolvedCanonicalConflict: 10,
        productDefectOpen: 6,
        productRuleConfirmationRequired: 4,
        blocked: 1,
        harnessError: 0,
        authenticatedUiRequired: 0,
        externalTerminalRequired: 1,
      },
      executionPolicy: {
        mode: 'wave-shared-chain',
        caseLevelExecutionAllowed: false,
        uniqueBusinessIdentityRequired: true,
        serverIdsRecordedImmediately: true,
        nonIdempotentReplayRequiresReconciliation: true,
        cleanupInFinally: true,
        uiAndApiZeroResidueRequired: true,
        authenticationArtifactsPersisted: false,
        businessRulesMayBeInferredFromUi: false,
      },
    });
    expect(manifest.waves.map((wave: any) => [wave.waveId, wave.caseCount])).toEqual([
      ['W1', 7], ['W2', 19], ['W3', 6], ['W4', 6], ['W5', 8],
      ['W6', 8], ['W7', 7], ['W8', 3], ['W9', 1],
    ]);
    expect(manifestIds).toHaveLength(65);
    expect(new Set(manifestIds).size).toBe(65);
    expect([...manifestIds].sort()).toEqual(expectedIds);
    expect(manifest.waves.every((wave: any) => (
      wave.executionMode === 'wave-shared-chain'
      && wave.caseLevelExecutionAllowed === false
      && wave.requiredEvidence.length > 0
      && wave.cleanupProtocol.length > 0
    ))).toBe(true);
    expect(manifest.waves.filter((wave: any) => wave.waveId !== 'W9').every((wave: any) => (
      wave.readiness === 'executed'
      && wave.acceptedCount + wave.canonicalConflictCount === wave.caseCount
      && wave.harnessErrorCount === 0
    ))).toBe(true);
    expect(manifest.waves.find((wave: any) => wave.waveId === 'W8')).toMatchObject({
      acceptedCount: 0,
      canonicalConflictCount: 3,
      acceptedAfterReconciliationCount: 3,
      effectiveAcceptedCount: 3,
      unresolvedCanonicalConflictCount: 0,
      harnessErrorCount: 0,
    });
    expect(manifest.waves.find((wave: any) => wave.waveId === 'W9')).toMatchObject({
      accessScope: 'external-terminal-required',
      readiness: 'blocked-until-terminal-access',
      acceptedCount: 0,
      canonicalConflictCount: 0,
      blockedCount: 1,
    });
  });
});
