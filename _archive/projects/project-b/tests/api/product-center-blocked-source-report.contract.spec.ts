import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterBlockedSourceReport } from '../../scripts/build-product-center-blocked-source-report';

test.describe('商品中心 blocked 来源地址报告', () => {
  test('应只列出当前仍然 blocked 的用例地址、负责人和阻塞原因', async () => {
    const outputRoot = await mkdtemp(path.join(tmpdir(), 'product-center-blocked-source-'));
    try {
      const result = await buildProductCenterBlockedSourceReport({
        projectRoot: path.resolve(__dirname, '../..'),
        infoRoot: path.resolve(__dirname, '../../../Merchant Center Info'),
        outputRoot,
        generatedAt: '2026-07-27T00:00:00.000Z',
      });
      const report = JSON.parse(await readFile(result.jsonPath, 'utf8'));
      const decisions = JSON.parse(await readFile(path.resolve(
        __dirname, '../../contracts/product-center/reviews/unsupported-source-format-decisions.json',
      ), 'utf8'));
      const expectedBlocked = decisions.cases.filter((item: any) => (
        item.status === 'blocked' && item.currentGoalBlocking === true
      ));
      expect(report.summary.cases).toBe(expectedBlocked.length);
      expect(report.summary.files).toBe(new Set(expectedBlocked.map((item: any) => item.sourceFile)).size);
      expect(report.cases.map((item: any) => item.caseId).sort())
        .toEqual(expectedBlocked.map((item: any) => item.caseId).sort());
      expect(report.cases.every((item: any) =>
        item.status === 'blocked'
        && item.disposition === 'blocked-source-review'
        && item.currentGoalBlocking === true
        && item.caseLine > 0
        && item.sourceLine >= item.caseLine
        && item.address === `${item.sourceFile}:${item.caseLine}`
        && item.blockCode
        && item.blockReason,
      )).toBe(true);
      expect(report.workstream).toEqual({
        id: 'test-plan-to-test-case-generation',
        status: 'active',
        currentGoalBlocking: true,
      });
      expect(await readFile(result.markdownPath, 'utf8')).toContain('## 用例明细');
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});
