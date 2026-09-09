import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  buildSystemTestAssetLifecycleLedger,
  fingerprintSystemTestAssetValue,
  type SystemTestAssetLifecycleInput,
} from '../../../Test Automation Platform/src/automation/system-test/system-test-asset-lifecycle';
import { fingerprintSystemTestValue } from '../../../Test Automation Platform/src/automation/system-test/system-test-contract';
import { buildSystemTestArtifacts } from '../../../Test Automation Platform/scripts/build-system-test-contract';
import { buildSystemTestCaseImplementationFingerprints } from '../../../Test Automation Platform/scripts/run-system-test';
import { buildTestPlanAssetStatus, loadAutomationDispositions } from './build-test-plan-asset-index';
import { loadProductCenterExecutionDecisions } from '../utils/product-center-execution-decisions';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const infoRoot = path.join(workspaceRoot, 'Merchant Center Info');
const outputPath = path.join(projectRoot, 'deliverables/system-test-platform/product-center-asset-lifecycle.json');
const executionIndexPath = path.join(projectRoot, 'deliverables/system-test-platform/execution-index.json');
const closurePath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-closure-audit.json');
const completedIndexPath = path.join(infoRoot, '00-待转换测试方案/已完成/index.json');
const unlandedIndexPath = path.join(infoRoot, '00-待转换测试方案/未落地/index.json');
const decisionPath = path.join(projectRoot, 'contracts/product-center/reviews/product-center-execution-decisions.json');
const seasoningContractPath = path.join(
  projectRoot,
  'output/system-test/merchant-center-product-center-seasoning/latest/contract.json',
);
const seasoningManifestPath = 'systems/merchant-center-product-center-seasoning/manifest.json';
const publicRunnerPath = path.resolve(projectRoot, '../../Test Automation Platform/scripts/run-system-test.ts');

type JsonRecord = Record<string, any>;
export type ExecutionRecord = {
  caseId: string;
  caseFingerprint: string;
  implementationFingerprint: string | null;
  executionContextFingerprint: string | null;
  status: 'passed' | 'failed' | 'skipped' | 'not-run';
  evidenceStatus: string;
  receiptEvidenceFingerprint: string | null;
  evidenceFileFingerprint: string | null;
  recordedAt: string;
};

type CurrentSystemExecutionIdentity = {
  caseFingerprint: string;
  implementationFingerprint: string;
  contextFingerprint: string;
};

export function buildProductCenterAssetLifecycle(options: { generatedAt?: string; write?: boolean } = {}) {
  const built = buildTestPlanAssetStatus({ projectRoot, infoRoot, write: false });
  const dispositions = loadAutomationDispositions(projectRoot, workspaceRoot);
  const decisions = loadProductCenterExecutionDecisions(projectRoot);
  const executionRecords = readJson<{ records: ExecutionRecord[] }>(executionIndexPath).records ?? [];
  const closureCases = new Map<string, JsonRecord>(
    (readJson<{ cases: JsonRecord[] }>(closurePath).cases ?? []).map((item) => [item.caseId, item]),
  );
  const currentSystemExecutionIdentities = readCurrentSystemExecutionIdentities();
  const canonicalByModule = readCanonicalCases(built.registry.plans);
  const lifecycleCases: SystemTestAssetLifecycleInput[] = built.index.cases.map((asset) => {
    const canonical = canonicalByModule.get(asset.caseId);
    if (!canonical) throw new Error(`ASSET_LIFECYCLE_CANONICAL_CASE_MISSING:${asset.caseId}`);
    const disposition = dispositions.get(asset.caseId);
    const decision = decisions.get(asset.caseId);
    const currentSystemIdentity = currentSystemExecutionIdentities.get(asset.caseId);
    const currentCaseFingerprint = currentSystemIdentity?.caseFingerprint
      ?? normalizeFingerprint(closureCases.get(asset.caseId)?.currentCaseFingerprint)
      ?? fingerprintSystemTestAssetValue({ caseId: asset.caseId, title: asset.title, section: canonical.section });
    const execution = selectCurrentExecution(
      executionRecords,
      asset.caseId,
      currentCaseFingerprint,
      currentSystemIdentity?.implementationFingerprint ?? null,
      currentSystemIdentity?.contextFingerprint ?? null,
    );
    const classification = decision
      ? {
          disposition: decision.status,
          reason: decision.reason,
          recoveryCondition: decision.resumeWhen ?? '由产品重新定义并完成业务确认后恢复',
        }
      : null;
    return {
      applicationId: 'merchant-center',
      businessDomainId: 'product-center',
      caseId: asset.caseId,
      title: asset.title,
      module: asset.module,
      sourceIds: [`formal:${asset.module}`, `canonical:${asset.canonicalPath.split('#')[0]}`],
      canonical: {
        sourcePath: asset.canonicalPath.split('#')[0],
        sourceFingerprint: canonical.sourceFingerprint,
        caseFingerprint: currentCaseFingerprint,
        indexPresent: true,
      },
      binding: {
        status: asset.status === 'landed' ? 'bound' : asset.status === 'not-applicable' ? 'not-applicable' : 'unbound',
        fingerprint: asset.status === 'landed' && asset.scriptPath
          ? fingerprintFileAndIdentity(resolveWorkspacePath(asset.scriptPath), asset.caseId)
          : '',
        scriptPath: asset.scriptPath ?? null,
        indexStatus: asset.status,
      },
      classification: classification ?? (asset.status === 'not-applicable'
        ? { disposition: 'not-applicable', reason: asset.reason ?? '当前版本不适用', recoveryCondition: '产品重新定义并完成业务确认后恢复' }
        : asset.status !== 'landed'
          ? { disposition: 'blocked-technical', reason: asset.reason ?? '尚无可执行自动化绑定', recoveryCondition: '补齐当前用例的可执行绑定、断言和清理能力' }
          : null),
      currentExecution: {
        implementationFingerprint: currentSystemIdentity?.implementationFingerprint ?? null,
        contextFingerprint: currentSystemIdentity?.contextFingerprint ?? null,
      },
      execution: {
        caseFingerprint: execution?.caseFingerprint ?? null,
        implementationFingerprint: execution?.implementationFingerprint ?? null,
        contextFingerprint: execution?.executionContextFingerprint ?? null,
        status: execution?.status === 'passed' || execution?.status === 'failed' ? execution.status : 'not-run',
        evidenceStatus: execution?.evidenceStatus ?? null,
        receiptEvidenceFingerprint: execution?.receiptEvidenceFingerprint ?? null,
        evidenceFileFingerprint: execution?.evidenceFileFingerprint ?? null,
        recordedAt: execution?.recordedAt ?? null,
      },
    };
  });
  const canonicalIds = new Set(built.index.cases.map((item) => item.caseId));
  const indexedIds = [
    ...readJson<{ cases: Array<{ caseId: string }> }>(completedIndexPath).cases,
    ...readJson<{ cases: Array<{ caseId: string }> }>(unlandedIndexPath).cases,
  ].map((item) => item.caseId);
  const orphanIndexCaseIds = [...new Set(indexedIds.filter((caseId) => !canonicalIds.has(caseId)))].sort();
  const bindingIds = collectBindingCaseIds();
  const orphanBindingCaseIds = [...bindingIds].filter((caseId) => !canonicalIds.has(caseId)).sort();
  const orphanExecutionCaseIds = [...new Set(executionRecords.map((record) => record.caseId))]
    .filter((caseId) => !canonicalIds.has(caseId)).sort();
  const sourcePaths = [
    ['registry', path.join(projectRoot, 'contracts/product-center/test-plan-registry.json')],
    ['execution-decisions', decisionPath],
    ['execution-index', executionIndexPath],
    ['closure-audit', closurePath],
    ['completed-index', completedIndexPath],
    ['unlanded-index', unlandedIndexPath],
    ...[
      path.join(projectRoot, 'deliverables/product-center-item/test-cases.json'),
      path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json'),
      path.join(projectRoot, 'contracts/product-center/test-cases/canonical/product-center-legacy-remaining-automation-bindings.json'),
      path.join(projectRoot, 'contracts/product-center/test-plan-additional-automation-bindings.json'),
      path.join(projectRoot, 'systems/merchant-center-product-center-seasoning/binding-registry.json'),
    ].filter((filePath) => fs.existsSync(filePath)).map((filePath) => ['binding', filePath] as const),
    ...[...canonicalByModule.values()].map((item) => ['canonical', item.sourcePath]),
  ] as const;
  const ledger = buildSystemTestAssetLifecycleLedger({
    generatedAt: options.generatedAt,
    scope: 'product-center-all-formal-cases',
    applicationId: 'merchant-center',
    businessDomainId: 'product-center',
    sourceManifest: sourcePaths.map(([kind, filePath]) => ({ kind, path: relativeWorkspace(filePath), fingerprint: fingerprintFile(filePath) })),
    orphanIndexCaseIds,
    orphanReferenceCaseIds: {
      binding: orphanBindingCaseIds,
      execution: orphanExecutionCaseIds,
      index: orphanIndexCaseIds,
    },
    cases: lifecycleCases,
  });
  if (options.write !== false) writeJson(outputPath, ledger);
  return { outputPath, ledger };
}

function readCurrentSystemExecutionIdentities(): Map<string, CurrentSystemExecutionIdentity> {
  const artifacts = buildSystemTestArtifacts({
    rootDir: projectRoot,
    manifestPath: seasoningManifestPath,
    outputDir: path.dirname(seasoningContractPath),
  });
  if (artifacts.errors.length > 0) {
    throw new Error(`ASSET_LIFECYCLE_SYSTEM_CONTRACT_INVALID:${artifacts.errors.join(',')}`);
  }
  const implementationFingerprints = buildSystemTestCaseImplementationFingerprints(artifacts, publicRunnerPath);
  return new Map(artifacts.contract.cases.map((item) => [item.caseId, {
    caseFingerprint: fingerprintSystemTestValue(item),
    implementationFingerprint: implementationFingerprints[item.caseId],
    contextFingerprint: fingerprintSystemTestValue({
      executionContext: artifacts.contract.sourceFingerprints.executionContext,
      authAdapterId: artifacts.manifest.execution.authAdapterId,
      executionContextProfile: item.executionContextProfile ?? 'default',
    }),
  }]));
}

function collectBindingCaseIds(): Set<string> {
  const ids = new Set<string>();
  const bindingFiles = [
    path.join(workspaceRoot, 'deliverables/product-center-item/test-cases.json'),
    path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json'),
    path.join(projectRoot, 'contracts/product-center/test-cases/canonical/product-center-legacy-remaining-automation-bindings.json'),
    path.join(projectRoot, 'contracts/product-center/test-plan-additional-automation-bindings.json'),
    path.join(projectRoot, 'systems/merchant-center-product-center-seasoning/binding-registry.json'),
  ];
  for (const filePath of bindingFiles) {
    if (!fs.existsSync(filePath)) continue;
    const document = readJson<{
      cases?: Array<{ caseId: string; automation?: { bound?: boolean } }>;
      bindings?: Array<{ caseId: string }>;
      automationBindings?: Array<{ caseId: string }>;
    }>(filePath);
    for (const item of document.cases ?? []) {
      if (item.automation?.bound === true) ids.add(item.caseId);
    }
    for (const item of [...(document.bindings ?? []), ...(document.automationBindings ?? [])]) ids.add(item.caseId);
  }
  return ids;
}

function readCanonicalCases(plans: Array<{ module: string; formalFileName: string; directory: string }>) {
  const result = new Map<string, { section: string; sourcePath: string; sourceFingerprint: string }>();
  for (const plan of plans) {
    const sourcePath = path.join(infoRoot, '00-待转换测试方案/用例库', plan.directory, plan.formalFileName);
    const content = fs.readFileSync(sourcePath, 'utf8');
    for (const section of content.split(/^### 用例编号：/m).slice(1)) {
      const caseId = section.match(/^([^\r\n]+)/)?.[1]?.trim();
      if (!caseId) continue;
      if (result.has(caseId)) throw new Error(`ASSET_LIFECYCLE_CANONICAL_DUPLICATE:${caseId}`);
      result.set(caseId, { section, sourcePath, sourceFingerprint: fingerprintFile(sourcePath) });
    }
  }
  return result;
}

export function selectCurrentExecution(
  records: readonly ExecutionRecord[],
  caseId: string,
  currentCaseFingerprint: string,
  currentImplementationFingerprint: string | null,
  currentContextFingerprint: string | null,
): ExecutionRecord | undefined {
  const candidates = records.filter((record) => record.caseId === caseId);
  const exact = candidates.filter((record) => normalizeFingerprint(record.caseFingerprint) === currentCaseFingerprint
    && (currentImplementationFingerprint === null
      || normalizeFingerprint(record.implementationFingerprint) === currentImplementationFingerprint)
    && (currentContextFingerprint === null
      || normalizeFingerprint(record.executionContextFingerprint) === currentContextFingerprint));
  if (exact.length > 0) return [...exact].sort(compareExecutionRecords).at(-1);
  const sameCaseFingerprint = candidates.filter((record) => normalizeFingerprint(record.caseFingerprint) === currentCaseFingerprint);
  return [...(sameCaseFingerprint.length > 0 ? sameCaseFingerprint : candidates)].sort(compareExecutionRecords).at(-1);
}

function compareExecutionRecords(left: ExecutionRecord, right: ExecutionRecord): number {
  const quality = Number(left.status === 'passed' && left.evidenceStatus === 'complete')
    - Number(right.status === 'passed' && right.evidenceStatus === 'complete');
  return quality || left.recordedAt.localeCompare(right.recordedAt);
}

function resolveWorkspacePath(filePath: string): string {
  return path.resolve(workspaceRoot, filePath);
}

function relativeWorkspace(filePath: string): string {
  return path.relative(workspaceRoot, filePath).replaceAll(path.sep, '/');
}

function fingerprintFile(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fingerprintFileAndIdentity(filePath: string, caseId: string): string {
  return createHash('sha256').update(`${caseId}\n${fingerprintFile(filePath)}`).digest('hex');
}

function normalizeFingerprint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^sha256:/i, '').toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
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
  const result = buildProductCenterAssetLifecycle();
  process.stdout.write(JSON.stringify({ outputPath: result.outputPath, summary: result.ledger.summary, invariants: result.ledger.invariants }, null, 2) + '\n');
}
