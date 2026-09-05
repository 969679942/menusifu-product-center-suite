import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import {
  evaluateProductCenterEvidenceFreshness,
  validateProductCenterReleaseEvidence,
  type ProductCenterReleaseEvidence,
} from './product-center-release-evidence';
import { stableStringify } from './product-center-test-contract';

export type ProductCenterUiStageId =
  | 'main-ui'
  | 'gold-ui'
  | 'approved-technical-bindings-ui'
  | 'item-category-leaf-read-only-probe'
  | 'item-combo-audit-probe'
  | 'page-contract-probe';

export type ProductCenterStageInputFingerprint = {
  stage: ProductCenterUiStageId;
  fingerprint: string;
  files: string[];
};

export type ProductCenterStageReuseDecision = {
  reusable: boolean;
  reason: string;
  stageInputFingerprint: string;
  sourceRunId?: string;
  evidenceRunId?: string;
  freshnessIssues?: string[];
};

export function fingerprintProductCenterRecipeSemantics(
  recipes: readonly AutomationRecipe[],
): string {
  const normalized = [...recipes]
    .sort((left, right) => left.caseId.localeCompare(right.caseId))
    .map((recipe) => ({ ...recipe }));
  return createHash('sha256').update(stableStringify(normalized)).digest('hex');
}

export function decideProductCenterRuntimeReuse(input: {
  sourceRecipes: readonly AutomationRecipe[];
  targetRecipes: readonly AutomationRecipe[];
  sourceRun?: { runId?: string; scope?: string; selectedCaseIds?: readonly string[] };
}): {
  reusable: boolean;
  reason: string;
  sourceSemanticFingerprint: string;
  targetSemanticFingerprint: string;
} {
  const sourceSemanticFingerprint = fingerprintProductCenterRecipeSemantics(input.sourceRecipes);
  const targetSemanticFingerprint = fingerprintProductCenterRecipeSemantics(input.targetRecipes);
  const expectedCaseIds = input.targetRecipes.map((recipe) => recipe.caseId).sort();
  const selectedCaseIds = [...(input.sourceRun?.selectedCaseIds ?? [])].sort();
  const reusable = sourceSemanticFingerprint === targetSemanticFingerprint
    && input.sourceRun?.scope === 'full'
    && stableStringify(expectedCaseIds) === stableStringify(selectedCaseIds)
    && Boolean(input.sourceRun?.runId);
  return {
    reusable,
    reason: reusable
      ? 'recipe-semantics-and-full-run-match'
      : 'recipe-semantics-or-full-run-mismatch',
    sourceSemanticFingerprint,
    targetSemanticFingerprint,
  };
}

export function fingerprintProductCenterStageInputs(input: {
  rootDir: string;
  stage: ProductCenterUiStageId;
  recipesPath: string;
  specPath: string;
  sourcePaths?: readonly string[];
}): ProductCenterStageInputFingerprint {
  const relativePaths = new Set<string>([
    input.recipesPath,
    input.specPath,
    ...(input.sourcePaths ?? defaultStageSourcePaths(input.stage)),
  ]);
  const files = [...relativePaths]
    .flatMap((relativePath) => collectStageInputFiles(input.rootDir, relativePath))
    .filter((filePath, index, all) => all.indexOf(filePath) === index)
    .sort();
  const hash = createHash('sha256');
  hash.update(stableStringify({ schemaVersion: '1.0.0', stage: input.stage }));
  for (const filePath of files) {
    hash.update(filePath);
    hash.update(fs.readFileSync(path.join(input.rootDir, filePath)));
  }
  return {
    stage: input.stage,
    fingerprint: hash.digest('hex'),
    files,
  };
}

export function evaluateProductCenterStageReuse(input: {
  rootDir: string;
  stage: Exclude<ProductCenterUiStageId, 'page-contract-probe'>;
  collectionId: string;
  recipesPath: string;
  specPath: string;
  sourcePaths?: readonly string[];
  acceptancePath: string;
  evidencePath: string;
  currentReleaseProbePath: string;
  now?: string;
  maxAgeMs: number;
}): ProductCenterStageReuseDecision {
  const stageInputFingerprint = fingerprintProductCenterStageInputs(input);
  const reject = (reason: string, extra: Partial<ProductCenterStageReuseDecision> = {}) => ({
    reusable: false,
    reason,
    stageInputFingerprint: stageInputFingerprint.fingerprint,
    ...extra,
  });
  const acceptance = readOptionalJson<Record<string, unknown>>(input.rootDir, input.acceptancePath);
  if (!acceptance) return reject('acceptance-missing');
  if (acceptance.accepted !== true || acceptance.scope !== 'full') {
    return reject('acceptance-not-full-or-not-accepted');
  }
  if (acceptance.stageInputFingerprint !== stageInputFingerprint.fingerprint) {
    return reject('stage-input-fingerprint-mismatch');
  }
  const currentProbe = readOptionalJson<{
    release?: ProductCenterReleaseEvidence;
    routes?: Array<{ route?: string; release?: ProductCenterReleaseEvidence }>;
  }>(input.rootDir, input.currentReleaseProbePath);
  if (!currentProbe?.release || !Array.isArray(currentProbe.routes)) {
    return reject('current-release-probe-missing');
  }
  if (validateProductCenterReleaseEvidence(currentProbe.release).length > 0) {
    return reject('current-release-probe-invalid');
  }
  const recipesDocument = readOptionalJson<{ recipes?: Array<{ id?: string; caseId?: string; route?: string }> }>(
    input.rootDir,
    input.recipesPath,
  );
  const evidence = readOptionalJson<{
    runId?: string;
    entries?: Array<{ recipeId?: string; caseId?: string; release?: ProductCenterReleaseEvidence }>;
  }>(input.rootDir, input.evidencePath);
  if (!recipesDocument?.recipes || !evidence?.entries) return reject('runtime-evidence-missing');
  const evidenceByRecipeId = new Map(evidence.entries.map((entry) => [entry.recipeId, entry]));
  const routeReleases = new Map(
    currentProbe.routes
      .filter((entry) => entry.route && entry.release)
      .map((entry) => [entry.route as string, entry.release as ProductCenterReleaseEvidence]),
  );
  const freshnessIssues: string[] = [];
  for (const recipe of recipesDocument.recipes) {
    if (!recipe.id || !recipe.route) {
      freshnessIssues.push(`recipe-route-missing:${recipe.caseId ?? recipe.id ?? 'unknown'}`);
      continue;
    }
    const runtimeEntry = evidenceByRecipeId.get(recipe.id);
    const currentRouteRelease = routeReleases.get(recipe.route);
    if (!runtimeEntry?.release || !currentRouteRelease) {
      freshnessIssues.push(`route-release-missing:${recipe.caseId ?? recipe.id}`);
      continue;
    }
    const freshness = evaluateProductCenterEvidenceFreshness({
      evidence: runtimeEntry.release,
      // Route coverage is checked above; freshness compares against the aggregate
      // application release so lazy-loaded route chunks do not invalidate reuse.
      current: currentProbe.release,
      now: input.now,
      maxAgeMs: input.maxAgeMs,
    });
    for (const issue of freshness.issues) freshnessIssues.push(`${recipe.caseId ?? recipe.id}:${issue}`);
  }
  if (freshnessIssues.length > 0) {
    return reject('runtime-evidence-not-fresh', {
      evidenceRunId: typeof evidence.runId === 'string' ? evidence.runId : undefined,
      freshnessIssues: [...new Set(freshnessIssues)].sort(),
    });
  }
  return {
    reusable: true,
    reason: 'stage-input-and-release-freshness-match',
    stageInputFingerprint: stageInputFingerprint.fingerprint,
    sourceRunId: typeof acceptance.runId === 'string' ? acceptance.runId : undefined,
    evidenceRunId: typeof evidence.runId === 'string' ? evidence.runId : undefined,
    freshnessIssues: [],
  };
}

function collectStageInputFiles(rootDir: string, relativePath: string): string[] {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.startsWith('output/') || normalized.includes('/node_modules/')) return [];
  const absolutePath = path.join(rootDir, normalized);
  if (!fs.existsSync(absolutePath)) return [];
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [normalized];
  if (!stat.isDirectory()) return [];
  return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const child = `${normalized}/${entry.name}`;
    if (entry.isDirectory()) return collectStageInputFiles(rootDir, child);
    return entry.isFile() && !child.startsWith('output/') ? [child] : [];
  });
}

function defaultStageSourcePaths(stage: ProductCenterUiStageId): readonly string[] {
  const common = [
    'package.json',
    'playwright.config.ts',
    'automation/recipe',
    'flows',
    'pages',
    'utils/product-center-runtime-evidence.ts',
    'utils/product-center-release-evidence.ts',
    'reporters/product-center-recipe.reporter.ts',
  ];
  if (stage === 'page-contract-probe') {
    return [
      ...common,
      'scripts/run-product-center-page-contract-probes.ts',
      'tests/generated/product-center-current-release-probe.generated.spec.ts',
      'reporters/product-center-live-release-probe.reporter.ts',
    ];
  }
  if (stage === 'gold-ui') {
    return [...common, 'scripts/run-product-center-test-plan-gold-set.ts'];
  }
  if (stage === 'approved-technical-bindings-ui') {
    return [
      ...common,
      'scripts/run-product-center-approved-technical-bindings-smart.ts',
      'scripts/run-product-center-approved-technical-bindings.ts',
      'contracts/product-center/reviews/product-center-technical-binding-approvals.json',
    ];
  }
  if (stage === 'item-category-leaf-read-only-probe') {
    return [...common, 'scripts/run-product-center-item-category-leaf-probe.ts'];
  }
  if (stage === 'item-combo-audit-probe') {
    return [...common, 'scripts/run-product-center-item-combo-audit-probe.ts'];
  }
  return common;
}

function readOptionalJson<T>(rootDir: string, relativePath: string): T | undefined {
  const filePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(filePath)) return undefined;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
