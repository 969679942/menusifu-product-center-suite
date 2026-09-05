import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import {
  buildProductCenterGoldRunSelection,
  buildExactProductCenterGoldRunSelection,
  type ProductCenterGoldRunSelection,
} from '../automation/recipe/product-center-gold-run-optimization';
import { removeAuthState } from '../utils/product-center-run-safety';
import {
  assertProductCenterGoldSingleAccepted,
  completeProductCenterGoldOnboardingStage,
  loadProductCenterGoldOnboardingCheckpoint,
  recordProductCenterGoldOnboardingUiStage,
  type ProductCenterGoldOnboardingStage,
} from '../utils/product-center-gold-onboarding-checkpoint';
import { buildProductCenterTestPlanGoldSetArtifacts } from './build-product-center-test-plan-gold-set';
import { buildProductCenterTestPlanGoldSetRuntimeAcceptanceArtifact } from './build-product-center-test-plan-gold-set-runtime-acceptance';
import {
  runProductCenterRecipeCollectionSelection,
  type CompletedProductCenterUiRun,
  type ProductCenterRecipeCollectionRunConfig,
} from './product-center-recipe-collection-runner';

type GoldRunArguments = {
  caseId?: string;
  impactedCaseId?: string;
  caseIds?: string[];
  onboard: boolean;
  repeatEach: number;
  workers: number;
};

const goldRunConfig: ProductCenterRecipeCollectionRunConfig = {
  collectionId: 'product-center-test-plan-gold-set',
  specPath: 'tests/generated/product-center-test-plan-gold-set.generated.spec.ts',
  runIdPrefix: 'AUTO_AUDIT_GOLD',
};

export function parseProductCenterGoldRunArguments(args: readonly string[]): GoldRunArguments {
  const value = (prefix: string) => args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const caseId = value('--case-id=');
  const impactedCaseId = value('--impacted-case-id=');
  const caseIds = value('--case-ids=')
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const onboard = args.includes('--onboard');
  const repeatEach = positiveInteger(value('--repeat-each='), onboard ? 3 : 1, 'repeat-each');
  const workers = positiveInteger(value('--workers='), 2, 'workers');
  if ([caseId, impactedCaseId, caseIds?.length ? 'case-ids' : undefined].filter(Boolean).length > 1) {
    throw new Error('不能同时指定 --case-id、--impacted-case-id 和 --case-ids');
  }
  if (onboard && !caseId) throw new Error('Gold onboarding 必须指定 --case-id');
  return {
    ...(caseId ? { caseId } : {}),
    ...(impactedCaseId ? { impactedCaseId } : {}),
    ...(caseIds?.length ? { caseIds } : {}),
    onboard,
    repeatEach,
    workers,
  };
}

export async function runProductCenterGoldSet(
  rootDir = process.cwd(),
  args = parseProductCenterGoldRunArguments(process.argv.slice(2)),
): Promise<CompletedProductCenterUiRun[]> {
  await buildProductCenterTestPlanGoldSetArtifacts(rootDir);
  const recipesDocument = readJson<{ fingerprint: string; recipes: AutomationRecipe[] }>(path.join(
    rootDir,
    'contracts/product-center/recipes/product-center-test-plan-gold-set-recipes.json',
  ));
  const authDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-gold-auth-'));
  const authStatePath = path.join(authDirectory, 'auth-state.json');
  const completed: CompletedProductCenterUiRun[] = [];
  let hasAuthenticatedSession = false;
  try {
    if (args.onboard && args.caseId) {
      assertProductCenterGoldSingleAccepted(rootDir, {
        caseId: args.caseId,
        recipeFingerprint: recipesDocument.fingerprint,
      });
      let checkpoint = loadProductCenterGoldOnboardingCheckpoint(rootDir, {
        caseId: args.caseId,
        recipes: recipesDocument.recipes,
        repeatEach: args.repeatEach,
      });
      for (const stage of ['single', 'impacted', 'full'] as const) {
        const prior = checkpoint.stages[stage];
        if (prior) {
          completed.push({ runId: prior.runId, scope: stage, selectedCaseIds: prior.selectedCaseIds });
          continue;
        }
        const pending = checkpoint.pendingAcceptance?.stage === stage
          ? checkpoint.pendingAcceptance
          : undefined;
        const selection = buildOnboardingSelection(recipesDocument.recipes, args.caseId, stage);
        const run = pending
          ? { runId: pending.runId, scope: stage, selectedCaseIds: pending.selectedCaseIds }
          : await runProductCenterRecipeCollectionSelection(rootDir, recipesDocument.recipes, selection, goldRunConfig, {
            repeatEach: stage === 'single' ? args.repeatEach : 1,
            workers: stage === 'single' ? 1 : args.workers,
            authStatePath,
            noDependencies: hasAuthenticatedSession,
          });
        if (!pending) {
          checkpoint = recordProductCenterGoldOnboardingUiStage(rootDir, checkpoint, {
            stage,
            runId: run.runId,
            selectedCaseIds: run.selectedCaseIds,
          });
        }
        await buildProductCenterTestPlanGoldSetRuntimeAcceptanceArtifact(rootDir, {
          runId: run.runId,
          scope: run.scope,
          selectedCaseIds: run.selectedCaseIds,
          publishLatest: run.scope === 'full',
        });
        checkpoint = completeProductCenterGoldOnboardingStage(rootDir, checkpoint, {
          stage,
          runId: run.runId,
          selectedCaseIds: run.selectedCaseIds,
        });
        completed.push(run);
        if (!pending) hasAuthenticatedSession = true;
      }
    } else {
      const selection = buildProductCenterGoldRunSelection(recipesDocument.recipes, {
        ...(args.caseId ? { caseId: args.caseId } : {}),
        ...(args.impactedCaseId ? { impactedCaseId: args.impactedCaseId } : {}),
      });
      const exactSelection = args.caseIds
        ? buildExactProductCenterGoldRunSelection(recipesDocument.recipes, args.caseIds)
        : selection;
      completed.push(await runProductCenterRecipeCollectionSelection(rootDir, recipesDocument.recipes, exactSelection, goldRunConfig, {
        repeatEach: args.repeatEach,
        workers: selection.scope === 'single' ? 1 : args.workers,
        authStatePath,
        noDependencies: false,
      }));
    }
  } finally {
    removeAuthState(authStatePath);
    fs.rmSync(authDirectory, { recursive: true, force: true });
  }

  for (const item of args.onboard ? [] : completed) {
    await buildProductCenterTestPlanGoldSetRuntimeAcceptanceArtifact(rootDir, {
      runId: item.runId,
      scope: item.scope,
      selectedCaseIds: item.selectedCaseIds,
      publishLatest: item.scope === 'full',
    });
  }
  return completed;
}

function buildOnboardingSelection(
  recipes: readonly AutomationRecipe[],
  caseId: string,
  stage: ProductCenterGoldOnboardingStage,
): ProductCenterGoldRunSelection {
  if (stage === 'single') return buildProductCenterGoldRunSelection(recipes, { caseId });
  if (stage === 'impacted') return buildProductCenterGoldRunSelection(recipes, { impactedCaseId: caseId });
  return buildProductCenterGoldRunSelection(recipes);
}

function positiveInteger(raw: string | undefined, fallback: number, label: string): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} 必须为正整数`);
  return value;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

if (require.main === module) {
  void runProductCenterGoldSet().then((runs) => {
    process.stdout.write(`Gold UI 运行完成：${runs.map((run) => `${run.scope}:${run.runId}`).join(',')}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
