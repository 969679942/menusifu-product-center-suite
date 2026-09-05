import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  buildProductCenterRuleCoverage,
  extractProductCenterDocumentRuleLedger,
  type ProductCenterFormalRule,
} from '../adapters/product-center/product-center-business-rule-document-coverage-adapter';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const lifecyclePath = path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json');
const registryPath = path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-item-rule-registry.json');
const candidatePath = path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-item-test-plan-rule-candidates.json');
const completionPath = path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-business-rule-completion-review-queue.json');
const eventLedgerPath = path.join(projectRoot, 'output/governance/product-center-business-rule-event-ledger.json');
const observationLedgerPath = path.join(projectRoot, 'output/governance/product-center-business-rule-observation-ledger.json');
const executionIndexPath = path.join(projectRoot, 'deliverables/system-test-platform/execution-index.json');
const landingPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-item-group-landing-audit.json');
const migrationPath = path.join(projectRoot, 'adapters/test-automation-platform/reports/merchant-center-migration-closure.json');
const automationBindingsPath = path.join(projectRoot, 'contracts/product-center/test-cases/canonical/product-center-item-authoritative-automation-bindings.json');
const supplementalAutomationBindingsPath = path.join(projectRoot, 'contracts/product-center/test-plan-additional-automation-bindings.json');
const groupImplementationManifestPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-case-fingerprints.json');
const canonicalCaseRoot = path.join(workspaceRoot, 'Merchant Center Info/00-待转换测试方案/用例库');
const authoritativeDocumentPath = path.join(workspaceRoot, 'Merchant Center Info/商品中心业务规则.md');
const outputJsonPath = path.join(projectRoot, 'output/governance/product-center-business-rule-coverage.json');
const outputMarkdownPath = path.join(projectRoot, 'output/governance/product-center-business-rule-coverage.md');
const documentOutputJsonPath = path.join(projectRoot, 'output/governance/product-center-business-rule-document-coverage.json');
const documentOutputMarkdownPath = path.join(projectRoot, 'output/governance/product-center-business-rule-document-coverage.md');

export type ProductCenterBusinessRuleCoverageReport = ReturnType<typeof buildProductCenterBusinessRuleCoverage>;

export function buildProductCenterBusinessRuleCoverage() {
  const lifecycle = readJson<any>(lifecyclePath);
  const registry = readJson<any>(registryPath);
  const candidateLedger = readJson<any>(candidatePath);
  const completion = readJson<any>(completionPath);
  const eventLedger = readJson<any>(eventLedgerPath);
  const observationLedger = readJson<any>(observationLedgerPath);
  const executionIndex = readJson<any>(executionIndexPath);
  const landing = readJson<any>(landingPath);
  const migration = readJson<any>(migrationPath);
  const automationBindings = readJson<any>(automationBindingsPath);
  const supplementalAutomationBindings = readJson<any>(supplementalAutomationBindingsPath);
  const groupImplementationManifest = readJson<any>(groupImplementationManifestPath);
  const authoritativeDocument = fs.readFileSync(authoritativeDocumentPath, 'utf8');
  const canonicalCaseFiles = listFormalCaseFiles(canonicalCaseRoot);
  const canonicalCaseDocument = canonicalCaseFiles.map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n\n');
  const rules = (Array.isArray(lifecycle.rules) ? lifecycle.rules : []) as ProductCenterFormalRule[];
  const formalRuleIds = rules.map((rule) => rule.ruleId);
  const landingCases = (landing.modules ?? []).flatMap((module: any) => module.assessment?.cases ?? []);
  const landingCaseById = new Map<string, any>(landingCases.map((item: any) => [item.caseId, item]));
  // Canonical bindings remain the authoritative 216-case release. Landed
  // supplemental bindings use the same runner and are also valid automation
  // evidence for rule coverage; they must not alter the canonical denominator.
  const automationBindingCaseIds = new Set<string>([
    ...(automationBindings.bindings ?? []).map((item: any) => item.caseId),
    ...(supplementalAutomationBindings.bindings ?? [])
      .filter((item: any) => item.status === 'landed' && item.runtimeReadiness === 'ready')
      .map((item: any) => item.caseId),
    ...(groupImplementationManifest.cases ?? [])
      .filter((item: any) => Boolean(item.implementationFingerprint))
      .map((item: any) => item.caseId),
  ]);
  const documentRuleLedger = extractProductCenterDocumentRuleLedger({ documentText: authoritativeDocument, formalRuleIds });
  const coverage = rules.map((rule) => buildProductCenterRuleCoverage({
    rule,
    canonicalCaseDocument,
    automationBindingCaseIds,
    currentIdentities: buildCurrentIdentities(rule, landingCaseById, executionIndex),
    currentEvidence: buildCurrentEvidence(rule, landingCaseById, executionIndex, observationLedger),
  }));
  const assertions = rules.reduce((count: number, rule: any) => count + (rule.semantics?.assertionSurfaces?.length ?? 0), 0);
  const metadata = rules.map((rule: any) => rule.governance ?? {});
  const latestCurrentRun = [...(eventLedger.runs ?? [])]
    .filter((run: any) => run.evaluationStatus === 'current')
    .sort((left: any, right: any) => String(left.occurredAt).localeCompare(String(right.occurredAt)) || String(left.runId).localeCompare(String(right.runId)))
    .at(-1);
  const documentStatusCounts = Object.fromEntries(
    ['formal', 'document-registered-pending-lifecycle', 'conflicted', 'historical', 'deprecated']
      .map((status) => [status, documentRuleLedger.filter((item) => item.status === status).length]),
  );
  const sourceFingerprints = {
    authoritativeDocument: fingerprintFile(authoritativeDocumentPath),
    lifecycle: lifecycle.fingerprint ?? fingerprintFile(lifecyclePath),
    registry: fingerprintFile(registryPath),
    candidateLedger: fingerprintFile(candidatePath),
    completionQueue: fingerprintFile(completionPath),
    eventLedger: fingerprintFile(eventLedgerPath),
    observationLedger: fingerprintFile(observationLedgerPath),
    executionIndex: fingerprintFile(executionIndexPath),
    automationBindings: fingerprintFile(automationBindingsPath),
    supplementalAutomationBindings: fingerprintFile(supplementalAutomationBindingsPath),
    groupImplementationManifest: fingerprintFile(groupImplementationManifestPath),
    canonicalCaseDocument: sha256(canonicalCaseFiles.map((filePath) => fingerprintFile(filePath)).join(':')),
    migration: migration.inputFingerprint ?? fingerprintFile(migrationPath),
  };
  const inputFingerprint = sha256(stableStringify(sourceFingerprints));
  const generatedAt = resolveStableGeneratedAt(outputJsonPath, inputFingerprint);
  const formalDocumentRuleIds = new Set(documentRuleLedger.filter((item) => item.status === 'formal').map((item) => item.ruleId));
  const missingFormalRuleIdsInDocument = formalRuleIds.filter((ruleId) => !formalDocumentRuleIds.has(ruleId));
  const combinedMandatory = coverage.reduce((count, item) => count + item.combinedAssessment.mandatoryObligations, 0);
  const combinedCovered = coverage.reduce((count, item) => count + item.combinedAssessment.coveredMandatoryObligations, 0);
  const businessStructurallyCovered = coverage.filter((item) => ['structurally-covered', 'execution-verified'].includes(item.businessAssessment.maturity)).length;
  const automationStructurallyCovered = coverage.filter((item) => ['structurally-covered', 'execution-verified'].includes(item.automationAssessment.maturity)).length;
  const executionVerifiedRules = coverage.filter((item) => item.combinedAssessment.maturity === 'execution-verified').length;
  const staleObservationCases = unique((observationLedger.observations ?? [])
    .filter((item: any) => (item.blockers ?? []).some((blocker: string) => blocker.includes('FINGERPRINT_MISMATCH')))
    .map((item: any) => item.caseId));
  const missingObligations = coverage.flatMap((item) => item.missingObligations.map((obligation) => ({ ruleId: item.ruleId, ...obligation })));

  const report = {
    schemaVersion: '2.0.0',
    reportId: 'product-center-business-rule-document-coverage',
    generatedAt,
    inputFingerprint,
    status: missingFormalRuleIdsInDocument.length === 0
      && missingObligations.length === 0
      && executionVerifiedRules === rules.length
      ? 'complete'
      : 'operational-with-gaps',
    authority: {
      businessRuleSourceOfTruth: authoritativeDocumentPath,
      derivedArtifactsAreAuthority: false,
      coverageUnit: 'mandatory-rule-obligation',
      caseCountIsCoverageUnit: false,
    },
    sourceFingerprints,
    summary: {
      formalRules: rules.length,
      mappedRules: lifecycle.summary?.mappedRules ?? 0,
      generationReadyRules: lifecycle.summary?.generationReadyRules ?? 0,
      generationBlockedRules: lifecycle.summary?.generationBlockedRules ?? 0,
      candidateRules: registry.summary?.candidates ?? candidateLedger.candidates?.length ?? 0,
      candidateReviewReady: registry.summary?.readyForFormalReview ?? 0,
      completionReviewsOpen: completion.summary?.totalReviews ?? 0,
      documentExplicitRules: documentRuleLedger.length,
      documentStatusCounts,
      formalRulesPresentInAuthoritativeDocument: rules.length - missingFormalRuleIdsInDocument.length,
      formalRulesMissingFromAuthoritativeDocument: missingFormalRuleIdsInDocument.length,
      ruleCaseBindings: rules.filter((rule: any) => rule.linkedCaseIds?.length > 0).length,
      ruleAutomationBindings: rules.filter((rule: any) => rule.linkedCaseIds?.every((caseId: string) => automationBindingCaseIds.has(caseId))).length,
      formalBusinessStructurallyCoveredRules: businessStructurallyCovered,
      formalBusinessPartialRules: coverage.filter((item) => item.businessAssessment.maturity === 'partial').length,
      formalAutomationStructurallyCoveredRules: automationStructurallyCovered,
      formalAutomationPartialRules: coverage.filter((item) => item.automationAssessment.maturity === 'partial').length,
      formalExecutionVerifiedRules: executionVerifiedRules,
      mandatoryObligations: combinedMandatory,
      coveredMandatoryObligations: combinedCovered,
      missingMandatoryObligations: combinedMandatory - combinedCovered,
      obligationCoverageRate: combinedMandatory === 0 ? null : combinedCovered / combinedMandatory,
      historicalCompleteReceiptsMapped: observationLedger.summary?.completeReceiptsMapped ?? 0,
      currentFingerprintMismatchCases: staleObservationCases.length,
      assertionContracts: assertions,
      rulesWithExplicitEffectiveContext: metadata.filter((item: any) => item.effectiveContextStatus === 'explicit').length,
      rulesWithUnknownEffectiveContext: metadata.filter((item: any) => item.effectiveContextStatus !== 'explicit').length,
      rulesWithConflictAssessment: metadata.filter((item: any) => item.conflictAssessment?.status === 'assessed-no-conflict').length,
      rulesWithoutConflictAssessment: metadata.filter((item: any) => item.conflictAssessment?.status !== 'assessed-no-conflict').length,
      currentEvaluationRuns: eventLedger.summary?.currentRuns ?? 0,
      currentEvaluatedRules: latestCurrentRun?.evaluatedRuleIds?.length ?? 0,
      currentNoChangeRules: latestCurrentRun?.decisionCounts?.['no-change'] ?? 0,
      currentCandidateRules: latestCurrentRun?.decisionCounts?.['candidate-created'] ?? 0,
      formalRuleUpdates: latestCurrentRun?.decisionCounts?.['formal-rule-updated'] ?? 0,
      latestCurrentRunId: latestCurrentRun?.runId ?? null,
    },
    documentRuleLedger,
    ruleCoverage: coverage.map((item) => {
      const rule: any = rules.find((candidate) => candidate.ruleId === item.ruleId);
      return {
        ruleId: item.ruleId,
        ruleFingerprint: rule?.ruleFingerprint ?? null,
        statement: item.statement,
        effectiveVersion: rule?.effectiveVersion ?? null,
        approvalAt: rule?.approval?.approvedAt ?? null,
        changedAt: rule?.governance?.changedAt ?? null,
        effectiveFrom: rule?.governance?.effectiveFrom ?? null,
        lastVerifiedAt: rule?.governance?.lastVerifiedAt ?? null,
        timeEvidenceStatus: rule?.governance?.timeEvidenceStatus ?? 'unknown',
        effectiveContextStatus: rule?.governance?.effectiveContextStatus ?? 'unknown',
        conflictAssessment: rule?.governance?.conflictAssessment ?? null,
        linkedCaseIds: item.linkedCaseIds,
        linkedBindingIds: [...(rule?.linkedBindingIds ?? [])],
        assertionCount: rule?.semantics?.assertionSurfaces?.length ?? 0,
        obligations: item.obligations,
        testCaseClaims: item.testCaseClaims,
        automationClaims: item.automationClaims,
        businessAssessment: item.businessAssessment,
        automationAssessment: item.automationAssessment,
        combinedAssessment: item.combinedAssessment,
        missingObligations: item.missingObligations,
        diagnostics: item.diagnostics,
      };
    }),
    coverageGapCandidates: missingObligations.map((item) => ({
      sourceRuleId: item.ruleId,
      obligationId: item.obligationId,
      dimension: item.dimension,
      statement: item.statement,
      candidateCaseId: null,
      status: 'candidate-not-registered',
      executionAuthorized: false,
    })),
    gaps: unique([
      ...(missingFormalRuleIdsInDocument.length > 0 ? ['FORMAL_RULE_MISSING_FROM_AUTHORITATIVE_DOCUMENT'] : []),
      ...(missingObligations.length > 0 ? ['FORMAL_RULE_OBLIGATION_COVERAGE_PARTIAL'] : []),
      ...(executionVerifiedRules < rules.length ? ['CURRENT_EXECUTION_OBLIGATION_EVIDENCE_MISSING'] : []),
      ...(staleObservationCases.length > 0 ? ['CURRENT_RECEIPT_FINGERPRINT_MISMATCH'] : []),
      ...(metadata.some((item: any) => item.timeEvidenceStatus !== 'complete') ? ['RULE_TIME_EVIDENCE_INCOMPLETE'] : []),
      ...(metadata.some((item: any) => item.effectiveContextStatus !== 'explicit') ? ['RULE_EFFECTIVE_CONTEXT_UNKNOWN'] : []),
      ...(registry.summary?.candidates > 0 ? ['TEST_PLAN_RULE_CANDIDATES_REMAIN_UNREVIEWED'] : []),
      ...(migration.status !== 'complete' || (migration.summary?.inventoryChanged ?? 0) > 0 ? ['MIGRATION_ACCEPTANCE_PENDING'] : []),
      ...(documentStatusCounts['document-registered-pending-lifecycle'] > 0 ? ['DOCUMENT_RULES_PENDING_LIFECYCLE_REVIEW'] : []),
      ...(documentStatusCounts.conflicted > 0 ? ['DOCUMENT_RULE_CONFLICTS_OPEN'] : []),
    ]),
    executionImpact: {
      existingPassedCasesInvalidated: false,
      rerunCaseIds: [],
      preservedPassedCaseIds: unique(rules.flatMap((rule) => rule.linkedCaseIds)),
      moduleDeliveryBlocked: false,
    },
    guardrails: {
      coverageReportMayChangeRuleState: false,
      coverageReportMayRegisterCandidateCase: false,
      noChangeMayTriggerRerun: false,
      oneBindingMayImplyFullCoverage: false,
      duplicateClaimsMayFillDifferentObligations: false,
      executionVerifiedRequiresCurrentFingerprintsAndObligationEvidence: true,
      candidateRequiresCompleteReceiptAndHumanApproval: true,
      externalTasksRemainFrozen: true,
    },
  };
  const withFingerprint = { ...report, fingerprint: sha256(stableStringify(report)) };
  writeJson(outputJsonPath, withFingerprint);
  writeText(outputMarkdownPath, renderMarkdown(withFingerprint));
  writeJson(documentOutputJsonPath, withFingerprint);
  writeText(documentOutputMarkdownPath, renderMarkdown(withFingerprint));
  return withFingerprint;
}

function buildCurrentIdentities(
  rule: ProductCenterFormalRule,
  landingCaseById: Map<string, any>,
  executionIndex: any,
) {
  return unique(rule.linkedCaseIds).flatMap((caseId) => {
    const expected = landingCaseById.get(caseId);
    const records = (executionIndex.records ?? [])
      .filter((item: any) => item.caseId === caseId && item.status === 'passed' && item.evidenceStatus === 'complete')
      .filter((item: any) => matchesExpectedCaseFingerprint(item, expected))
      .filter((item: any) => expected?.implementationFingerprintRequired === true
        ? normalizeFingerprint(item.implementationFingerprint) === normalizeFingerprint(expected.implementationFingerprint)
        : true)
      .filter((item: any) => normalizeFingerprint(item.executionContextFingerprint))
      .sort((left: any, right: any) => String(left.recordedAt).localeCompare(String(right.recordedAt)));
    const record = records.at(-1);
    return record ? [{
      caseId,
      caseFingerprint: normalizeFingerprint(record.caseFingerprint)!,
      implementationFingerprint: normalizeFingerprint(record.implementationFingerprint)!,
      executionContextFingerprint: normalizeFingerprint(record.executionContextFingerprint)!,
    }] : [];
  });
}

function buildCurrentEvidence(
  rule: ProductCenterFormalRule,
  landingCaseById: Map<string, any>,
  executionIndex: any,
  observationLedger: any,
) {
  const identities = buildCurrentIdentities(rule, landingCaseById, executionIndex);
  return identities
    .filter((identity) => (observationLedger.observations ?? []).some((item: any) => (
      item.ruleId === rule.ruleId && item.caseId === identity.caseId && item.result === 'supports'
      && item.contextStatus === 'matched' && (item.blockers ?? []).length === 0
    )))
    .map((identity) => ({
      evidenceId: `observation:${rule.ruleId}:${identity.caseId}`,
      caseId: identity.caseId,
      executionStatus: 'passed' as const,
      evidenceStatus: 'complete' as const,
      caseFingerprint: identity.caseFingerprint,
      implementationFingerprint: identity.implementationFingerprint,
      executionContextFingerprint: identity.executionContextFingerprint,
      verifiedObligationIds: [],
      assertionSurfaceIdsObserved: (rule.semantics.assertionSurfaces ?? []).map((item) => item.assertionId),
    }));
}

function matchesExpectedCaseFingerprint(record: any, expected: any): boolean {
  if (!expected) return false;
  if (expected.fingerprintMatchMode === 'semantic') {
    return Boolean(normalizeFingerprint(expected.semanticCaseFingerprint))
      && normalizeFingerprint(record.semanticCaseFingerprint) === normalizeFingerprint(expected.semanticCaseFingerprint);
  }
  return Boolean(normalizeFingerprint(expected.caseFingerprint))
    && normalizeFingerprint(record.caseFingerprint) === normalizeFingerprint(expected.caseFingerprint);
}

function normalizeFingerprint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/^sha256:/i, '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function renderMarkdown(report: any): string {
  const percent = (value: number | null) => value === null ? '-' : `${(value * 100).toFixed(2)}%`;
  return [
    '# 商品中心业务规则义务级覆盖与治理状态', '',
    `- 状态：${report.status}`,
    `- 唯一业务规则文件：${report.authority.businessRuleSourceOfTruth}`,
    `- 文档显式规则：${report.summary.documentExplicitRules}；正式规则：${report.summary.formalRules}；候选规则：${report.summary.candidateRules}`,
    `- 正式规则业务结构覆盖：${report.summary.formalBusinessStructurallyCoveredRules}/${report.summary.formalRules}；部分覆盖：${report.summary.formalBusinessPartialRules}`,
    `- 正式规则自动化结构覆盖：${report.summary.formalAutomationStructurallyCoveredRules}/${report.summary.formalRules}；部分覆盖：${report.summary.formalAutomationPartialRules}`,
    `- 当前执行验证：${report.summary.formalExecutionVerifiedRules}/${report.summary.formalRules}`,
    `- 必选义务：${report.summary.coveredMandatoryObligations}/${report.summary.mandatoryObligations}（${percent(report.summary.obligationCoverageRate)}）`,
    `- 历史完整收据映射：${report.summary.historicalCompleteReceiptsMapped}；当前指纹不匹配用例：${report.summary.currentFingerprintMismatchCases}`,
    `- 缺口：${report.gaps.join('、') || '无'}`,
    '',
    '| 规则 | 业务用例覆盖 | 自动化结构覆盖 | 当前执行验证 | 必选义务 | 缺失义务 |',
    '|---|---|---|---|---:|---|',
    ...report.ruleCoverage.map((item: any) => `| ${item.ruleId} | ${item.businessAssessment.maturity} | ${item.automationAssessment.maturity} | ${item.combinedAssessment.maturity === 'execution-verified' ? 'execution-verified' : 'not-currently-verified'} | ${item.combinedAssessment.coveredMandatoryObligations}/${item.combinedAssessment.mandatoryObligations} | ${item.missingObligations.map((gap: any) => gap.statement).join('；') || '无'} |`),
    '',
    '判定说明：分母是来源明确的必选业务义务，不是规则数或用例数。一条用例可以覆盖多个义务，但必须逐项声明；多条用例重复覆盖同一义务，不能补齐其他缺失义务。',
    '执行说明：结构覆盖不等于当前执行验证。只有当前用例指纹、自动化实现指纹、执行上下文和逐义务完整通过证据全部匹配，才可标记 execution-verified。',
    '影响说明：本报告只做静态治理，不修改规则、用例状态或执行授权，不触发现有业务用例重跑。',
    '',
  ].join('\n');
}

function resolveStableGeneratedAt(filePath: string, inputFingerprint: string): string {
  if (fs.existsSync(filePath)) {
    try {
      const current = readJson<any>(filePath);
      if (current.inputFingerprint === inputFingerprint && typeof current.generatedAt === 'string') return current.generatedAt;
    } catch {
      // A malformed previous derived artifact is replaced from authoritative inputs.
    }
  }
  return new Date().toISOString();
}

function listFormalCaseFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listFormalCaseFiles(fullPath);
    return entry.isFile() && /正式测试用例\.md$/u.test(entry.name) ? [fullPath] : [];
  }).sort();
}

function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function writeJson(filePath: string, value: unknown): void { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function writeText(filePath: string, value: string): void { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, value, 'utf8'); }
function fingerprintFile(filePath: string): string { return sha256(fs.readFileSync(filePath)); }
function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
function unique<T>(values: readonly T[]): T[] { return [...new Set(values)]; }

if (require.main === module) {
  try {
    const report = buildProductCenterBusinessRuleCoverage();
    process.stdout.write(`${JSON.stringify({ status: report.status, summary: report.summary, gaps: report.gaps })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
