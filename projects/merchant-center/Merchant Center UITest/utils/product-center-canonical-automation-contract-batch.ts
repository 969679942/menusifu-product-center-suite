import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import type {
  ProductCenterCleanupContract,
  ProductCenterFactoryContract,
} from './product-center-data-contract-promotion';
import {
  sourceDecisionBlocksExecution,
  type ProductCenterSourceDecision,
} from './product-center-source-governance';

export type ProductCenterCanonicalAutomationBlockReason =
  | 'RECIPE_REQUIRED'
  | 'RECIPE_GENERATION_DISABLED'
  | 'CAPABILITY_CONTRACT_REQUIRED'
  | 'SEMANTIC_BINDINGS_REQUIRED'
  | 'TEST_CASE_IR_REQUIRED'
  | 'TEST_CASE_IR_MISMATCH'
  | 'OBLIGATION_CONTRACT_REQUIRED'
  | 'ASSERTION_CONTRACT_REQUIRED'
  | 'FACTORY_CONTRACT_REQUIRED'
  | 'CLEANUP_CONTRACT_REQUIRED'
  | 'AUTO_AUDIT_IDENTITY_REQUIRED'
  | 'SERVER_ID_REQUIRED'
  | 'DEPENDENCY_ID_REQUIRED'
  | 'RETRY_RECONCILIATION_REQUIRED'
  | 'FINALLY_CLEANUP_GUARANTEED_REQUIRED'
  | 'API_COUNT_ZERO_REQUIRED'
  | 'UI_COUNT_ZERO_REQUIRED'
  | 'RUNTIME_EVIDENCE_REQUIRED'
  | 'SOURCE_EVIDENCE_BLOCKED';

const allBlockingReasons: ProductCenterCanonicalAutomationBlockReason[] = [
  'RECIPE_REQUIRED',
  'RECIPE_GENERATION_DISABLED',
  'CAPABILITY_CONTRACT_REQUIRED',
  'SEMANTIC_BINDINGS_REQUIRED',
  'TEST_CASE_IR_REQUIRED',
  'TEST_CASE_IR_MISMATCH',
  'OBLIGATION_CONTRACT_REQUIRED',
  'ASSERTION_CONTRACT_REQUIRED',
  'FACTORY_CONTRACT_REQUIRED',
  'CLEANUP_CONTRACT_REQUIRED',
  'AUTO_AUDIT_IDENTITY_REQUIRED',
  'SERVER_ID_REQUIRED',
  'DEPENDENCY_ID_REQUIRED',
  'RETRY_RECONCILIATION_REQUIRED',
  'FINALLY_CLEANUP_GUARANTEED_REQUIRED',
  'API_COUNT_ZERO_REQUIRED',
  'UI_COUNT_ZERO_REQUIRED',
  'RUNTIME_EVIDENCE_REQUIRED',
  'SOURCE_EVIDENCE_BLOCKED',
];

export type ProductCenterCanonicalReviewEntry = {
  caseId: string;
  title: string;
  priority: string;
  decision: 'approved' | 'deprecated';
  automationDisposition: string;
};

export type ProductCenterCanonicalIrCase = {
  id: string;
};

export type ProductCenterCanonicalRuntimeDecision = {
  recipeId: string;
  decision: 'retain' | string;
  evidenceIds: string[];
};

export type ProductCenterCanonicalAutomationContractEntry = {
  canonicalCaseId: string;
  title: string;
  priority: string;
  reviewDecision: ProductCenterCanonicalReviewEntry['decision'];
  eligibleForTechnicalBindingReview: boolean;
  classification: 'strict-generatable' | 'blocked' | 'not-applicable';
  mutable: boolean;
  recipeId: string | null;
  capabilityIds: string[];
  testCaseIrId: string | null;
  obligationIds: string[];
  assertionAdapterIds: string[];
  assertionContractIds: string[];
  factoryAdapterId: string | null;
  factoryContractIds: string[];
  cleanupAdapterId: string | null;
  cleanupContractIds: string[];
  runtimeEvidenceIds: string[];
  blockingReasons: ProductCenterCanonicalAutomationBlockReason[];
  sourceGovernance: {
    status: 'verified' | 'blocked' | 'not-applicable' | 'untracked';
    currentGoalBlocking: boolean;
    blockCode: string | null;
  };
};

export type ProductCenterCanonicalAutomationContractBatch = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-canonical-automation-contract-batch';
  generatedAt: string;
  summary: {
    canonicalTotal: number;
    approved: number;
    notApplicable: number;
    eligibleForTechnicalBindingReview: number;
    recipeDirectBindings: number;
    explicitSemanticBindings: number;
    runtimeRetained: number;
    strictGeneratable: number;
    blocked: number;
  };
  coverage: {
    recipeDirect: string;
    explicitSemantic: string;
    runtimeRetained: string;
    strictGeneratable: string;
  };
  blockingReasonCoverage: Record<ProductCenterCanonicalAutomationBlockReason, number>;
  entries: ProductCenterCanonicalAutomationContractEntry[];
};

export function buildProductCenterCanonicalAutomationContractBatch(input: {
  generatedAt: string;
  canonicalReview: readonly ProductCenterCanonicalReviewEntry[];
  testCaseIr: readonly ProductCenterCanonicalIrCase[];
  recipes: readonly AutomationRecipe[];
  runtimeDecisions: readonly ProductCenterCanonicalRuntimeDecision[];
  factoryContracts: readonly ProductCenterFactoryContract[];
  cleanupContracts: readonly ProductCenterCleanupContract[];
  sourceDecisions?: readonly ProductCenterSourceDecision[];
}): ProductCenterCanonicalAutomationContractBatch {
  const recipeByCaseId = uniqueMap(input.recipes, (item) => item.caseId, 'Recipe case ID');
  const irIds = new Set(input.testCaseIr.map((item) => item.id));
  const runtimeByRecipeId = uniqueMap(input.runtimeDecisions, (item) => item.recipeId, 'Runtime recipe ID');
  const factoryById = uniqueMap(input.factoryContracts, (item) => item.id, 'Factory contract ID');
  const cleanupById = uniqueMap(input.cleanupContracts, (item) => item.id, 'Cleanup contract ID');
  const sourceDecisionByCaseId = uniqueMap(input.sourceDecisions ?? [], (item) => item.caseId, 'Source decision case ID');
  const entries = input.canonicalReview.map((review) => buildEntry({
    review,
    recipe: recipeByCaseId.get(review.caseId),
    irIds,
    runtimeByRecipeId,
    factoryById,
    cleanupById,
    sourceDecision: sourceDecisionByCaseId.get(review.caseId),
  }));
  const canonicalTotal = entries.length;
  const approved = entries.filter((item) => item.reviewDecision === 'approved').length;
  const notApplicable = entries.filter((item) => item.classification === 'not-applicable').length;
  const recipeDirectBindings = entries.filter((item) => item.recipeId !== null).length;
  const explicitSemanticBindings = entries.filter((item) => item.testCaseIrId !== null).length;
  const runtimeRetained = entries.filter((item) => item.runtimeEvidenceIds.length > 0).length;
  const strictGeneratable = entries.filter((item) => item.classification === 'strict-generatable').length;
  const blocked = entries.filter((item) => item.classification === 'blocked').length;
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-canonical-automation-contract-batch',
    generatedAt: input.generatedAt,
    summary: {
      canonicalTotal,
      approved,
      notApplicable,
      eligibleForTechnicalBindingReview: entries.filter((item) => item.eligibleForTechnicalBindingReview).length,
      recipeDirectBindings,
      explicitSemanticBindings,
      runtimeRetained,
      strictGeneratable,
      blocked,
    },
    coverage: {
      recipeDirect: ratio(recipeDirectBindings, canonicalTotal),
      explicitSemantic: ratio(explicitSemanticBindings, canonicalTotal),
      runtimeRetained: ratio(runtimeRetained, canonicalTotal),
      strictGeneratable: ratio(strictGeneratable, canonicalTotal),
    },
    blockingReasonCoverage: countBlockingReasons(entries),
    entries,
  };
}

function buildEntry(input: {
  review: ProductCenterCanonicalReviewEntry;
  recipe: AutomationRecipe | undefined;
  irIds: ReadonlySet<string>;
  runtimeByRecipeId: ReadonlyMap<string, ProductCenterCanonicalRuntimeDecision>;
  factoryById: ReadonlyMap<string, ProductCenterFactoryContract>;
  cleanupById: ReadonlyMap<string, ProductCenterCleanupContract>;
  sourceDecision: ProductCenterSourceDecision | undefined;
}): ProductCenterCanonicalAutomationContractEntry {
  const { review, recipe } = input;
  if (review.decision === 'deprecated') return emptyEntry(review, 'not-applicable', input.sourceDecision);
  const reasons: ProductCenterCanonicalAutomationBlockReason[] = [];
  if (sourceDecisionBlocksExecution(input.sourceDecision)) reasons.push('SOURCE_EVIDENCE_BLOCKED');
  if (!recipe) reasons.push('RECIPE_REQUIRED');
  if (recipe && !recipe.generationAllowed) reasons.push('RECIPE_GENERATION_DISABLED');
  if (recipe && recipe.capabilities.length === 0) reasons.push('CAPABILITY_CONTRACT_REQUIRED');
  if (recipe && !recipe.semanticBindings) reasons.push('SEMANTIC_BINDINGS_REQUIRED');
  const semantic = recipe?.semanticBindings;
  if (semantic && !semantic.testCaseIrId) reasons.push('TEST_CASE_IR_REQUIRED');
  if (semantic && semantic.testCaseIrId !== review.caseId) reasons.push('TEST_CASE_IR_MISMATCH');
  if (semantic && !input.irIds.has(semantic.testCaseIrId)) reasons.push('TEST_CASE_IR_REQUIRED');
  if (semantic && semantic.obligationIds.length === 0) reasons.push('OBLIGATION_CONTRACT_REQUIRED');
  if (semantic && semantic.assertionContractIds.length === 0) reasons.push('ASSERTION_CONTRACT_REQUIRED');
  const mutable = recipe !== undefined && (recipe.mutation !== undefined || recipe.seed !== undefined || recipe.cleanup !== undefined);
  if (mutable && (semantic?.factoryContractIds.length ?? 0) === 0) reasons.push('FACTORY_CONTRACT_REQUIRED');
  if (mutable && (semantic?.cleanupContractIds.length ?? 0) === 0) reasons.push('CLEANUP_CONTRACT_REQUIRED');
  if (mutable && semantic) auditMutableContracts(semantic.factoryContractIds, semantic.cleanupContractIds, input, reasons);
  const runtime = recipe ? input.runtimeByRecipeId.get(recipe.id) : undefined;
  const runtimeEvidenceIds = runtime?.decision === 'retain' ? [...runtime.evidenceIds] : [];
  if (recipe && runtimeEvidenceIds.length === 0) reasons.push('RUNTIME_EVIDENCE_REQUIRED');
  return {
    canonicalCaseId: review.caseId,
    title: review.title,
    priority: review.priority,
    reviewDecision: review.decision,
    eligibleForTechnicalBindingReview: review.automationDisposition === 'eligible-for-technical-binding-review',
    classification: reasons.length === 0 ? 'strict-generatable' : 'blocked',
    mutable,
    recipeId: recipe?.id ?? null,
    capabilityIds: unique(recipe?.capabilities.map((item) => item.id) ?? []),
    testCaseIrId: semantic?.testCaseIrId ?? null,
    obligationIds: unique(semantic?.obligationIds ?? []),
    assertionAdapterIds: unique(recipe?.assertions.map((item) => item.adapterId) ?? []),
    assertionContractIds: unique(semantic?.assertionContractIds ?? []),
    factoryAdapterId: recipe?.seed?.adapterId ?? null,
    factoryContractIds: unique(semantic?.factoryContractIds ?? []),
    cleanupAdapterId: recipe?.cleanup?.adapterId ?? null,
    cleanupContractIds: unique(semantic?.cleanupContractIds ?? []),
    runtimeEvidenceIds,
    blockingReasons: unique(reasons),
    sourceGovernance: sourceGovernanceFor(input.sourceDecision),
  };
}

function auditMutableContracts(
  factoryIds: readonly string[],
  cleanupIds: readonly string[],
  input: {
    factoryById: ReadonlyMap<string, ProductCenterFactoryContract>;
    cleanupById: ReadonlyMap<string, ProductCenterCleanupContract>;
  },
  reasons: ProductCenterCanonicalAutomationBlockReason[],
): void {
  const factories = factoryIds.map((id) => input.factoryById.get(id)).filter(isDefined);
  const cleanup = cleanupIds.map((id) => input.cleanupById.get(id)).filter(isDefined);
  if (factories.length !== factoryIds.length || factories.some((item) => !item.generationAllowed)) {
    reasons.push('FACTORY_CONTRACT_REQUIRED');
  }
  if (!factories.some((item) => item.requiredPrefix === 'AUTO_AUDIT_')) reasons.push('AUTO_AUDIT_IDENTITY_REQUIRED');
  if (!factories.some((item) => item.returnsServerId)) reasons.push('SERVER_ID_REQUIRED');
  if (!factories.some((item) => item.registersDependencyIds)) reasons.push('DEPENDENCY_ID_REQUIRED');
  if (!factories.some((item) => item.retryReconciliationSupported)) reasons.push('RETRY_RECONCILIATION_REQUIRED');
  if (cleanup.length !== cleanupIds.length || cleanup.some((item) => !item.generationAllowed)) {
    reasons.push('CLEANUP_CONTRACT_REQUIRED');
  }
  if (!cleanup.some((item) => item.finallyCleanupGuaranteed)) reasons.push('FINALLY_CLEANUP_GUARANTEED_REQUIRED');
  if (!cleanup.some((item) => item.verifiesApiCountZero)) reasons.push('API_COUNT_ZERO_REQUIRED');
  if (!cleanup.some((item) => item.verifiesUiCountZero)) reasons.push('UI_COUNT_ZERO_REQUIRED');
}

function emptyEntry(
  review: ProductCenterCanonicalReviewEntry,
  classification: 'not-applicable',
  sourceDecision?: ProductCenterSourceDecision,
): ProductCenterCanonicalAutomationContractEntry {
  return {
    canonicalCaseId: review.caseId, title: review.title, priority: review.priority,
    reviewDecision: review.decision,
    eligibleForTechnicalBindingReview: false,
    classification,
    mutable: false,
    recipeId: null,
    capabilityIds: [],
    testCaseIrId: null,
    obligationIds: [],
    assertionAdapterIds: [],
    assertionContractIds: [],
    factoryAdapterId: null,
    factoryContractIds: [],
    cleanupAdapterId: null,
    cleanupContractIds: [],
    runtimeEvidenceIds: [],
    blockingReasons: [],
    sourceGovernance: sourceGovernanceFor(sourceDecision),
  };
}

function sourceGovernanceFor(decision: ProductCenterSourceDecision | undefined) {
  return {
    status: decision?.status ?? 'untracked' as const,
    currentGoalBlocking: decision?.currentGoalBlocking ?? false,
    blockCode: decision?.blockCode ?? null,
  };
}

function countBlockingReasons(entries: readonly ProductCenterCanonicalAutomationContractEntry[]) {
  const counts = Object.fromEntries(
    allBlockingReasons.map((reason) => [reason, 0]),
  ) as Record<ProductCenterCanonicalAutomationBlockReason, number>;
  for (const entry of entries) {
    for (const reason of entry.blockingReasons) counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return counts;
}

function ratio(numerator: number, denominator: number): string {
  return `${numerator}/${denominator}`;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function uniqueMap<T>(items: readonly T[], key: (item: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const id = key(item);
    if (result.has(id)) throw new Error(`${label} 重复：${id}`);
    result.set(id, item);
  }
  return result;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
