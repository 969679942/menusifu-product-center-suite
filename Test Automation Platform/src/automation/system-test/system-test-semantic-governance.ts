import type { SystemTestObservationAuthority, SystemTestObservationChannel, SystemTestSourceRegistry } from './system-test-governance';

export type SystemTestSemanticContract = {
  businessObjectId: string;
  scenarioFamilyId: string;
  stateTransitionId: string;
  scopeId: string;
  variantId: string;
  variantSourceIds: string[];
  businessIdentityStrategy: 'none' | 'server-id' | 'unique-marker' | 'composite';
};

export type SystemTestAssertionSurfaceContract = {
  surfaceId: string;
  observationChannel: SystemTestObservationChannel;
  authority: SystemTestObservationAuthority;
  routes: `/${string}`[];
  fieldIds: string[];
};

export type SystemTestFeedbackContract = {
  mode: 'exact-message' | 'disabled-control' | 'confirmation-dialog';
  trigger: 'pre-submit' | 'submitted-operation';
  exactText?: string;
  operationKey?: string;
};

export type SystemTestPlanGovernance = {
  schemaVersion: '1.0.0';
  semanticDuplicatePolicy: { enabled: true; requireVariantEvidence: true };
  assertionSurfaces: SystemTestAssertionSurfaceContract[];
  contextGuardPolicy: {
    adapterId: string;
    phases: ['before-action', 'before-assertion'];
    requiredChecks: Array<'route' | 'locale' | 'role' | 'tenant' | 'business-identity'>;
  };
  feedbackPolicy: {
    exactFeedbackRequiresRuntimeEvidence: true;
    mutationFeedbackRequiresOperationCorrelation: true;
  };
};

export type SystemTestSemanticCase = {
  caseId: string;
  route: `/${string}`;
  sourceIds: string[];
  mutation?: { operationKey: string };
  contextRouteMatch?: 'exact' | 'exact-or-descendant';
  semantics?: SystemTestSemanticContract;
  expectations: Array<{
    expected: string;
    sourceIds: string[];
    observationChannel: SystemTestObservationChannel;
    authority: SystemTestObservationAuthority;
    fieldId?: string;
    assertionSurfaceId?: string;
    feedback?: SystemTestFeedbackContract;
  }>;
};

export function validateSystemTestPlanGovernance(input: {
  governance: SystemTestPlanGovernance | undefined;
  sourceRegistry: SystemTestSourceRegistry | undefined;
  cases: readonly SystemTestSemanticCase[];
}): string[] {
  if (!input.governance) return ['PLATFORM_GOVERNANCE_REQUIRED'];
  const errors: string[] = [];
  if (input.governance.semanticDuplicatePolicy.enabled !== true
    || input.governance.semanticDuplicatePolicy.requireVariantEvidence !== true) {
    errors.push('SEMANTIC_DUPLICATE_POLICY_INVALID');
  }
  if (input.governance.feedbackPolicy.exactFeedbackRequiresRuntimeEvidence !== true
    || input.governance.feedbackPolicy.mutationFeedbackRequiresOperationCorrelation !== true) {
    errors.push('FEEDBACK_POLICY_INVALID');
  }
  const surfaces = new Map<string, SystemTestAssertionSurfaceContract>();
  for (const surface of input.governance.assertionSurfaces) {
    if (!surface.surfaceId.trim()) errors.push('ASSERTION_SURFACE_ID_REQUIRED');
    if (surfaces.has(surface.surfaceId)) errors.push(`ASSERTION_SURFACE_DUPLICATE:${surface.surfaceId}`);
    surfaces.set(surface.surfaceId, surface);
    if (surface.routes.length === 0 || surface.fieldIds.length === 0) {
      errors.push(`ASSERTION_SURFACE_SCOPE_INCOMPLETE:${surface.surfaceId}`);
    }
  }
  if (!input.governance.contextGuardPolicy.adapterId.trim()) errors.push('CONTEXT_GUARD_ADAPTER_REQUIRED');
  if (input.governance.contextGuardPolicy.phases.join(',') !== 'before-action,before-assertion') {
    errors.push('CONTEXT_GUARD_PHASES_INVALID');
  }
  const requiredChecks = new Set(input.governance.contextGuardPolicy.requiredChecks);
  for (const check of ['route', 'locale', 'role', 'tenant'] as const) {
    if (!requiredChecks.has(check)) errors.push(`CONTEXT_GUARD_CHECK_REQUIRED:${check}`);
  }
  errors.push(...validateSemanticDuplicates(input.cases, input.sourceRegistry));
  for (const testCase of input.cases) {
    if (!testCase.semantics) {
      errors.push(`${testCase.caseId}:SEMANTIC_CONTRACT_REQUIRED`);
      continue;
    }
    validateSemanticContract(testCase, input.sourceRegistry, requiredChecks, errors);
    testCase.expectations.forEach((expectation, index) => {
      const claimId = `${testCase.caseId}:expectation-${index + 1}`;
      const surface = expectation.assertionSurfaceId ? surfaces.get(expectation.assertionSurfaceId) : undefined;
      if (!expectation.fieldId?.trim()) errors.push(`${claimId}:FIELD_ID_REQUIRED`);
      if (!expectation.assertionSurfaceId?.trim()) errors.push(`${claimId}:ASSERTION_SURFACE_REQUIRED`);
      if (expectation.assertionSurfaceId && !surface) {
        errors.push(`${claimId}:ASSERTION_SURFACE_UNRESOLVED:${expectation.assertionSurfaceId}`);
      }
      if (surface) {
        if (!surface.routes.includes(testCase.route)) errors.push(`${claimId}:ASSERTION_SURFACE_ROUTE_MISMATCH:${surface.surfaceId}`);
        if (expectation.fieldId && !surface.fieldIds.includes(expectation.fieldId)) {
          errors.push(`${claimId}:ASSERTION_FIELD_SURFACE_MISMATCH:${expectation.fieldId}:${surface.surfaceId}`);
        }
        if (surface.observationChannel !== expectation.observationChannel) {
          errors.push(`${claimId}:ASSERTION_SURFACE_CHANNEL_MISMATCH:${surface.surfaceId}`);
        }
        if (surface.authority !== expectation.authority) {
          errors.push(`${claimId}:ASSERTION_SURFACE_AUTHORITY_MISMATCH:${surface.surfaceId}`);
        }
      }
      validateFeedback(testCase, expectation, claimId, input.sourceRegistry, errors);
    });
  }
  return [...new Set(errors)].sort();
}

function validateSemanticDuplicates(
  cases: readonly SystemTestSemanticCase[],
  sourceRegistry: SystemTestSourceRegistry | undefined,
): string[] {
  const groups = new Map<string, SystemTestSemanticCase[]>();
  for (const testCase of cases) {
    if (!testCase.semantics) continue;
    const semanticKey = [
      testCase.semantics.businessObjectId,
      testCase.semantics.scenarioFamilyId,
      testCase.semantics.stateTransitionId,
      testCase.semantics.scopeId,
      testCase.expectations.map((item) => `${item.fieldId ?? ''}:${item.assertionSurfaceId ?? ''}`).sort().join('|'),
    ].map(normalizeSemanticId).join('::');
    groups.set(semanticKey, [...(groups.get(semanticKey) ?? []), testCase]);
  }
  const knownSources = new Set(sourceRegistry?.sources.map((item) => item.sourceId) ?? []);
  return [...groups.values()].flatMap((group) => {
    if (group.length < 2) return [];
    const variantIds = group.map((item) => normalizeSemanticId(item.semantics!.variantId));
    const variantsDistinct = new Set(variantIds).size === group.length;
    const variantEvidenceKeys = group.map((item) => [...item.semantics!.variantSourceIds].sort().join('|'));
    const variantsSourced = group.every((item) => item.semantics!.variantSourceIds.length > 0
      && item.semantics!.variantSourceIds.every((sourceId) => item.sourceIds.includes(sourceId) && knownSources.has(sourceId)))
      && new Set(variantEvidenceKeys).size === group.length;
    if (variantsDistinct && variantsSourced) return [];
    const caseIds = group.map((item) => item.caseId).sort().join(',');
    return group.map((item) => `${item.caseId}:SEMANTIC_DUPLICATE_UNRESOLVED:${caseIds}`);
  });
}

function validateSemanticContract(
  testCase: SystemTestSemanticCase,
  sourceRegistry: SystemTestSourceRegistry | undefined,
  requiredChecks: ReadonlySet<string>,
  errors: string[],
): void {
  const semantic = testCase.semantics!;
  for (const [key, value] of Object.entries(semantic)) {
    if (key === 'variantSourceIds' || key === 'businessIdentityStrategy') continue;
    if (!String(value).trim()) errors.push(`${testCase.caseId}:SEMANTIC_VALUE_REQUIRED:${key}`);
  }
  const knownSources = new Set(sourceRegistry?.sources.map((item) => item.sourceId) ?? []);
  for (const sourceId of semantic.variantSourceIds) {
    if (!testCase.sourceIds.includes(sourceId) || !knownSources.has(sourceId)) {
      errors.push(`${testCase.caseId}:SEMANTIC_VARIANT_SOURCE_UNRESOLVED:${sourceId}`);
    }
  }
  if (semantic.businessIdentityStrategy !== 'none' && !requiredChecks.has('business-identity')) {
    errors.push(`${testCase.caseId}:BUSINESS_IDENTITY_GUARD_REQUIRED`);
  }
  if (testCase.mutation && semantic.businessIdentityStrategy === 'none') {
    errors.push(`${testCase.caseId}:MUTATION_BUSINESS_IDENTITY_REQUIRED`);
  }
}

function validateFeedback(
  testCase: SystemTestSemanticCase,
  expectation: SystemTestSemanticCase['expectations'][number],
  claimId: string,
  sourceRegistry: SystemTestSourceRegistry | undefined,
  errors: string[],
): void {
  const feedback = expectation.feedback;
  if (!feedback) return;
  if (feedback.mode === 'disabled-control' && feedback.trigger !== 'pre-submit') {
    errors.push(`${claimId}:DISABLED_CONTROL_TRIGGER_INVALID`);
  }
  if (feedback.trigger === 'pre-submit' && feedback.operationKey) {
    errors.push(`${claimId}:DISABLED_CONTROL_OPERATION_FORBIDDEN`);
  }
  if (feedback.trigger === 'submitted-operation' && !feedback.operationKey) {
    errors.push(`${claimId}:FEEDBACK_OPERATION_REQUIRED`);
  }
  if (feedback.trigger === 'submitted-operation' && feedback.operationKey !== testCase.mutation?.operationKey) {
    errors.push(`${claimId}:FEEDBACK_OPERATION_MISMATCH:${feedback.operationKey}`);
  }
  if (feedback.mode === 'exact-message') {
    if (!feedback.exactText?.trim()) errors.push(`${claimId}:EXACT_FEEDBACK_TEXT_REQUIRED`);
    if (feedback.exactText && !expectation.expected.includes(feedback.exactText)) {
      errors.push(`${claimId}:EXACT_FEEDBACK_EXPECTATION_MISMATCH`);
    }
    const sources = new Map(sourceRegistry?.sources.map((item) => [item.sourceId, item]) ?? []);
    const hasRuntimeSource = expectation.sourceIds.some((sourceId) => {
      const kind = sources.get(sourceId)?.kind;
      return kind === 'ui-audit' || kind === 'runtime-evidence';
    });
    if (!hasRuntimeSource) errors.push(`${claimId}:EXACT_FEEDBACK_RUNTIME_SOURCE_REQUIRED`);
  }
}

function normalizeSemanticId(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

export function matchesSystemTestRoute(
  actualPath: string,
  expectedPath: string,
  mode: 'exact' | 'exact-or-descendant',
): boolean {
  if (actualPath === expectedPath) return true;
  if (mode !== 'exact-or-descendant') return false;
  const normalizedExpected = expectedPath === '/' ? '/' : expectedPath.replace(/\/$/, '');
  return normalizedExpected !== '/' && actualPath.startsWith(`${normalizedExpected}/`);
}
