import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeReleaseObservation,
  releaseObservationAllowsReuse,
  type ReleaseObservation,
  type TestApplicabilityStatus,
  type TestEvidenceStatus,
} from '../utils/test-execution-state';
import type { SystemTestResponsibilityClass } from '../automation/system-test/system-test-reference-baseline';
import { resolveSystemTestPlatformArtifact } from '../utils/system-test-platform-paths';

type LandingCase = {
  caseId: string;
  title: string;
  status: 'passed' | 'handled' | 'ready' | 'deferred' | 'not-applicable' | 'product-defect' | 'blocked-source' | 'blocked-technical' | 'invalid';
  disposition: string;
  automationBound: boolean;
  caseFingerprint: string | null;
  implementationFingerprint?: string | null;
  implementationFingerprintRequired?: boolean;
  reasons: string[];
  applicabilityStatus: TestApplicabilityStatus | null;
  reuseStatus: string | null;
  executionReceipt: { status: string; evidenceStatus?: TestEvidenceStatus } | null;
  historicalExecution?: {
    status: string;
    evidenceRefs: string[];
    handlingStatus?: 'handled' | 'unhandled';
    verificationStatus?: 'current-verified' | 'legacy-verified' | 'invalid-reference' | 'not-verified';
    handlingEvidence?: string | null;
  } | null;
  historicalEvidenceRefs?: string[];
  arbitration?: {
    staleProductDefect: boolean;
    staleReceipts: number;
    handlingStatus?: 'handled' | 'unhandled';
    verificationStatus?: 'current-verified' | 'legacy-verified' | 'not-verified';
    actionRequired?: boolean;
  };
};

type LandingReport = {
  generatedAt: string;
  currentApplicationVersionFingerprint?: string | null;
  changeObservation?: Partial<ReleaseObservation> | null;
  assetIndex: { completed: number; unlanded: number };
  modules: Array<{
    module: string;
    assessment: { planId: string; summary: Record<string, number>; cases: LandingCase[] };
  }>;
};

type ExecutionIndex = {
  records: Array<{
    caseId: string;
    applicationVersionFingerprint?: string | null;
    releaseObservation?: Partial<ReleaseObservation> | null;
    caseFingerprint: string;
    implementationFingerprint?: string | null;
    executionContextFingerprint?: string | null;
    status: string;
    evidenceStatus?: TestEvidenceStatus;
    runId: string;
    recordedAt: string;
    evidencePath?: string | null;
  }>;
};

type SourceExecutionPlan = { execution: { selectedCaseIds: string[] } };

type HistoricalEvidenceReconciliationSummary = {
  generatedAt: string;
  checkpointKey: string;
  summary: {
    total: number;
    reconciliationRequired: number;
    legacyEvidenceFound: number;
    backfillBlocked: number;
    standardReceiptBackfilled: number;
    noEvidenceSource: number;
    alreadyReconciled: number;
    rerunCandidates: number;
  };
  rerunCandidateCaseIds?: string[];
};

type BusinessRuleChangeTrigger = {
  status: 'unchanged' | 'changed' | 'baseline-incomplete';
  changedRuleIds: string[];
  affectedRuleIds: string[];
  affectedCaseIds: string[];
  rerunCaseIds: string[];
  diagnostics: string[];
};

type DocumentRuleEvidenceRecoveryPlan = {
  sourcePreflightFingerprint: string;
  summary: {
    structuralGapRules: number;
    executionEligibilityGapRules: number;
  };
  rulePlans: Array<{ ruleId: string; disposition: string }>;
  caseAssessments: Array<{
    caseId: string;
    landingStatus: string | null;
    currentIdentity: { caseFingerprint: string | null; implementationFingerprint: string | null } | null;
  }>;
  minimalRevalidationCaseIds: string[];
  minimalCoverProof: {
    complete: boolean;
    irreducible: boolean;
    uncoveredObligationIds: string[];
    redundantSelectedCaseIds: string[];
    selectedCases?: Array<{ caseId: string; coveredObligationIds: string[] }>;
  };
};

type DocumentRulePromotionDecision = {
  sourcePreflightFingerprint: string;
  status: 'approved' | 'partial' | 'rejected';
  approvedRuleIds: string[];
  revokedRuleIds?: string[];
  approvedRules?: Array<{
    ruleId: string;
    statement: string;
    effectiveVersion: string;
    linkedCaseIds: string[];
    revalidationCaseIds?: string[];
    verificationStatus: 'verified' | 'pending-review' | 'revalidation-required';
  }>;
};

export type ClosureEvidenceState =
  | 'evidence-passed'
  | 'handled'
  | 'change-revalidation-required'
  | 'evidence-reconciliation-required'
  | 'evidence-revalidation-required'
  | 'deferred'
  | 'not-applicable'
  | 'blocked'
  | 'invalid';

export type ClosureAuditCase = {
  caseId: string;
  module: string;
  title: string;
  state: ClosureEvidenceState;
  responsibilityClass: SystemTestResponsibilityClass;
  automationBound: boolean;
  currentCaseFingerprint: string | null;
  currentImplementationFingerprint: string | null;
  implementationFingerprintRequired?: boolean;
  matchingCompleteReceipts: number;
  latestHistoricalReceiptAt: string | null;
  applicabilityStatus: TestApplicabilityStatus | null;
  reuseStatus: string | null;
  historicalEvidenceRefs: string[];
  reasons: string[];
  handlingStatus?: 'handled' | 'unhandled';
  verificationStatus?: 'current-verified' | 'legacy-verified' | 'invalid-reference' | 'not-verified';
  actionRequired?: boolean;
};

export function buildProductCenterClosureAudit(input: {
  landingReport: LandingReport;
  executionIndex: ExecutionIndex;
  executionEligibleCaseIds?: readonly string[];
  businessRuleRerunCaseIds?: readonly string[];
  /** Cases that have already produced a current complete receipt after the
   * targeted rule revalidation. Kept explicit so generic contract fixtures
   * without this signal retain the conservative invalidation behavior. */
  businessRuleSatisfiedCaseIds?: readonly string[];
  businessRuleAffectedCaseIds?: readonly string[];
  businessRuleChangedRuleIds?: readonly string[];
  historicalEvidenceReconciliation?: HistoricalEvidenceReconciliationSummary | null;
  generatedAt?: string;
}) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const businessRuleRerunCaseIds = new Set(
    (input.businessRuleRerunCaseIds ?? []).map((caseId) => caseId.trim()).filter(Boolean),
  );
  const businessRuleSatisfiedCaseIds = new Set(
    (input.businessRuleSatisfiedCaseIds ?? []).map((caseId) => caseId.trim()).filter(Boolean),
  );
  const businessRuleAffectedCaseIds = new Set(
    (input.businessRuleAffectedCaseIds ?? []).map((caseId) => caseId.trim()).filter(Boolean),
  );
  const recordsByCase = new Map<string, ExecutionIndex['records']>();
  for (const record of input.executionIndex.records) {
    const records = recordsByCase.get(record.caseId) ?? [];
    records.push(record);
    recordsByCase.set(record.caseId, records);
  }
  const cases = input.landingReport.modules.flatMap((module) => module.assessment.cases.map((item) => {
    const completeReceipts = (recordsByCase.get(item.caseId) ?? [])
      .filter((record) => record.status === 'passed'
        && record.evidenceStatus === 'complete'
        && record.caseFingerprint === item.caseFingerprint
        && (!item.implementationFingerprintRequired || !item.implementationFingerprint
          || record.implementationFingerprint === item.implementationFingerprint))
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
    const latestCompleteReceipt = completeReceipts.at(-1);
    const historicalEvidenceRefs = [...new Set([
      ...(item.historicalExecution?.evidenceRefs ?? []),
      ...((recordsByCase.get(item.caseId) ?? []).flatMap((record) => record.evidencePath ? [record.evidencePath] : [])),
    ])].sort();
    const matchingHistoricalPass = !item.implementationFingerprintRequired && ((recordsByCase.get(item.caseId) ?? []).some((record) => (
      record.status === 'passed' && record.caseFingerprint === item.caseFingerprint
    )) || item.historicalExecution?.status === 'runtime-passed');
    const receiptRelease = latestCompleteReceipt
      ? normalizeReleaseObservation({
        releaseObservation: latestCompleteReceipt.releaseObservation,
        applicationVersionFingerprint: latestCompleteReceipt.applicationVersionFingerprint,
        observedAt: latestCompleteReceipt.recordedAt,
      })
      : null;
    const currentRelease = normalizeReleaseObservation({
      releaseObservation: input.landingReport.changeObservation,
      applicationVersionFingerprint: input.landingReport.currentApplicationVersionFingerprint,
    });
    const releaseChangeObserved = Boolean(
      releaseObservationAllowsReuse(currentRelease)
      && receiptRelease
      && releaseObservationAllowsReuse(receiptRelease)
      && currentRelease.fingerprint !== receiptRelease.fingerprint,
    );
    const businessRuleRevalidationRequired = businessRuleRerunCaseIds.has(item.caseId);
    let state: ClosureEvidenceState;
    if (item.status === 'deferred') state = 'deferred';
    else if (item.status === 'not-applicable') state = 'not-applicable';
    else if (item.status === 'handled') state = 'handled';
    else if (['product-defect', 'blocked-source', 'blocked-technical'].includes(item.status)) state = 'blocked';
    else if (item.status === 'invalid' || !item.automationBound || !item.caseFingerprint) state = 'invalid';
    // A rule change requires a targeted rerun only until a complete receipt
    // matching the current case fingerprint (and implementation fingerprint
    // when required) is accepted.  Do not keep reopening a case after that
    // rerun has produced the authoritative current receipt.
    else if (businessRuleRevalidationRequired && !businessRuleSatisfiedCaseIds.has(item.caseId)) state = 'change-revalidation-required';
    else if (releaseChangeObserved) state = 'change-revalidation-required';
    else if (completeReceipts.length > 0) state = 'evidence-passed';
    else if (item.arbitration?.handlingStatus === 'handled' && item.arbitration.actionRequired === false) state = 'handled';
    else if (matchingHistoricalPass) state = 'evidence-reconciliation-required';
    else state = 'evidence-revalidation-required';
    const responsibilityClass = item.arbitration?.handlingStatus === 'handled'
      && item.arbitration.actionRequired === false
      ? 'handled'
      : resolveResponsibilityClass(item.status, state);
    return {
      caseId: item.caseId,
      module: module.module,
      title: item.title,
      state,
      responsibilityClass,
      automationBound: item.automationBound,
      currentCaseFingerprint: item.caseFingerprint,
      currentImplementationFingerprint: item.implementationFingerprint ?? null,
      implementationFingerprintRequired: item.implementationFingerprintRequired,
      matchingCompleteReceipts: completeReceipts.length,
      latestHistoricalReceiptAt: completeReceipts.at(-1)?.recordedAt ?? null,
      applicabilityStatus: item.applicabilityStatus,
      reuseStatus: item.reuseStatus,
      historicalEvidenceRefs,
      handlingStatus: item.arbitration?.handlingStatus,
      verificationStatus: item.arbitration?.verificationStatus
        ?? item.historicalExecution?.verificationStatus,
      actionRequired: item.arbitration?.actionRequired,
      reasons: businessRuleRevalidationRequired && !businessRuleSatisfiedCaseIds.has(item.caseId)
        ? ['已确认业务规则语义变化，旧执行收据仅保留为历史证据。']
        : item.reasons.length > 0 ? [...item.reasons] : state === 'change-revalidation-required'
        ? ['已观测到发布身份变化，需要按影响范围重新验证。']
        : state === 'evidence-reconciliation-required'
          ? item.arbitration?.handlingStatus === 'handled'
            ? ['该用例已有逐条整改处理证据；不重复执行，仅需在标准收据迁移时补齐记录。']
            : ['存在历史通过记录或证据引用；必须先尝试补录标准收据，不能直接安排页面重跑。']
        : state === 'evidence-revalidation-required'
          ? ['缺少当前用例指纹匹配且证据完整的执行收据；发布身份不是阻断原因。']
          : [],
    } satisfies ClosureAuditCase;
  }));
  const counts = cases.reduce<Record<ClosureEvidenceState, number>>((result, item) => {
    result[item.state] += 1;
    return result;
  }, {
    'evidence-passed': 0,
    handled: 0,
    'change-revalidation-required': 0,
    'evidence-reconciliation-required': 0,
    'evidence-revalidation-required': 0,
    deferred: 0,
    'not-applicable': 0,
    blocked: 0,
    invalid: 0,
  });
  const total = cases.length;
  if (Object.values(counts).reduce((sum, count) => sum + count, 0) !== total) {
    throw new Error('商品中心闭环审计分类不守恒');
  }
  const needsRevalidationCaseIds = cases
    .filter((item) => item.state === 'change-revalidation-required' || item.state === 'evidence-revalidation-required')
    .map((item) => item.caseId)
    .sort();
  const actionRequiredByCaseId = new Map(cases.map((item) => [item.caseId, item.actionRequired !== false]));
  const migratedRerunCandidateCaseIds = (input.historicalEvidenceReconciliation?.rerunCandidateCaseIds ?? [])
    .filter((caseId) => actionRequiredByCaseId.get(caseId) !== false);
  const revalidationCandidateCaseIds = [...new Set([
    ...needsRevalidationCaseIds,
    ...migratedRerunCandidateCaseIds,
  ])].sort();
  // Rule changes also affect cases represented only by historical or handled
  // projections. They need a fresh receipt before the new rule is promoted.
  const businessRuleCandidateCaseIds = cases
    .filter((item) => businessRuleAffectedCaseIds.has(item.caseId))
    // Keep only affected cases that still lack a current complete receipt.
    // Once the targeted rerun is accepted, its receipt is authoritative and
    // must remove the case from the candidate list even if the rule-change
    // trigger remains present until the next baseline build.
    .filter((item) => !['deferred', 'not-applicable', 'blocked', 'invalid'].includes(item.state))
    .filter((item) => !businessRuleSatisfiedCaseIds.has(item.caseId))
    .map((item) => item.caseId);
  const businessRuleScopedSelection = (input.businessRuleChangedRuleIds ?? []).length > 0;
  const allCandidateCaseIds = businessRuleScopedSelection
    ? [...new Set(businessRuleCandidateCaseIds)].sort()
    : [...new Set([
      ...revalidationCandidateCaseIds,
      ...businessRuleCandidateCaseIds,
    ])].sort();
  const executionEligibleCaseIds = new Set(input.executionEligibleCaseIds ?? revalidationCandidateCaseIds);
  const recommendedCaseIds = allCandidateCaseIds.filter((caseId) => executionEligibleCaseIds.has(caseId));
  const unavailableCaseIds = allCandidateCaseIds.filter((caseId) => !executionEligibleCaseIds.has(caseId));
  const evidenceReconciliationCaseIds = cases
    .filter((item) => item.state === 'evidence-reconciliation-required')
    .map((item) => item.caseId)
    .sort();
  const handledCaseIds = cases
    .filter((item) => item.state === 'handled')
    .map((item) => item.caseId)
    .sort();
  const changeObservation = input.landingReport.changeObservation ?? {
    status: input.landingReport.currentApplicationVersionFingerprint ? 'verified' : 'unavailable',
    fingerprint: input.landingReport.currentApplicationVersionFingerprint ?? null,
    source: input.landingReport.currentApplicationVersionFingerprint ? 'legacy-application-version' : 'unavailable',
    stable: Boolean(input.landingReport.currentApplicationVersionFingerprint),
    observedAt: null,
  };
  const historicalEvidenceReconciliation = input.historicalEvidenceReconciliation ?? null;
  const targetedRuntimeAuditRequired = counts['change-revalidation-required'] > 0
    || businessRuleCandidateCaseIds.length > 0;
  return {
    schemaVersion: '2.0.0' as const,
    collectionId: 'product-center-closure-audit',
    generatedAt,
    evidencePolicy: {
      screenshotAloneCannotPass: true,
      executionPassRequiresReleaseIdentity: false,
      releaseIdentityControlsAutomaticReuseOnly: true,
      dateOrConversationCannotInvalidateResult: true,
      automaticRerun: false,
    },
    source: {
      landingAuditGeneratedAt: input.landingReport.generatedAt,
      changeObservation,
      assetIndex: input.landingReport.assetIndex,
      executionEligibleCaseCount: executionEligibleCaseIds.size,
      businessRuleRerunCaseCount: businessRuleRerunCaseIds.size,
      businessRuleAffectedCaseCount: businessRuleAffectedCaseIds.size,
      businessRuleChangedRuleIds: [...new Set(input.businessRuleChangedRuleIds ?? [])].sort(),
      historicalEvidenceReconciliation,
      migratedRerunCandidateCaseCount: migratedRerunCandidateCaseIds.length,
    },
    diagnostics: changeObservation.status === 'unavailable'
      ? ['未采集到发布身份：不影响证据完整的本次通过；仅禁止无依据地自动声明系统当前未变化。']
      : [],
    summary: { total, ...counts },
    auditDecision: {
      staticAudit: 'completed' as const,
      historicalEvidenceInspection: historicalEvidenceReconciliation ? 'completed' as const : 'pending' as const,
      targetedRuntimeAudit: targetedRuntimeAuditRequired ? 'required' as const : 'not-triggered' as const,
      automationValidation: recommendedCaseIds.length > 0 ? 'approval-required' as const : 'not-required' as const,
      reasons: [
        historicalEvidenceReconciliation
          ? `历史证据协调已完成：${historicalEvidenceReconciliation.summary.backfillBlocked} 条需旧收据适配，${historicalEvidenceReconciliation.summary.rerunCandidates} 条可进入重跑审批。`
          : '历史证据协调尚未执行。',
        targetedRuntimeAuditRequired
          ? `存在 ${counts['change-revalidation-required']} 条发布变化影响及 ${businessRuleCandidateCaseIds.length} 条业务规则影响用例，需定向运行时审计。`
          : '未发现已观测发布变化触发的运行时重审；发布身份不可用本身不触发重审。',
        recommendedCaseIds.length > 0
          ? `${recommendedCaseIds.length} 条缺少完整执行证据，可在明确批准后做自动化验证；这不是页面业务审计。`
          : '当前没有待批准的自动化验证候选。',
      ],
    },
    incrementalSelection: {
      status: 'pending-explicit-execution',
      recommendedCaseIds,
      unavailableCaseIds,
      evidenceReconciliationCaseIds,
      handledCaseIds,
      approvedCaseIds: [],
      note: businessRuleScopedSelection
        ? '当前存在已确认业务规则变化，本次只推荐该规则影响范围内的用例；其他历史证据候选保留在审计中，不随本次规则验证执行。'
        : '历史通过先补录标准收据，不进入页面执行候选；只选择无可协调证据或已确认变化影响的用例。日期、对话框和发布身份缺失不会单独触发重跑。',
    },
    cases: cases.sort((left, right) => left.caseId.localeCompare(right.caseId)),
  };
}

function resolveResponsibilityClass(
  status: LandingCase['status'],
  state: ClosureEvidenceState,
): SystemTestResponsibilityClass {
  if (status === 'product-defect') return 'product-defect';
  if (status === 'handled') return 'handled';
  if (status === 'blocked-source') return 'source-blocked';
  if (status === 'blocked-technical') return 'technical-blocked';
  if (state === 'evidence-passed') return 'passed';
  if (state === 'handled') return 'handled';
  if (state === 'deferred') return 'deferred';
  if (state === 'not-applicable') return 'not-applicable';
  if (state === 'invalid') return 'invalid';
  return 'revalidation-required';
}

function main(): void {
  const projectRoot = path.resolve(__dirname, '..');
  const workspaceRoot = path.resolve(projectRoot, '..');
  const governanceRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
  const landingInputBaseName = process.env.PC_LANDING_INPUT_BASENAME?.trim()
    || 'product-center-item-group-landing-audit';
  const closureOutputBaseName = process.env.PC_CLOSURE_OUTPUT_BASENAME?.trim()
    || 'product-center-closure-audit';
  const selectionOutputBaseName = process.env.PC_SELECTION_OUTPUT_BASENAME?.trim()
    || 'product-center-incremental-selection';
  const businessRuleChangeTrigger = readJson<BusinessRuleChangeTrigger>(path.join(
    projectRoot,
    'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
  ));
  const documentRuleRecovery = readApprovedDocumentRuleRecovery(governanceRoot);
  const documentRuleCaseIds = documentRuleRecovery?.minimalRevalidationCaseIds ?? [];
  const documentRuleIds = documentRuleRecovery?.rulePlans
    .filter((item) => item.disposition === 'minimal-revalidation-required')
    .map((item) => item.ruleId) ?? [];
  const sourceExecutionCaseIds = readJson<SourceExecutionPlan>(
    path.join(workspaceRoot, 'deliverables/product-center-source-governance/execution-plan.json'),
  ).execution.selectedCaseIds;
  const executionIndex = readJson<ExecutionIndex>(resolveSystemTestPlatformArtifact('execution-index.json'));
  const landingReport = readJson<LandingReport>(path.join(governanceRoot, `${landingInputBaseName}.json`));
  const landingCases = new Map(landingReport.modules.flatMap((module) => module.assessment.cases)
    .map((item) => [item.caseId, item]));
  const businessRuleSatisfiedCaseIds = [...new Set(executionIndex.records
    .filter((record) => record.status === 'passed' && record.evidenceStatus === 'complete')
    .filter((record) => sourceExecutionCaseIds.includes(record.caseId))
    .filter((record) => record.caseFingerprint === landingCases.get(record.caseId)?.caseFingerprint)
    .filter((record) => record.implementationFingerprint === landingCases.get(record.caseId)?.implementationFingerprint)
    .filter((record) => Boolean(record.executionContextFingerprint?.match(/^[a-f0-9]{64}$/)))
    .map((record) => record.caseId))];
  const report = buildProductCenterClosureAudit({
    landingReport,
    executionIndex,
    executionEligibleCaseIds: [...new Set([...sourceExecutionCaseIds, ...documentRuleCaseIds])],
    businessRuleRerunCaseIds: [...new Set([...businessRuleChangeTrigger.rerunCaseIds, ...documentRuleCaseIds])],
    businessRuleAffectedCaseIds: [...new Set([...businessRuleChangeTrigger.affectedCaseIds, ...documentRuleCaseIds])],
    businessRuleChangedRuleIds: [...new Set([...businessRuleChangeTrigger.changedRuleIds, ...documentRuleIds])],
    businessRuleSatisfiedCaseIds,
    historicalEvidenceReconciliation: process.env.PC_IGNORE_HISTORICAL_RECONCILIATION !== 'true' && fs.existsSync(
      path.join(governanceRoot, 'product-center-historical-evidence-reconciliation.json'),
    )
      ? readJson<HistoricalEvidenceReconciliationSummary>(
        path.join(governanceRoot, 'product-center-historical-evidence-reconciliation.json'),
      )
    : null,
  });
  const unavailableDocumentRuleCaseIds = documentRuleCaseIds.filter((caseId) => !landingCases.has(caseId));
  report.incrementalSelection.unavailableCaseIds = [...new Set([
    ...report.incrementalSelection.unavailableCaseIds,
    ...unavailableDocumentRuleCaseIds,
  ])].sort();
  if (unavailableDocumentRuleCaseIds.length > 0) {
    report.diagnostics.push(`文档规则用例尚未接入当前执行清单：${unavailableDocumentRuleCaseIds.join(',')}`);
  }
  if (businessRuleChangeTrigger.status === 'baseline-incomplete') {
    report.diagnostics.push(
      `业务规则重验被基线阻断：${businessRuleChangeTrigger.diagnostics.join(',')}`,
    );
    report.auditDecision.targetedRuntimeAudit = 'required';
    report.auditDecision.automationValidation = 'approval-required';
    report.incrementalSelection.status = 'blocked-by-business-rule-baseline';
    report.incrementalSelection.note = `${report.incrementalSelection.note} 当前规则基线不完整，禁止自动推导受影响用例；需先补齐基线并重新审计。`;
  }
  writeJson(path.join(governanceRoot, `${closureOutputBaseName}.json`), report);
  writeJson(path.join(governanceRoot, `${selectionOutputBaseName}.json`), report.incrementalSelection);
  writeText(path.join(governanceRoot, `${closureOutputBaseName}.md`), renderMarkdown(report));
  process.stdout.write(`${JSON.stringify(report.summary)}\n`);
}

function readCurrentDocumentRuleRecovery(governanceRoot: string): DocumentRuleEvidenceRecoveryPlan | null {
  const recoveryPath = path.join(governanceRoot, 'product-center-document-rule-evidence-recovery-plan.json');
  const preflightPath = path.join(governanceRoot, 'product-center-document-rule-batch-preflight.json');
  if (!fs.existsSync(recoveryPath) || !fs.existsSync(preflightPath)) return null;
  const recovery = readJson<DocumentRuleEvidenceRecoveryPlan>(recoveryPath);
  const preflight = readJson<{ fingerprint?: string }>(preflightPath);
  if (!preflight.fingerprint || recovery.sourcePreflightFingerprint !== preflight.fingerprint) return null;
  if (recovery.summary.structuralGapRules !== 0
    || recovery.summary.executionEligibilityGapRules !== 0
    || recovery.minimalCoverProof.complete !== true
    || recovery.minimalCoverProof.irreducible !== true
    || recovery.minimalCoverProof.uncoveredObligationIds.length > 0
    || recovery.minimalCoverProof.redundantSelectedCaseIds.length > 0) return null;
  const assessments = new Map(recovery.caseAssessments.map((item) => [item.caseId, item]));
  const invalidCaseIds = recovery.minimalRevalidationCaseIds.filter((caseId) => {
    const assessment = assessments.get(caseId);
    return !assessment?.currentIdentity?.caseFingerprint
      || !assessment.currentIdentity.implementationFingerprint
      || !['passed', 'ready'].includes(assessment.landingStatus ?? '');
  });
  if (invalidCaseIds.length > 0) {
    throw new Error(`文档规则重验计划包含当前不可执行用例：${invalidCaseIds.join(',')}`);
  }
  return recovery;
}

function readApprovedDocumentRuleRecovery(governanceRoot: string): DocumentRuleEvidenceRecoveryPlan | null {
  const recovery = readCurrentDocumentRuleRecovery(governanceRoot);
  if (!recovery) return null;
  const decisionPath = path.join(governanceRoot, 'product-center-document-rule-promotion-decisions.json');
  if (!fs.existsSync(decisionPath)) return null;
  const decision = readJson<DocumentRulePromotionDecision>(decisionPath);
  assertApprovedRulesMatchCurrentLifecycle(governanceRoot, decision);
  const revoked = new Set(decision.revokedRuleIds ?? []);
  const approvedRuleIds = new Set(decision.approvedRuleIds.filter((ruleId) => !revoked.has(ruleId)));
  if (decision.status === 'rejected' || approvedRuleIds.size === 0) return null;
  const selectedCases = recovery.minimalCoverProof.selectedCases ?? [];
  const approvedCaseIds = new Set(selectedCases
    .filter((item) => item.coveredObligationIds.some((obligationId) => approvedRuleIds.has(obligationId.split(':O')[0])))
    .map((item) => item.caseId));
  const recoveredRuleIds = new Set(recovery.rulePlans.map((item) => item.ruleId));
  const directRevalidationRules = (decision.approvedRules ?? [])
    .filter((rule) => approvedRuleIds.has(rule.ruleId))
    .filter((rule) => rule.verificationStatus !== 'verified')
    .filter((rule) => !recoveredRuleIds.has(rule.ruleId));
  return {
    ...recovery,
    rulePlans: [
      ...recovery.rulePlans.filter((item) => approvedRuleIds.has(item.ruleId)),
      ...directRevalidationRules.map((rule) => ({ ruleId: rule.ruleId, disposition: 'minimal-revalidation-required' })),
    ],
    minimalRevalidationCaseIds: [...new Set([
      ...recovery.minimalRevalidationCaseIds.filter((caseId) => approvedCaseIds.has(caseId)),
      ...directRevalidationRules.flatMap((rule) => rule.revalidationCaseIds ?? rule.linkedCaseIds),
    ])].sort(),
  };
}

function assertApprovedRulesMatchCurrentLifecycle(
  governanceRoot: string,
  decision: DocumentRulePromotionDecision,
): void {
  const workspaceRoot = path.resolve(governanceRoot, '../..');
  const lifecyclePath = path.join(
    workspaceRoot,
    'Merchant Center UITest/contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
  );
  const lifecycle = readJson<{
    rules?: Array<{ ruleId: string; statement: string; effectiveVersion: string; linkedCaseIds: string[] }>;
  }>(lifecyclePath);
  const currentByRuleId = new Map((lifecycle.rules ?? []).map((rule) => [rule.ruleId, rule]));
  for (const approved of decision.approvedRules ?? []) {
    const current = currentByRuleId.get(approved.ruleId);
    if (!current
      || current.statement !== approved.statement
      || current.effectiveVersion !== approved.effectiveVersion
      || !sameStringSet(current.linkedCaseIds, approved.linkedCaseIds)) {
      throw new Error(`文档规则批准收据已过期：当前正式规则与批准内容不一致：${approved.ruleId}`);
    }
    const unknownRevalidationCaseIds = (approved.revalidationCaseIds ?? [])
      .filter((caseId) => !approved.linkedCaseIds.includes(caseId));
    if (unknownRevalidationCaseIds.length > 0) {
      throw new Error(`文档规则批准收据包含未关联的重验用例：${approved.ruleId}/${unknownRevalidationCaseIds.join(',')}`);
    }
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function renderMarkdown(report: ReturnType<typeof buildProductCenterClosureAudit>): string {
  return [
    '# 商品中心闭环审计',
    '',
    `- 生成时间：${report.generatedAt}`,
    `- 发布变化观测：${report.source.changeObservation.status}`,
    '- 历史通过永久保留；日期和对话框变化不会使其失效。',
    '- 发布身份缺失不阻断本次通过，只限制自动复用与当前性声明。',
    '- 截图或视频不能单独签发通过。',
    '- 本次只生成增量候选，不自动启动页面执行。',
    `- 定向运行时重审：${report.auditDecision.targetedRuntimeAudit}`,
    `- 自动化验证：${report.auditDecision.automationValidation}`,
    `- 历史证据检查：${report.auditDecision.historicalEvidenceInspection}`,
    '',
    '| 状态 | 数量 |',
    '| --- | ---: |',
    ...Object.entries(report.summary)
      .filter(([key]) => key !== 'total')
      .map(([key, value]) => `| ${key} | ${value} |`),
    '',
    '| 用例 | 模块 | 状态 | 完整收据 | 原因 |',
    '| --- | --- | --- | ---: | --- |',
    ...report.cases
      .filter((item) => item.state !== 'evidence-passed')
      .map((item) => `| ${item.caseId} | ${item.module} | ${item.state} | ${item.matchingCompleteReceipts} | ${item.reasons.join('；')} |`),
    '',
  ].join('\n');
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

if (require.main === module) main();
