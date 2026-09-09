import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterItemAutomationFastLaneArtifacts } from '../../scripts/build-product-center-item-automation-fast-lane';

test.describe('商品中心未生成用例自动化快车道', () => {
  test('136 条应分流且人工只审核规则决策组', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const { document } = buildProductCenterItemAutomationFastLaneArtifacts({
      projectRoot,
      generatedAt: '2026-07-31T12:30:00.000Z',
    });
    const allIds = [
      ...document.automaticTechnicalPipeline.caseIds,
      ...document.manualRuleReview.caseIds,
      ...document.productDefectQueue.caseIds,
      ...document.environmentBlocked.caseIds,
    ];

    expect(document).toMatchObject({
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-automation-fast-lane',
      status: 'ready',
      summary: {
        excludedFromAccurateRelease: 136,
        automaticTechnicalPipeline: 120,
        manualRuleReview: 9,
        productDefectQueue: 6,
        environmentBlocked: 1,
        staticSemanticReReviewRequired: 0,
        manualRuleReviewGroups: 6,
      },
      policy: {
        reviewByTemplateNotCase: true,
        fullReviewApprovalReused: true,
        runtimeEvidenceReusedBySharedChain: true,
        runtimeEvidenceInheritanceRequiresIdenticalShape: true,
        runtimeEvidenceInheritanceAllowed: false,
        caseLevelEvidenceRequired: true,
        sharedChainSetupReuseAllowed: true,
        greenHumanReviewRequired: false,
        yellowReviewScope: 'all-cases-in-shared-chain',
        redCasesMayGenerateAutomation: false,
      },
    });
    expect(allIds).toHaveLength(136);
    expect(new Set(allIds).size).toBe(136);
    expect(document.automaticTechnicalPipeline.caseIds).toHaveLength(120);
    expect(document.automaticTechnicalPipeline.groups.length).toBeLessThan(120);
    expect(document.automaticTechnicalPipeline.groups.every((group: any) => (
      group.caseIds.length > 0
      && group.representativeCaseId
      && Object.keys(group.evidenceShapes).length === group.caseIds.length
      && group.fullReviewApproved
      && ['green', 'yellow'].includes(group.lane)
      && (group.lane === 'green' ? group.humanReviewRequired === false : group.sampleReviewCount === group.caseIds.length)
    ))).toBe(true);
    const groupContainingColumnConfig = document.automaticTechnicalPipeline.groups.find((group: any) => (
      group.caseIds.includes('TC-ITEM-STD-003')
    ));
    expect(groupContainingColumnConfig?.operation).toBe('update');
    expect(groupContainingColumnConfig?.riskLevel).toBe('L2');
    expect(document.manualRuleReview.caseIds.slice().sort()).toEqual([
      'TC-ITEM-ADD-001', 'TC-ITEM-ADD-015', 'TC-ITEM-PKG-013', 'TC-ITEM-PKG-019',
      'TC-ITEM-STD-007', 'TC-ITEM-STD-011', 'TC-ITEM-STD-012', 'TC-ITEM-STD-013', 'TC-ITEM-STD-014',
    ]);
    expect(document.productDefectQueue.caseIds.slice().sort()).toEqual([
      'TC-ITEM-ADD-010', 'TC-ITEM-ADD-024', 'TC-ITEM-PKG-035',
      'TC-ITEM-STD-021', 'TC-ITEM-STD-023', 'TC-ITEM-STD-081',
    ]);
    expect(document.environmentBlocked.caseIds).toEqual(['TC-ITEM-STD-080']);
    expect(document.manualRuleReview.groups).toHaveLength(6);
    expect(document.manualRuleReview.groups.every((group: any) => group.caseIds.length > 0)).toBe(true);
  });

  test('快车道产物应可重复构建且包含 Markdown 汇总', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const paths = buildProductCenterItemAutomationFastLaneArtifacts({ projectRoot });
    expect(fs.existsSync(paths.jsonPath)).toBe(true);
    expect(fs.existsSync(paths.markdownPath)).toBe(true);
    const markdown = fs.readFileSync(paths.markdownPath, 'utf8');
    expect(markdown).toContain('人工规则审核：9 条 / 6 组');
    expect(markdown).toContain('静态语义重新审核：0 条');
    expect(markdown).toContain('每条用例独立断言和留证');
  });
});
