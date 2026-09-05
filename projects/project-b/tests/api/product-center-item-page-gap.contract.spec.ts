import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  parseProductCenterXmindItemPlan,
} from '../../utils/product-center-canonical-item-test-plan';
import {
  buildProductCenterItemPageGapReport,
} from '../../utils/product-center-item-page-gap';
import {
  buildProductCenterItemPageGapArtifacts,
  productCenterItemPageObservation20260730,
} from '../../scripts/build-product-center-item-page-gap';
import fs from 'node:fs';

test.describe('商品页面能力差距合同', () => {
  test('应去重 XMind 不完整叶子并输出页面补充候选', async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'product-center-item-page-gap-'));
    try {
      const artifacts = buildProductCenterItemPageGapArtifacts({
        outputRoot,
        generatedAt: '2026-07-30T00:00:00.000Z',
      });
      const report = JSON.parse(await readFile(artifacts.reportPath, 'utf8')) as {
        fingerprint: string;
        summary: Record<string, number>;
        capabilities: Array<{ disposition: string; supplementCaseId?: string }>;
        supplementCases: Array<{
          id: string;
          status: string;
          generationAllowed: boolean;
          capabilityIds: string[];
        }>;
        conflicts: Array<{
          formalCaseIds: string[];
          disposition: string;
          generationAllowed: boolean;
        }>;
      };
      expect(report.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(report.summary).toEqual({
        formalCases: 216,
        structurallyValidFormalCases: 153,
        invalidFormalCases: 63,
        observedCapabilities: 26,
        coveredCapabilities: 18,
        supplementRequiredCapabilities: 8,
        conflictCapabilities: 0,
        supplementCases: 8,
        xmindBlockedLeaves: 39,
        xmindTemplateLeaves: 1,
        xmindAlreadyCoveredLeaves: 38,
        xmindStructureRepairableLeaves: 0,
        xmindBusinessSourceRequiredLeaves: 0,
      });
      expect(report.capabilities.filter((item) => item.disposition === 'supplement-required'))
        .toHaveLength(8);
      expect(report.supplementCases).toHaveLength(8);
      expect(report.supplementCases.every((item) =>
        item.status === 'review-required'
        && item.generationAllowed === false
        && item.capabilityIds[0] === 'navigation.sidebar.open')).toBe(true);
      expect(report.conflicts).toEqual([]);
      const markdown = await readFile(artifacts.markdownPath, 'utf8');
      expect(markdown).toContain('TC-ITEM-UI-003');
      expect(markdown).toContain('复制商品时打印档口信息随商品复制');
      expect(markdown).not.toContain('PAGE-RULE-CONFLICT-COMBO-OPTIONAL-001');
      expect(markdown).toContain('新增可选搭配字段、规则与组卡片边界');
      expect(markdown).not.toMatch(/\d+\.\s+\d+\./);
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  test('页面证据不得授权保存成功等业务结果', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info');
    const formalMarkdown = fs.readFileSync(path.join(
      infoRoot,
      '00-待转换测试方案',
      '用例库',
      '商品中心-商品管理-商品',
      '1.商品中心-商品管理-商品-正式测试用例.md',
    ), 'utf8');
    const xmindPlan = parseProductCenterXmindItemPlan(fs.readFileSync(path.join(
      infoRoot,
      '00-待转换测试方案',
      '用例库',
      '商品中心-商品管理-商品',
      '1.商品中心-商品管理-商品.xmind',
    )));
    const observation = structuredClone(productCenterItemPageObservation20260730);
    observation.supplementCases[0].expectedResults = ['导入记录保存成功。'];

    expect(() => buildProductCenterItemPageGapReport({
      formalMarkdown,
      xmindPlan,
      observation,
      generatedAt: '2026-07-30T00:00:00.000Z',
    })).toThrow(/TC-ITEM-UI-001:BUSINESS_AUTHORITY_REQUIRED/);
  });

  test('重新截取的创建页截图必须不是权限加载态占位图', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const screenshotRoot = path.join(
      projectRoot,
      'output/page-audit/product-center-item-2026-07-30',
    );
    const standard = await stat(path.join(screenshotRoot, 'item-create-standard.png'));
    const combo = await stat(path.join(screenshotRoot, 'item-create-combo.png'));

    expect(standard.size).toBeGreaterThan(30_000);
    expect(combo.size).toBeGreaterThan(30_000);
    expect(standard.size).not.toBe(combo.size);
  });
});
