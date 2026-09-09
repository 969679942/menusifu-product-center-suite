import { expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildProductCenterCategoryTestPlanPilotArtifacts } from '../../scripts/build-product-center-category-test-plan-pilot';
import { parseProductCenterMarkdownTestCase } from '../../utils/product-center-test-plan-markdown';

const sourcePath = path.resolve(
  '..',
  'Merchant Center Info',
  'PRD与对应测试用例',
  '1.需求品牌商品与分类-测试用例.md',
);

test.describe('商品中心真实测试方案入口试点', () => {
  test('应从真实 Markdown 测试方案精确解析分类阻断用例', async () => {
    const markdown = await readFile(sourcePath, 'utf8');
    const parsed = parseProductCenterMarkdownTestCase(markdown, 'TC-需求1-150');

    expect(parsed).toEqual({
      id: 'TC-需求1-150',
      title: '分类下已有商品时不可继续新增子分类',
      module: '商品管理 → 商品分类',
      priority: 'P1',
      sourceCitations: [
        {
          kind: 'prd-explicit',
          citation: '5.1.1 品牌商品 / 商品分类 3',
        },
        {
          kind: 'xmind-existing',
          citation: '标准商品 / 新增 / 分类相关校验 / 一级分类下有商品，不可创建二级分类',
        },
      ],
      preconditions: ['一级分类 A 下已存在商品。'],
      actions: [
        '进入 品牌商品 → 分类 页面。',
        '在一级分类 A 下点击新增子分类。',
        '输入二级分类名称并尝试保存。',
      ],
      expectedResults: [
        '不可成功新增二级分类。',
        '一级分类 A 下不新增子分类数据。',
      ],
    });
  });

  test('真实方案试点应通过来源与生成门禁并映射现有能力', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'product-center-test-plan-pilot-'));
    try {
      const result = await buildProductCenterCategoryTestPlanPilotArtifacts(rootDir);
      const report = JSON.parse(await readFile(result.reportPath, 'utf8'));
      const document = JSON.parse(await readFile(result.inputPath, 'utf8'));
      const recipe = JSON.parse(await readFile(result.recipePath, 'utf8'));

      expect(report.status).toBe('passed');
      expect(report.sourceArtifacts).toHaveLength(3);
      expect(report.sourceArtifacts.every((item: { fingerprint: string }) =>
        /^[a-f0-9]{64}$/.test(item.fingerprint))).toBe(true);
      expect(report.sourceCitationVerifications).toEqual([
        expect.objectContaining({
          kind: 'prd-explicit',
          verified: true,
          matchedLocation: 'S04 分类#3',
        }),
        expect.objectContaining({
          kind: 'xmind-existing',
          verified: true,
          matchedLocation: expect.stringContaining('一级分类下有商品，不可创建二级分类'),
        }),
      ]);
      expect(report.generationGate.summary).toEqual({
        totalCases: 1,
        generated: 1,
        reviewRequired: 0,
        blocked: 0,
        intentionallyOmitted: 0,
      });
      expect(report.generationGate.generated).toEqual([
        expect.objectContaining({
          caseId: 'negative:category-child-blocked-by-product',
          businessBasisKinds: ['prd-explicit', 'xmind-existing'],
        }),
      ]);
      expect(report.normalizedCases[0].execution.capabilityIds).toEqual([
        'navigation.sidebar.open',
        'category.attemptAddChildBlockedByProduct',
      ]);
      expect(report.normalizedCases[0].claims.every((claim: {
        sourceTrace?: {
          businessBasis?: { refs?: string[] };
          executionEvidence?: Array<{ kind?: string; sourceIds?: string[] }>;
        };
      }) => claim.sourceTrace?.businessBasis?.refs?.some((ref) => ref.includes('TC-需求1-150'))
        && claim.sourceTrace.executionEvidence?.every((evidence) =>
          evidence.kind === 'contract-observed' && evidence.sourceIds?.length))).toBe(true);
      expect(document.cases[0].sourceRefs).toContain(
        'TEST-PLAN:1.需求品牌商品与分类-测试用例.md#TC-需求1-150',
      );
      expect(recipe).toMatchObject({
        caseId: 'negative:category-child-blocked-by-product',
        claimIds: document.cases[0].claims.map((claim: { id: string }) => claim.id),
        capabilities: [
          { id: 'navigation.sidebar.open' },
          { id: 'category.attemptAddChildBlockedByProduct' },
        ],
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
