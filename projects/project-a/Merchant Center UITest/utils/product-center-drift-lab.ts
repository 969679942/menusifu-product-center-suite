import { createHash } from 'node:crypto';
import {
  buildProductCenterPageContractImpact,
  buildProductCenterPageContractObservation,
  diffProductCenterPageContractObservations,
  type ProductCenterPageContractEvidenceInput,
  type ProductCenterPageContractFindingCode,
  type ProductCenterPageContractObservation,
  type ProductCenterPageContractRecipeInput,
} from './product-center-page-contract-observation';
import {
  classifyProductCenterFailureSignals,
  fingerprintFailureDiagnostic,
  type ProductCenterFailureCategory,
  type ProductCenterFailureSignals,
} from './product-center-failure-analysis';
import { stableStringify } from './product-center-test-contract';

export type ProductCenterDriftModule =
  | 'brand-group'
  | 'brand-item'
  | 'brand-material-recipe'
  | 'brand-print'
  | 'brand-seasoning'
  | 'brand-tag'
  | 'menu'
  | 'store-operations'
  | 'store-product';

export type ProductCenterDriftMutationKind =
  | 'api-signature'
  | 'assertion-adapter'
  | 'capability'
  | 'claim-coverage'
  | 'hidden-ui'
  | 'locator-count'
  | 'navigation-arrival'
  | 'navigation-mode'
  | 'observation-added'
  | 'observation-missing'
  | 'runtime-acceptance'
  | 'route-fingerprint'
  | 'semantic-key'
  | 'source-mapping';

export type ProductCenterRepairDisposition =
  | 'baseline-promotion-review'
  | 'block-and-review'
  | 'technical-proposal';

export type ProductCenterDriftScenario = {
  id: string;
  module: ProductCenterDriftModule;
  caseId: string;
  status: 'confirmed';
  sourceType: 'controlled-mutation';
  confidence: 1;
  generationAllowed: false;
  sourceEvidence: { type: 'controlled-fixture'; ref: string };
  mutation: {
    kind: ProductCenterDriftMutationKind;
    key?: string;
    value?: string | number | boolean;
  };
  expectedFindingCodes: ProductCenterPageContractFindingCode[];
  expectedImpactedCaseIds: string[];
  expectedRepairDisposition: ProductCenterRepairDisposition;
  contractMutationAllowed: false;
  businessRuleMutationAllowed: false;
};

export type ProductCenterDriftBenchmarkContract = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-drift-benchmark';
  policy?: {
    minimumModules: number;
    minimumScenariosPerModule: number;
    requiredFindingCodes: ProductCenterPageContractFindingCode[];
  };
  scenarios: ProductCenterDriftScenario[];
};

export type ProductCenterHistoricalFailureReplay = {
  id: string;
  sourceType: 'historical-sanitized-replay';
  status: 'confirmed';
  confidence: 1;
  generationAllowed: false;
  sourceEvidence: { type: 'sanitized-history'; ref: string };
  input: ProductCenterFailureSignals;
  expectedCategory: ProductCenterFailureCategory;
  expectedProductFailure: boolean;
};

export type ProductCenterHistoricalFailureReplayContract = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-historical-failure-replay';
  policy?: { requiredCategories: ProductCenterFailureCategory[] };
  replays: ProductCenterHistoricalFailureReplay[];
};

export type ProductCenterInteractionProbe = {
  id: string;
  module: ProductCenterDriftModule;
  caseId: string;
  route: string;
  archetype: string;
  mode: 'cleanup-required' | 'read-only';
  status: 'planned' | 'observed';
  sourceType: 'runtime-evidence';
  confidence: 1;
  generationAllowed: false;
  capabilityIds: string[];
  evidenceRequirements: string[];
  sourceEvidence: { recipeId: string; evidenceRef: string };
};

export type ProductCenterInteractionProbeContract = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-interaction-probes';
  policy?: { minimumPerModule: number };
  probes: ProductCenterInteractionProbe[];
};

type BuildInput = {
  baseline: ProductCenterPageContractObservation;
  recipes: readonly ProductCenterPageContractRecipeInput[];
  impactRecipes?: readonly ProductCenterPageContractRecipeInput[];
  benchmark: ProductCenterDriftBenchmarkContract;
  historicalReplay: ProductCenterHistoricalFailureReplayContract;
  interactionProbes: ProductCenterInteractionProbeContract;
  interactionProbeEvidence?: {
    entries?: readonly { probeId: string; status: 'planned' | 'observed' }[];
  };
  generatedAt?: string;
};

export function buildProductCenterDriftLabReport(input: BuildInput) {
  validateCollections(input);
  const scenarios = input.benchmark.scenarios.map((scenario) => evaluateScenario(
    input.baseline,
    input.recipes,
    input.impactRecipes ?? input.recipes,
    scenario,
  ));
  const historicalResults = input.historicalReplay.replays.map((replay) => {
    const actual = classifyProductCenterFailureSignals(replay.input);
    return {
      id: replay.id,
      expectedCategory: replay.expectedCategory,
      expectedProductFailure: replay.expectedProductFailure,
      actualCategory: actual.category,
      correct: actual.category === replay.expectedCategory
        && actual.productFailure === replay.expectedProductFailure,
      retryable: actual.retryable,
      productFailure: actual.productFailure,
      diagnosticFingerprint: fingerprintFailureDiagnostic(
        replay.input.diagnostic ?? `${replay.id}:${replay.input.status}`,
      ),
      sourceRef: replay.sourceEvidence.ref,
    };
  });
  const probeStatusById = new Map((input.interactionProbeEvidence?.entries ?? [])
    .map((entry) => [entry.probeId, entry.status]));
  const probes = input.interactionProbes.probes.map((probe) => ({
    ...probe,
    status: probeStatusById.get(probe.id) ?? 'planned' as const,
  }));
  const moduleIds = unique(input.benchmark.scenarios.map((scenario) => scenario.module));
  const coverageModules = moduleIds.map((module) => ({
    module,
    mutationScenarios: scenarios.filter((scenario) => scenario.module === module).length,
    interactionProbes: probes.filter((probe) => probe.module === module).length,
  }));
  const findingCodes = unique(input.benchmark.scenarios.flatMap(
    (scenario) => scenario.expectedFindingCodes,
  )) as ProductCenterPageContractFindingCode[];
  const findingCounts = countExpectedAndActual(
    input.benchmark.scenarios.map((scenario) => scenario.expectedFindingCodes),
    scenarios.map((scenario) => scenario.actualFindingCodes),
  );
  const impactCounts = countExpectedAndActual(
    input.benchmark.scenarios.map((scenario) => scenario.expectedImpactedCaseIds),
    scenarios.map((scenario) => scenario.actualImpactedCaseIds),
  );
  const replayCorrect = historicalResults.filter((entry) => entry.correct).length;
  const falseProductPromotions = historicalResults.filter((entry) => (
    entry.productFailure && entry.expectedProductFailure === false
  )).length;
  const metrics = {
    detectionRecall: ratio(findingCounts.truePositive, findingCounts.expected),
    findingPrecision: ratio(findingCounts.truePositive, findingCounts.actual),
    impactRecall: ratio(impactCounts.truePositive, impactCounts.expected),
    impactPrecision: ratio(impactCounts.truePositive, impactCounts.actual),
    repairDecisionAccuracy: ratio(
      scenarios.filter((entry) => entry.repairDecisionCorrect).length,
      scenarios.length,
    ),
    historicalReplayAccuracy: ratio(replayCorrect, historicalResults.length),
    falseProductPromotions,
    falseBusinessRuleMutations: scenarios.filter(
      (entry) => entry.businessRuleMutationAllowed,
    ).length,
  };
  const executionPlan = buildExecutionPlan();
  const benchmarkPolicy = input.benchmark.policy ?? {
    minimumModules: 1,
    minimumScenariosPerModule: 1,
    requiredFindingCodes: findingCodes,
  };
  const replayPolicy = input.historicalReplay.policy ?? { requiredCategories: [] };
  const probePolicy = input.interactionProbes.policy ?? { minimumPerModule: 1 };
  const requiredModules = unique(input.benchmark.scenarios.map((scenario) => scenario.module));
  const replayCategories = unique(historicalResults.map((entry) => entry.actualCategory));
  const accepted = scenarios.length > 0
    && historicalResults.length > 0
    && probes.length > 0
    && coverageModules.length >= benchmarkPolicy.minimumModules
    && requiredModules.every((module) => {
      const entry = coverageModules.find((candidate) => candidate.module === module);
      return Boolean(entry)
        && entry!.mutationScenarios >= benchmarkPolicy.minimumScenariosPerModule
        && entry!.interactionProbes >= probePolicy.minimumPerModule;
    })
    && benchmarkPolicy.requiredFindingCodes.every((code) => findingCodes.includes(code))
    && replayPolicy.requiredCategories.every((category) => replayCategories.includes(category))
    && Object.entries(metrics).every(([key, value]) => (
      key.startsWith('false') ? value === 0 : value === 1
    ))
    && scenarios.every((entry) => entry.accepted)
    && probes.every((probe) => (
      probe.capabilityIds[0] === 'navigation.sidebar.open' && probe.status === 'observed'
    ));

  const cleanDiff = diffProductCenterPageContractObservations(input.baseline, input.baseline);

  return {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-drift-lab' as const,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status: accepted ? 'accepted' as const : 'review-required' as const,
    summary: {
      mutationScenarios: scenarios.length,
      historicalReplays: historicalResults.length,
      modules: coverageModules.length,
      interactionProbes: probes.length,
      executionTiers: executionPlan.length,
      impactRecipeCases: unique((input.impactRecipes ?? input.recipes).map((entry) => entry.caseId)).length,
    },
    metrics,
    cleanControl: {
      status: cleanDiff.status,
      findings: cleanDiff.summary.findings,
      changed: cleanDiff.changed,
    },
    coverage: {
      modules: coverageModules,
      findingCodes,
    },
    scenarios,
    historicalReplay: {
      results: historicalResults,
    },
    probes,
    executionPlan,
    contractMutationAllowed: false as const,
    businessRuleMutationAllowed: false as const,
  };
}

function evaluateScenario(
  baseline: ProductCenterPageContractObservation,
  recipes: readonly ProductCenterPageContractRecipeInput[],
  impactRecipes: readonly ProductCenterPageContractRecipeInput[],
  scenario: ProductCenterDriftScenario,
) {
  const currentRecipes = recipes.map(cloneRecipe);
  const evidenceEntries = baseline.observations.map(toEvidence);
  const acceptedCaseIds = baseline.observations.map((entry) => entry.caseId);
  const mutations = Array.isArray((scenario as ProductCenterDriftScenario & {
    mutations?: ProductCenterDriftScenario['mutation'][];
  }).mutations)
    ? (scenario as ProductCenterDriftScenario & {
      mutations: ProductCenterDriftScenario['mutation'][];
    }).mutations
    : [scenario.mutation];
  for (const mutation of mutations) {
    applyMutation(
      { currentRecipes, evidenceEntries, acceptedCaseIds },
      { ...scenario, mutation },
    );
  }
  const current = buildProductCenterPageContractObservation({
    recipes: currentRecipes,
    evidenceEntries,
    acceptance: {
      accepted: true,
      acceptedCaseIds,
      issues: [],
      safety: {
        incompleteCheckpoints: 0,
        sensitiveFindings: 0,
        authStateArtifacts: 0,
        forbiddenPatterns: 0,
      },
    },
    recipeFingerprint: fingerprint(currentRecipes),
    evidenceFingerprint: fingerprint(evidenceEntries),
  });
  const diff = diffProductCenterPageContractObservations(baseline, current);
  const benchmarkImpact = buildProductCenterPageContractImpact(
    diff,
    mergeRecipes(recipes, currentRecipes),
  );
  const portfolioImpact = buildProductCenterPageContractImpact(
    diff,
    mergeRecipes(impactRecipes, currentRecipes),
  );
  const actualFindingCodes = unique(diff.findings.map((finding) => finding.code));
  const actualImpactedCaseIds = unique(benchmarkImpact.impactedCases.map((entry) => entry.caseId));
  const repairDisposition = decideProductCenterRepairDisposition(actualFindingCodes);
  const findingCodesCorrect = sameSet(actualFindingCodes, scenario.expectedFindingCodes);
  const impactedCasesCorrect = sameSet(actualImpactedCaseIds, scenario.expectedImpactedCaseIds);
  const repairDecisionCorrect = repairDisposition === scenario.expectedRepairDisposition;
  return {
    id: scenario.id,
    module: scenario.module,
    caseId: scenario.caseId,
    mutationKind: scenario.mutation.kind,
    expectedFindingCodes: unique(scenario.expectedFindingCodes),
    actualFindingCodes,
    expectedImpactedCaseIds: unique(scenario.expectedImpactedCaseIds),
    actualImpactedCaseIds,
    portfolioImpactedCaseIds: unique(portfolioImpact.impactedCases.map((entry) => entry.caseId)),
    expectedRepairDisposition: scenario.expectedRepairDisposition,
    repairDisposition,
    findingCodesCorrect,
    impactedCasesCorrect,
    repairDecisionCorrect,
    accepted: findingCodesCorrect && impactedCasesCorrect && repairDecisionCorrect,
    contractMutationAllowed: false as const,
    businessRuleMutationAllowed: false as const,
    sourceRef: scenario.sourceEvidence.ref,
  };
}

function applyMutation(
  state: {
    currentRecipes: ProductCenterPageContractRecipeInput[];
    evidenceEntries: ProductCenterPageContractEvidenceInput[];
    acceptedCaseIds: string[];
  },
  scenario: ProductCenterDriftScenario,
): void {
  const recipeIndex = state.currentRecipes.findIndex((entry) => entry.caseId === scenario.caseId);
  const evidenceIndex = state.evidenceEntries.findIndex((entry) => entry.caseId === scenario.caseId);
  if (recipeIndex < 0 || evidenceIndex < 0) throw new Error(`漂移样本引用未知 caseId：${scenario.caseId}`);
  const recipe = state.currentRecipes[recipeIndex];
  const evidence = state.evidenceEntries[evidenceIndex];
  const value = scenario.mutation.value;

  switch (scenario.mutation.kind) {
    case 'api-signature':
      evidence.technicalSignals = {
        apiSignatureStatus: 'observed',
        apiSignatureFingerprint: fingerprint(requiredString(value, scenario.id)),
      };
      break;
    case 'assertion-adapter':
      evidence.execution = {
        ...evidence.execution,
        assertionAdapterIds: replaceSecond(
          evidence.execution?.assertionAdapterIds ?? [],
          requiredString(value, scenario.id),
        ),
      };
      break;
    case 'capability':
      evidence.execution = {
        ...evidence.execution,
        capabilityIds: replaceSecond(
          evidence.execution?.capabilityIds ?? [],
          requiredString(value, scenario.id),
        ),
      };
      break;
    case 'claim-coverage':
      evidence.claimCoverageComplete = false;
      break;
    case 'hidden-ui':
      evidence.visibleUi = { ...evidence.visibleUi, observableVisibility: 'hidden' };
      break;
    case 'locator-count':
      evidence.locatorUniqueness = {
        ...evidence.locatorUniqueness,
        [scenario.mutation.key ?? 'mutationTargetCount']: requiredNumber(value, scenario.id),
      };
      break;
    case 'navigation-arrival': {
      const path = requiredString(value, scenario.id);
      evidence.navigation = {
        ...evidence.navigation,
        arrivedPath: path,
        verifiedPaths: [path],
      };
      evidence.visibleUi = { ...evidence.visibleUi, route: path };
      break;
    }
    case 'navigation-mode':
      evidence.navigation = { ...evidence.navigation, mode: requiredString(value, scenario.id) };
      break;
    case 'observation-added': {
      const addedCaseId = `${scenario.caseId}:controlled-added`;
      const addedRecipe: ProductCenterPageContractRecipeInput = {
        ...cloneRecipe(recipe),
        id: `${recipe.id}:controlled-added`,
        caseId: addedCaseId,
        sourceIds: [`drift-fixture:${scenario.id}`],
      };
      state.currentRecipes.push(addedRecipe);
      state.evidenceEntries.push({
        ...cloneEvidence(evidence),
        recipeId: addedRecipe.id,
        caseId: addedCaseId,
      });
      state.acceptedCaseIds.push(addedCaseId);
      break;
    }
    case 'observation-missing':
      state.currentRecipes.splice(recipeIndex, 1);
      state.evidenceEntries.splice(evidenceIndex, 1);
      removeValue(state.acceptedCaseIds, scenario.caseId);
      break;
    case 'runtime-acceptance':
      removeValue(state.acceptedCaseIds, scenario.caseId);
      break;
    case 'route-fingerprint':
      if (!evidence.release) throw new Error(`漂移样本缺少 release evidence：${scenario.id}`);
      evidence.release = {
        ...evidence.release,
        routeFingerprint: fingerprint(requiredString(value, scenario.id)),
      };
      break;
    case 'semantic-key':
      evidence.visibleUi = {
        ...evidence.visibleUi,
        semanticKey: 'expected-visible-record',
        observableSemanticKey: requiredString(value, scenario.id),
      };
      break;
    case 'source-mapping':
      state.currentRecipes[recipeIndex] = {
        ...recipe,
        sourceIds: [...recipe.sourceIds, requiredString(value, scenario.id)],
      };
      break;
    default:
      assertNever(scenario.mutation.kind);
  }
}

function toEvidence(
  entry: ProductCenterPageContractObservation['observations'][number],
): ProductCenterPageContractEvidenceInput {
  return {
    recipeId: entry.recipeId,
    caseId: entry.caseId,
    navigation: {
      mode: entry.navigation.mode,
      targetPath: entry.navigation.targetPath,
      arrivedPath: entry.navigation.arrivedPath,
      verifiedPaths: [...entry.navigation.verifiedPaths],
    },
    visibleUi: { route: entry.visibleUiRoute },
    locatorUniqueness: { ...entry.locatorCounts },
    execution: {
      capabilityIds: [...entry.capabilityIds],
      assertionAdapterIds: [...entry.assertionAdapterIds],
    },
    claimCoverageComplete: entry.claimCoverageComplete,
    sidebarEntryVerified: entry.sidebarEntryVerified,
    ...(entry.release ? {
      release: {
        schemaVersion: '1.0.0',
        source: 'browser-runtime',
        runId: 'DRIFT_LAB_BASELINE',
        observedAt: entry.release.observedAt,
        applicationFingerprint: entry.release.applicationFingerprint,
        environmentFingerprint: entry.release.environmentFingerprint,
        routeFingerprint: entry.release.routeFingerprint,
        signals: {
          titleFingerprint: '',
          language: '',
          metaFingerprints: [],
          resourcePathFingerprints: [],
        },
      },
    } : {}),
    ...(entry.browserSignals ? { browserSignals: { ...entry.browserSignals } } : {}),
    ...(entry.technicalSignals ? { technicalSignals: { ...entry.technicalSignals } } : {}),
  };
}

export function decideProductCenterRepairDisposition(
  findingCodes: readonly ProductCenterPageContractFindingCode[],
): ProductCenterRepairDisposition {
  if (findingCodes.some((code) => [
    'CLAIM_EVIDENCE_INCOMPLETE',
    'PAGE_OBSERVATION_MISSING',
    'RUNTIME_ACCEPTANCE_MISSING',
    'SOURCE_MAPPING_DRIFT',
  ].includes(code))) return 'block-and-review';
  if (findingCodes.includes('PAGE_OBSERVATION_ADDED')) return 'baseline-promotion-review';
  return 'technical-proposal';
}

function buildExecutionPlan() {
  return [
    {
      id: 'static-contract' as const,
      ui: false,
      trigger: 'every-change' as const,
      maximumRuns: 1,
      purpose: '来源、类型、合同、敏感信息与 mutation 基准检查',
    },
    {
      id: 'page-contract-probe' as const,
      ui: true,
      trigger: 'contract-or-page-change' as const,
      maximumRuns: 1,
      purpose: '先走侧边栏的只读或可清理交互原型观测',
    },
    {
      id: 'impacted-ui' as const,
      ui: true,
      trigger: 'detected-impact' as const,
      maximumRuns: 1,
      purpose: '只运行受影响 Recipe 并形成受控修复证据',
    },
    {
      id: 'final-full' as const,
      ui: true,
      trigger: 'approved-repair-or-release-baseline' as const,
      maximumRuns: 1,
      purpose: '审批后或发布基线前执行一次完整集合',
    },
  ];
}

function validateCollections(input: BuildInput): void {
  assertUniqueIds(input.benchmark.scenarios.map((entry) => entry.id), '漂移场景');
  assertUniqueIds(input.historicalReplay.replays.map((entry) => entry.id), '历史回放');
  assertUniqueIds(input.interactionProbes.probes.map((entry) => entry.id), '交互 Probe');
  const recipeByCaseId = new Map((input.impactRecipes ?? input.recipes)
    .map((recipe) => [recipe.caseId, recipe]));
  for (const scenario of input.benchmark.scenarios) {
    if (scenario.generationAllowed || scenario.contractMutationAllowed || scenario.businessRuleMutationAllowed) {
      throw new Error(`漂移场景不得允许生成或自动修改合同/业务规则：${scenario.id}`);
    }
  }
  for (const probe of input.interactionProbes.probes) {
    const recipe = recipeByCaseId.get(probe.caseId);
    if (!recipe) throw new Error(`交互 Probe 引用未知 caseId：${probe.id}`);
    if (probe.route !== recipe.route) throw new Error(`交互 Probe 路由与 Recipe 不一致：${probe.id}`);
    if (probe.capabilityIds[0] !== 'navigation.sidebar.open') {
      throw new Error(`交互 Probe 第一 capability 必须是 navigation.sidebar.open：${probe.id}`);
    }
  }
}

function countExpectedAndActual(expectedGroups: readonly string[][], actualGroups: readonly string[][]) {
  let expected = 0;
  let actual = 0;
  let truePositive = 0;
  for (let index = 0; index < expectedGroups.length; index += 1) {
    const expectedSet = new Set(expectedGroups[index]);
    const actualSet = new Set(actualGroups[index] ?? []);
    expected += expectedSet.size;
    actual += actualSet.size;
    truePositive += [...expectedSet].filter((value) => actualSet.has(value)).length;
  }
  return { expected, actual, truePositive };
}

function cloneRecipe(recipe: ProductCenterPageContractRecipeInput): ProductCenterPageContractRecipeInput {
  return {
    ...recipe,
    sourceIds: [...recipe.sourceIds],
    capabilities: recipe.capabilities.map((entry) => ({ ...entry })),
    assertions: recipe.assertions.map((entry) => ({ ...entry })),
  };
}

function cloneEvidence(evidence: ProductCenterPageContractEvidenceInput): ProductCenterPageContractEvidenceInput {
  return JSON.parse(JSON.stringify(evidence)) as ProductCenterPageContractEvidenceInput;
}

function mergeRecipes(
  baselineRecipes: readonly ProductCenterPageContractRecipeInput[],
  currentRecipes: readonly ProductCenterPageContractRecipeInput[],
): ProductCenterPageContractRecipeInput[] {
  const merged = new Map(baselineRecipes.map((recipe) => [recipe.caseId, cloneRecipe(recipe)]));
  for (const recipe of currentRecipes) merged.set(recipe.caseId, cloneRecipe(recipe));
  return [...merged.values()];
}

function replaceSecond(values: readonly string[], replacement: string): string[] {
  const result = [...values];
  const index = result.length > 1 ? 1 : 0;
  result[index] = replacement;
  return result;
}

function removeValue(values: string[], value: string): void {
  const index = values.indexOf(value);
  if (index >= 0) values.splice(index, 1);
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(unique(left)) === JSON.stringify(unique(right));
}

function assertUniqueIds(ids: readonly string[], label: string): void {
  if (new Set(ids).size !== ids.length) throw new Error(`${label}存在重复 ID`);
}

function requiredString(value: unknown, scenarioId: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`漂移场景缺少字符串值：${scenarioId}`);
  return value;
}

function requiredNumber(value: unknown, scenarioId: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`漂移场景缺少数值：${scenarioId}`);
  return value;
}

function assertNever(value: never): never {
  throw new Error(`未知漂移 mutation：${String(value)}`);
}
