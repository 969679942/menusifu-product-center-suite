import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterItemGenerationReadyArtifacts } from '../../scripts/build-product-center-item-generation-ready';
import { validateProductCenterItemRebuiltXmind } from '../../utils/product-center-item-xmind-rebuild';

test.describe('商品中心 89 条准确生成发布合同', () => {
  test('应只生成 generationAllowed 的基线兼容用例', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'product-center-item-generation-ready-'));
    const originalXmindPath = path.resolve(
      projectRoot,
      '..',
      'Merchant Center Info',
      '00-待转换测试方案',
      '用例库',
      '商品中心-商品管理-商品',
      '1.商品中心-商品管理-商品.xmind',
    );
    const originalHash = sha256(await readFile(originalXmindPath));
    try {
      const artifacts = buildProductCenterItemGenerationReadyArtifacts({
        projectRoot,
        outputRoot,
        generatedAt: '2026-07-31T11:30:00.000Z',
      });
      const release = JSON.parse(await readFile(artifacts.releasePath, 'utf8')) as any;
      const markdown = await readFile(artifacts.markdownPath, 'utf8');
      const xmind = await readFile(artifacts.xmindPath);

      expect(release).toMatchObject({
        schemaVersion: '1.0.0',
        collectionId: 'product-center-item-generation-ready-v1',
        status: 'accepted',
        summary: {
          total: 89,
          byPriority: { P0: 79, P1: 10, P2: 0 },
          byProductType: { standard: 39, addon: 22, combo: 28 },
          byRuntimeSource: {
            baselineRuntimeAcceptance: 4,
            p0WaveRuntimeAcceptance: 31,
            remainingWaveRuntimeEvidence: 45,
            reconciledRuntimeEvidence: 9,
          },
          productCorrected: 10,
          excluded: 136,
        },
        exclusionSummary: {
          notRuntimeAccepted: 119,
          canonicalReconciliationRequired: 5,
          productDefectOpen: 6,
          productRuleConfirmationRequired: 4,
          externalTerminalBlocked: 1,
        },
        guardrails: {
          originalXmindOverwritten: false,
          sourceRequired: true,
          fullReviewApprovalRequired: true,
          runtimeAcceptanceRequired: true,
          baselineCompatibilityRequired: true,
          blockedCasesMayGenerate: false,
          canonicalIdsPreserved: true,
        },
      });
      expect(release.cases).toHaveLength(89);
      expect(new Set(release.cases.map((item: any) => item.caseId)).size).toBe(89);
      expect(release.cases.every((item: any) => (
        item.generationAllowed === true
        && item.currentStatus === 'runtime-accepted'
        && item.canonicalCompatibility === 'baseline-compatible'
        && item.fullReviewDecision === 'approved'
        && item.source.length > 0
        && item.preconditions.length > 0
        && item.actions.length > 0
        && item.expectedResults.length > 0
      ))).toBe(true);
      expect(release.cases.filter((item: any) => item.changeType === 'product-corrected')).toHaveLength(10);
      expect(release.cases.find((item: any) => item.caseId === 'TC-ITEM-STD-067')).toMatchObject({
        title: '菜单引用中的标准商品不可停用',
        runtimeSource: 'p0-remaining-wave-reconciled-evidence',
      });
      const forbiddenIds = [
        'TC-ITEM-STD-021', 'TC-ITEM-STD-023', 'TC-ITEM-ADD-010',
        'TC-ITEM-STD-081', 'TC-ITEM-ADD-024', 'TC-ITEM-PKG-035',
        'TC-ITEM-ADD-001', 'TC-ITEM-PKG-019', 'TC-ITEM-PKG-013', 'TC-ITEM-ADD-015',
        'TC-ITEM-STD-080', 'TC-ITEM-STD-007', 'TC-ITEM-STD-011', 'TC-ITEM-STD-012',
        'TC-ITEM-STD-013', 'TC-ITEM-STD-014',
        'TC-ITEM-PKG-059',
      ];
      expect(release.cases.some((item: any) => forbiddenIds.includes(item.caseId))).toBe(false);
      expect(release.cases.some((item: any) => item.caseId === 'TC-ITEM-PKG-006')).toBe(true);
      expect(markdown.match(/^### 用例编号：TC-ITEM-/gm)).toHaveLength(89);
      expect(markdown).not.toMatch(/^={2,}$/m);
      expect(markdown).not.toMatch(/^\d+\.\s+\d+\./m);
      expect(validateProductCenterItemRebuiltXmind(xmind, 89)).toEqual([]);
      expect(await readFile(originalXmindPath).then(sha256)).toBe(originalHash);
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
