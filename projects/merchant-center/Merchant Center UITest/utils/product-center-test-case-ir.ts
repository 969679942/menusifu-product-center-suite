import {
  auditProductCenterCoverage,
  selectProductCenterCoverageDenominator,
  type ProductCenterCoverageItem,
} from './product-center-coverage-denominator';
import {
  auditProductCenterTestCaseExecutability,
  type ProductCenterExecutabilityIssueCode,
} from './product-center-test-case-executability';
import {
  auditProductCenterTestCaseSemantics,
  type ProductCenterSemanticIssueCode,
} from './product-center-test-case-semantics';

export type ProductCenterTestCasePriority = 'P0' | 'P1' | 'P2';
export type ProductCenterAutomationDecision = 'eligible' | 'review-required' | 'manual';
export type ProductCenterEvidenceLevel = 'confirmed' | 'observed' | 'inferred' | 'conflicting';
export type ProductCenterClaimKind = 'precondition' | 'action' | 'expectation';
export type ProductCenterVerificationSignal = 'api' | 'ui' | 'network' | 'download' | 'background-job';
export type ProductCenterBusinessBasisKind =
  | 'prd-explicit'
  | 'business-rule-explicit'
  | 'xmind-existing'
  | 'single-step-inference'
  | 'legacy-baseline';
export type ProductCenterExecutionEvidenceKind =
  | 'contract-observed'
  | 'runtime-confirmed'
  | 'human-confirmed';

export type ProductCenterClaimSourceTrace = {
  businessBasis: {
    kind: ProductCenterBusinessBasisKind;
    refs: string[];
    rationale?: string;
    hopCount?: 1;
  };
  executionEvidence: Array<{
    kind: ProductCenterExecutionEvidenceKind;
    sourceIds: string[];
  }>;
};

export type ProductCenterTestCaseClaim = {
  id: string;
  kind: ProductCenterClaimKind;
  text: string;
  sourceIds: string[];
  sourceRefs?: string[];
  evidenceLevel: ProductCenterEvidenceLevel;
  sourceTrace?: ProductCenterClaimSourceTrace;
};

export type ProductCenterTestCaseExecution = {
  roleIds: string[];
  environmentIds: string[];
  capabilityIds: string[];
  mutationMode: 'none' | 'ui-create' | 'api-seeded-ui-action';
  verificationSignals: ProductCenterVerificationSignal[];
  seedAdapterIds: string[];
  cleanupAdapterIds: string[];
  asyncPolicy: 'none' | 'eventual-consistency' | 'background-job';
};
export type ProductCenterTestCaseAuditIssueCode =
  | 'DUPLICATE_ID'
  | 'SOURCE_REQUIRED'
  | 'UNKNOWN_SOURCE'
  | 'ACTION_REQUIRED'
  | 'EXPECTATION_REQUIRED'
  | 'CLEANUP_REQUIRED';

export type ProductCenterTestCaseInput = {
  id: string;
  module: string;
  route: string;
  title: string;
  priority: ProductCenterTestCasePriority;
  sourceIds: string[];
  sourceRefs?: string[];
  preconditions: string[];
  actions: string[];
  expectedResults: string[];
  mutatesData: boolean;
  cleanup: string[];
  automationPreference?: 'candidate' | 'manual';
  claims?: ProductCenterTestCaseClaim[];
  coverageIds?: string[];
  execution?: ProductCenterTestCaseExecution;
};

export type ProductCenterTestCaseDraftClaim = Omit<ProductCenterTestCaseClaim, 'sourceIds'> & {
  sourceRefs: string[];
};

export type ProductCenterTestCaseDraft = Omit<ProductCenterTestCaseInput, 'sourceIds' | 'claims'> & {
  sourceRefs: string[];
  claims: ProductCenterTestCaseDraftClaim[];
  coverageIds: string[];
  execution: ProductCenterTestCaseExecution;
};

export type ProductCenterTestCaseSourceBinding = {
  ref: string;
  sourceIds: string[];
};

export type ProductCenterTestCaseDraftDocument = {
  schemaVersion: '1.0.0';
  cases: ProductCenterTestCaseDraft[];
};

export type ProductCenterTestCaseDraftValidationIssue = {
  path: string;
  message: string;
};

export type ProductCenterTestCaseAuditIssue = {
  code: ProductCenterTestCaseAuditIssueCode;
  message: string;
};

export type ProductCenterAuditedTestCase = ProductCenterTestCaseInput & {
  issues: ProductCenterTestCaseAuditIssue[];
  automation: {
    decision: ProductCenterAutomationDecision;
    reasons: ProductCenterTestCaseAuditIssueCode[];
  };
};

export type ProductCenterTestCaseIntakeScope = 'case-only' | 'module-full' | 'full';

export type ProductCenterTestCaseIntakeOptions = {
  scope: ProductCenterTestCaseIntakeScope;
  knownSourceIds: ReadonlySet<string>;
  denominator: readonly ProductCenterCoverageItem[];
  moduleIds?: ReadonlySet<string>;
  routes?: ReadonlySet<string>;
  knownRoleIds?: ReadonlySet<string>;
  knownEnvironmentIds?: ReadonlySet<string>;
  knownCapabilityIds?: ReadonlySet<string>;
  requireSourceTrace?: boolean;
};

export type ProductCenterTestCaseGenerationGateIssueCode =
  | ProductCenterTestCaseAuditIssueCode
  | ProductCenterSemanticIssueCode
  | ProductCenterExecutabilityIssueCode
  | 'UNRESOLVED_SOURCE'
  | 'UNKNOWN_COVERAGE';

export type ProductCenterGeneratedTestCase = {
  caseId: string;
  title: string;
  module: string;
  route: string;
  coverageIds: string[];
  sourceIds: string[];
  businessBasisKinds: ProductCenterBusinessBasisKind[];
};

export type ProductCenterReviewRequiredTestCase = ProductCenterGeneratedTestCase & {
  issueCodes: ProductCenterTestCaseGenerationGateIssueCode[];
  issues: string[];
};

export type ProductCenterBlockedCoverage = {
  coverageId: string;
  module: string;
  route: string;
  sourceIds: string[];
};

export type ProductCenterIntentionallyOmittedCoverage = ProductCenterBlockedCoverage & {
  disposition: 'blocked' | 'not-applicable';
  reason?: string;
};

export type ProductCenterTestCaseGenerationGate = {
  status: 'passed' | 'review-required' | 'blocked';
  summary: {
    totalCases: number;
    generated: number;
    reviewRequired: number;
    blocked: number;
    intentionallyOmitted: number;
  };
  generated: ProductCenterGeneratedTestCase[];
  reviewRequired: ProductCenterReviewRequiredTestCase[];
  blocked: ProductCenterBlockedCoverage[];
  intentionallyOmitted: ProductCenterIntentionallyOmittedCoverage[];
  modules: ProductCenterTestCaseGenerationGateModuleSummary[];
};

export type ProductCenterTestCaseGenerationGateModuleSummary = {
  module: string;
  generated: number;
  reviewRequired: number;
  blocked: number;
  intentionallyOmitted: number;
  generatedCaseIds: string[];
  reviewRequiredCaseIds: string[];
  blockedCoverageIds: string[];
  intentionallyOmittedCoverageIds: string[];
};

export function validateProductCenterTestCaseDraftDocument(input: unknown): {
  valid: boolean;
  cases: ProductCenterTestCaseDraft[];
  issues: ProductCenterTestCaseDraftValidationIssue[];
} {
  const issues: ProductCenterTestCaseDraftValidationIssue[] = [];
  if (!isRecord(input)) return invalidDocument([{ path: '$', message: '用例文档必须是对象' }]);
  if (input.schemaVersion !== '1.0.0') {
    issues.push({ path: 'schemaVersion', message: 'schemaVersion 必须为 1.0.0' });
  }
  if (!Array.isArray(input.cases)) {
    issues.push({ path: 'cases', message: 'cases 必须是数组' });
    return invalidDocument(issues);
  }

  input.cases.forEach((item, index) => validateDraft(item, index, issues));
  return {
    valid: issues.length === 0,
    cases: issues.length === 0 ? input.cases as ProductCenterTestCaseDraft[] : [],
    issues,
  };
}

export function processProductCenterTestCaseIntake(
  document: unknown,
  bindings: readonly ProductCenterTestCaseSourceBinding[],
  options: ProductCenterTestCaseIntakeOptions,
) {
  const validation = validateProductCenterTestCaseDraftDocument(document);
  if (!validation.valid) {
    return {
      status: 'invalid' as const,
      schemaIssues: validation.issues,
      unresolvedSources: [] as Array<{ caseId: string; claimId?: string; ref: string }>,
      normalizedCases: undefined,
      baseAudit: undefined,
      semanticAudit: undefined,
      coverageAudit: undefined,
      executabilityAudit: undefined,
      corrections: [],
      generationGate: undefined,
    };
  }

  const normalized = normalizeProductCenterTestCaseDrafts(validation.cases, bindings);
  const baseAudit = auditProductCenterTestCases(normalized.cases, { knownSourceIds: options.knownSourceIds });
  const semanticAudit = auditProductCenterTestCaseSemantics(normalized.cases, {
    knownSourceIds: options.knownSourceIds,
    requireSourceTrace: options.requireSourceTrace,
  });
  const denominator = selectIntakeDenominator(options);
  const coverageAudit = auditProductCenterCoverage(normalized.cases, denominator, {
    matchingMode: options.scope === 'case-only' ? 'explicit-or-source' : 'explicit-only',
  });
  const executabilityAudit = auditProductCenterTestCaseExecutability(normalized.cases, {
    roleIds: options.knownRoleIds,
    environmentIds: options.knownEnvironmentIds,
    capabilityIds: options.knownCapabilityIds,
  });
  const generationGate = auditProductCenterTestCaseGenerationGate(normalized.cases, {
    scope: options.scope,
    denominator,
    baseAudit,
    semanticAudit,
    executabilityAudit,
    coverageAudit,
    unresolvedSources: normalized.unresolvedSources,
  });
  const requiresReview = normalized.unresolvedSources.length > 0
    || baseAudit.summary.reviewRequired > 0
    || semanticAudit.summary.reviewRequired > 0
    || executabilityAudit.summary.reviewRequired > 0
    || coverageAudit.unknownCoverageIds.length > 0
    || (options.scope !== 'case-only' && coverageAudit.summary.missing > 0);
  return {
    status: requiresReview ? 'review-required' as const : 'passed' as const,
    schemaIssues: validation.issues,
    unresolvedSources: normalized.unresolvedSources,
    normalizedCases: normalized.cases,
    baseAudit,
    semanticAudit,
    coverageAudit,
    executabilityAudit,
    corrections: semanticAudit.corrections,
    generationGate,
  };
}

export function auditProductCenterTestCaseGenerationGate(
  cases: readonly ProductCenterTestCaseInput[],
  options: {
    scope: ProductCenterTestCaseIntakeScope;
    denominator: readonly ProductCenterCoverageItem[];
    unresolvedSources?: ReadonlyArray<{ caseId: string; claimId?: string; ref: string }>;
    baseAudit?: ReturnType<typeof auditProductCenterTestCases>;
    semanticAudit?: ReturnType<typeof auditProductCenterTestCaseSemantics>;
    executabilityAudit?: ReturnType<typeof auditProductCenterTestCaseExecutability>;
    coverageAudit?: ReturnType<typeof auditProductCenterCoverage>;
  },
): ProductCenterTestCaseGenerationGate {
  const baseAudit = options.baseAudit ?? auditProductCenterTestCases(cases);
  const semanticAudit = options.semanticAudit ?? auditProductCenterTestCaseSemantics(cases);
  const executabilityAudit = options.executabilityAudit ?? auditProductCenterTestCaseExecutability(cases);
  const coverageAudit = options.coverageAudit ?? auditProductCenterCoverage(cases, options.denominator, {
    matchingMode: options.scope === 'case-only' ? 'explicit-or-source' : 'explicit-only',
  });
  const issuesByCaseId = new Map<string, { codes: Set<ProductCenterTestCaseGenerationGateIssueCode>; messages: string[] }>();
  const append = (
    caseId: string,
    code: ProductCenterTestCaseGenerationGateIssueCode,
    message: string,
  ) => {
    const current = issuesByCaseId.get(caseId) ?? { codes: new Set<ProductCenterTestCaseGenerationGateIssueCode>(), messages: [] };
    current.codes.add(code);
    current.messages.push(message);
    issuesByCaseId.set(caseId, current);
  };

  for (const item of baseAudit.cases) {
    item.issues.forEach((issue) => append(item.id, issue.code, issue.message));
  }
  for (const item of semanticAudit.cases) {
    item.issues.forEach((issue) => append(item.caseId, issue.code, issue.message));
  }
  for (const item of executabilityAudit.cases) {
    item.issues.forEach((issue) => append(item.caseId, issue.code, issue.message));
  }
  for (const issue of options.unresolvedSources ?? []) {
    append(issue.caseId, 'UNRESOLVED_SOURCE', issue.claimId
      ? `语句来源未绑定：${issue.claimId} -> ${issue.ref}`
      : `用例来源未绑定：${issue.ref}`);
  }
  for (const unknownCoverageId of coverageAudit.unknownCoverageIds) {
    cases
      .filter((item) => (item.coverageIds ?? []).includes(unknownCoverageId))
      .forEach((item) => append(item.id, 'UNKNOWN_COVERAGE', `引用未知覆盖能力：${unknownCoverageId}`));
  }

  const generatedCases = cases.filter((item) => !issuesByCaseId.has(item.id));
  const coverageFromGenerated = auditProductCenterCoverage(generatedCases, options.denominator, {
    matchingMode: options.scope === 'case-only' ? 'explicit-or-source' : 'explicit-only',
  });
  const blocked = options.scope === 'case-only'
    ? []
    : coverageFromGenerated.missing.map((item) => ({
      coverageId: item.id,
      module: item.module,
      route: item.route,
      sourceIds: [...item.sourceIds],
    }));
  const intentionallyOmitted = options.denominator
    .filter((item): item is ProductCenterCoverageItem & { disposition: 'blocked' | 'not-applicable' } =>
      item.disposition !== 'required')
    .map((item) => ({
      coverageId: item.id,
      module: item.module,
      route: item.route,
      sourceIds: [...item.sourceIds],
      disposition: item.disposition,
      reason: item.reason,
    }));
  const generated = generatedCases
    .map((item) => formatGateCase(item))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  const reviewRequired = cases
    .filter((item) => issuesByCaseId.has(item.id))
    .map((item) => ({
      ...formatGateCase(item),
      issueCodes: [...issuesByCaseId.get(item.id)!.codes].sort((left, right) => left.localeCompare(right)),
      issues: issuesByCaseId.get(item.id)!.messages,
    }))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));

  return {
    status: blocked.length > 0 ? 'blocked' : reviewRequired.length > 0 ? 'review-required' : 'passed',
    summary: {
      totalCases: cases.length,
      generated: generated.length,
      reviewRequired: reviewRequired.length,
      blocked: blocked.length,
      intentionallyOmitted: intentionallyOmitted.length,
    },
    generated,
    reviewRequired,
    blocked,
    intentionallyOmitted: intentionallyOmitted.sort((left, right) => left.coverageId.localeCompare(right.coverageId)),
    modules: buildGenerationGateModuleSummary(generated, reviewRequired, blocked, intentionallyOmitted),
  };
}

function selectIntakeDenominator(
  options: ProductCenterTestCaseIntakeOptions,
): readonly ProductCenterCoverageItem[] {
  if (options.scope !== 'module-full') return options.denominator;
  if (!options.moduleIds || options.moduleIds.size === 0) {
    throw new Error('module-full 必须指定至少一个模块');
  }
  const selected = selectProductCenterCoverageDenominator(options.denominator, {
    moduleIds: options.moduleIds,
    routes: options.routes,
  });
  if (selected.length === 0) {
    throw new Error('module-full 目标没有可验收的覆盖分母');
  }
  return selected;
}

export function normalizeProductCenterTestCaseDrafts(
  drafts: readonly ProductCenterTestCaseDraft[],
  bindings: readonly ProductCenterTestCaseSourceBinding[],
) {
  const sourceIdsByRef = new Map(bindings.map((binding) => [binding.ref, binding.sourceIds]));
  const unresolvedSources: Array<{ caseId: string; claimId?: string; ref: string }> = [];
  const cases = drafts.map((draft) => {
    const sourceIds = resolveSourceRefs(draft.id, draft.sourceRefs, sourceIdsByRef, unresolvedSources);
    const claims = (draft.claims ?? []).map((claim) => ({
      ...claim,
      sourceIds: resolveSourceRefs(draft.id, claim.sourceRefs, sourceIdsByRef, unresolvedSources, claim.id),
    }));
    return {
      ...draft,
      sourceIds,
      claims,
    };
  });
  return { cases, unresolvedSources };
}

function resolveSourceRefs(
  caseId: string,
  refs: readonly string[],
  sourceIdsByRef: ReadonlyMap<string, readonly string[]>,
  unresolvedSources: Array<{ caseId: string; claimId?: string; ref: string }>,
  claimId?: string,
): string[] {
  const sourceIds = new Set<string>();
  for (const ref of refs) {
    const boundSourceIds = sourceIdsByRef.get(ref);
    if (!boundSourceIds) {
      unresolvedSources.push({ caseId, ...(claimId ? { claimId } : {}), ref });
      continue;
    }
    boundSourceIds.forEach((sourceId) => sourceIds.add(sourceId));
  }
  return [...sourceIds].sort((left, right) => left.localeCompare(right));
}

export function auditProductCenterTestCases(
  cases: readonly ProductCenterTestCaseInput[],
  options: { knownSourceIds?: ReadonlySet<string> } = {},
) {
  const idCounts = new Map<string, number>();
  cases.forEach((item) => idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1));
  const auditedCases = cases.map((item) => auditProductCenterTestCase(item, idCounts, options.knownSourceIds));
  return {
    cases: auditedCases,
    summary: {
      total: auditedCases.length,
      eligible: auditedCases.filter((item) => item.automation.decision === 'eligible').length,
      reviewRequired: auditedCases.filter((item) => item.automation.decision === 'review-required').length,
      manual: auditedCases.filter((item) => item.automation.decision === 'manual').length,
    },
  };
}

function auditProductCenterTestCase(
  input: ProductCenterTestCaseInput,
  idCounts: ReadonlyMap<string, number>,
  knownSourceIds?: ReadonlySet<string>,
): ProductCenterAuditedTestCase {
  const issues: ProductCenterTestCaseAuditIssue[] = [];
  if ((idCounts.get(input.id) ?? 0) > 1) issues.push(issue('DUPLICATE_ID', `用例 ID 重复：${input.id}`));
  if (input.sourceIds.length === 0) issues.push(issue('SOURCE_REQUIRED', '用例必须绑定至少一条来源证据'));
  const unknownSourceIds = knownSourceIds
    ? input.sourceIds.filter((sourceId) => !knownSourceIds.has(sourceId))
    : [];
  if (unknownSourceIds.length > 0) {
    issues.push(issue('UNKNOWN_SOURCE', `用例引用了不存在的合同来源：${unknownSourceIds.join(', ')}`));
  }
  if (input.actions.length === 0) issues.push(issue('ACTION_REQUIRED', '用例必须声明至少一个操作'));
  if (input.expectedResults.length === 0) issues.push(issue('EXPECTATION_REQUIRED', '用例必须声明至少一个可观测预期'));
  if (input.mutatesData && input.cleanup.length === 0) {
    issues.push(issue('CLEANUP_REQUIRED', '变更数据的用例必须声明清理方案'));
  }

  return {
    ...input,
    issues,
    automation: {
      decision: issues.length > 0
        ? 'review-required'
        : input.automationPreference === 'manual'
          ? 'manual'
          : 'eligible',
      reasons: issues.map((item) => item.code),
    },
  };
}

function issue(code: ProductCenterTestCaseAuditIssueCode, message: string): ProductCenterTestCaseAuditIssue {
  return { code, message };
}

function formatGateCase(input: ProductCenterTestCaseInput): ProductCenterGeneratedTestCase {
  return {
    caseId: input.id,
    title: input.title,
    module: input.module,
    route: input.route,
    coverageIds: [...(input.coverageIds ?? [])],
    sourceIds: [...input.sourceIds],
    businessBasisKinds: [...new Set((input.claims ?? [])
      .flatMap((claim) => claim.sourceTrace ? [claim.sourceTrace.businessBasis.kind] : []))]
      .sort((left, right) => left.localeCompare(right)),
  };
}

function buildGenerationGateModuleSummary(
  generated: readonly ProductCenterGeneratedTestCase[],
  reviewRequired: readonly ProductCenterReviewRequiredTestCase[],
  blocked: readonly ProductCenterBlockedCoverage[],
  intentionallyOmitted: readonly ProductCenterIntentionallyOmittedCoverage[],
): ProductCenterTestCaseGenerationGateModuleSummary[] {
  const moduleIds = new Set<string>([
    ...generated.map((item) => item.module),
    ...reviewRequired.map((item) => item.module),
    ...blocked.map((item) => item.module),
    ...intentionallyOmitted.map((item) => item.module),
  ]);
  return [...moduleIds]
    .sort((left, right) => left.localeCompare(right))
    .map((module) => ({
      module,
      generated: generated.filter((item) => item.module === module).length,
      reviewRequired: reviewRequired.filter((item) => item.module === module).length,
      blocked: blocked.filter((item) => item.module === module).length,
      intentionallyOmitted: intentionallyOmitted.filter((item) => item.module === module).length,
      generatedCaseIds: generated
        .filter((item) => item.module === module)
        .map((item) => item.caseId)
        .sort((left, right) => left.localeCompare(right)),
      reviewRequiredCaseIds: reviewRequired
        .filter((item) => item.module === module)
        .map((item) => item.caseId)
        .sort((left, right) => left.localeCompare(right)),
      blockedCoverageIds: blocked
        .filter((item) => item.module === module)
        .map((item) => item.coverageId)
        .sort((left, right) => left.localeCompare(right)),
      intentionallyOmittedCoverageIds: intentionallyOmitted
        .filter((item) => item.module === module)
        .map((item) => item.coverageId)
        .sort((left, right) => left.localeCompare(right)),
    }));
}

function validateDraft(
  value: unknown,
  index: number,
  issues: ProductCenterTestCaseDraftValidationIssue[],
): void {
  const root = `cases[${index}]`;
  if (!isRecord(value)) {
    issues.push({ path: root, message: '用例必须是对象' });
    return;
  }
  validateNonEmptyString(value.id, `${root}.id`, issues);
  validateNonEmptyString(value.module, `${root}.module`, issues);
  validateRoute(value.route, `${root}.route`, issues);
  validateNonEmptyString(value.title, `${root}.title`, issues);
  if (!['P0', 'P1', 'P2'].includes(String(value.priority))) {
    issues.push({ path: `${root}.priority`, message: 'priority 必须为 P0、P1 或 P2' });
  }
  validateStringArray(value.sourceRefs, `${root}.sourceRefs`, issues);
  validateStringArray(value.preconditions, `${root}.preconditions`, issues);
  validateStringArray(value.actions, `${root}.actions`, issues);
  validateStringArray(value.expectedResults, `${root}.expectedResults`, issues);
  if (typeof value.mutatesData !== 'boolean') {
    issues.push({ path: `${root}.mutatesData`, message: 'mutatesData 必须是布尔值' });
  }
  validateStringArray(value.cleanup, `${root}.cleanup`, issues);
  if (value.automationPreference !== undefined && !['candidate', 'manual'].includes(String(value.automationPreference))) {
    issues.push({ path: `${root}.automationPreference`, message: 'automationPreference 必须为 candidate 或 manual' });
  }
  validateClaims(value.claims, `${root}.claims`, issues);
  validateStringArray(value.coverageIds, `${root}.coverageIds`, issues);
  validateExecution(value.execution, `${root}.execution`, issues);
}

function validateClaims(
  value: unknown,
  path: string,
  issues: ProductCenterTestCaseDraftValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'claims 必须是数组' });
    return;
  }
  value.forEach((claim, index) => {
    const claimPath = `${path}[${index}]`;
    if (!isRecord(claim)) {
      issues.push({ path: claimPath, message: 'claim 必须是对象' });
      return;
    }
    validateNonEmptyString(claim.id, `${claimPath}.id`, issues);
    if (!['precondition', 'action', 'expectation'].includes(String(claim.kind))) {
      issues.push({ path: `${claimPath}.kind`, message: 'kind 必须为 precondition、action 或 expectation' });
    }
    validateNonEmptyString(claim.text, `${claimPath}.text`, issues);
    validateStringArray(claim.sourceRefs, `${claimPath}.sourceRefs`, issues);
    if (!['confirmed', 'observed', 'inferred', 'conflicting'].includes(String(claim.evidenceLevel))) {
      issues.push({ path: `${claimPath}.evidenceLevel`, message: 'evidenceLevel 值无效' });
    }
    validateSourceTrace(claim.sourceTrace, `${claimPath}.sourceTrace`, issues);
  });
}

function validateSourceTrace(
  value: unknown,
  path: string,
  issues: ProductCenterTestCaseDraftValidationIssue[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    issues.push({ path, message: 'sourceTrace 必须是对象' });
    return;
  }
  if (!isRecord(value.businessBasis)) {
    issues.push({ path: `${path}.businessBasis`, message: 'businessBasis 必须是对象' });
  } else {
    if (!['prd-explicit', 'business-rule-explicit', 'xmind-existing', 'single-step-inference', 'legacy-baseline']
      .includes(String(value.businessBasis.kind))) {
      issues.push({ path: `${path}.businessBasis.kind`, message: 'businessBasis.kind 值无效' });
    }
    validateStringArray(value.businessBasis.refs, `${path}.businessBasis.refs`, issues);
    if (value.businessBasis.kind === 'single-step-inference') {
      validateNonEmptyString(value.businessBasis.rationale, `${path}.businessBasis.rationale`, issues);
      if (value.businessBasis.hopCount !== 1) {
        issues.push({
          path: `${path}.businessBasis.hopCount`,
          message: 'single-step-inference 的 hopCount 必须为 1',
        });
      }
    }
  }
  if (!Array.isArray(value.executionEvidence)) {
    issues.push({ path: `${path}.executionEvidence`, message: 'executionEvidence 必须是数组' });
    return;
  }
  value.executionEvidence.forEach((evidence, index) => {
    const evidencePath = `${path}.executionEvidence[${index}]`;
    if (!isRecord(evidence)) {
      issues.push({ path: evidencePath, message: 'executionEvidence 项必须是对象' });
      return;
    }
    if (!['contract-observed', 'runtime-confirmed', 'human-confirmed'].includes(String(evidence.kind))) {
      issues.push({ path: `${evidencePath}.kind`, message: 'executionEvidence.kind 值无效' });
    }
    validateStringArray(evidence.sourceIds, `${evidencePath}.sourceIds`, issues);
  });
}

function validateExecution(
  value: unknown,
  path: string,
  issues: ProductCenterTestCaseDraftValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'execution 必须是对象' });
    return;
  }
  validateStringArray(value.roleIds, `${path}.roleIds`, issues);
  validateStringArray(value.environmentIds, `${path}.environmentIds`, issues);
  validateStringArray(value.capabilityIds, `${path}.capabilityIds`, issues);
  if (!['none', 'ui-create', 'api-seeded-ui-action'].includes(String(value.mutationMode))) {
    issues.push({ path: `${path}.mutationMode`, message: 'mutationMode 值无效' });
  }
  validateEnumArray(
    value.verificationSignals,
    ['api', 'ui', 'network', 'download', 'background-job'],
    `${path}.verificationSignals`,
    issues,
  );
  validateStringArray(value.seedAdapterIds, `${path}.seedAdapterIds`, issues);
  validateStringArray(value.cleanupAdapterIds, `${path}.cleanupAdapterIds`, issues);
  if (!['none', 'eventual-consistency', 'background-job'].includes(String(value.asyncPolicy))) {
    issues.push({ path: `${path}.asyncPolicy`, message: 'asyncPolicy 值无效' });
  }
}

function validateEnumArray(
  value: unknown,
  allowed: readonly string[],
  path: string,
  issues: ProductCenterTestCaseDraftValidationIssue[],
): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !allowed.includes(item))) {
    issues.push({ path, message: `必须是以下值的数组：${allowed.join('、')}` });
  }
}

function validateNonEmptyString(
  value: unknown,
  path: string,
  issues: ProductCenterTestCaseDraftValidationIssue[],
): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push({ path, message: '必须是非空字符串' });
  }
}

function validateRoute(
  value: unknown,
  path: string,
  issues: ProductCenterTestCaseDraftValidationIssue[],
): void {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    issues.push({ path, message: 'route 必须是以 / 开头的路径' });
  }
}

function validateStringArray(
  value: unknown,
  path: string,
  issues: ProductCenterTestCaseDraftValidationIssue[],
): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    issues.push({ path, message: '必须是字符串数组' });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function invalidDocument(issues: ProductCenterTestCaseDraftValidationIssue[]) {
  return { valid: false, cases: [] as ProductCenterTestCaseDraft[], issues };
}
