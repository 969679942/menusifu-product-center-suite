import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import type { ProductCenterGoldRunSelection } from '../automation/recipe/product-center-gold-run-optimization';
import { removeAuthState } from '../utils/product-center-run-safety';
import {
  buildProductCenterInteractionProbeEvidence,
  compileProductCenterInteractionProbeSelection,
} from '../utils/product-center-interaction-probe';
import {
  aggregateProductCenterReleaseEvidence,
  deduplicateProductCenterRouteProbeEntries,
  deriveProductCenterRuntimeEvidenceForRelease,
  validateProductCenterReleaseEvidence,
  type ProductCenterReleaseEvidence,
} from '../utils/product-center-release-evidence';
import {
  buildProductCenterLiveProbeRecoveryState,
  evaluateProductCenterLiveProbeCoverage,
  validateProductCenterLiveProbeAttemptArtifact,
  type ProductCenterLiveProbeAttempt,
  type ProductCenterLiveProbeFailure,
} from '../utils/product-center-live-probe';
import { buildProductCenterTestPlanGoldSetArtifacts } from './build-product-center-test-plan-gold-set';
import { buildProductCenterTestPlanGoldSetRuntimeAcceptanceArtifact } from './build-product-center-test-plan-gold-set-runtime-acceptance';
import { buildProductCenterItemComboAuditProbeArtifacts } from './build-product-center-item-combo-audit-probe';
import { buildProductCenterItemComboAuditRuntimeAcceptanceArtifact } from './build-product-center-item-combo-audit-runtime-acceptance';
import { runProductCenterRecipeCollectionSelection } from './product-center-recipe-collection-runner';

type ProbeContract = Parameters<typeof compileProductCenterInteractionProbeSelection>[0];
type RuntimeEvidenceArtifact = {
  fingerprint?: string;
  runId?: string;
  scope?: string;
  generatedAt?: string;
  entries?: Array<Record<string, unknown> & {
    caseId?: string;
    release?: ProductCenterReleaseEvidence;
  }>;
};

type RuntimeAcceptanceArtifact = {
  runId?: string;
  acceptedCaseIds?: string[];
};

type LiveReleaseProbeArtifact = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-live-release-probe';
  runId: string;
  observedAt: string;
  entries: Array<{
    route: string;
    capabilityIds: string[];
    release: ProductCenterReleaseEvidence;
    [key: string]: unknown;
  }>;
  failures: Array<{
    route: string;
    status: string;
    diagnosticFingerprint: string;
    category: string;
    retryable: boolean;
    durationMs: number;
    attempt: number;
  }>;
  recovery?: Record<string, unknown>;
  performance?: Record<string, unknown>;
};

export async function runProductCenterPageContractProbes(options: {
  projectRoot?: string;
  reuseLatestFull?: boolean;
  useCurrentFullRun?: boolean;
  now?: string;
  maxAgeMs?: number;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const probes = readJson<ProbeContract>(projectRoot,
    'contracts/product-center/drift/product-center-interaction-probes.json');
  const goldRecipes = readJson<{ recipes: AutomationRecipe[] }>(projectRoot,
    'contracts/product-center/recipes/product-center-test-plan-gold-set-recipes.json').recipes;
  const comboAuditRecipes = readJson<{ recipes: AutomationRecipe[] }>(projectRoot,
    'contracts/product-center/recipes/product-center-item-combo-audit-probe-recipes.json').recipes;
  const recipes = [...goldRecipes, ...comboAuditRecipes];
  const selection = compileProductCenterInteractionProbeSelection(probes, recipes);

  const runtimeEvidence = options.reuseLatestFull || options.useCurrentFullRun
    ? mergeRuntimeEvidenceArtifacts([
      readJson<RuntimeEvidenceArtifact>(projectRoot,
        'output/recipes/product-center-test-plan-gold-set-evidence.json'),
      readJson<RuntimeEvidenceArtifact>(projectRoot,
        'output/recipes/product-center-item-combo-audit-probe-evidence.json'),
    ])
    : undefined;
  const acceptance = options.reuseLatestFull || options.useCurrentFullRun
    ? mergeRuntimeAcceptanceArtifacts([
      readJson<RuntimeAcceptanceArtifact>(projectRoot,
        'output/recipes/product-center-test-plan-gold-set-acceptance.json'),
      readJson<RuntimeAcceptanceArtifact>(projectRoot,
        'output/recipes/product-center-item-combo-audit-probe-acceptance.json'),
    ])
    : undefined;
  const execution = options.useCurrentFullRun
    ? await runLiveReleaseProbe(projectRoot)
    : options.reuseLatestFull
      ? await runLiveReleaseProbe(projectRoot)
      : await runInteractionProbeSelection(projectRoot, recipes, selection);
  const selectedRuntimeEvidence = runtimeEvidence ?? execution.runtimeEvidence;
  const selectedAcceptance = acceptance ?? execution.acceptance;
  if (selectedRuntimeEvidence.scope !== 'full' && (options.reuseLatestFull || options.useCurrentFullRun)) {
    throw new Error('页面合同 Probe 复用证据必须来自完整 Gold 运行');
  }
  if (!selectedRuntimeEvidence.runId || selectedRuntimeEvidence.runId !== selectedAcceptance.runId) {
    throw new Error('页面合同 Probe evidence 与 acceptance runId 不一致');
  }

  const derivedRuntimeEvidence = deriveProductCenterRuntimeEvidenceForRelease(selectedRuntimeEvidence);
  const currentRelease = execution.release;
  const currentRoutes = deduplicateProductCenterRouteProbeEntries(execution.routes);
  const now = options.now ?? new Date().toISOString();
  const report = buildProductCenterInteractionProbeEvidence({
    probes,
    recipes,
    runtimeEvidence: derivedRuntimeEvidence,
    acceptedCaseIds: selectedAcceptance.acceptedCaseIds ?? [],
    currentRelease,
    now,
    maxAgeMs: options.maxAgeMs ?? readProbeEvidenceMaxAgeMs(projectRoot),
  });
  const outputDirectory = path.join(projectRoot, 'output/page-contract');
  const selectionPath = path.join(outputDirectory, 'product-center-interaction-probe-selection.json');
  const evidencePath = path.join(outputDirectory, 'product-center-interaction-probe-evidence.json');
  const releasePath = path.join(outputDirectory, 'product-center-current-release-probe.json');
  writeJsonAtomic(selectionPath, selection);
  writeJsonAtomic(evidencePath, report);
  writeJsonAtomic(releasePath, {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-current-release-probe',
    generatedAt: now,
    sourceRunId: execution.runId,
    sourceScope: execution.scope,
    evidenceRunId: selectedRuntimeEvidence.runId,
    selectedCaseIds: selection.selectedCaseIds,
    release: currentRelease,
    routes: currentRoutes,
  });
  if (report.status !== 'accepted') {
    throw new Error(`页面合同 Probe 未通过：observed=${report.summary.observed}/${report.summary.total}`);
  }
  return { selectionPath, evidencePath, releasePath, report };
}

async function runLiveReleaseProbe(projectRoot: string): Promise<{
  runId: string;
  scope: 'live';
  release: ProductCenterReleaseEvidence;
  routes: LiveReleaseProbeArtifact['entries'];
  runtimeEvidence: RuntimeEvidenceArtifact;
  acceptance: RuntimeAcceptanceArtifact;
}> {
  const runId = `AUTO_AUDIT_RELEASE_PROBE_${Date.now()}`;
  const runDirectory = path.join(
    projectRoot,
    'output/page-contract/runs/product-center-current-release-probe',
    runId,
  );
  const outputPath = path.join(runDirectory, 'evidence.json');
  const checkpointPath = path.join(runDirectory, 'checkpoint.json');
  const authDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-release-probe-auth-'));
  const authStatePath = path.join(authDirectory, 'auth-state.json');
  const expectedRoutes = readLiveProbeRoutes(projectRoot);
  const routeBudgetMs = readLiveProbeRouteBudgetMs();
  const attempts: ProductCenterLiveProbeAttempt[] = [];
  const appliedDelaysMs: number[] = [];
  const selectedRoutesByAttempt: Array<{ attempt: number; routes: string[] }> = [];
  let selectedRoutes = expectedRoutes;
  let finalArtifact: LiveReleaseProbeArtifact | undefined;
  try {
    const cliPath = require.resolve('@playwright/test/cli');
    for (let attempt = 0; ; attempt += 1) {
      const attemptOutputPath = path.join(runDirectory, `attempt-${attempt}.json`);
      selectedRoutesByAttempt.push({ attempt, routes: [...selectedRoutes] });
      writeJsonAtomic(checkpointPath, {
        schemaVersion: '1.0.0',
        collectionId: 'product-center-live-release-probe-checkpoint',
        runId,
        phase: 'executing',
        attempt,
        selectedRoutes,
        completedAttempts: attempts.length,
      });
      const cliArguments = [
        cliPath,
        'test',
        'tests/generated/product-center-current-release-probe.generated.spec.ts',
        '--project=chrome',
        '--workers=2',
        '--reporter=./reporters/product-center-live-release-probe.reporter.ts',
      ];
      if (attempt > 0) cliArguments.push('--no-deps');
      const startedAt = Date.now();
      const executionResult = spawnSync(process.execPath, cliArguments, {
        cwd: projectRoot,
        env: {
          ...process.env,
          MC_STORAGE_STATE_PATH: authStatePath,
          PC_PRESERVE_AUTH_STATE: '1',
          PC_LIVE_RELEASE_PROBE_OUTPUT: attemptOutputPath,
          PC_LIVE_RELEASE_PROBE_RUN_ID: runId,
          PC_LIVE_RELEASE_PROBE_ROUTES: JSON.stringify(selectedRoutes),
          PC_LIVE_RELEASE_PROBE_ATTEMPT: String(attempt),
          PW_WORKERS: '2',
        },
        stdio: 'inherit',
        shell: false,
      });
      if (!fs.existsSync(attemptOutputPath)) {
        throw new Error(`当前版本 live Probe 尝试未形成证据：runId=${runId};attempt=${attempt}`);
      }
      const attemptArtifact = readAbsoluteJson<LiveReleaseProbeArtifact>(attemptOutputPath);
      const attemptIssues = validateProductCenterLiveProbeAttemptArtifact({
        runId,
        attempt,
        selectedRoutes,
        artifact: attemptArtifact,
      });
      if (executionResult.status !== 0 && attemptArtifact.failures.length === 0) {
        attemptIssues.push(`PLAYWRIGHT_EXIT_WITHOUT_ROUTE_FAILURE:${executionResult.status ?? 'signal'}`);
      }
      if (attemptIssues.length > 0) {
        writeJsonAtomic(checkpointPath, {
          schemaVersion: '1.0.0',
          collectionId: 'product-center-live-release-probe-checkpoint',
          runId,
          phase: 'invalid-attempt-artifact',
          attempt,
          selectedRoutes,
          issues: [...new Set(attemptIssues)].sort(),
        });
        throw new Error(
          `当前版本 live Probe 尝试证据无效：attempt=${attempt};issues=${attemptIssues.join(',')}`,
        );
      }
      attempts.push({
        attempt,
        durationMs: Date.now() - startedAt,
        entries: attemptArtifact.entries,
        failures: attemptArtifact.failures as ProductCenterLiveProbeFailure[],
      });
      const recovery = buildProductCenterLiveProbeRecoveryState({
        expectedRoutes,
        attempts,
        routeBudgetMs,
      });
      writeJsonAtomic(checkpointPath, {
        schemaVersion: '1.0.0',
        collectionId: 'product-center-live-release-probe-checkpoint',
        runId,
        phase: recovery.decision === 'complete' ? 'completed' : 'evaluated',
        attempt,
        decision: recovery.decision,
        completedAttempts: attempts.length,
        recoveredRoutes: recovery.recoveredRoutes,
        unresolvedRoutes: recovery.unresolvedRoutes,
        nextRoutes: recovery.retryRoutes,
        nextDelayMs: recovery.nextDelayMs,
      });
      const observedAt = attempts
        .map((_, index) => readAbsoluteJson<LiveReleaseProbeArtifact>(
          path.join(runDirectory, `attempt-${index}.json`),
        ).observedAt)
        .sort()
        .at(-1) ?? '';
      finalArtifact = {
        schemaVersion: '1.0.0',
        collectionId: 'product-center-live-release-probe',
        runId,
        observedAt,
        entries: recovery.entries as LiveReleaseProbeArtifact['entries'],
        failures: recovery.failures as LiveReleaseProbeArtifact['failures'],
        recovery: {
          decision: recovery.decision,
          attempts: recovery.attempts,
          selectedRoutesByAttempt,
          appliedDelaysMs,
          recoveredRoutes: recovery.recoveredRoutes,
          unresolvedRoutes: recovery.unresolvedRoutes,
          deterministicFailures: recovery.deterministicFailures,
          repeatedFailureRoutes: recovery.repeatedFailureRoutes,
          artifactIssues: recovery.artifactIssues,
        },
        performance: recovery.performance,
      };
      writeJsonAtomic(outputPath, finalArtifact);
      if (recovery.decision === 'complete') break;
      if (recovery.decision !== 'retry-transient' || recovery.nextDelayMs === undefined) {
        throw new Error(
          `当前版本 live Probe 恢复停止：decision=${recovery.decision};routes=${recovery.unresolvedRoutes.join(',')}`,
        );
      }
      writeJsonAtomic(checkpointPath, {
        schemaVersion: '1.0.0',
        collectionId: 'product-center-live-release-probe-checkpoint',
        runId,
        phase: 'waiting-to-retry',
        attempt,
        completedAttempts: attempts.length,
        nextRoutes: recovery.retryRoutes,
        nextDelayMs: recovery.nextDelayMs,
      });
      appliedDelaysMs.push(recovery.nextDelayMs);
      await delay(recovery.nextDelayMs);
      selectedRoutes = recovery.retryRoutes;
    }
  } finally {
    removeAuthState(authStatePath);
    fs.rmSync(authDirectory, { recursive: true, force: true });
  }
  const artifact = finalArtifact ?? readAbsoluteJson<LiveReleaseProbeArtifact>(outputPath);
  const coverage = evaluateProductCenterLiveProbeCoverage({
    expectedRoutes,
    entries: artifact.entries,
    failures: artifact.failures ?? [],
  });
  if (!coverage.complete) {
    throw new Error(
      `当前版本 live Probe 路由覆盖失败：observed=${coverage.observed}/${coverage.total};issues=${coverage.issues.join(',')}`,
    );
  }
  const release = aggregateValidatedReleases(artifact.entries.map((entry) => entry.release));
  return {
    runId,
    scope: 'live',
    release,
    routes: artifact.entries,
    runtimeEvidence: {},
    acceptance: {},
  };
}

function readLiveProbeRouteBudgetMs(): number {
  const value = Number(process.env.PC_LIVE_RELEASE_PROBE_ROUTE_BUDGET_MS ?? 25_000);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Probe 单路由耗时预算无效');
  return value;
}

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function readLiveProbeRoutes(projectRoot: string): string[] {
  const probes = readJson<ProbeContract>(projectRoot,
    'contracts/product-center/drift/product-center-interaction-probes.json');
  const mainRecipes = readJson<{ recipes: AutomationRecipe[] }>(projectRoot,
    'contracts/product-center/recipes/product-center-pilot-recipes.json').recipes;
  return [...new Set([
    ...probes.probes.map((probe) => probe.route),
    ...mainRecipes.map((recipe) => recipe.route),
  ])].sort();
}

async function runInteractionProbeSelection(
  projectRoot: string,
  recipes: readonly AutomationRecipe[],
  selection: ReturnType<typeof compileProductCenterInteractionProbeSelection>,
) {
  await buildProductCenterTestPlanGoldSetArtifacts(projectRoot);
  buildProductCenterItemComboAuditProbeArtifacts(projectRoot);
  const comboCaseIds = new Set(['TC-ITEM-PKG-046', 'TC-ITEM-PKG-059']);
  const goldCaseIds = selection.selectedCaseIds.filter((caseId) => !comboCaseIds.has(caseId));
  const comboSelectedCaseIds = selection.selectedCaseIds.filter((caseId) => comboCaseIds.has(caseId));
  const buildSelection = (selectedCaseIds: string[]): ProductCenterGoldRunSelection => ({
    scope: 'impacted',
    selectedCaseIds,
    reasons: selectedCaseIds.map((caseId) => ({
      caseId,
      matches: selection.bindings
        .filter((binding) => binding.caseId === caseId)
        .map((binding) => binding.probeId),
    })),
  });
  const goldRecipes = recipes.filter((recipe) => !comboCaseIds.has(recipe.caseId));
  const comboRecipes = recipes.filter((recipe) => comboCaseIds.has(recipe.caseId));
  const authDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-interaction-probe-auth-'));
  const authStatePath = path.join(authDirectory, 'auth-state.json');
  try {
    const goldRun = await runProductCenterRecipeCollectionSelection(
      projectRoot,
      goldRecipes,
      buildSelection(goldCaseIds),
      {
        collectionId: 'product-center-test-plan-gold-set',
        specPath: 'tests/generated/product-center-test-plan-gold-set.generated.spec.ts',
        runIdPrefix: 'AUTO_AUDIT_INTERACTION_PROBE',
      },
      { repeatEach: 1, workers: 2, authStatePath, noDependencies: false },
    );
    const comboRun = await runProductCenterRecipeCollectionSelection(
      projectRoot,
      comboRecipes,
      buildSelection(comboSelectedCaseIds),
      {
        collectionId: 'product-center-item-combo-audit-probe',
        specPath: 'tests/generated/product-center-item-combo-audit-probe.generated.spec.ts',
        runIdPrefix: 'AUTO_AUDIT_INTERACTION_COMBO_PROBE',
      },
      { repeatEach: 1, workers: 1, authStatePath, noDependencies: true },
    );
    await buildProductCenterTestPlanGoldSetRuntimeAcceptanceArtifact(projectRoot, {
      runId: goldRun.runId,
      scope: goldRun.scope,
      selectedCaseIds: goldRun.selectedCaseIds,
      publishLatest: false,
    });
    await buildProductCenterItemComboAuditRuntimeAcceptanceArtifact(projectRoot, {
      runId: comboRun.runId,
      scope: comboRun.scope,
      selectedCaseIds: comboRun.selectedCaseIds,
      publishLatest: false,
    });
    const goldRunRoot = `output/recipes/runs/product-center-test-plan-gold-set/${goldRun.runId}`;
    const comboRunRoot = `output/recipes/runs/product-center-item-combo-audit-probe/${comboRun.runId}`;
    const runtimeEvidence = mergeRuntimeEvidenceArtifacts([
      readJson<RuntimeEvidenceArtifact>(projectRoot, `${goldRunRoot}/evidence.json`),
      readJson<RuntimeEvidenceArtifact>(projectRoot, `${comboRunRoot}/evidence.json`),
    ]);
    const acceptance = mergeRuntimeAcceptanceArtifacts([
      readJson<RuntimeAcceptanceArtifact>(projectRoot, `${goldRunRoot}/acceptance.json`),
      readJson<RuntimeAcceptanceArtifact>(projectRoot, `${comboRunRoot}/acceptance.json`),
    ]);
    const derived = deriveProductCenterRuntimeEvidenceForRelease(runtimeEvidence);
    return {
      runId: runtimeEvidence.runId ?? '',
      scope: 'impacted' as const,
      release: derived.release,
      routes: derived.entries.flatMap((entry) => entry.release ? [{
        caseId: entry.caseId,
        route: String((entry.visibleUi as Record<string, unknown> | undefined)?.route ?? ''),
        capabilityIds: ['navigation.sidebar.open'],
        release: entry.release,
        browserSignals: entry.browserSignals,
      }] : []),
      runtimeEvidence,
      acceptance,
    };
  } finally {
    removeAuthState(authStatePath);
    fs.rmSync(authDirectory, { recursive: true, force: true });
  }
}

function mergeRuntimeEvidenceArtifacts(
  artifacts: readonly RuntimeEvidenceArtifact[],
): RuntimeEvidenceArtifact {
  const runIds = artifacts.map((artifact) => artifact.runId).filter((value): value is string => Boolean(value));
  if (runIds.length !== artifacts.length) throw new Error('页面合同 Probe 子集合缺少 evidence runId');
  return {
    runId: runIds.join('+'),
    scope: artifacts.every((artifact) => artifact.scope === 'full') ? 'full' : 'impacted',
    generatedAt: new Date().toISOString(),
    entries: artifacts.flatMap((artifact) => artifact.entries ?? []),
  };
}

function mergeRuntimeAcceptanceArtifacts(
  artifacts: readonly RuntimeAcceptanceArtifact[],
): RuntimeAcceptanceArtifact {
  const runIds = artifacts.map((artifact) => artifact.runId).filter((value): value is string => Boolean(value));
  if (runIds.length !== artifacts.length) throw new Error('页面合同 Probe 子集合缺少 acceptance runId');
  return {
    runId: runIds.join('+'),
    acceptedCaseIds: [...new Set(artifacts.flatMap((artifact) => artifact.acceptedCaseIds ?? []))].sort(),
  };
}

function aggregateValidatedReleases(
  releases: readonly ProductCenterReleaseEvidence[],
): ProductCenterReleaseEvidence {
  for (const release of releases) {
    const issues = validateProductCenterReleaseEvidence(release);
    if (issues.length > 0) throw new Error(`浏览器 release evidence 无效：${issues.join(',')}`);
  }
  return aggregateProductCenterReleaseEvidence(releases);
}

function readProbeEvidenceMaxAgeMs(projectRoot: string): number {
  const policy = readJson<{ evidenceMaxAgeMs?: number }>(projectRoot,
    'contracts/product-center/drift/product-center-probe-policy.json');
  const value = Number(process.env.PC_PAGE_CONTRACT_EVIDENCE_MAX_AGE_MS ?? policy.evidenceMaxAgeMs);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Probe evidence 新鲜度策略无效');
  return value;
}

function readJson<T>(projectRoot: string, relativePath: string): T {
  return readAbsoluteJson<T>(path.join(projectRoot, relativePath));
}

function readAbsoluteJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  runProductCenterPageContractProbes({
    reuseLatestFull: process.argv.includes('--reuse-latest-full'),
    useCurrentFullRun: process.argv.includes('--use-current-full-run'),
  }).then((result) => {
    process.stdout.write(`商品中心当前版本 Probe：${result.evidencePath}\n状态：${result.report.status}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
