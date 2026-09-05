import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterItemCoreReviewBatch,
  productCenterItemCoreFamilyMinimums,
  productCenterItemCoreScenarioFamilies,
} from '../../utils/product-center-item-core-review-batch';
import { diagnoseProductCenterMarkdownTestPlan } from '../../utils/product-center-test-plan-markdown';

const projectRoot = path.resolve(__dirname, '../..');
const sourcePath = path.resolve(
  projectRoot,
  '..',
  'Merchant Center Info',
  '00-待转换测试方案',
  '用例库',
  '商品中心-商品管理-商品',
  '1.商品中心-商品管理-商品-正式测试用例.md',
);

test.describe('商品中心商品核心测试用例审核批次', () => {
  test('应按 P0 业务风险批量覆盖九类核心场景', async () => {
    const markdown = fs.readFileSync(sourcePath, 'utf8');
    const batch = buildProductCenterItemCoreReviewBatch({
      markdown,
      sourcePath: '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
      generatedAt: '2026-07-30T00:00:00.000Z',
    });

    expect(batch.summary.selectedCount).toBeGreaterThanOrEqual(15);
    expect(batch.summary.selectedCount).toBeLessThanOrEqual(20);
    expect(new Set(batch.cases.map((item) => item.id)).size).toBe(batch.cases.length);
    expect(batch.cases.every((item) => item.priority === 'P0')).toBe(true);
    expect(batch.cases.every((item) => item.reviewStatus === 'pending-human-review')).toBe(true);
    expect(batch.selectionPolicy.guardrails.recipesGenerated).toBe(false);
    for (const family of productCenterItemCoreScenarioFamilies) {
      expect(batch.summary.familyCoverage[family]).toBeGreaterThanOrEqual(
        productCenterItemCoreFamilyMinimums[family],
      );
    }
  });

  test('应排除诊断失败与废弃用例并保留可审计来源', async () => {
    const markdown = fs.readFileSync(sourcePath, 'utf8');
    const diagnostic = diagnoseProductCenterMarkdownTestPlan(markdown);
    const invalidIds = new Set(diagnostic.issues.flatMap((item) => item.caseId ? [item.caseId] : []));
    const batch = buildProductCenterItemCoreReviewBatch({ markdown, sourcePath: 'formal-plan.md' });

    expect(batch.cases.every((item) => !invalidIds.has(item.id))).toBe(true);
    expect(batch.cases.every((item) => !/已废弃|deprecated/i.test(item.title))).toBe(true);
    expect(batch.cases.every((item) => item.sourceCitations.some((source) =>
      ['prd-explicit', 'business-rule-explicit', 'xmind-existing'].includes(source.kind)))).toBe(true);
    expect(batch.cases.every((item) => item.riskReasons.length >= 3)).toBe(true);
  });

  test('首批应包含创建、规则、查询、编辑、生命周期和套餐代表用例', async () => {
    const batch = buildProductCenterItemCoreReviewBatch({
      markdown: fs.readFileSync(sourcePath, 'utf8'),
      sourcePath: 'formal-plan.md',
    });
    const selectedIds = new Set(batch.cases.map((item) => item.id));
    const requiredRepresentativeIds = [
      'TC-ITEM-STD-005',
      'TC-ITEM-STD-010',
      'TC-ITEM-STD-016',
      'TC-ITEM-STD-018',
      'TC-ITEM-STD-021',
      'TC-ITEM-STD-028',
      'TC-ITEM-STD-029',
      'TC-ITEM-STD-031',
      'TC-ITEM-STD-044',
      'TC-ITEM-STD-066',
      'TC-ITEM-STD-068',
      'TC-ITEM-PKG-002',
      'TC-ITEM-PKG-004',
      'TC-ITEM-PKG-006',
    ];

    expect(requiredRepresentativeIds.filter((caseId) => !selectedIds.has(caseId))).toEqual([]);
  });

  test('生成产物应与当前来源指纹一致且不包含 Recipe', async () => {
    const artifactPath = path.join(
      projectRoot,
      'contracts/product-center/test-cases/canonical/product-center-item-core-review-batch.json',
    );
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as ReturnType<
      typeof buildProductCenterItemCoreReviewBatch
    >;
    const rebuilt = buildProductCenterItemCoreReviewBatch({
      markdown: fs.readFileSync(sourcePath, 'utf8'),
      sourcePath: artifact.sourcePlan.path,
      generatedAt: artifact.generatedAt,
    });

    expect(artifact.fingerprint).toBe(rebuilt.fingerprint);
    expect(artifact.cases.map((item) => item.id)).toEqual(rebuilt.cases.map((item) => item.id));
    expect(JSON.stringify(artifact)).not.toContain('navigation.sidebar.open');
  });
});
