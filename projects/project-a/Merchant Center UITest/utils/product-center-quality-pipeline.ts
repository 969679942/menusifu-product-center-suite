type RuntimeAcceptance = {
  accepted: boolean;
  acceptedCaseIds: string[];
  issues: unknown[];
  safety: {
    incompleteCheckpoints: number;
    sensitiveFindings: number;
    authStateArtifacts: number;
    forbiddenPatterns: number;
  };
};

type ProductCenterQualitySummary = {
  portfolio: { summary: { totalModules: number; modulesWithRealSources: number } };
  legacyMigration: { summary: { legacyClaims: number } };
  markdownDiagnostics: { repairQueueSummary: { totalItems: number } };
  segmentedGenerationQuality: {
    overall: { summary: { decisionAccuracy: number; falsePromotions: number } };
  };
  sourceDecisionSummary?: { blockedCases?: number; deferredCases?: number };
  testPlanGenerationWorkstream: {
    status: 'active' | 'deferred';
    currentGoalBlocking: boolean;
  };
};

type ProductCenterAcceptanceTrend = {
  summary: { flakyCases: number; insufficientDataCases: number };
};

type ProductCenterPageContractDiff = {
  status: 'clean' | 'review-required';
  summary: { findings: number };
};

type ProductCenterDriftLab = {
  status: 'accepted' | 'review-required';
  summary: {
    mutationScenarios: number;
    historicalReplays: number;
    modules: number;
    interactionProbes: number;
  };
  metrics: {
    detectionRecall: number;
    findingPrecision: number;
    impactRecall: number;
    impactPrecision: number;
    repairDecisionAccuracy: number;
    historicalReplayAccuracy: number;
    falseProductPromotions: number;
    falseBusinessRuleMutations: number;
  };
};

type ProductCenterFailureAnalysis = {
  summary: {
    failedCases: number;
    unresolvedFailures: number;
    falseProductPromotions: number;
  };
  baseline: {
    accuracy: number;
    falseProductPromotions: number;
  };
};

type ProductCenterTestPlanIntake = {
  status: 'passed' | 'passed-with-blocked' | 'review-required';
  summary: {
    generated: number;
    reviewRequired: number;
    falsePromotions: number;
  };
  evaluation: {
    accuracy: number;
    falsePromotions: number;
  };
  metadata: {
    complete: number;
    incomplete: number;
    sidebarComplete: number;
    sourceTraceComplete: number;
  };
};

export type ProductCenterTechnicalReadiness = {
  status: 'ready' | 'action-required' | 'blocked';
  technicalReady: boolean;
  automationPlatformReady: boolean;
  testGenerationProductReady: boolean;
  gates: Array<{ id: string; pass: boolean; detail: string }>;
  sourceActions: {
    legacyClaims: number;
    diagnosticCases: number;
    blockedSourceCases: number;
    deferredLegacyClaims: number;
    deferredDiagnosticCases: number;
    deferredBlockedSourceCases: number;
  };
};

export function evaluateProductCenterTechnicalReadiness(input: {
  mainAcceptance: RuntimeAcceptance;
  goldAcceptance: RuntimeAcceptance;
  approvedAcceptance: RuntimeAcceptance;
  quality: ProductCenterQualitySummary;
  trend: ProductCenterAcceptanceTrend;
  pageContractDiff: ProductCenterPageContractDiff;
  driftLab: ProductCenterDriftLab;
  failureAnalysis: ProductCenterFailureAnalysis;
  testPlanIntake: ProductCenterTestPlanIntake;
  expectedGoldCaseCount?: number;
  expectedApprovedCaseCount?: number;
  expectedMainCaseCount?: number;
}): ProductCenterTechnicalReadiness {
  const expectedMainCaseCount = input.expectedMainCaseCount
    ?? readProductCenterMainContractSummary().caseCount;
  const expectedGoldCaseCount = input.expectedGoldCaseCount
    ?? readProductCenterGoldContractSummary().caseCount;
  const expectedApprovedCaseCount = input.expectedApprovedCaseCount ?? expectedGoldCaseCount;
  const gates = [
    gate(
      'main-runtime-acceptance',
      input.mainAcceptance.accepted
        && input.mainAcceptance.acceptedCaseIds.length === expectedMainCaseCount
        && input.mainAcceptance.issues.length === 0,
      `accepted=${input.mainAcceptance.accepted};cases=${input.mainAcceptance.acceptedCaseIds.length};issues=${input.mainAcceptance.issues.length}`,
    ),
    gate('main-runtime-safety', safetyClean(input.mainAcceptance), safetyDetail(input.mainAcceptance)),
    gate(
      'gold-runtime-acceptance',
      input.goldAcceptance.accepted
        && input.goldAcceptance.acceptedCaseIds.length === expectedGoldCaseCount
        && input.goldAcceptance.issues.length === 0,
      `accepted=${input.goldAcceptance.accepted};cases=${input.goldAcceptance.acceptedCaseIds.length};issues=${input.goldAcceptance.issues.length}`,
    ),
    gate('gold-runtime-safety', safetyClean(input.goldAcceptance), safetyDetail(input.goldAcceptance)),
    gate(
      'approved-technical-bindings-runtime-acceptance',
      input.approvedAcceptance.accepted
        && input.approvedAcceptance.acceptedCaseIds.length === expectedApprovedCaseCount
        && input.approvedAcceptance.issues.length === 0,
      `accepted=${input.approvedAcceptance.accepted};cases=${input.approvedAcceptance.acceptedCaseIds.length};issues=${input.approvedAcceptance.issues.length}`,
    ),
    gate(
      'approved-technical-bindings-runtime-safety',
      safetyClean(input.approvedAcceptance),
      safetyDetail(input.approvedAcceptance),
    ),
    gate(
      'gold-module-coverage',
      input.quality.portfolio.summary.totalModules > 0
        && input.quality.portfolio.summary.modulesWithRealSources
          === input.quality.portfolio.summary.totalModules,
      `modules=${input.quality.portfolio.summary.modulesWithRealSources}/${input.quality.portfolio.summary.totalModules}`,
    ),
    gate(
      'generation-decision-quality',
      input.quality.segmentedGenerationQuality.overall.summary.decisionAccuracy === 1
        && input.quality.segmentedGenerationQuality.overall.summary.falsePromotions === 0,
      `accuracy=${input.quality.segmentedGenerationQuality.overall.summary.decisionAccuracy};falsePromotions=${input.quality.segmentedGenerationQuality.overall.summary.falsePromotions}`,
    ),
    gate(
      'runtime-stability',
      input.trend.summary.flakyCases === 0 && input.trend.summary.insufficientDataCases === 0,
      `flaky=${input.trend.summary.flakyCases};insufficient=${input.trend.summary.insufficientDataCases}`,
    ),
    gate(
      'page-contract-observation',
      input.pageContractDiff.status === 'clean' && input.pageContractDiff.summary.findings === 0,
      `status=${input.pageContractDiff.status};findings=${input.pageContractDiff.summary.findings}`,
    ),
    gate(
      'drift-lab',
      input.driftLab.status === 'accepted'
        && input.driftLab.summary.mutationScenarios > 0
        && input.driftLab.summary.historicalReplays > 0
        && input.driftLab.summary.modules > 0
        && input.driftLab.summary.interactionProbes > 0
        && input.driftLab.metrics.detectionRecall === 1
        && input.driftLab.metrics.findingPrecision === 1
        && input.driftLab.metrics.impactRecall === 1
        && input.driftLab.metrics.impactPrecision === 1
        && input.driftLab.metrics.repairDecisionAccuracy === 1
        && input.driftLab.metrics.historicalReplayAccuracy === 1
        && input.driftLab.metrics.falseProductPromotions === 0
        && input.driftLab.metrics.falseBusinessRuleMutations === 0,
      `status=${input.driftLab.status};mutations=${input.driftLab.summary.mutationScenarios};replays=${input.driftLab.summary.historicalReplays};modules=${input.driftLab.summary.modules};probes=${input.driftLab.summary.interactionProbes};detectionRecall=${input.driftLab.metrics.detectionRecall};findingPrecision=${input.driftLab.metrics.findingPrecision};impactRecall=${input.driftLab.metrics.impactRecall};impactPrecision=${input.driftLab.metrics.impactPrecision};repairAccuracy=${input.driftLab.metrics.repairDecisionAccuracy};replayAccuracy=${input.driftLab.metrics.historicalReplayAccuracy};falseBusinessRuleMutations=${input.driftLab.metrics.falseBusinessRuleMutations}`,
    ),
    gate(
      'failure-analysis',
      input.failureAnalysis.summary.failedCases === 0
        && input.failureAnalysis.summary.unresolvedFailures === 0
        && input.failureAnalysis.summary.falseProductPromotions === 0
        && input.failureAnalysis.baseline.accuracy === 1
        && input.failureAnalysis.baseline.falseProductPromotions === 0,
      `failed=${input.failureAnalysis.summary.failedCases};unresolved=${input.failureAnalysis.summary.unresolvedFailures};falsePromotions=${input.failureAnalysis.summary.falseProductPromotions};accuracy=${input.failureAnalysis.baseline.accuracy}`,
    ),
    gate(
      'test-plan-intake-v1',
      (input.testPlanIntake.status === 'passed'
        || input.testPlanIntake.status === 'passed-with-blocked')
        && input.testPlanIntake.summary.generated === expectedGoldCaseCount
        && input.testPlanIntake.summary.reviewRequired === 0
        && input.testPlanIntake.summary.falsePromotions === 0
        && input.testPlanIntake.evaluation.accuracy === 1
        && input.testPlanIntake.evaluation.falsePromotions === 0
        && input.testPlanIntake.metadata.complete === expectedGoldCaseCount
        && input.testPlanIntake.metadata.incomplete === 0
        && input.testPlanIntake.metadata.sidebarComplete === expectedGoldCaseCount
        && input.testPlanIntake.metadata.sourceTraceComplete === expectedGoldCaseCount,
      `status=${input.testPlanIntake.status};generated=${input.testPlanIntake.summary.generated};review=${input.testPlanIntake.summary.reviewRequired};accuracy=${input.testPlanIntake.evaluation.accuracy};falsePromotions=${input.testPlanIntake.evaluation.falsePromotions};metadata=${input.testPlanIntake.metadata.complete}/${expectedGoldCaseCount}`,
    ),
  ];
  const deferredBlockedSourceCases = input.quality.sourceDecisionSummary?.deferredCases ?? 0;
  const generationActive = input.quality.testPlanGenerationWorkstream.status === 'active';
  const legacyClaims = input.quality.legacyMigration.summary.legacyClaims;
  const diagnosticCases = input.quality.markdownDiagnostics.repairQueueSummary.totalItems;
  const sourceActions = {
    legacyClaims: generationActive ? legacyClaims : 0,
    diagnosticCases: generationActive ? diagnosticCases : 0,
    blockedSourceCases: generationActive ? input.quality.sourceDecisionSummary?.blockedCases ?? 0 : 0,
    deferredLegacyClaims: generationActive ? 0 : legacyClaims,
    deferredDiagnosticCases: generationActive ? 0 : diagnosticCases,
    deferredBlockedSourceCases: generationActive ? 0 : deferredBlockedSourceCases,
  };
  const technicalReady = gates.every((item) => item.pass);
  const hasSourceActions = sourceActions.legacyClaims > 0
    || sourceActions.diagnosticCases > 0
    || sourceActions.blockedSourceCases > 0;
  return {
    status: !technicalReady ? 'blocked' : hasSourceActions ? 'action-required' : 'ready',
    technicalReady,
    automationPlatformReady: technicalReady,
    testGenerationProductReady: technicalReady && generationActive && !hasSourceActions,
    gates,
    sourceActions,
  };
}

function safetyClean(acceptance: RuntimeAcceptance): boolean {
  return Object.values(acceptance.safety).every((count) => count === 0);
}

function safetyDetail(acceptance: RuntimeAcceptance): string {
  const safety = acceptance.safety;
  return `checkpoints=${safety.incompleteCheckpoints};sensitive=${safety.sensitiveFindings};auth=${safety.authStateArtifacts};forbidden=${safety.forbiddenPatterns}`;
}

function gate(id: string, pass: boolean, detail: string) {
  return { id, pass, detail };
}
import {
  readProductCenterGoldContractSummary,
  readProductCenterMainContractSummary,
} from './product-center-gold-contract';
