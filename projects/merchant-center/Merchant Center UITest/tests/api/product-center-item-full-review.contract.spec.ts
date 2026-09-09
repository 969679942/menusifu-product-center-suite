import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterItemFullReviewArtifacts } from '../../scripts/build-product-center-item-full-review';
import { assertProductCenterItemFullReviewGate } from '../../utils/product-center-item-full-review';

test.describe('商品测试用例逐条全审合同', () => {
  test('232 条用例必须逐条形成明确审核结论且不得抽审', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const { review } = buildProductCenterItemFullReviewArtifacts({
      projectRoot,
      outputRoot: path.join(projectRoot, 'output/test-case-audit/full-review-contract'),
      reviewedAt: '2026-07-30T00:00:00.000Z',
    });

    expect(review.summary.total).toBe(232);
    expect(review.summary.expertReviewed).toBe(232);
    expect(review.summary.pending).toBe(0);
    expect(review.summary.sourceConfirmationRequired).toBe(0);
    expect(review.summary.deprecated).toBe(7);
    expect(review.summary.revisionRequired).toBe(0);
    expect(review.summary.approved).toBe(225);
    expect(review.guardrails.samplingAllowed).toBe(false);
    expect(review.guardrails.partialDownstreamReleaseAllowed).toBe(false);
    expect(review.entries.every((item) => item.reviewedBy === 'Codex 测试专家')).toBe(true);
  });

  test('全部活动用例批准后才允许进入技术绑定和 Recipe', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const review = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-cases/canonical/product-center-item-full-review.json',
    ), 'utf8')) as ReturnType<typeof buildProductCenterItemFullReviewArtifacts>['review'];

    expect(review.generationAllowed).toBe(true);
    expect(review.status).toBe('approved');
    expect(review.entries.every((item) => item.generationAllowed === false)).toBe(true);
    expect(() => assertProductCenterItemFullReviewGate(review)).not.toThrow();
    expect(() => assertProductCenterItemFullReviewGate(review, {
      expectedSourcePlanFingerprint: 'outdated-plan',
    })).toThrow('商品用例全审已过期');
  });

  test('已修订问题应关闭且页面能力不得绕过整批门禁', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const review = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-cases/canonical/product-center-item-full-review.json',
    ), 'utf8')) as ReturnType<typeof buildProductCenterItemFullReviewArtifacts>['review'];
    const byId = new Map(review.entries.map((item) => [item.caseId, item]));

    expect(byId.get('TC-ITEM-STD-022')?.decision).toBe('approved');
    expect(byId.get('TC-ITEM-STD-040')?.decision).toBe('deprecated');
    expect(byId.get('TC-ITEM-STD-010')?.issues.map((item) => item.code))
      .not.toContain('IMPLEMENTATION_DETAIL_ASSERTION');
    expect(byId.get('TC-ITEM-UI-001')?.decision).toBe('approved');
    expect(byId.get('TC-ITEM-PKG-046')?.decision).toBe('approved');
    expect(byId.get('TC-ITEM-PKG-057')?.issues.map((item) => item.code))
      .not.toContain('OUTDATED_COMBO_RULE');
    expect(byId.get('TC-ITEM-PKG-059')?.decision).toBe('approved');
    expect(byId.get('TC-ITEM-PKG-059')?.issues.map((item) => item.code))
      .toEqual([]);
    expect(fs.readFileSync(path.join(
      projectRoot,
      'scripts/build-product-center-technical-binding-candidates.ts',
    ), 'utf8')).toContain('assertProductCenterItemFullReviewGate');
    expect(fs.readFileSync(path.join(
      projectRoot,
      'scripts/build-product-center-technical-binding-candidates.ts',
    ), 'utf8')).toContain('expectedSourcePlanFingerprint');
  });
});
