import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import {
  buildProductCenterFailureFingerprint,
  buildProductCenterRecipeResourcePlan,
  decideProductCenterTransientRecovery,
  type ProductCenterGoldRunScope,
  type ProductCenterGoldRunSelection,
} from '../automation/recipe/product-center-gold-run-optimization';
import { transientRetryDelaysMs } from '../api/transient-retry';
import type { ProductCenterLedgerSnapshot } from '../api/product-center/execution-ledger';
import {
  evaluateProductCenterPerformanceBudget,
  normalizeProductCenterPerformancePhases,
  summarizeProductCenterPerformancePhases,
  type ProductCenterPerformancePhases,
} from '../utils/product-center-performance-budget';
import { writeProductCenterImmutableRunArtifact } from '../utils/product-center-run-artifacts';

export type CompletedProductCenterUiRun = {
  runId: string;
  scope: ProductCenterGoldRunScope;
  selectedCaseIds: string[];
};

export type ProductCenterRecipeCollectionRunConfig = {
  collectionId: string;
  specPath: string;
  runIdPrefix: string;
};

export type ProductCenterPlaywrightExecutionInput = {
  collectionId: string;
  specPath: string;
  runId: string;
  scope: ProductCenterGoldRunScope;
  selectedCaseIds: readonly string[];
  repeatEach: number;
  workers: number;
  authStatePath: string;
  noDependencies: boolean;
  timingOutputPath: string;
};

export type ProductCenterRecipeCollectionRunOptions = {
  repeatEach: number;
  workers: number;
  authStatePath: string;
  noDependencies: boolean;
  executePlaywright?: (rootDir: string, input: ProductCenterPlaywrightExecutionInput) => number;
  delay?: (delayMs: number) => Promise<void>;
};

export async function runProductCenterRecipeCollectionSelection(
  rootDir: string,
  recipes: readonly AutomationRecipe[],
  selection: ProductCenterGoldRunSelection,
  config: ProductCenterRecipeCollectionRunConfig,
  options: ProductCenterRecipeCollectionRunOptions,
): Promise<CompletedProductCenterUiRun> {
  const runId = `${config.runIdPrefix}_${Date.now()}_${selection.scope}`;
  const performanceStartedAt = Date.now();
  const timingReportPaths: string[] = [];
  const resourcePlan = buildProductCenterRecipeResourcePlan(
    recipes.filter((recipe) => selection.selectedCaseIds.includes(recipe.caseId)),
    options.workers,
  );
  writeProductCenterImmutableRunArtifact({
    rootDir,
    collectionId: config.collectionId,
    runId,
    scope: selection.scope,
    artifactName: 'selection',
    value: { ...selection, resourcePlan },
    publishLatest: false,
  });

  let selectedCaseIds = [...selection.selectedCaseIds];
  let noDependencies = options.noDependencies;
  const execute = options.executePlaywright ?? executePlaywright;
  const waitForRetry = options.delay ?? delay;
  const previousFailureFingerprints = new Map<string, string>();
  for (let attempt = 0; ; attempt += 1) {
    const timingOutputPath = path.join(
      path.dirname(options.authStatePath),
      `${runId}-timing-attempt-${attempt}.json`,
    );
    timingReportPaths.push(timingOutputPath);
    const result = execute(rootDir, {
      collectionId: config.collectionId,
      specPath: config.specPath,
      runId,
      scope: attempt === 0 ? selection.scope : 'recovery',
      selectedCaseIds,
      repeatEach: attempt === 0 ? options.repeatEach : 1,
      workers: resourcePlan.workers,
      authStatePath: options.authStatePath,
      noDependencies,
      timingOutputPath,
    });
    noDependencies = true;
    if (result === 0) break;

    const recovery = failedTransientCaseIds(
      rootDir,
      config.collectionId,
      runId,
      recipes,
      selectedCaseIds,
      previousFailureFingerprints,
    );
    for (const [caseId, fingerprint] of recovery.failureFingerprints) {
      previousFailureFingerprints.set(caseId, fingerprint);
    }
    const failedCaseIds = recovery.retryCaseIds;
    if (failedCaseIds.length === 0 || attempt >= transientRetryDelaysMs.length) {
      writeRunPerformanceArtifact(
        rootDir,
        config.collectionId,
        runId,
        selection.scope,
        performanceStartedAt,
        timingReportPaths,
      );
      throw new Error(`Recipe UI 运行失败且不可隔离恢复：collection=${config.collectionId};runId=${runId}`);
    }
    const delayMs = transientRetryDelaysMs[attempt];
    await waitForRetry(delayMs);
    selectedCaseIds = failedCaseIds;
  }
  publishProductCenterCompletedRunArtifacts({
    rootDir,
    config,
    runId,
    scope: selection.scope,
    selectedCaseIds: selection.selectedCaseIds,
  });
  writeRunPerformanceArtifact(
    rootDir,
    config.collectionId,
    runId,
    selection.scope,
    performanceStartedAt,
    timingReportPaths,
  );
  return { runId, scope: selection.scope, selectedCaseIds: selection.selectedCaseIds };
}

export function publishProductCenterCompletedRunArtifacts(input: {
  rootDir: string;
  config: ProductCenterRecipeCollectionRunConfig;
  runId: string;
  scope: ProductCenterGoldRunScope;
  selectedCaseIds: readonly string[];
}): void {
  const runDirectory = path.join(
    input.rootDir,
    'output/recipes/runs',
    input.config.collectionId,
    input.runId,
  );
  for (const artifactName of ['feedback', 'evidence'] as const) {
    const artifactPath = path.join(runDirectory, `${artifactName}.json`);
    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Recipe UI 完成后缺少 ${artifactName}：${input.runId}`);
    }
    const artifact = readJson<Record<string, unknown>>(artifactPath);
    writeProductCenterImmutableRunArtifact({
      rootDir: input.rootDir,
      collectionId: input.config.collectionId,
      runId: input.runId,
      scope: input.scope,
      artifactName,
      value: {
        ...artifact,
        runId: input.runId,
        scope: input.scope,
        selectedCaseIds: [...new Set(input.selectedCaseIds)].sort(),
      },
      publishLatest: input.scope === 'full',
    });
  }
}

function executePlaywright(rootDir: string, input: ProductCenterPlaywrightExecutionInput): number {
  const cliPath = require.resolve('@playwright/test/cli');
  const args = [
    cliPath,
    'test',
    input.specPath,
    '--project=chrome',
    `--workers=${input.workers}`,
    ...(input.repeatEach > 1 ? [`--repeat-each=${input.repeatEach}`] : []),
    ...(input.noDependencies ? ['--no-deps'] : []),
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      MC_STORAGE_STATE_PATH: input.authStatePath,
      PC_PRESERVE_AUTH_STATE: '1',
      PC_RECIPE_RUN_ID: input.runId,
      PC_RECIPE_RUN_SCOPE: input.scope,
      PC_RECIPE_COLLECTION_ID: input.collectionId,
      PC_RECIPE_SELECTED_CASE_IDS: input.selectedCaseIds.join(','),
      PW_WORKERS: String(input.workers),
      PW_TIMING_OUTPUT: input.timingOutputPath,
    },
    stdio: 'inherit',
    shell: false,
  });
  return result.status ?? 1;
}

function writeRunPerformanceArtifact(
  rootDir: string,
  collectionId: string,
  runId: string,
  scope: ProductCenterGoldRunScope,
  startedAt: number,
  timingReportPaths: readonly string[],
): void {
  const reports = timingReportPaths
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => readJson<{
      status: string;
      durationMs: number;
      caseCount: number;
      passed: number;
      failed: number;
      cases?: Array<{
        file?: string;
        status?: string;
        durationMs?: number;
        runtimeEvidence?: {
          caseId?: string;
          execution?: { phaseDurationsMs?: Partial<ProductCenterPerformancePhases> };
        };
        performanceBudget?: unknown;
      }>;
    }>(filePath));
  const runtimeCases = reports.flatMap((report, attemptIndex) => (report.cases ?? []).flatMap((item) => {
    const caseId = item.runtimeEvidence?.caseId;
    const rawPhases = item.runtimeEvidence?.execution?.phaseDurationsMs;
    if (!caseId || !rawPhases) return [];
    return [{
      attemptIndex,
      caseId,
      status: item.status ?? 'unknown',
      durationMs: item.durationMs ?? 0,
      phases: normalizeProductCenterPerformancePhases(rawPhases),
      performanceBudget: item.performanceBudget,
    }];
  }));
  const phases = summarizeProductCenterPerformancePhases(runtimeCases.map((item) => item.phases));
  phases.auth = reports.flatMap((report) => report.cases ?? [])
    .filter((item) => item.file?.includes('auth.setup'))
    .reduce((total, item) => total + Number(item.durationMs ?? 0), 0);
  const totalDurationMs = Date.now() - startedAt;
  const performanceBudget = evaluateProductCenterPerformanceBudget({
    scope,
    totalDurationMs,
    phases,
  });
  writeProductCenterImmutableRunArtifact({
    rootDir,
    collectionId,
    runId,
    scope,
    artifactName: 'performance',
    value: {
      schemaVersion: '1.0.0',
      runId,
      scope,
      totalDurationMs,
      retryCount: Math.max(0, reports.length - 1),
      performanceBudget,
      attempts: reports.map((report, attemptIndex) => ({
        attemptIndex,
        status: report.status,
        durationMs: report.durationMs,
        caseCount: report.caseCount,
        passed: report.passed,
        failed: report.failed,
      })),
      cases: runtimeCases,
    },
    publishLatest: false,
  });
}

function failedTransientCaseIds(
  rootDir: string,
  collectionId: string,
  runId: string,
  recipes: readonly AutomationRecipe[],
  selectedCaseIds: readonly string[],
  previousFailureFingerprints: ReadonlyMap<string, string>,
): { retryCaseIds: string[]; failureFingerprints: Map<string, string> } {
  const feedbackPath = path.join(
    rootDir,
    `output/recipes/runs/${collectionId}/${runId}/feedback.json`,
  );
  if (!fs.existsSync(feedbackPath)) {
    return { retryCaseIds: [], failureFingerprints: new Map() };
  }
  const feedback = readJson<{
    entries?: Array<{ caseId?: string; status?: string; diagnostic?: string }>;
  }>(feedbackPath);
  const snapshots = checkpointSnapshotsForRun(rootDir, runId);
  const failureFingerprints = new Map<string, string>();
  const decisions = (feedback.entries ?? []).flatMap((entry) => {
    if (!entry.caseId || !selectedCaseIds.includes(entry.caseId) || entry.status === 'passed') return [];
    const caseId = entry.caseId;
    const recipe = recipes.find((item) => item.caseId === caseId);
    if (!recipe) return [];
    const matchingSnapshots = snapshots.filter((snapshot) => snapshot.runId.includes(safeCaseToken(caseId)));
    const decision = decideProductCenterTransientRecovery({
      action: recipe.action,
      diagnostic: entry.diagnostic ?? '',
      ledgerEntries: matchingSnapshots.flatMap((snapshot) => snapshot.entries),
      previousFailureFingerprint: failureFingerprints.get(caseId)
        ?? previousFailureFingerprints.get(caseId),
    });
    failureFingerprints.set(caseId, buildProductCenterFailureFingerprint(entry.diagnostic ?? ''));
    return [{ caseId, decision: decision.decision }];
  });
  if (decisions.length === 0 || decisions.some((item) => item.decision !== 'retry-isolated')) {
    return { retryCaseIds: [], failureFingerprints };
  }
  return {
    retryCaseIds: [...new Set(decisions.map((item) => item.caseId))].sort(),
    failureFingerprints,
  };
}

function checkpointSnapshotsForRun(rootDir: string, runId: string): ProductCenterLedgerSnapshot[] {
  const directory = path.join(rootDir, 'output/checkpoints');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => name.endsWith('.json')).flatMap((name) => {
    const snapshot = readJson<ProductCenterLedgerSnapshot>(path.join(directory, name));
    return typeof snapshot.runId === 'string' && snapshot.runId.includes(runId) ? [snapshot] : [];
  });
}

function safeCaseToken(caseId: string): string {
  return caseId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
