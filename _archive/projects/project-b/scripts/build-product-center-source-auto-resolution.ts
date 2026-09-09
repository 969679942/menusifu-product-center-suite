import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  assessProductCenterSourceRecovery,
  buildProductCenterRecoveredRule,
  type ProductCenterSourceRecoveryRuntimeEvidence,
} from '../adapters/product-center/product-center-source-recovery-adapter';
import { buildProductCenterGroupCaseFingerprintManifest } from '../utils/product-center-group-case-fingerprint';
import { buildSystemTestArtifacts } from '../../../Test Automation Platform/scripts/build-system-test-contract';
import { buildSystemTestCaseImplementationFingerprints } from '../../../Test Automation Platform/scripts/run-system-test';
import { fingerprintSystemTestValue } from '../../../Test Automation Platform/src/automation/system-test/system-test-contract';

type SourceDecision = {
  caseId: string;
  module: string;
  status: 'verified' | 'blocked' | 'not-applicable';
  currentGoalBlocking: boolean;
  sourceFile?: string;
};

type DriftDecision = {
  caseId: string;
  decisionStatus: string;
  evidence?: Array<{ path: string; sha256: string }>;
};

type GroupBinding = {
  caseId: string;
  title: string;
  bindingFingerprint: string;
  handlerId: string | null;
  preconditions?: string[];
  steps?: string[];
  expectedResults?: string[];
  requiredEvidence: string[];
  assertionIds: string[];
  generationAllowed: boolean;
  blockClassification?: string | null;
};

type RemainingBindingDocument = {
  bindings?: GroupBinding[];
};

type RuntimeEvidence = ProductCenterSourceRecoveryRuntimeEvidence & {
  caseId: string;
  handlerId: string;
  requiredEvidence: string[];
  observedEvidence: string[];
  requiredAssertionIds: string[];
  observedAssertionIds: string[];
  complete: boolean;
  missingEvidence: string[];
  missingAssertions: string[];
  unexpectedAssertions: string[];
  applicationVersionFingerprint?: string;
  cleanupDetails?: { entries?: Array<{ phase?: string }> } | null;
};

type SourceRecoveryCandidate = {
  caseId: string;
  sourcePath: string;
  recoveryReason: string;
  businessDomainId?: string;
  implementationImpactType?: 'report-only' | 'platform-only' | 'adapter-only' | 'business-implementation' | 'context-change' | 'unknown-impact';
  implementationImpactReason?: string;
};

type SeasoningPlanCase = {
  caseId: string;
  title: string;
  conditions?: string[];
  actions?: string[];
  expectations?: Array<{ expected: string }>;
};

type CaseAttempt = {
  caseId: string;
  title: string;
  status: string;
  startedAt: string;
  evidencePath: string;
  evidenceSha256: string;
  runtimeEvidence: RuntimeEvidence | null;
};

type PlaywrightSuite = {
  suites?: PlaywrightSuite[];
  specs?: Array<{
    title?: string;
    tags?: string[];
    tests?: Array<{
      annotations?: Array<{ type?: string; description?: string }>;
      status?: string;
      results?: Array<{
        status?: string;
        startTime?: string;
        attachments?: Array<{ name?: string; body?: string }>;
      }>;
    }>;
  }>;
};

export function buildProductCenterSourceAutoResolution(options: {
  projectRoot?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const workspaceRoot = path.resolve(projectRoot, '..');
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const decisions = readJson<{ cases: SourceDecision[] }>(path.join(
    projectRoot,
    'contracts/product-center/reviews/unsupported-source-format-decisions.json',
  )).cases;
  const priorPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-source-auto-resolution.json',
  );
  const priorTrackedIds = fs.existsSync(priorPath)
    ? new Set(readJson<{ cases?: Array<{ caseId: string; disposition: string }> }>(priorPath).cases
      ?.filter((item) => [
        'auto-approved-runtime',
        'automation-repair-required',
        'product-decision-required',
      ].includes(item.disposition))
      .map((item) => item.caseId) ?? [])
    : new Set<string>();
  const groupBindings = readJson<{ cases: GroupBinding[] }>(path.join(
    projectRoot,
    'contracts/product-center/group/product-center-group-bindings.json',
  )).cases;
  const remainingBindings = readJson<RemainingBindingDocument>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-legacy-remaining-automation-bindings.json',
  )).bindings ?? [];
  const recoveryCandidates = readJson<{ cases: SourceRecoveryCandidate[] }>(path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-source-recovery-candidates.json',
  )).cases;
  const recoveryCandidateById = new Map(recoveryCandidates.map((item) => [item.caseId, item]));
  const groupRecoveryBindings = groupBindings.filter((item) => recoveryCandidateById.has(item.caseId));
  const implementationFingerprintByCaseId = new Map(buildProductCenterGroupCaseFingerprintManifest(
    projectRoot,
    groupRecoveryBindings,
    { includeSourceRecovery: true },
  ).cases.map((item) => [item.caseId, item.implementationFingerprint]));
  const seasoningCandidateIds = recoveryCandidates
    .filter((item) => item.businessDomainId === 'product-center-seasoning' || item.caseId.startsWith('TC-FLV-'))
    .map((item) => item.caseId);
  const seasoning = buildSeasoningRecoveryCatalog(projectRoot, seasoningCandidateIds);
  for (const [caseId, fingerprint] of seasoning.implementationFingerprintByCaseId) {
    implementationFingerprintByCaseId.set(caseId, fingerprint);
  }
  const bindings = [...groupBindings, ...remainingBindings, ...seasoning.bindings];
  const driftDecisions = readRuntimeDriftDecisions(projectRoot);
  const resolvedDriftCaseIds = new Set(driftDecisions
    .filter((item) => item.decisionStatus === 'human-confirmed')
    .map((item) => item.caseId));
  const productDecisionCaseIds = new Set(driftDecisions
    .filter((item) => item.decisionStatus === 'evidence-confirmed')
    .map((item) => item.caseId));
  const approvedProductDefectCaseIds = readApprovedProductDefectCaseIds(workspaceRoot);
  const automatedProductDefectCaseIds = readAutomatedProductDefectCaseIds(workspaceRoot, driftDecisions);
  const productDefectCaseIds = new Set([
    ...approvedProductDefectCaseIds,
    ...automatedProductDefectCaseIds,
  ]);
  const bindingByCaseId = new Map(bindings.map((item) => [item.caseId, item]));
  const blocked = decisions.filter((item) => item.status === 'blocked' && item.currentGoalBlocking);
  const candidates = decisions.filter((item) => (
    (item.status === 'blocked' && item.currentGoalBlocking)
      || item.module === 'brand-group'
      || (priorTrackedIds.has(item.caseId) && !resolvedDriftCaseIds.has(item.caseId))
      || productDecisionCaseIds.has(item.caseId)
  ));
  const candidateIds = new Set(candidates.map((item) => item.caseId));
  const attempts = discoverLatestAttempts(path.join(projectRoot, 'output'), candidateIds, workspaceRoot);
  mergeLatestAttempts(
    attempts,
    discoverLatestSystemTestAttempts({
      projectRoot,
      workspaceRoot,
      candidateIds,
      bindingByCaseId,
    }),
  );

  const cases = candidates.map((decision) => {
    const binding = bindingByCaseId.get(decision.caseId);
    const attempt = attempts.get(decision.caseId) ?? null;
    const recoveryCandidate = recoveryCandidateById.get(decision.caseId) ?? null;
    const sourceRecovery = recoveryCandidate && binding
      ? assessProductCenterSourceRecovery({
        sourcePath: recoveryCandidate.sourcePath,
        binding,
        currentImplementationFingerprint: implementationFingerprintByCaseId.get(decision.caseId) ?? null,
        implementationImpactType: recoveryCandidate.implementationImpactType,
        runtimeStatus: attempt?.status ?? null,
        runtimeEvidence: attempt?.runtimeEvidence ?? null,
        businessRuleConflict: productDecisionCaseIds.has(decision.caseId),
      })
      : null;
    const reasons: string[] = [];
    if (sourceRecovery) reasons.push(...sourceRecovery.reasonCodes);
    else {
      if (!binding) reasons.push('AUTOMATION_BINDING_REQUIRED');
      if (!attempt) reasons.push('RUNTIME_AUDIT_REQUIRED');
      if (attempt && attempt.status !== 'passed') {
        if (attempt.status === 'skipped') reasons.push('RUNTIME_NOT_EXECUTED');
        else if (productDefectCaseIds.has(decision.caseId)) reasons.push('PRODUCT_DEFECT_CONFIRMED');
        else if (productDecisionCaseIds.has(decision.caseId)) reasons.push('PRODUCT_DECISION_REQUIRED');
        else reasons.push('AUTOMATION_REPAIR_REQUIRED');
      }
      if (binding && attempt?.status === 'passed') validateRuntimeEvidence(binding, attempt, reasons);
    }
    if (productDefectCaseIds.has(decision.caseId) && productDecisionCaseIds.has(decision.caseId)) {
      for (const reason of ['RUNTIME_AUDIT_REQUIRED', 'RUNTIME_NOT_EXECUTED', 'PRODUCT_DECISION_REQUIRED']) {
        while (reasons.includes(reason)) reasons.splice(reasons.indexOf(reason), 1);
      }
      if (!reasons.includes('PRODUCT_DEFECT_CONFIRMED')) reasons.push('PRODUCT_DEFECT_CONFIRMED');
    }
    const autoApproved = sourceRecovery ? sourceRecovery.promotionAllowed : reasons.length === 0;
    const evidence = attempt ? {
      path: attempt.evidencePath,
      sha256: attempt.evidenceSha256,
      startedAt: attempt.startedAt,
      status: attempt.status,
      applicationVersionFingerprint: attempt.runtimeEvidence?.applicationVersionFingerprint
        ?? attempt.runtimeEvidence?.executionContext?.applicationVersionFingerprint
        ?? null,
    } : null;
    const recoveredRule = autoApproved && sourceRecovery && recoveryCandidate && binding && evidence
      ? buildProductCenterRecoveredRule({
        sourcePath: recoveryCandidate.sourcePath,
        binding,
        assessment: sourceRecovery,
        evidence,
      })
      : null;
    return {
      caseId: decision.caseId,
      module: decision.module,
      disposition: autoApproved
        ? 'auto-approved-runtime'
        : reasons.includes('PRODUCT_DEFECT_CONFIRMED')
          ? 'product-defect-confirmed'
        : sourceRecovery?.humanRequired || reasons.includes('PRODUCT_DECISION_REQUIRED')
          ? 'product-decision-required'
          : reasons.includes('AUTOMATION_REPAIR_REQUIRED')
            ? 'automation-repair-required'
            : 'runtime-audit-required',
      humanRequired: sourceRecovery?.humanRequired ?? reasons.includes('PRODUCT_DECISION_REQUIRED'),
      reasons: [...new Set(reasons)].sort(),
      evidence,
      sourceRecovery,
      recoveredRule,
    };
  }).sort((left, right) => left.caseId.localeCompare(right.caseId));

  const report = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-source-auto-resolution',
    generatedAt,
    policy: {
      policyId: 'runtime-source-auto-resolution-v1',
      automationCodeAsBusinessSourceAllowed: false,
      requirePassedRuntime: true,
      requireExactAssertions: true,
      requireCompleteEvidence: true,
      requireMutationCleanup: true,
      recoveryContract: 'Test Automation Platform/src/automation/system-test/system-test-source-recovery.ts',
      originalRequirementClaimAllowed: false,
      humanRequiredOnlyForBusinessConflict: true,
    },
    summary: {
      evaluated: cases.length,
      currentBlockedAtBuild: blocked.length,
      autoApproved: cases.filter((item) => item.disposition === 'auto-approved-runtime').length,
      runtimeAuditRequired: cases.filter((item) => item.disposition === 'runtime-audit-required').length,
      automationRepairRequired: cases.filter((item) => item.disposition === 'automation-repair-required').length,
      productDecisionRequired: cases.filter((item) => item.disposition === 'product-decision-required').length,
      productDefectConfirmed: cases.filter((item) => item.disposition === 'product-defect-confirmed').length,
      humanRequired: cases.filter((item) => item.humanRequired).length,
    },
    cases,
    recoveredRules: cases.flatMap((item) => item.recoveredRule ? [item.recoveredRule] : []),
  };
  const outputPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-source-auto-resolution.json',
  );
  writeJson(outputPath, report);
  return { report, outputPath };
}

function readApprovedProductDefectCaseIds(workspaceRoot: string): Set<string> {
  const reviewPath = path.join(
    workspaceRoot,
    'deliverables/product-center-source-governance/legacy-assets/商品中心-商品管理-组/2.商品中心-商品管理-组-套餐组V2-32条阻断用例审核.md',
  );
  const markdown = fs.readFileSync(reviewPath, 'utf8');
  const approved = new Set<string>();
  for (const match of markdown.matchAll(/### (TC-[A-Z0-9-]+)[^]*?(?=\r?\n### |$)/g)) {
    const block = match[0];
    if (/- 阻断分类：observed-product-drift/.test(block)
      && /- 人工审核：确定场景正确/.test(block)) {
      approved.add(match[1]);
    }
  }
  return approved;
}

function readRuntimeDriftDecisions(projectRoot: string): DriftDecision[] {
  return [
    'contracts/product-center/group/product-center-group-drift-decisions.json',
    'contracts/product-center/reviews/product-center-runtime-drift-decisions.json',
  ].flatMap((relativePath) => {
    const registryPath = path.join(projectRoot, relativePath);
    if (!fs.existsSync(registryPath)) return [];
    return readJson<{ decisions?: DriftDecision[] }>(registryPath).decisions ?? [];
  });
}

function readAutomatedProductDefectCaseIds(
  workspaceRoot: string,
  decisions: readonly DriftDecision[],
): Set<string> {
  const confirmed = new Set<string>();
  for (const decision of decisions) {
    if (decision.decisionStatus !== 'evidence-confirmed') continue;
    for (const evidence of decision.evidence ?? []) {
      const evidencePath = path.resolve(workspaceRoot, evidence.path);
      if (!fs.existsSync(evidencePath)) continue;
      if (sha256File(evidencePath) !== evidence.sha256.replace(/^sha256:/, '')) continue;
      let document: {
        caseId?: string;
        reconciliation?: { productBehavior?: string };
        cleanupVerifiedZero?: boolean;
      };
      try {
        document = readJson(evidencePath);
      } catch {
        continue;
      }
      if (document.caseId === decision.caseId
        && document.reconciliation?.productBehavior === 'observed-product-drift'
        && document.cleanupVerifiedZero === true) {
        confirmed.add(decision.caseId);
      }
    }
  }
  return confirmed;
}

function validateRuntimeEvidence(binding: GroupBinding, attempt: CaseAttempt, reasons: string[]): void {
  const evidence = attempt.runtimeEvidence;
  if (!evidence) {
    reasons.push('STRUCTURED_RUNTIME_EVIDENCE_REQUIRED');
    return;
  }
  if (attempt.title !== binding.title) reasons.push('CASE_TITLE_MISMATCH');
  if (evidence.caseId !== binding.caseId || evidence.handlerId !== binding.handlerId) {
    reasons.push('RUNTIME_BINDING_MISMATCH');
  }
  if (!/^[a-f0-9]{64}$/i.test(evidence.applicationVersionFingerprint ?? '')) {
    reasons.push('APPLICATION_VERSION_FINGERPRINT_REQUIRED');
  }
  if (!evidence.complete
    || evidence.missingEvidence.length > 0
    || evidence.missingAssertions.length > 0
    || evidence.unexpectedAssertions.length > 0) {
    reasons.push('RUNTIME_EVIDENCE_INCOMPLETE');
  }
  if (!sameSet(evidence.requiredEvidence, binding.requiredEvidence)
    || !sameSet(evidence.observedEvidence, binding.requiredEvidence)) {
    reasons.push('RUNTIME_REQUIRED_EVIDENCE_MISMATCH');
  }
  if (!sameSet(evidence.requiredAssertionIds, binding.assertionIds)
    || !sameSet(evidence.observedAssertionIds, binding.assertionIds)) {
    reasons.push('RUNTIME_ASSERTION_MISMATCH');
  }
  if (binding.requiredEvidence.includes('cleanup')) {
    const entries = evidence.cleanup?.entries ?? evidence.cleanupDetails?.entries ?? [];
    const zeroResidue = evidence.cleanup?.apiZeroResidue === true && evidence.cleanup?.uiZeroResidue === true;
    if (!zeroResidue && (entries.length === 0 || entries.some((item) => item.phase !== 'residue-verified'))) {
      reasons.push('RUNTIME_CLEANUP_INCOMPLETE');
    }
  }
}

function buildSeasoningRecoveryCatalog(
  projectRoot: string,
  candidateIds: readonly string[],
): {
  bindings: GroupBinding[];
  implementationFingerprintByCaseId: Map<string, string>;
} {
  if (candidateIds.length === 0) return { bindings: [], implementationFingerprintByCaseId: new Map() };
  const manifestPath = 'systems/merchant-center-product-center-seasoning/manifest.json';
  const artifacts = buildSystemTestArtifacts({
    rootDir: projectRoot,
    manifestPath,
    caseIds: candidateIds,
    outputDir: path.join(projectRoot, 'deliverables/system-test-platform/source-recovery-compile'),
  });
  if (artifacts.errors.length > 0) {
    throw new Error(`SEASONING_SOURCE_RECOVERY_CONTRACT_INVALID:${artifacts.errors.join(',')}`);
  }
  const planCases = readJson<{ cases: SeasoningPlanCase[] }>(path.join(
    projectRoot,
    'systems/merchant-center-product-center-seasoning/test-plan.json',
  )).cases;
  const planByCaseId = new Map(planCases.map((item) => [item.caseId, item]));
  const bindings = artifacts.contract.cases.map((item): GroupBinding => {
    const planCase = planByCaseId.get(item.caseId);
    if (!planCase) throw new Error(`SEASONING_SOURCE_RECOVERY_CASE_MISSING:${item.caseId}`);
    return {
      caseId: item.caseId,
      title: planCase.title,
      bindingFingerprint: fingerprintSystemTestValue(item),
      handlerId: item.recipeId,
      preconditions: [...(planCase.conditions ?? [])],
      steps: [...(planCase.actions ?? [])],
      expectedResults: (planCase.expectations ?? []).map((expectation) => expectation.expected),
      requiredEvidence: [
        'operation-receipt',
        'assertion-receipt',
        ...(item.mutationMode === 'none' ? [] : ['cleanup']),
      ],
      assertionIds: item.expectationClaims.map((claim) => claim.claimId),
      generationAllowed: true,
      blockClassification: null,
    };
  });
  const implementationFingerprints = buildSystemTestCaseImplementationFingerprints(
    artifacts,
    path.resolve(projectRoot, '../../Test Automation Platform/scripts/run-system-test.ts'),
  );
  return {
    bindings,
    implementationFingerprintByCaseId: new Map(Object.entries(implementationFingerprints)),
  };
}

function discoverLatestSystemTestAttempts(input: {
  projectRoot: string;
  workspaceRoot: string;
  candidateIds: ReadonlySet<string>;
  bindingByCaseId: ReadonlyMap<string, GroupBinding>;
}): Map<string, CaseAttempt> {
  const systemRoot = path.join(
    input.projectRoot,
    'output/system-test/merchant-center-product-center-seasoning',
  );
  if (!fs.existsSync(systemRoot)) return new Map();
  const attempts: CaseAttempt[] = [];
  for (const entry of fs.readdirSync(systemRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const ledgerPath = path.join(systemRoot, entry.name, 'evidence-ledger.json');
    if (!fs.existsSync(ledgerPath)) continue;
    let ledger: {
      generatedAt?: string;
      cases?: Array<{
        receiptVersion?: string;
        caseId?: string;
        caseFingerprint?: string;
        implementationFingerprint?: string;
        executionContext?: ProductCenterSourceRecoveryRuntimeEvidence['executionContext'];
        playwrightStatus?: string;
        runtimeEvidence?: {
          assertionReceipts?: Array<{ claimId?: string; status?: string }>;
          operationReceipts?: NonNullable<ProductCenterSourceRecoveryRuntimeEvidence['operationReceipts']>;
          cleanup?: unknown;
        };
        evidence?: {
          status?: string;
          missingClaimIds?: string[];
          duplicateClaimIds?: string[];
          mismatchedClaimIds?: string[];
          apiZeroResidue?: boolean;
          uiZeroResidue?: boolean;
        };
        auditCompleteness?: {
          status?: 'complete' | 'incomplete' | 'excluded';
          missing?: string[];
        };
      }>;
    };
    try {
      ledger = readJson(ledgerPath);
    } catch {
      continue;
    }
    for (const item of ledger.cases ?? []) {
      const caseId = item.caseId;
      if (!caseId || !input.candidateIds.has(caseId)) continue;
      const binding = input.bindingByCaseId.get(caseId);
      if (!binding) continue;
      const assertionReceipts = item.runtimeEvidence?.assertionReceipts ?? [];
      const observedAssertionIds = assertionReceipts
        .filter((receipt) => receipt.status === 'verified' || receipt.status === 'observed-mismatch')
        .flatMap((receipt) => receipt.claimId ? [receipt.claimId] : []);
      const verifiedAssertionIds = assertionReceipts
        .filter((receipt) => receipt.status === 'verified')
        .flatMap((receipt) => receipt.claimId ? [receipt.claimId] : []);
      const auditComplete = item.auditCompleteness?.status === 'complete'
        || item.auditCompleteness?.status === 'excluded';
      const evidenceComplete = item.evidence?.status === 'complete' && auditComplete;
      const runtimeEvidence: RuntimeEvidence = {
        receiptVersion: item.receiptVersion ?? null,
        caseId,
        caseFingerprint: item.caseFingerprint ?? null,
        implementationFingerprint: item.implementationFingerprint ?? null,
        executionContext: item.executionContext ?? null,
        claims: {
          required: [...binding.assertionIds],
          observed: observedAssertionIds,
          verified: verifiedAssertionIds,
        },
        handlerId: binding.handlerId ?? '',
        requiredEvidence: [...binding.requiredEvidence],
        observedEvidence: evidenceComplete ? [...binding.requiredEvidence] : [],
        requiredAssertionIds: [...binding.assertionIds],
        observedAssertionIds,
        operationReceipts: item.runtimeEvidence?.operationReceipts ?? [],
        declaredOperations: item.runtimeEvidence?.operationReceipts ?? [],
        complete: evidenceComplete,
        missingEvidence: evidenceComplete ? [] : [
          item.evidence?.status === 'complete' ? 'audit-completeness' : 'standard-evidence',
        ],
        missingAssertions: item.evidence?.missingClaimIds ?? [],
        unexpectedAssertions: [
          ...(item.evidence?.duplicateClaimIds ?? []),
          ...(item.evidence?.mismatchedClaimIds ?? []),
        ],
        cleanup: {
          apiZeroResidue: item.evidence?.apiZeroResidue === true,
          uiZeroResidue: item.evidence?.uiZeroResidue === true,
        },
        applicationVersionFingerprint: item.executionContext?.applicationVersionFingerprint ?? undefined,
      };
      attempts.push({
        caseId,
        title: binding.title,
        status: item.playwrightStatus ?? 'unknown',
        startedAt: ledger.generatedAt ?? '',
        evidencePath: relativeWorkspace(input.workspaceRoot, ledgerPath),
        evidenceSha256: sha256File(ledgerPath),
        runtimeEvidence,
      });
    }
  }
  const latest = new Map<string, CaseAttempt>();
  for (const attempt of attempts.sort((left, right) => left.startedAt.localeCompare(right.startedAt))) {
    latest.set(attempt.caseId, attempt);
  }
  return latest;
}

function mergeLatestAttempts(target: Map<string, CaseAttempt>, source: ReadonlyMap<string, CaseAttempt>): void {
  for (const [caseId, candidate] of source) {
    const current = target.get(caseId);
    if (!current || candidate.startedAt >= current.startedAt) target.set(caseId, candidate);
  }
}

export function discoverLatestAttempts(
  outputRoot: string,
  blockedIds: ReadonlySet<string>,
  workspaceRoot: string,
): Map<string, CaseAttempt> {
  const attempts: CaseAttempt[] = [];
  for (const entry of fs.readdirSync(outputRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const reportPath = path.join(outputRoot, entry.name);
    let report: { suites?: PlaywrightSuite[]; stats?: { startTime?: string } };
    try {
      report = readJson(reportPath);
    } catch {
      continue;
    }
    if (!report.suites) continue;
    for (const spec of flattenSpecs(report.suites)) {
      const test = spec.tests?.[0];
      const caseId = resolveCaseId(spec.tags, test?.annotations);
      if (!caseId || !blockedIds.has(caseId)) continue;
      const result = [...(test?.results ?? [])]
        .sort((left, right) => String(left.startTime ?? '').localeCompare(String(right.startTime ?? '')))
        .at(-1);
      const status = result?.status ?? test?.status ?? 'unknown';
      if (status === 'skipped') continue;
      const attachment = result?.attachments?.find((item) => item.name === 'product-center-group-runtime-evidence');
      attempts.push({
        caseId,
        title: spec.title ?? caseId,
        status,
        startedAt: result?.startTime ?? report.stats?.startTime ?? '',
        evidencePath: relativeWorkspace(workspaceRoot, reportPath),
        evidenceSha256: sha256File(reportPath),
        runtimeEvidence: decodeRuntimeEvidence(attachment?.body),
      });
    }
  }
  const latest = new Map<string, CaseAttempt>();
  for (const attempt of attempts.sort((left, right) => left.startedAt.localeCompare(right.startedAt))) {
    latest.set(attempt.caseId, attempt);
  }
  return latest;
}

function flattenSpecs(suites: PlaywrightSuite[]): NonNullable<PlaywrightSuite['specs']> {
  return suites.flatMap((suite) => [
    ...(suite.specs ?? []),
    ...flattenSpecs(suite.suites ?? []),
  ]);
}

function resolveCaseId(
  tags: string[] | undefined,
  annotations: Array<{ type?: string; description?: string }> | undefined,
): string | null {
  const tag = tags?.find((item) => item.startsWith('case-'));
  if (tag) return tag.slice('case-'.length);
  return annotations?.find((item) => item.type === 'group-case-id')?.description ?? null;
}

function decodeRuntimeEvidence(body?: string): RuntimeEvidence | null {
  if (!body) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64').toString('utf8')) as RuntimeEvidence;
  } catch {
    return null;
  }
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return [...new Set(left)].sort().join('\n') === [...new Set(right)].sort().join('\n');
}

function relativeWorkspace(workspaceRoot: string, filePath: string): string {
  return path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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
  const result = buildProductCenterSourceAutoResolution();
  process.stdout.write(`${JSON.stringify(result.report.summary)}\n`);
}
