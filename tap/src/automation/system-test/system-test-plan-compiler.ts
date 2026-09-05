import type { AutomationRecipe, RecipeActionReadinessContract, RecipeCapabilityStep } from '../recipe/automation-recipe';
import { recipeCollectionFingerprint } from '../recipe/recipe-validator';
import {
  fingerprintSystemTestValue,
  type SystemTestDataProfile,
  type SystemTestRuleLedger,
} from './system-test-contract';
import {
  buildSystemTestContextGuards,
  fingerprintSystemTestSourceRegistry,
  validateSystemTestExecutionContext,
  validateSystemTestSourceRegistry,
  type SystemTestExecutionContext,
  type SystemTestExpectationContract,
  type SystemTestObservationChannel,
  type SystemTestSourceRegistry,
} from './system-test-governance';
import {
  reconcileTestPlanRuntimeAudit,
  type RuntimeAuditCorrectionDocument,
  type RuntimeAuditTechnicalBindingChange,
} from '../../utils/test-plan-runtime-audit-correction';
import {
  validateSystemTestPlanGovernance,
  type SystemTestPlanGovernance,
  type SystemTestSemanticContract,
} from './system-test-semantic-governance';

export type SystemTestPlanCase = {
  caseId: string;
  ruleId: string;
  title: string;
  sourceIds: string[];
  route: `/${string}`;
  action: AutomationRecipe['action'];
  dataProfileId: string;
  coverageIds: string[];
  contractIds: string[];
  conditions: string[];
  actions: string[];
  expectations: SystemTestExpectationContract[];
  capabilities: RecipeCapabilityStep[];
  actionReadiness?: RecipeActionReadinessContract;
  mutation?: { method: 'POST' | 'PUT' | 'DELETE'; operationKey: string };
  semantics?: SystemTestSemanticContract;
  contextRouteMatch?: 'exact' | 'exact-or-descendant';
  /** Adapter-owned tenant/store context. One browser batch may use only one profile. */
  executionContextProfile?: string;
};

export type SystemTestExcludedDisposition =
  | 'deferred'
  | 'blocked-source'
  | 'blocked-technical'
  | 'not-applicable';

export type SystemTestClassifiedExclusion = {
  caseId: string;
  title: string;
  disposition: SystemTestExcludedDisposition;
  sourceIds: string[];
  route: `/${string}` | null;
  semantics: SystemTestSemanticContract;
  assertionSurfaceAssessment: {
    requiredChannels: SystemTestObservationChannel[];
    availableChannels: SystemTestObservationChannel[];
    missingEvidence: Array<{ channel: SystemTestObservationChannel; reason: string }>;
  };
  contextAssessment: {
    status: 'verified' | 'blocked-source' | 'blocked-technical' | 'not-applicable';
    reason: string;
  };
  apiMappings: Array<{
    operationKey: string | null;
    status: 'mapped' | 'conditional' | 'missing' | 'not-required';
    sourceIds: string[];
    reason: string;
  }>;
  missingCapabilities: string[];
  reason: string;
  recoveryCondition: string;
};

export type SystemTestClassificationLedger = {
  schemaVersion: '1.0.0';
  systemId: string;
  fingerprint: string;
  summary: {
    planned: number;
    executable: number;
    classifiedExclusions: number;
    dispositions: Record<SystemTestExcludedDisposition, number>;
  };
  cases: SystemTestClassifiedExclusion[];
};

export type SystemTestPlan = {
  schemaVersion: '1.0.0';
  systemId: string;
  sourceRegistry: SystemTestSourceRegistry;
  executionContext: SystemTestExecutionContext;
  governance?: SystemTestPlanGovernance;
  runtimeAudit?: RuntimeAuditCorrectionDocument;
  runtimeAuditPath?: string;
  executionSelection?: {
    strategy: 'new-or-changed-executable-bindings';
  };
  /** @deprecated Use executionSelection for new plans. */
  initialExecutionCaseIds?: string[];
  cases: SystemTestPlanCase[];
  classifiedExclusions?: SystemTestClassifiedExclusion[];
};

type SystemTestMutationMethod = NonNullable<SystemTestPlanCase['mutation']>['method'];

export function compileSystemTestPlan(input: {
  plan: SystemTestPlan;
  dataProfiles: Record<string, SystemTestDataProfile>;
  rootDir?: string;
}): {
  recipeCollection: { schemaVersion: '1.0.0'; fingerprint: string; recipes: AutomationRecipe[] };
  ruleLedger: SystemTestRuleLedger;
  bindings: Array<{ caseId: string; ruleId: string; recipeId: string; dataProfileId: string; executionContextProfile?: string }>;
  classificationLedger: SystemTestClassificationLedger;
  rerunCaseIds: string[];
  errors: string[];
} {
  const errors: string[] = [];
  errors.push(...validateSystemTestExecutionContext(input.plan.executionContext));
  const seenCaseIds = new Set<string>();
  const recipes: AutomationRecipe[] = [];
  const rules: SystemTestRuleLedger['rules'] = [];
  const bindings: Array<{ caseId: string; ruleId: string; recipeId: string; dataProfileId: string; executionContextProfile?: string }> = [];
  const governedCases: SystemTestPlanCase[] = [];
  const classifiedExclusions = structuredClone(input.plan.classifiedExclusions ?? []);
  if (input.plan.runtimeAudit && input.plan.runtimeAuditPath) {
    errors.push('document:RUNTIME_AUDIT_SOURCE_AMBIGUOUS');
  }
  const runtimeReconciliation = input.plan.runtimeAudit
    ? reconcileTestPlanRuntimeAudit(input.plan.cases.map((item) => ({
      caseId: item.caseId,
      title: item.title,
      preconditions: item.conditions,
      actions: item.actions,
      expectedResults: item.expectations.map((expectation) => expectation.expected),
      route: item.route,
      capabilityIds: item.capabilities.map((capability) => capability.id),
      assertionAdapterIds: item.expectations.map((expectation) => expectation.assertionAdapterId),
      coverageIds: [...item.coverageIds],
      sourceIds: [...item.sourceIds],
    })), input.plan.runtimeAudit, {
      rootDir: input.rootDir,
      expectedPlanId: input.plan.runtimeAudit.schemaVersion === '2.0.0'
        ? input.plan.systemId
        : undefined,
    })
    : undefined;
  errors.push(...(runtimeReconciliation?.issues.map((item) => `${item.caseId}:${item.code}`) ?? []));
  const runtimeCases = new Map(runtimeReconciliation?.cases.map((item) => [item.caseId, item]) ?? []);
  const bindingChanges = new Map(runtimeReconciliation?.technicalBindingChanges.map((item) => [item.caseId, item]) ?? []);
  for (const source of input.plan.cases) {
    const runtimeCase = runtimeCases.get(source.caseId);
    const bindingChange = bindingChanges.get(source.caseId);
    const profile = input.dataProfiles[source.dataProfileId];
    if (runtimeCase && runtimeCase.expectedResults.length !== source.expectations.length) {
      errors.push(`${source.caseId}:RUNTIME_AUDIT_ASSERTION_BINDING_MISMATCH`);
      continue;
    }
    const item: SystemTestPlanCase = runtimeCase ? {
      ...source,
      title: runtimeCase.title,
      route: (runtimeCase.route ?? source.route) as `/${string}`,
      conditions: [...runtimeCase.preconditions],
      actions: [...runtimeCase.actions],
      expectations: source.expectations.map((expectation, index) => ({
        ...expectation,
        expected: runtimeCase.expectedResults[index],
        assertionAdapterId: runtimeCase.assertionAdapterIds?.[index] ?? expectation.assertionAdapterId,
      })),
      capabilities: runtimeCase.capabilityIds
        ? runtimeCase.capabilityIds.map((id) => source.capabilities.find((item) => item.id === id) ?? { id })
        : source.capabilities,
      coverageIds: runtimeCase.coverageIds ?? source.coverageIds,
      sourceIds: runtimeCase.sourceIds ?? source.sourceIds,
      mutation: resolveRuntimeMutation(source, bindingChange, profile?.mutationMode === 'reversible', errors),
    } : source;
    governedCases.push(item);
    if (seenCaseIds.has(item.caseId)) errors.push(`${item.caseId}:CASE_DUPLICATE`);
    seenCaseIds.add(item.caseId);
    if (!profile) {
      errors.push(`${item.caseId}:DATA_PROFILE_REQUIRED`);
      continue;
    }
    errors.push(...validateSystemTestSourceRegistry({
      registry: input.plan.sourceRegistry,
      caseId: item.caseId,
      route: item.route,
      sourceIds: item.sourceIds,
      contractIds: item.contractIds,
      expectations: item.expectations,
    }));
    if (item.expectations.length === 0) errors.push(`${item.caseId}:EXPECTATION_REQUIRED`);
    if (item.capabilities.length === 0) errors.push(`${item.caseId}:CAPABILITY_REQUIRED`);
    const conditionClaims = item.conditions.map((_, index) => `${item.caseId}:precondition-${index + 1}`);
    const actionClaims = item.actions.map((_, index) => `${item.caseId}:action-${index + 1}`);
    const outcomeClaims = item.expectations.map((_, index) => `${item.caseId}:expectation-${index + 1}`);
    const recipeId = `${input.plan.systemId}:${item.caseId}`;
    const reversible = profile.mutationMode === 'reversible';
    const fixtureReversible = profile.mutationMode === 'fixture-reversible';
    if (reversible && !item.mutation) errors.push(`${item.caseId}:MUTATION_REQUIRED`);
    if (fixtureReversible && item.mutation) errors.push(`${item.caseId}:FIXTURE_LIFECYCLE_MUTATION_FORBIDDEN`);
    if (profile.mutationMode === 'none' && item.mutation) errors.push(`${item.caseId}:READ_ONLY_MUTATION_FORBIDDEN`);
    recipes.push({
      schemaVersion: '1.0.0',
      id: recipeId,
      caseId: item.caseId,
      title: item.title,
      tags: ['@system-test', `@${item.action}`],
      route: item.route,
      action: item.action,
      traceabilityId: `trace:sop:${input.plan.systemId}:${item.caseId}`,
      sourceIds: [...item.sourceIds],
      provenanceFingerprint: fingerprintSystemTestValue({
        sourceRegistry: fingerprintSystemTestSourceRegistry({
          schemaVersion: '1.0.0',
          sources: input.plan.sourceRegistry.sources
            .filter((sourceRecord) => item.sourceIds.includes(sourceRecord.sourceId)),
        }),
        governance: input.plan.governance ? {
          ...input.plan.governance,
          assertionSurfaces: input.plan.governance.assertionSurfaces.filter((surface) => (
            item.expectations.some((expectation) => expectation.assertionSurfaceId === surface.surfaceId)
          )),
        } : undefined,
        semantics: item.semantics,
        sourceIds: item.sourceIds,
        contractIds: item.contractIds,
        expectations: item.expectations,
      }),
      provenanceScope: 'case-scoped-v1',
      claimIds: [...conditionClaims, ...actionClaims, ...outcomeClaims],
      coverageIds: [...item.coverageIds],
      generationAllowed: true,
      contextGuards: input.plan.governance
        ? buildSystemTestContextGuards({
          adapterId: input.plan.governance.contextGuardPolicy.adapterId,
          phases: input.plan.governance.contextGuardPolicy.phases,
          route: item.route,
          routeMatch: item.contextRouteMatch,
          executionContext: input.plan.executionContext,
          businessIdentityStrategy: item.semantics?.businessIdentityStrategy ?? 'none',
        })
        : [],
      capabilities: structuredClone(item.capabilities),
      ...(item.actionReadiness ? { actionReadiness: structuredClone(item.actionReadiness) } : {}),
      assertions: item.expectations.map((expectation, index) => ({
        adapterId: expectation.assertionAdapterId,
        claimIds: [outcomeClaims[index]],
      })),
      assertionContracts: item.expectations.map((expectation, index) => ({
        claimId: outcomeClaims[index],
        adapterId: expectation.assertionAdapterId,
        observationChannel: expectation.observationChannel,
        authority: expectation.authority,
        terminalCondition: expectation.terminalCondition,
        fieldId: expectation.fieldId,
        assertionSurfaceId: expectation.assertionSurfaceId,
        feedback: expectation.feedback,
        sourceIds: [...expectation.sourceIds],
        contractIds: [...expectation.contractIds],
      })),
      ...(reversible || fixtureReversible ? {
        seed: { adapterId: profile.seedAdapterId! },
        cleanup: { adapterId: profile.cleanupAdapterId! },
      } : {}),
      ...(reversible ? { mutation: item.mutation! } : {}),
    });
    rules.push({
      ruleId: item.ruleId,
      caseId: item.caseId,
      status: 'provisional',
      outcomeClaims,
      outcomes: item.expectations.map((expectation) => expectation.expected),
      formalPromotionAllowed: false,
    });
    bindings.push({
      caseId: item.caseId,
      ruleId: item.ruleId,
      recipeId,
      dataProfileId: item.dataProfileId,
      ...(item.executionContextProfile ? { executionContextProfile: item.executionContextProfile } : {}),
    });
  }
  errors.push(...validateSystemTestPlanGovernance({
    governance: input.plan.governance,
    sourceRegistry: input.plan.sourceRegistry,
    cases: governedCases,
  }));
  if (input.plan.executionSelection && (input.plan.initialExecutionCaseIds?.length ?? 0) > 0) {
    errors.push('EXECUTION_SELECTION_LEGACY_FIELD_FORBIDDEN');
  }
  if (input.plan.executionSelection
    && input.plan.executionSelection.strategy !== 'new-or-changed-executable-bindings') {
    errors.push('EXECUTION_SELECTION_STRATEGY_UNSUPPORTED');
  }
  const unknownInitialExecutionCaseIds = (input.plan.initialExecutionCaseIds ?? [])
    .filter((caseId) => !seenCaseIds.has(caseId));
  errors.push(...unknownInitialExecutionCaseIds.map((caseId) => `${caseId}:INITIAL_EXECUTION_CASE_NOT_FOUND`));
  errors.push(...validateSystemTestClassifiedExclusions({
    executableCases: governedCases,
    exclusions: classifiedExclusions,
    sourceRegistry: input.plan.sourceRegistry,
  }));
  const fingerprint = recipeCollectionFingerprint(recipes);
  const dispositions: SystemTestClassificationLedger['summary']['dispositions'] = {
    deferred: 0,
    'blocked-source': 0,
    'blocked-technical': 0,
    'not-applicable': 0,
  };
  for (const item of classifiedExclusions) dispositions[item.disposition] += 1;
  const classificationLedgerCases = [...classifiedExclusions].sort((left, right) => left.caseId.localeCompare(right.caseId));
  const classificationLedger: SystemTestClassificationLedger = {
    schemaVersion: '1.0.0',
    systemId: input.plan.systemId,
    fingerprint: fingerprintSystemTestValue(classificationLedgerCases),
    summary: {
      planned: governedCases.length + classificationLedgerCases.length,
      executable: governedCases.length,
      classifiedExclusions: classificationLedgerCases.length,
      dispositions,
    },
    cases: classificationLedgerCases,
  };
  return {
    recipeCollection: { schemaVersion: '1.0.0', fingerprint, recipes },
    ruleLedger: { schemaVersion: '1.0.0', fingerprint: fingerprintSystemTestValue(rules), rules },
    bindings,
    classificationLedger,
    rerunCaseIds: runtimeReconciliation?.rerunCaseIds ?? [],
    errors: [...new Set(errors)].sort(),
  };
}

function validateSystemTestClassifiedExclusions(input: {
  executableCases: readonly SystemTestPlanCase[];
  exclusions: readonly SystemTestClassifiedExclusion[];
  sourceRegistry: SystemTestSourceRegistry | undefined;
}): string[] {
  const errors: string[] = [];
  const sources = new Map(input.sourceRegistry?.sources.map((item) => [item.sourceId, item]) ?? []);
  const executableIds = new Set(input.executableCases.map((item) => item.caseId));
  const seen = new Set<string>();
  const semanticOwners = new Map<string, string>();

  for (const item of input.executableCases) {
    if (item.semantics) semanticOwners.set(classificationSemanticKey(item.semantics), item.caseId);
  }
  for (const item of input.exclusions) {
    if (!item.caseId.trim()) errors.push('CLASSIFIED_EXCLUSION_CASE_ID_REQUIRED');
    if (!item.title.trim()) errors.push(`${item.caseId}:CLASSIFIED_EXCLUSION_TITLE_REQUIRED`);
    if (executableIds.has(item.caseId)) errors.push(`${item.caseId}:CASE_EXECUTABLE_AND_EXCLUDED`);
    if (seen.has(item.caseId)) errors.push(`${item.caseId}:CLASSIFIED_EXCLUSION_DUPLICATE`);
    seen.add(item.caseId);
    if (!item.reason.trim()) errors.push(`${item.caseId}:CLASSIFIED_EXCLUSION_REASON_REQUIRED`);
    if (!item.recoveryCondition.trim()) errors.push(`${item.caseId}:CLASSIFIED_EXCLUSION_RECOVERY_REQUIRED`);
    if (!item.contextAssessment.reason.trim()) errors.push(`${item.caseId}:CONTEXT_ASSESSMENT_REASON_REQUIRED`);
    if (item.sourceIds.length === 0) errors.push(`${item.caseId}:CLASSIFIED_EXCLUSION_SOURCE_REQUIRED`);
    const resolvedSources = item.sourceIds.flatMap((sourceId) => {
      const source = sources.get(sourceId);
      if (!source) {
        errors.push(`${item.caseId}:CLASSIFIED_EXCLUSION_SOURCE_UNRESOLVED:${sourceId}`);
        return [];
      }
      return [source];
    });
    if (item.route && resolvedSources.length > 0 && !resolvedSources.some((source) => source.routes.includes(item.route!))) {
      errors.push(`${item.caseId}:CLASSIFIED_EXCLUSION_ROUTE_UNRESOLVED:${item.route}`);
    }

    const required = new Set(item.assertionSurfaceAssessment.requiredChannels);
    const available = new Set(item.assertionSurfaceAssessment.availableChannels);
    const missing = new Map(item.assertionSurfaceAssessment.missingEvidence.map((entry) => [entry.channel, entry.reason]));
    if (required.size === 0) errors.push(`${item.caseId}:ASSERTION_CHANNEL_REQUIRED`);
    for (const channel of available) {
      if (!required.has(channel)) errors.push(`${item.caseId}:ASSERTION_CHANNEL_NOT_REQUIRED:${channel}`);
      if (!resolvedSources.some((source) => source.observationChannels.includes(channel))) {
        errors.push(`${item.caseId}:ASSERTION_CHANNEL_SOURCE_UNRESOLVED:${channel}`);
      }
    }
    for (const channel of required) {
      if (!available.has(channel) && !missing.get(channel)?.trim()) {
        errors.push(`${item.caseId}:ASSERTION_CHANNEL_UNCLASSIFIED:${channel}`);
      }
    }
    for (const [channel, reason] of missing) {
      if (!required.has(channel)) errors.push(`${item.caseId}:MISSING_EVIDENCE_CHANNEL_NOT_REQUIRED:${channel}`);
      if (!reason.trim()) errors.push(`${item.caseId}:MISSING_EVIDENCE_REASON_REQUIRED:${channel}`);
    }
    if (item.disposition === 'blocked-source' && missing.size === 0) {
      errors.push(`${item.caseId}:BLOCKED_SOURCE_EVIDENCE_GAP_REQUIRED`);
    }
    if ((item.disposition === 'blocked-technical' || item.disposition === 'deferred')
      && item.missingCapabilities.length === 0) {
      errors.push(`${item.caseId}:MISSING_CAPABILITY_REQUIRED`);
    }
    if (item.disposition === 'not-applicable' && item.contextAssessment.status !== 'not-applicable') {
      errors.push(`${item.caseId}:NOT_APPLICABLE_CONTEXT_REQUIRED`);
    }

    for (const mapping of item.apiMappings) {
      if (!mapping.reason.trim()) errors.push(`${item.caseId}:API_MAPPING_REASON_REQUIRED`);
      if (mapping.status === 'mapped' && !mapping.operationKey?.trim()) {
        errors.push(`${item.caseId}:MAPPED_OPERATION_KEY_REQUIRED`);
      }
      if (mapping.operationKey !== null && !mapping.operationKey.trim()) {
        errors.push(`${item.caseId}:API_OPERATION_KEY_INVALID`);
      }
      for (const sourceId of mapping.sourceIds) {
        if (!item.sourceIds.includes(sourceId) || !sources.has(sourceId)) {
          errors.push(`${item.caseId}:API_MAPPING_SOURCE_UNRESOLVED:${sourceId}`);
        }
      }
    }
    for (const [key, value] of Object.entries(item.semantics)) {
      if (key === 'variantSourceIds' || key === 'businessIdentityStrategy') continue;
      if (!String(value).trim()) errors.push(`${item.caseId}:SEMANTIC_VALUE_REQUIRED:${key}`);
    }
    for (const sourceId of item.semantics.variantSourceIds) {
      if (!item.sourceIds.includes(sourceId) || !sources.has(sourceId)) {
        errors.push(`${item.caseId}:SEMANTIC_VARIANT_SOURCE_UNRESOLVED:${sourceId}`);
      }
    }
    const semanticKey = classificationSemanticKey(item.semantics);
    const previous = semanticOwners.get(semanticKey);
    if (previous) errors.push(`${item.caseId}:CLASSIFIED_SEMANTIC_DUPLICATE:${previous},${item.caseId}`);
    else semanticOwners.set(semanticKey, item.caseId);
  }
  return [...new Set(errors)].sort();
}

function classificationSemanticKey(semantics: SystemTestSemanticContract): string {
  return [
    semantics.businessObjectId,
    semantics.scenarioFamilyId,
    semantics.stateTransitionId,
    semantics.scopeId,
    semantics.variantId,
  ].map((value) => value.trim().toLowerCase().replace(/\s+/g, '-')).join('::');
}

function resolveRuntimeMutation(
  source: SystemTestPlanCase,
  bindingChange: RuntimeAuditTechnicalBindingChange | undefined,
  reversible: boolean,
  errors: string[],
): SystemTestPlanCase['mutation'] {
  const operations = bindingChange?.apiOperations;
  if (!operations?.length || (!reversible && !source.mutation)) return source.mutation;
  const mutationOperations = operations.flatMap((operation) => {
    const method = normalizeMutationMethod(operation.method);
    return method ? [{ ...operation, method }] : [];
  });
  if (mutationOperations.length !== 1) {
    errors.push(`${source.caseId}:${mutationOperations.length === 0
      ? 'RUNTIME_AUDIT_MUTATION_METHOD_INVALID'
      : 'RUNTIME_AUDIT_MUTATION_AMBIGUOUS'}`);
    return undefined;
  }
  const [operation] = mutationOperations;
  if (!operation.operationKey?.trim()) {
    errors.push(`${source.caseId}:RUNTIME_AUDIT_OPERATION_KEY_REQUIRED`);
    return undefined;
  }
  return {
    method: operation.method,
    operationKey: operation.operationKey,
  };
}

function normalizeMutationMethod(method: string): SystemTestMutationMethod | undefined {
  const normalized = method.toUpperCase();
  return normalized === 'POST' || normalized === 'PUT' || normalized === 'DELETE' ? normalized : undefined;
}
