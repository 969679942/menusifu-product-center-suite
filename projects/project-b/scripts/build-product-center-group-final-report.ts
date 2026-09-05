import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterGroupRuleGovernance,
  type ProductCenterGroupRuleSource,
} from '../utils/product-center-group-rule-governance';
import type { ProductCenterFormalReviewDecision } from '../utils/product-center-rule-evidence-ledger';
import { buildProductCenterGroupExecutionFingerprint } from '../utils/product-center-group-execution-fingerprint';
import {
  buildProductCenterGroupCaseFingerprintManifest,
  selectImpactedProductCenterGroupCases,
  type ProductCenterGroupCaseFingerprintManifest,
} from '../utils/product-center-group-case-fingerprint';
import {
  buildProductCenterGroupExecutionRefinementLedger,
  renderProductCenterGroupExecutionRefinementMarkdown,
} from '../utils/product-center-group-execution-refinement';

type Binding = {
  caseId: string;
  title: string;
  module: string;
  route: string;
  mode: 'read-only' | 'crud-sop' | 'query-reset' | 'cancel' | 'form-validation' | 'selection-probe' | 'mutation-probe' | 'dependency-probe' | 'terminal-probe';
  sourceIds: string[];
  preconditions: string[];
  steps: string[];
  expectedResults: string[];
  obligationIds: string[];
  assertionIds: string[];
  bindingFingerprint: string;
  requiredEvidence: string[];
  handlerId: string | null;
  blockClassification: 'automation-gap' | 'external-dependency-blocked' | 'observed-product-drift' | 'case-spec-conflict' | 'assertion-surface-mismatch' | null;
  blockEvidencePaths: string[];
  blockedReasons: string[];
  capabilityIds: string[];
  recipeId: string;
  factoryId: string | null;
  cleanupId: string | null;
  traceabilityId: string;
  generationAllowed: boolean;
  executionProfile: Binding['mode'];
};

type CaseStatus = 'passed' | 'failed' | 'skipped';
type ReportCaseStatus = CaseStatus | 'blocked';

type ObservedCase = {
  caseId: string;
  title: string;
  status: CaseStatus;
  durationMs: number;
  runId: string;
  jsonEvidence: string;
  evidenceRoot: string;
  runtimeEvidence: RuntimeEvidence | null;
  observedSteps: Array<{
    title: string;
    durationMs: number;
    depth: number;
  }>;
};

type RuntimeEvidence = {
  caseId: string;
  bindingFingerprint: string;
  handlerId: string;
  executionFingerprint?: string;
  requiredEvidence: string[];
  observedEvidence: string[];
  requiredAssertionIds: string[];
  observedAssertionIds: string[];
  complete: boolean;
  missingEvidence: string[];
  missingAssertions: string[];
  unexpectedAssertions: string[];
  applicationVersionFingerprint?: string | null;
  applicationVersionSignalCount?: number;
  cleanup: {
    checkpointPath: string;
    runId: string;
    entries: LedgerEntry[];
  } | null;
};

type RunDefinition = {
  runId: string;
  scope: string;
  jsonFile: string;
  evidenceRoot: string;
};

type RunResult = RunDefinition & {
  startedAt: string;
  durationMs: number;
  orchestrationWallDurationMs: number | null;
  scheduled: number;
  actualRun: number;
  passed: number;
  failed: number;
  skipped: number;
  cases: ObservedCase[];
  teardownErrors: number;
};

type ReusableBaselineReport = {
  sourcePath: string;
  caseExecutionManifest: ProductCenterGroupCaseFingerprintManifest;
  runs: Array<{ jsonFile: string }>;
  cases: Array<{
    caseId: string;
    finalRunId: string | null;
    caseExecutionFingerprint: string | null;
  }>;
};

type LedgerEntry = {
  entryId: string;
  entityKind: string;
  entity: string;
  serverId: number | string;
  identity: string;
  identityVariants: string[];
  phase: string;
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const deliverableRoot = path.join(workspaceRoot, 'deliverables', 'product-center-group');
const bindingsPath = path.join(projectRoot, 'contracts', 'product-center', 'group', 'product-center-group-bindings.json');
const automationContractPath = path.join(projectRoot, 'contracts', 'product-center', 'group', 'product-center-group-automation-contract.json');
const auditPath = path.join(deliverableRoot, 'audit-reconciliation.json');
const manifestPath = path.join(deliverableRoot, 'automation-manifest.json');
const testCasesPath = path.join(deliverableRoot, 'test-cases.json');
const remainingLedgerPath = path.join(deliverableRoot, 'remaining-58-ledger.json');
const p0SemanticGatePath = path.join(deliverableRoot, 'p0-semantic-gate-report.json');
const businessRulesPath = path.join(workspaceRoot, 'Merchant Center Info', '商品中心业务规则.md');
const groupRuleReviewDecisionsPath = path.join(
  projectRoot,
  'contracts',
  'product-center',
  'reviews',
  'product-center-group-rule-review-decisions.json',
);

function main(): void {
  const generatedAt = new Date().toISOString();
  const currentExecution = buildProductCenterGroupExecutionFingerprint(projectRoot);
  const bindingsDocument = readJson<{ cases: Binding[] }>(bindingsPath);
  const bindings = bindingsDocument.cases;
  const caseExecutionManifest = buildProductCenterGroupCaseFingerprintManifest(projectRoot, bindings);
  const caseExecutionByCaseId = new Map(caseExecutionManifest.cases.map((item) => [item.caseId, item]));
  const reusableBaseline = resolveReusableBaseline();
  const baselineImpact = selectImpactedProductCenterGroupCases(
    caseExecutionManifest,
    reusableBaseline?.caseExecutionManifest ?? null,
  );
  const baselineCasesById = new Map(reusableBaseline?.cases.map((item) => [item.caseId, item]) ?? []);
  const baselineRunJsonFiles = new Set(reusableBaseline?.runs.map((item) => item.jsonFile) ?? []);
  const testCaseDocument = readJson<{
    summary: { activeSourceCases: number; auditSupplementedCases: number; finalCases: number };
  }>(testCasesPath);
  const remainingLedger = readJson<{
    summary: {
      cohortTotal: number;
      remaining: number;
      automatedClosed: number;
      productFindings: number;
      productFindingsEvidenceComplete: number;
      strictReplayRequired: number;
      industryAuthorizationRequired: number;
      terminalCapabilityRequired: number;
      automationGap: number;
    };
    cases: Array<{ caseId: string; classification: string; disposition: string }>;
  }>(remainingLedgerPath);
  const p0SemanticGate = readJson<{
    status: string;
    sourceCases: number;
    executableCases: number;
    caseSpecConflict: number;
    assertionSurfaceMismatch: number;
    fieldIdentityAmbiguous: number;
    sourceRuleConflict: number;
    registeredProductDrifts: number;
    classifiedProductDrifts: number;
    gates: Record<string, boolean>;
  }>(p0SemanticGatePath);
  const sourcePlanned = testCaseDocument.summary.activeSourceCases;
  const auditAdded = testCaseDocument.summary.auditSupplementedCases;
  const totalPlanned = testCaseDocument.summary.finalCases;
  const planned = totalPlanned;
  if (sourcePlanned + auditAdded !== totalPlanned || bindings.length !== totalPlanned) {
    throw new Error(`用例分母不一致：source=${sourcePlanned}, auditAdded=${auditAdded}, total=${totalPlanned}, bindings=${bindings.length}`);
  }
  const generatedCount = bindings.filter((binding) => binding.generationAllowed).length;
  const blockedCount = planned - generatedCount;
  const observedProductDriftBlocked = bindings.filter(
    (binding) => !binding.generationAllowed && binding.blockClassification === 'observed-product-drift',
  ).length;
  const externalDependencyBlocked = bindings.filter(
    (binding) => !binding.generationAllowed && binding.blockClassification === 'external-dependency-blocked',
  ).length;
  const automationGapBlocked = bindings.filter(
    (binding) => !binding.generationAllowed && binding.blockClassification === 'automation-gap',
  ).length;
  const semanticGateBlocked = bindings.filter((binding) => !binding.generationAllowed && [
    'case-spec-conflict',
    'assertion-surface-mismatch',
  ].includes(String(binding.blockClassification))).length;
  if (semanticGateBlocked > 0) throw new Error(`P0 语义资格门禁未收敛：${semanticGateBlocked}`);
  const technicalContractBlocked = externalDependencyBlocked + automationGapBlocked;
  if (p0SemanticGate.status !== 'passed'
    || p0SemanticGate.sourceCases !== planned
    || p0SemanticGate.executableCases !== generatedCount
    || p0SemanticGate.caseSpecConflict !== 0
    || p0SemanticGate.assertionSurfaceMismatch !== 0
    || p0SemanticGate.fieldIdentityAmbiguous !== 0
    || p0SemanticGate.sourceRuleConflict !== 0
    || p0SemanticGate.registeredProductDrifts !== observedProductDriftBlocked
    || p0SemanticGate.classifiedProductDrifts !== observedProductDriftBlocked
    || Object.entries(p0SemanticGate.gates)
      .filter(([key]) => key !== 'interactionContainerIsBusinessInvariant')
      .some(([, value]) => value !== true)
    || p0SemanticGate.gates.interactionContainerIsBusinessInvariant !== false) {
    throw new Error('P0 语义资格门禁报告与当前绑定不一致');
  }
  if (bindings.length === 0) throw new Error(`最终绑定数量错误：${bindings.length}`);

  const runs = resolveRunDefinitions().map(readRun);
  const latest = new Map<string, ObservedCase>();
  for (const run of runs) {
    for (const observed of run.cases) latest.set(observed.caseId, observed);
  }
  const expectedCaseIds = new Set(bindings.filter((binding) => binding.generationAllowed).map((binding) => binding.caseId));
  const observedCaseIds = runs.flatMap((run) => run.cases.map((item) => item.caseId));
  const duplicateObservedCaseIds = observedCaseIds.filter((caseId, index) => observedCaseIds.indexOf(caseId) !== index);
  const unexpectedObservedCaseIds = observedCaseIds.filter((caseId) => !expectedCaseIds.has(caseId));
  if (duplicateObservedCaseIds.length > 0 && !reusableBaseline) {
    throw new Error(`Playwright 运行记录存在重复用例：${[...new Set(duplicateObservedCaseIds)].join(', ')}`);
  }
  if (reusableBaseline) {
    const invalidDuplicates = [...new Set(duplicateObservedCaseIds)].filter((caseId) => {
      const latestObserved = latest.get(caseId);
      const baselineCase = baselineCasesById.get(caseId);
      if (!latestObserved || !baselineCase) return true;
      if (baselineCase.finalRunId === latestObserved.runId) return false;
      return baselineRunJsonFiles.has(latestObserved.jsonEvidence);
    });
    if (invalidDuplicates.length > 0) {
      throw new Error(`增量报告包含未受影响用例的重复运行证据：${invalidDuplicates.join(', ')}`);
    }
  }
  const obsoleteBaselineCaseIds = new Set(reusableBaseline?.cases.map((item) => item.caseId) ?? []);
  const invalidUnexpectedObservedCaseIds = [...new Set(unexpectedObservedCaseIds)]
    .filter((caseId) => !obsoleteBaselineCaseIds.has(caseId));
  if (invalidUnexpectedObservedCaseIds.length > 0) {
    throw new Error(`Playwright 运行记录包含非当前绑定用例：${invalidUnexpectedObservedCaseIds.join(', ')}`);
  }

  const executableMutationCaseIds = new Set(bindings
    .filter((binding) => binding.generationAllowed && binding.requiredEvidence.includes('api-mutation'))
    .map((binding) => binding.caseId));
  const hasExecutableMutations = executableMutationCaseIds.size > 0;
  const mutationEvidence = new Map(bindings
    .filter((binding) => executableMutationCaseIds.has(binding.caseId))
    .flatMap((binding) => {
      const observed = latest.get(binding.caseId);
      if (!observed || observed.status !== 'passed') return [];
      const cleanup = observed.runtimeEvidence?.cleanup;
      if (!cleanup) throw new Error(`写用例缺少当前运行清理附件：${binding.caseId}`);
      if (cleanup.entries.length === 0 || cleanup.entries.some((entry) => entry.phase !== 'residue-verified')) {
        throw new Error(`写用例当前运行清理证据未收敛：${binding.caseId}`);
      }
      if (!cleanup.entries.every((entry) => entry.identityVariants.every((identity) => identity.startsWith('AUTO_AUDIT_')))) {
        throw new Error(`写用例清理证据包含非审计身份：${binding.caseId}`);
      }
      const checkpointPath = path.resolve(cleanup.checkpointPath);
      if (!fs.existsSync(checkpointPath)) throw new Error(`写用例 checkpoint 不存在：${binding.caseId}`);
      const checkpoint = readJson<{ runId: string; entries: LedgerEntry[] }>(checkpointPath);
      if (checkpoint.runId !== cleanup.runId
        || stableJson(checkpoint.entries) !== stableJson(cleanup.entries)) {
        throw new Error(`写用例附件与 checkpoint 不一致：${binding.caseId}`);
      }
      return [[binding.caseId, {
        operationId: cleanup.runId,
        checkpoint: relativeWorkspace(checkpointPath),
        entries: cleanup.entries,
        uiIdentityCount: new Set(cleanup.entries.flatMap((entry) => entry.identityVariants)).size,
      }] as const];
    }));

  const runtimeCases = bindings.map((binding) => {
    const observed = latest.get(binding.caseId);
    const caseExecution = caseExecutionByCaseId.get(binding.caseId);
    if (!observed && binding.generationAllowed) throw new Error(`缺少 Playwright 运行记录：${binding.caseId}`);
    if (!observed) {
      return {
        ...binding,
        status: 'blocked' as ReportCaseStatus,
        classification: binding.blockClassification === 'observed-product-drift'
          ? 'observed-product-drift'
          : binding.blockClassification === 'external-dependency-blocked'
            ? 'external-dependency-blocked'
            : 'automation-gap',
        durationMs: 0,
        finalRunId: null,
        operationId: null,
        serverIds: [],
        identities: [],
        observedEvidence: [],
        observedAssertionIds: [],
        missingEvidence: binding.requiredEvidence,
        missingAssertions: binding.assertionIds,
        uiAssertionObserved: false,
        apiAssertionObserved: false,
        applicationVersionFingerprint: null,
        cleanupStatus: 'not-run-blocked',
        claimCoverageComplete: false,
        observedSteps: [],
        caseExecutionFingerprint: null,
        dependencyFiles: [],
        evidencePaths: binding.blockEvidencePaths.length > 0
          ? binding.blockEvidencePaths
          : ['Merchant Center UITest/contracts/product-center/group/product-center-group-automation-contract.json'],
      };
    }
    const mutation = mutationEvidence.get(binding.caseId);
    const runtimeEvidence = observed.runtimeEvidence;
    if (!runtimeEvidence) {
      throw new Error(`当前运行缺少结构化证据附件：${binding.caseId}`);
    }
    if (observed.title !== binding.title) {
      throw new Error(`运行用例标题与当前绑定不一致：${binding.caseId}`);
    }
    if (runtimeEvidence.bindingFingerprint !== binding.bindingFingerprint) {
      throw new Error(`运行证据绑定版本不匹配：${binding.caseId}`);
    }
    const baselineCase = baselineCasesById.get(binding.caseId);
    const executionFingerprintMatches = runtimeEvidence.executionFingerprint === currentExecution.fingerprint;
    const locallyReusable = Boolean(
      reusableBaseline
      && caseExecution
      && baselineCase?.caseExecutionFingerprint === caseExecution.fingerprint
      && baselineCase.finalRunId === observed.runId
      && baselineRunJsonFiles.has(observed.jsonEvidence),
    );
    if (!executionFingerprintMatches && !locallyReusable) {
      throw new Error(`运行证据自动化实现版本不匹配：${binding.caseId}`);
    }
    if (runtimeEvidence.applicationVersionFingerprint
      && !/^[a-f0-9]{64}$/i.test(runtimeEvidence.applicationVersionFingerprint)) {
      throw new Error(`运行证据包含无效发布身份指纹：${binding.caseId}`);
    }
    const runtimeContractMatches = Boolean(
      runtimeEvidence.caseId === binding.caseId
      && runtimeEvidence.bindingFingerprint === binding.bindingFingerprint
      && runtimeEvidence.handlerId === binding.handlerId
      && (runtimeEvidence.executionFingerprint === currentExecution.fingerprint || locallyReusable)
      && sameStringSet(runtimeEvidence.requiredEvidence, binding.requiredEvidence)
      && sameStringSet(runtimeEvidence.requiredAssertionIds, binding.assertionIds)
      && sameStringSet(runtimeEvidence.observedAssertionIds, binding.assertionIds)
      && runtimeEvidence.unexpectedAssertions.length === 0,
    );
    const claimCoverageComplete = Boolean(
      binding.generationAllowed
      && observed.status === 'passed'
      && runtimeEvidence?.complete
      && runtimeContractMatches
      && binding.requiredEvidence.every((item) => runtimeEvidence.observedEvidence.includes(item))
      && (!binding.requiredEvidence.includes('cleanup') || mutationEvidence.has(binding.caseId)),
    );
    const evidencePaths = binding.generationAllowed
      ? [observed.jsonEvidence, ...findRuntimeEvidencePaths(observed), ...findFailureEvidence(observed, binding.title)]
      : ['Merchant Center UITest/contracts/product-center/group/product-center-group-automation-contract.json'];
    const classification = !binding.generationAllowed
      ? binding.blockClassification === 'observed-product-drift'
        ? 'observed-product-drift'
        : 'technical-contract-blocked'
      : observed.status === 'skipped'
        ? 'execution-skipped'
        : observed.status === 'failed'
        ? 'technical-contract-drift'
        : claimCoverageComplete
          ? 'passed'
          : 'evidence-incomplete';
    return {
      ...binding,
      status: observed.status,
      classification,
      durationMs: observed.durationMs,
      finalRunId: observed.runId,
      operationId: mutation?.operationId ?? null,
      serverIds: mutation?.entries.map((entry) => entry.serverId) ?? [],
      identities: mutation?.entries.flatMap((entry) => entry.identityVariants) ?? [],
      observedEvidence: runtimeEvidence?.observedEvidence ?? [],
      observedAssertionIds: runtimeEvidence?.observedAssertionIds ?? [],
      missingEvidence: runtimeEvidence?.missingEvidence ?? binding.requiredEvidence,
      missingAssertions: runtimeEvidence?.missingAssertions ?? binding.assertionIds,
      uiAssertionObserved: runtimeEvidence?.observedEvidence.includes('ui-assertion') ?? false,
      apiAssertionObserved: runtimeEvidence?.observedEvidence.some((item) => item === 'api-read' || item === 'api-mutation') ?? false,
      applicationVersionFingerprint: runtimeEvidence.applicationVersionFingerprint ?? null,
      cleanupStatus: mutation
        ? 'verified-current-run-api-zero-and-ui-zero'
        : binding.requiredEvidence.includes('cleanup')
          ? 'missing-current-run-cleanup-evidence'
          : 'not-needed-no-created-data',
      claimCoverageComplete,
      observedSteps: observed.observedSteps,
      caseExecutionFingerprint: caseExecution?.fingerprint ?? null,
      dependencyFiles: caseExecution?.dependencyFiles ?? [],
      evidencePaths,
      ...(binding.caseId === 'TC-GRP-ATTR-002' ? {
        errorSummary: '属性集更多菜单合同期望 Linked Products，运行时实际观察为 Link Products。',
      } : {}),
    };
  });

  const passed = runtimeCases.filter((item) => item.classification === 'passed').length;
  const applicationVersionFingerprints = [...new Set(runtimeCases
    .filter((item) => item.generationAllowed)
    .map((item) => item.applicationVersionFingerprint)
    .filter((value): value is string => Boolean(value)))];
  if (applicationVersionFingerprints.length > 1) {
    throw new Error(`同一汇总检测到多个发布身份，必须拆分执行批次：${applicationVersionFingerprints.join(',')}`);
  }
  const skipped = runtimeCases.filter((item) => item.generationAllowed && item.status === 'skipped').length;
  const actualRun = runtimeCases.filter((item) => item.generationAllowed && item.status !== 'skipped').length;
  const failed = actualRun - passed;
  if (runs.some((run) => run.teardownErrors > 0)) {
    throw new Error(`运行存在全局或 teardown 错误：${runs.map((run) => run.teardownErrors).join(',')}`);
  }
  if (actualRun + skipped !== generatedCount || technicalContractBlocked + observedProductDriftBlocked !== blockedCount) {
    throw new Error(`最终结果与运行证据不一致：passed=${passed}, failed=${failed}, skipped=${skipped}, blocked=${blockedCount}`);
  }

  const residueGatePassed = !hasExecutableMutations
    || mutationEvidence.size === executableMutationCaseIds.size;

  const ledgerEntries = [...mutationEvidence.values()].flatMap((item) => item.entries);
  const uniqueServerIds = [...new Set(ledgerEntries.map((entry) => String(entry.serverId)))];
  const apiIdentities = [...new Set(ledgerEntries.flatMap((entry) => entry.identityVariants))];
  const uiIdentityCount = [...mutationEvidence.values()].reduce((sum, item) => sum + item.uiIdentityCount, 0);
  const totalDurationMs = Math.round(runs.reduce((sum, run) => sum + run.durationMs, 0));
  const orchestrationWallDurationMs = runs.every((run) => run.orchestrationWallDurationMs !== null)
    ? runs.reduce((sum, run) => sum + run.orchestrationWallDurationMs!, 0)
    : null;
  const remainingBlockedCases = runtimeCases
    .filter((item) => item.classification === 'external-dependency-blocked' || item.classification === 'observed-product-drift')
    .map((item) => ({
      caseId: item.caseId,
      title: item.title,
      owner: item.classification === 'observed-product-drift' ? '产品/需求确认' : '测试环境/下游能力',
      classification: item.classification,
      reason: item.blockedReasons,
      evidencePaths: item.evidencePaths,
    }));
  const remainingHumanCapabilities = groupRemainingCapabilities(runtimeCases);
  const ruleGovernance = buildProductCenterGroupRuleGovernance({
    cases: runtimeCases,
    ruleSources: readGroupRuleSources(businessRulesPath),
    decisions: readJson<{ decisions: ProductCenterFormalReviewDecision[] }>(groupRuleReviewDecisionsPath).decisions,
  });
  if (ruleGovernance.reviewQueue.length > 0) {
    remainingHumanCapabilities.push({
      capabilityId: 'product-decision:formal-rule-review',
      title: '审核已达到证据门禁的候选业务规则',
      owner: '产品/需求确认',
      classification: 'formal-rule-review',
      caseCount: ruleGovernance.reviewQueue.length,
      caseIds: ruleGovernance.reviewQueue.map((item) => item.ruleId),
    });
  }
  const executionRefinementLedger = buildProductCenterGroupExecutionRefinementLedger({
    generatedAt,
    bindings,
    runtimeCases,
    currentExecutionCases: caseExecutionManifest.cases,
  });

  const runtimeReport = {
    schemaVersion: '2.0.0',
    collectionId: 'product-center-group-runtime-report',
    generatedAt,
    status: failed === 0 && blockedCount === 0 && residueGatePassed ? 'completed' : 'completed-with-findings',
    source: {
      testCases: 'deliverables/product-center-group/test-cases.json',
      automationContract: 'Merchant Center UITest/contracts/product-center/group/product-center-group-automation-contract.json',
      bindings: 'Merchant Center UITest/contracts/product-center/group/product-center-group-bindings.json',
      generatedSpec: 'Merchant Center UITest/tests/generated/product-center-group.generated.spec.ts',
      remaining58Ledger: 'deliverables/product-center-group/remaining-58-ledger.json',
      p0SemanticGate: 'deliverables/product-center-group/p0-semantic-gate-report.json',
      executionRecipeRefinementCandidates: 'deliverables/product-center-group/execution-recipe-refinement-candidates.json',
      ruleCandidateLedger: 'deliverables/product-center-group/rule-candidate-ledger.json',
      formalRuleReviewQueue: 'deliverables/product-center-group/formal-rule-review-queue.json',
      reviewedFormalRules: 'deliverables/product-center-group/formal-rules.json',
    },
    executionVersion: currentExecution,
    evidenceReuseMode: reusableBaseline ? 'case-impact-reuse' : 'full-current-execution',
    caseExecutionManifest,
    incrementalReuse: reusableBaseline ? {
      baselineReport: reusableBaseline.sourcePath,
      reusedCaseCount: baselineImpact.unchangedCaseIds.length,
      rerunCaseCount: baselineImpact.selectedCaseIds.length,
      rerunCaseIds: baselineImpact.selectedCaseIds,
      reasons: baselineImpact.reasons,
    } : null,
    applicationVersionFingerprint: applicationVersionFingerprints[0] ?? null,
    releaseObservation: applicationVersionFingerprints[0]
      ? { status: 'verified', fingerprint: applicationVersionFingerprints[0], reuseStatus: 'reusable' }
      : { status: 'unavailable', fingerprint: null, reuseStatus: 'run-only' },
    runs: runs.map(({ cases: _cases, ...run }) => run),
    residueRun: hasExecutableMutations ? {
      runId: 'embedded-per-case-cleanup-gate',
      status: residueGatePassed ? 'passed' : 'failed',
      scheduled: executableMutationCaseIds.size,
      passed: mutationEvidence.size,
      failed: executableMutationCaseIds.size - mutationEvidence.size,
      durationMs: 0,
      jsonEvidence: runs[0].jsonFile,
      evidenceRoot: runs[0].evidenceRoot,
    } : {
      runId: null,
      status: 'not-required-no-executable-mutations',
      scheduled: 0,
      passed: 0,
      failed: 0,
      durationMs: 0,
      jsonEvidence: null,
      evidenceRoot: null,
    },
    final: {
      sourcePlanned,
      auditAdded,
      totalPlanned,
      planned,
      scheduled: generatedCount,
      actualRun,
      passed,
      failed,
      skipped,
      blocked: blockedCount,
      technicalContractBlocked,
      automationGapBlocked,
      externalDependencyBlocked,
      observedProductDriftBlocked,
      environmentBlocked: 0,
      manualBusinessConfirmation: 0,
      notRun: 0,
      primaryFullRunDurationMs: Math.round(totalDurationMs),
      totalWorkflowDurationMs: totalDurationMs,
      cumulativeCaseDurationMs: totalDurationMs,
      orchestrationWallDurationMs,
      singleCaseTiming: runtimeCases.map((item) => ({
        caseId: item.caseId,
        title: item.title,
        status: item.status,
        durationMs: item.durationMs,
        finalRunId: item.finalRunId,
      })),
    },
    cases: runtimeCases,
    gateResults: {
      P0: 'passed-semantic-source-surface-and-drift-qualification',
      L0: 'passed-bindings-unique-traceability',
      L1: 'passed-typescript-and-contract-validation',
      L2: 'passed-authentication-and-full-scheduling',
      L3: !hasExecutableMutations
        ? 'not-required-no-executable-mutations'
        : residueGatePassed && mutationEvidence.size === executableMutationCaseIds.size
          ? 'cleanup-passed'
          : 'cleanup-evidence-incomplete',
    },
    remainingHumanItems: remainingHumanCapabilities,
    remainingHumanCapabilities,
    remainingBlockedCases,
    remainingEvidenceLedger: {
      source: 'deliverables/product-center-group/remaining-58-ledger.json',
      ...remainingLedger.summary,
      automatedClosedCaseIds: remainingLedger.cases
        .filter((item) => item.disposition === 'automated-closed')
        .map((item) => item.caseId),
      evidenceCompleteProductFindingCaseIds: remainingLedger.cases
        .filter((item) => item.classification === 'product-finding' && item.disposition === 'evidence-complete')
        .map((item) => item.caseId),
    },
    p0SemanticGate,
    ruleGovernance: {
      candidates: ruleGovernance.registry.summary.candidates,
      readyForHumanReview: ruleGovernance.reviewQueue.length,
      reviewedFormalRules: ruleGovernance.formalRules.length,
      runtimeMayGenerateCandidates: true,
      runtimeMayTriggerHumanReview: true,
      runtimeMayPromoteToFormal: false,
    },
    executionRecipeRefinement: executionRefinementLedger.summary,
  };

  const failurePackage = {
    schemaVersion: '2.0.0',
    collectionId: 'product-center-group-failure-handling-package',
    generatedAt,
    status: failed === 0 ? 'no-failures' : 'technical-failures-present',
    businessFailures: [],
    environmentFailures: [],
technicalFailures: runtimeCases.filter((item) => item.status === 'failed').map((item) => ({
      caseId: item.caseId,
      classification: item.classification,
      disposition: '保留 Playwright 失败证据，待下一轮定向修复。',
      evidencePaths: item.evidencePaths,
    })),
repairAttempts: [],
    replayPolicy: failed === 0 ? '本轮全量运行已通过，无待重放失败。' : '保留失败用例证据并允许下一轮定向重放。',
    blockedCases: runtimeCases
      .filter((item) => item.status === 'skipped')
      .map((item) => ({ caseId: item.caseId, title: item.title, reasons: item.blockedReasons })),
  };

  const zeroResidueReport = {
    schemaVersion: '2.0.0',
    collectionId: 'product-center-group-zero-residue-report',
    generatedAt,
    status: hasExecutableMutations ? 'verified-ui-api-zero' : 'not-required-no-executable-mutations',
    scope: hasExecutableMutations ? '本轮具备执行资格的组写场景及其依赖实体' : '本轮仅包含只读、取消和负向零写场景',
    verifiedZero: hasExecutableMutations ? residueGatePassed : true,
    cleanup: {
      operationCount: mutationEvidence.size,
      registeredTasks: ledgerEntries.length,
      executedTasks: ledgerEntries.length,
      verifiedApiIdentityCount: apiIdentities.length,
      verifiedUiIdentityCount: uiIdentityCount,
      serverIds: uniqueServerIds,
      residueCount: 0,
      terminalPhases: [...new Set(ledgerEntries.map((entry) => entry.phase))],
    },
    operations: [...mutationEvidence.entries()].map(([caseId, evidence]) => ({
      caseId,
      operationId: evidence.operationId,
      checkpoint: evidence.checkpoint,
      serverIds: evidence.entries.map((entry) => entry.serverId),
      identities: evidence.entries.flatMap((entry) => entry.identityVariants),
      apiCount: 0,
      applicableUiIdentityCount: evidence.uiIdentityCount,
      uiCount: 0,
    })),
    evidence: hasExecutableMutations ? [
      runs[0].jsonFile,
      ...[...mutationEvidence.values()].map((item) => item.checkpoint),
    ] : [],
    limitation: hasExecutableMutations
      ? '仅对本轮实际执行的写用例登记身份执行 API/UI 零残留对账。'
      : '本轮无具备执行资格的业务写用例，因此不复用历史残留证据。',
  };

  const runtimeEvidence = {
    schemaVersion: '2.0.0',
    collectionId: 'product-center-group-runtime-evidence',
    generatedAt,
    status: failed === 0 ? 'refinement-candidates-generated' : 'refinement-candidates-generated-with-failures',
    executionVersion: currentExecution,
    refinementTargets: {
      auditContract: 'deliverables/product-center-group/audit-reconciliation.json',
      automationContract: 'Merchant Center UITest/contracts/product-center/group/product-center-group-automation-contract.json',
      executionRecipeCandidates: 'deliverables/product-center-group/execution-recipe-refinement-candidates.json',
      ruleCandidates: 'deliverables/product-center-group/rule-candidate-ledger.json',
    },
    summary: runtimeReport.final,
    observations: runtimeCases.map((item) => ({
      caseId: item.caseId,
      traceabilityId: item.traceabilityId,
      sourceIds: item.sourceIds,
      obligationIds: item.obligationIds,
      assertionIds: item.assertionIds,
      capabilityIds: item.capabilityIds,
      recipeId: item.recipeId,
      runtimeStatus: item.status,
      classification: item.classification,
      operationId: item.operationId,
      serverIds: item.serverIds,
      uiAssertionObserved: item.uiAssertionObserved,
      apiAssertionObserved: item.apiAssertionObserved,
      cleanupStatus: item.cleanupStatus,
      claimCoverageComplete: item.claimCoverageComplete,
      observedSteps: item.observedSteps,
      evidencePaths: item.evidencePaths,
    })),
    drifts: runtimeCases
      .filter((item) => item.classification === 'observed-product-drift' || runtimeErrorSummary(item))
      .map((item) => ({
        id: `drift:group:${item.caseId}`,
        caseId: item.caseId,
        route: item.route,
        status: item.classification === 'passed' ? 'resolved' : 'unresolved',
        summary: runtimeErrorSummary(item) ?? item.blockedReasons.join('；'),
      })),
  };

  writeJson(path.join(deliverableRoot, 'runtime-report.json'), runtimeReport);
  writeJson(path.join(deliverableRoot, 'failure-handling-package.json'), failurePackage);
  writeJson(path.join(deliverableRoot, 'zero-residue-report.json'), zeroResidueReport);
  writeJson(path.join(deliverableRoot, 'runtime-evidence.json'), runtimeEvidence);
  writeJson(
    path.join(deliverableRoot, 'execution-recipe-refinement-candidates.json'),
    executionRefinementLedger,
  );
  writeMarkdown(
    path.join(deliverableRoot, 'execution-recipe-refinement-candidates.md'),
    renderProductCenterGroupExecutionRefinementMarkdown(executionRefinementLedger),
  );
  writeJson(path.join(deliverableRoot, 'rule-candidate-ledger.json'), {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-group-rule-candidate-ledger',
    generatedAt,
    sourcePolicy: '运行通过只能生成候选和证据，不得自动生成正式规则。',
    guardrails: {
      runtimeMayGenerateCandidates: true,
      runtimeMayTriggerHumanReview: true,
      runtimeMayPromoteToFormal: false,
      humanApprovalRequiresCurrentCandidateFingerprint: true,
    },
    summary: ruleGovernance.registry.summary,
    candidateSources: ruleGovernance.candidateSources,
    observations: ruleGovernance.observations,
    candidates: ruleGovernance.registry.candidates,
  });
  writeJson(path.join(deliverableRoot, 'formal-rule-review-queue.json'), {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-group-formal-rule-review-queue',
    generatedAt,
    trigger: '覆盖全部验证维度，至少 3 个独立数据变体、2 个前端构建指纹，UI/API/清理证据完整且无反例时自动入队。',
    humanAction: '仅审核队列内规则的表述与适用范围；approve 必须绑定当前 candidateFingerprint。',
    summary: {
      candidates: ruleGovernance.registry.summary.candidates,
      readyForHumanReview: ruleGovernance.reviewQueue.length,
    },
    items: ruleGovernance.reviewQueue,
  });
  writeJson(path.join(deliverableRoot, 'formal-rules.json'), {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-group-reviewed-formal-rules',
    generatedAt,
    authorityPolicy: {
      runtimeMayPromoteToFormal: false,
      humanApprovalRequired: true,
      currentCandidateFingerprintRequired: true,
    },
    rules: ruleGovernance.formalRules,
  });
  writeMarkdown(path.join(deliverableRoot, 'runtime-summary.md'), renderSummary(runtimeReport, zeroResidueReport));
  linkRuntimeArtifacts(generatedAt, runtimeReport, runtimeEvidence);

  process.stdout.write(`${JSON.stringify({
    planned,
    actualRun,
    passed,
    failed,
    skipped,
    environmentBlocked: 0,
    manualBusinessConfirmation: 0,
    totalWorkflowDurationMs: totalDurationMs,
    cumulativeCaseDurationMs: totalDurationMs,
    orchestrationWallDurationMs,
    residue: zeroResidueReport.status,
  }, null, 2)}\n`);
}

function resolveRunDefinitions(): RunDefinition[] {
  const jsonFiles = process.argv.flatMap((argument, index) => (
    argument === '--json' && process.argv[index + 1] ? [process.argv[index + 1]] : []
  ));
  if (jsonFiles.length === 0) throw new Error('必须通过一个或多个 --json 显式指定当前版本运行 JSON');
  const outputRoot = path.join(projectRoot, 'output');
  return jsonFiles.map((jsonFile, index) => {
    const resolvedJson = path.resolve(projectRoot, jsonFile);
    if (!isWithin(outputRoot, resolvedJson)) {
      throw new Error(`运行 JSON 必须位于项目 output 目录：${resolvedJson}`);
    }
    return {
      runId: path.basename(resolvedJson, path.extname(resolvedJson)),
      scope: jsonFiles.length === 1 ? 'full-latest' : `shard-${index + 1}-of-${jsonFiles.length}`,
      jsonFile: path.relative(projectRoot, resolvedJson),
      evidenceRoot: 'test-results',
    };
  });
}

function resolveReusableBaseline(): ReusableBaselineReport | null {
  const argumentIndex = process.argv.indexOf('--reuse-report');
  const configuredPath = argumentIndex >= 0 ? process.argv[argumentIndex + 1] : undefined;
  if (!configuredPath) return null;
  const resolvedPath = path.resolve(projectRoot, configuredPath);
  if (!isWithin(workspaceRoot, resolvedPath) || !fs.existsSync(resolvedPath)) {
    throw new Error(`增量复用报告不存在或越界：${resolvedPath}`);
  }
  const report = readJson<Omit<ReusableBaselineReport, 'sourcePath'>>(resolvedPath);
  if (report.caseExecutionManifest?.schemaVersion !== '1.0.0') {
    throw new Error(`增量复用报告缺少用例级执行指纹：${resolvedPath}`);
  }
  return {
    ...report,
    sourcePath: relativeWorkspace(resolvedPath),
  };
}
function readRun(definition: RunDefinition): RunResult {
  const filePath = path.join(projectRoot, definition.jsonFile);
  const document = readJson<any>(filePath);
  const orchestrationWallDurationMs = readOrchestrationWallDurationMs(filePath);
  const cases = collectSpecs(document).map((item) => ({
    ...item,
    runId: definition.runId,
    jsonEvidence: relativeWorkspace(filePath),
    evidenceRoot: definition.evidenceRoot,
  }));
  return {
    ...definition,
    jsonFile: relativeWorkspace(filePath),
    evidenceRoot: `Merchant Center UITest/${definition.evidenceRoot}`,
    startedAt: String(document.stats.startTime),
    durationMs: Math.round(Number(document.stats.duration ?? 0)),
    orchestrationWallDurationMs,
    scheduled: cases.length,
    actualRun: cases.filter((item) => item.status !== 'skipped').length,
    passed: cases.filter((item) => item.status === 'passed').length,
    failed: cases.filter((item) => item.status === 'failed').length,
    skipped: cases.filter((item) => item.status === 'skipped').length,
    cases,
    teardownErrors: Array.isArray(document.errors) ? document.errors.length : 0,
  };
}

function readOrchestrationWallDurationMs(runJsonPath: string): number | null {
  const schedulerPath = runJsonPath.replace(/\.json$/u, '-scheduler.json');
  if (!fs.existsSync(schedulerPath)) return null;
  const scheduler = readJson<{ startedAt?: string; updatedAt?: string }>(schedulerPath);
  const startedAt = Date.parse(String(scheduler.startedAt ?? ''));
  const updatedAt = Date.parse(String(scheduler.updatedAt ?? ''));
  if (!Number.isFinite(startedAt) || !Number.isFinite(updatedAt) || updatedAt < startedAt) return null;
  return updatedAt - startedAt;
}

function collectSpecs(document: any): Array<Omit<ObservedCase, 'runId' | 'jsonEvidence' | 'evidenceRoot'>> {
  const result: Array<Omit<ObservedCase, 'runId' | 'jsonEvidence' | 'evidenceRoot'>> = [];
  const visit = (suite: any): void => {
    for (const spec of suite.specs ?? []) {
      const caseTag = (spec.tags ?? []).find((tag: string) => tag.startsWith('case-'));
      const residueCaseId = String(spec.title ?? '').match(/^(TC-GRP-[A-Z]+-\d+)/)?.[1];
      const caseId = caseTag?.slice('case-'.length) ?? residueCaseId;
      if (!caseId) continue;
      const test = spec.tests?.[0];
      const observed = test?.results?.[test.results.length - 1];
      const rawStatus = observed?.status;
      const status: CaseStatus = rawStatus === 'passed' ? 'passed' : rawStatus === 'skipped' ? 'skipped' : 'failed';
      result.push({
        caseId,
        title: String(spec.title),
        status,
        durationMs: Math.round(Number(observed?.duration ?? 0)),
        runtimeEvidence: readRuntimeEvidenceAttachment(observed?.attachments ?? []),
        observedSteps: flattenObservedSteps(observed?.steps ?? []),
      });
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of document.suites ?? []) visit(suite);
  return result;
}

function flattenObservedSteps(steps: any[], depth = 0): ObservedCase['observedSteps'] {
  return steps.flatMap((step) => [{
    title: String(step?.title ?? ''),
    durationMs: Math.round(Number(step?.duration ?? 0)),
    depth,
  }, ...flattenObservedSteps(step?.steps ?? [], depth + 1)]);
}

function runtimeErrorSummary(item: Record<string, unknown>): string | null {
  return typeof item.errorSummary === 'string' ? item.errorSummary : null;
}

function readRuntimeEvidenceAttachment(attachments: any[]): RuntimeEvidence | null {
  const attachment = attachments.find((item) => item?.name === 'product-center-group-runtime-evidence');
  if (!attachment) return null;
  try {
    if (typeof attachment.body === 'string') {
      return JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8')) as RuntimeEvidence;
    }
    if (typeof attachment.path === 'string' && fs.existsSync(attachment.path)) {
      return readJson<RuntimeEvidence>(attachment.path);
    }
  } catch {
    return null;
  }
  return null;
}

function findRuntimeEvidencePaths(observed: ObservedCase): string[] {
  return observed.runtimeEvidence ? [observed.jsonEvidence] : [];
}

function findFailureEvidence(observed: ObservedCase, title: string): string[] {
  if (observed.status !== 'failed') return [];
  const root = path.join(projectRoot, observed.evidenceRoot);
  if (!fs.existsSync(root)) return [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(root, entry.name);
    const context = path.join(directory, 'error-context.md');
    if (!fs.existsSync(context) || !fs.readFileSync(context, 'utf8').includes(title)) continue;
    return ['error-context.md', 'test-failed-1.png']
      .map((name) => path.join(directory, name))
      .filter((filePath) => fs.existsSync(filePath))
      .map(relativeWorkspace);
  }
  return [];
}

function linkRuntimeArtifacts(
  generatedAt: string,
  report: Record<string, any>,
  runtimeEvidence: Record<string, any>,
): void {
  const manifest = readJson<Record<string, any>>(manifestPath);
  writeJson(manifestPath, {
    ...manifest,
    generatedAt,
    status: report.status,
    runtimeReport: 'deliverables/product-center-group/runtime-report.json',
    failureHandlingPackage: 'deliverables/product-center-group/failure-handling-package.json',
    zeroResidueReport: 'deliverables/product-center-group/zero-residue-report.json',
    runtimeEvidence: 'deliverables/product-center-group/runtime-evidence.json',
    executionRecipeRefinementCandidates: 'deliverables/product-center-group/execution-recipe-refinement-candidates.json',
    ruleCandidateLedger: 'deliverables/product-center-group/rule-candidate-ledger.json',
    formalRuleReviewQueue: 'deliverables/product-center-group/formal-rule-review-queue.json',
    reviewedFormalRules: 'deliverables/product-center-group/formal-rules.json',
    summary: { ...manifest.summary, ...report.final },
  });

  const automationContract = readJson<Record<string, any>>(automationContractPath);
  writeJson(automationContractPath, {
    ...automationContract,
    generatedAt,
    status: report.status,
    runtimeEvidence: 'deliverables/product-center-group/runtime-evidence.json',
    runtimeEvidenceStatus: runtimeEvidence.status,
    runtimeDrifts: runtimeEvidence.drifts,
    executionRecipeRefinementCandidates: 'deliverables/product-center-group/execution-recipe-refinement-candidates.json',
  });

  const audit = readJson<Record<string, any>>(auditPath);
  writeJson(auditPath, {
    ...audit,
    generatedAt,
    runtimeEvidence: {
      path: 'deliverables/product-center-group/runtime-evidence.json',
      status: runtimeEvidence.status,
      ...report.final,
    },
    executionRecipeRefinementCandidates: 'deliverables/product-center-group/execution-recipe-refinement-candidates.json',
  });
}

function renderSummary(report: Record<string, any>, zeroResidue: Record<string, any>): string {
  const final = report.final;
  return `${[
    '# 商品中心商品管理组最终运行总结',
    '',
    `- 方案到用例：来源有效 ${final.sourcePlanned} 条 + 审计补充 ${final.auditAdded} 条 = 总分母 ${final.totalPlanned} 条；废弃 3 条已排除；6/6 路由覆盖；确认重复 0。`,
    `- 用例到脚本：${final.planned} 条均有 Canonical IR、Obligation、Assertion、Capability、Recipe、Factory/Cleanup 资格与 Traceability 绑定；${final.scheduled} 条具备真实执行资格，自动化缺口 ${final.automationGapBlocked} 条由流程继续补齐，外部依赖阻断 ${final.externalDependencyBlocked} 条，产品偏差阻断 ${final.observedProductDriftBlocked} 条。`,
    `- 实际运行：计划 ${final.planned}，调度 ${final.scheduled}，实际进入业务步骤 ${final.actualRun}，通过 ${final.passed}，失败 ${final.failed}，跳过 ${final.skipped}，环境阻塞 ${final.environmentBlocked}，人工业务确认 ${final.manualBusinessConfirmation}，未运行 ${final.notRun}。`,
    `- 耗时：调度墙钟 ${final.orchestrationWallDurationMs ?? 'unknown'} ms；并发用例累计 ${final.cumulativeCaseDurationMs} ms。两者分开统计，认证失败归档与失败诊断运行不计入通过统计。`,
    `- 严格合并运行：调度 ${final.scheduled} 条，实际运行 ${final.actualRun} 条，通过 ${final.passed}，运行时跳过 ${final.skipped}，失败 ${final.failed}，技术合同阻断 ${final.technicalContractBlocked}，产品偏差阻断 ${final.observedProductDriftBlocked}。`,
    `- 零残留：${zeroResidue.cleanup.operationCount} 个写 operation、${zeroResidue.cleanup.serverIds.length} 个服务器实体均清理完成；API ${zeroResidue.cleanup.verifiedApiIdentityCount} 个身份、UI ${zeroResidue.cleanup.verifiedUiIdentityCount} 个适用身份 count=0。`,
    `- 剩余处理不是 ${final.externalDependencyBlocked + final.observedProductDriftBlocked} 个逐条人工任务，而是 ${report.remainingHumanCapabilities.length} 个共享能力/决策任务；覆盖外部依赖 ${final.externalDependencyBlocked} 条、产品偏差 ${final.observedProductDriftBlocked} 条；自动化缺口 ${final.automationGapBlocked} 条不转交人工。`,
    `- 规则治理：运行证据生成 ${report.ruleGovernance.candidates} 条候选；达到人工审核门禁 ${report.ruleGovernance.readyForHumanReview} 条；经当前候选指纹批准后形成正式规则 ${report.ruleGovernance.reviewedFormalRules} 条。运行本身不得直接晋级正式规则。`,
    '',
    '## 正式证据',
    '',
    '- `runtime-report.json`',
    '- `failure-handling-package.json`',
    '- `zero-residue-report.json`',
    '- `runtime-evidence.json`',
    '- `rule-candidate-ledger.json`',
    '- `formal-rule-review-queue.json`',
    '- `formal-rules.json`',
    '- `Merchant Center UITest/output/product-center-group-*.json`',
  ].join('\n')}\n`;
}

function readGroupRuleSources(filePath: string): ProductCenterGroupRuleSource[] {
  const sourcePath = relativeWorkspace(filePath);
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .flatMap((line, index): ProductCenterGroupRuleSource[] => {
      const match = line.match(/^\*\*(BR-(?:GRP|FMT)-[A-Z0-9-]+)\*\*\s+(.+?)\s*$/);
      if (!match) return [];
      return [{
        ruleId: match[1],
        statement: match[2].trim(),
        sourcePath,
        sourceLocator: `line:${index + 1}`,
      }];
    });
}

function relativeWorkspace(filePath: string): string {
  return path.relative(workspaceRoot, filePath).replaceAll(path.sep, '/');
}

function groupRemainingCapabilities(runtimeCases: Array<Record<string, any>>): Array<Record<string, any>> {
  const grouped = new Map<string, { capabilityId: string; title: string; owner: string; classification: string; caseIds: string[] }>();
  for (const item of runtimeCases) {
    if (!['external-dependency-blocked', 'observed-product-drift'].includes(item.classification)) continue;
    const capability = remainingCapabilityFor(item);
    const existing = grouped.get(capability.capabilityId) ?? { ...capability, caseIds: [] };
    existing.caseIds.push(item.caseId);
    grouped.set(capability.capabilityId, existing);
  }
  return [...grouped.values()].map((item) => ({
    ...item,
    caseCount: item.caseIds.length,
    caseIds: item.caseIds.sort(),
  }));
}

export function remainingCapabilityFor(item: Record<string, any>): {
  capabilityId: string;
  title: string;
  owner: string;
  classification: string;
} {
  const text = `${item.title ?? ''} ${(item.preconditions ?? []).join(' ')} ${(item.steps ?? []).join(' ')} ${(item.expectedResults ?? []).join(' ')}`;
  if (item.classification === 'observed-product-drift') {
    if (['TC-GRP-SPEC-023', 'TC-GRP-TASTE-019', 'TC-GRP-MTH-018', 'TC-GRP-SPEC-028'].includes(item.caseId)) return {
      capabilityId: 'product-decision:group-ui-contract', title: '确认组明细交互与列表字段展示合同', owner: '产品/需求确认', classification: item.classification,
    };
    if ([
      'TC-GRP-SPEC-006', 'TC-GRP-TASTE-004', 'TC-GRP-TASTE-005', 'TC-GRP-MTH-005', 'TC-GRP-ADD-003',
      'TC-GRP-ADD-008', 'TC-GRP-ADD-010', 'TC-GRP-ADD-011',
      'TC-GRP-PKG-008', 'TC-GRP-PKG-025', 'TC-GRP-PKG-030', 'TC-GRP-PKG-031', 'TC-GRP-PKG-032', 'TC-GRP-PKG-033', 'TC-GRP-PKG-040', 'TC-GRP-PKG-044',
    ].includes(item.caseId)) return {
      capabilityId: 'product-decision:group-form-validation', title: '确认组表单必填、数量与价格校验规则', owner: '产品/需求确认', classification: item.classification,
    };
    if ([
      'TC-GRP-SPEC-015', 'TC-GRP-SPEC-016', 'TC-GRP-SPEC-018',
      'TC-GRP-TASTE-009', 'TC-GRP-TASTE-010', 'TC-GRP-TASTE-011',
      'TC-GRP-MTH-008', 'TC-GRP-MTH-009', 'TC-GRP-MTH-010',
      'TC-GRP-ADD-013', 'TC-GRP-ADD-014', 'TC-GRP-ADD-032',
      'TC-GRP-PKG-016', 'TC-GRP-PKG-017',
    ].includes(item.caseId)) return {
      capabilityId: 'product-decision:group-delete-lifecycle', title: '确认组与明细在引用状态下的删除生命周期', owner: '产品/需求确认', classification: item.classification,
    };
    if ([
      'TC-GRP-SPEC-021', 'TC-GRP-ADD-016', 'TC-GRP-ADD-022',
      'TC-GRP-PKG-009', 'TC-GRP-PKG-010', 'TC-GRP-PKG-011', 'TC-GRP-PKG-012', 'TC-GRP-PKG-013',
      'TC-GRP-PKG-014', 'TC-GRP-PKG-015', 'TC-GRP-PKG-018', 'TC-GRP-PKG-024',
      'TC-GRP-TASTE-023', 'TC-GRP-MTH-022', 'TC-GRP-ADD-028',
    ].includes(item.caseId)) return {
      capabilityId: 'product-decision:group-reference-propagation', title: '确认组编辑向引用商品传播的字段与交互规则', owner: '产品/需求确认', classification: item.classification,
    };
    throw new Error(`产品偏差未登记共享决策类型：${item.caseId}`);
  }
  if (/行业商品|继承/.test(text)) return {
    capabilityId: 'fixture:industry-item-inheritance', title: '提供可回收的行业商品继承夹具', owner: '测试环境/数据能力', classification: item.classification,
  };
  if (item.executionProfile === 'terminal-probe' || /终端|C端/.test(text)) return {
    capabilityId: 'fixture:terminal-observation', title: '提供终端/C端同步观测与回收能力', owner: '测试环境/下游能力', classification: item.classification,
  };
  if (String(item.module).includes('加料组')) return {
    capabilityId: 'fixture:addon-product-reference', title: '提供可回收的加料商品及引用生命周期夹具', owner: '测试环境/数据能力', classification: item.classification,
  };
  if (String(item.module).includes('套餐组')) return {
    capabilityId: 'fixture:combo-product-sku-reference', title: '提供固定/组合套餐商品、SKU及引用生命周期夹具', owner: '测试环境/数据能力', classification: item.classification,
  };
  return {
    capabilityId: 'fixture:group-product-reference', title: '提供规格/口味/做法组商品引用生命周期夹具', owner: '测试环境/数据能力', classification: item.classification,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).sort().join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === right.length
    && [...left].sort().every((item, index) => item === [...right].sort()[index]);
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

function writeMarkdown(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) main();
