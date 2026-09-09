import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';

export type ProductCenterGoldOnboardingStage = 'single' | 'impacted' | 'full';

type CompletedStage = {
  runId: string;
  selectedCaseIds: string[];
  completedAt: string;
};

export type ProductCenterGoldOnboardingCheckpoint = {
  schemaVersion: '1.0.0';
  caseId: string;
  recipeFingerprint: string;
  repeatEach: number;
  nextStage: ProductCenterGoldOnboardingStage | 'complete';
  stages: Partial<Record<ProductCenterGoldOnboardingStage, CompletedStage>>;
  pendingAcceptance?: CompletedStage & { stage: ProductCenterGoldOnboardingStage };
  updatedAt: string;
};

type LoadInput = {
  caseId: string;
  recipes: readonly AutomationRecipe[];
  repeatEach: number;
};

const stageOrder: readonly ProductCenterGoldOnboardingStage[] = ['single', 'impacted', 'full'];

export function loadProductCenterGoldOnboardingCheckpoint(
  rootDir: string,
  input: LoadInput,
): ProductCenterGoldOnboardingCheckpoint {
  const checkpointPath = productCenterGoldOnboardingCheckpointPath(rootDir);
  const recipeFingerprint = buildRecipeFingerprint(input.recipes);
  if (fs.existsSync(checkpointPath)) {
    const existing = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as ProductCenterGoldOnboardingCheckpoint;
    if (existing.caseId === input.caseId
      && existing.recipeFingerprint === recipeFingerprint
      && existing.repeatEach === input.repeatEach) {
      return existing;
    }
  }
  return {
    schemaVersion: '1.0.0',
    caseId: input.caseId,
    recipeFingerprint,
    repeatEach: input.repeatEach,
    nextStage: 'single',
    stages: {},
    updatedAt: new Date().toISOString(),
  };
}

export function recordProductCenterGoldOnboardingUiStage(
  rootDir: string,
  checkpoint: ProductCenterGoldOnboardingCheckpoint,
  completed: {
    stage: ProductCenterGoldOnboardingStage;
    runId: string;
    selectedCaseIds: readonly string[];
  },
): ProductCenterGoldOnboardingCheckpoint {
  if (checkpoint.nextStage !== completed.stage) {
    throw new Error(`Gold onboarding UI 阶段顺序无效：expected=${checkpoint.nextStage};actual=${completed.stage}`);
  }
  const next: ProductCenterGoldOnboardingCheckpoint = {
    ...checkpoint,
    pendingAcceptance: {
      stage: completed.stage,
      runId: completed.runId,
      selectedCaseIds: [...completed.selectedCaseIds].sort(),
      completedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
  writeJsonAtomic(productCenterGoldOnboardingCheckpointPath(rootDir), next);
  return next;
}

export function assertProductCenterGoldSingleAccepted(
  rootDir: string,
  input: { caseId: string; recipeFingerprint: string },
): string {
  const runsDirectory = path.join(
    rootDir,
    'output/recipes/runs/product-center-test-plan-gold-set',
  );
  const acceptedRunId = fs.existsSync(runsDirectory)
    ? fs.readdirSync(runsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse()
      .find((runId) => {
        const acceptancePath = path.join(runsDirectory, runId, 'acceptance.json');
        if (!fs.existsSync(acceptancePath)) return false;
        const acceptance = JSON.parse(fs.readFileSync(acceptancePath, 'utf8')) as {
          scope?: string;
          accepted?: boolean;
          acceptedCaseIds?: string[];
          fingerprint?: string;
        };
        return acceptance.scope === 'single'
          && acceptance.accepted === true
          && acceptance.fingerprint === input.recipeFingerprint
          && acceptance.acceptedCaseIds?.length === 1
          && acceptance.acceptedCaseIds[0] === input.caseId;
      })
    : undefined;
  if (!acceptedRunId) {
    throw new Error(`Gold onboarding 前必须先运行并通过目标 single：caseId=${input.caseId}`);
  }
  return acceptedRunId;
}

export function completeProductCenterGoldOnboardingStage(
  rootDir: string,
  checkpoint: ProductCenterGoldOnboardingCheckpoint,
  completed: {
    stage: ProductCenterGoldOnboardingStage;
    runId: string;
    selectedCaseIds: readonly string[];
  },
): ProductCenterGoldOnboardingCheckpoint {
  if (checkpoint.nextStage !== completed.stage) {
    throw new Error(`Gold onboarding 阶段顺序无效：expected=${checkpoint.nextStage};actual=${completed.stage}`);
  }
  if (checkpoint.pendingAcceptance
    && (checkpoint.pendingAcceptance.stage !== completed.stage
      || checkpoint.pendingAcceptance.runId !== completed.runId)) {
    throw new Error('Gold onboarding 待验收运行与完成运行不一致');
  }
  const currentIndex = stageOrder.indexOf(completed.stage);
  const nextStage = stageOrder[currentIndex + 1] ?? 'complete';
  const next: ProductCenterGoldOnboardingCheckpoint = {
    ...checkpoint,
    nextStage,
    stages: {
      ...checkpoint.stages,
      [completed.stage]: {
        runId: completed.runId,
        selectedCaseIds: [...completed.selectedCaseIds].sort(),
        completedAt: new Date().toISOString(),
      },
    },
    pendingAcceptance: undefined,
    updatedAt: new Date().toISOString(),
  };
  writeJsonAtomic(productCenterGoldOnboardingCheckpointPath(rootDir), next);
  return next;
}

export function productCenterGoldOnboardingCheckpointPath(rootDir: string): string {
  return path.join(rootDir, 'output/checkpoints/product-center-gold-onboarding.json');
}

function buildRecipeFingerprint(recipes: readonly AutomationRecipe[]): string {
  const stable = [...recipes]
    .sort((left, right) => left.caseId.localeCompare(right.caseId))
    .map((recipe) => ({
      id: recipe.id,
      caseId: recipe.caseId,
      title: recipe.title,
      route: recipe.route,
      action: recipe.action,
      sourceIds: recipe.sourceIds,
      claimIds: recipe.claimIds,
      capabilities: recipe.capabilities,
      assertions: recipe.assertions,
      seed: recipe.seed,
      mutation: recipe.mutation,
      cleanup: recipe.cleanup,
    }));
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
