import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildProductCenterOwnerSummary,
  renderProductCenterOwnerSummaryMarkdown,
} from '../../utils/product-center-owner-summary';

test.describe('商品中心负责人统一质量摘要', () => {
  test('技术门禁全绿时应把来源缺口列为 action 而不是技术失败', async () => {
    const summary = buildProductCenterOwnerSummary(fixture());

    expect(summary).toMatchObject({
      status: 'ready-with-actions',
      technicalReady: true,
      automationPlatformReady: true,
      testGenerationProductReady: false,
      runtime: {
        main: { accepted: true, cases: 46 },
        gold: { accepted: true, cases: 10 },
        approvedTechnicalBindings: { accepted: true, cases: 10 },
      },
      trend: { runs: 24, acceptedRuns: 24, flakyCases: 0, insufficientDataCases: 0 },
      failure: { failedCases: 0, unresolvedFailures: 0, falseProductPromotions: 0 },
      pageContract: { status: 'clean', findings: 0, impactedCases: 0 },
      driftLab: {
        status: 'accepted',
        mutationScenarios: 27,
        historicalReplays: 4,
        modules: 9,
        interactionProbes: 18,
      },
      repair: { approvalStatus: 'ready-for-incremental-regression', closureStatus: 'completed-no-code-change' },
      sourceGovernance: {
        normalizedCases: 122,
        verifiedCases: 0,
        blockedCases: 103,
        deferredCases: 0,
        currentGoalBlockingCases: 103,
        legacyClaims: 114,
        activeLegacyClaims: 114,
        deferredLegacyClaims: 0,
        diagnosticCases: 131,
        activeDiagnosticCases: 131,
        deferredDiagnosticCases: 0,
      },
      actionSummary: { total: 4, P0: 1, P1: 2, P2: 1 },
    });
    expect(summary.actions.map((item) => item.id)).toEqual([
      'resolve-blocked-sources',
      'repair-missing-sections',
      'migrate-legacy-claims',
      'repair-non-numbered-steps',
    ]);
    expect(summary.sourceGovernance.blockedByOwner).toEqual([
      { owner: '商品中心商品产品负责人', cases: 2 },
      { owner: '商品中心标签产品负责人', cases: 1 },
    ]);
  });

  test('页面漂移、运行失败或清理告警必须阻断负责人状态', async () => {
    const input = fixture();
    input.failureAnalysis.summary.failedCases = 1;
    input.pageContractDiff.status = 'review-required';
    input.pageContractDiff.summary.findings = 2;
    input.governance.retention.summary.cleanupAlerts = 1;

    const summary = buildProductCenterOwnerSummary(input);

    expect(summary.status).toBe('blocked');
    expect(summary.technicalReady).toBe(false);
    expect(summary.blockers.map((item) => item.code)).toEqual([
      'FAILURE_ANALYSIS_BLOCKED',
      'PAGE_CONTRACT_REVIEW_REQUIRED',
      'CLEANUP_ALERTS_PRESENT',
    ]);
  });

  test('Markdown 应提供负责人可扫描的状态、阻断和行动表', async () => {
    const markdown = renderProductCenterOwnerSummaryMarkdown(
      buildProductCenterOwnerSummary(fixture()),
    );

    expect(markdown).toContain('# 商品中心质量总览');
    expect(markdown).toContain('## 技术状态');
    expect(markdown).toContain('## 来源治理');
    expect(markdown).toContain('## 待办');
    expect(markdown).toContain('normalized=122，verified=0，blocked=103');
    expect(markdown).toContain('deferred=0，当前目标阻断=103');
    expect(markdown).toContain('deferred legacy Claim=0，deferred 诊断=0');
    expect(markdown).toContain('| P0 | 补充 blocked source |');
    expect(markdown).not.toContain('sourceRaw');
    expect(markdown).not.toContain('blockReason');
  });

  test('构建入口与 CI 应生成并上传负责人摘要', async () => {
    const projectRoot = process.cwd();
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    const ciSource = fs.readFileSync(path.join(projectRoot, 'scripts/run-product-center-ci.ts'), 'utf8');
    const workflow = fs.readFileSync(path.resolve(
      projectRoot,
      '../.github/workflows/product-center-quality.yml',
    ), 'utf8');

    expect(packageJson.scripts['build:product-center:owner-summary'])
      .toContain('build-product-center-owner-summary.ts');
    expect(packageJson.scripts['test:product-center:contract'])
      .toContain('run-product-center-contract-tests.ts');
    expect(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-manifests/product-center-contract-tests.json',
    ), 'utf8')).toContain('product-center-owner-summary.contract.spec.ts');
    expect(ciSource).toContain('buildProductCenterOwnerSummaryArtifacts');
    expect(workflow).toContain('output/owner/product-center-owner-summary.md');
    expect(workflow).toContain('Merchant Center UITest/output/owner/*.json');
  });
});

function fixture() {
  return {
    generatedAt: '2026-07-27T00:00:00.000Z',
    pipeline: {
      status: 'passed-with-actions',
      pipeline: { status: 'passed', failedStage: null, stages: Array.from({ length: 13 }) },
      technicalReadiness: { technicalReady: true },
    },
    mainAcceptance: acceptance(46),
    goldAcceptance: acceptance(10),
    approvedAcceptance: acceptance(10),
    trend: {
      summary: { runs: 24, acceptedRuns: 24, flakyCases: 0, insufficientDataCases: 0 },
    },
    failureAnalysis: {
      summary: {
        failedCases: 0,
        unresolvedFailures: 0,
        falseProductPromotions: 0,
        categoryCounts: { 'locator-drift': 0 },
      },
    },
    pageContractDiff: { status: 'clean', summary: { findings: 0 } },
    pageContractImpact: { status: 'no-impact', impactedCases: [] as string[] },
    driftLab: {
      status: 'accepted',
      summary: {
        mutationScenarios: 27,
        historicalReplays: 4,
        modules: 9,
        interactionProbes: 18,
      },
      metrics: {
        detectionRecall: 1,
        findingPrecision: 1,
        impactRecall: 1,
        impactPrecision: 1,
        repairDecisionAccuracy: 1,
        historicalReplayAccuracy: 1,
        falseProductPromotions: 0,
        falseBusinessRuleMutations: 0,
      },
    },
    approvalGate: {
      status: 'ready-for-incremental-regression',
      pendingProposalIds: [] as string[],
      rejectedProposalIds: [] as string[],
      deferredProposalIds: [] as string[],
      relevantProposalIds: ['repair:a'],
    },
    closure: { status: 'completed-no-code-change', closedProposalIds: ['repair:a'] },
    governance: {
      retention: { summary: { cleanupAlerts: 0, expiredCandidates: 0 } },
      utf8: { summary: { invalid: 0, withBom: 0, withReplacementCharacters: 0 } },
    },
    quality: {
      legacyMigration: { summary: { legacyClaims: 114 } },
      markdownDiagnostics: {
        repairQueueSummary: {
          totalItems: 131,
          byCode: { MISSING_SECTION: 5, NON_NUMBERED_STEP: 23, UNSUPPORTED_SOURCE_FORMAT: 103 },
        },
      },
      sourceDecisionSummary: {
        normalizedCases: 122,
        verifiedCases: 0,
        blockedCases: 103,
        deferredCases: 0,
        currentGoalBlockingCases: 103,
      },
      testPlanGenerationWorkstream: {
        id: 'test-plan-to-test-case-generation',
        status: 'active' as const,
        currentGoalBlocking: true,
      },
    },
    sourceDecisions: {
      cases: [
        sourceCase('blocked', '商品中心标签产品负责人'),
        sourceCase('blocked', '商品中心商品产品负责人'),
        sourceCase('blocked', '商品中心商品产品负责人'),
      ],
    },
  };
}

function acceptance(cases: number) {
  return {
    accepted: true,
    acceptedCaseIds: Array.from({ length: cases }, (_, index) => `case-${index}`),
    issues: [],
    safety: {
      incompleteCheckpoints: 0,
      sensitiveFindings: 0,
      authStateArtifacts: 0,
      forbiddenPatterns: 0,
    },
  };
}

function sourceCase(status: 'verified' | 'blocked', role: string) {
  return { status, owner: { role } };
}
