import { expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildProductCenterCategoryPilotArtifacts } from '../../scripts/build-product-center-category-pilot';

test.describe('商品分类模块全量试点合同', () => {
  test('分类试点命令应覆盖正式关系阻断标题', async () => {
    const packageDocument = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'));

    expect(packageDocument.scripts['test:product-center:category-pilot'])
      .toContain('分类下已有商品');
  });

  test('应形成七条用例并达到七项稳定能力全覆盖', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'product-center-category-pilot-'));
    try {
      const result = await buildProductCenterCategoryPilotArtifacts(rootDir);
      const report = JSON.parse(await readFile(result.reportPath, 'utf8'));

      expect(report.status).toBe('passed');
      expect(report.baseAudit.summary).toEqual({ total: 7, eligible: 7, reviewRequired: 0, manual: 0 });
      expect(report.semanticAudit.summary).toEqual({ total: 7, passed: 7, reviewRequired: 0 });
      expect(report.coverageAudit.summary).toMatchObject({ required: 7, covered: 7, missing: 0 });
      expect(report.executabilityAudit.summary).toEqual({
        total: 7,
        executable: 7,
        reviewRequired: 0,
        manual: 0,
      });
      expect(report.normalizedCases.find((item: { id: string }) => item.id === 'TC-ITEM-STD-035'))
        .toMatchObject({
          automationPreference: 'candidate',
          coverageIds: ['coverage:control:category-add-child'],
          execution: expect.objectContaining({
            capabilityIds: ['navigation.sidebar.open', 'category.attemptAddChildBlockedByProduct'],
            seedAdapterIds: ['productCenter.seedCategoryWithProduct'],
            cleanupAdapterIds: ['productCenter.cleanupSeed'],
          }),
        });
      expect(await readFile(result.inputPath, 'utf8')).not.toMatch(/authorization|cookie|password|token/i);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
