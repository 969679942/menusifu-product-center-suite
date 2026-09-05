import fs from 'node:fs';
import path from 'node:path';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import { scanProductCenterForbiddenPatterns } from '../automation/recipe/product-center-forbidden-patterns';
import { evaluateProductCenterRuntimeAcceptance } from '../automation/recipe/product-center-runtime-acceptance';
import { appConfig } from '../test-data/env';
import {
  findIncompleteCheckpointFiles,
  scanGeneratedArtifacts,
} from '../utils/product-center-run-safety';
import { writeProductCenterImmutableRunArtifact } from '../utils/product-center-run-artifacts';
import {
  fingerprintProductCenterStageInputs,
  type ProductCenterUiStageId,
} from '../utils/product-center-runtime-reuse';

type RuntimeEvidenceEntry = {
  recipeId?: string;
  caseId?: string;
  expectedClaimIds?: string[];
  verifiedClaimIds?: string[];
  duplicateVerifiedClaimIds?: string[];
  claimCoverageComplete?: boolean;
  sidebarEntryVerified?: boolean;
  visibleUi?: Record<string, unknown>;
};

export type ProductCenterRuntimeAcceptanceArtifactConfig = {
  collectionId: string;
  recipesPath: string;
  feedbackPath: string;
  evidencePath: string;
  specPath: string;
  outputPath: string;
  stageId?: Exclude<ProductCenterUiStageId, 'page-contract-probe'>;
};

export type ProductCenterRuntimeAcceptanceBuildOptions = {
  legacySourceAliases?: readonly string[];
  runId?: string;
  scope?: 'full' | 'single' | 'impacted' | 'recovery';
  selectedCaseIds?: readonly string[];
  publishLatest?: boolean;
};

export async function buildProductCenterRuntimeAcceptanceArtifact(
  rootDir = process.cwd(),
  options: ProductCenterRuntimeAcceptanceBuildOptions = {},
): Promise<string> {
  return buildProductCenterRuntimeAcceptanceArtifactForCollection(rootDir, {
    collectionId: 'product-center-pilot',
    recipesPath: 'contracts/product-center/recipes/product-center-pilot-recipes.json',
    feedbackPath: 'output/recipes/product-center-pilot-feedback.json',
    evidencePath: 'output/recipes/product-center-pilot-evidence.json',
    specPath: 'tests/generated/product-center-recipe-pilot.generated.spec.ts',
    outputPath: 'output/recipes/product-center-pilot-acceptance.json',
    stageId: 'main-ui',
  }, options);
}

export async function buildProductCenterRuntimeAcceptanceArtifactForCollection(
  rootDir: string,
  config: ProductCenterRuntimeAcceptanceArtifactConfig,
  options: ProductCenterRuntimeAcceptanceBuildOptions = {},
): Promise<string> {
  const recipesPath = path.join(rootDir, config.recipesPath);
  const runDirectory = options.runId
    ? path.join(rootDir, 'output/recipes/runs', config.collectionId, options.runId)
    : undefined;
  const feedbackPath = runDirectory
    ? path.join(runDirectory, 'feedback.json')
    : path.join(rootDir, config.feedbackPath);
  const evidencePath = runDirectory
    ? path.join(runDirectory, 'evidence.json')
    : path.join(rootDir, config.evidencePath);
  const specPath = path.join(rootDir, config.specPath);
  const outputPath = runDirectory
    ? path.join(runDirectory, 'acceptance.json')
    : path.join(rootDir, config.outputPath);

  const recipeArtifact = readJson<{ fingerprint: string; recipes: AutomationRecipe[] }>(recipesPath);
  const stageInputFingerprint = config.stageId
    ? fingerprintProductCenterStageInputs({
      rootDir,
      stage: config.stageId,
      recipesPath: config.recipesPath,
      specPath: config.specPath,
    }).fingerprint
    : undefined;
  const feedback = readJson<{
    fingerprint?: string;
    runId?: string;
    scope?: string;
    selectedCaseIds?: string[];
    generatedAt?: string;
    entries?: Array<{ recipeId?: string; caseId?: string; status?: string }>;
    observations?: Array<{
      observationId?: string;
      recipeId?: string;
      caseId?: string;
      status?: string;
    }>;
  }>(feedbackPath);
  const evidence = readJson<{
    fingerprint?: string;
    entries?: RuntimeEvidenceEntry[];
    observations?: Array<RuntimeEvidenceEntry & { observationId?: string }>;
  }>(evidencePath);
  const selectedCaseIds = [...new Set(
    options.selectedCaseIds
      ?? feedback.selectedCaseIds
      ?? feedback.entries?.map((entry) => entry.caseId).filter((value): value is string => Boolean(value))
      ?? [],
  )].sort();
  const selectedRecipes = selectedCaseIds.length > 0
    ? recipeArtifact.recipes.filter((recipe) => selectedCaseIds.includes(recipe.caseId))
    : recipeArtifact.recipes;
  if (selectedRecipes.length === 0) throw new Error('runtime acceptance 选择分母为零');
  const generatedSpecSource = fs.existsSync(specPath) ? fs.readFileSync(specPath, 'utf8') : '';
  const forbiddenFindings = scanProductCenterForbiddenPatterns({
    recipes: selectedRecipes,
    generatedSpecSources: generatedSpecSource ? [generatedSpecSource] : [],
    runtimeEvidenceEntries: evidence.entries ?? [],
    legacySourceAliases: options.legacySourceAliases ?? [],
  });
  const safety = {
    incompleteCheckpoints: findIncompleteCheckpointFiles(path.join(rootDir, 'output/checkpoints')).length,
    sensitiveFindings: scanGeneratedArtifacts(path.join(rootDir, 'output')).length,
    authStateArtifacts: fs.existsSync(path.resolve(rootDir, appConfig.storageStatePath)) ? 1 : 0,
    forbiddenPatterns: forbiddenFindings.length,
  };
  const acceptance = evaluateProductCenterRuntimeAcceptance({
    collectionId: config.collectionId,
    fingerprint: recipeArtifact.fingerprint,
    recipes: selectedRecipes.map((recipe) => ({
      recipeId: recipe.id,
      claimIds: recipe.claimIds ?? [],
    })),
    feedback,
    evidence,
    safety,
  });

  const evidenceObservationById = new Map(
    (evidence.observations ?? []).map((entry) => [entry.observationId, entry]),
  );
  const recipeById = new Map(selectedRecipes.map((recipe) => [recipe.id, recipe]));
  const observationAcceptance = (feedback.observations ?? []).flatMap((feedbackObservation) => {
    const recipe = feedbackObservation.recipeId
      ? recipeById.get(feedbackObservation.recipeId)
      : undefined;
    if (!recipe || !feedbackObservation.observationId) return [];
    const evidenceObservation = evidenceObservationById.get(feedbackObservation.observationId);
    const result = evaluateProductCenterRuntimeAcceptance({
      collectionId: config.collectionId,
      fingerprint: recipeArtifact.fingerprint,
      recipes: [{ recipeId: recipe.id, claimIds: recipe.claimIds ?? [] }],
      feedback: { fingerprint: feedback.fingerprint, entries: [feedbackObservation] },
      evidence: {
        fingerprint: evidence.fingerprint,
        entries: evidenceObservation ? [evidenceObservation] : [],
      },
      safety,
    });
    return [{
      observationId: feedbackObservation.observationId,
      recipeId: recipe.id,
      caseId: recipe.caseId,
      accepted: result.acceptedCaseIds.includes(recipe.caseId),
      issues: result.caseAcceptance[0]?.issues ?? result.issues,
    }];
  });

  const artifact = {
    schemaVersion: '1.0.0' as const,
    collectionId: acceptance.collectionId,
    fingerprint: recipeArtifact.fingerprint,
    runId: options.runId ?? feedback.runId ?? `runtime:${String(feedback.generatedAt ?? new Date().toISOString())}`,
    scope: options.scope ?? feedback.scope ?? 'full',
    selectedCaseIds: selectedRecipes.map((recipe) => recipe.caseId).sort(),
    accepted: acceptance.accepted,
    acceptedCaseIds: acceptance.acceptedCaseIds,
    caseAcceptance: acceptance.caseAcceptance,
    observationAcceptance,
    issues: acceptance.issues,
    safety,
    forbiddenFindings,
    ...(stageInputFingerprint ? { stageInputFingerprint } : {}),
    generatedAt: new Date().toISOString(),
  };
  const publishLatest = options.publishLatest ?? !options.runId;
  if (runDirectory) {
    writeProductCenterImmutableRunArtifact({
      rootDir,
      collectionId: config.collectionId,
      runId: artifact.runId,
      scope: artifact.scope,
      artifactName: 'acceptance',
      value: artifact,
      publishLatest,
      latestRelativePath: config.outputPath,
    });
  } else {
    writeJson(outputPath, artifact);
  }
  return outputPath;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function main(): Promise<void> {
  const outputPath = await buildProductCenterRuntimeAcceptanceArtifact();
  process.stdout.write('商品中心主 Recipe 原子验收产物已生成：' + outputPath + '\n');
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  });
}
