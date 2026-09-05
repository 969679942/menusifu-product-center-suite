import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProductCenterItemSourceCoverageArtifacts } from '../../scripts/build-product-center-item-source-coverage';
import {
  buildProductCenterItemSourceCoverage,
  validateProductCenterItemSourceCoverage,
} from '../../utils/product-center-item-source-coverage';
import { parseProductCenterXmindItemPlan } from '../../utils/product-center-canonical-item-test-plan';

const projectRoot = path.resolve(__dirname, '../..');

test.describe('商品多源覆盖分母与遗漏识别', () => {
  test('应区分已有 Probe、可复核结构缺口和缺少执行链的 blocked', async () => {
    const xmindPath = path.resolve(
      projectRoot,
      '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品.xmind',
    );
    const plan = parseProductCenterXmindItemPlan(fs.readFileSync(xmindPath));
    const coverage = buildProductCenterItemSourceCoverage({
      plan,
      canonicalCaseIds: [
        'TC-ITEM-STD-006',
        'TC-ITEM-STD-007',
        'TC-ITEM-STD-011',
        'TC-ITEM-STD-012',
        'TC-ITEM-STD-013',
        'TC-ITEM-STD-014',
        'TC-ITEM-STD-025',
        'TC-ITEM-STD-026',
        'TC-ITEM-STD-027',
      ],
      prdText: [
        '## S01 商品列表页',
        '## S02 商品新增编辑页',
        '## S03 规则互斥',
        '## S04 分类',
      ].join('\n'),
      pageRoutes: [
        { id: 'route:item-list', route: '/pp/brand/list', verified: true },
        { id: 'route:item-category', route: '/pp/brand/category', verified: true },
      ],
      bindings: [
        binding('S01', '## S01 商品列表页', '/pp/brand/list', [['商品中心-商品管理测试用例', '标准商品', '展示']]),
        binding('S02', '## S02 商品新增编辑页', '/pp/brand/list', [['商品中心-商品管理测试用例', '标准商品', '新增']]),
        binding('S03', '## S03 规则互斥', '/pp/brand/list', []),
        binding('S04', '## S04 分类', '/pp/brand/category', [[
          '商品中心-商品管理测试用例',
          '标准商品',
          '新增',
          '分类相关校验（一级分类下有商品不可建二级分类/有二级分类不可建标准商品）',
          '一级分类下有商品，不可创建二级分类',
        ]]),
      ],
    });

    expect(validateProductCenterItemSourceCoverage(coverage)).toEqual([]);
    expect(coverage.summary).toMatchObject({
      xmindLeaves: 48,
      canonicalCases: 9,
      probeCases: 9,
      acceptanceCases: 0,
      blockedXmindNodes: 39,
      prdSections: 4,
      probeSections: 1,
      reviewRequiredSections: 1,
      blockedSections: 2,
      scenarioFamilies: 4,
      probeFamilies: 1,
      reviewRequiredFamilies: 1,
      blockedFamilies: 2,
      freshPageRoutes: 2,
    });
    expect(coverage.sections.map((item) => [item.sectionId, item.disposition])).toEqual([
      ['S01', 'review-required'],
      ['S02', 'probe'],
      ['S03', 'blocked'],
      ['S04', 'blocked'],
    ]);
    expect(coverage.sections.flatMap((item) => item.families)
      .map((item) => [item.familyId, item.disposition])).toEqual([
        ['S01-1', 'review-required'],
        ['S02-1', 'probe'],
        ['S03-source-only', 'blocked'],
        ['S04-1', 'blocked'],
      ]);
    expect(coverage.sections.every((item) => (
      item.sourceRole === 'prd-functional-scope'
      && item.generationAllowed === false
      && !('expectedResult' in item)
      && item.pageEvidence.every((evidence) => evidence.businessAssertionEligible === false)
    ))).toBe(true);
  });

  test('真实试验应输出可追溯覆盖报告且不产生第二份业务用例', async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-source-coverage-'));
    try {
      const result = buildProductCenterItemSourceCoverageArtifacts({
        projectRoot,
        outputRoot,
        now: '2026-07-29T10:00:00.000Z',
        currentReleaseProbe: {
          release: {
            observedAt: '2026-07-29T09:30:00.000Z',
            applicationFingerprint: 'a'.repeat(64),
          },
          routes: [
            liveRoute('live:item-list', '/pp/brand/list'),
            liveRoute('live:item-category', '/pp/brand/category'),
          ],
        },
      });
      const report = JSON.parse(fs.readFileSync(result.reportPath, 'utf8'));

      expect(report.status).toBe('review-required');
      expect(report.summary).toMatchObject({
        canonicalCases: 9,
        probeCases: 9,
        acceptanceCases: 0,
        blockedXmindNodes: 39,
        prdSections: 4,
        scenarioFamilies: 8,
        probeFamilies: 1,
        reviewRequiredFamilies: 1,
        blockedFamilies: 6,
        freshPageRoutes: 2,
      });
      expect(report.sources.currentReleaseProbe.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(report.sections.flatMap((item: any) => item.pageEvidence).every((item: any) => (
        item.verified === true
        && item.releaseFingerprint === 'a'.repeat(64)
      ))).toBe(true);
      expect(report.sections.find((item: any) => item.sectionId === 'S02').families)
        .toHaveLength(4);
      expect(report.guardrails).toMatchObject({
        testPlanIsScenarioSkeleton: true,
        prdMayDefineFunctionalScope: true,
        legacyRuleMayAuthorizeAcceptance: false,
        pageFactMayInferBusinessRule: false,
        automationCodeMayInferBusinessRule: false,
        gapMayGenerateBusinessExpectation: false,
        canonicalBusinessMarkdownCount: 1,
      });
      expect(report.safety).toEqual({ sensitiveFindings: 0, authStateArtifacts: 0 });
      expect(fs.existsSync(path.join(
        outputRoot,
        'contracts/product-center/test-cases/canonical/product-center-item-canonical.md',
      ))).toBe(false);
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });
});

function binding(
  sectionId: string,
  sectionHeading: string,
  route: string,
  xmindPathPrefixes: string[][],
) {
  return {
    sectionId,
    sectionHeading,
    sourceRole: 'prd-functional-scope' as const,
    route,
    xmindPathPrefixes,
  };
}

function liveRoute(id: string, route: string) {
  return {
    route,
    capabilityIds: ['navigation.sidebar.open'],
    navigation: { targetPath: route, arrivedPath: route, verifiedPaths: [route] },
    release: {
      observedAt: '2026-07-29T09:30:00.000Z',
      applicationFingerprint: 'a'.repeat(64),
    },
    evidenceId: id,
  };
}
