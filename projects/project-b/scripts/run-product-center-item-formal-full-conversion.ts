import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import type { ProductCenterItemXmindRebuildPlan } from '../utils/product-center-item-xmind-rebuild';
import type {
  ProductCenterCanonicalAutomationContractBatch,
  ProductCenterCanonicalAutomationContractEntry,
} from '../utils/product-center-canonical-automation-contract-batch';
import { scanGeneratedArtifacts } from '../utils/product-center-run-safety';
import { buildProductCenterCanonicalAutomationContractBatchArtifacts } from './build-product-center-canonical-automation-contract-batch';
import { buildProductCenterItemFullReviewArtifacts } from './build-product-center-item-full-review';
import { buildProductCenterItemXmindRebuildArtifacts } from './build-product-center-item-xmind-rebuild';

type SourceCaseResult = {
  caseId: string;
  title: string;
  irConverted: true;
  reviewDecision: string;
  automationClassification: ProductCenterCanonicalAutomationContractEntry['classification'];
  recipeId: string | null;
  recipeInventory: {
    any: number;
    enabled: number;
    semanticComplete: number;
    files: string[];
  };
  blockingReasons: string[];
};

type RecipeCandidate = {
  recipe: AutomationRecipe;
  path: string;
};

type RecipeGapDraft = {
  caseId: string;
  title: string;
  status: 'review-required';
  generationAllowed: false;
  sourceRefs: string[];
  agentCanProvide: string[];
  observationRequired: string[];
  businessConfirmationRequired: string[];
  templateCandidateCaseIds: string[];
  candidateTechnicalBinding: {
    templateRecipeId: string;
    route: string;
    state: 'template-runtime-retained' | 'template-runtime-unverified';
    action: string;
    overlay: 'N/A';
    capabilityIds: string[];
    assertionAdapterIds: string[];
    assertionContractIds: string[];
    factoryContractIds: string[] | 'N/A';
    cleanupContractIds: string[] | 'N/A';
    operation: string | 'N/A';
    safetyLevel: 'L0' | 'L1' | 'L2' | 'L3';
    retryReconciliation: 'review-required' | 'N/A';
    uiApiZeroResidue: 'review-required' | 'N/A';
  } | null;
  templateReuseAllowed: false;
  noBusinessRuleInference: true;
};

type PackageMapping = {
  packageId: string;
  caseIds: string[];
  coverage: 'strict-generatable';
  routeStateActionOverlay: Array<{
    caseId: string;
    route: string;
    state: 'runtime-retained';
    action: string;
    overlay: 'N/A';
  }>;
  capabilityInputOutput: Array<{
    caseId: string;
    capabilities: Array<{ id: string; input: unknown; output: string | 'N/A' }>;
  }>;
  uiApiAssertion: Array<{
    caseId: string;
    adapterIds: string[];
    contractIds: string[];
  }>;
  operation: Array<{ caseId: string; value: string | 'N/A' }>;
  factoryCleanup: Array<{
    caseId: string;
    factoryContractIds: string[] | 'N/A';
    cleanupContractIds: string[] | 'N/A';
  }>;
  safetyLevel: Array<{ caseId: string; value: 'L0' | 'L1' | 'L2' | 'L3' }>;
  retryReconciliation: Array<{ caseId: string; value: 'verified' | 'N/A' }>;
  uiApiZeroResidue: Array<{ caseId: string; value: 'confirmed' | 'N/A' }>;
};

type FormalConversionReport = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-formal-full-conversion';
  generatedAt: string;
  status: 'completed-with-blocked-cases';
  sources: {
    externalFormalMarkdown: SourceRecord;
    workspaceFormalMarkdown: SourceRecord;
    normalizedContentMatches: boolean;
  };
  denominator: {
    sourceFormalCases: number;
    sourceCasesConvertedToIr: number;
    reviewSplitCases: number;
    pageSupplementCases: number;
    expandedReviewUnits: number;
    approvedReviewUnits: number;
    deprecatedReviewUnits: number;
  };
  summary: {
    sourceStrictGeneratable: number;
    sourceBlocked: number;
    sourceNotApplicable: number;
    sourceRemainingNotStrict: number;
    expandedStrictGeneratable: number;
    expandedBlocked: number;
    expandedNotApplicable: number;
    sourceIrConversionRate: string;
    sourceStrictGenerationRate: string;
    expandedStrictGenerationRate: string;
    sourceCasesWithAnyRecipe: number;
    sourceCasesWithEnabledRecipe: number;
    sourceCasesWithoutAnyRecipe: number;
    blockedCasesWithoutAnyRecipe: number;
    recipeGapDraftsWithSiblingTemplate: number;
    recipeGapDraftsWithoutSiblingTemplate: number;
  };
  performance: {
    rebuildMs: number;
    reviewMs: number;
    contractMs: number;
    totalMs: number;
    sourceCasesPerSecond: number;
  };
  validations: {
    sourceIdUnique: boolean;
    sourceIdsPresentInPlan: boolean;
    planIdsMatchReviewedBaseline: boolean;
    sourceIdsPresentInAutomationBatch: boolean;
    fullReviewCoversExpandedPlan: boolean;
    automationBatchCoversExpandedPlan: boolean;
    sensitiveFindings: number;
  };
  packageMappings: PackageMapping[];
  sourceCases: SourceCaseResult[];
  recipeGapDrafts: RecipeGapDraft[];
  derivedReviewUnits: Array<{
    caseId: string;
    origin: string;
    changeType: string;
    classification: ProductCenterCanonicalAutomationContractEntry['classification'];
    blockingReasons: string[];
  }>;
  skippedFromStrictScriptGeneration: Array<{
    caseId: string;
    classification: ProductCenterCanonicalAutomationContractEntry['classification'];
    reasons: string[];
  }>;
};

type SourceRecord = {
  path: string;
  bytes: number;
  sha256: string;
  normalizedSha256: string;
};

type FullReviewDocument = {
  summary: {
    approved: number;
    deprecated: number;
  };
  entries: Array<{
    caseId: string;
    title: string;
    decision: string;
  }>;
};

const packageDefinitions = [
  { packageId: 'p0-item-binding:item-combo-fixed-group', caseIds: ['TC-ITEM-PKG-002', 'TC-ITEM-PKG-006'] },
  {
    packageId: 'p0-item-binding:item-combo-fixed-group-item-combo-optional-select',
    caseIds: ['TC-ITEM-PKG-040', 'TC-ITEM-PKG-041'],
  },
  { packageId: 'p0-item-binding:item-combo-optional-add', caseIds: ['TC-ITEM-PKG-007'] },
  { packageId: 'p0-item-binding:item-combo-optional-select', caseIds: ['TC-ITEM-PKG-004'] },
  { packageId: 'p0-item-binding:item-combo-required-fields', caseIds: ['TC-ITEM-PKG-010', 'TC-ITEM-PKG-017'] },
] as const;

export function runProductCenterItemFormalFullConversion(options: {
  projectRoot?: string;
  formalMarkdownPath: string;
  outputRoot: string;
  generatedAt?: string;
}): {
  reportPath: string;
  markdownPath: string;
  skippedPath: string;
  recipeGapPath: string;
  checkpointPath: string;
} {
  const startedAt = performance.now();
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const formalMarkdownPath = path.resolve(options.formalMarkdownPath);
  const workspaceFormalMarkdownPath = path.resolve(
    projectRoot,
    '..',
    'Merchant Center Info',
    '00-待转换测试方案',
    '用例库',
    '商品中心-商品管理-商品',
    '1.商品中心-商品管理-商品-正式测试用例.md',
  );
  requireFile(formalMarkdownPath);
  requireFile(workspaceFormalMarkdownPath);
  fs.mkdirSync(outputRoot, { recursive: true });
  const checkpointPath = path.join(outputRoot, 'formal-conversion-checkpoint.json');
  writeJson(checkpointPath, checkpoint(generatedAt, 'source-verified', ['source-verified']));

  const externalSource = sourceRecord(formalMarkdownPath);
  const workspaceSource = sourceRecord(workspaceFormalMarkdownPath);
  if (externalSource.normalizedSha256 !== workspaceSource.normalizedSha256) {
    throw new Error('外部正式测试方案与工作区方案存在语义差异，禁止混用版本');
  }
  const sourceCases = parseFormalCaseHeaders(fs.readFileSync(formalMarkdownPath, 'utf8'));
  const sourceIds = new Set(sourceCases.map((item) => item.caseId));
  if (sourceIds.size !== sourceCases.length) throw new Error('正式测试方案存在重复用例编号');

  const rebuildStartedAt = performance.now();
  const rebuildArtifacts = buildProductCenterItemXmindRebuildArtifacts({ projectRoot, outputRoot, generatedAt });
  const rebuildMs = elapsed(rebuildStartedAt);
  const plan = readJson<ProductCenterItemXmindRebuildPlan>(rebuildArtifacts.planPath);
  writeJson(checkpointPath, checkpoint(generatedAt, 'ir-built', ['source-verified', 'ir-built']));

  const reviewStartedAt = performance.now();
  const reviewArtifacts = buildProductCenterItemFullReviewArtifacts({ projectRoot, outputRoot, reviewedAt: generatedAt });
  const reviewMs = elapsed(reviewStartedAt);
  const review = readJson<FullReviewDocument>(reviewArtifacts.jsonPath);

  const contractStartedAt = performance.now();
  const batch = buildProductCenterCanonicalAutomationContractBatchArtifacts({
    rootDir: projectRoot,
    generatedAt,
    write: false,
  }).report;
  const contractMs = elapsed(contractStartedAt);
  const batchPath = path.join(outputRoot, 'product-center-item-formal-automation-contract-batch.json');
  writeJson(batchPath, batch);
  const currentPlan = readJson<ProductCenterItemXmindRebuildPlan>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json',
  ));
  const planIds = new Set(plan.cases.map((item) => item.id));
  const currentPlanIds = new Set(currentPlan.cases.map((item) => item.id));
  const reviewByCaseId = new Map(review.entries.map((item) => [item.caseId, item]));
  const batchByCaseId = new Map(batch.entries.map((item) => [item.canonicalCaseId, item]));
  const recipeByCaseId = loadComboRecipes(projectRoot);
  const allRecipeCandidates = loadAllRecipes(projectRoot);
  const sourceResults = sourceCases.map((sourceCase): SourceCaseResult => {
    const entry = requiredMapValue(batchByCaseId, sourceCase.caseId, '自动化合同');
    const inventory = allRecipeCandidates.filter((candidate) => candidate.recipe.caseId === sourceCase.caseId);
    return {
      caseId: sourceCase.caseId,
      title: reviewByCaseId.get(sourceCase.caseId)?.title ?? sourceCase.title,
      irConverted: true,
      reviewDecision: reviewByCaseId.get(sourceCase.caseId)?.decision ?? 'not-found',
      automationClassification: entry.classification,
      recipeId: entry.recipeId,
      recipeInventory: {
        any: inventory.length,
        enabled: inventory.filter((candidate) => candidate.recipe.generationAllowed).length,
        semanticComplete: inventory.filter((candidate) => candidate.recipe.semanticBindings !== undefined).length,
        files: [...new Set(inventory.map((candidate) => candidate.path))],
      },
      blockingReasons: [...entry.blockingReasons],
    };
  });
  const derivedReviewUnits = plan.cases
    .filter((item) => !sourceIds.has(item.id))
    .map((item) => {
      const entry = requiredMapValue(batchByCaseId, item.id, '派生自动化合同');
      return {
        caseId: item.id,
        origin: item.origin,
        changeType: item.changeType,
        classification: entry.classification,
        blockingReasons: [...entry.blockingReasons],
      };
    });
  const packageMappings = packageDefinitions.map((definition) => buildPackageMapping(
    definition.packageId,
    [...definition.caseIds],
    batchByCaseId,
    recipeByCaseId,
  ));
  const sourceStrict = sourceResults.filter((item) => item.automationClassification === 'strict-generatable').length;
  const sourceBlocked = sourceResults.filter((item) => item.automationClassification === 'blocked').length;
  const sourceNotApplicable = sourceResults.filter((item) => item.automationClassification === 'not-applicable').length;
  const planByCaseId = new Map(plan.cases.map((item) => [item.id, item]));
  const recipeGapDrafts = sourceResults
    .filter((item) => item.automationClassification === 'blocked' && item.recipeInventory.any === 0)
    .map((item): RecipeGapDraft => {
      const sourcePlanCase = requiredMapValue(planByCaseId, item.caseId, 'Recipe 草稿源 IR');
      const templates = allRecipeCandidates
        .filter((candidate) => {
          const templatePlanCase = planByCaseId.get(candidate.recipe.caseId);
          return templatePlanCase?.productType === sourcePlanCase.productType
            && templatePlanCase.scenarioFamily === sourcePlanCase.scenarioFamily;
        })
        .sort((left, right) => recipeCandidateScore(right.recipe) - recipeCandidateScore(left.recipe));
      const selectedTemplate = templates[0]?.recipe;
      const selectedTemplateEntry = selectedTemplate
        ? batchByCaseId.get(selectedTemplate.caseId)
        : undefined;
      return {
        caseId: item.caseId,
        title: item.title,
        status: 'review-required',
        generationAllowed: false,
        sourceRefs: [`formal-test-plan:${item.caseId}`],
        agentCanProvide: [
          'Recipe结构草稿',
          'IR Claim 到 Recipe 的字段映射',
          '已注册 Capability 的候选匹配',
          'Assertion、Factory、Cleanup 合同候选匹配',
        ],
        observationRequired: [
          '真实 route 与页面状态',
          '可执行 UI action 与 overlay 顺序',
          '实际 API operation 与网络断言',
          '运行后 Runtime Retain 证据',
        ],
        businessConfirmationRequired: item.caseId.startsWith('TC-ITEM-PKG-')
          ? ['套餐业务规则与保存终态']
          : ['歧义业务预期或未被正式规则覆盖的字段行为'],
        templateCandidateCaseIds: [...new Set(templates.map((candidate) => candidate.recipe.caseId))],
        candidateTechnicalBinding: selectedTemplate
          ? {
            templateRecipeId: selectedTemplate.id,
            route: selectedTemplate.route,
            state: selectedTemplateEntry?.runtimeEvidenceIds.length
              ? 'template-runtime-retained'
              : 'template-runtime-unverified',
            action: selectedTemplate.action,
            overlay: 'N/A',
            capabilityIds: [...new Set(selectedTemplate.capabilities.map((capability) => capability.id))],
            assertionAdapterIds: [...new Set(selectedTemplate.assertions.map((assertion) => assertion.adapterId))],
            assertionContractIds: [...new Set(selectedTemplate.semanticBindings?.assertionContractIds ?? [])],
            factoryContractIds: selectedTemplate.mutation
              ? [...new Set(selectedTemplate.semanticBindings?.factoryContractIds ?? [])]
              : 'N/A',
            cleanupContractIds: selectedTemplate.mutation
              ? [...new Set(selectedTemplate.semanticBindings?.cleanupContractIds ?? [])]
              : 'N/A',
            operation: selectedTemplate.mutation?.operationKey ?? 'N/A',
            safetyLevel: safetyLevel(selectedTemplate),
            retryReconciliation: selectedTemplate.mutation ? 'review-required' : 'N/A',
            uiApiZeroResidue: selectedTemplate.mutation ? 'review-required' : 'N/A',
          }
          : null,
        templateReuseAllowed: false,
        noBusinessRuleInference: true,
      };
    });
  const totalMs = elapsed(startedAt);
  const report: FormalConversionReport = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-formal-full-conversion',
    generatedAt,
    status: 'completed-with-blocked-cases',
    sources: {
      externalFormalMarkdown: externalSource,
      workspaceFormalMarkdown: workspaceSource,
      normalizedContentMatches: true,
    },
    denominator: {
      sourceFormalCases: sourceCases.length,
      sourceCasesConvertedToIr: sourceResults.length,
      reviewSplitCases: plan.summary.reviewSplitCases,
      pageSupplementCases: plan.summary.pageSupplementCases,
      expandedReviewUnits: plan.summary.rebuiltCases,
      approvedReviewUnits: review.summary.approved,
      deprecatedReviewUnits: review.summary.deprecated,
    },
    summary: {
      sourceStrictGeneratable: sourceStrict,
      sourceBlocked,
      sourceNotApplicable,
      sourceRemainingNotStrict: sourceCases.length - sourceStrict,
      expandedStrictGeneratable: batch.summary.strictGeneratable,
      expandedBlocked: batch.summary.blocked,
      expandedNotApplicable: batch.summary.notApplicable,
      sourceIrConversionRate: ratio(sourceResults.length, sourceCases.length),
      sourceStrictGenerationRate: ratio(sourceStrict, sourceCases.length),
      expandedStrictGenerationRate: ratio(batch.summary.strictGeneratable, batch.summary.canonicalTotal),
      sourceCasesWithAnyRecipe: sourceResults.filter((item) => item.recipeInventory.any > 0).length,
      sourceCasesWithEnabledRecipe: sourceResults.filter((item) => item.recipeInventory.enabled > 0).length,
      sourceCasesWithoutAnyRecipe: sourceResults.filter((item) => item.recipeInventory.any === 0).length,
      blockedCasesWithoutAnyRecipe: sourceResults.filter((item) => (
        item.automationClassification === 'blocked' && item.recipeInventory.any === 0
      )).length,
      recipeGapDraftsWithSiblingTemplate: recipeGapDrafts.filter((item) => (
        item.candidateTechnicalBinding !== null
      )).length,
      recipeGapDraftsWithoutSiblingTemplate: recipeGapDrafts.filter((item) => (
        item.candidateTechnicalBinding === null
      )).length,
    },
    performance: {
      rebuildMs,
      reviewMs,
      contractMs,
      totalMs,
      sourceCasesPerSecond: Number((sourceCases.length / Math.max(totalMs / 1000, 0.001)).toFixed(2)),
    },
    validations: {
      sourceIdUnique: sourceIds.size === sourceCases.length,
      sourceIdsPresentInPlan: sourceCases.every((item) => planIds.has(item.caseId)),
      planIdsMatchReviewedBaseline: sameSet(planIds, currentPlanIds),
      sourceIdsPresentInAutomationBatch: sourceCases.every((item) => batchByCaseId.has(item.caseId)),
      fullReviewCoversExpandedPlan: plan.cases.every((item) => reviewByCaseId.has(item.id)),
      automationBatchCoversExpandedPlan: plan.cases.every((item) => batchByCaseId.has(item.id)),
      sensitiveFindings: 0,
    },
    packageMappings,
    sourceCases: sourceResults,
    recipeGapDrafts,
    derivedReviewUnits,
    skippedFromStrictScriptGeneration: sourceResults
      .filter((item) => item.automationClassification !== 'strict-generatable')
      .map((item) => ({
        caseId: item.caseId,
        classification: item.automationClassification,
        reasons: item.blockingReasons.length > 0 ? item.blockingReasons : ['NOT_APPLICABLE'],
      })),
  };
  validateReport(report);
  const reportPath = path.join(outputRoot, 'product-center-item-formal-full-conversion.json');
  const markdownPath = path.join(outputRoot, 'product-center-item-formal-full-conversion.md');
  const skippedPath = path.join(outputRoot, 'product-center-item-formal-full-conversion-skipped.json');
  const recipeGapPath = path.join(outputRoot, 'product-center-item-recipe-gap-drafts.json');
  writeJson(reportPath, report);
  writeText(markdownPath, renderMarkdown(report));
  writeJson(skippedPath, {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-formal-full-conversion-skipped',
    generatedAt,
    count: report.skippedFromStrictScriptGeneration.length,
    items: report.skippedFromStrictScriptGeneration,
  });
  writeJson(recipeGapPath, {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-recipe-gap-drafts',
    generatedAt,
    generationAllowed: false,
    count: recipeGapDrafts.length,
    items: recipeGapDrafts,
  });
  const findings = scanGeneratedArtifacts(outputRoot);
  report.validations.sensitiveFindings = findings.length;
  if (findings.length > 0) throw new Error(`正式方案全量转换安全扫描未通过：${findings.length}`);
  writeJson(reportPath, report);
  writeJson(checkpointPath, checkpoint(generatedAt, 'completed', [
    'source-verified',
    'ir-built',
    'full-review-linked',
    'automation-contracts-linked',
    'security-scanned',
  ]));
  return { reportPath, markdownPath, skippedPath, recipeGapPath, checkpointPath };
}

function buildPackageMapping(
  packageId: string,
  caseIds: string[],
  batchByCaseId: ReadonlyMap<string, ProductCenterCanonicalAutomationContractEntry>,
  recipeByCaseId: ReadonlyMap<string, AutomationRecipe>,
): PackageMapping {
  const entries = caseIds.map((caseId) => requiredMapValue(batchByCaseId, caseId, '能力包自动化合同'));
  if (entries.some((entry) => entry.classification !== 'strict-generatable')) {
    throw new Error(`能力包未达到严格生成门禁：${packageId}`);
  }
  const recipes = caseIds.map((caseId) => requiredMapValue(recipeByCaseId, caseId, '能力包 Recipe'));
  return {
    packageId,
    caseIds,
    coverage: 'strict-generatable',
    routeStateActionOverlay: recipes.map((recipe) => ({
      caseId: recipe.caseId,
      route: recipe.route,
      state: 'runtime-retained',
      action: recipe.action,
      overlay: 'N/A',
    })),
    capabilityInputOutput: recipes.map((recipe) => ({
      caseId: recipe.caseId,
      capabilities: recipe.capabilities.map((capability) => ({
        id: capability.id,
        input: capability.input ?? {},
        output: capability.saveAs ?? 'N/A',
      })),
    })),
    uiApiAssertion: entries.map((entry) => ({
      caseId: entry.canonicalCaseId,
      adapterIds: [...entry.assertionAdapterIds],
      contractIds: [...entry.assertionContractIds],
    })),
    operation: recipes.map((recipe) => ({
      caseId: recipe.caseId,
      value: recipe.mutation?.operationKey ?? 'N/A',
    })),
    factoryCleanup: entries.map((entry) => ({
      caseId: entry.canonicalCaseId,
      factoryContractIds: entry.mutable ? [...entry.factoryContractIds] : 'N/A',
      cleanupContractIds: entry.mutable ? [...entry.cleanupContractIds] : 'N/A',
    })),
    safetyLevel: recipes.map((recipe) => ({ caseId: recipe.caseId, value: safetyLevel(recipe) })),
    retryReconciliation: entries.map((entry) => ({
      caseId: entry.canonicalCaseId,
      value: entry.mutable ? 'verified' : 'N/A',
    })),
    uiApiZeroResidue: entries.map((entry) => ({
      caseId: entry.canonicalCaseId,
      value: entry.mutable ? 'confirmed' : 'N/A',
    })),
  };
}

function safetyLevel(recipe: AutomationRecipe): 'L0' | 'L1' | 'L2' | 'L3' {
  if (recipe.action === 'read') return 'L0';
  if (recipe.action === 'boundary') return 'L1';
  if (recipe.action === 'negative') return 'L2';
  return 'L3';
}

function loadComboRecipes(projectRoot: string): Map<string, AutomationRecipe> {
  const document = readJson<{ recipes: AutomationRecipe[] }>(path.join(
    projectRoot,
    'contracts/product-center/recipes/product-center-item-combo-api-closure-recipes.json',
  ));
  return new Map(document.recipes.map((recipe) => [recipe.caseId, recipe]));
}

function loadAllRecipes(projectRoot: string): RecipeCandidate[] {
  const recipeRoot = path.join(projectRoot, 'contracts/product-center/recipes');
  return walkJsonFiles(recipeRoot).flatMap((filePath) => {
    const value = readJson<unknown>(filePath);
    if (!isRecord(value) || !Array.isArray(value.recipes)) return [];
    return value.recipes.flatMap((recipe): RecipeCandidate[] => (
      isRecipe(recipe)
        ? [{ recipe, path: path.relative(projectRoot, filePath).replace(/\\/g, '/') }]
        : []
    ));
  });
}

function walkJsonFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkJsonFiles(filePath));
    else if (entry.isFile() && entry.name.endsWith('.json')) files.push(filePath);
  }
  return files;
}

function isRecipe(value: unknown): value is AutomationRecipe {
  return isRecord(value)
    && value.schemaVersion === '1.0.0'
    && typeof value.id === 'string'
    && typeof value.caseId === 'string'
    && typeof value.generationAllowed === 'boolean'
    && Array.isArray(value.capabilities)
    && Array.isArray(value.assertions);
}

function recipeCandidateScore(recipe: AutomationRecipe): number {
  return (recipe.generationAllowed ? 100 : 0)
    + (recipe.semanticBindings ? 40 : 0)
    + recipe.capabilities.length * 5
    + recipe.assertions.length * 10;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFormalCaseHeaders(markdown: string): Array<{ caseId: string; title: string }> {
  const normalized = normalizeText(markdown);
  const headings = [...normalized.matchAll(/^### 用例编号：([^\n]+)$/gm)];
  return headings.map((heading, index) => {
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? normalized.length;
    const block = normalized.slice(start, end);
    const title = block.match(/^用例标题：([^\n]+)$/m)?.[1]?.trim();
    if (!title) throw new Error(`正式测试方案缺少用例标题：${heading[1].trim()}`);
    return { caseId: heading[1].trim(), title };
  });
}

function renderMarkdown(report: FormalConversionReport): string {
  return [
    '# 商品中心商品管理正式方案全量转换报告',
    '',
    `- 正式源用例：${report.denominator.sourceFormalCases}`,
    `- 已转换 IR：${report.summary.sourceIrConversionRate}`,
    `- 严格可生成自动化：${report.summary.sourceStrictGenerationRate}`,
    `- 剩余未达到严格生成：${report.summary.sourceRemainingNotStrict}`,
    `- 派生审核单元：${report.denominator.expandedReviewUnits}（拆分 ${report.denominator.reviewSplitCases}，页面补充 ${report.denominator.pageSupplementCases}）`,
    `- 总耗时：${report.performance.totalMs} ms（${report.performance.sourceCasesPerSecond} cases/s）`,
    '',
    '## 严格可生成',
    '',
    ...report.sourceCases
      .filter((item) => item.automationClassification === 'strict-generatable')
      .map((item) => `- ${item.caseId}：${item.title}`),
    '',
    '## 能力包',
    '',
    ...report.packageMappings.map((item) => `- ${item.packageId}：${item.coverage}（${item.caseIds.join(', ')}）`),
    '',
    '## 未达到严格生成',
    '',
    ...report.skippedFromStrictScriptGeneration.map((item) => (
      `- ${item.caseId}：${item.classification}（${item.reasons.join(', ')}）`
    )),
    '',
  ].join('\n');
}

function validateReport(report: FormalConversionReport): void {
  const issues: string[] = [];
  if (report.denominator.sourceFormalCases !== 216) issues.push('SOURCE_CASE_COUNT_NOT_216');
  if (report.denominator.sourceCasesConvertedToIr !== report.denominator.sourceFormalCases) {
    issues.push('SOURCE_IR_DENOMINATOR_MISMATCH');
  }
  if (report.summary.sourceStrictGeneratable
    + report.summary.sourceBlocked
    + report.summary.sourceNotApplicable !== report.denominator.sourceFormalCases) {
    issues.push('SOURCE_AUTOMATION_DENOMINATOR_MISMATCH');
  }
  if (report.summary.expandedStrictGeneratable
    + report.summary.expandedBlocked
    + report.summary.expandedNotApplicable !== report.denominator.expandedReviewUnits) {
    issues.push('EXPANDED_AUTOMATION_DENOMINATOR_MISMATCH');
  }
  if (report.packageMappings.length !== 5) issues.push('PACKAGE_MAPPING_COUNT_MISMATCH');
  for (const [key, valid] of Object.entries(report.validations)) {
    if (key !== 'sensitiveFindings' && valid !== true) issues.push(`VALIDATION_FAILED:${key}`);
  }
  if (issues.length > 0) throw new Error(`正式方案全量转换校验失败：${issues.join(',')}`);
}

function sourceRecord(filePath: string): SourceRecord {
  const content = fs.readFileSync(filePath);
  return {
    path: filePath,
    bytes: content.length,
    sha256: createHash('sha256').update(content).digest('hex'),
    normalizedSha256: createHash('sha256').update(normalizeText(content.toString('utf8'))).digest('hex'),
  };
}

function checkpoint(generatedAt: string, phase: string, completedUnits: string[]) {
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-formal-full-conversion-checkpoint',
    generatedAt,
    updatedAt: new Date().toISOString(),
    phase,
    completedUnits,
    nonIdempotentActionsExecuted: false,
    browserActionsExecuted: false,
  };
}

function sameSet<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  return left.size === right.size && [...left].every((item) => right.has(item));
}

function requiredMapValue<K, V>(map: ReadonlyMap<K, V>, key: K, label: string): V {
  const value = map.get(key);
  if (!value) throw new Error(`${label}缺失：${String(key)}`);
  return value;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

function ratio(numerator: number, denominator: number): string {
  return `${numerator}/${denominator}`;
}

function elapsed(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(2));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function requireFile(filePath: string): void {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`正式方案来源不存在：${filePath}`);
  }
}

function parseArguments(args: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error(`参数格式无效：${key ?? ''}`);
    result[key.slice(2)] = value;
  }
  return result;
}

if (require.main === module) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const projectRoot = path.resolve(__dirname, '..');
    const defaultSourcePath = path.resolve(
      projectRoot,
      '..',
      'Merchant Center Info',
      '00-待转换测试方案',
    '用例库',
      '商品中心-商品管理-商品',
      '1.商品中心-商品管理-商品-正式测试用例.md',
    );
    const paths = runProductCenterItemFormalFullConversion({
      projectRoot,
      formalMarkdownPath: args.formal ?? defaultSourcePath,
      outputRoot: args.output ?? path.join(projectRoot, 'output/product-center-item-formal-full-conversion/latest'),
    });
    process.stdout.write(`${JSON.stringify(paths, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
