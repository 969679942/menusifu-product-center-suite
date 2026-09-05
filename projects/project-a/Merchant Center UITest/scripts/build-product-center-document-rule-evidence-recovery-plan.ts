import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fingerprintExecutionContext } from '../../../Test Automation Platform/src/utils/test-execution-state';
import { fingerprintProductCenterItemImplementation } from '../adapters/product-center/product-center-item-implementation';
import { parseProductCenterItemCaseSemanticFingerprints } from '../utils/product-center-item-case-semantic-fingerprint';
import {
  fingerprintReceiptEvidence,
  readPlaywrightExecutionReceipts,
} from '../utils/playwright-execution-receipt';
import type { DocumentRuleBatchPreflight } from '../utils/product-center-document-rule-preflight';

type ExecutionIndexRecord = {
  caseId: string;
  caseFingerprint?: string | null;
  semanticCaseFingerprint?: string | null;
  implementationFingerprint?: string | null;
  executionContextFingerprint?: string | null;
  status?: string;
  evidenceStatus?: string;
  receiptEvidenceFingerprint?: string | null;
  evidenceFileFingerprint?: string | null;
  evidencePath?: string | null;
  reuseStatus?: string | null;
  runId?: string | null;
  recordedAt?: string | null;
};

type ReceiptPayload = {
  receiptVersion?: string;
  caseId?: string;
  caseFingerprint?: string;
  bindingFingerprint?: string;
  semanticCaseFingerprint?: string;
  implementationFingerprint?: string;
  executionContext?: Record<string, string | undefined>;
  claims?: { required?: string[]; observed?: string[]; verified?: string[] };
  operationReceipts?: Array<{ operationKey?: string; observed?: boolean; method?: string }>;
  cleanup?: { apiZeroResidue?: boolean; uiZeroResidue?: boolean } | null;
  evidenceFingerprint?: string;
};

type RecoveredReceipt = {
  caseId: string;
  sourceKind: 'immutable-playwright-report' | 'immutable-allure-raw-receipt';
  sourcePath: string;
  sourceFingerprint: string;
  resultSourcePath: string | null;
  resultSourceFingerprint: string | null;
  receiptVersion: string | null;
  caseFingerprint: string | null;
  semanticCaseFingerprint: string | null;
  implementationFingerprint: string | null;
  executionContextFingerprint: string | null;
  receiptEvidenceFingerprint: string | null;
  operationReceiptCount: number;
  assertionReceiptCount: number;
  cleanupComplete: boolean;
  indexIdentityMatched: boolean;
  diagnostics: string[];
};

type CurrentIdentity = {
  caseId: string;
  caseFingerprint: string | null;
  implementationFingerprint: string | null;
  fingerprintMode: 'semantic' | 'binding';
};

export type DocumentRuleEvidenceRecoveryPlan = {
  schemaVersion: '1.0.0';
  planId: 'product-center-document-rule-evidence-recovery-and-minimal-revalidation';
  scope: 'project-adapter+generated-evidence';
  generatedAt: string;
  sourcePreflightFingerprint: string;
  summary: {
    highConfidenceRelatedCases: number;
    immutableReceiptRecoveredCases: number;
    exactReportRecoveredCases: number;
    rawAllureRecoveredCases: number;
    classifiedExclusions: number;
    currentReusableCases: number;
    historicalOnlyCases: number;
    missingOriginalReceiptCases: number;
    structurallyCompleteRules: number;
    structuralGapRules: number;
    executionEligibilityGapRules: number;
    caseDesignFirstRules: number;
    executableObligations: number;
    obligationsCoveredByCurrentReceipts: number;
    minimalRevalidationCandidates: number;
    deferredUntilCaseDesignCases: number;
    redundantHistoricalCasesNotSelected: number;
    businessExecutionStarted: false;
    formalRulesModified: false;
    existingResultsInvalidated: false;
  };
  caseAssessments: Array<{
    caseId: string;
    ruleIds: string[];
    obligationIds: string[];
    landingStatus: string | null;
    currentIdentity: CurrentIdentity | null;
    recoveryStatus: 'current-reusable' | 'historical-recovered' | 'classified-exclusion' | 'original-receipt-missing';
    evidence: RecoveredReceipt | null;
    caseFingerprintMatched: boolean;
    implementationFingerprintMatched: boolean;
    executionContextVerified: boolean;
    impactType: 'none' | 'semantic-lineage-change' | 'unknown-implementation-change' | 'not-applicable' | 'missing-evidence';
    decision: 'reuse' | 'targeted-execute' | 'sentinel-execute' | 'case-design-first' | 'not-selected' | 'classified-exclusion';
    reasonCode: string;
  }>;
  rulePlans: Array<{
    ruleId: string;
    structuralCoverage: 'covered' | 'partial' | 'uncovered';
    disposition: 'evidence-ready' | 'minimal-revalidation-required' | 'case-design-first';
    uncoveredObligationIds: string[];
    executionIneligibleObligationIds: string[];
    reusableCaseIds: string[];
    revalidationCaseIds: string[];
    executionDeferredCaseIds: string[];
  }>;
  minimalRevalidationCaseIds: string[];
  reusableCaseIds: string[];
  classifiedExclusionCaseIds: string[];
  structuralGapRuleIds: string[];
  executionEligibilityGapRuleIds: string[];
  minimalCoverProof: {
    executableObligationIds: string[];
    reusableCoveredObligationIds: string[];
    revalidationRequiredObligationIds: string[];
    selectedCases: Array<{
      caseId: string;
      coveredObligationIds: string[];
      uniquelyCoveredObligationIds: string[];
    }>;
    uncoveredObligationIds: string[];
    redundantSelectedCaseIds: string[];
    complete: true;
    irreducible: true;
  };
  guardrails: {
    originalReceiptBytesOrRawAttachmentRequired: true;
    aggregatePassCountsNeverAuthorizeRecovery: true;
    screenshotsNeverAuthorizeRecovery: true;
    semanticFingerprintIsCurrentItemCaseIdentity: true;
    unknownImplementationChangesRequireSentinel: true;
    structuralGapsCloseBeforeExecution: true;
    minimalRevalidationSetIsCompleteAndIrreducible: true;
    approvalRequiredBeforeExecution: true;
    noAutomaticApproval: true;
    noAutomaticExecution: true;
  };
  fingerprint: string;
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const governanceRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const preflightPath = path.join(governanceRoot, 'product-center-document-rule-batch-preflight.json');
const landingPath = path.join(governanceRoot, 'product-center-item-group-landing-audit.json');
const executionIndexPath = path.join(projectRoot, 'deliverables/system-test-platform/execution-index.json');
const groupIdentityPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-case-fingerprints.json');
const itemCanonicalPath = path.join(
  workspaceRoot,
  'Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
);
const outputJsonPath = path.join(governanceRoot, 'product-center-document-rule-evidence-recovery-plan.json');
const outputMarkdownPath = path.join(governanceRoot, 'product-center-document-rule-evidence-recovery-plan.md');

export function buildProductCenterDocumentRuleEvidenceRecoveryPlan(
  generatedAt = new Date().toISOString(),
): DocumentRuleEvidenceRecoveryPlan {
  const preflight = readJson<DocumentRuleBatchPreflight>(preflightPath);
  const executionIndex = readJson<{ records?: ExecutionIndexRecord[] }>(executionIndexPath);
  const landing = readJson<{ modules?: Array<{ assessment?: { cases?: Array<{ caseId: string; status?: string }> } }> }>(landingPath);
  const landingStatus = new Map((landing.modules ?? []).flatMap((item) => item.assessment?.cases ?? [])
    .map((item) => [item.caseId, item.status ?? null] as const));
  const obligations = preflight.rules.flatMap((rule) => rule.obligations.map((obligation) => ({
    ruleId: rule.ruleId,
    ruleStructuralCoverage: rule.structuralCoverage,
    obligationId: obligation.obligationId,
    structuralStatus: obligation.structuralStatus,
    caseIds: obligation.caseClaims.filter((claim) => claim.confidence === 'high').map((claim) => claim.caseId),
  })));
  const highConfidenceCaseIds = unique(obligations.flatMap((item) => item.caseIds));
  const currentIdentities = buildCurrentIdentities(highConfidenceCaseIds);
  const currentByCase = new Map(currentIdentities.map((item) => [item.caseId, item]));
  const recordsByCase = new Map<string, ExecutionIndexRecord[]>();
  for (const record of executionIndex.records ?? []) {
    if (!highConfidenceCaseIds.includes(record.caseId) || record.status !== 'passed' || record.evidenceStatus !== 'complete') continue;
    const records = recordsByCase.get(record.caseId) ?? [];
    records.push(record);
    recordsByCase.set(record.caseId, records);
  }
  const reportCache = new Map<string, ReturnType<typeof readPlaywrightExecutionReceipts>>();
  const allureCache = new Map<string, Map<string, RecoveredReceipt[]>>();
  const recoveredByCase = new Map<string, RecoveredReceipt>();
  for (const caseId of highConfidenceCaseIds) {
    if (landingStatus.get(caseId) === 'not-applicable') continue;
    const records = [...(recordsByCase.get(caseId) ?? [])]
      .sort((left, right) => String(right.recordedAt ?? '').localeCompare(String(left.recordedAt ?? '')));
    for (const record of records) {
      const exact = recoverFromExactReport(record, reportCache);
      if (exact) { recoveredByCase.set(caseId, exact); break; }
      const raw = recoverFromAllure(record, allureCache);
      if (raw) { recoveredByCase.set(caseId, raw); break; }
    }
  }

  const baseAssessments = highConfidenceCaseIds.map((caseId) => {
    const current = currentByCase.get(caseId) ?? null;
    const evidence = recoveredByCase.get(caseId) ?? null;
    const excluded = landingStatus.get(caseId) === 'not-applicable';
    const currentCaseFingerprint = normalizeFingerprint(current?.caseFingerprint);
    const evidenceCaseFingerprint = current?.fingerprintMode === 'semantic'
      ? normalizeFingerprint(evidence?.semanticCaseFingerprint)
      : normalizeFingerprint(evidence?.caseFingerprint);
    const caseFingerprintMatched = Boolean(currentCaseFingerprint && evidenceCaseFingerprint
      && currentCaseFingerprint === evidenceCaseFingerprint);
    const implementationFingerprintMatched = Boolean(current?.implementationFingerprint
      && normalizeFingerprint(current.implementationFingerprint) === normalizeFingerprint(evidence?.implementationFingerprint));
    const executionContextVerified = Boolean(evidence?.executionContextFingerprint && evidence.indexIdentityMatched);
    const currentReusable = Boolean(evidence?.sourceKind === 'immutable-playwright-report'
      && evidence.diagnostics.length === 0 && caseFingerprintMatched
      && implementationFingerprintMatched && executionContextVerified);
    const links = obligations.filter((item) => item.caseIds.includes(caseId));
    return {
      caseId,
      ruleIds: unique(links.map((item) => item.ruleId)),
      obligationIds: unique(links.map((item) => item.obligationId)),
      landingStatus: landingStatus.get(caseId) ?? null,
      currentIdentity: current,
      recoveryStatus: excluded ? 'classified-exclusion' as const
        : currentReusable ? 'current-reusable' as const
          : evidence ? 'historical-recovered' as const : 'original-receipt-missing' as const,
      evidence,
      caseFingerprintMatched,
      implementationFingerprintMatched,
      executionContextVerified,
      impactType: excluded ? 'not-applicable' as const
        : !evidence ? 'missing-evidence' as const
          : !caseFingerprintMatched ? 'semantic-lineage-change' as const
            : !implementationFingerprintMatched ? 'unknown-implementation-change' as const : 'none' as const,
    };
  });

  const structurallyCompleteRuleIds = new Set(preflight.rules
    .filter((rule) => rule.structuralCoverage === 'covered').map((rule) => rule.ruleId));
  const executionEligibleCaseIds = new Set(baseAssessments.filter((item) => (
    (item.recoveryStatus === 'current-reusable' || item.recoveryStatus === 'historical-recovered')
      && item.currentIdentity?.caseFingerprint
      && item.currentIdentity.implementationFingerprint
      && ['passed', 'ready'].includes(item.landingStatus ?? '')
  )).map((item) => item.caseId));
  const executionEligibilityGapRuleIds = preflight.rules.filter((rule) => (
    rule.structuralCoverage === 'covered'
      && rule.obligations.some((obligation) => obligation.caseClaims
        .filter((claim) => claim.confidence === 'high')
        .every((claim) => !executionEligibleCaseIds.has(claim.caseId)))
  )).map((rule) => rule.ruleId);
  const executableRuleIds = new Set([...structurallyCompleteRuleIds]
    .filter((ruleId) => !executionEligibilityGapRuleIds.includes(ruleId)));
  const executableObligations = obligations.filter((item) => executableRuleIds.has(item.ruleId));
  const executableObligationIds = new Set(executableObligations.map((item) => item.obligationId));
  const reusableCaseIds = baseAssessments.filter((item) => item.recoveryStatus === 'current-reusable'
    && item.obligationIds.some((id) => executableObligationIds.has(id))).map((item) => item.caseId);
  const reusableCoverage = new Set(executableObligations
    .filter((item) => item.caseIds.some((caseId) => reusableCaseIds.includes(caseId))).map((item) => item.obligationId));
  const remainingObligations = executableObligations.filter((item) => !reusableCoverage.has(item.obligationId));
  const eligibleHistoricalCases = baseAssessments.filter((item) => item.recoveryStatus === 'historical-recovered')
    .map((item) => item.caseId);
  const exactCover = exactMinimumCaseCover(remainingObligations, eligibleHistoricalCases);
  const minimalRevalidationCaseIds = exactCover.selectedCaseIds;
  const minimalCoverProof = buildMinimalCoverProof(
    executableObligations,
    reusableCaseIds,
    minimalRevalidationCaseIds,
    reusableCoverage,
  );
  if (minimalCoverProof.uncoveredObligationIds.length > 0) {
    throw new Error(`DOCUMENT_RULE_MINIMUM_COVER_INCOMPLETE:${minimalCoverProof.uncoveredObligationIds.join(',')}`);
  }
  if (minimalCoverProof.redundantSelectedCaseIds.length > 0) {
    throw new Error(`DOCUMENT_RULE_MINIMUM_COVER_REDUNDANT_CASES:${minimalCoverProof.redundantSelectedCaseIds.join(',')}`);
  }
  const structuralGapRuleIds = preflight.rules.filter((rule) => rule.structuralCoverage !== 'covered').map((rule) => rule.ruleId);
  const caseDesignFirstRuleIds = unique([...structuralGapRuleIds, ...executionEligibilityGapRuleIds]);
  const gapLinkedCaseIds = new Set(obligations.filter((item) => caseDesignFirstRuleIds.includes(item.ruleId)).flatMap((item) => item.caseIds));
  const selected = new Set(minimalRevalidationCaseIds);
  const assessments: DocumentRuleEvidenceRecoveryPlan['caseAssessments'] = baseAssessments.map((item) => {
    if (item.recoveryStatus === 'classified-exclusion') return {
      ...item, decision: 'classified-exclusion', reasonCode: 'CASE_NOT_APPLICABLE_BY_CURRENT_DECISION',
    };
    if (item.recoveryStatus === 'current-reusable') return {
      ...item, decision: 'reuse', reasonCode: 'CURRENT_CASE_IMPLEMENTATION_CONTEXT_AND_RECEIPT_MATCHED',
    };
    if (selected.has(item.caseId)) return {
      ...item,
      decision: item.impactType === 'unknown-implementation-change' ? 'sentinel-execute' : 'targeted-execute',
      reasonCode: item.impactType === 'unknown-implementation-change'
        ? 'IMPLEMENTATION_CHANGED_WITHOUT_PROVENANCE_SELECT_MINIMAL_SENTINEL'
        : 'CURRENT_SEMANTIC_OR_RECEIPT_IDENTITY_REQUIRES_TARGETED_REVALIDATION',
    };
    if (gapLinkedCaseIds.has(item.caseId) && !item.obligationIds.some((id) => executableObligationIds.has(id))) return {
      ...item, decision: 'case-design-first', reasonCode: 'STRUCTURAL_OBLIGATION_GAP_PRECEDES_EXECUTION',
    };
    return {
      ...item, decision: 'not-selected', reasonCode: item.evidence
        ? 'REDUNDANT_HISTORICAL_CASE_NOT_REQUIRED_BY_MINIMUM_COVER'
        : 'NO_ORIGINAL_RECEIPT_AND_NOT_SELECTED_FOR_PREMATURE_EXECUTION',
    };
  });
  const rulePlans = preflight.rules.map((rule) => {
    const uncoveredObligationIds = rule.obligations
      .filter((item) => item.structuralStatus !== 'covered').map((item) => item.obligationId);
    const executionIneligibleObligationIds = rule.obligations.filter((item) => (
      item.structuralStatus === 'covered'
        && item.caseClaims.filter((claim) => claim.confidence === 'high')
          .every((claim) => !executionEligibleCaseIds.has(claim.caseId))
    )).map((item) => item.obligationId);
    const ruleObligationIds = new Set(rule.obligations.map((item) => item.obligationId));
    const reusable = assessments.filter((item) => item.decision === 'reuse'
      && item.obligationIds.some((id) => ruleObligationIds.has(id))).map((item) => item.caseId);
    const revalidation = assessments.filter((item) => (
      item.decision === 'targeted-execute' || item.decision === 'sentinel-execute'
    ) && item.obligationIds.some((id) => ruleObligationIds.has(id))).map((item) => item.caseId);
    const executionDeferredCaseIds = assessments.filter((item) => item.ruleIds.includes(rule.ruleId)
      && item.decision === 'case-design-first').map((item) => item.caseId);
    return {
      ruleId: rule.ruleId,
      structuralCoverage: rule.structuralCoverage,
      disposition: uncoveredObligationIds.length > 0 || executionIneligibleObligationIds.length > 0 ? 'case-design-first' as const
        : revalidation.length > 0 ? 'minimal-revalidation-required' as const : 'evidence-ready' as const,
      uncoveredObligationIds,
      executionIneligibleObligationIds,
      reusableCaseIds: unique(reusable),
      revalidationCaseIds: unique(revalidation),
      executionDeferredCaseIds: unique(executionDeferredCaseIds),
    };
  });
  const unsigned = {
    schemaVersion: '1.0.0' as const,
    planId: 'product-center-document-rule-evidence-recovery-and-minimal-revalidation' as const,
    scope: 'project-adapter+generated-evidence' as const,
    generatedAt,
    sourcePreflightFingerprint: preflight.fingerprint,
    summary: {
      highConfidenceRelatedCases: highConfidenceCaseIds.length,
      immutableReceiptRecoveredCases: assessments.filter((item) => item.evidence).length,
      exactReportRecoveredCases: assessments.filter((item) => item.evidence?.sourceKind === 'immutable-playwright-report').length,
      rawAllureRecoveredCases: assessments.filter((item) => item.evidence?.sourceKind === 'immutable-allure-raw-receipt').length,
      classifiedExclusions: assessments.filter((item) => item.recoveryStatus === 'classified-exclusion').length,
      currentReusableCases: assessments.filter((item) => item.recoveryStatus === 'current-reusable').length,
      historicalOnlyCases: assessments.filter((item) => item.recoveryStatus === 'historical-recovered').length,
      missingOriginalReceiptCases: assessments.filter((item) => item.recoveryStatus === 'original-receipt-missing').length,
      structurallyCompleteRules: structurallyCompleteRuleIds.size,
      structuralGapRules: structuralGapRuleIds.length,
      executionEligibilityGapRules: executionEligibilityGapRuleIds.length,
      caseDesignFirstRules: caseDesignFirstRuleIds.length,
      executableObligations: executableObligations.length,
      obligationsCoveredByCurrentReceipts: reusableCoverage.size,
      minimalRevalidationCandidates: minimalRevalidationCaseIds.length,
      deferredUntilCaseDesignCases: assessments.filter((item) => item.decision === 'case-design-first').length,
      redundantHistoricalCasesNotSelected: assessments.filter((item) => item.reasonCode === 'REDUNDANT_HISTORICAL_CASE_NOT_REQUIRED_BY_MINIMUM_COVER').length,
      businessExecutionStarted: false as const,
      formalRulesModified: false as const,
      existingResultsInvalidated: false as const,
    },
    caseAssessments: assessments,
    rulePlans,
    minimalRevalidationCaseIds,
    reusableCaseIds: unique(reusableCaseIds),
    classifiedExclusionCaseIds: assessments.filter((item) => item.decision === 'classified-exclusion').map((item) => item.caseId),
    structuralGapRuleIds,
    executionEligibilityGapRuleIds,
    minimalCoverProof: {
      ...minimalCoverProof,
      complete: true as const,
      irreducible: true as const,
    },
    guardrails: {
      originalReceiptBytesOrRawAttachmentRequired: true as const,
      aggregatePassCountsNeverAuthorizeRecovery: true as const,
      screenshotsNeverAuthorizeRecovery: true as const,
      semanticFingerprintIsCurrentItemCaseIdentity: true as const,
      unknownImplementationChangesRequireSentinel: true as const,
      structuralGapsCloseBeforeExecution: true as const,
      minimalRevalidationSetIsCompleteAndIrreducible: true as const,
      approvalRequiredBeforeExecution: true as const,
      noAutomaticApproval: true as const,
      noAutomaticExecution: true as const,
    },
  };
  if (exactCover.uncoveredObligationIds.length > 0) {
    throw new Error(`DOCUMENT_RULE_EXECUTABLE_OBLIGATION_UNCOVERED:${exactCover.uncoveredObligationIds.join(',')}`);
  }
  const report: DocumentRuleEvidenceRecoveryPlan = {
    ...unsigned,
    fingerprint: sha256(stableJson(unsigned)),
  };
  writeJson(outputJsonPath, report);
  fs.writeFileSync(outputMarkdownPath, renderMarkdown(report), 'utf8');
  return report;
}

function buildCurrentIdentities(caseIds: readonly string[]): CurrentIdentity[] {
  const selected = new Set(caseIds);
  const group = readJson<{ cases?: Array<{ caseId: string; bindingFingerprint?: string; implementationFingerprint?: string }> }>(groupIdentityPath);
  const item = parseProductCenterItemCaseSemanticFingerprints(itemCanonicalPath);
  return [
    ...(group.cases ?? []).filter((entry) => selected.has(entry.caseId)).map((entry) => ({
      caseId: entry.caseId,
      caseFingerprint: normalizeFingerprint(entry.bindingFingerprint),
      implementationFingerprint: normalizeFingerprint(entry.implementationFingerprint),
      fingerprintMode: 'binding' as const,
    })),
    ...item.filter((entry) => selected.has(entry.caseId)).map((entry) => ({
      caseId: entry.caseId,
      caseFingerprint: normalizeFingerprint(entry.fingerprint),
      implementationFingerprint: fingerprintProductCenterItemImplementation(projectRoot, entry.caseId),
      fingerprintMode: 'semantic' as const,
    })),
  ].sort((left, right) => left.caseId.localeCompare(right.caseId));
}

function recoverFromExactReport(
  indexed: ExecutionIndexRecord,
  cache: Map<string, ReturnType<typeof readPlaywrightExecutionReceipts>>,
): RecoveredReceipt | null {
  if (!indexed.evidencePath || !indexed.evidenceFileFingerprint) return null;
  const absolute = resolveEvidencePath(indexed.evidencePath);
  if (!fs.existsSync(absolute) || sha256File(absolute) !== normalizeFingerprint(indexed.evidenceFileFingerprint)) return null;
  let imported = cache.get(absolute);
  if (!imported) {
    try { imported = readPlaywrightExecutionReceipts({ reportPath: absolute, workspaceRoot }); }
    catch { imported = { records: [], diagnostics: ['EVIDENCE_IMPORT_FAILED'] }; }
    cache.set(absolute, imported);
  }
  const record = imported.records.find((item) => item.caseId === indexed.caseId
    && normalizeFingerprint(item.receiptEvidenceFingerprint) === normalizeFingerprint(indexed.receiptEvidenceFingerprint));
  if (!record) return null;
  return {
    caseId: indexed.caseId,
    sourceKind: 'immutable-playwright-report',
    sourcePath: relativeWorkspace(absolute),
    sourceFingerprint: sha256File(absolute),
    resultSourcePath: null,
    resultSourceFingerprint: null,
    receiptVersion: null,
    caseFingerprint: normalizeFingerprint(record.caseFingerprint),
    semanticCaseFingerprint: normalizeFingerprint(record.semanticCaseFingerprint),
    implementationFingerprint: normalizeFingerprint(record.implementationFingerprint),
    executionContextFingerprint: normalizeFingerprint(record.executionContextFingerprint),
    receiptEvidenceFingerprint: normalizeFingerprint(record.receiptEvidenceFingerprint),
    operationReceiptCount: 1,
    assertionReceiptCount: record.assertionStatuses?.length ?? 0,
    cleanupComplete: record.cleanupEvidence?.apiZeroResidue === true && record.cleanupEvidence?.uiZeroResidue === true,
    indexIdentityMatched: normalizeFingerprint(record.executionContextFingerprint) === normalizeFingerprint(indexed.executionContextFingerprint)
      && normalizeFingerprint(record.evidenceFileFingerprint) === normalizeFingerprint(indexed.evidenceFileFingerprint),
    diagnostics: imported.diagnostics.filter((item) => item.startsWith(`${indexed.caseId}:`)),
  };
}

function recoverFromAllure(
  indexed: ExecutionIndexRecord,
  cache: Map<string, Map<string, RecoveredReceipt[]>>,
): RecoveredReceipt | null {
  if (!indexed.runId) return null;
  const root = path.join(projectRoot, 'output/allure/source-governed', indexed.runId, 'group/allure-results');
  if (!fs.existsSync(root)) return null;
  let receipts = cache.get(root);
  if (!receipts) { receipts = readAllureReceipts(root); cache.set(root, receipts); }
  return (receipts.get(indexed.caseId) ?? []).find((item) => (
    normalizeFingerprint(item.receiptEvidenceFingerprint) === normalizeFingerprint(indexed.receiptEvidenceFingerprint)
      && normalizeFingerprint(item.executionContextFingerprint) === normalizeFingerprint(indexed.executionContextFingerprint)
      && normalizeFingerprint(item.caseFingerprint) === normalizeFingerprint(indexed.caseFingerprint)
      && normalizeFingerprint(item.implementationFingerprint) === normalizeFingerprint(indexed.implementationFingerprint)
  )) ?? null;
}

function readAllureReceipts(root: string): Map<string, RecoveredReceipt[]> {
  const result = new Map<string, RecoveredReceipt[]>();
  for (const name of fs.readdirSync(root).filter((item) => item.endsWith('-result.json')).sort()) {
    const resultPath = path.join(root, name);
    const parsed = readJson<Record<string, any>>(resultPath);
    if (parsed.status !== 'passed') continue;
    const caseId = (parsed.labels ?? []).find((item: any) => item.name === 'tag'
      && String(item.value ?? '').startsWith('case-'))?.value?.slice(5);
    if (!caseId) continue;
    const attachments: Array<{ name?: string; type?: string; source?: string }> = [...(parsed.attachments ?? [])];
    collectStepAttachments(parsed.steps ?? [], attachments);
    const attachment = attachments.find((item) => item.name === 'product-center-group-runtime-evidence'
      && item.type === 'application/json' && item.source);
    if (!attachment?.source) continue;
    const receiptPath = path.join(root, attachment.source);
    if (!fs.existsSync(receiptPath)) continue;
    const payload = readJson<ReceiptPayload>(receiptPath);
    const diagnostics = validateRawReceipt(caseId, payload);
    const contextFingerprint = payload.executionContext
      ? fingerprintExecutionContext(payload.executionContext) : null;
    const receipt: RecoveredReceipt = {
      caseId,
      sourceKind: 'immutable-allure-raw-receipt',
      sourcePath: relativeWorkspace(receiptPath),
      sourceFingerprint: sha256File(receiptPath),
      resultSourcePath: relativeWorkspace(resultPath),
      resultSourceFingerprint: sha256File(resultPath),
      receiptVersion: payload.receiptVersion ?? null,
      caseFingerprint: normalizeFingerprint(payload.caseFingerprint ?? payload.bindingFingerprint),
      semanticCaseFingerprint: normalizeFingerprint(payload.semanticCaseFingerprint),
      implementationFingerprint: normalizeFingerprint(payload.implementationFingerprint),
      executionContextFingerprint: normalizeFingerprint(contextFingerprint),
      receiptEvidenceFingerprint: normalizeFingerprint(payload.evidenceFingerprint),
      operationReceiptCount: payload.operationReceipts?.length ?? 0,
      assertionReceiptCount: payload.claims?.required?.length ?? 0,
      cleanupComplete: payload.cleanup?.apiZeroResidue === true && payload.cleanup?.uiZeroResidue === true,
      indexIdentityMatched: diagnostics.length === 0,
      diagnostics,
    };
    const entries = result.get(caseId) ?? [];
    entries.push(receipt);
    result.set(caseId, entries);
  }
  return result;
}

function validateRawReceipt(caseId: string, payload: ReceiptPayload): string[] {
  const diagnostics: string[] = [];
  if (payload.caseId !== caseId) diagnostics.push('RUNTIME_RECEIPT_CASE_MISMATCH');
  if (!['3.1.0', '3.2.0', '4.0.0'].includes(payload.receiptVersion ?? '')) diagnostics.push('RUNTIME_RECEIPT_VERSION_UNSUPPORTED');
  if (!normalizeFingerprint(payload.caseFingerprint ?? payload.bindingFingerprint)) diagnostics.push('RUNTIME_RECEIPT_CASE_FINGERPRINT_MISSING');
  if (!normalizeFingerprint(payload.implementationFingerprint)) diagnostics.push('RUNTIME_RECEIPT_IMPLEMENTATION_FINGERPRINT_MISSING');
  const context = payload.executionContext ?? {};
  if (!context.environmentId || !context.tenantScope || !context.locale || !context.roleId || !context.route) {
    diagnostics.push('RUNTIME_RECEIPT_CONTEXT_INCOMPLETE');
  }
  const required = new Set(payload.claims?.required ?? []);
  const observed = new Set(payload.claims?.observed ?? []);
  const verified = new Set(payload.claims?.verified ?? []);
  if (required.size === 0 || [...required].some((id) => !observed.has(id) || !verified.has(id))) {
    diagnostics.push('RUNTIME_RECEIPT_CLAIMS_INCOMPLETE');
  }
  if (!Array.isArray(payload.operationReceipts) || payload.operationReceipts.length === 0
    || payload.operationReceipts.some((item) => !item.operationKey || !item.method || item.observed !== true)) {
    diagnostics.push('RUNTIME_RECEIPT_EXECUTABLE_OPERATIONS_INCOMPLETE');
  }
  if (payload.cleanup?.apiZeroResidue !== true || payload.cleanup?.uiZeroResidue !== true) {
    diagnostics.push('RUNTIME_RECEIPT_CLEANUP_INCOMPLETE');
  }
  if (payload.evidenceFingerprint !== fingerprintReceiptEvidence(payload)) {
    diagnostics.push('RUNTIME_RECEIPT_EVIDENCE_FINGERPRINT_MISMATCH');
  }
  return unique(diagnostics);
}

function exactMinimumCaseCover(
  obligations: Array<{ obligationId: string; caseIds: string[] }>,
  eligibleCaseIds: readonly string[],
): { selectedCaseIds: string[]; uncoveredObligationIds: string[] } {
  const eligible = new Set(eligibleCaseIds);
  const uncovered = obligations.filter((item) => !item.caseIds.some((caseId) => eligible.has(caseId)))
    .map((item) => item.obligationId);
  if (uncovered.length > 0) return { selectedCaseIds: [], uncoveredObligationIds: uncovered };
  const obligationIndex = new Map(obligations.map((item, index) => [item.obligationId, index]));
  const masks = new Map<string, bigint>();
  for (const caseId of eligible) {
    let mask = 0n;
    for (const obligation of obligations) {
      if (obligation.caseIds.includes(caseId)) mask |= 1n << BigInt(obligationIndex.get(obligation.obligationId)!);
    }
    if (mask !== 0n) masks.set(caseId, mask);
  }
  const fullMask = obligations.length === 0 ? 0n : (1n << BigInt(obligations.length)) - 1n;
  let best = greedyCover(fullMask, masks);
  const memo = new Map<string, number>();
  const visit = (remaining: bigint, selected: string[]): void => {
    if (remaining === 0n) {
      const normalized = [...selected].sort();
      if (normalized.length < best.length || (normalized.length === best.length && normalized.join('|') < best.join('|'))) best = normalized;
      return;
    }
    if (selected.length >= best.length) return;
    const key = remaining.toString(16);
    const prior = memo.get(key);
    if (prior !== undefined && prior <= selected.length) return;
    memo.set(key, selected.length);
    const obligation = leastChoiceObligation(remaining, masks);
    const candidates = [...masks.entries()].filter(([, mask]) => (mask & obligation) !== 0n)
      .sort((left, right) => bitCount(right[1] & remaining) - bitCount(left[1] & remaining)
        || left[0].localeCompare(right[0]));
    for (const [caseId, mask] of candidates) visit(remaining & ~mask, [...selected, caseId]);
  };
  visit(fullMask, []);
  return { selectedCaseIds: best, uncoveredObligationIds: [] };
}

function buildMinimalCoverProof(
  obligations: Array<{ obligationId: string; caseIds: string[] }>,
  reusableCaseIds: readonly string[],
  selectedCaseIds: readonly string[],
  reusableCoverage: ReadonlySet<string>,
): {
  executableObligationIds: string[];
  reusableCoveredObligationIds: string[];
  revalidationRequiredObligationIds: string[];
  selectedCases: Array<{ caseId: string; coveredObligationIds: string[]; uniquelyCoveredObligationIds: string[] }>;
  uncoveredObligationIds: string[];
  redundantSelectedCaseIds: string[];
} {
  const activeCaseIds = new Set([...reusableCaseIds, ...selectedCaseIds]);
  const coverageByObligation = new Map(obligations.map((obligation) => [
    obligation.obligationId,
    obligation.caseIds.filter((caseId) => activeCaseIds.has(caseId)),
  ]));
  const selectedCases = [...selectedCaseIds].sort().map((caseId) => {
    const coveredObligationIds = obligations
      .filter((obligation) => obligation.caseIds.includes(caseId))
      .map((obligation) => obligation.obligationId)
      .sort();
    const uniquelyCoveredObligationIds = coveredObligationIds
      .filter((obligationId) => coverageByObligation.get(obligationId)?.length === 1)
      .sort();
    return { caseId, coveredObligationIds, uniquelyCoveredObligationIds };
  });
  return {
    executableObligationIds: obligations.map((item) => item.obligationId).sort(),
    reusableCoveredObligationIds: [...reusableCoverage].sort(),
    revalidationRequiredObligationIds: obligations
      .filter((item) => !reusableCoverage.has(item.obligationId))
      .map((item) => item.obligationId)
      .sort(),
    selectedCases,
    uncoveredObligationIds: obligations
      .filter((item) => (coverageByObligation.get(item.obligationId) ?? []).length === 0)
      .map((item) => item.obligationId)
      .sort(),
    redundantSelectedCaseIds: selectedCases
      .filter((item) => item.uniquelyCoveredObligationIds.length === 0)
      .map((item) => item.caseId),
  };
}

function greedyCover(fullMask: bigint, masks: Map<string, bigint>): string[] {
  let remaining = fullMask;
  const selected: string[] = [];
  while (remaining !== 0n) {
    const best = [...masks.entries()].sort((left, right) => bitCount(right[1] & remaining) - bitCount(left[1] & remaining)
      || left[0].localeCompare(right[0]))[0];
    if (!best || (best[1] & remaining) === 0n) return [...masks.keys()].sort();
    selected.push(best[0]);
    remaining &= ~best[1];
  }
  return selected.sort();
}

function leastChoiceObligation(remaining: bigint, masks: Map<string, bigint>): bigint {
  let selected = remaining & -remaining;
  let minimum = Number.POSITIVE_INFINITY;
  for (let bit = 1n; bit <= remaining; bit <<= 1n) {
    if ((remaining & bit) === 0n) continue;
    const choices = [...masks.values()].filter((mask) => (mask & bit) !== 0n).length;
    if (choices < minimum) { minimum = choices; selected = bit; }
  }
  return selected;
}

function bitCount(value: bigint): number {
  let count = 0;
  for (let current = value; current !== 0n; current &= current - 1n) count += 1;
  return count;
}

function collectStepAttachments(
  steps: Array<{ attachments?: Array<{ name?: string; type?: string; source?: string }>; steps?: any[] }>,
  target: Array<{ name?: string; type?: string; source?: string }>,
): void {
  for (const step of steps) {
    target.push(...(step.attachments ?? []));
    collectStepAttachments(step.steps ?? [], target);
  }
}

function renderMarkdown(report: DocumentRuleEvidenceRecoveryPlan): string {
  return [
    '# 商品中心旧规则精确证据恢复与最小重验计划', '',
    `- 高置信义务相关用例：${report.summary.highConfidenceRelatedCases}`,
    `- 已恢复不可变原始收据：${report.summary.immutableReceiptRecoveredCases}（精确报告 ${report.summary.exactReportRecoveredCases}，Allure 原始收据 ${report.summary.rawAllureRecoveredCases}）`,
    `- 不适用排除：${report.summary.classifiedExclusions}；原始收据真实缺失：${report.summary.missingOriginalReceiptCases}`,
    `- 当前可复用：${report.summary.currentReusableCases}；历史证据仅保留：${report.summary.historicalOnlyCases}`,
    `- 结构完整规则：${report.summary.structurallyCompleteRules}；结构缺口规则：${report.summary.structuralGapRules}；执行资格缺口规则：${report.summary.executionEligibilityGapRules}`,
    `- 可执行义务：${report.summary.executableObligations}；现收据已覆盖：${report.summary.obligationsCoveredByCurrentReceipts}`,
    `- 压缩后最小重验候选：${report.summary.minimalRevalidationCandidates}；未入选历史用例：${report.summary.redundantHistoricalCasesNotSelected}`,
    '- 业务执行：0 次；正式规则、历史通过结果和用例状态均未修改。', '',
    '## 最小覆盖证明', '',
    `- 完整性：${report.minimalCoverProof.complete ? '通过' : '失败'}；未覆盖义务：${report.minimalCoverProof.uncoveredObligationIds.join('、') || '无'}`,
    `- 不可约性：${report.minimalCoverProof.irreducible ? '通过' : '失败'}；可删除候选：${report.minimalCoverProof.redundantSelectedCaseIds.join('、') || '无'}`,
    `- 可执行义务 ${report.minimalCoverProof.executableObligationIds.length} 条，其中当前收据覆盖 ${report.minimalCoverProof.reusableCoveredObligationIds.length} 条，最小重验集覆盖其余 ${report.minimalCoverProof.revalidationRequiredObligationIds.length} 条。`, '',
    '| 入选用例 | 覆盖义务 | 仅由该用例覆盖的义务 |',
    '|---|---|---|',
    ...report.minimalCoverProof.selectedCases.map((item) => `| ${item.caseId} | ${item.coveredObligationIds.join('、')} | ${item.uniquelyCoveredObligationIds.join('、')} |`), '',
    '## 最小重验候选', '',
    report.minimalRevalidationCaseIds.length > 0 ? report.minimalRevalidationCaseIds.map((id) => `- ${id}`).join('\n') : '- 无', '',
    '## 规则分流', '',
    '| 规则 | 结构 | 处置 | 当前复用 | 最小重验 | 结构/执行资格缺口 |',
    '|---|---|---|---|---|---|',
    ...report.rulePlans.map((item) => `| ${item.ruleId} | ${item.structuralCoverage} | ${item.disposition} | ${item.reusableCaseIds.join('、') || '-'} | ${item.revalidationCaseIds.join('、') || '-'} | ${[...item.uncoveredObligationIds, ...item.executionIneligibleObligationIds].join('、') || '-'} |`), '',
    '## 用例证据和影响', '',
    '| 用例 | 恢复 | 用例指纹 | 实现指纹 | 决策 | 原因 |',
    '|---|---|---|---|---|---|',
    ...report.caseAssessments.map((item) => `| ${item.caseId} | ${item.recoveryStatus} | ${item.caseFingerprintMatched ? '匹配' : '不匹配'} | ${item.implementationFingerprintMatched ? '匹配' : '不匹配'} | ${item.decision} | ${item.reasonCode} |`), '',
  ].join('\n');
}

function resolveEvidencePath(reference: string): string {
  const normalized = reference.replace(/\\/g, '/');
  const marker = 'Merchant Center UITest/';
  return normalized.includes(marker)
    ? path.join(projectRoot, normalized.slice(normalized.indexOf(marker) + marker.length))
    : path.resolve(projectRoot, normalized);
}
function relativeWorkspace(filePath: string): string { return path.relative(workspaceRoot, filePath).replaceAll(path.sep, '/'); }
function normalizeFingerprint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/^sha256:/i, '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}
function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}
function unique<T>(items: readonly T[]): T[] { return [...new Set(items)].sort(); }
function sha256File(filePath: string): string { return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

if (require.main === module) {
  const report = buildProductCenterDocumentRuleEvidenceRecoveryPlan();
  process.stdout.write(`${JSON.stringify({ output: outputJsonPath, summary: report.summary })}\n`);
}
