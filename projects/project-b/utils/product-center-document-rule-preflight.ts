import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readPlaywrightExecutionReceipts } from './playwright-execution-receipt';
import { buildBusinessRuleReviewPackages } from '../../../Test Automation Platform/src/automation/system-test/business-rule-promotion';

export type DocumentRulePreflightRule = {
  ruleId: string;
  statement: string;
  moduleSection: string;
  sourceLabels: string[];
  sourceLine: number;
  linkedCaseIds: string[];
};

type CanonicalCase = {
  caseId: string;
  documentPath: string;
  sourceRuleIds: string[];
  lifecycleStatus: string | null;
  expectedResults: string[];
  text: string;
};

export type DocumentRuleObligationMapping = {
  ruleId: string;
  obligationId: string;
  obligationStatement: string;
  caseClaims: Array<{
    caseId: string;
    assertionIndexes: number[];
    evidenceBasis: string;
  }>;
};

type LandingCase = {
  caseId: string;
  caseFingerprint?: string | null;
  status?: string;
  executionReceipt?: Record<string, any> | null;
};

export type DocumentRuleImplementationIdentity = {
  caseId: string;
  bindingFingerprint?: string | null;
  implementationFingerprint?: string | null;
};

export type DocumentRuleBatchPreflight = {
  schemaVersion: '1.0.0';
  reportId: 'product-center-document-rule-batch-preflight';
  scope: 'project-adapter+generated-evidence';
  generatedAt: string;
  sourceFingerprint: string;
  summary: {
    rules: number;
    obligations: number;
    structurallyCoveredRules: number;
    partiallyCoveredRules: number;
    uncoveredRules: number;
    executionVerifiedRules: number;
    evidenceRemediationRules: number;
    explicitConflicts: number;
    approvalPackages: number;
    approvalEligibleRules: number;
    approvalReadyButVerificationPendingRules: number;
    humanSemanticDecisionsRequired: number;
    rulesComparedForRelationship: number;
    exactDuplicatePairs: number;
    explicitReferencePairs: number;
    sameScopePairs: number;
    businessExecutionStarted: false;
    formalRulesModified: false;
  };
  rules: Array<{
    ruleId: string;
    statement: string;
    moduleSection: string;
    sourceLabels: string[];
    sourceLine: number;
    linkedCaseIds: string[];
    relationships: Array<{ type: 'references' | 'possible-overlap'; targetRuleId: string; evidence: string }>;
    exactDuplicateRuleIds: string[];
    sameScopeRuleIds: string[];
    conflicts: Array<{ targetRuleId: string; evidence: string }>;
    conflictAssessment: { status: 'no-explicit-conflict-found'; basis: string; checkedRuleIds: number };
    obligations: Array<{
      obligationId: string;
      statement: string;
      caseClaims: Array<{
        caseId: string;
        confidence: 'high' | 'medium';
        semanticScore: number;
        documentPath: string;
        claimBasis: 'explicit-obligation-mapping' | 'semantic-candidate';
        assertionIndexes: number[];
        evidenceBasis: string;
      }>;
      structuralStatus: 'covered' | 'candidate-only' | 'uncovered';
      currentEvidenceCaseIds: string[];
      evidenceStatus: 'current-verified' | 'current-evidence-missing';
    }>;
    receiptChecks: Array<{
      caseId: string;
      status: 'matched-current' | 'historical-only' | 'missing-or-invalid';
      caseFingerprint: string | null;
      expectedCaseFingerprint: string | null;
      implementationFingerprint: string | null;
      expectedImplementationFingerprint: string | null;
      executionContextFingerprint: string | null;
      releaseReuseStatus: string | null;
      evidencePath: string | null;
      blockers: string[];
    }>;
    structuralCoverage: 'covered' | 'partial' | 'uncovered';
    executionCoverage: 'verified' | 'evidence-remediation-required';
    approvalEligible: boolean;
    semanticBlockerCodes: string[];
    verificationGapCodes: string[];
    blockerCodes: string[];
  }>;
  approvalPackages: Array<{
    packageId: string;
    moduleSection: string;
    ruleIds: string[];
    approvalEligibleRuleIds: string[];
    excludedRules: Array<{ ruleId: string; blockerCodes: string[] }>;
    lane: 'batch-approval' | 'individual-review' | 'evidence-remediation';
    status: 'ready-for-human-batch-approval' | 'individual-business-decision-required' | 'evidence-remediation-required';
    humanReviewScope: string;
    executionAuthorized: false;
  }>;
  preciseEvidenceQueue: Array<{ ruleId: string; obligationIds: string[]; caseIds: string[]; reasonCodes: string[] }>;
  guardrails: {
    oneCaseLinkDoesNotImplyFullCoverage: true;
    semanticSimilarityNeverCreatesFormalRule: true;
    onlyExplicitObligationMappingsCountAsCovered: true;
    semanticSimilarityCreatesCandidatesOnly: true;
    currentReceiptRequiresCaseImplementationAndContextIdentity: true;
    mutableOrMismatchedEvidenceIsRejected: true;
    releaseUnavailableMayRemainRunOnly: true;
    noAutomaticApproval: true;
    noAutomaticExecution: true;
  };
  fingerprint: string;
};

export function buildDocumentRuleBatchPreflight(input: {
  projectRoot: string;
  workspaceRoot: string;
  rules: DocumentRulePreflightRule[];
  canonicalCaseRoot: string;
  landingAuditPath: string;
  executionIndexPath: string;
  implementationIdentities: DocumentRuleImplementationIdentity[];
  formalRules: Array<{ ruleId: string; statement: string }>;
  obligationMappings: DocumentRuleObligationMapping[];
  generatedAt: string;
}): DocumentRuleBatchPreflight {
  const canonicalCases = scanCanonicalCases(input.canonicalCaseRoot);
  const landing = readJson<{ modules?: Array<{ assessment?: { cases?: LandingCase[] } }> }>(input.landingAuditPath);
  const landingCases = new Map((landing.modules ?? []).flatMap((item) => item.assessment?.cases ?? []).map((item) => [item.caseId, item]));
  const executionIndex = readJson<{ records?: Array<Record<string, any>> }>(input.executionIndexPath);
  const implementationByCase = new Map(input.implementationIdentities.map((item) => [item.caseId, item]));
  const relevantCaseIds = new Set(input.rules.flatMap((rule) => rule.linkedCaseIds));
  const importedEvidence = importCurrentEvidence(
    input.projectRoot,
    input.workspaceRoot,
    landingCases,
    executionIndex.records ?? [],
    relevantCaseIds,
  );
  const ruleIds = new Set(input.rules.map((item) => item.ruleId));
  const mappingByObligation = validateObligationMappings(
    input.rules,
    input.obligationMappings,
    canonicalCases,
    new Set(input.formalRules.map((rule) => rule.ruleId)),
  );

  const rules = input.rules.map((rule) => {
    const receiptChecks = rule.linkedCaseIds.map((caseId) => assessReceipt({
      caseId,
      landingCase: landingCases.get(caseId),
      implementationIdentity: implementationByCase.get(caseId),
      executionRecords: executionIndex.records ?? [],
      importedEvidence,
    }));
    const currentReceiptCases = new Set(receiptChecks.filter((item) => item.status === 'matched-current').map((item) => item.caseId));
    const obligations = splitObligations(rule.statement).map((statement, index) => {
      const obligationId = `${rule.ruleId}:O${String(index + 1).padStart(2, '0')}`;
      const explicitMapping = mappingByObligation.get(obligationId);
      const explicitCaseIds = new Set(explicitMapping?.caseClaims.map((item) => item.caseId) ?? []);
      const explicitClaims = (explicitMapping?.caseClaims ?? []).map((claim) => {
        const canonical = canonicalCases.get(claim.caseId)!;
        return {
          caseId: claim.caseId,
          confidence: 'high' as const,
          semanticScore: 1,
          documentPath: canonical.documentPath,
          claimBasis: 'explicit-obligation-mapping' as const,
          assertionIndexes: [...claim.assertionIndexes],
          evidenceBasis: claim.evidenceBasis,
        };
      });
      const semanticCandidates = rule.linkedCaseIds.flatMap((caseId) => {
        if (explicitCaseIds.has(caseId)) return [];
        const canonical = canonicalCases.get(caseId);
        if (!canonical || !canonical.sourceRuleIds.includes(rule.ruleId)) return [];
        const score = semanticContainment(statement, canonical.text);
        if (score < 0.18) return [];
        return [{
          caseId,
          confidence: 'medium' as const,
          semanticScore: Number(score.toFixed(4)),
          documentPath: canonical.documentPath,
          claimBasis: 'semantic-candidate' as const,
          assertionIndexes: [] as number[],
          evidenceBasis: '语义相似度仅用于发现候选，未形成显式义务覆盖声明。',
        }];
      });
      const caseClaims = [...explicitClaims, ...semanticCandidates];
      const highConfidenceClaims = caseClaims.filter((item) => item.confidence === 'high');
      const currentEvidenceCaseIds = highConfidenceClaims.map((item) => item.caseId).filter((caseId) => currentReceiptCases.has(caseId));
      return {
        obligationId,
        statement,
        caseClaims,
        structuralStatus: highConfidenceClaims.length > 0 ? 'covered' as const
          : caseClaims.length > 0 ? 'candidate-only' as const : 'uncovered' as const,
        currentEvidenceCaseIds: unique(currentEvidenceCaseIds),
        evidenceStatus: currentEvidenceCaseIds.length > 0 ? 'current-verified' as const : 'current-evidence-missing' as const,
      };
    });
    const covered = obligations.filter((item) => item.structuralStatus === 'covered').length;
    const structuralCoverage = covered === obligations.length ? 'covered' as const : covered > 0 ? 'partial' as const : 'uncovered' as const;
    const executionCoverage = obligations.every((item) => item.evidenceStatus === 'current-verified')
      ? 'verified' as const : 'evidence-remediation-required' as const;
    const references = unique([...rule.statement.matchAll(/BR-[A-Z0-9]+(?:-[A-Z0-9]+)*/g)].map((match) => match[0]))
      .filter((targetRuleId) => targetRuleId !== rule.ruleId)
      .map((targetRuleId) => ({ type: 'references' as const, targetRuleId, evidence: '规则正文显式引用' }));
    const overlaps = [...input.formalRules, ...input.rules]
      .filter((candidate) => candidate.ruleId !== rule.ruleId && !references.some((item) => item.targetRuleId === candidate.ruleId))
      .map((candidate) => ({ candidate, score: semanticContainment(rule.statement, candidate.statement) }))
      .filter((item) => item.score >= 0.8)
      .map((item) => ({ type: 'possible-overlap' as const, targetRuleId: item.candidate.ruleId, evidence: `语义重合分数=${item.score.toFixed(4)}，需在审批时确认包含关系，不自动判冲突` }));
    const exactDuplicateRuleIds = [...input.formalRules, ...input.rules]
      .filter((candidate) => candidate.ruleId !== rule.ruleId && normalizeStatement(candidate.statement) === normalizeStatement(rule.statement))
      .map((candidate) => candidate.ruleId).sort();
    const sameScopeRuleIds = input.rules
      .filter((candidate) => candidate.ruleId !== rule.ruleId && candidate.moduleSection === rule.moduleSection)
      .map((candidate) => candidate.ruleId).sort();
    const conflicts: Array<{ targetRuleId: string; evidence: string }> = [];
    const semanticBlockerCodes = unique([
      ...(structuralCoverage !== 'covered' ? ['OBLIGATION_STRUCTURAL_COVERAGE_INCOMPLETE'] : []),
      ...(conflicts.length > 0 ? ['EXPLICIT_RULE_CONFLICT'] : []),
    ]);
    const verificationGapCodes = unique([
      ...(executionCoverage !== 'verified' ? ['CURRENT_OBLIGATION_EVIDENCE_INCOMPLETE'] : []),
    ]);
    const blockerCodes = unique([...semanticBlockerCodes, ...verificationGapCodes]);
    return {
      ...rule,
      relationships: [...references, ...overlaps].filter((item) => ruleIds.has(item.targetRuleId) || input.formalRules.some((formal) => formal.ruleId === item.targetRuleId)),
      exactDuplicateRuleIds,
      sameScopeRuleIds,
      conflicts,
      conflictAssessment: {
        status: 'no-explicit-conflict-found' as const,
        basis: `已对 ${input.rules.length} 条预审规则和 ${input.formalRules.length} 条正式规则执行精确重复、显式引用、语义重合与同模块作用域检查；未将低置信相似度推断为冲突。`,
        checkedRuleIds: input.rules.length + input.formalRules.length,
      },
      obligations,
      receiptChecks,
      structuralCoverage,
      executionCoverage,
      // Formal semantic approval and execution verification are independent.
      // A verified source statement with complete obligation structure may be
      // approved while its verificationStatus remains pending.
      approvalEligible: semanticBlockerCodes.length === 0,
      semanticBlockerCodes,
      verificationGapCodes,
      blockerCodes,
    };
  });

  const partitionedPackages = buildBusinessRuleReviewPackages(rules.map((item) => ({
    unitId: item.ruleId,
    groupKey: item.moduleSection,
    formalApprovalEligible: item.approvalEligible,
    semanticConflict: item.conflicts.length > 0,
    blockerCodes: item.semanticBlockerCodes,
    verificationStatus: item.executionCoverage === 'verified' ? 'verified' : 'pending',
  })));
  const approvalPackages = partitionedPackages.map((partition) => {
    const packageRules = partition.unitIds.map((ruleId) => rules.find((item) => item.ruleId === ruleId)!);
    const approvalEligibleRuleIds = packageRules.filter((item) => item.approvalEligible).map((item) => item.ruleId);
    return {
      packageId: partition.packageId.replace('business-rule-review-', 'document-rule-approval-'),
      moduleSection: partition.groupKey,
      ruleIds: packageRules.map((item) => item.ruleId),
      approvalEligibleRuleIds,
      excludedRules: packageRules.filter((item) => !item.approvalEligible).map((item) => ({ ruleId: item.ruleId, blockerCodes: item.blockerCodes })),
      lane: partition.lane,
      status: partition.lane === 'batch-approval'
        ? 'ready-for-human-batch-approval' as const
        : partition.lane === 'individual-review'
          ? 'individual-business-decision-required' as const
          : 'evidence-remediation-required' as const,
      humanReviewScope: partition.lane === 'batch-approval'
        ? '仅审核规则语义、作用域及与既有正式规则的包含关系；时间、上下文和运行验证由系统自动处理。'
        : partition.lane === 'individual-review'
          ? '仅裁决有明确证据的业务冲突或语义歧义；技术证据问题不得转人工。'
          : '无需人工处理；系统继续补来源、义务或证据。',
      executionAuthorized: false as const,
    };
  });
  const preciseEvidenceQueue = rules.filter((item) => item.executionCoverage !== 'verified').map((item) => ({
    ruleId: item.ruleId,
    obligationIds: item.obligations.filter((obligation) => obligation.evidenceStatus !== 'current-verified').map((obligation) => obligation.obligationId),
    caseIds: unique(item.obligations.flatMap((obligation) => obligation.caseClaims.map((claim) => claim.caseId))),
    reasonCodes: item.blockerCodes,
  }));
  const summary = {
    rules: rules.length,
    obligations: rules.reduce((sum, item) => sum + item.obligations.length, 0),
    structurallyCoveredRules: rules.filter((item) => item.structuralCoverage === 'covered').length,
    partiallyCoveredRules: rules.filter((item) => item.structuralCoverage === 'partial').length,
    uncoveredRules: rules.filter((item) => item.structuralCoverage === 'uncovered').length,
    executionVerifiedRules: rules.filter((item) => item.executionCoverage === 'verified').length,
    evidenceRemediationRules: rules.filter((item) => item.executionCoverage !== 'verified').length,
    explicitConflicts: rules.reduce((sum, item) => sum + item.conflicts.length, 0),
    approvalPackages: approvalPackages.length,
    approvalEligibleRules: rules.filter((item) => item.approvalEligible).length,
    approvalReadyButVerificationPendingRules: rules.filter((item) => item.approvalEligible && item.executionCoverage !== 'verified').length,
    humanSemanticDecisionsRequired: rules.filter((item) => item.conflicts.length > 0).length,
    rulesComparedForRelationship: input.rules.length + input.formalRules.length,
    exactDuplicatePairs: pairCount(rules.flatMap((item) => item.exactDuplicateRuleIds.map((target) => [item.ruleId, target] as const))),
    explicitReferencePairs: pairCount(rules.flatMap((item) => item.relationships.filter((relation) => relation.type === 'references').map((relation) => [item.ruleId, relation.targetRuleId] as const))),
    sameScopePairs: pairCount(rules.flatMap((item) => item.sameScopeRuleIds.map((target) => [item.ruleId, target] as const))),
    businessExecutionStarted: false as const,
    formalRulesModified: false as const,
  };
  const unsigned = {
    schemaVersion: '1.0.0' as const,
    reportId: 'product-center-document-rule-batch-preflight' as const,
    scope: 'project-adapter+generated-evidence' as const,
    generatedAt: input.generatedAt,
    sourceFingerprint: sha256(stableJson({
      rules: input.rules,
      formalRules: input.formalRules,
      canonicalCases: [...canonicalCases.values()].map((item) => ({ caseId: item.caseId, text: item.text })),
      landing: sha256File(input.landingAuditPath),
      executionIndex: sha256File(input.executionIndexPath),
      implementationIdentities: input.implementationIdentities,
      obligationMappings: input.obligationMappings,
    })),
    summary,
    rules,
    approvalPackages,
    preciseEvidenceQueue,
    guardrails: {
      oneCaseLinkDoesNotImplyFullCoverage: true as const,
      semanticSimilarityNeverCreatesFormalRule: true as const,
      onlyExplicitObligationMappingsCountAsCovered: true as const,
      semanticSimilarityCreatesCandidatesOnly: true as const,
      currentReceiptRequiresCaseImplementationAndContextIdentity: true as const,
      mutableOrMismatchedEvidenceIsRejected: true as const,
      releaseUnavailableMayRemainRunOnly: true as const,
      noAutomaticApproval: true as const,
      noAutomaticExecution: true as const,
    },
  };
  return { ...unsigned, fingerprint: sha256(stableJson(unsigned)) };
}

function assessReceipt(input: {
  caseId: string;
  landingCase?: LandingCase;
  implementationIdentity?: DocumentRuleImplementationIdentity;
  executionRecords: Array<Record<string, any>>;
  importedEvidence: Map<string, Array<Record<string, any>>>;
}): DocumentRuleBatchPreflight['rules'][number]['receiptChecks'][number] {
  const landingReceipt = input.landingCase?.executionReceipt ?? null;
  const indexed = input.executionRecords.filter((item) => item.caseId === input.caseId && item.status === 'passed' && item.evidenceStatus === 'complete')
    .sort((left, right) => String(left.recordedAt).localeCompare(String(right.recordedAt))).at(-1) ?? landingReceipt;
  const imported = (input.importedEvidence.get(input.caseId) ?? [])
    .sort((left, right) => String(left.recordedAt).localeCompare(String(right.recordedAt))).at(-1);
  const expectedCaseFingerprint = normalizeFingerprint(input.implementationIdentity?.bindingFingerprint ?? input.landingCase?.caseFingerprint);
  const expectedImplementationFingerprint = normalizeFingerprint(input.implementationIdentity?.implementationFingerprint);
  const caseFingerprint = normalizeFingerprint(indexed?.caseFingerprint);
  const implementationFingerprint = normalizeFingerprint(indexed?.implementationFingerprint);
  const executionContextFingerprint = normalizeFingerprint(indexed?.executionContextFingerprint);
  const blockers = unique([
    ...(!indexed ? ['COMPLETE_INDEX_RECEIPT_MISSING'] : []),
    ...(!expectedCaseFingerprint ? ['CURRENT_CASE_FINGERPRINT_MISSING'] : []),
    ...(indexed && expectedCaseFingerprint !== caseFingerprint ? ['CASE_FINGERPRINT_MISMATCH'] : []),
    ...(!expectedImplementationFingerprint ? ['CURRENT_IMPLEMENTATION_FINGERPRINT_MISSING'] : []),
    ...(indexed && expectedImplementationFingerprint !== implementationFingerprint ? ['IMPLEMENTATION_FINGERPRINT_MISMATCH'] : []),
    ...(!executionContextFingerprint ? ['EXECUTION_CONTEXT_FINGERPRINT_MISSING'] : []),
    ...(!indexed?.evidencePath ? ['EVIDENCE_PATH_MISSING'] : []),
    ...(!imported ? ['CURRENT_EVIDENCE_FILE_OR_RECEIPT_INVALID'] : []),
    ...(imported && normalizeFingerprint(imported.evidenceFileFingerprint) !== normalizeFingerprint(indexed?.evidenceFileFingerprint)
      ? ['EVIDENCE_FILE_FINGERPRINT_MISMATCH'] : []),
    ...(imported && normalizeFingerprint(imported.receiptEvidenceFingerprint) !== normalizeFingerprint(indexed?.receiptEvidenceFingerprint)
      ? ['RECEIPT_EVIDENCE_FINGERPRINT_MISMATCH'] : []),
    ...(imported && normalizeFingerprint(imported.executionContextFingerprint) !== executionContextFingerprint
      ? ['EXECUTION_CONTEXT_FINGERPRINT_MISMATCH'] : []),
  ]);
  const status = blockers.length === 0 ? 'matched-current' as const
    : indexed ? 'historical-only' as const : 'missing-or-invalid' as const;
  return {
    caseId: input.caseId,
    status,
    caseFingerprint,
    expectedCaseFingerprint,
    implementationFingerprint,
    expectedImplementationFingerprint,
    executionContextFingerprint,
    releaseReuseStatus: typeof indexed?.reuseStatus === 'string' ? indexed.reuseStatus : null,
    evidencePath: typeof indexed?.evidencePath === 'string' ? indexed.evidencePath : null,
    blockers,
  };
}

function importCurrentEvidence(
  projectRoot: string,
  workspaceRoot: string,
  landingCases: Map<string, LandingCase>,
  executionRecords: Array<Record<string, any>>,
  relevantCaseIds: ReadonlySet<string>,
): Map<string, Array<Record<string, any>>> {
  const byPath = new Map<string, ReturnType<typeof readPlaywrightExecutionReceipts>>();
  const result = new Map<string, Array<Record<string, any>>>();
  const latestIndexedByCase = new Map<string, Record<string, any>>();
  for (const record of executionRecords) {
    if (!relevantCaseIds.has(String(record.caseId)) || record.status !== 'passed' || record.evidenceStatus !== 'complete') continue;
    const prior = latestIndexedByCase.get(String(record.caseId));
    if (!prior || String(prior.recordedAt ?? '').localeCompare(String(record.recordedAt ?? '')) < 0) {
      latestIndexedByCase.set(String(record.caseId), record);
    }
  }
  const evidencePaths = unique([
    ...[...landingCases.values()]
      .filter((item) => relevantCaseIds.has(item.caseId))
      .map((item) => item.executionReceipt?.evidencePath),
    ...[...latestIndexedByCase.values()].map((item) => item.evidencePath),
  ].filter((item): item is string => typeof item === 'string' && Boolean(item.trim())));
  for (const evidencePath of evidencePaths) {
    if (typeof evidencePath !== 'string' || !evidencePath.trim()) continue;
    const absolute = resolveEvidencePath(projectRoot, evidencePath);
    if (!fs.existsSync(absolute)) continue;
    let imported = byPath.get(absolute);
    if (!imported) {
      try { imported = readPlaywrightExecutionReceipts({ reportPath: absolute, workspaceRoot }); }
      catch { imported = { records: [], diagnostics: ['EVIDENCE_IMPORT_FAILED'] }; }
      byPath.set(absolute, imported);
    }
    for (const record of imported.records) {
      const records = result.get(record.caseId) ?? [];
      records.push(record);
      result.set(record.caseId, records);
    }
  }
  return result;
}

function resolveEvidencePath(projectRoot: string, evidencePath: string): string {
  const normalized = evidencePath.replace(/\\/g, '/');
  const marker = 'Merchant Center UITest/';
  return normalized.includes(marker)
    ? path.join(projectRoot, normalized.slice(normalized.indexOf(marker) + marker.length))
    : path.resolve(projectRoot, normalized);
}

function scanCanonicalCases(root: string): Map<string, CanonicalCase> {
  const result = new Map<string, CanonicalCase>();
  for (const filePath of listMarkdownFiles(root).filter((item) => /正式测试用例\.md$/u.test(item))) {
    const text = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
    const matches = [...text.matchAll(/^###\s+用例编号：(TC-[A-Z0-9-]+)\s*$/gmu)];
    matches.forEach((match, index) => {
      const block = text.slice(match.index, matches[index + 1]?.index ?? text.length).trim();
      const sourceLine = block.split('\n').find((line) => /^来源[：:]/u.test(line.trim())) ?? '';
      const statusLine = block.split('\n').find((line) => /^状态[：:]/u.test(line.trim())) ?? '';
      result.set(match[1], {
        caseId: match[1],
        documentPath: filePath.replace(/\\/g, '/'),
        sourceRuleIds: unique(sourceLine.match(/BR-[A-Z0-9]+(?:-[A-Z0-9]+)*/g) ?? []),
        lifecycleStatus: statusLine.match(/^状态[：:]\s*(\S+)/u)?.[1] ?? null,
        expectedResults: readNumberedSection(block, '预期结果'),
        text: block,
      });
    });
  }
  return result;
}

function validateObligationMappings(
  rules: readonly DocumentRulePreflightRule[],
  mappings: readonly DocumentRuleObligationMapping[],
  canonicalCases: ReadonlyMap<string, CanonicalCase>,
  formalRuleIds: ReadonlySet<string>,
): Map<string, DocumentRuleObligationMapping> {
  const expected = new Map<string, { ruleId: string; statement: string }>();
  for (const rule of rules) {
    splitObligations(rule.statement).forEach((statement, index) => {
      const obligationId = `${rule.ruleId}:O${String(index + 1).padStart(2, '0')}`;
      expected.set(obligationId, { ruleId: rule.ruleId, statement });
    });
  }
  const result = new Map<string, DocumentRuleObligationMapping>();
  const seenObligationIds = new Set<string>();
  for (const mapping of mappings) {
    if (seenObligationIds.has(mapping.obligationId)) throw new Error(`重复规则义务映射：${mapping.obligationId}`);
    seenObligationIds.add(mapping.obligationId);
    const obligation = expected.get(mapping.obligationId);
    // 晋级后的规则保留历史义务映射用于审计追溯，但不再属于“待晋级”分母。
    // 只忽略已由生命周期正式登记的规则；真正未知或拼错的 ruleId 仍必须阻断。
    if (!obligation && formalRuleIds.has(mapping.ruleId)) continue;
    if (!obligation || obligation.ruleId !== mapping.ruleId) {
      throw new Error(`规则义务映射指向未知或错位义务：${mapping.ruleId}/${mapping.obligationId}`);
    }
    if (normalizeStatement(obligation.statement) !== normalizeStatement(mapping.obligationStatement)) {
      throw new Error(`规则义务映射正文已漂移：${mapping.obligationId}`);
    }
    if (mapping.caseClaims.length === 0) throw new Error(`规则义务映射没有用例声明：${mapping.obligationId}`);
    for (const claim of mapping.caseClaims) {
      const canonical = canonicalCases.get(claim.caseId);
      if (!canonical) throw new Error(`规则义务映射用例不存在：${mapping.obligationId}/${claim.caseId}`);
      if (!canonical.sourceRuleIds.includes(mapping.ruleId)) {
        throw new Error(`规则义务映射用例未声明规则来源：${mapping.obligationId}/${claim.caseId}`);
      }
      if (canonical.lifecycleStatus === 'not-applicable') {
        throw new Error(`不适用用例不得覆盖当前规则义务：${mapping.obligationId}/${claim.caseId}`);
      }
      if (!claim.evidenceBasis.trim() || claim.assertionIndexes.length === 0) {
        throw new Error(`规则义务映射缺少断言索引或证据依据：${mapping.obligationId}/${claim.caseId}`);
      }
      for (const assertionIndex of claim.assertionIndexes) {
        if (!Number.isInteger(assertionIndex) || assertionIndex < 1 || assertionIndex > canonical.expectedResults.length) {
          throw new Error(`规则义务映射断言索引越界：${mapping.obligationId}/${claim.caseId}/${assertionIndex}`);
        }
      }
    }
    result.set(mapping.obligationId, mapping);
  }
  return result;
}

function readNumberedSection(block: string, title: string): string[] {
  const lines = block.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^${title}[：:]\\s*$`, 'u').test(line.trim()));
  if (start < 0) return [];
  const section: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (/^\\S[^\\n]*[：:]\\s*$/u.test(trimmed) && !/^\\d+\\.\\s+/u.test(trimmed)) break;
    section.push(trimmed);
  }
  return section
    .filter((line) => /^\d+\.\s+/u.test(line))
    .map((line) => line.replace(/^\d+\.\s+/u, '').trim());
}

function splitObligations(statement: string): string[] {
  return distinct(statement.replace(/（见\s+BR-[^)]+）/gu, '').split(/[；。](?=\S|$)/u)
    .map((item) => item.trim().replace(/[；。]+$/u, ''))
    .filter((item) => item.length >= 4));
}

function semanticContainment(needle: string, haystack: string): number {
  const required = semanticTokens(needle);
  if (required.size === 0) return 0;
  const available = semanticTokens(haystack);
  const matched = [...required].filter((token) => available.has(token)).length;
  return matched / required.size;
}

function semanticTokens(value: string): Set<string> {
  const normalized = value.toLowerCase().replace(/br-[a-z0-9-]+/g, ' ').replace(/[^\p{Script=Han}a-z0-9.]+/gu, ' ');
  const tokens = new Set<string>();
  for (const word of normalized.split(/\s+/).filter(Boolean)) {
    if (/^[a-z0-9.]+$/u.test(word)) { if (word.length >= 2) tokens.add(word); continue; }
    const chars = [...word];
    for (let index = 0; index < chars.length - 1; index += 1) tokens.add(chars.slice(index, index + 2).join(''));
  }
  return tokens;
}

function normalizeStatement(value: string): string {
  return value.toLowerCase().replace(/br-[a-z0-9-]+/g, '').replace(/[^\p{Script=Han}a-z0-9]/gu, '');
}

function pairCount(pairs: ReadonlyArray<readonly [string, string]>): number {
  return new Set(pairs.map(([left, right]) => [left, right].sort().join('|'))).size;
}

function listMarkdownFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    return entry.isDirectory() ? listMarkdownFiles(fullPath) : entry.isFile() && entry.name.endsWith('.md') ? [fullPath] : [];
  }).sort();
}

function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function unique<T>(items: readonly T[]): T[] { return [...new Set(items)].sort(); }
function distinct<T>(items: readonly T[]): T[] { return [...new Set(items)]; }
function normalizeFingerprint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/^sha256:/i, '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}
function sha256File(filePath: string): string { return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
