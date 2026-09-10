import fs from 'node:fs';
import path from 'node:path';
import {
  evaluateSystemTestPlatformReadiness,
  type SystemTestPilotEvidence,
} from '../src/automation/system-test/system-test-platform-readiness';
import { buildSystemTestReferenceBaseline } from '../src/automation/system-test/system-test-reference-baseline';
import {
  buildSystemTestEvidenceRuntimeFingerprint,
  compileSystemTestRunContract,
  fingerprintSystemTestValue,
  type SystemTestAdapterCatalog,
  type SystemTestManifest,
  type SystemTestRunContract,
  type SystemTestRuleLedger,
} from '../src/automation/system-test/system-test-contract';
import type { AutomationRecipe } from '../src/automation/recipe/automation-recipe';
import { TestExecutionIndex, type TestExecutionIndexRecord } from '../src/utils/test-execution-index';
import { readPlaywrightExecutionReceipts } from '../src/utils/playwright-execution-receipt';

type ClosureAudit = { cases: Array<{
  caseId: string;
  module: string;
  state: string;
  responsibilityClass?: import('../src/automation/system-test/system-test-reference-baseline').SystemTestResponsibilityClass;
  currentCaseFingerprint?: string | null;
  historicalEvidenceRefs?: string[];
}> };
type RunState = { runId: string; status: string; phase: string; exitCode: number | null };
type RunReport = { status: string; exitCode: number; securityFindings: number };
type PilotLifecyclePhase = 'create' | 'read-created-api' | 'read-created-ui' | 'update'
  | 'read-updated-api' | 'read-updated-ui' | 'delete' | 'read-absent-api' | 'read-absent-ui';
type PilotOperationReceipt = {
  operationKey?: string;
  method?: string;
  observed?: boolean;
  status?: string;
  sequence?: number;
  details?: { lifecyclePhase?: string } | null;
};
type EvidenceLedger = {
  summary: { selected: number; executed: number; evidenceIncomplete: number };
  cases: Array<{
    caseId?: string;
    caseFingerprint?: string;
    runtimeEvidence?: { operationReceipts?: PilotOperationReceipt[] };
    evidence: { apiZeroResidue: boolean; uiZeroResidue: boolean };
  }>;
};

type PilotArtifactSource = {
  pilotId: string;
  manifest: string;
  runReport: string;
  evidenceLedger: string;
};

type PilotDiscoveryResult = {
  pilots: SystemTestPilotEvidence[];
  sources: PilotArtifactSource[];
  diagnostics: string[];
  adapterImplementationReady: boolean;
  portabilityManifestCount: number;
};

type RecipeCollection = { fingerprint: string; recipes: AutomationRecipe[] };

export type PlatformReadinessInput = {
  projectRoot?: string;
  workspaceRoot?: string;
  referenceClosureAuditPath: string;
  referenceModule: string;
  applicationId: string;
  businessDomainId: string;
  outputPath: string;
  executionIndexPath: string;
  systemsRoot?: string;
  systemOutputRoot?: string;
};

function resolvePlatformReadinessInput(input: PlatformReadinessInput): Required<PlatformReadinessInput> {
  const projectRoot = path.resolve(input.projectRoot ?? process.env.SYSTEM_TEST_PROJECT_ROOT ?? process.cwd());
  const workspaceRoot = path.resolve(input.workspaceRoot ?? projectRoot);
  return {
    ...input,
    projectRoot,
    workspaceRoot,
    referenceClosureAuditPath: path.resolve(workspaceRoot, input.referenceClosureAuditPath),
    outputPath: path.resolve(workspaceRoot, input.outputPath),
    executionIndexPath: path.resolve(workspaceRoot, input.executionIndexPath),
    systemsRoot: path.resolve(projectRoot, input.systemsRoot ?? 'systems'),
    systemOutputRoot: path.resolve(projectRoot, input.systemOutputRoot ?? 'output/system-test'),
  };
}

export function buildSystemTestPlatformReadiness(input: PlatformReadinessInput): { outputPath: string; status: string } {
  const config = resolvePlatformReadinessInput(input);
  const closureAudit = readJson<ClosureAudit>(config.referenceClosureAuditPath);
  const commonImplementation = inspectCommonImplementation();
  const discovered = discoverSystemTestPilotEvidence({ rootDir: config.projectRoot, workspaceRoot: config.workspaceRoot, systemsRoot: config.systemsRoot, systemOutputRoot: config.systemOutputRoot });
  const referenceCases = closureAudit.cases.filter((item) => item.module === config.referenceModule);
  const referenceEvidence = reconcileReferenceEvidence({ workspaceRoot: config.workspaceRoot, executionIndexPath: config.executionIndexPath, cases: referenceCases });
  const referenceResult = buildSystemTestReferenceBaseline({
    applicationId: config.applicationId,
    businessDomainId: config.businessDomainId,
    cases: referenceCases.map((item) => ({
      caseId: item.caseId,
      state: item.state,
      responsibilityClass: item.responsibilityClass,
      caseFingerprint: item.currentCaseFingerprint,
    })),
    receipts: referenceEvidence.records,
  });
  const referenceBaseline = referenceResult.baseline;
  const pilots = discovered.pilots;
  const readiness = evaluateSystemTestPlatformReadiness({
    referenceBaseline,
    pilots,
    commonImplementationReady: commonImplementation.ready,
    adapterImplementationReady: discovered.adapterImplementationReady,
  });
  const actionableReferenceDiagnostics = filterActionableReferenceDiagnostics(
    referenceEvidence.diagnostics,
    referenceResult.missingEvidenceCaseIds,
  );
  const outputPath = config.outputPath;
  writeJson(outputPath, {
    ...readiness,
    generatedAt: new Date().toISOString(),
    referenceBaseline,
    pilots,
    source: {
      referenceClosureAudit: `${path.relative(config.workspaceRoot, config.referenceClosureAuditPath).replaceAll(path.sep, '/') }#module=${config.referenceModule}`,
      executionIndex: path.relative(config.workspaceRoot, config.executionIndexPath).replaceAll(path.sep, '/'),
      referenceEvidenceFiles: referenceEvidence.files,
      pilotArtifacts: discovered.sources,
    },
    referenceEvidenceCoverage: {
      verifiedCaseIds: referenceResult.verifiedCaseIds,
      missingEvidenceCaseIds: referenceResult.missingEvidenceCaseIds,
      diagnostics: actionableReferenceDiagnostics,
      supersededDiagnosticCount: referenceEvidence.diagnostics.length - actionableReferenceDiagnostics.length,
    },
    commonImplementationFingerprint: commonImplementation.fingerprint,
    pilotDiagnostics: [...commonImplementation.diagnostics, ...discovered.diagnostics].sort(),
  });
  return { outputPath, status: readiness.status };
}

function filterActionableReferenceDiagnostics(diagnostics: readonly string[], missingCaseIds: readonly string[]): string[] {
  if (missingCaseIds.length === 0) return [];
  return diagnostics.filter((diagnostic) => (
    diagnostic.startsWith('REFERENCE_EVIDENCE_')
    || missingCaseIds.some((caseId) => diagnostic.includes(`:${caseId}:`))
  ));
}

function reconcileReferenceEvidence(input: {
  workspaceRoot: string;
  executionIndexPath: string;
  cases: ClosureAudit['cases'];
}): {
  records: TestExecutionIndexRecord[];
  files: Array<{ path: string; fingerprint: string }>;
  diagnostics: string[];
} {
  const diagnostics: string[] = [];
  const imported: TestExecutionIndexRecord[] = [];
  const files = new Map<string, string>();
  // 证据文件可能是跨模块批次产物；参考基线只能消费当前参考模块的用例，
  // 过滤其他模块收据，避免把合法的跨模块历史证据误判为孤立 receipt。
  const referenceCaseIds = new Set(input.cases.map((item) => item.caseId));
  const references = [...new Set(input.cases
    .filter((item) => item.state === 'evidence-passed')
    .flatMap((item) => item.historicalEvidenceRefs ?? []))].sort();
  for (const reference of references) {
    const absolutePath = path.resolve(input.workspaceRoot, reference);
    const relativePath = path.relative(input.workspaceRoot, absolutePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      diagnostics.push(`REFERENCE_EVIDENCE_OUTSIDE_WORKSPACE:${reference}`);
      continue;
    }
    if (!fs.existsSync(absolutePath)) {
      diagnostics.push(`REFERENCE_EVIDENCE_MISSING:${reference}`);
      continue;
    }
    try {
      const parsed = readPlaywrightExecutionReceipts({ reportPath: absolutePath, workspaceRoot: input.workspaceRoot });
      imported.push(...parsed.records.filter((record) => referenceCaseIds.has(record.caseId)));
      diagnostics.push(...parsed.diagnostics.map((item) => `${reference}:${item}`));
      const fingerprint = parsed.records[0]?.evidenceFileFingerprint;
      if (fingerprint) files.set(reference.replaceAll(path.sep, '/'), fingerprint);
    } catch (error) {
      diagnostics.push(`REFERENCE_EVIDENCE_INVALID:${reference}:${errorMessage(error)}`);
    }
  }
  const index = new TestExecutionIndex(input.executionIndexPath);
  index.upsert(imported);
  return {
    records: index.snapshot().records.filter((record) => referenceCaseIds.has(record.caseId)),
    files: [...files].map(([filePath, fingerprint]) => ({ path: filePath, fingerprint })),
    diagnostics: [...new Set(diagnostics)].sort(),
  };
}

export function discoverSystemTestPilotEvidence(input: {
  rootDir: string;
  systemsRoot?: string;
  systemOutputRoot?: string;
  workspaceRoot?: string;
}): PilotDiscoveryResult {
  const systemsDirectory = path.resolve(input.systemsRoot ?? path.join(input.rootDir, 'systems'));
  const outputDirectory = path.resolve(input.systemOutputRoot ?? path.join(input.rootDir, 'output/system-test'));
  const workspaceDirectory = path.resolve(input.workspaceRoot ?? path.resolve(input.rootDir, '..'));
  const result: PilotDiscoveryResult = {
    pilots: [], sources: [], diagnostics: [], adapterImplementationReady: true, portabilityManifestCount: 0,
  };
  if (!fs.existsSync(systemsDirectory)) return result;

  for (const entry of fs.readdirSync(systemsDirectory, { withFileTypes: true }).filter((item) => item.isDirectory())) {
    const manifestPath = path.join(systemsDirectory, entry.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    let manifest: SystemTestManifest;
    try {
      manifest = readJson<SystemTestManifest>(manifestPath);
    } catch (error) {
      result.diagnostics.push(`PILOT_MANIFEST_INVALID:${entry.name}:${errorMessage(error)}`);
      continue;
    }
    const scope = manifest.system.portabilityScope;
    if (!scope) continue;
    result.portabilityManifestCount += 1;
    const pilotId = manifest.system.systemId;
    const currentImplementation = inspectCurrentPilotImplementation(input.rootDir, manifest);
    if (currentImplementation.errors.length > 0) {
      result.adapterImplementationReady = false;
      result.diagnostics.push(...currentImplementation.errors.map((error) => `PILOT_CURRENT_IMPLEMENTATION_INVALID:${pilotId}:${error}`));
      continue;
    }
    const pilotOutputDirectory = path.join(outputDirectory, pilotId);
    const latestStatePath = path.join(pilotOutputDirectory, 'latest-run-state.json');
    const latestState = fs.existsSync(latestStatePath) ? readJson<RunState>(latestStatePath) : undefined;
    const candidates = discoverCurrentPilotRunCandidates(
      pilotOutputDirectory,
      manifest,
      currentImplementation.contract,
      latestState?.runId,
    );
    const selected = candidates.find((candidate) => candidate.reversibleCrud) ?? candidates[0];
    if (!selected) {
      result.diagnostics.push(`PILOT_RUNTIME_MISSING:${pilotId}:current-complete-run`);
      continue;
    }
    result.pilots.push({
      pilotId,
      applicationId: scope.applicationId,
      businessDomainId: scope.businessDomainId,
      authenticationFamilyId: scope.authenticationFamilyId,
      validationAuthority: scope.validationAuthority,
      authenticated: selected.runReport.status === 'passed' && selected.runReport.exitCode === 0,
      reversibleCrud: selected.reversibleCrud,
      runtimePassed: selected.runReport.status === 'passed' && selected.runReport.exitCode === 0,
      evidenceComplete: selected.evidence.summary.selected > 0
        && selected.evidence.summary.selected === selected.evidence.summary.executed
        && selected.evidence.summary.evidenceIncomplete === 0,
      apiUiZeroResidue: selected.evidence.cases.length > 0
        && selected.evidence.cases.every((item) => item.evidence.apiZeroResidue && item.evidence.uiZeroResidue),
      securityFindings: selected.runReport.securityFindings,
    });
    result.sources.push({
      pilotId,
      manifest: relativeWorkspacePath(workspaceDirectory, manifestPath),
      runReport: relativeWorkspacePath(workspaceDirectory, selected.runReportPath),
      evidenceLedger: relativeWorkspacePath(workspaceDirectory, selected.evidencePath),
    });
  }
  result.pilots.sort((left, right) => left.pilotId.localeCompare(right.pilotId));
  result.sources.sort((left, right) => left.pilotId.localeCompare(right.pilotId));
  result.diagnostics.sort();
  if (result.portabilityManifestCount === 0) result.adapterImplementationReady = false;
  return result;
}

function discoverCurrentPilotRunCandidates(
  outputDirectory: string,
  manifest: SystemTestManifest,
  currentContract: SystemTestRunContract,
  preferredRunId?: string,
): Array<{
  runReport: RunReport;
  evidence: EvidenceLedger;
  runReportPath: string;
  evidencePath: string;
  reversibleCrud: boolean;
}> {
  if (!fs.existsSync(outputDirectory)) return [];
  const runDirectories = fs.readdirSync(outputDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'latest')
    .map((entry) => path.join(outputDirectory, entry.name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  if (preferredRunId) {
    const preferred = path.join(outputDirectory, preferredRunId);
    const index = runDirectories.indexOf(preferred);
    if (index > 0) runDirectories.unshift(...runDirectories.splice(index, 1));
  }
  const candidates: Array<{
    runReport: RunReport;
    evidence: EvidenceLedger;
    runReportPath: string;
    evidencePath: string;
    reversibleCrud: boolean;
  }> = [];
  for (const runDirectory of runDirectories) {
    const runReportPath = path.join(runDirectory, 'run-report.json');
    const evidencePath = path.join(runDirectory, 'evidence-ledger.json');
    const contractPath = path.join(runDirectory, 'contract.json');
    if (![runReportPath, evidencePath, contractPath].every((filePath) => fs.existsSync(filePath))) continue;
    try {
      const runReport = readJson<RunReport>(runReportPath);
      const evidence = readJson<EvidenceLedger>(evidencePath);
      const contract = readJson<SystemTestRunContract>(contractPath);
      validateCurrentPilotContract(manifest, currentContract, contract, evidence);
      candidates.push({
        runReport,
        evidence,
        runReportPath,
        evidencePath,
        reversibleCrud: contract.summary.mutation > 0 && hasCompleteReversibleCrudLifecycle(evidence),
      });
    } catch {
      // Stale and partial historical run directories are ignored; the caller
      // reports a blocker only when no current complete candidate remains.
    }
  }
  return candidates;
}

export function hasCompleteReversibleCrudLifecycle(evidence: EvidenceLedger): boolean {
  return evidence.cases.some((item) => {
    if (!item.evidence.apiZeroResidue || !item.evidence.uiZeroResidue) return false;
    const phases = (item.runtimeEvidence?.operationReceipts ?? [])
      .filter((receipt) => receipt.observed === true && receipt.status === 'passed')
      .sort((left, right) => (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER))
      .map(resolvePilotLifecyclePhase)
      .filter((phase): phase is PilotLifecyclePhase => phase !== null);
    const createIndex = phases.indexOf('create');
    const updateIndex = phases.findIndex((phase, index) => index > createIndex && phase === 'update');
    const deleteIndex = phases.findIndex((phase, index) => index > updateIndex && phase === 'delete');
    if (createIndex < 0 || updateIndex < 0 || deleteIndex < 0) return false;
    const createdReads = new Set(phases.slice(createIndex + 1, updateIndex));
    const updatedReads = new Set(phases.slice(updateIndex + 1, deleteIndex));
    const absentReads = new Set(phases.slice(deleteIndex + 1));
    return createdReads.has('read-created-api')
      && createdReads.has('read-created-ui')
      && updatedReads.has('read-updated-api')
      && updatedReads.has('read-updated-ui')
      && absentReads.has('read-absent-api')
      && absentReads.has('read-absent-ui');
  });
}

function resolvePilotLifecyclePhase(receipt: PilotOperationReceipt): PilotLifecyclePhase | null {
  const declared = receipt.details?.lifecyclePhase;
  if (isPilotLifecyclePhase(declared)) return declared;
  const method = receipt.method?.toUpperCase();
  const key = receipt.operationKey ?? '';
  if ((method === 'POST' || /(^|:)POST\s/.test(key)) && /create|batch|modifier/i.test(key)) return 'create';
  if ((method === 'PUT' || method === 'PATCH' || /(^|:)(PUT|PATCH)\s/.test(key)) && /modifier/i.test(key)) return 'update';
  return null;
}

function isPilotLifecyclePhase(value: unknown): value is PilotLifecyclePhase {
  return typeof value === 'string' && new Set<PilotLifecyclePhase>([
    'create', 'read-created-api', 'read-created-ui', 'update', 'read-updated-api',
    'read-updated-ui', 'delete', 'read-absent-api', 'read-absent-ui',
  ]).has(value as PilotLifecyclePhase);
}

function inspectCommonImplementation(): { ready: boolean; fingerprint: string | null; diagnostics: string[] } {
  try {
    return { ready: true, fingerprint: buildSystemTestEvidenceRuntimeFingerprint(), diagnostics: [] };
  } catch (error) {
    return { ready: false, fingerprint: null, diagnostics: [`COMMON_IMPLEMENTATION_INVALID:${errorMessage(error)}`] };
  }
}

function inspectCurrentPilotImplementation(
  rootDirectory: string,
  manifest: SystemTestManifest,
): { errors: string[]; contract: SystemTestRunContract } {
  try {
    const recipes = readJson<RecipeCollection>(path.resolve(rootDirectory, manifest.sources.recipeCollectionPath));
    const rules = readJson<SystemTestRuleLedger>(path.resolve(rootDirectory, manifest.sources.ruleLedgerPath));
    const adapters = readJson<SystemTestAdapterCatalog>(path.resolve(rootDirectory, manifest.sources.adapterCatalogPath));
    const result = compileSystemTestRunContract({
      rootDir: rootDirectory,
      manifest,
      recipes: recipes.recipes,
      recipeCollectionFingerprint: recipes.fingerprint,
      rules,
      adapters,
    });
    return { errors: result.errors, contract: result.contract };
  } catch (error) {
    return {
      errors: [`COMPILE_FAILED:${errorMessage(error)}`],
      contract: {} as SystemTestRunContract,
    };
  }
}

function validateCurrentPilotContract(
  manifest: SystemTestManifest,
  currentContract: SystemTestRunContract,
  contract: SystemTestRunContract,
  evidence: EvidenceLedger,
): void {
  if (JSON.stringify(contract.system) !== JSON.stringify(manifest.system)) {
    throw new Error('运行合同系统身份与当前清单不一致');
  }
  const expectedFingerprints = {
    rules: manifest.sources.ruleLedgerFingerprint,
    adapters: manifest.sources.adapterCatalogFingerprint,
    evidenceRuntime: buildSystemTestEvidenceRuntimeFingerprint(),
  };
  for (const [key, expected] of Object.entries(expectedFingerprints)) {
    const actual = contract.sourceFingerprints?.[key as keyof typeof expectedFingerprints];
    if (actual !== expected) throw new Error(`运行合同指纹已过期:${key}`);
  }
  if (contract.sourceFingerprints?.recipes === manifest.sources.recipeCollectionFingerprint) return;

  // A collection-level recipe fingerprint may change because another case was
  // refreshed. Reuse remains valid only when every case carried by this exact
  // evidence ledger still matches the current compiled case fingerprint.
  if (evidence.cases.length === 0) throw new Error('运行合同指纹已过期:recipes');
  for (const item of evidence.cases) {
    const currentCase = currentContract.cases.find((candidate) => candidate.caseId === item.caseId);
    const historicalCase = contract.cases.find((candidate) => candidate.caseId === item.caseId);
    const currentCaseFingerprint = currentCase ? fingerprintSystemTestValue(currentCase) : null;
    const historicalCaseFingerprint = historicalCase ? fingerprintSystemTestValue(historicalCase) : null;
    if (!item.caseFingerprint
      || item.caseFingerprint !== currentCaseFingerprint
      || item.caseFingerprint !== historicalCaseFingerprint) {
      throw new Error(`运行合同指纹已过期:recipes:${item.caseId ?? 'unknown-case'}`);
    }
  }
}

function relativeWorkspacePath(workspaceDirectory: string, filePath: string): string {
  return path.relative(workspaceDirectory, filePath).replaceAll(path.sep, '/');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  const required = (name: string): string => {
    const value = process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
    if (!value) throw new Error(`缺少 --${name}=<path-or-id>`);
    return value;
  };
  const result = buildSystemTestPlatformReadiness({
    projectRoot: process.env.SYSTEM_TEST_PROJECT_ROOT,
    workspaceRoot: process.env.SYSTEM_TEST_WORKSPACE_ROOT,
    referenceClosureAuditPath: required('reference-closure-audit'),
    referenceModule: required('reference-module'),
    applicationId: required('application-id'),
    businessDomainId: required('business-domain-id'),
    outputPath: required('output'),
    executionIndexPath: required('execution-index'),
  });
  process.stdout.write(`跨系统平台状态：${result.status}，${result.outputPath}\n`);
}
