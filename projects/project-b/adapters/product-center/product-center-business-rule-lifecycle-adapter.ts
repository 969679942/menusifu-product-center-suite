import { createHash } from 'node:crypto';
import {
  approveBusinessRuleCandidate,
  buildBusinessRuleCandidate,
  generateTestCasesFromBusinessRules,
  validateBusinessRule,
  type BusinessRuleDocument,
  type BusinessRuleGovernanceMetadata,
  type BusinessRuleEffectiveContext,
  type BusinessRuleScope,
  type BusinessRuleSemantics,
  type BusinessRuleVerificationStatus,
  type GeneratedBusinessRuleCase,
} from '../../automation/system-test/business-rule-lifecycle';
import {
  auditBusinessRuleCaseAssociations,
  type BusinessRuleAssociationAudit,
  type BusinessRuleCaseAssociation,
} from '../../automation/system-test/business-rule-review-governance';
import {
  findAmbiguousDownstreamPhrases,
  validateBusinessRuleDownstreamContract,
} from '../../automation/system-test/business-rule-downstream-contract';
import type { BusinessRuleDownstreamSyncContract } from '../../automation/system-test/business-rule-downstream-contract';

export type ProductCenterFormalRuleBinding = {
  bindingId: string;
  ruleId: string;
  module: string;
  statement: string;
  confirmationId: string;
  effectiveVersion?: string;
  scope?: BusinessRuleScope;
  effectiveContext?: BusinessRuleEffectiveContext;
  supersedes?: string[];
  conflictsWith?: string[];
  governance?: Partial<BusinessRuleGovernanceMetadata>;
  sourcePath?: string;
};

export type ProductCenterCanonicalCorrection = {
  canonicalId: string;
  actions?: string[];
  expectedResults?: string[];
};

export type ProductCenterRuleConfirmation = {
  confirmationId: string;
  ruleId: string;
  confirmedBy?: string;
  confirmedAt?: string;
  sourceType?: string;
  statement: string;
  linkedCanonicalIds?: string[];
  canonicalCorrections?: ProductCenterCanonicalCorrection[];
  effectiveVersion?: string;
  semantics?: BusinessRuleSemantics;
  revision?: number;
  previousRuleFingerprint?: string | null;
  semanticChangeRequiresRerun?: boolean;
  verificationStatus?: Extract<BusinessRuleVerificationStatus, 'verified' | 'pending-review' | 'revalidation-required'>;
  governance?: Partial<BusinessRuleGovernanceMetadata>;
  downstreamSyncContracts?: BusinessRuleDownstreamSyncContract[];
  sourcePath?: string;
};

export type ProductCenterCanonicalCaseForRuleAudit = {
  caseId: string;
  caseFingerprint: string;
  sourceVerified: boolean;
  canonicalApproved: boolean;
  sourceRuleIds?: string[];
  semanticComparison: 'matched' | 'mismatch' | 'unknown';
};

export type ProductCenterAutomationBinding = {
  caseId: string;
  scriptPath?: string;
  runtimeReadiness?: string;
  runtimeStatus?: string;
};

export type ProductCenterBusinessRuleAdapterInput = {
  formalBindings: {
    schemaVersion: string;
    collectionId: string;
    sourcePath: string;
    bindings: ProductCenterFormalRuleBinding[];
  };
  confirmations: {
    schemaVersion: string;
    collectionId: string;
    sourceRole?: string;
    sourcePath: string;
    confirmations: ProductCenterRuleConfirmation[];
  };
  automationBindings: {
    schemaVersion: string;
    collectionId: string;
    sourcePath: string;
    releaseFingerprint?: string;
    bindings: ProductCenterAutomationBinding[];
  };
  conflictAssessments?: {
    assessedAt: string;
    source: string;
    rules: Array<{
      ruleId: string;
      status: 'assessed-no-conflict' | 'assessed-conflict' | 'not-assessed';
      conflictsWithRuleIds: string[];
      precedence: number | null;
    }>;
  };
  executionImpact?: {
    rerunCaseIds: readonly string[];
    preservedPassedCaseIds: readonly string[];
  };
  canonicalCases?: ProductCenterCanonicalCaseForRuleAudit[];
};

export type ProductCenterRuleGovernanceIssue = {
  code: string;
  severity: 'error' | 'gap';
  bindingId: string;
  ruleId: string;
  message: string;
};

export type ProductCenterRuleRegistration = {
  bindingId: string;
  ruleId: string;
  ruleFingerprint: string;
  sourceFingerprint: string;
  linkedCaseIds: string[];
  linkedBindingIds: string[];
  formalValidationErrors: string[];
  generationBlockers: string[];
  status: 'mapped' | 'mapped-with-gaps';
  associationAudit: BusinessRuleAssociationAudit;
};

export type ProductCenterRejectedRuleBinding = {
  bindingId: string;
  ruleId: string;
  statement: string;
  reasons: string[];
};

export type ProductCenterBusinessRuleLifecycleSnapshot = {
  schemaVersion: '1.0.0';
  snapshotId: 'product-center-business-rule-lifecycle';
  applicationId: 'merchant-center';
  businessDomainId: 'product-center-item';
  status: 'generation-ready' | 'source-gaps';
  summary: {
    formalBindings: number;
    mappedRules: number;
    rejectedBindings: number;
    generationReadyRules: number;
    generationBlockedRules: number;
    preservedRuntimePassedCases: number;
  };
  rules: BusinessRuleDocument[];
  registrations: ProductCenterRuleRegistration[];
  rejectedBindings: ProductCenterRejectedRuleBinding[];
  candidateCases: GeneratedBusinessRuleCase[];
  issues: ProductCenterRuleGovernanceIssue[];
  associationAudits: Record<string, BusinessRuleAssociationAudit>;
  executionImpact: {
    existingPassedCasesInvalidated: boolean;
    invalidatedCaseIds: string[];
    rerunCaseIds: string[];
    preservedPassedCaseIds: string[];
    moduleDeliveryBlocked: false;
  };
  guardrails: {
    runtimeMayOverwriteFormalRule: false;
    runtimeMayCreateObservedCandidate: true;
    humanApprovalRequiresRuleAndSourceFingerprints: true;
    missingSemanticsMayGenerateCases: false;
    adapterMayInferMissingBusinessSemantics: false;
    missingCorrectionMayBeAutoValidated: true;
    ambiguousDownstreamLanguageBlocked: true;
  };
  fingerprint: string;
};

export function buildProductCenterBusinessRuleLifecycleSnapshot(
  input: ProductCenterBusinessRuleAdapterInput,
): ProductCenterBusinessRuleLifecycleSnapshot {
  const confirmationsById = new Map(
    input.confirmations.confirmations.map((confirmation) => [confirmation.confirmationId, confirmation]),
  );
  const automationByCaseId = new Map(
    input.automationBindings.bindings.map((binding) => [binding.caseId, binding]),
  );
  const rules: BusinessRuleDocument[] = [];
  const issues: ProductCenterRuleGovernanceIssue[] = [];
  const rejectedBindings: ProductCenterRejectedRuleBinding[] = [];
  const conflictAssessmentsByRuleId = new Map(
    (input.conflictAssessments?.rules ?? []).map((item) => [item.ruleId, item]),
  );
  const canonicalCasesById = new Map((input.canonicalCases ?? []).map((item) => [item.caseId, item]));
  const associationAudits: Record<string, BusinessRuleAssociationAudit> = {};

  for (const binding of input.formalBindings.bindings) {
    const confirmation = confirmationsById.get(binding.confirmationId);
    const rejectionReasons = validateFormalBinding(input, binding, confirmation);
    if (rejectionReasons.length > 0 || !confirmation) {
      rejectedBindings.push({
        bindingId: binding.bindingId,
        ruleId: binding.ruleId,
        statement: binding.statement,
        reasons: rejectionReasons,
      });
      issues.push(...rejectionReasons.map((code) => issue(binding, code, 'error')));
      continue;
    }

    const linkedCaseIds = unique(confirmation.linkedCanonicalIds ?? []);
    const corrections = (confirmation.canonicalCorrections ?? [])
      .filter((correction) => linkedCaseIds.includes(correction.canonicalId));
    const automationBindings = linkedCaseIds
      .map((caseId) => automationByCaseId.get(caseId))
      .filter((item): item is ProductCenterAutomationBinding => Boolean(item));
    const semantics: BusinessRuleSemantics = confirmation.semantics ?? {
      preconditions: [],
      entities: [binding.module],
      actions: orderedUnique(corrections.flatMap((correction) => correction.actions ?? [])),
      stateTransitions: [],
      constraints: [binding.statement],
      outcomes: orderedUnique(corrections.flatMap((correction) => correction.expectedResults ?? [])),
      sideEffects: [],
      assertionSurfaces: [],
      cleanup: {
        policyStatus: 'unknown',
        required: false,
        apiZeroResidueRequired: false,
        uiZeroResidueRequired: false,
      },
    };
    if (confirmation.downstreamSyncContracts !== undefined) {
      semantics.downstreamSyncContracts = confirmation.downstreamSyncContracts;
    }
    const candidate = buildBusinessRuleCandidate({
      ruleId: binding.ruleId,
      ruleType: 'normative',
      statement: binding.statement,
      scope: binding.scope ?? {
        applicationId: 'merchant-center',
        businessDomainId: 'product-center-item',
        entityTypes: [binding.module],
        operationKeys: [],
        channels: [],
      },
      sourceRegistry: [
        {
          sourceId: binding.bindingId,
          kind: 'business-rule',
          path: binding.sourcePath ?? input.formalBindings.sourcePath,
          locator: binding.bindingId,
          fingerprint: fingerprint(binding),
          verified: true,
        },
        {
          sourceId: confirmation.confirmationId,
          kind: 'human-confirmation',
          path: confirmation.sourcePath ?? input.confirmations.sourcePath,
          locator: confirmation.confirmationId,
          fingerprint: fingerprint(confirmation),
          verified: true,
        },
      ],
      effectiveVersion: binding.effectiveVersion ?? confirmation.effectiveVersion ?? null,
      effectiveContext: binding.effectiveContext ?? {
        environmentIds: [],
        tenantIds: [],
        roleIds: [],
        locales: [],
        routes: [],
        featureFlags: [],
      },
      supersedes: binding.supersedes ?? [],
      conflictsWith: binding.conflictsWith ?? [],
      linkedCaseIds,
      linkedBindingIds: unique([
        binding.bindingId,
        ...automationBindings.map((item) => `automation-binding:${item.caseId}`),
      ]),
      verificationStatus: confirmation.verificationStatus ?? 'verified',
      semantics,
      revision: confirmation.revision,
      previousRuleFingerprint: confirmation.previousRuleFingerprint ?? null,
    });
    const approved = approveBusinessRuleCandidate({
      candidate,
      effectiveVersion: candidate.effectiveVersion!,
      verificationStatus: confirmation.verificationStatus ?? 'verified',
      decision: {
        decision: 'approved',
        approvedBy: confirmation.confirmedBy!.trim(),
        approvedAt: confirmation.confirmedAt ?? 'not-recorded',
        rationale: `direct-user-confirmation:${confirmation.confirmationId}`,
        candidateFingerprint: candidate.ruleFingerprint,
        candidateSourceFingerprint: candidate.sourceFingerprint,
      },
    });
    rules.push({
      ...approved,
      governance: buildGovernanceMetadata(
        binding,
        confirmation,
        candidate.effectiveContext,
        conflictAssessmentsByRuleId.get(binding.ruleId),
        input.conflictAssessments,
      ),
    });

    const associations: BusinessRuleCaseAssociation[] = linkedCaseIds.map((caseId) => {
      const canonical = canonicalCasesById.get(caseId);
      const automation = automationByCaseId.get(caseId);
      const correction = corrections.find((item) => item.canonicalId === caseId);
      return {
        caseId,
        caseFingerprint: canonical?.caseFingerprint ?? null,
        implementationFingerprint: null,
        automationBindingId: automation ? `automation-binding:${caseId}` : null,
        sourceVerified: canonical?.sourceVerified ?? false,
        canonicalApproved: canonical?.canonicalApproved ?? false,
        correctionPresent: Boolean(correction),
        semanticComparison: canonical?.sourceRuleIds?.includes(binding.ruleId)
          ? 'matched'
          : canonical?.semanticComparison ?? 'unknown',
      };
    });
    const associationAudit = auditBusinessRuleCaseAssociations({ linkedCaseIds }, associations);
    associationAudits[binding.ruleId] = associationAudit;
    for (const code of associationAudit.missingCaseIds.map(() => 'RULE_CASE_ASSOCIATION_MISSING')) {
      issues.push(issue(binding, code, 'error'));
    }
    for (const caseId of associationAudit.humanSemanticReviewCaseIds) {
      issues.push(issue(binding, `CASE_SEMANTIC_REVIEW_REQUIRED:${caseId}`, 'error'));
    }
    for (const caseId of associationAudit.blockedCaseIds) {
      issues.push(issue(binding, `CASE_ASSOCIATION_BLOCKED:${caseId}`, 'error'));
    }
    for (const contract of semantics.downstreamSyncContracts ?? []) {
      const contractErrors = validateBusinessRuleDownstreamContract(contract);
      for (const code of contractErrors) issues.push(issue(binding, code, 'error'));
    }
    const semanticText = [binding.statement, ...semantics.actions, ...semantics.outcomes, ...semantics.sideEffects].join('\n');
    const hasDownstreamIntent = (binding.scope?.channels ?? []).includes('downstream')
      || semantics.assertionSurfaces.some((surface) => surface.channel === 'downstream')
      || (semantics.downstreamSyncContracts?.length ?? 0) > 0;
    const ambiguousPhrases = hasDownstreamIntent ? findAmbiguousDownstreamPhrases(semanticText) : [];
    if (ambiguousPhrases.length > 0 && (semantics.downstreamSyncContracts ?? []).length === 0) {
      for (const phrase of ambiguousPhrases) issues.push(issue(binding, `DOWNSTREAM_AMBIGUOUS_PHRASE:${phrase}`, 'error'));
    }

    if (corrections.length === 0 && !confirmation.semantics) {
      issues.push(issue(binding, 'CANONICAL_CORRECTION_REQUIRED', 'gap'));
    }
    if (automationBindings.length !== linkedCaseIds.length) {
      issues.push(issue(binding, 'AUTHORITATIVE_AUTOMATION_BINDING_REQUIRED', 'gap'));
    }
    if (!binding.effectiveVersion && !confirmation.effectiveVersion) {
      issues.push(issue(binding, 'EFFECTIVE_VERSION_REQUIRED', 'gap'));
    }
    if (!confirmation.confirmedAt) issues.push(issue(binding, 'APPROVAL_TIME_REQUIRED', 'gap'));
    if (semantics.preconditions.length === 0) issues.push(issue(binding, 'PRECONDITIONS_REQUIRED', 'gap'));
    if (semantics.assertionSurfaces.length === 0) issues.push(issue(binding, 'ASSERTION_SURFACE_REQUIRED', 'gap'));
    if (semantics.cleanup.policyStatus !== 'verified') issues.push(issue(binding, 'CLEANUP_POLICY_REQUIRED', 'gap'));
  }

  const generatedBase = generateTestCasesFromBusinessRules(rules);
  const generated = {
    // Association diagnostics are reported separately.  A missing automation
    // binding is a technical execution blocker, not a reason to stop
    // generating a source-backed test-case candidate or to ask for product
    // semantics again.
    cases: generatedBase.cases,
    blocked: generatedBase.blocked,
  };
  const generationBlockersByRuleId = new Map(
    generated.blocked.map((item) => [item.ruleId, item.blockers]),
  );
  const registrations = rules.map((rule): ProductCenterRuleRegistration => {
    const formalValidationErrors = validateBusinessRule(rule, 'formal');
    const generationBlockers = generationBlockersByRuleId.get(rule.ruleId) ?? [];
    return {
      bindingId: rule.linkedBindingIds.find((id) => id.startsWith('formal-binding:')) ?? rule.linkedBindingIds[0],
      ruleId: rule.ruleId,
      ruleFingerprint: rule.ruleFingerprint,
      sourceFingerprint: rule.sourceFingerprint,
      linkedCaseIds: [...rule.linkedCaseIds],
      linkedBindingIds: [...rule.linkedBindingIds],
      formalValidationErrors,
      generationBlockers,
      associationAudit: associationAudits[rule.ruleId] ?? auditBusinessRuleCaseAssociations(rule, []),
      status: formalValidationErrors.length === 0 && generationBlockers.length === 0
        ? 'mapped'
        : 'mapped-with-gaps',
    };
  });
  const rerunCaseIds = unique(input.executionImpact?.rerunCaseIds ?? []);
  const preservedPassedCaseIds = unique(input.executionImpact?.preservedPassedCaseIds ?? []);
  const snapshotWithoutFingerprint = {
    schemaVersion: '1.0.0' as const,
    snapshotId: 'product-center-business-rule-lifecycle' as const,
    applicationId: 'merchant-center' as const,
    businessDomainId: 'product-center-item' as const,
    status: (generated.blocked.length === 0 && rejectedBindings.length === 0
      ? 'generation-ready'
      : 'source-gaps') as ProductCenterBusinessRuleLifecycleSnapshot['status'],
    summary: {
      formalBindings: input.formalBindings.bindings.length,
      mappedRules: rules.length,
      rejectedBindings: rejectedBindings.length,
      generationReadyRules: generated.cases.length,
      generationBlockedRules: generated.blocked.length,
      preservedRuntimePassedCases: preservedPassedCaseIds.length,
    },
    rules,
    registrations,
    rejectedBindings,
    candidateCases: generated.cases,
    issues: deduplicateIssues(issues),
    associationAudits,
    executionImpact: {
      existingPassedCasesInvalidated: rerunCaseIds.length > 0,
      invalidatedCaseIds: rerunCaseIds,
      rerunCaseIds,
      preservedPassedCaseIds,
      moduleDeliveryBlocked: false as const,
    },
    guardrails: {
      runtimeMayOverwriteFormalRule: false as const,
      runtimeMayCreateObservedCandidate: true as const,
      humanApprovalRequiresRuleAndSourceFingerprints: true as const,
      missingSemanticsMayGenerateCases: false as const,
      adapterMayInferMissingBusinessSemantics: false as const,
      missingCorrectionMayBeAutoValidated: true as const,
      ambiguousDownstreamLanguageBlocked: true as const,
    },
  };
  return { ...snapshotWithoutFingerprint, fingerprint: fingerprint(snapshotWithoutFingerprint) };
}

function buildGovernanceMetadata(
  binding: ProductCenterFormalRuleBinding,
  confirmation: ProductCenterRuleConfirmation,
  effectiveContext: BusinessRuleEffectiveContext,
  assessedConflict?: {
    status: 'assessed-no-conflict' | 'assessed-conflict' | 'not-assessed';
    conflictsWithRuleIds: string[];
    precedence: number | null;
  },
  conflictAssessmentSource?: { assessedAt: string; source: string },
): BusinessRuleGovernanceMetadata {
  const supplied = {
    ...(confirmation.governance ?? {}),
    ...(binding.governance ?? {}),
  };
  const changedAt = supplied.changedAt
    ?? (confirmation.revision && confirmation.revision > 1 ? confirmation.confirmedAt ?? null : null);
  const hasExplicitContext = Object.values(effectiveContext).some((items) => items.length > 0);
  const conflictAssessment = supplied.conflictAssessment ?? (assessedConflict
    ? {
      status: assessedConflict.status,
      assessedAt: conflictAssessmentSource?.assessedAt ?? null,
      source: conflictAssessmentSource?.source ?? null,
      conflictsWithRuleIds: assessedConflict.conflictsWithRuleIds,
      precedence: assessedConflict.precedence,
    }
    : {
      status: 'not-assessed' as const,
      assessedAt: null,
      source: null,
      conflictsWithRuleIds: [],
      precedence: null,
    });
  return {
    createdAt: supplied.createdAt ?? null,
    changedAt,
    effectiveFrom: supplied.effectiveFrom ?? null,
    effectiveTo: supplied.effectiveTo ?? null,
    lastVerifiedAt: supplied.lastVerifiedAt ?? null,
    changeReason: supplied.changeReason ?? (changedAt ? 'formal-rule-revision' : null),
    changeEventId: supplied.changeEventId ?? null,
    timeEvidenceStatus: supplied.timeEvidenceStatus
      ?? (changedAt || supplied.effectiveFrom || supplied.createdAt || supplied.lastVerifiedAt ? 'partial' : 'unknown'),
    effectiveContextStatus: supplied.effectiveContextStatus ?? (hasExplicitContext ? 'explicit' : 'unknown'),
    conflictAssessment: {
      status: conflictAssessment.status ?? 'not-assessed',
      assessedAt: conflictAssessment.assessedAt ?? null,
      source: conflictAssessment.source ?? null,
      conflictsWithRuleIds: [...(conflictAssessment.conflictsWithRuleIds ?? [])],
      precedence: conflictAssessment.precedence ?? null,
    },
  };
}

function validateFormalBinding(
  input: ProductCenterBusinessRuleAdapterInput,
  binding: ProductCenterFormalRuleBinding,
  confirmation: ProductCenterRuleConfirmation | undefined,
): string[] {
  const errors: string[] = [];
  if (input.confirmations.sourceRole !== 'product-confirmed-rule') errors.push('CONFIRMATION_SOURCE_ROLE_INVALID');
  if (!confirmation) return [...errors, 'CONFIRMATION_NOT_FOUND'];
  if (confirmation.sourceType !== 'direct-user-confirmation') errors.push('CONFIRMATION_SOURCE_TYPE_INVALID');
  if (!confirmation.confirmedBy?.trim()) errors.push('CONFIRMER_REQUIRED');
  if (confirmation.ruleId !== binding.ruleId) errors.push('CONFIRMATION_RULE_ID_MISMATCH');
  if (confirmation.statement !== binding.statement) errors.push('CONFIRMATION_STATEMENT_MISMATCH');
  if (!confirmation.linkedCanonicalIds?.length) errors.push('LINKED_CASE_REQUIRED');
  return unique(errors);
}

function issue(
  binding: ProductCenterFormalRuleBinding,
  code: string,
  severity: ProductCenterRuleGovernanceIssue['severity'],
): ProductCenterRuleGovernanceIssue {
  const messages: Record<string, string> = {
    CONFIRMATION_SOURCE_ROLE_INVALID: '确认文件不是产品正式确认来源。',
    CONFIRMATION_NOT_FOUND: '正式绑定引用的人工确认不存在。',
    CONFIRMATION_SOURCE_TYPE_INVALID: '规则未由直接人工确认。',
    CONFIRMER_REQUIRED: '规则确认人缺失。',
    CONFIRMATION_RULE_ID_MISMATCH: '绑定与确认的规则 ID 不一致。',
    CONFIRMATION_STATEMENT_MISMATCH: '绑定与确认的规则陈述不一致。',
    LINKED_CASE_REQUIRED: '规则未关联规范用例。',
    CANONICAL_CORRECTION_REQUIRED: '没有规范校正，无法取得来源明确的动作和预期。',
    AUTHORITATIVE_AUTOMATION_BINDING_REQUIRED: '至少一个关联用例缺少权威自动化绑定。',
    EFFECTIVE_VERSION_REQUIRED: '未登记规则生效版本。',
    APPROVAL_TIME_REQUIRED: '历史确认未登记可验证的确认时间。',
    PRECONDITIONS_REQUIRED: '来源未登记可生成用例的前置条件。',
    ASSERTION_SURFACE_REQUIRED: '来源未登记字段级断言面、权威通道和终态。',
    CLEANUP_POLICY_REQUIRED: '来源未登记清理是否必需及零残留策略。',
    RULE_CASE_ASSOCIATION_MISSING: '正式规则关联用例未完成机器对账。',
    DOWNSTREAM_CONTRACT_ID_REQUIRED: '下游同步契约缺少唯一契约 ID。',
    DOWNSTREAM_TRIGGER_REQUIRED: '下游同步契约缺少明确触发动作。',
    DOWNSTREAM_STORE_PREREQUISITE_REQUIRED: '下游同步契约缺少门店前置动作。',
    DOWNSTREAM_TERMINAL_PREREQUISITE_REQUIRED: '下游同步契约缺少终端前置动作。',
  };
  return {
    code,
    severity,
    bindingId: binding.bindingId,
    ruleId: binding.ruleId,
    message: messages[code] ?? code,
  };
}

function deduplicateIssues(issues: readonly ProductCenterRuleGovernanceIssue[]): ProductCenterRuleGovernanceIssue[] {
  const seen = new Set<string>();
  return issues.filter((item) => {
    const key = `${item.bindingId}:${item.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique(items: readonly string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].sort();
}

function orderedUnique(items: readonly string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
