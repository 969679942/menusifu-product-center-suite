import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { productCenterContractModules } from '../contracts/product-center/modules';
import {
  auditProductCenterTestCaseExecutability,
} from '../utils/product-center-test-case-executability';
import {
  auditProductCenterTestCaseSemantics,
} from '../utils/product-center-test-case-semantics';
import type {
  ProductCenterTestCaseClaim,
  ProductCenterTestCaseInput,
} from '../utils/product-center-test-case-ir';
import {
  diagnoseProductCenterMarkdownTestPlan,
} from '../utils/product-center-test-plan-markdown';
import {
  buildProductCenterMarkdownRepairQueue,
  buildProductCenterGenerationPortfolio,
  buildProductCenterLegacyMigrationPlan,
  evaluateSegmentedGenerationQuality,
  normalizeProductCenterAcceptanceStatus,
  type ProductCenterGenerationPortfolioSample,
  type ProductCenterGenerationScenario,
} from '../utils/product-center-quality-program';
import {
  buildProductCenterAcceptanceTrend,
  buildProductCenterControlledRepairApprovalGate,
  buildProductCenterControlledRepairPlan,
  mergeProductCenterAcceptanceRuns,
  type ProductCenterAcceptanceRun,
} from '../utils/product-center-quality-operations';
import { buildProductCenterIncrementalTestPlan } from '../utils/product-center-incremental-test-plan';
import {
  auditUtf8Artifact,
  buildProductCenterArtifactRetentionAudit,
  type ProductCenterArtifactKind,
} from '../utils/product-center-artifact-governance';
import {
  buildProductCenterReviewRepairContract,
} from '../utils/product-center-test-case-review-queue';
import {
  buildProductCenterUnsupportedSourceDecisions,
} from './audit-product-center-unsupported-sources';
import {
  productCenterTestPlanModuleDirectories,
} from '../utils/product-center-test-plan-source';

type NegativeFixture = {
  caseId: string;
  module: string;
  scenario: ProductCenterGenerationScenario;
  probeKind:
    | 'markdown-format'
    | 'missing-source-trace'
    | 'semantic-action'
    | 'semantic-expectation'
    | 'unknown-capability';
  text: string;
  expectedIssueCode: string;
  expectedDecision: 'generated' | 'review-required';
};

const formalSourceFiles = [
  { module: 'brand-item', sourceDirectory: productCenterTestPlanModuleDirectories.item, fileName: '1.商品中心-商品管理-商品-正式测试用例.md' },
  { module: 'brand-group', sourceDirectory: productCenterTestPlanModuleDirectories.group, fileName: '2.商品中心-商品管理-组-正式测试用例.md' },
  { module: 'brand-seasoning', sourceDirectory: productCenterTestPlanModuleDirectories.seasoning, fileName: '3.商品中心-商品管理-调味管理-正式测试用例.md' },
  { module: 'brand-tag', sourceDirectory: productCenterTestPlanModuleDirectories.tag, fileName: '4.商品中心-商品管理-标签管理-正式测试用例.md' },
  { module: 'brand-item', sourceDirectory: productCenterTestPlanModuleDirectories.image, fileName: '5.商品中心-商品管理-图片管理-正式测试用例.md' },
] as const;

export async function buildProductCenterQualityProgramArtifacts(options: {
  projectRoot?: string;
  sourceRoot?: string;
  outputRoot?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const sourceRoot = path.resolve(options.sourceRoot ?? path.join(
    projectRoot,
    '..',
    'Merchant Center Info',
    '00-待转换测试方案',
    '用例库',
  ));
  const infoRoot = path.resolve(sourceRoot, '..', '..');
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const generatedAt = new Date().toISOString();

  const paths = {
    reportPath: path.join(outputRoot, 'output/test-case-audit/product-center/quality-program-latest.json'),
    historyPath: path.join(outputRoot, 'output/recipes/product-center-acceptance-history.json'),
    trendPath: path.join(outputRoot, 'output/recipes/product-center-acceptance-trend.json'),
    repairPath: path.join(outputRoot, 'output/maintenance/product-center-controlled-repair-plan.json'),
    governancePath: path.join(outputRoot, 'output/governance/product-center-artifact-governance.json'),
    diagnosticRepairQueuePath: path.join(
      outputRoot,
      'output/test-case-audit/product-center/test-plan-repair-queue.json',
    ),
    approvalGatePath: path.join(
      outputRoot,
      'output/maintenance/product-center-controlled-repair-approval-gate.json',
    ),
    sourceDecisionPath: path.join(
      outputRoot,
      'contracts/product-center/reviews/unsupported-source-format-decisions.json',
    ),
  };
  const sourceInventory = await buildSourceCandidateInventory(sourceRoot);
  const sourceDecisionPath = await buildProductCenterUnsupportedSourceDecisions({
    projectRoot,
    infoRoot,
    outputRoot,
  });
  if (sourceDecisionPath !== paths.sourceDecisionPath) {
    throw new Error('不支持来源格式决策产物路径不一致');
  }
  const sourceDecisions = await readJson(sourceDecisionPath);
  const diagnosticRepairQueue = attachSourceDecisions(
    buildProductCenterMarkdownRepairQueue(
      sourceInventory.files.map((file) => ({
        module: file.module,
        path: file.relativePath,
        issues: file.diagnostics.issues,
      })),
    ),
    sourceDecisions,
  );
  await writeJson(paths.diagnosticRepairQueuePath, {
    schemaVersion: '1.0.0',
    generatedAt,
    ...diagnosticRepairQueue,
  });
  const [goldDocument, goldReport, generationReport, existingCases, fixturesDocument] = await Promise.all([
    readJson(path.join(projectRoot, 'contracts/product-center/test-cases/pilots/product-center-test-plan-gold-set.json')),
    readJson(path.join(projectRoot, 'output/test-case-audit/product-center/test-plan-gold-set-latest.json')),
    readJson(path.join(projectRoot, 'output/test-case-audit/product-center/test-plan-generation-v1-latest.json')),
    readJson(path.join(projectRoot, 'contracts/product-center/test-cases/product-center-existing-sop-cases.json')),
    readJson(path.join(projectRoot, 'contracts/product-center/test-cases/product-center-generation-negative-fixtures.json')),
  ]);
  const fixtures = fixturesDocument.fixtures as NegativeFixture[];
  const fixtureDecisions = fixtures.map(evaluateNegativeFixture);
  const realSamples = (goldReport.generationGate.generated as Array<{ caseId: string; module: string }>).map((item) => ({
    caseId: item.caseId,
    module: item.module,
    cohort: 'real-source' as const,
    scenario: realScenario(item.caseId),
  }));
  const fixtureSamples = fixtures.map((fixture) => ({
    caseId: fixture.caseId,
    module: fixture.module,
    cohort: 'negative-fixture' as const,
    scenario: fixture.scenario,
  }));
  const portfolio = buildProductCenterGenerationPortfolio({
    moduleIds: productCenterContractModules.map((module) => module.id),
    samples: [...realSamples, ...fixtureSamples],
    requiredScenarios: ['positive', 'boundary', 'blocked', 'review-required', 'format-drift'],
  });
  const holdoutSamples = generationReport.holdoutEvaluation?.samples as Array<{
    caseId: string;
    cohort: 'real-source' | 'negative-fixture';
    expectedDecision: 'generated' | 'review-required';
    actualDecision: 'generated' | 'review-required';
    labelSource: string;
  }> | undefined;
  if (!holdoutSamples || holdoutSamples.length === 0
    || holdoutSamples.some((sample) => sample.labelSource !== 'human-reviewed-holdout')) {
    throw new Error('生成质量评测缺少独立人工标注 Holdout');
  }
  const segmentedGenerationQuality = evaluateSegmentedGenerationQuality([
    ...holdoutSamples.map((sample) => ({
      caseId: sample.caseId,
      cohort: sample.cohort,
      expectedDecision: sample.expectedDecision,
      actualDecision: sample.actualDecision,
    })),
    ...fixtureDecisions.map((item) => ({
      caseId: item.caseId,
      cohort: 'negative-fixture' as const,
      expectedDecision: item.expectedDecision,
      actualDecision: item.actualDecision,
    })),
  ]);
  const legacyMigration = buildProductCenterLegacyMigrationPlan({
    cases: existingCases.cases,
    modulesWithFormalSources: new Set(sourceInventory.modules),
  });
  const reviewRepairContract = buildProductCenterReviewRepairContract();

  const acceptance = await buildAcceptanceArtifacts({ projectRoot, outputRoot, paths, existingCases, goldDocument });
  const repair = await buildRepairArtifact(projectRoot);
  const closure = await readOptionalJson(path.join(
    projectRoot,
    'output/maintenance/product-center-controlled-repair-closure.json',
  ));
  if (closure && closure.planFingerprint !== repair.approvalGate.incrementalRegression.planFingerprint) {
    throw new Error('受控修复 closure 与当前增量计划指纹不一致');
  }
  await writeJson(paths.repairPath, {
    schemaVersion: '1.0.0',
    generatedAt,
    ...repair.plan,
  });
  await writeJson(paths.approvalGatePath, {
    schemaVersion: '1.0.0',
    generatedAt,
    ...repair.approvalGate,
  });
  const governance = await buildGovernanceArtifact(projectRoot, sourceInventory.files, generatedAt);
  await writeJson(paths.governancePath, governance);
  const executionStatus = [
    { item: 1, status: portfolio.gaps.missingRealSourceModules.length > 0 ? 'in-progress' : 'implemented' },
    { item: 2, status: 'implemented' },
    { item: 3, status: legacyMigration.summary.legacyCases > 0 ? 'in-progress' : 'implemented' },
    { item: 4, status: 'implemented' },
    { item: 5, status: acceptance.trend.summary.insufficientDataCases > 0 ? 'in-progress' : 'implemented' },
    { item: 6, status: sourceInventory.files.some((file) => file.diagnostics.issues.length > 0) ? 'in-progress' : 'implemented' },
    { item: 7, status: 'implemented' },
    { item: 8, status: 'implemented' },
    { item: 9, status: governance.utf8.summary.invalid === 0 ? 'implemented' : 'in-progress' },
    { item: 10, status: governance.retention.cleanupAlerts.length > 0 ? 'in-progress' : 'implemented' },
  ] as const;
  const testGenerationProductReady = segmentedGenerationQuality.overall.summary.decisionAccuracy === 1
    && segmentedGenerationQuality.overall.summary.falsePromotions === 0
    && legacyMigration.summary.legacyClaims === 0
    && diagnosticRepairQueue.summary.totalItems === 0
    && sourceDecisions.summary.blockedCases === 0;

  const report = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-quality-program',
    generatedAt,
    status: portfolio.readyForScale && legacyMigration.summary.legacyCases === 0
      ? 'passed'
      : 'action-required',
    portfolio,
    sourceCandidateInventory: {
      summary: sourceInventory.summary,
      files: sourceInventory.files.map((file) => ({
        module: file.module,
        path: file.relativePath,
        fingerprint: file.fingerprint,
        caseCount: file.caseCount,
        structurallyValidCaseCount: file.structurallyValidCaseCount,
      })),
    },
    segmentedGenerationQuality,
    negativeFixtureResults: fixtureDecisions,
    legacyMigration,
    reviewRepairContract,
    markdownDiagnostics: {
      summary: {
        files: sourceInventory.files.length,
        cases: sourceInventory.files.reduce((sum, file) => sum + file.caseCount, 0),
        filesWithIssues: sourceInventory.files.filter((file) => file.diagnostics.issues.length > 0).length,
        issues: sourceInventory.files.reduce((sum, file) => sum + file.diagnostics.issues.length, 0),
      },
      files: sourceInventory.files.map((file) => ({
        path: file.relativePath,
        status: file.diagnostics.status,
        summary: file.diagnostics.summary,
        issues: file.diagnostics.issues,
        guardrails: file.diagnostics.guardrails,
      })),
      repairQueueSummary: diagnosticRepairQueue.summary,
    },
    sourceDecisionSummary: sourceDecisions.summary,
    testPlanGenerationWorkstream: {
      id: 'test-plan-to-test-case-generation',
      status: 'active',
      currentGoalBlocking: true,
      backlog: {
        blockedSources: sourceDecisions.summary.blockedCases,
        missingSections: diagnosticRepairQueue.summary.byCode.MISSING_SECTION ?? 0,
        nonNumberedSteps: diagnosticRepairQueue.summary.byCode.NON_NUMBERED_STEP ?? 0,
        legacyClaims: legacyMigration.summary.legacyClaims,
      },
    },
    readiness: {
      testGenerationProductReady,
      blockingItems: {
        blockedSources: sourceDecisions.summary.blockedCases,
        diagnosticCases: diagnosticRepairQueue.summary.totalItems,
        legacyClaims: legacyMigration.summary.legacyClaims,
      },
    },
    unsupportedSourceAudit: {
      guardrails: sourceDecisions.guardrails,
      sourcePolicy: sourceDecisions.sourcePolicy,
      decisionPath: path.relative(outputRoot, paths.sourceDecisionPath).replace(/\\/g, '/'),
    },
    incrementalAcceptance: acceptance.trend,
    controlledRepair: {
      impactedCases: repair.plan.impactedCases,
      impactedRecipes: repair.plan.impactedRecipes,
      proposalCount: repair.plan.proposals.length,
      guardrails: repair.plan.guardrails,
      approvalStatus: repair.approvalGate.status,
      incrementalRegressionAllowed: repair.approvalGate.executionAllowed,
      closureStatus: closure?.status ?? 'not-closed',
      closedProposalIds: closure?.closedProposalIds ?? [],
    },
    utf8: governance.utf8.summary,
    artifactRetention: governance.retention.summary,
    executionStatus,
    completion: {
      implementedItems: executionStatus.filter((item) => item.status === 'implemented').map((item) => item.item),
      inProgressItems: executionStatus.filter((item) => item.status === 'in-progress').map((item) => item.item),
      dataGapsRemain: portfolio.gaps.missingRealSourceModules.length > 0
        || legacyMigration.summary.legacyCases > 0
        || acceptance.trend.summary.insufficientDataCases > 0
        || governance.retention.cleanupAlerts.length > 0,
    },
  };
  await writeJson(paths.reportPath, report);
  return paths;
}

async function buildSourceCandidateInventory(sourceRoot: string) {
  const infoRoot = path.resolve(sourceRoot, '..', '..');
  const files = await Promise.all(formalSourceFiles.map(async (source) => {
    const sourceDirectory = path.join(sourceRoot, source.sourceDirectory);
    const filePath = path.join(sourceDirectory, source.fileName);
    const content = await readFile(filePath);
    const markdown = content.toString('utf8');
    const diagnostics = diagnoseProductCenterMarkdownTestPlan(markdown);
    const structuralValidity = summarizeProductCenterMarkdownStructuralValidity(
      diagnostics.caseCount,
      diagnostics.issues,
    );
    return {
      module: source.module,
      filePath,
      relativePath: path.relative(infoRoot, filePath).replace(/\\/g, '/'),
      fingerprint: createHash('sha256').update(content).digest('hex'),
      caseCount: diagnostics.caseCount,
      structurallyValidCaseCount: structuralValidity.structurallyValidCaseCount,
      invalidCaseIds: structuralValidity.invalidCaseIds,
      documentIssueCount: structuralValidity.documentIssueCount,
      issueCaseIdsByCode: structuralValidity.issueCaseIdsByCode,
      diagnostics,
      content,
    };
  }));
  return {
    summary: {
      files: files.length,
      cases: files.reduce((sum, file) => sum + file.caseCount, 0),
      modules: new Set(files.map((file) => file.module)).size,
      structurallyValidCases: files.reduce((sum, file) => sum + file.structurallyValidCaseCount, 0),
      invalidUniqueCases: files.reduce((sum, file) => sum + file.invalidCaseIds.length, 0),
      diagnosticIssues: files.reduce((sum, file) => sum + file.diagnostics.issues.length, 0),
      uniqueCasesByIssueCode: mergeIssueCaseCounts(files),
    },
    modules: [...new Set(files.map((file) => file.module))],
    files,
  };
}

export function summarizeProductCenterMarkdownStructuralValidity(
  caseCount: number,
  issues: ReadonlyArray<{ code: string; caseId?: string }>,
) {
  const invalidCaseIds = [...new Set(issues
    .map((issue) => issue.caseId)
    .filter((caseId): caseId is string => Boolean(caseId)))].sort();
  const documentIssueCount = issues.filter((issue) => !issue.caseId).length;
  const issueCaseIdsByCode = Object.fromEntries([...new Set(issues.map((issue) => issue.code))]
    .sort()
    .map((code) => [
      code,
      [...new Set(issues
        .filter((issue) => issue.code === code)
        .map((issue) => issue.caseId)
        .filter((caseId): caseId is string => Boolean(caseId)))].sort(),
    ]));
  return {
    structurallyValidCaseCount: documentIssueCount > 0
      ? 0
      : Math.max(0, caseCount - invalidCaseIds.length),
    invalidCaseIds,
    documentIssueCount,
    issueCaseIdsByCode,
  };
}

function mergeIssueCaseCounts(files: ReadonlyArray<{
  issueCaseIdsByCode: Record<string, string[]>;
}>): Record<string, number> {
  const caseIdsByCode = new Map<string, Set<string>>();
  for (const file of files) {
    for (const [code, caseIds] of Object.entries(file.issueCaseIdsByCode)) {
      const values = caseIdsByCode.get(code) ?? new Set<string>();
      caseIds.forEach((caseId) => values.add(caseId));
      caseIdsByCode.set(code, values);
    }
  }
  return Object.fromEntries([...caseIdsByCode.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, caseIds]) => [code, caseIds.size]));
}

function attachSourceDecisions(queue: any, decisionDocument: any) {
  const decisions = new Map<string, any>(
    (decisionDocument.cases ?? []).map((item: any) => [item.caseId, item]),
  );
  const groups = queue.groups.map((group: any) => {
    if (group.code !== 'UNSUPPORTED_SOURCE_FORMAT') return group;
    const items = group.items.map((item: any) => {
      const decision = decisions.get(item.caseId);
      if (!decision) throw new Error(`来源修复队列缺少审计决策：${item.caseId}`);
      return {
        ...item,
        owner: decision.owner,
        sourceDecisionStatus: decision.status,
        citations: decision.citations,
        evidenceFiles: decision.evidenceFiles,
        ...(decision.blockCode ? { blockCode: decision.blockCode } : {}),
        ...(decision.blockReason ? { blockReason: decision.blockReason } : {}),
      };
    });
    return {
      ...group,
      sourceDecisionSummary: decisionDocument.summary,
      items,
    };
  });
  const unsupportedItems = queue.groups.find(
    (group: any) => group.code === 'UNSUPPORTED_SOURCE_FORMAT',
  )?.items ?? [];
  if (decisions.size !== unsupportedItems.length) {
    throw new Error(
      `来源审计决策与剩余诊断数量不一致：decisions=${decisions.size};diagnostics=${unsupportedItems.length}`,
    );
  }
  return {
    ...queue,
    sourceDecisionSummary: decisionDocument.summary,
    groups,
  };
}

function evaluateNegativeFixture(fixture: NegativeFixture) {
  let issueCodes: string[] = [];
  if (fixture.probeKind === 'markdown-format') {
    const diagnostics = diagnoseProductCenterMarkdownTestPlan(markdownFixture(fixture));
    issueCodes = diagnostics.issues.map((issue) => issue.code);
  } else {
    const testCase = semanticFixture(fixture);
    const semantics = auditProductCenterTestCaseSemantics([testCase], {
      knownSourceIds: new Set(['fixture:source']),
      requireSourceTrace: true,
    });
    const executability = auditProductCenterTestCaseExecutability([testCase], {
      roleIds: new Set(['merchant-center-product-admin']),
      environmentIds: new Set(['balamxqa']),
      capabilityIds: new Set(['navigation.sidebar.open', 'coreCreate.execute']),
    });
    issueCodes = [
      ...semantics.cases.flatMap((item) => item.issues.map((issue) => issue.code)),
      ...executability.cases.flatMap((item) => item.issues.map((issue) => issue.code)),
    ];
  }
  const actualDecision = issueCodes.length === 0 ? 'generated' as const : 'review-required' as const;
  return {
    caseId: fixture.caseId,
    module: fixture.module,
    scenario: fixture.scenario,
    expectedDecision: fixture.expectedDecision,
    actualDecision,
    expectedIssueCode: fixture.expectedIssueCode,
    issueCodes: [...new Set(issueCodes)].sort(),
    expectedIssueObserved: issueCodes.includes(fixture.expectedIssueCode),
  };
}

function semanticFixture(fixture: NegativeFixture): ProductCenterTestCaseInput {
  const precondition = '已通过侧边栏进入目标模块。';
  const action = fixture.probeKind === 'semantic-action' || fixture.probeKind === 'missing-source-trace'
    ? fixture.text
    : '点击保存按钮提交记录。';
  const expectation = fixture.probeKind === 'semantic-expectation'
    ? fixture.text
    : '页面显示明确的保存终态。';
  const claims: ProductCenterTestCaseClaim[] = [
    claim(fixture, 'precondition', precondition),
    claim(fixture, 'action', action, fixture.probeKind === 'missing-source-trace'),
    claim(fixture, 'expectation', expectation),
  ];
  return {
    id: fixture.caseId,
    module: fixture.module,
    route: '/fixture/product-center',
    title: fixture.caseId,
    priority: 'P1',
    sourceIds: ['fixture:source'],
    sourceRefs: ['FIXTURE:negative-generation'],
    preconditions: [precondition],
    actions: [action],
    expectedResults: [expectation],
    mutatesData: false,
    cleanup: [],
    automationPreference: 'candidate',
    claims,
    coverageIds: ['coverage:fixture'],
    execution: {
      roleIds: ['merchant-center-product-admin'],
      environmentIds: ['balamxqa'],
      capabilityIds: fixture.probeKind === 'unknown-capability'
        ? ['navigation.sidebar.open', 'fixture.unknownCapability']
        : ['navigation.sidebar.open', 'coreCreate.execute'],
      mutationMode: 'none',
      verificationSignals: ['ui'],
      seedAdapterIds: [],
      cleanupAdapterIds: [],
      asyncPolicy: 'none',
    },
  };
}

function claim(
  fixture: NegativeFixture,
  kind: ProductCenterTestCaseClaim['kind'],
  text: string,
  omitTrace = false,
): ProductCenterTestCaseClaim {
  return {
    id: `claim:${fixture.caseId}:${kind}`,
    kind,
    text,
    sourceIds: ['fixture:source'],
    sourceRefs: ['FIXTURE:negative-generation'],
    evidenceLevel: 'confirmed',
    ...(!omitTrace ? {
      sourceTrace: {
        businessBasis: { kind: 'xmind-existing' as const, refs: ['FIXTURE:negative-generation'] },
        executionEvidence: [{ kind: 'contract-observed' as const, sourceIds: ['fixture:source'] }],
      },
    } : {}),
  };
}

function markdownFixture(fixture: NegativeFixture): string {
  return `### 用例编号：${fixture.caseId}\n用例标题：格式漂移夹具\n所属模块：${fixture.module}\n优先级：P1\n来源：XMind已有 ← fixture / format\n前置条件：\n1. 已登录\n测试步骤：\n${fixture.text}\n预期结果：\n1. 页面显示明确终态\n`;
}

function realScenario(caseId: string): ProductCenterGenerationScenario {
  if (caseId.includes('child-blocked')) return 'blocked';
  if (caseId.includes('max-length')) return 'boundary';
  return 'positive';
}

async function buildAcceptanceArtifacts(input: {
  projectRoot: string;
  outputRoot: string;
  paths: { historyPath: string; trendPath: string };
  existingCases: any;
  goldDocument: any;
}) {
  const [mainFeedback, mainAcceptance, goldFeedback, goldAcceptance] = await Promise.all([
    readJson(path.join(input.projectRoot, 'output/recipes/product-center-pilot-feedback.json')),
    readJson(path.join(input.projectRoot, 'output/recipes/product-center-pilot-acceptance.json')),
    readJson(path.join(input.projectRoot, 'output/recipes/product-center-test-plan-gold-set-feedback.json')),
    readJson(path.join(input.projectRoot, 'output/recipes/product-center-test-plan-gold-set-acceptance.json')),
  ]);
  const mainModules = new Map(input.existingCases.cases.map((item: any) => [item.id, item.module]));
  const goldModules = new Map(input.goldDocument.cases.map((item: any) => [item.id, item.module]));
  const currentRuns = [
    acceptanceRun('main', mainFeedback, mainAcceptance, mainModules),
    acceptanceRun('test-plan-gold-set', goldFeedback, goldAcceptance, goldModules),
  ];
  const previousDocument = await readOptionalJson(input.paths.historyPath);
  const previousRuns = (previousDocument?.runs ?? []) as ProductCenterAcceptanceRun[];
  const runs = mergeProductCenterAcceptanceRuns(previousRuns, currentRuns);
  const trend = buildProductCenterAcceptanceTrend(runs);
  await writeJson(input.paths.historyPath, { schemaVersion: '1.0.0', runs });
  await writeJson(input.paths.trendPath, {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    ...trend,
  });
  return { runs, trend };
}

function acceptanceRun(
  scope: string,
  feedback: any,
  acceptance: any,
  modules: Map<unknown, unknown>,
): ProductCenterAcceptanceRun {
  const generatedAt = String(feedback.generatedAt);
  const entries = feedback.entries.map((entry: any) => {
    const module = modules.get(entry.caseId);
    if (typeof module !== 'string') throw new Error(`验收趋势缺少模块映射：${entry.caseId}`);
    return {
      caseId: entry.caseId,
      module,
      status: normalizeProductCenterAcceptanceStatus(entry.status, entry.caseId),
    };
  });
  return {
    runId: typeof feedback.runId === 'string' ? feedback.runId : `${scope}:${generatedAt}`,
    scope: typeof feedback.scope === 'string' ? feedback.scope : scope,
    generatedAt,
    accepted: acceptance.accepted === true,
    entries,
  };
}

async function buildRepairArtifact(projectRoot: string) {
  const [diff, recipesDocument, contract, decisionDocument] = await Promise.all([
    readJson(path.join(projectRoot, 'contracts/product-center/product-center-contract-diff.json')),
    readJson(path.join(projectRoot, 'contracts/product-center/recipes/product-center-pilot-recipes.json')),
    readJson(path.join(projectRoot, 'contracts/product-center/product-center-test-contract.json')),
    readOptionalJson(path.join(
      projectRoot,
      'contracts/product-center/reviews/controlled-repair-decisions.json',
    )),
  ]);
  const plan = buildProductCenterControlledRepairPlan({
    changes: diff.changes,
    impactedCases: diff.impactedCaseDetails,
    recipes: recipesDocument.recipes.map((recipe: any) => ({
      id: recipe.id,
      caseId: recipe.caseId,
      route: recipe.route,
      capabilityIds: recipe.capabilities.map((capability: any) => capability.id),
    })),
  });
  const incrementalPlan = buildProductCenterIncrementalTestPlan(diff, contract, {
    recipeCaseIds: new Set(recipesDocument.recipes.map((recipe: any) => recipe.caseId)),
  });
  const decisions = Array.isArray(decisionDocument)
    ? decisionDocument
    : decisionDocument?.decisions ?? [];
  const approvalGate = buildProductCenterControlledRepairApprovalGate({
    repairPlan: plan,
    incrementalPlan,
    decisions,
  });
  return { plan, approvalGate };
}

async function buildGovernanceArtifact(
  projectRoot: string,
  sourceFiles: ReadonlyArray<{ relativePath: string; content: Buffer }>,
  generatedAt: string,
) {
  const keyArtifactPaths = [
    'output/recipes/product-center-pilot-feedback.json',
    'output/recipes/product-center-pilot-evidence.json',
    'output/recipes/product-center-pilot-acceptance.json',
    'output/recipes/product-center-test-plan-gold-set-feedback.json',
    'output/recipes/product-center-test-plan-gold-set-evidence.json',
    'output/recipes/product-center-test-plan-gold-set-acceptance.json',
  ];
  const utf8Records = [
    ...sourceFiles.map((file) => auditUtf8Artifact(file.relativePath, file.content)),
    ...(await Promise.all(keyArtifactPaths.map(async (relativePath) =>
      auditUtf8Artifact(relativePath, await readFile(path.join(projectRoot, relativePath)))))),
  ];
  const artifacts = await collectRetentionArtifacts(projectRoot);
  const retention = buildProductCenterArtifactRetentionAudit({ now: generatedAt, artifacts });
  return {
    schemaVersion: '1.0.0',
    generatedAt,
    utf8: {
      summary: {
        total: utf8Records.length,
        invalid: utf8Records.filter((item) => !item.validUtf8).length,
        withBom: utf8Records.filter((item) => item.hasBom).length,
        withReplacementCharacters: utf8Records.filter((item) => item.replacementCharacters > 0).length,
      },
      findings: utf8Records.filter((item) =>
        !item.validUtf8 || item.hasBom || item.replacementCharacters > 0),
    },
    retention,
  };
}

async function collectRetentionArtifacts(projectRoot: string) {
  const outputRoot = path.join(projectRoot, 'output');
  const files = await walkFiles(outputRoot);
  return Promise.all(files.flatMap((filePath) => {
    const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    const kind = artifactKind(relativePath);
    if (!kind) return [];
    return [retentionRecord(filePath, relativePath, kind)];
  }));
}

async function retentionRecord(filePath: string, relativePath: string, kind: ProductCenterArtifactKind) {
  const details = await stat(filePath);
  let checkpointPhase: string | undefined;
  if (kind === 'checkpoint') {
    try {
      const document = await readJson(filePath);
      const phases = collectProperty(document, 'phase').filter((value): value is string => typeof value === 'string');
      checkpointPhase = typeof document.nextStage === 'string'
        ? document.nextStage === 'complete' ? 'workflow-complete' : 'workflow-incomplete'
        : Array.isArray(document.entries) && document.entries.length === 0
        ? 'no-resources'
        : phases.length > 0 && phases.every((phase) => phase === 'residue-verified')
          ? 'residue-verified'
          : phases.find((phase) => phase !== 'residue-verified') ?? 'unknown';
    } catch {
      checkpointPhase = 'invalid-json';
    }
  }
  return {
    path: relativePath,
    kind,
    generatedAt: details.mtime.toISOString(),
    ...(checkpointPhase ? { checkpointPhase } : {}),
  };
}

function artifactKind(relativePath: string): ProductCenterArtifactKind | undefined {
  const normalized = relativePath.toLowerCase();
  if (normalized.includes('/checkpoints/')) return 'checkpoint';
  if (normalized.includes('/performance/')) return 'performance';
  if (normalized.includes('acceptance')) return 'acceptance';
  if (normalized.includes('evidence')) return 'evidence';
  if (normalized.endsWith('.json') || normalized.endsWith('.md')) return 'audit';
  return undefined;
}

async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  }));
  return nested.flat();
}

function collectProperty(value: unknown, property: string): unknown[] {
  if (Array.isArray(value)) return value.flatMap((item) => collectProperty(item, property));
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [
    ...(property in record ? [record[property]] : []),
    ...Object.values(record).flatMap((item) => collectProperty(item, property)),
  ];
}

async function readJson(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readOptionalJson(filePath: string): Promise<any | undefined> {
  try {
    return await readJson(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const paths = await buildProductCenterQualityProgramArtifacts();
  process.stdout.write(
    `商品中心十项质量改进产物已生成：\n${paths.reportPath}\n${paths.diagnosticRepairQueuePath}\n${paths.sourceDecisionPath}\n${paths.historyPath}\n${paths.trendPath}\n${paths.repairPath}\n${paths.approvalGatePath}\n${paths.governancePath}\n`,
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
