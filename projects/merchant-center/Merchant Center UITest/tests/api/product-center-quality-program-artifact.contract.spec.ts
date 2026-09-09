import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterQualityProgramArtifacts } from '../../scripts/build-product-center-quality-program';

test.describe('商品中心质量改进统一产物', () => {
  test('应基于真实来源和运行产物生成十项治理结果', async () => {
    const outputRoot = await mkdtemp(path.join(tmpdir(), 'product-center-quality-program-'));
    try {
      const paths = await buildProductCenterQualityProgramArtifacts({
        projectRoot: path.resolve(__dirname, '../..'),
        sourceRoot: path.resolve(__dirname, '../../../Merchant Center Info/00-待转换测试方案/已完成'),
        outputRoot,
      });
      const report = JSON.parse(await readFile(paths.reportPath, 'utf8'));
      const trend = JSON.parse(await readFile(paths.trendPath, 'utf8'));
      const repair = JSON.parse(await readFile(paths.repairPath, 'utf8'));
      const governance = JSON.parse(await readFile(paths.governancePath, 'utf8'));
      const diagnosticRepairQueue = JSON.parse(await readFile(paths.diagnosticRepairQueuePath, 'utf8'));
      const approvalGate = JSON.parse(await readFile(paths.approvalGatePath, 'utf8'));
      const sourceDecisions = JSON.parse(await readFile(paths.sourceDecisionPath, 'utf8'));

      expect(report.portfolio.summary.totalModules).toBe(9);
      expect(report.sourceCandidateInventory.summary).toEqual({
        files: 5,
        cases: 593,
        modules: 4,
        structurallyValidCases: 454,
        invalidUniqueCases: 139,
        diagnosticIssues: 139,
        uniqueCasesByIssueCode: {
          MISSING_SECTION: 4,
          NON_NUMBERED_STEP: 2,
          UNSUPPORTED_SOURCE_FORMAT: 133,
        },
      });
      expect(report.legacyMigration.summary).toMatchObject({
        totalCases: 46,
        legacyCases: 46,
        legacyClaims: 114,
      });
      expect(report.segmentedGenerationQuality.byCohort['negative-fixture'].summary).toMatchObject({
        total: 26,
        correct: 26,
        falsePromotions: 0,
      });
      expect(report.reviewRepairContract.promotionPolicy).toBe('reaudit-required');
      expect(report.markdownDiagnostics.summary.files).toBe(5);
      expect(report.markdownDiagnostics.repairQueueSummary).toEqual({
        totalItems: 139,
        files: 5,
        cases: 139,
        byCode: {
          MISSING_SECTION: 4,
          NON_NUMBERED_STEP: 2,
          UNSUPPORTED_SOURCE_FORMAT: 133,
        },
        byPriority: { P0: 133, P1: 4, P2: 2 },
      });
      expect(diagnosticRepairQueue.guardrails).toEqual({
        approvalRequired: true,
        autoApplyAllowed: false,
        businessContentMutationAllowed: false,
      });
      expect(report.sourceDecisionSummary).toMatchObject({
        baselineCases: 249,
        normalizedCases: 116,
        totalCases: 133,
        originalRequestedCases: 131,
        newlySurfacedDeprecatedCases: 2,
        verifiedCases: 130,
        blockedCases: 0,
        notApplicableCases: 3,
        deferredCases: 0,
        currentGoalBlockingCases: 0,
        unassignedOwnerCases: 0,
      });
      expect(diagnosticRepairQueue.sourceDecisionSummary).toEqual(report.sourceDecisionSummary);
      const unsupportedGroup = diagnosticRepairQueue.groups.find(
        (group: any) => group.code === 'UNSUPPORTED_SOURCE_FORMAT',
      );
      expect(unsupportedGroup.items).toHaveLength(133);
      expect(unsupportedGroup.items.every((item: any) =>
        item.owner?.status === 'assigned'
        && ['verified', 'not-applicable'].includes(item.sourceDecisionStatus),
      )).toBe(true);
      expect(unsupportedGroup.items.filter((item: any) =>
        item.sourceDecisionStatus === 'verified')).toHaveLength(130);
      expect(sourceDecisions.summary).toEqual(report.sourceDecisionSummary);
      expect(report.testPlanGenerationWorkstream).toEqual({
        id: 'test-plan-to-test-case-generation',
        status: 'active',
        currentGoalBlocking: true,
        backlog: {
          blockedSources: 0,
          missingSections: 4,
          nonNumberedSteps: 2,
          legacyClaims: 114,
        },
      });
      expect(report.readiness).toEqual({
        testGenerationProductReady: false,
        blockingItems: { blockedSources: 0, diagnosticCases: 139, legacyClaims: 114 },
      });
      expect(report.executionStatus).toEqual(expect.arrayContaining([
        expect.objectContaining({ item: 1, status: 'implemented' }),
        expect.objectContaining({ item: 2, status: 'implemented' }),
        expect.objectContaining({ item: 3, status: 'in-progress' }),
        expect.objectContaining({ item: 5, status: 'in-progress' }),
      ]));
      expect(trend.summary.runs).toBeGreaterThanOrEqual(2);
      expect(repair.guardrails).toEqual({
        approvalRequired: true,
        autoApplyAllowed: false,
        businessRuleMutationAllowed: false,
      });
      expect(approvalGate).toMatchObject({
        status: 'ready-for-incremental-regression',
        executionAllowed: true,
        approvedProposalIds: expect.arrayContaining([
          'repair:fields:/pp/brand/tag/description#action-1#primary-1#field-56',
          'repair:fields:/pp/brand/tag/description#action-1#primary-1#field-58',
          'repair:fields:/pp/brand/tag/statistic#action-1#primary-1#field-35',
          'repair:fields:/pp/brand/tag/statistic#action-1#primary-1#field-37',
        ]),
        pendingProposalIds: [],
        guardrails: {
          approvalRequired: true,
          autoApplyAllowed: false,
          businessRuleMutationAllowed: false,
        },
        incrementalRegression: {
          executionAllowed: true,
          caseIds: [
            'negative:description-tag-group-second-language-max',
            'negative:description-tag-second-language-max',
            'negative:statistic-tag-group-second-language-max',
            'negative:statistic-tag-second-language-max',
          ],
        },
      });
      expect(report.controlledRepair).toMatchObject({
        approvalStatus: 'ready-for-incremental-regression',
        incrementalRegressionAllowed: true,
        closureStatus: 'completed-no-code-change',
        closedProposalIds: expect.arrayContaining(approvalGate.approvedProposalIds),
      });
      expect(governance.retention.deletionMode).toBe('report-only');
      expect(governance.utf8.summary.invalid).toBe(0);
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});
