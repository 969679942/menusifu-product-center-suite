import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { evaluateProductCenterTechnicalReadiness } from '../../utils/product-center-quality-pipeline';
import { readProductCenterGoldContractSummary } from '../../utils/product-center-gold-contract';

const expectedGoldCaseCount = readProductCenterGoldContractSummary().caseCount;

test.describe('商品中心统一质量流水线', () => {
  test('平台门禁全绿但生成来源有缺口时应拆分两类就绪状态', async () => {
    const result = evaluateProductCenterTechnicalReadiness({
      mainAcceptance: acceptance(46),
      goldAcceptance: acceptance(expectedGoldCaseCount),
      approvedAcceptance: acceptance(expectedGoldCaseCount),
      quality: {
        portfolio: { summary: { totalModules: 9, modulesWithRealSources: 9 } },
        legacyMigration: { summary: { legacyClaims: 114 } },
        markdownDiagnostics: { repairQueueSummary: { totalItems: 131 } },
        segmentedGenerationQuality: {
          overall: { summary: { decisionAccuracy: 1, falsePromotions: 0 } },
        },
        sourceDecisionSummary: { blockedCases: 103, deferredCases: 0 },
        testPlanGenerationWorkstream: activeGenerationWorkstream,
      },
      trend: { summary: { flakyCases: 0, insufficientDataCases: 0 } },
      pageContractDiff: cleanPageContractDiff,
      driftLab: cleanDriftLab,
      failureAnalysis: cleanFailureAnalysis,
      testPlanIntake: cleanTestPlanIntake,
    });

    expect(result.status).toBe('action-required');
    expect(result.technicalReady).toBe(true);
    expect(result.automationPlatformReady).toBe(true);
    expect(result.testGenerationProductReady).toBe(false);
    expect(result.gates.every((gate) => gate.pass)).toBe(true);
    expect(result.sourceActions).toEqual({
      legacyClaims: 114,
      diagnosticCases: 131,
      blockedSourceCases: 103,
      deferredLegacyClaims: 0,
      deferredDiagnosticCases: 0,
      deferredBlockedSourceCases: 0,
    });
  });

  test('runtime acceptance 或安全门禁失败时必须阻断流水线', async () => {
    const result = evaluateProductCenterTechnicalReadiness({
      mainAcceptance: { ...acceptance(46), accepted: false, issues: [{ code: 'CLAIM_MISMATCH' }] },
      goldAcceptance: { ...acceptance(expectedGoldCaseCount), safety: { ...cleanSafety, forbiddenPatterns: 1 } },
      approvedAcceptance: acceptance(expectedGoldCaseCount),
      quality: {
        portfolio: { summary: { totalModules: 9, modulesWithRealSources: 9 } },
        legacyMigration: { summary: { legacyClaims: 0 } },
        markdownDiagnostics: { repairQueueSummary: { totalItems: 0 } },
        segmentedGenerationQuality: {
          overall: { summary: { decisionAccuracy: 1, falsePromotions: 0 } },
        },
        sourceDecisionSummary: { blockedCases: 0 },
        testPlanGenerationWorkstream: activeGenerationWorkstream,
      },
      trend: { summary: { flakyCases: 0, insufficientDataCases: 0 } },
      pageContractDiff: cleanPageContractDiff,
      driftLab: cleanDriftLab,
      failureAnalysis: cleanFailureAnalysis,
      testPlanIntake: cleanTestPlanIntake,
    });

    expect(result.status).toBe('blocked');
    expect(result.technicalReady).toBe(false);
    expect(result.gates.filter((gate) => !gate.pass).map((gate) => gate.id)).toEqual([
      'main-runtime-acceptance',
      'gold-runtime-safety',
    ]);
  });

  test('页面合同出现技术漂移时必须阻断就绪门禁', async () => {
    const result = evaluateProductCenterTechnicalReadiness({
      mainAcceptance: acceptance(46),
      goldAcceptance: acceptance(expectedGoldCaseCount),
      approvedAcceptance: acceptance(expectedGoldCaseCount),
      quality: {
        portfolio: { summary: { totalModules: 9, modulesWithRealSources: 9 } },
        legacyMigration: { summary: { legacyClaims: 0 } },
        markdownDiagnostics: { repairQueueSummary: { totalItems: 0 } },
        segmentedGenerationQuality: {
          overall: { summary: { decisionAccuracy: 1, falsePromotions: 0 } },
        },
        sourceDecisionSummary: { blockedCases: 0 },
        testPlanGenerationWorkstream: activeGenerationWorkstream,
      },
      trend: { summary: { flakyCases: 0, insufficientDataCases: 0 } },
      pageContractDiff: { status: 'review-required', summary: { findings: 1 } },
      driftLab: cleanDriftLab,
      failureAnalysis: cleanFailureAnalysis,
      testPlanIntake: cleanTestPlanIntake,
    });

    expect(result.technicalReady).toBe(false);
    expect(result.gates.filter((gate) => !gate.pass).map((gate) => gate.id))
      .toEqual(['page-contract-observation']);
  });

  test('失败分析存在失败未决或误晋级时必须阻断就绪门禁', async () => {
    const result = evaluateProductCenterTechnicalReadiness({
      mainAcceptance: acceptance(46),
      goldAcceptance: acceptance(expectedGoldCaseCount),
      approvedAcceptance: acceptance(expectedGoldCaseCount),
      quality: {
        portfolio: { summary: { totalModules: 9, modulesWithRealSources: 9 } },
        legacyMigration: { summary: { legacyClaims: 0 } },
        markdownDiagnostics: { repairQueueSummary: { totalItems: 0 } },
        segmentedGenerationQuality: {
          overall: { summary: { decisionAccuracy: 1, falsePromotions: 0 } },
        },
        sourceDecisionSummary: { blockedCases: 0 },
        testPlanGenerationWorkstream: activeGenerationWorkstream,
      },
      trend: { summary: { flakyCases: 0, insufficientDataCases: 0 } },
      pageContractDiff: cleanPageContractDiff,
      driftLab: cleanDriftLab,
      failureAnalysis: {
        summary: { failedCases: 1, unresolvedFailures: 1, falseProductPromotions: 0 },
        baseline: { accuracy: 1, falseProductPromotions: 0 },
      },
      testPlanIntake: cleanTestPlanIntake,
    });

    expect(result.technicalReady).toBe(false);
    expect(result.gates.filter((gate) => !gate.pass).map((gate) => gate.id))
      .toEqual(['failure-analysis']);
  });

  test('CLI 与 npm 入口必须提供 static live full 和显式 resume 模式', async () => {
    const source = fs.readFileSync(path.resolve(
      process.cwd(),
      'scripts/run-product-center-quality-pipeline.ts',
    ), 'utf8');
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    const mainRunnerSource = fs.readFileSync(path.resolve(
      process.cwd(),
      'scripts/run-product-center-main-recipes.ts',
    ), 'utf8');

    expect(source).toContain("'static'");
    expect(source).toContain("'live'");
    expect(source).toContain("'full'");
    expect(source).toContain("'--resume'");
    expect(source).toContain("'--state-verified'");
    expect(source).toContain('publishProductCenterPipelineArtifacts');
    expect(source).toContain('buildProductCenterPipelineArtifactRetentionAudit');
    expect(source.match(/'state-verification-required'/g)).toHaveLength(6);
    expect(source.indexOf("'recipe-build'")).toBeLessThan(source.indexOf("'contract-tests'"));
    expect(source.indexOf("'page-contract-probe'")).toBeLessThan(source.indexOf("'main-ui'"));
    expect(source.indexOf("'group-runtime-audit'")).toBeLessThan(source.indexOf("'group-automation-bindings'"));
    expect(source.indexOf("'page-api-observation'")).toBeLessThan(source.indexOf("'api-observation-proposal'"));
    expect(source.indexOf("'api-observation-proposal'")).toBeLessThan(source.indexOf("'page-contract-observation'"));
    expect(packageJson.scripts['pipeline:product-center']).toContain('run-product-center-quality-pipeline.ts');
    expect(packageJson.scripts['pipeline:product-center']).toContain('--mode static');
    expect(packageJson.scripts['pipeline:product-center:live']).toContain('--mode live');
    expect(packageJson.scripts['pipeline:product-center:full']).toContain('--mode full');
    expect(packageJson.scripts['test:product-center:recipes'])
      .toContain('run-product-center-main-recipes.ts');
    expect(mainRunnerSource).toContain('workers: 2');
    expect(packageJson.scripts['test:product-center:contract'])
      .toContain('run-product-center-contract-tests.ts');
    expect(fs.readFileSync(path.join(
      process.cwd(),
      'contracts/product-center/test-manifests/product-center-contract-tests.json',
    ), 'utf8')).toContain('product-center-quality-pipeline.contract.spec.ts');
  });

  test('已审批技术绑定未独立验收或存在安全问题时必须阻断就绪', async () => {
    const result = evaluateProductCenterTechnicalReadiness({
      mainAcceptance: acceptance(46),
      goldAcceptance: acceptance(expectedGoldCaseCount),
      approvedAcceptance: {
        ...acceptance(expectedGoldCaseCount - 1),
        accepted: false,
        safety: { ...cleanSafety, forbiddenPatterns: 1 },
      },
      quality: {
        portfolio: { summary: { totalModules: 9, modulesWithRealSources: 9 } },
        legacyMigration: { summary: { legacyClaims: 0 } },
        markdownDiagnostics: { repairQueueSummary: { totalItems: 0 } },
        segmentedGenerationQuality: {
          overall: { summary: { decisionAccuracy: 1, falsePromotions: 0 } },
        },
        sourceDecisionSummary: { blockedCases: 0 },
        testPlanGenerationWorkstream: activeGenerationWorkstream,
      },
      trend: { summary: { flakyCases: 0, insufficientDataCases: 0 } },
      pageContractDiff: cleanPageContractDiff,
      driftLab: cleanDriftLab,
      failureAnalysis: cleanFailureAnalysis,
      testPlanIntake: cleanTestPlanIntake,
    });

    expect(result.technicalReady).toBe(false);
    expect(result.gates.filter((gate) => !gate.pass).map((gate) => gate.id)).toEqual([
      'approved-technical-bindings-runtime-acceptance',
      'approved-technical-bindings-runtime-safety',
    ]);
  });

  test('Gold 分母应从权威合同动态读取并校验重复 caseId', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-gold-contract-'));
    const contractDir = path.join(
      rootDir,
      'contracts/product-center/test-cases/pilots',
    );
    try {
      fs.mkdirSync(contractDir, { recursive: true });
      fs.writeFileSync(path.join(contractDir, 'product-center-test-plan-gold-set.json'), JSON.stringify({
        cases: [{ id: 'case-a' }, { id: 'case-b' }],
      }));
      expect(readProductCenterGoldContractSummary(rootDir)).toMatchObject({
        caseCount: 2,
        caseIds: ['case-a', 'case-b'],
      });
      fs.writeFileSync(path.join(contractDir, 'product-center-test-plan-gold-set.json'), JSON.stringify({
        cases: [{ id: 'case-a' }, { id: 'case-a' }],
      }));
      expect(() => readProductCenterGoldContractSummary(rootDir)).toThrow(/重复 caseId/);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

const cleanSafety = {
  incompleteCheckpoints: 0,
  sensitiveFindings: 0,
  authStateArtifacts: 0,
  forbiddenPatterns: 0,
};

const cleanPageContractDiff = {
  status: 'clean' as const,
  summary: { findings: 0 },
};

const cleanDriftLab = {
  status: 'accepted' as const,
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
};

const cleanFailureAnalysis = {
  summary: { failedCases: 0, unresolvedFailures: 0, falseProductPromotions: 0 },
  baseline: { accuracy: 1, falseProductPromotions: 0 },
};

const cleanTestPlanIntake = {
  status: 'passed-with-blocked' as const,
  summary: { generated: expectedGoldCaseCount, reviewRequired: 0, falsePromotions: 0 },
  evaluation: { accuracy: 1, falsePromotions: 0 },
  metadata: {
    complete: expectedGoldCaseCount,
    incomplete: 0,
    sidebarComplete: expectedGoldCaseCount,
    sourceTraceComplete: expectedGoldCaseCount,
  },
};

const deferredGenerationWorkstream = {
  status: 'deferred' as const,
  currentGoalBlocking: false,
};

const activeGenerationWorkstream = {
  status: 'active' as const,
  currentGoalBlocking: true,
};

function acceptance(caseCount: number) {
  return {
    accepted: true,
    acceptedCaseIds: Array.from({ length: caseCount }, (_, index) => `case-${index + 1}`),
    issues: [],
    safety: cleanSafety,
  };
}
