import fs from 'node:fs';
import path from 'node:path';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import {
  buildProductCenterCanonicalAutomationContractBatch,
  type ProductCenterCanonicalAutomationContractBatch,
  type ProductCenterCanonicalReviewEntry,
  type ProductCenterCanonicalRuntimeDecision,
} from '../utils/product-center-canonical-automation-contract-batch';
import {
  productCenterCanonicalCleanupContracts,
  productCenterCanonicalFactoryContracts,
  bindProductCenterRecipeSemanticContracts,
} from '../utils/product-center-recipe-semantic-contract-catalog';
import { loadProductCenterSourceGovernance } from '../utils/product-center-source-governance';

const projectRoot = process.cwd();

const recipeRootRelativePath = 'contracts/product-center/recipes';

export function buildProductCenterCanonicalAutomationContractBatchArtifacts(options: {
  rootDir?: string;
  generatedAt?: string;
  write?: boolean;
} = {}): { report: ProductCenterCanonicalAutomationContractBatch; jsonPath: string; markdownPath: string } {
  const rootDir = options.rootDir ?? projectRoot;
  const review = readJson<{ entries: ProductCenterCanonicalReviewEntry[] }>(rootDir,
    'contracts/product-center/test-cases/canonical/product-center-item-full-review.json');
  const ir = readJson<{ cases: Array<{ id: string }> }>(rootDir,
    'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json');
  const runtime = readJson<{ decisions: ProductCenterCanonicalRuntimeDecision[] }>(rootDir,
    'contracts/product-center/runtime/product-center-canonical-runtime-retain.json');
  const recipes = selectBestRecipesByCaseId(
    walkJsonFiles(path.join(rootDir, recipeRootRelativePath))
      .flatMap((filePath) => readJson<{ recipes?: AutomationRecipe[] }>(filePath).recipes ?? [])
      .map((recipe) => recipe.semanticBindings ? recipe : bindProductCenterRecipeSemanticContracts(recipe)),
  );
  const runtimeDecisions = mergeRuntimeDecisions(
    runtime.decisions,
    loadAcceptedRuntimeDecisions(rootDir, recipes),
  );
  const sourceGovernance = loadProductCenterSourceGovernance(rootDir);
  const report = buildProductCenterCanonicalAutomationContractBatch({
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    canonicalReview: review.entries,
    testCaseIr: ir.cases,
    recipes,
    runtimeDecisions,
    factoryContracts: productCenterCanonicalFactoryContracts,
    cleanupContracts: productCenterCanonicalCleanupContracts,
    sourceDecisions: [...sourceGovernance.decisions.values()],
  });
  const outputRoot = path.join(rootDir, 'contracts/product-center/test-cases/generated');
  const jsonPath = path.join(outputRoot, 'product-center-canonical-automation-contract-batch.json');
  const markdownPath = path.join(outputRoot, 'product-center-canonical-automation-contract-batch.md');
  if (options.write !== false) {
    fs.mkdirSync(outputRoot, { recursive: true });
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(markdownPath, renderMarkdown(report), 'utf8');
  }
  return { report, jsonPath, markdownPath };
}

function selectBestRecipesByCaseId(recipes: readonly AutomationRecipe[]): AutomationRecipe[] {
  const selected = new Map<string, AutomationRecipe>();
  for (const recipe of recipes) {
    const previous = selected.get(recipe.caseId);
    if (!previous || recipeScore(recipe) > recipeScore(previous)) selected.set(recipe.caseId, recipe);
  }
  return [...selected.values()].sort((left, right) => left.caseId.localeCompare(right.caseId));
}

function recipeScore(recipe: AutomationRecipe): number {
  return (recipe.generationAllowed ? 1_000 : 0)
    + (recipe.semanticBindings ? 200 : 0)
    + recipe.assertions.length * 20
    + recipe.capabilities.length * 5
    + (recipe.seed ? 10 : 0)
    + (recipe.cleanup ? 10 : 0);
}

function loadAcceptedRuntimeDecisions(
  rootDir: string,
  recipes: readonly AutomationRecipe[],
): ProductCenterCanonicalRuntimeDecision[] {
  const recipeByCaseId = new Map(recipes.map((recipe) => [recipe.caseId, recipe]));
  const acceptancePaths = [
    'contracts/product-center/reviews/product-center-item-p0-wave-d-runtime-acceptance.json',
    'contracts/product-center/reviews/runtime/product-center-item-yellow-y3-b3-runtime-acceptance.json',
    'output/recipes/product-center-item-combo-audit-probe-acceptance.json',
  ];
  return acceptancePaths.flatMap((relativePath) => {
    const filePath = path.join(rootDir, relativePath);
    if (!fs.existsSync(filePath)) return [];
    const document = readJson<{
      collectionId?: string;
      acceptanceId?: string;
      runId?: string;
      accepted?: boolean;
      acceptedCaseIds?: string[];
    }>(filePath);
    if (document.accepted !== true && !document.acceptedCaseIds?.length) return [];
    const evidencePrefix = document.acceptanceId ?? document.collectionId ?? path.basename(filePath, '.json');
    return [...new Set(document.acceptedCaseIds ?? [])].flatMap((caseId) => {
      const recipe = recipeByCaseId.get(caseId);
      if (!recipe) return [];
      return [{
        recipeId: recipe.id,
        decision: 'retain' as const,
        evidenceIds: [`${evidencePrefix}:${caseId}${document.runId ? `:${document.runId}` : ''}`],
      }];
    });
  });
}

function mergeRuntimeDecisions(
  retained: readonly ProductCenterCanonicalRuntimeDecision[],
  accepted: readonly ProductCenterCanonicalRuntimeDecision[],
): ProductCenterCanonicalRuntimeDecision[] {
  const merged = new Map<string, ProductCenterCanonicalRuntimeDecision>();
  for (const decision of [...accepted, ...retained]) {
    const previous = merged.get(decision.recipeId);
    merged.set(decision.recipeId, {
      recipeId: decision.recipeId,
      decision: decision.decision,
      evidenceIds: [...new Set([...(previous?.evidenceIds ?? []), ...decision.evidenceIds])],
    });
  }
  return [...merged.values()].sort((left, right) => left.recipeId.localeCompare(right.recipeId));
}

function walkJsonFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) return walkJsonFiles(filePath);
    return entry.isFile() && entry.name.endsWith('.json') ? [filePath] : [];
  });
}

function readJson<T>(rootDirOrFilePath: string, relativePath?: string): T {
  const filePath = relativePath ? path.join(rootDirOrFilePath, relativePath) : rootDirOrFilePath;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function renderMarkdown(report: ProductCenterCanonicalAutomationContractBatch): string {
  const lines = [
    '# Product Center Canonical Automation Contract Batch',
    '',
    `- Canonical: ${report.summary.canonicalTotal}`,
    `- Approved / N/A: ${report.summary.approved} / ${report.summary.notApplicable}`,
    `- Eligible for technical binding review: ${report.summary.eligibleForTechnicalBindingReview}`,
    `- Recipe direct / semantic / runtime: ${report.coverage.recipeDirect} / ${report.coverage.explicitSemantic} / ${report.coverage.runtimeRetained}`,
    `- Strict / blocked / N/A: ${report.summary.strictGeneratable} / ${report.summary.blocked} / ${report.summary.notApplicable}`,
    '',
    '| Canonical Case ID | Classification | Recipe | Runtime | Blocking Reasons |',
    '| --- | --- | --- | --- | --- |',
    ...report.entries.map((entry) => [
      entry.canonicalCaseId,
      entry.classification,
      entry.recipeId ?? '-',
      entry.runtimeEvidenceIds.length > 0 ? 'retain' : '-',
      entry.blockingReasons.join(', ') || '-',
    ].join(' | ')).map((line) => `| ${line} |`),
    '',
  ];
  return lines.join('\n');
}

if (process.argv[1]?.endsWith('build-product-center-canonical-automation-contract-batch.ts')) {
  const { report, jsonPath, markdownPath } = buildProductCenterCanonicalAutomationContractBatchArtifacts();
  console.log(JSON.stringify({ summary: report.summary, coverage: report.coverage, jsonPath, markdownPath }, null, 2));
}
