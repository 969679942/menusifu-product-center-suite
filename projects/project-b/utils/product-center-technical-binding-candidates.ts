import { createHash } from 'node:crypto';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import type { ProductCenterPageContractObservation } from './product-center-page-contract-observation';
import { stableStringify } from './product-center-test-contract';
import type { ProductCenterTestPlanAutomationBinding } from './product-center-test-plan-intake';

export type ProductCenterTechnicalBindingCandidateIssueCode =
  | 'ASSERTION_ADAPTER_REQUIRED'
  | 'ASSERTION_OBSERVATION_MISMATCH'
  | 'CLAIM_BINDING_MISMATCH'
  | 'CLEANUP_ADAPTER_REQUIRED'
  | 'GOLD_CASE_REQUIRED'
  | 'MODULE_BINDING_MISMATCH'
  | 'PAGE_CONTRACT_NOT_CLEAN'
  | 'PAGE_OBSERVATION_REQUIRED'
  | 'RECIPE_REQUIRED'
  | 'ROUTE_BINDING_MISMATCH'
  | 'RUNTIME_ACCEPTANCE_REQUIRED'
  | 'SIDEBAR_ENTRY_REQUIRED'
  | 'SOURCE_BINDING_REQUIRED';

type GeneratedCaseInput = {
  canonicalId: string;
  internalCaseId: string;
  module: string;
};

type GoldCaseInput = {
  id: string;
  module: string;
  route: string;
  sourceRefs?: readonly string[];
  claims?: ReadonlyArray<{ id: string }>;
  execution?: {
    seedAdapterIds?: readonly string[];
    cleanupAdapterIds?: readonly string[];
    verificationSignals?: readonly string[];
  };
  mutatesData?: boolean;
  cleanup?: readonly string[];
};

type SourceBindingInput = {
  ref: string;
  sourceIds: readonly string[];
};

export type ProductCenterTechnicalBindingCandidate = {
  canonicalId: string;
  internalCaseId: string;
  module: string;
  status: 'candidate-ready' | 'review-required';
  issueCodes: ProductCenterTechnicalBindingCandidateIssueCode[];
  issues: string[];
  candidateHash: string;
  evidenceHash: string;
  binding?: ProductCenterTestPlanAutomationBinding;
  recipe?: AutomationRecipe;
  evidence: {
    pageObservationFingerprint: string;
    recipeFingerprint: string;
    evidenceFingerprint: string;
    observationCaseId: string;
    runtimeAccepted: boolean;
    claimCoverageComplete: boolean;
    sidebarEntryVerified: boolean;
    fieldSources: {
      route: 'page-contract-observation';
      capabilityIds: 'page-contract-observation';
      assertionAdapterIds: 'page-contract-observation';
      sourceBindings: 'formal-source-binding';
      claimIds: 'gold-test-case-contract';
      seedAndCleanup: 'gold-test-case-contract';
      recipeTemplate: 'runtime-accepted-gold-recipe';
    };
  };
};

export type ProductCenterTechnicalBindingCandidateDocument = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-technical-binding-candidates';
  fingerprint: string;
  bindingSemanticFingerprint: string;
  pageObservationFingerprint: string;
  status: 'approval-required' | 'review-required';
  summary: { total: number; ready: number; blocked: number };
  candidates: ProductCenterTechnicalBindingCandidate[];
  approvalRequired: true;
  generationAllowed: false;
  guardrails: {
    sourceInferenceAllowed: false;
    automationAsBusinessSourceAllowed: false;
    approvalFingerprintRequired: true;
    pageObservationMustBeClean: true;
  };
};

export type ProductCenterTechnicalBindingApprovalDecision = {
  canonicalId: string;
  candidateHash: string;
  bindingSemanticHash?: string;
  candidateSummary?: {
    internalCaseId: string;
    title: string;
    module: string;
    route: string;
    capabilityIds: string[];
    assertionAdapterIds: string[];
    seedAdapterIds: string[];
    cleanupAdapterIds: string[];
    claimCount: number;
    mutatesData: boolean;
    pageObservationFingerprint: string;
  };
  decision: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reason: string | null;
};

export type ProductCenterTechnicalBindingApprovalDocument = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-technical-binding-approvals';
  status: 'approval-required' | 'approved' | 'rejected';
  candidateFingerprint: string;
  bindingSemanticFingerprint?: string;
  pageObservationFingerprint: string;
  decisions: ProductCenterTechnicalBindingApprovalDecision[];
  summary: { total: number; pending: number; approved: number; rejected: number };
};

export type ApprovedProductCenterTechnicalBindings = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-approved-technical-bindings';
  status: 'approved';
  candidateFingerprint: string;
  bindingSemanticFingerprint: string;
  pageObservationFingerprint: string;
  fingerprint: string;
  summary: { total: number };
  bindings: ProductCenterTestPlanAutomationBinding[];
  recipes: AutomationRecipe[];
  approvals: Array<{
    canonicalId: string;
    candidateHash: string;
    reviewedBy: string;
    reviewedAt: string;
    reason: string;
  }>;
};

export function buildProductCenterTechnicalBindingCandidates(input: {
  generatedCases: readonly GeneratedCaseInput[];
  goldCases: readonly GoldCaseInput[];
  sourceBindings: readonly SourceBindingInput[];
  recipes: readonly AutomationRecipe[];
  pageContract: ProductCenterPageContractObservation;
}): ProductCenterTechnicalBindingCandidateDocument {
  const goldById = uniqueBy(input.goldCases, (item) => item.id, 'Gold 用例');
  const recipeById = uniqueBy(input.recipes, (item) => item.caseId, 'Recipe');
  const observationById = uniqueBy(
    input.pageContract.observations,
    (item) => item.caseId,
    '页面观测',
  );
  const candidates = [...input.generatedCases]
    .sort((left, right) => left.canonicalId.localeCompare(right.canonicalId))
    .map((generated) => buildCandidate({
      generated,
      gold: goldById.get(generated.internalCaseId),
      recipe: recipeById.get(generated.internalCaseId),
      observation: observationById.get(generated.internalCaseId),
      sourceBindings: input.sourceBindings,
      pageContract: input.pageContract,
    }));
  const ready = candidates.filter((item) => item.status === 'candidate-ready').length;
  const bindingSemanticFingerprint = fingerprintApprovedBindingSemantics(
    candidates.flatMap((item) => item.binding ? [item.binding] : []),
    candidates.flatMap((item) => item.recipe ? [item.recipe] : []),
  );
  const fingerprint = bindingSemanticFingerprint;
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-technical-binding-candidates',
    fingerprint,
    bindingSemanticFingerprint,
    pageObservationFingerprint: input.pageContract.fingerprint,
    status: ready === candidates.length ? 'approval-required' : 'review-required',
    summary: { total: candidates.length, ready, blocked: candidates.length - ready },
    candidates,
    approvalRequired: true,
    generationAllowed: false,
    guardrails: {
      sourceInferenceAllowed: false,
      automationAsBusinessSourceAllowed: false,
      approvalFingerprintRequired: true,
      pageObservationMustBeClean: true,
    },
  };
}

export function buildProductCenterTechnicalBindingApprovalRequest(
  candidates: ProductCenterTechnicalBindingCandidateDocument,
): ProductCenterTechnicalBindingApprovalDocument {
  const decisions = candidates.candidates
    .filter((item) => item.status === 'candidate-ready')
    .map((item) => ({
      canonicalId: item.canonicalId,
      candidateHash: item.candidateHash,
      bindingSemanticHash: item.candidateHash,
      candidateSummary: {
        internalCaseId: item.internalCaseId,
        title: item.recipe?.title ?? '',
        module: item.module,
        route: item.binding?.route ?? '',
        capabilityIds: [...(item.binding?.capabilityIds ?? [])],
        assertionAdapterIds: [...(item.binding?.assertionAdapterIds ?? [])],
        seedAdapterIds: [...(item.binding?.seedAdapterIds ?? [])],
        cleanupAdapterIds: [...(item.binding?.cleanupAdapterIds ?? [])],
        claimCount: item.binding?.claimIds.length ?? 0,
        mutatesData: item.binding?.mutatesData === true,
        pageObservationFingerprint: item.evidence.pageObservationFingerprint,
      },
      decision: 'pending' as const,
      reviewedBy: null,
      reviewedAt: null,
      reason: null,
    }));
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-technical-binding-approvals',
    status: 'approval-required',
    candidateFingerprint: candidates.fingerprint,
    bindingSemanticFingerprint: candidates.bindingSemanticFingerprint,
    pageObservationFingerprint: candidates.pageObservationFingerprint,
    decisions,
    summary: {
      total: candidates.summary.total,
      pending: decisions.length,
      approved: 0,
      rejected: 0,
    },
  };
}

export function compileApprovedProductCenterTechnicalBindings(
  candidates: ProductCenterTechnicalBindingCandidateDocument,
  approval: ProductCenterTechnicalBindingApprovalDocument,
  options: {
    legacyApproved?: {
      bindings: readonly ProductCenterTestPlanAutomationBinding[];
      recipes: readonly AutomationRecipe[];
    };
  } = {},
): ApprovedProductCenterTechnicalBindings {
  if (candidates.status !== 'approval-required' || candidates.summary.blocked !== 0) {
    throw new Error('技术绑定候选存在阻断项，禁止编译');
  }
  const semanticApprovalMatches = approval.bindingSemanticFingerprint
    ? approval.bindingSemanticFingerprint === candidates.bindingSemanticFingerprint
    : approval.candidateFingerprint === candidates.bindingSemanticFingerprint;
  const legacySemanticMatches = !semanticApprovalMatches
    && Boolean(options.legacyApproved)
    && fingerprintApprovedBindingSemantics(
      options.legacyApproved?.bindings ?? [],
      options.legacyApproved?.recipes ?? [],
    ) === candidates.bindingSemanticFingerprint;
  if (!semanticApprovalMatches && !legacySemanticMatches) {
    throw new Error(options.legacyApproved
      ? '旧审批对应正式产物与当前技术绑定语义不一致'
      : '技术绑定审批已过期，绑定语义指纹不一致');
  }
  const decisionsById = uniqueBy(approval.decisions, (item) => item.canonicalId, '审批决定');
  const approvals: ApprovedProductCenterTechnicalBindings['approvals'] = [];
  const bindings: ProductCenterTestPlanAutomationBinding[] = [];
  const recipes: AutomationRecipe[] = [];
  for (const candidate of candidates.candidates) {
    const decision = decisionsById.get(candidate.canonicalId);
    if (!decision || decision.decision !== 'approved') {
      throw new Error(`技术绑定候选尚未批准：${candidate.canonicalId}`);
    }
    const decisionSemanticHash = decision.bindingSemanticHash ?? decision.candidateHash;
    if (!legacySemanticMatches && decisionSemanticHash !== candidate.candidateHash) {
      throw new Error(`技术绑定候选指纹不一致：${candidate.canonicalId}`);
    }
    if (!decision.reviewedBy?.trim() || !decision.reason?.trim() || !validIsoDate(decision.reviewedAt)) {
      throw new Error(`技术绑定审批信息不完整：${candidate.canonicalId}`);
    }
    if (!candidate.binding || !candidate.recipe) {
      throw new Error(`技术绑定候选缺少可编译内容：${candidate.canonicalId}`);
    }
    if (
      candidate.binding.capabilityIds[0] !== 'navigation.sidebar.open'
      || candidate.recipe.capabilities[0]?.id !== 'navigation.sidebar.open'
    ) {
      throw new Error(`技术绑定候选未从侧边栏进入：${candidate.canonicalId}`);
    }
    bindings.push(structuredClone(candidate.binding));
    recipes.push(structuredClone(candidate.recipe));
    approvals.push({
      canonicalId: candidate.canonicalId,
      candidateHash: candidate.candidateHash,
      reviewedBy: decision.reviewedBy,
      reviewedAt: decision.reviewedAt!,
      reason: decision.reason,
    });
  }
  const fingerprint = hashValue({
    bindingSemanticFingerprint: candidates.bindingSemanticFingerprint,
    bindings,
    recipes,
    approvals,
  });
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-approved-technical-bindings',
    status: 'approved',
    candidateFingerprint: candidates.fingerprint,
    bindingSemanticFingerprint: candidates.bindingSemanticFingerprint,
    pageObservationFingerprint: candidates.pageObservationFingerprint,
    fingerprint,
    summary: { total: bindings.length },
    bindings,
    recipes,
    approvals,
  };
}

function buildCandidate(input: {
  generated: GeneratedCaseInput;
  gold: GoldCaseInput | undefined;
  recipe: AutomationRecipe | undefined;
  observation: ProductCenterPageContractObservation['observations'][number] | undefined;
  sourceBindings: readonly SourceBindingInput[];
  pageContract: ProductCenterPageContractObservation;
}): ProductCenterTechnicalBindingCandidate {
  const { generated, gold, recipe, observation, pageContract } = input;
  const issueCodes: ProductCenterTechnicalBindingCandidateIssueCode[] = [];
  const issues: string[] = [];
  if (pageContract.status !== 'clean' || pageContract.findings.length > 0) {
    issue(issueCodes, issues, 'PAGE_CONTRACT_NOT_CLEAN', '页面合同不是 clean');
  }
  if (!gold) issue(issueCodes, issues, 'GOLD_CASE_REQUIRED', '缺少 Gold 用例合同');
  if (!recipe) issue(issueCodes, issues, 'RECIPE_REQUIRED', '缺少已验收 Recipe');
  if (!observation) issue(issueCodes, issues, 'PAGE_OBSERVATION_REQUIRED', '缺少页面合同观测');
  if (gold && gold.module !== generated.module) {
    issue(issueCodes, issues, 'MODULE_BINDING_MISMATCH', `方案模块=${generated.module};Gold模块=${gold.module}`);
  }
  if (gold && recipe && observation && new Set([gold.route, recipe.route, observation.route]).size !== 1) {
    issue(issueCodes, issues, 'ROUTE_BINDING_MISMATCH', 'Gold、Recipe 与页面观测路由不一致');
  }
  if (observation && !observation.runtimeAccepted) {
    issue(issueCodes, issues, 'RUNTIME_ACCEPTANCE_REQUIRED', '页面观测缺少 runtime acceptance');
  }
  if (observation && (
    !observation.sidebarEntryVerified
    || observation.capabilityIds[0] !== 'navigation.sidebar.open'
  )) {
    issue(issueCodes, issues, 'SIDEBAR_ENTRY_REQUIRED', '页面观测未证明从侧边栏进入');
  }
  if (observation && observation.assertionAdapterIds.length === 0) {
    issue(issueCodes, issues, 'ASSERTION_ADAPTER_REQUIRED', '页面观测缺少断言适配器');
  }
  if (recipe && observation && !sameStrings(
    recipe.capabilities.map((item) => item.id),
    observation.capabilityIds,
  )) {
    issue(issueCodes, issues, 'SIDEBAR_ENTRY_REQUIRED', 'Recipe capability 与页面观测不一致');
  }
  if (recipe && observation && !sameStrings(
    recipe.assertions.map((item) => item.adapterId),
    observation.assertionAdapterIds,
  )) {
    issue(issueCodes, issues, 'ASSERTION_OBSERVATION_MISMATCH', 'Recipe assertion 与页面观测不一致');
  }
  const goldClaimIds = validStrings(gold?.claims?.map((item) => item.id) ?? []);
  if (recipe && (!sameStringSet(recipe.claimIds ?? [], goldClaimIds) || goldClaimIds.length === 0)) {
    issue(issueCodes, issues, 'CLAIM_BINDING_MISMATCH', 'Gold Claim 与 Recipe Claim 不一致或为空');
  }
  const sourceRefs = new Set(validStrings(gold?.sourceRefs ?? []));
  const sourceBindings = input.sourceBindings
    .filter((item) => sourceRefs.has(item.ref))
    .map((item) => ({ ref: item.ref, sourceIds: validStrings(item.sourceIds) }))
    .filter((item) => item.sourceIds.length > 0)
    .sort((left, right) => left.ref.localeCompare(right.ref));
  if (sourceBindings.length === 0) {
    issue(issueCodes, issues, 'SOURCE_BINDING_REQUIRED', 'Gold 来源未映射到精确 source ID');
  }
  if (gold?.mutatesData === true && (gold.execution?.cleanupAdapterIds?.length ?? 0) === 0) {
    issue(issueCodes, issues, 'CLEANUP_ADAPTER_REQUIRED', '写数据用例缺少清理适配器');
  }

  const binding = issueCodes.length === 0 && gold && recipe && observation
    ? {
        canonicalId: generated.canonicalId,
        internalCaseId: generated.internalCaseId,
        module: generated.module,
        route: observation.route,
        sourceBindings,
        capabilityIds: [...observation.capabilityIds],
        assertionAdapterIds: [...observation.assertionAdapterIds],
        seedAdapterIds: validStrings(gold.execution?.seedAdapterIds ?? []),
        cleanupAdapterIds: validStrings(gold.execution?.cleanupAdapterIds ?? []),
        verificationSignals: validStrings(gold.execution?.verificationSignals ?? []),
        claimIds: goldClaimIds,
        mutatesData: gold.mutatesData === true,
        cleanup: validStrings(gold.cleanup ?? []),
      } satisfies ProductCenterTestPlanAutomationBinding
    : undefined;
  const evidence = {
    pageObservationFingerprint: pageContract.fingerprint,
    recipeFingerprint: pageContract.recipeFingerprint,
    evidenceFingerprint: pageContract.evidenceFingerprint,
    observationCaseId: observation?.caseId ?? generated.internalCaseId,
    runtimeAccepted: observation?.runtimeAccepted === true,
    claimCoverageComplete: observation?.claimCoverageComplete === true,
    sidebarEntryVerified: observation?.sidebarEntryVerified === true,
    fieldSources: {
      route: 'page-contract-observation' as const,
      capabilityIds: 'page-contract-observation' as const,
      assertionAdapterIds: 'page-contract-observation' as const,
      sourceBindings: 'formal-source-binding' as const,
      claimIds: 'gold-test-case-contract' as const,
      seedAndCleanup: 'gold-test-case-contract' as const,
      recipeTemplate: 'runtime-accepted-gold-recipe' as const,
    },
  };
  const candidateHash = hashValue({
    canonicalId: generated.canonicalId,
    binding,
    recipe: recipe ? technicalRecipeSemantics(recipe) : undefined,
  });
  const evidenceHash = hashValue({ evidence, issueCodes });
  return {
    canonicalId: generated.canonicalId,
    internalCaseId: generated.internalCaseId,
    module: generated.module,
    status: issueCodes.length === 0 ? 'candidate-ready' : 'review-required',
    issueCodes,
    issues,
    candidateHash,
    evidenceHash,
    binding,
    recipe: issueCodes.length === 0 && recipe ? structuredClone(recipe) : undefined,
    evidence,
  };
}

function fingerprintApprovedBindingSemantics(
  bindings: readonly ProductCenterTestPlanAutomationBinding[],
  recipes: readonly AutomationRecipe[],
): string {
  return hashValue({
    bindings: [...bindings].sort((left, right) => left.canonicalId.localeCompare(right.canonicalId)),
    recipes: [...recipes]
      .sort((left, right) => left.caseId.localeCompare(right.caseId))
      .map(technicalRecipeSemantics),
  });
}

function technicalRecipeSemantics(recipe: AutomationRecipe) {
  return {
    schemaVersion: recipe.schemaVersion,
    caseId: recipe.caseId,
    route: recipe.route,
    action: recipe.action,
    generationAllowed: recipe.generationAllowed,
    seed: recipe.seed,
    capabilities: recipe.capabilities,
    mutation: recipe.mutation,
    assertions: recipe.assertions,
    cleanup: recipe.cleanup,
  };
}

function uniqueBy<T>(items: readonly T[], key: (item: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const value = key(item);
    if (!value.trim()) throw new Error(`${label} ID 不能为空`);
    if (result.has(value)) throw new Error(`${label} ID 重复：${value}`);
    result.set(value, item);
  }
  return result;
}

function issue(
  codes: ProductCenterTechnicalBindingCandidateIssueCode[],
  issues: string[],
  code: ProductCenterTechnicalBindingCandidateIssueCode,
  message: string,
): void {
  if (!codes.includes(code)) codes.push(code);
  issues.push(message);
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function validStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].sort();
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return stableStringify([...left]) === stableStringify([...right]);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return stableStringify(validStrings(left)) === stableStringify(validStrings(right));
}

function validIsoDate(value: string | null): boolean {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}
