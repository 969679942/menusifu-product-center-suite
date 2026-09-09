import fs from 'node:fs';
import path from 'node:path';
import { TestExecutionIndex, type TestExecutionIndexRecord } from '../utils/test-execution-index';
import { resolveSystemTestPlatformArtifact } from '../utils/system-test-platform-paths';
import { assertBatchPerformanceGate } from '../utils/playwright-batch-policy';
import { readPlaywrightExecutionReceipts } from '../utils/playwright-execution-receipt';
import {
  fingerprintExecutionContext,
  normalizeReleaseObservation,
  resolveReuseStatus,
} from '../utils/test-execution-state';
import {
  assertSystemTestArtifactLineage,
  fingerprintSystemTestArtifact,
} from '../automation/system-test/system-test-artifact-lineage';
import {
  fingerprintProductCenterSourceGovernedPlan,
  fingerprintProductCenterSourceGovernedSelection,
} from './build-product-center-source-governed-execution-plan';

type ExecutionPlan = {
  generatedAt: string;
  planFingerprint: string;
  selectionFingerprint: string;
  summary: {
    total: number;
    execute: number;
    deferred: number;
    blockedSource: number;
    blockedTechnical: number;
    productDefect: number;
    handled: number;
    notApplicable: number;
  };
  execution: {
    selectedCaseIds: string[];
    runners: Array<{
      runnerId: string;
      spec: string;
      selectedCaseIds: string[];
      sourceRecoveryCaseIds?: string[];
    }>;
  };
  tasks: Array<{
    caseId: string;
    module: string;
    title: string | null;
    action: 'execute' | 'source-recovery' | 'handled' | 'deferred' | 'blocked-source' | 'blocked-technical' | 'product-defect' | 'not-applicable';
    reason: string;
    bindingFingerprint?: string | null;
  }>;
};

type PlaywrightResult = {
  status?: string;
  duration?: number;
  startTime?: string;
  attachments?: Array<{ name?: string; body?: string; contentType?: string }>;
};

type PlaywrightTest = {
  status?: string;
  annotations?: Array<{ type?: string; description?: string }>;
  results?: PlaywrightResult[];
};

type PlaywrightSpec = {
  title?: string;
  file?: string;
  tags?: string[];
  tests?: PlaywrightTest[];
};

type PlaywrightSuite = {
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
};

type PlaywrightReport = {
  stats?: { startTime?: string };
  suites?: PlaywrightSuite[];
};

type CaseStatus = 'passed' | 'failed' | 'skipped';

type CaseAttempt = {
  caseId: string;
  title: string;
  status: CaseStatus;
  startedAt: string;
  durationMs: number;
  evidencePath: string;
};

type PreviousSourceGovernedExecutionResult = {
  planGeneratedAt?: string;
  planFingerprint?: string;
  selectionFingerprint?: string;
  evidence?: { playwrightReports?: string[] };
  executionCases?: SourceGovernedExecutionCase[];
};

type ExecutionSelection = ExecutionPlan['execution'];

export type SourceGovernedExecutionCase = {
  caseId: string;
  module: string;
  title: string | null;
  status: CaseStatus | 'not-run';
  latestAttempt: CaseAttempt | null;
  attemptCount: number;
  history: CaseAttempt[];
};

type CleanupSummary = {
  status: 'residue-verified' | 'incomplete';
  checkpointFiles: number;
  emptyCheckpoints: number;
  entries: number;
  residueVerifiedEntries: number;
  incompleteEntries: Array<{ checkpointPath: string; phase: string }>;
};

export function buildProductCenterSourceGovernedExecutionResult(options: {
  projectRoot?: string;
  generatedAt?: string;
  write?: boolean;
  reportPaths?: readonly string[];
  selectedCaseIds?: readonly string[];
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const workspaceRoot = path.resolve(projectRoot, '..');
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const planPath = path.join(workspaceRoot, 'deliverables/product-center-source-governance/execution-plan.json');
  const plan = readJson<ExecutionPlan>(planPath);
  assertProductCenterSourceGovernedPlanIntegrity(plan);
  const outputRoot = path.join(projectRoot, 'output');
  const reportManifest = readReportManifest(projectRoot);
  const reportPaths = (options.reportPaths ?? reportManifest?.reportPaths ?? discoverExecutionReports(outputRoot))
    .map((reportPath) => path.resolve(projectRoot, reportPath))
    .filter((reportPath) => fs.existsSync(reportPath));
  const selectedCaseIdList = [...new Set(
    options.selectedCaseIds ?? reportManifest?.selectedCaseIds ?? plan.execution.selectedCaseIds,
  )];
  const selectedCaseIds = new Set(selectedCaseIdList);
  if (reportManifest) validateBatchPerformance(reportManifest, projectRoot);
  const attempts = reportPaths
    .flatMap((reportPath) => readCaseAttempts(reportPath, workspaceRoot))
    .filter((attempt) => selectedCaseIds.has(attempt.caseId));
  const attemptsByCaseId = new Map<string, CaseAttempt[]>();
  for (const attempt of attempts) {
    const history = attemptsByCaseId.get(attempt.caseId) ?? [];
    history.push(attempt);
    attemptsByCaseId.set(attempt.caseId, history);
  }

  const executionCases: SourceGovernedExecutionCase[] = selectedCaseIdList.map((caseId) => {
    const task = plan.tasks.find((item) => item.caseId === caseId);
    const history = (attemptsByCaseId.get(caseId) ?? [])
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
    const latest = history.at(-1) ?? null;
    return {
      caseId,
      module: task?.module ?? 'unknown',
      title: task?.title ?? latest?.title ?? null,
      status: latest?.status ?? 'not-run',
      latestAttempt: latest,
      attemptCount: history.length,
      history,
    };
  });
  const previousResult = readPreviousExecutionResult(
    path.join(workspaceRoot, 'deliverables/product-center-source-governance/execution-result.json'),
    plan.planFingerprint,
  );
  const mergePreviousResult = shouldMergePreviousResult(plan, selectedCaseIdList) && Boolean(previousResult);
  const mergedExecutionCases = mergePreviousResult
    ? mergeSourceGovernedExecutionCases(previousResult?.executionCases ?? [], executionCases, selectedCaseIdList)
    : executionCases;
  const resultSelectedCaseIds = mergedExecutionCases.map((item) => item.caseId);
  const executionSelection = selectExecutionRoutes(plan.execution, resultSelectedCaseIds);
  const selectionFingerprint = fingerprintProductCenterSourceGovernedSelection(executionSelection);
  const mergedPlaywrightReports = mergePreviousResult
    ? [...new Set([
      ...(previousResult?.evidence?.playwrightReports ?? []),
      ...reportPaths.map((reportPath) => relativeWorkspace(workspaceRoot, reportPath)),
    ])]
    : reportPaths.map((reportPath) => relativeWorkspace(workspaceRoot, reportPath));
  const cleanup = inspectCleanupCheckpoints(
    reportManifest
      ? path.join(outputRoot, 'checkpoints/group', `source-governed-${reportManifest.runId}`)
      : path.join(outputRoot, 'checkpoints/group'),
    workspaceRoot,
  );
  const passed = mergedExecutionCases.filter((item) => item.status === 'passed').length;
  const failed = mergedExecutionCases.filter((item) => item.status === 'failed').length;
  const skipped = mergedExecutionCases.filter((item) => item.status === 'skipped').length;
  const notRun = mergedExecutionCases.filter((item) => item.status === 'not-run').length;
  const status = mergedExecutionCases.length === 0
    ? 'not-run'
    : failed === 0 && skipped === 0 && notRun === 0 && cleanup.status === 'residue-verified'
      ? 'passed'
      : 'failed';
  const report = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-source-governed-execution-result',
    generatedAt,
    planGeneratedAt: plan.generatedAt,
    planFingerprint: plan.planFingerprint,
    planSelectionFingerprint: plan.selectionFingerprint,
    selectionFingerprint,
    executionSelection,
    status,
    summary: {
      total: mergedExecutionCases.length
        + plan.summary.deferred
        + plan.summary.blockedSource
        + plan.summary.blockedTechnical
        + plan.summary.productDefect
        + plan.summary.handled
        + plan.summary.notApplicable,
      executed: mergedExecutionCases.length,
      passed,
      failed,
      skipped,
      notRun,
      blockedSource: plan.summary.blockedSource,
      deferred: plan.summary.deferred,
      blockedTechnical: plan.summary.blockedTechnical,
      productDefect: plan.summary.productDefect,
      handled: plan.summary.handled,
      notApplicable: plan.summary.notApplicable,
    },
    evidence: {
      playwrightReports: mergedPlaywrightReports,
      selectionPolicy: reportManifest
        ? '只读取当前批次报告清单，并按 Playwright result.startTime 选择最新有效结果。'
        : '兼容模式：扫描历史报告，并按 Playwright result.startTime 选择最新有效结果。',
      reportDiscovery: reportManifest ? 'manifest-index' : 'legacy-directory-scan',
    },
    cleanup,
    executionCases: mergedExecutionCases,
    nonExecutionTasks: plan.tasks.filter((item) => !['execute', 'source-recovery'].includes(item.action)),
  };

  assertProductCenterSourceGovernedExecutionResultCurrent(plan, report);

  if (report.summary.executed !== report.executionCases.length) {
    throw new Error(`执行用例分母不一致：selected=${report.executionCases.length}, result=${report.summary.executed}`);
  }
  if (report.summary.total !== report.summary.executed
    + report.summary.deferred
    + report.summary.blockedSource
    + report.summary.blockedTechnical
    + report.summary.productDefect
    + report.summary.handled
    + report.summary.notApplicable) {
    throw new Error('来源治理结果分母不守恒');
  }

  const deliverableRoot = path.join(workspaceRoot, 'deliverables/product-center-source-governance');
  const jsonPath = path.join(deliverableRoot, 'execution-result.json');
  const markdownPath = path.join(deliverableRoot, 'execution-result.md');
  if (options.write !== false) {
    writeJson(jsonPath, report);
    writeText(markdownPath, renderMarkdown(report));
    updateExecutionIndex({ projectRoot, generatedAt, plan, report, runId: reportManifest?.runId ?? 'legacy-scan' });
  }
  return { report, jsonPath, markdownPath };
}

export function assertProductCenterSourceGovernedPlanIntegrity(plan: ExecutionPlan): void {
  const expectedPlanFingerprint = fingerprintProductCenterSourceGovernedPlan(
    plan as unknown as Record<string, unknown> & {
      execution: Parameters<typeof fingerprintProductCenterSourceGovernedSelection>[0];
    },
  );
  const expectedSelectionFingerprint = fingerprintProductCenterSourceGovernedSelection(plan.execution);
  assertSystemTestArtifactLineage({
    expected: {
      upstreamFingerprint: expectedPlanFingerprint,
      selectionFingerprint: expectedSelectionFingerprint,
    },
    actual: {
      upstreamFingerprint: plan.planFingerprint,
      selectionFingerprint: plan.selectionFingerprint,
    },
  });
}

export function assertProductCenterSourceGovernedExecutionResultCurrent(
  plan: ExecutionPlan,
  result: {
    planFingerprint?: string | null;
    selectionFingerprint?: string | null;
    executionSelection?: ExecutionSelection | null;
    executionCases?: readonly SourceGovernedExecutionCase[];
  },
): void {
  assertProductCenterSourceGovernedPlanIntegrity(plan);
  if (!result.executionSelection) {
    throw new Error('SYSTEM_TEST_ARTIFACT_STALE:RESULT_EXECUTION_SELECTION_MISSING');
  }
  const selectedCaseIds = result.executionSelection.selectedCaseIds;
  if (new Set(selectedCaseIds).size !== selectedCaseIds.length) {
    throw new Error('SYSTEM_TEST_ARTIFACT_STALE:RESULT_SELECTION_CASE_ID_DUPLICATED');
  }
  const plannedCaseIds = new Set(plan.execution.selectedCaseIds);
  if (selectedCaseIds.some((caseId) => !plannedCaseIds.has(caseId))) {
    throw new Error('SYSTEM_TEST_ARTIFACT_STALE:RESULT_SELECTION_OUTSIDE_PLAN');
  }
  const expectedSelection = selectExecutionRoutes(plan.execution, selectedCaseIds);
  if (fingerprintSystemTestArtifact(result.executionSelection)
    !== fingerprintSystemTestArtifact(expectedSelection)) {
    throw new Error('SYSTEM_TEST_ARTIFACT_STALE:RESULT_EXECUTION_ROUTE_MISMATCH');
  }
  if (result.executionCases
    && fingerprintSystemTestArtifact(result.executionCases.map((item) => item.caseId))
      !== fingerprintSystemTestArtifact(selectedCaseIds)) {
    throw new Error('SYSTEM_TEST_ARTIFACT_STALE:RESULT_CASE_SET_MISMATCH');
  }
  assertSystemTestArtifactLineage({
    expected: {
      upstreamFingerprint: plan.planFingerprint,
      selectionFingerprint: fingerprintProductCenterSourceGovernedSelection(expectedSelection),
    },
    actual: {
      upstreamFingerprint: result.planFingerprint ?? null,
      selectionFingerprint: result.selectionFingerprint ?? null,
    },
  });
}

function selectExecutionRoutes(planSelection: ExecutionSelection, selectedCaseIds: readonly string[]): ExecutionSelection {
  const selected = new Set(selectedCaseIds);
  return {
    selectedCaseIds: [...selectedCaseIds],
    runners: planSelection.runners.map((runner) => ({
      runnerId: runner.runnerId,
      spec: runner.spec,
      selectedCaseIds: runner.selectedCaseIds.filter((caseId) => selected.has(caseId)),
      ...(runner.sourceRecoveryCaseIds
        ? { sourceRecoveryCaseIds: runner.sourceRecoveryCaseIds.filter((caseId) => selected.has(caseId)) }
        : {}),
    })),
  };
}

export function mergeSourceGovernedExecutionCases(
  previous: readonly SourceGovernedExecutionCase[],
  current: readonly SourceGovernedExecutionCase[],
  selectedCaseIds: readonly string[],
): SourceGovernedExecutionCase[] {
  const selected = new Set(selectedCaseIds);
  const byCaseId = new Map(previous.map((item) => [item.caseId, item]));
  for (const item of current) {
    if (selected.has(item.caseId)) byCaseId.set(item.caseId, item);
  }
  const orderedCaseIds = [
    ...previous.map((item) => item.caseId),
    ...selectedCaseIds,
  ];
  return [...new Set(orderedCaseIds)]
    .map((caseId) => byCaseId.get(caseId))
    .filter((item): item is SourceGovernedExecutionCase => Boolean(item));
}

function shouldMergePreviousResult(plan: ExecutionPlan, selectedCaseIds: readonly string[]): boolean {
  return process.env.PC_SOURCE_GOVERNED_MERGE_PREVIOUS === 'true'
    && selectedCaseIds.length < plan.execution.selectedCaseIds.length;
}

function readPreviousExecutionResult(
  filePath: string,
  planFingerprint: string,
): PreviousSourceGovernedExecutionResult | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const previous = readJson<PreviousSourceGovernedExecutionResult>(filePath);
    return previous.planFingerprint === planFingerprint && Array.isArray(previous.executionCases)
      ? previous
      : null;
  } catch {
    return null;
  }
}

function readReportManifest(projectRoot: string): null | {
  runId: string;
  reportPaths: string[];
  selectedCaseIds: string[];
  runnerReports?: Array<{
    runnerId: 'group' | 'item' | 'remaining';
    reportPath: string;
    selectedCaseIds: string[];
  }>;
} {
  const manifestPath = process.env.PC_SOURCE_GOVERNED_REPORT_MANIFEST;
  if (!manifestPath || !fs.existsSync(manifestPath)) return null;
  return readJson(manifestPath);
}

function validateBatchPerformance(
  manifest: NonNullable<ReturnType<typeof readReportManifest>>,
  projectRoot: string,
): void {
  for (const runner of manifest.runnerReports?.filter((item) => item.runnerId === 'remaining') ?? []) {
    const reportPath = path.resolve(projectRoot, runner.reportPath);
    if (!fs.existsSync(reportPath)) continue;
    const report = readJson<PlaywrightReport>(reportPath);
    const specs = flattenSpecs(report.suites ?? []);
    const registeredCaseIds = specs.flatMap((spec) => {
      const caseId = resolveCaseId(spec, spec.tests?.[0]);
      return caseId ? [caseId] : [];
    });
    const attemptedCaseIds = readCaseAttempts(reportPath, path.resolve(projectRoot, '..'))
      .map((item) => item.caseId);
    const authenticationChecks = specs
      .filter((spec) => (
        spec.file?.replaceAll('\\', '/').endsWith('/setup/auth.setup.ts')
        || spec.title === '保存商户中心登录态'
      ))
      .reduce((total, spec) => total + Math.max(
        1,
        ...(spec.tests ?? []).map((item) => item.results?.length ?? 0),
      ), 0);
    assertBatchPerformanceGate({
      selectedCaseIds: runner.selectedCaseIds,
      registeredCaseIds,
      fixtureCaseIds: attemptedCaseIds,
      authenticationChecks,
      attemptedCaseIds,
    });
  }
}

function updateExecutionIndex(input: {
  projectRoot: string;
  generatedAt: string;
  plan: ExecutionPlan;
  report: ReturnType<typeof buildProductCenterSourceGovernedExecutionResult>['report'];
  runId: string;
}): void {
  const workspaceRoot = path.resolve(input.projectRoot, '..');
  const executionIndexPath = resolveSystemTestPlatformArtifact('execution-index.json');
  const index = new TestExecutionIndex(path.isAbsolute(executionIndexPath)
    ? executionIndexPath
    : path.join(workspaceRoot, executionIndexPath));
  const imported = input.report.evidence.playwrightReports.flatMap((reportPath) => (
    readPlaywrightExecutionReceipts({
      reportPath: path.resolve(workspaceRoot, reportPath),
      workspaceRoot,
      runId: input.runId,
    }).records
  ));
  const importedByCaseId = new Map(imported.map((record) => [record.caseId, record]));
  const records = input.report.executionCases.map((item) => {
    const strictRecord = importedByCaseId.get(item.caseId);
    if (strictRecord) return strictRecord;
    const task = input.plan.tasks.find((candidate) => candidate.caseId === item.caseId);
    const legacyItemCompletion = task?.module === 'brand-item' && item.status === 'passed'
      ? readLegacyItemCompletion({
          reportPath: item.latestAttempt?.evidencePath
            ? path.resolve(workspaceRoot, item.latestAttempt.evidencePath)
            : null,
          caseId: item.caseId,
        })
      : null;
    const releaseObservation = normalizeReleaseObservation({ observedAt: item.latestAttempt?.startedAt || input.generatedAt });
    const evidenceStatus = legacyItemCompletion ? 'complete' as const : 'incomplete' as const;
    const executionContext = legacyItemCompletion ? {
      environmentId: process.env.MC_TEST_ENV ?? 'balamxqa',
      tenantScope: process.env.MC_BRAND_ID ?? '000407',
      locale: 'en',
      roleId: process.env.MC_TEST_ROLE ?? 'merchant-operator',
      route: legacyItemCompletion.route,
    } : null;
    return {
      caseId: item.caseId,
      applicationVersionFingerprint: null,
      releaseObservation,
      executionEpochId: input.runId,
      executionContextFingerprint: executionContext ? fingerprintExecutionContext(executionContext) : null,
      caseFingerprint: task?.bindingFingerprint ?? `unbound:${item.caseId}`,
      status: item.status as TestExecutionIndexRecord['status'],
      evidenceStatus,
      reuseStatus: resolveReuseStatus({
        executionStatus: item.status,
        evidenceStatus,
        releaseObservation,
      }),
      runId: input.runId,
      evidencePath: item.latestAttempt?.evidencePath ?? null,
      durationMs: item.latestAttempt?.durationMs ?? 0,
      recordedAt: item.latestAttempt?.startedAt || input.generatedAt,
    };
  });
  index.upsert(records);
}

function readLegacyItemCompletion(input: {
  reportPath: string | null;
  caseId: string;
}): { route: string } | null {
  if (!input.reportPath || !fs.existsSync(input.reportPath)) return null;
  const report = readJson<PlaywrightReport>(input.reportPath);
  const test = flattenSpecs(report.suites ?? [])
    .flatMap((spec) => spec.tests ?? [])
    .find((candidate) => candidate.annotations?.some((annotation) => (
      annotation.type === 'canonical-case-id' && annotation.description === input.caseId
    )));
  const result = [...(test?.results ?? [])]
    .sort((left, right) => String(left.startTime ?? '').localeCompare(String(right.startTime ?? '')))
    .at(-1);
  if (result?.status !== 'passed') return null;
  const attachment = result.attachments?.find((candidate) => (
    candidate.name === `${input.caseId}-runtime-evidence`
    && candidate.contentType === 'application/json'
  ));
  if (!attachment?.body) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (payload.caseId !== input.caseId || payload.status !== 'implemented') return null;
  const cleanup = findNestedRecord(payload, 'cleanupEvidence');
  if (!cleanup || cleanup.verifiedZero !== true) return null;
  if (!allNumericValuesAreZero(cleanup.apiIdentityCounts)) return null;
  if (!allNumericValuesAreZero(cleanup.uiIdentityCounts)) return null;
  return { route: findNestedString(payload, 'route') ?? defaultItemRoute(input.caseId) };
}

function findNestedRecord(
  value: Record<string, unknown>,
  targetKey: string,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 6) return null;
  const direct = value[targetKey];
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }
  for (const child of Object.values(value)) {
    if (!child || typeof child !== 'object' || Array.isArray(child)) continue;
    const found = findNestedRecord(child as Record<string, unknown>, targetKey, depth + 1);
    if (found) return found;
  }
  return null;
}

function findNestedString(value: Record<string, unknown>, targetKey: string, depth = 0): string | null {
  if (depth > 6) return null;
  const direct = value[targetKey];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  for (const child of Object.values(value)) {
    if (!child || typeof child !== 'object' || Array.isArray(child)) continue;
    const found = findNestedString(child as Record<string, unknown>, targetKey, depth + 1);
    if (found) return found;
  }
  return null;
}

function allNumericValuesAreZero(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>)
    .every((entry) => typeof entry === 'number' && entry === 0);
}

function defaultItemRoute(caseId: string): string {
  if (caseId.startsWith('TC-ITEM-PKG-')) return '/pp/brand/create/combo';
  if (caseId.startsWith('TC-ITEM-ADD-')) return '/pp/brand/item/create/side';
  return '/pp/brand/item/create/standard';
}

function discoverExecutionReports(outputRoot: string): string[] {
  return fs.readdirSync(outputRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile()
      && /^product-center-.+\.json$/.test(entry.name)
      && !/-(?:watchdog|progress|scheduler|checkpoint)\.json$/.test(entry.name))
    .map((entry) => path.join(outputRoot, entry.name))
    .sort();
}

function readCaseAttempts(reportPath: string, workspaceRoot: string): CaseAttempt[] {
  const report = readJson<PlaywrightReport>(reportPath);
  const specs = flattenSpecs(report.suites ?? []);
  const selectedRemainingCaseId = path.basename(reportPath).match(
    /^product-center-remaining-source-governed-.+-(TC-[A-Z]+-[A-Z]+-\d+)\.json$/,
  )?.[1];
  return specs.flatMap((spec): CaseAttempt[] => {
    const test = spec.tests?.[0];
    const caseId = resolveCaseId(spec, test);
    if (!caseId || !test) return [];
    if (selectedRemainingCaseId && caseId !== selectedRemainingCaseId) return [];
    const result = [...(test.results ?? [])]
      .sort((left, right) => String(left.startTime ?? '').localeCompare(String(right.startTime ?? '')))
      .at(-1);
    const status = normalizeStatus(result?.status, test.status);
    if (!status) return [];
    if (status === 'skipped' && !selectedRemainingCaseId) return [];
    return [{
      caseId,
      title: spec.title ?? caseId,
      status,
      startedAt: result?.startTime ?? report.stats?.startTime ?? '',
      durationMs: result?.duration ?? 0,
      evidencePath: relativeWorkspace(workspaceRoot, reportPath),
    }];
  });
}

function flattenSpecs(suites: PlaywrightSuite[]): PlaywrightSpec[] {
  return suites.flatMap((suite) => [
    ...(suite.specs ?? []),
    ...flattenSpecs(suite.suites ?? []),
  ]);
}

function resolveCaseId(spec: PlaywrightSpec, test?: PlaywrightTest): string | null {
  const tag = spec.tags?.find((item) => item.startsWith('case-'));
  if (tag) return tag.slice('case-'.length);
  return test?.annotations?.find((item) => ['group-case-id', 'canonical-case-id'].includes(item.type ?? ''))?.description ?? null;
}

function normalizeStatus(resultStatus?: string, testStatus?: string): CaseStatus | null {
  if (resultStatus) {
    if (resultStatus === 'passed') return 'passed';
    if (resultStatus === 'skipped') return 'skipped';
    if (['failed', 'timedOut', 'interrupted'].includes(resultStatus)) return 'failed';
  }
  if (testStatus === 'expected') return 'passed';
  if (testStatus === 'skipped') return 'skipped';
  if (testStatus === 'unexpected') return 'failed';
  return null;
}

function inspectCleanupCheckpoints(checkpointRoot: string, workspaceRoot: string): CleanupSummary {
  const sourceGovernedRoots = fs.existsSync(checkpointRoot)
    ? fs.readdirSync(checkpointRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('source-governed-'))
      .map((entry) => path.join(checkpointRoot, entry.name))
    : [];
  const checkpointPaths = sourceGovernedRoots.flatMap(listFilesRecursively)
    .filter((filePath) => path.basename(filePath).endsWith('.json'));
  const incompleteEntries: CleanupSummary['incompleteEntries'] = [];
  let checkpointFiles = 0;
  let emptyCheckpoints = 0;
  let entries = 0;
  let residueVerifiedEntries = 0;
  for (const checkpointPath of checkpointPaths) {
    const checkpoint = readJson<{ entries?: Array<{ phase?: string }> }>(checkpointPath);
    if (!Array.isArray(checkpoint.entries)) continue;
    checkpointFiles += 1;
    if (checkpoint.entries.length === 0) emptyCheckpoints += 1;
    for (const entry of checkpoint.entries) {
      entries += 1;
      if (entry.phase === 'residue-verified') {
        residueVerifiedEntries += 1;
      } else {
        incompleteEntries.push({
          checkpointPath: relativeWorkspace(workspaceRoot, checkpointPath),
          phase: entry.phase ?? 'unknown',
        });
      }
    }
  }
  return {
    status: incompleteEntries.length === 0 ? 'residue-verified' : 'incomplete',
    checkpointFiles,
    emptyCheckpoints,
    entries,
    residueVerifiedEntries,
    incompleteEntries,
  };
}

function listFilesRecursively(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    return entry.isDirectory() ? listFilesRecursively(entryPath) : [entryPath];
  });
}

function renderMarkdown(report: ReturnType<typeof buildProductCenterSourceGovernedExecutionResult>['report']): string {
  return [
    '# 商品中心来源治理执行结果',
    '',
    `- 状态：${report.status}`,
    `- 生成时间：${report.generatedAt}`,
    `- 实际执行：${report.summary.executed}`,
    `- 延期跳过：${report.summary.deferred}`,
    `- 通过：${report.summary.passed}`,
    `- 失败：${report.summary.failed}`,
    `- 未运行：${report.summary.notRun}`,
    `- 来源阻断：${report.summary.blockedSource}`,
    `- 产品缺陷：${report.summary.productDefect}`,
    `- 已处理不重复执行：${report.summary.handled}`,
    `- 已替代：${report.summary.notApplicable}`,
    `- 清理：${report.cleanup.status}（${report.cleanup.residueVerifiedEntries}/${report.cleanup.entries} 条数据记录）`,
    '',
    '| 用例 | 标题 | 最新结果 | 尝试次数 | 最新证据 |',
    '| --- | --- | --- | ---: | --- |',
    ...report.executionCases.map((item) => `| ${item.caseId} | ${item.title ?? ''} | ${item.status} | ${item.attemptCount} | ${item.latestAttempt?.evidencePath ?? ''} |`),
    '',
    '## 非执行任务',
    '',
    '| 用例 | 动作 | 原因 |',
    '| --- | --- | --- |',
    ...report.nonExecutionTasks.map((item) => `| ${item.caseId} | ${item.action} | ${item.reason} |`),
    '',
  ].join('\n');
}

function relativeWorkspace(workspaceRoot: string, filePath: string): string {
  return path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
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

if (require.main === module) {
  const result = buildProductCenterSourceGovernedExecutionResult();
  process.stdout.write(`${JSON.stringify({ status: result.report.status, summary: result.report.summary })}\n`);
}
