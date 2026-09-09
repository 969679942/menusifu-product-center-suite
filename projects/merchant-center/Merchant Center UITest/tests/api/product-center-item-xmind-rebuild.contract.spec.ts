import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { expect, test } from '@playwright/test';
import { buildProductCenterItemXmindRebuildArtifacts } from '../../scripts/build-product-center-item-xmind-rebuild';
import {
  validateProductCenterItemRebuiltXmind,
  type ProductCenterItemXmindRebuildPlan,
} from '../../utils/product-center-item-xmind-rebuild';

test.describe('商品 XMind 全量重建试点合同', () => {
  test('应从正式方案全量重建风险优先且可审计的 XMind', async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'product-center-item-xmind-rebuild-'));
    const projectRoot = path.resolve(__dirname, '../..');
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
      const artifacts = buildProductCenterItemXmindRebuildArtifacts({
        projectRoot,
        outputRoot,
        generatedAt: '2026-07-30T00:00:00.000Z',
      });
      const plan = JSON.parse(await readFile(artifacts.planPath, 'utf8')) as ProductCenterItemXmindRebuildPlan;
      const xmind = await readFile(artifacts.xmindPath);

      expect(plan.summary).toEqual({
        originalXmindLeaves: 48,
        originalXmindCompleteChains: 9,
        formalCases: 216,
        structurallyValidFormalCases: 153,
        structurallyInvalidFormalCases: 63,
        productCorrectedCases: 13,
        expertCorrectedSourceCases: 54,
        evidencePromotedCases: 14,
        reviewSplitCases: 8,
        sourceNormalizedCases: 52,
        structureNormalizedCases: 0,
        pageSupplementCases: 8,
        rebuiltCases: 232,
        pendingFullReview: 229,
        reviewRequired: 0,
        deprecated: 3,
        p0: 105,
        p1: 122,
        p2: 5,
      });
      expect(validateProductCenterItemRebuiltXmind(xmind, 232)).toEqual([]);
      expect(plan.guardrails).toEqual({
        originalXmindOverwritten: false,
        pageEvidenceMayDefineBusinessRule: false,
        reviewRequiredMayGenerateRecipe: false,
        fullReviewRequiredBeforeTechnicalBinding: true,
        riskFirstOrdering: true,
      });
      expect(plan.cases.filter((item) => item.origin === 'page-supplement'))
        .toHaveLength(8);
      expect(plan.cases.filter((item) => item.origin === 'page-supplement')
        .every((item) => item.status === 'pending-full-review'
          && item.diagnostics.includes('PAGE_CAPABILITY_EXPERT_REVIEWED'))).toBe(true);
      expect(plan.cases.find((item) => item.id === 'TC-ITEM-STD-036')).toMatchObject({
        status: 'pending-full-review',
        changeType: 'expert-reviewed-corrected',
        source: '业务规则明确 ← BR-ITEM-028 / BR-ITEM-022 / BR-ITEM-027',
      });
      expect(plan.cases.find((item) => item.id === 'TC-ITEM-PKG-059')).toMatchObject({
        status: 'pending-full-review',
        changeType: 'product-corrected',
        source: expect.stringContaining('BR-ITEM-COMBO-OPTIONAL-EDIT-BOUNDARY'),
        expectedResults: expect.arrayContaining([
          expect.stringContaining('不提供商品单项移除入口'),
        ]),
      });
      expect(plan.cases.find((item) => item.id === 'TC-ITEM-PKG-046')).toMatchObject({
        status: 'pending-full-review',
        changeType: 'product-corrected',
        source: expect.stringContaining('BR-ITEM-COMBO-GROUP-REQUIRED'),
        expectedResults: expect.arrayContaining([
          expect.stringContaining('BITEM-6003：套餐中未找到区块'),
        ]),
      });
      expect(plan.cases.find((item) => item.id === 'TC-ITEM-STD-002')).toMatchObject({
        changeType: 'product-corrected',
        title: '商品列表展示当前筛选、核心字段和分页入口',
      });
      expect(plan.cases.find((item) => item.id === 'TC-ITEM-STD-067')).toMatchObject({
        changeType: 'product-corrected',
        expectedResults: expect.arrayContaining([expect.stringContaining('BITEM-2013')]),
      });
      expect(plan.cases.find((item) => item.id === 'TC-ITEM-PKG-073')).toMatchObject({
        changeType: 'product-corrected',
        expectedResults: expect.arrayContaining([expect.stringContaining('套餐分组')]),
      });
      expect(plan.diff.evidencePromotedCaseIds).toHaveLength(14);
      expect(plan.diff.productDecisionCaseIds).toEqual([]);
      expect(plan.diff.sourceReviewCaseIds).toEqual([]);
      expect(await readFile(originalXmindPath).then(sha256)).toBe(originalHash);
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  test('套餐旧三字段规则不得进入重建后的正式用例正文', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const planPath = path.join(
      projectRoot,
      'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json',
    );
    const plan = JSON.parse(await readFile(planPath, 'utf8')) as ProductCenterItemXmindRebuildPlan;
    const corrected = plan.cases.filter((item) =>
      item.id === 'TC-ITEM-PKG-057' || item.id === 'TC-ITEM-PKG-058');

    expect(corrected).toHaveLength(2);
    expect(corrected.every((item) => item.changeType === 'product-corrected')).toBe(true);
    expect(corrected.map((item) => [item.title, ...item.actions, ...item.expectedResults].join(' ')).join(' '))
      .not.toMatch(/最少选择份数|最多选择份数|份数内免费/);
    expect(corrected[0].expectedResults).toContain('商品规则展示必填选择数量和当前两个商品规则开关');
  });

  test('重建 XMind 顶层应按风险和审核状态组织且每条用例只出现一次', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const xmindPath = path.resolve(
      projectRoot,
      'contracts',
      'product-center',
      'test-cases',
      'canonical',
      'product-center-item-xmind-rebuild-pilot.xmind',
    );
    const zip = new AdmZip(await readFile(xmindPath));
    const sheets = JSON.parse(zip.readAsText('content.json')) as Array<{
      rootTopic: Topic;
    }>;
    const topics: Topic[] = [];
    walk(sheets[0].rootTopic, topics);
    const caseTopics = topics.filter((item) => /^\[(?:P0|P1|P2)\] TC-/.test(item.title));

    expect(sheets[0].rootTopic.children?.attached.map((item) => item.title)).toEqual([
      'P0 核心必测',
      'P1 重要分支',
      'P2 补充覆盖',
      '已废弃',
    ]);
    expect(caseTopics).toHaveLength(232);
    expect(new Set(caseTopics.map((item) => item.title.match(/TC-[A-Z0-9-]+/)?.[0])).size).toBe(232);
    expect(topics.length).toBeGreaterThan(caseTopics.length * 8);
    expect(new Set(topics.map((item) => item.id)).size).toBe(topics.length);
  });
});

type Topic = {
  id: string;
  title: string;
  children?: { attached: Topic[] };
};

function walk(item: Topic, target: Topic[]): void {
  target.push(item);
  for (const child of item.children?.attached ?? []) walk(child, target);
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
