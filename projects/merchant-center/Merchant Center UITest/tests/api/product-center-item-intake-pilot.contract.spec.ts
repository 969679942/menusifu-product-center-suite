import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildRecipeFeedback } from '../../automation/recipe/recipe-feedback';
import { buildProductCenterItemIntakePilotArtifacts } from '../../scripts/build-product-center-item-intake-pilot';
import {
  buildProductCenterItemIntakePilot,
  type ProductCenterItemIntakePilotSource,
} from '../../utils/product-center-item-intake-pilot';

const source: ProductCenterItemIntakePilotSource = {
  fileName: '商品-正式测试用例.md',
  markdown: `# 商品管理

### 用例编号：TC-ITEM-STD-001

用例标题：标准商品创建页展示正确

所属模块：商品管理 → 商品 → 标准商品

优先级：P0

来源：PRD明确 ← 5.1.1

前置条件：
1. 已登录商品中心。
2. 已进入商品列表页。

测试步骤：
1. 点击「新增商品」。
2. 选择「标准商品」。

预期结果：
1. 进入标准商品创建页。
2. 页面展示基础信息区域。

### 用例编号：TC-ITEM-STD-002

用例标题：商品列表页面展示正确

所属模块：商品管理 → 商品 → 标准商品

优先级：P0

来源：XMind已有 ← 商品列表

前置条件：
1. 已登录商品中心。

测试步骤：
1. 打开商品列表页。

预期结果：
1. 商品列表展示数据。
`,
  selectedCaseIds: ['TC-ITEM-STD-001', 'TC-ITEM-STD-002'],
  sourceBindings: {
    'TEST-SCHEME:商品-正式测试用例.md#TC-ITEM-STD-001': [
      'route:cc612d39a954',
      '/pp/brand/list#control-1',
    ],
    'TEST-SCHEME:商品-正式测试用例.md#TC-ITEM-STD-002': [
      'route:cc612d39a954',
      '/pp/brand/list#control-2',
    ],
  },
  sourceIds: new Set([
    'route:cc612d39a954',
    '/pp/brand/list#control-1',
    '/pp/brand/list#control-2',
  ]),
  capabilityByCaseId: new Map([
    ['TC-ITEM-STD-001', { capabilityIds: ['item.create'], automationPreference: 'manual' }],
    ['TC-ITEM-STD-002', { capabilityIds: ['item.list'], automationPreference: 'manual' }],
  ]),
};

test.describe('商品管理测试方案接入试点合同', () => {
  test('应将正式用例抽取为保留原步骤和来源的结构化草稿', async () => {
    const result = buildProductCenterItemIntakePilot(source);

    expect(result.cases).toHaveLength(2);
    expect(result.cases[0]).toMatchObject({
      id: 'TC-ITEM-STD-001',
      title: '标准商品创建页展示正确',
      priority: 'P0',
      preconditions: ['已登录商品中心', '已进入商品列表页'],
      actions: ['点击「新增商品」', '选择「标准商品」'],
      expectedResults: ['进入标准商品创建页', '页面展示基础信息区域'],
      sourceRefs: ['TEST-SCHEME:商品-正式测试用例.md#TC-ITEM-STD-001'],
      sourceIds: ['route:cc612d39a954', '/pp/brand/list#control-1'],
    });
    expect(result.cases[0].claims).toHaveLength(6);
    expect(result.cases[0].execution?.capabilityIds).toEqual(['item.create']);
  });

  test('缺失来源绑定或能力声明时必须保留缺口而不是猜测', async () => {
    const broken = structuredClone(source);
    const capabilityByCaseId = new Map(broken.capabilityByCaseId);
    delete broken.sourceBindings['TEST-SCHEME:商品-正式测试用例.md#TC-ITEM-STD-002'];
    capabilityByCaseId.delete('TC-ITEM-STD-002');
    broken.capabilityByCaseId = capabilityByCaseId;

    const result = buildProductCenterItemIntakePilot(broken);

    expect(result.unresolved).toEqual([{
      caseId: 'TC-ITEM-STD-002',
      reason: 'MISSING_SOURCE_BINDING',
    }]);
    expect(result.cases[1]).toMatchObject({
      id: 'TC-ITEM-STD-002',
      sourceRefs: ['TEST-SCHEME:商品-正式测试用例.md#TC-ITEM-STD-002'],
      automationPreference: 'manual',
      execution: { capabilityIds: [], verificationSignals: ['ui'] },
    });
  });

  test('真实商品用例批次应完整绑定来源并准确阻断未治理脚本', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'product-center-item-intake-'));
    const sourcePath = path.resolve(
      '..',
      'Merchant Center Info',
      '00-待转换测试方案',
      '用例库',
      '商品中心-商品管理-商品',
      '1.商品中心-商品管理-商品-正式测试用例.md',
    );
    try {
      const artifacts = await buildProductCenterItemIntakePilotArtifacts(rootDir, sourcePath);
      const report = JSON.parse(await readFile(artifacts.reportPath, 'utf8')) as {
        status: string;
        summary: Record<string, number>;
        semanticAudit: { summary: Record<string, number> };
        capabilityGaps: Array<{ caseId: string; disposition: string; reason: string }>;
        promotionGates: Array<{
          caseId: string;
          compileCandidate: boolean;
          runtimeAccepted: boolean;
          issues: Array<{ code: string }>;
        }>;
        sourceQualityExclusions: Array<{ caseId: string; replacementCaseId: string; reason: string }>;
      };
      const recipes = JSON.parse(await readFile(artifacts.recipesPath, 'utf8')) as {
        fingerprint: string;
        recipes: Array<{
          caseId: string;
          action: string;
          claimIds?: string[];
          capabilities: Array<{ id: string }>;
          assertions: Array<{ adapterId: string }>;
        }>;
      };

      expect(report.status).toBe('passed-with-capability-gaps');
      expect(report.summary).toEqual({
        total: 15,
        sourceBound: 15,
        semanticPassed: 15,
        exactExistingScripts: 5,
        partialExistingScripts: 2,
        missingExistingScripts: 8,
        compileCandidates: 1,
        runtimeAccepted: 0,
        generatedRecipes: 1,
        promotable: 0,
        excludedMalformedSourceCases: 1,
      });
      expect(report.sourceQualityExclusions).toEqual([{
        caseId: 'TC-ITEM-STD-001',
        replacementCaseId: 'TC-ITEM-STD-002',
        reason: '步骤和预期包含重复编号拼接，禁止自动猜测改写',
      }]);
      expect(report.capabilityGaps).toHaveLength(14);
      expect(report.capabilityGaps.every((item) => item.disposition === 'review-required')).toBe(true);
      expect(report.capabilityGaps.find((item) => item.caseId === 'TC-ITEM-STD-002')?.reason)
        .toContain('创建时间排序缺少可见字段或 API createdAt 语义映射');
      expect(report.promotionGates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          caseId: 'TC-ITEM-STD-002',
          compileCandidate: false,
          runtimeAccepted: false,
          issues: expect.arrayContaining([
            expect.objectContaining({ code: 'EXPECTATION_EVIDENCE_REQUIRED' }),
          ]),
        }),
        expect.objectContaining({
          caseId: 'TC-ITEM-STD-005',
          compileCandidate: true,
          runtimeAccepted: false,
          issues: [],
        }),
      ]));
      expect(recipes.recipes).toEqual([expect.objectContaining({
        caseId: 'TC-ITEM-STD-005',
        action: 'negative',
        capabilities: [
          {
            id: 'navigation.sidebar.open',
            saveAs: 'navigation',
            input: { targetPath: '/pp/brand/list' },
          },
          { id: 'item.validateRequiredName', saveAs: 'validation' },
        ],
        assertions: [
          expect.objectContaining({ adapterId: 'productCenter.verifyItemRequiredValidationUi' }),
          expect.objectContaining({ adapterId: 'productCenter.verifyItemNotCreated' }),
        ],
      })]);
      expect(recipes.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(await readFile(artifacts.specPath, 'utf8')).toContain('flow.execute(recipe)');

      const feedbackPath = path.join(
        rootDir,
        'output/recipes/product-center-item-intake-pilot-feedback.json',
      );
      const evidencePath = path.join(
        rootDir,
        'output/recipes/product-center-item-intake-pilot-evidence.json',
      );
      await mkdir(path.dirname(feedbackPath), { recursive: true });
      await writeFile(feedbackPath, `${JSON.stringify(buildRecipeFeedback(recipes.fingerprint, [{
        recipeId: 'product-center:item-required-name:negative',
        caseId: 'TC-ITEM-STD-005',
        title: '标准商品必填项缺失时创建失败',
        status: 'passed',
        durationMs: 100,
      }]), null, 2)}
`, 'utf8');
      await writeFile(evidencePath, `${JSON.stringify({
        schemaVersion: '1.0.0',
        fingerprint: recipes.fingerprint,
        generatedAt: '2026-07-25T00:00:00.000Z',
        entries: [{
          recipeId: 'product-center:item-required-name:negative',
          caseId: 'TC-ITEM-STD-005',
          expectedClaimIds: recipes.recipes[0].claimIds ?? [],
          verifiedClaimIds: recipes.recipes[0].claimIds ?? [],
          claimCoverageComplete: true,
          sidebarEntryVerified: true,
        }],
      }, null, 2)}
`, 'utf8');
      const acceptedArtifacts = await buildProductCenterItemIntakePilotArtifacts(rootDir, sourcePath);
      const acceptedReport = JSON.parse(await readFile(acceptedArtifacts.reportPath, 'utf8')) as {
        summary: { runtimeAccepted: number; promotable: number };
        promotionGates: Array<{ caseId: string; runtimeAccepted: boolean }>;
      };
      expect(acceptedReport.summary.runtimeAccepted).toBe(1);
      expect(acceptedReport.summary.promotable).toBe(1);
      expect(acceptedReport.promotionGates.find((item) => item.caseId === 'TC-ITEM-STD-005')?.runtimeAccepted)
        .toBe(true);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});




