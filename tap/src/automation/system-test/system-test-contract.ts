import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AutomationRecipe, RecipeAction } from '../recipe/automation-recipe';
import {
  fingerprintSystemTestExecutionContext,
  validateSystemTestExecutionContext,
  type SystemTestExecutionContext,
  type SystemTestObservationAuthority,
  type SystemTestObservationChannel,
} from './system-test-governance';
import { validateSystemTestUniversalInvariants } from './system-test-universal-invariants';

export type SystemTestAdapterKind =
  | 'auth'
  | 'context-guard'
  | 'recovery'
  | 'probe'
  | 'seed'
  | 'action-readiness'
  | 'capability'
  | 'assertion'
  | 'cleanup'
  | 'api-residue'
  | 'ui-residue';

export type SystemTestImplementationSource = {
  path: string;
  sha256: string;
  sourceSection?: string;
};

export type SystemTestAdapterDefinition = {
  id: string;
  kind: SystemTestAdapterKind;
  actions: RecipeAction[];
  observationChannels?: SystemTestObservationChannel[];
  implementation: SystemTestImplementationSource & {
    dependencies?: SystemTestImplementationSource[];
  };
};

export type SystemTestAdapterCatalog = {
  schemaVersion: '1.0.0';
  systemId: string;
  adapters: SystemTestAdapterDefinition[];
  operationKeys: string[];
  externalCapabilities: string[];
};

export type SystemTestRuleLedger = {
  schemaVersion: '1.0.0';
  fingerprint: string;
  rules: Array<{
    ruleId: string;
    caseId: string;
    status: 'provisional' | 'observed' | 'supported' | 'conflict' | 'blocked' | 'formal';
    outcomeClaims: string[];
    outcomes: string[];
    formalPromotionAllowed: boolean;
  }>;
};

export type SystemTestDataProfile = {
  mutationMode: 'none' | 'reversible' | 'fixture-reversible';
  requireActionReadiness?: true;
  seedAdapterId?: string;
  cleanupAdapterId?: string;
  apiResidueAdapterId?: string;
  uiResidueAdapterId?: string;
  requiredOperationKeys: string[];
  probeAdapterIds: string[];
  externalCapabilities: string[];
};

export type SystemTestManifest = {
  schemaVersion: '1.0.0';
  system: {
    systemId: string;
    displayName: string;
    baseURL: string;
    markerPrefix: string;
    executionContext: SystemTestExecutionContext;
    portabilityScope?: {
      applicationId: string;
      businessDomainId: string;
      authenticationFamilyId: string;
      validationAuthority: 'target-system' | 'self-controlled-reference';
    };
  };
  sources: {
    recipeCollectionPath: string;
    recipeCollectionFingerprint: string;
    ruleLedgerPath: string;
    ruleLedgerFingerprint: string;
    adapterCatalogPath: string;
    adapterCatalogFingerprint: string;
  };
  execution: {
    playwrightConfigPath: string;
    audit?: {
      specPath: string;
      project: string;
      outputPath: string;
      trigger: 'always' | 'when-required';
      /** Adapter-owned authentication context used by audit project dependencies. */
      executionContextProfile?: string;
    };
    setupSpecPath: string;
    setupProject: string;
    recoverySpecPath?: string;
    recoveryProject?: string;
    recoveryAdapterId?: string;
    preflightSpecPath: string;
    specPath: string;
    project: string;
    workers: number;
    retries: 0;
    authAdapterId: string;
  };
  dataProfiles: Record<string, SystemTestDataProfile>;
  cases: Array<{
    caseId: string;
    ruleId: string;
    recipeId: string;
    dataProfileId: string;
    /** Optional adapter-owned context profile used to prevent mixed-tenant batches. */
    executionContextProfile?: string;
  }>;
  policies: {
    stallMs: number;
    maxRunMs: number;
    maxConsecutiveFailures: number;
    maxDuplicateFailureFingerprint: number;
    minimumCompletedForFailureRate: number;
    maximumEnvironmentFailureRate: number;
    requireExplicitClaimReceipts: true;
    requireApiZeroResidue: true;
    requireUiZeroResidue: true;
    runtimeMayPromoteRuleToFormal: false;
    humanApprovalRequiredForFormal: true;
  };
};

export type SystemTestCompiledCase = {
  caseId: string;
  ruleId: string;
  ruleStatus: SystemTestRuleLedger['rules'][number]['status'];
  recipeId: string;
  action: RecipeAction;
  dataProfileId: string;
  executionContextProfile?: string;
  mutationMode: SystemTestDataProfile['mutationMode'];
  expectationClaims: Array<{
    claimId: string;
    expected: string;
    assertionAdapterId: string;
    observationChannel: SystemTestObservationChannel;
    authority: SystemTestObservationAuthority;
    terminalCondition: string;
    fieldId: string;
    assertionSurfaceId: string;
    feedback?: {
      mode: 'exact-message' | 'disabled-control' | 'confirmation-dialog';
      trigger: 'pre-submit' | 'submitted-operation';
      exactText?: string;
      operationKey?: string;
    };
  }>;
  requiredContextGuards: Array<{
    adapterId: string;
    phase: 'before-action' | 'before-assertion';
  }>;
  requiredActionReadiness?: {
    adapterId: string;
    contractIds: string[];
    requiredIdentityKeys: string[];
    cleanupIdentityKeys: string[];
  };
  requiredOperationKeys: string[];
  probeAdapterIds: string[];
  externalCapabilities: string[];
};

export type SystemTestRunContract = {
  schemaVersion: '1.0.0';
  collectionId: 'system-test-run-contract';
  generatedAt: string;
  system: SystemTestManifest['system'];
  execution: SystemTestManifest['execution'];
  policies: SystemTestManifest['policies'];
  sourceFingerprints: {
    recipes: string;
    rules: string;
    adapters: string;
    evidenceRuntime: string;
    executionContext: string;
  };
  summary: {
    cases: number;
    readOnly: number;
    mutation: number;
    expectationClaims: number;
  };
  cases: SystemTestCompiledCase[];
  fingerprint: string;
};

export function compileSystemTestRunContract(input: {
  rootDir: string;
  manifest: SystemTestManifest;
  recipes: readonly AutomationRecipe[];
  recipeCollectionFingerprint: string;
  rules: SystemTestRuleLedger;
  adapters: SystemTestAdapterCatalog;
}): { contract: SystemTestRunContract; errors: string[] } {
  const errors: string[] = [];
  validateSystemIdentity(input.manifest, input.adapters, errors);
  validateFingerprints(input, errors);
  validateExecution(input.rootDir, input.manifest, errors);
  errors.push(...validateSystemTestUniversalInvariants(input));
  const recipes = new Map(input.recipes.map((item) => [item.id, item]));
  const rules = new Map(input.rules.rules.map((item) => [item.ruleId, item]));
  const adapters = new Map(input.adapters.adapters.map((item) => [item.id, item]));
  if (adapters.size !== input.adapters.adapters.length) errors.push('ADAPTER_ID_DUPLICATE');
  for (const adapter of input.adapters.adapters) validateAdapterImplementation(input.rootDir, adapter, errors);
  validateAdapter('__system__', input.manifest.execution.authAdapterId, 'auth', 'read', adapters, errors);
  if (input.manifest.execution.recoveryAdapterId) {
    validateAdapter('__system__', input.manifest.execution.recoveryAdapterId, 'recovery', 'read', adapters, errors);
  }
  const seenCases = new Set<string>();
  if (input.manifest.cases.length === 0) errors.push('CASE_SET_EMPTY');
  const compiledCases = input.manifest.cases.flatMap((binding): SystemTestCompiledCase[] => {
    if (seenCases.has(binding.caseId)) errors.push(`${binding.caseId}:CASE_DUPLICATE`);
    seenCases.add(binding.caseId);
    const recipe = recipes.get(binding.recipeId);
    const rule = rules.get(binding.ruleId);
    const profile = input.manifest.dataProfiles[binding.dataProfileId];
    if (!recipe || recipe.caseId !== binding.caseId) errors.push(`${binding.caseId}:RECIPE_BINDING_INVALID`);
    if (!rule || rule.caseId !== binding.caseId) errors.push(`${binding.caseId}:RULE_BINDING_INVALID`);
    if (!profile) errors.push(`${binding.caseId}:DATA_PROFILE_REQUIRED`);
    if (!recipe || !rule || !profile) return [];
    if (rule.status === 'formal' || rule.formalPromotionAllowed) errors.push(`${binding.caseId}:RULE_AUTHORITY_INVALID`);
    if (rule.outcomeClaims.length === 0 || rule.outcomeClaims.length !== rule.outcomes.length) {
      errors.push(`${binding.caseId}:RULE_OUTCOME_CLAIMS_INCOMPLETE`);
    }
    validateProfile(binding.caseId, recipe.action, profile, adapters, input.adapters, errors);
    const contextGuards = recipe.contextGuards ?? [];
    const requiredContextGuards = contextGuards.flatMap((guard) => {
      validateAdapter(binding.caseId, guard.adapterId, 'context-guard', recipe.action, adapters, errors);
      const phase = guard.input?.phase;
      if (phase !== 'before-action' && phase !== 'before-assertion') {
        errors.push(`${binding.caseId}:CONTEXT_GUARD_PHASE_INVALID:${String(phase)}`);
        return [];
      }
      return [{ adapterId: guard.adapterId, phase: phase as 'before-action' | 'before-assertion' }];
    });
    for (const phase of ['before-action', 'before-assertion'] as const) {
      if (requiredContextGuards.filter((guard) => guard.phase === phase).length !== 1) {
        errors.push(`${binding.caseId}:CONTEXT_GUARD_PHASE_REQUIRED:${phase}`);
      }
    }
    for (const capability of recipe.capabilities) {
      validateAdapter(binding.caseId, capability.id, 'capability', recipe.action, adapters, errors);
    }
    const actionReadiness = recipe.actionReadiness;
    if (profile.requireActionReadiness && !actionReadiness) {
      errors.push(`${binding.caseId}:ACTION_READINESS_REQUIRED`);
    }
    if (actionReadiness) {
      validateAdapter(binding.caseId, actionReadiness.adapterId, 'action-readiness', recipe.action, adapters, errors);
      validateActionReadiness(binding.caseId, actionReadiness, profile, input.adapters, errors);
    }
    if (profile.mutationMode !== 'none') {
      if (recipe.seed?.adapterId !== profile.seedAdapterId) errors.push(`${binding.caseId}:RECIPE_SEED_PROFILE_MISMATCH`);
      if (recipe.cleanup?.adapterId !== profile.cleanupAdapterId) errors.push(`${binding.caseId}:RECIPE_CLEANUP_PROFILE_MISMATCH`);
      if (profile.mutationMode === 'reversible' && !recipe.mutation) {
        errors.push(`${binding.caseId}:RECIPE_MUTATION_REQUIRED`);
      }
      if (profile.mutationMode === 'fixture-reversible' && recipe.mutation) {
        errors.push(`${binding.caseId}:FIXTURE_LIFECYCLE_MUTATION_FORBIDDEN`);
      }
      if (recipe.mutation && !profile.requiredOperationKeys.includes(recipe.mutation.operationKey)) {
        errors.push(`${binding.caseId}:RECIPE_OPERATION_PROFILE_MISMATCH`);
      }
    } else if (recipe.seed || recipe.cleanup || recipe.mutation) {
      errors.push(`${binding.caseId}:READ_ONLY_LIFECYCLE_FORBIDDEN`);
    }
    const claimAssignments = new Map<string, string[]>();
    for (const assertion of recipe.assertions) {
      validateAdapter(binding.caseId, assertion.adapterId, 'assertion', recipe.action, adapters, errors);
      for (const claimId of assertion.claimIds ?? []) {
        claimAssignments.set(claimId, [...(claimAssignments.get(claimId) ?? []), assertion.adapterId]);
      }
    }
    const assertionContracts = new Map((recipe.assertionContracts ?? []).map((item) => [item.claimId, item]));
    const expectationClaims = rule.outcomeClaims.map((claimId, index) => {
      const assignment = claimAssignments.get(claimId) ?? [];
      if (assignment.length === 0) errors.push(`${binding.caseId}:CLAIM_ASSERTION_MISSING:${claimId}`);
      if (assignment.length > 1) errors.push(`${binding.caseId}:CLAIM_ASSERTION_DUPLICATE:${claimId}`);
      const assertionContract = assertionContracts.get(claimId);
      if (!assertionContract) errors.push(`${binding.caseId}:ASSERTION_CONTRACT_MISSING:${claimId}`);
      if (assertionContract && assertionContract.adapterId !== assignment[0]) {
        errors.push(`${binding.caseId}:ASSERTION_CONTRACT_ADAPTER_MISMATCH:${claimId}`);
      }
      const adapter = adapters.get(assignment[0] ?? '');
      if (assertionContract && !adapter?.observationChannels?.includes(assertionContract.observationChannel)) {
        errors.push(`${binding.caseId}:ASSERTION_CHANNEL_UNSUPPORTED:${claimId}:${assertionContract.observationChannel}`);
      }
      return {
        claimId,
        expected: rule.outcomes[index],
        assertionAdapterId: assignment[0] ?? '',
        observationChannel: assertionContract?.observationChannel ?? 'ui',
        authority: assertionContract?.authority ?? 'user-visible',
        terminalCondition: assertionContract?.terminalCondition ?? '',
        fieldId: assertionContract?.fieldId ?? '',
        assertionSurfaceId: assertionContract?.assertionSurfaceId ?? '',
        feedback: assertionContract?.feedback,
      };
    });
    for (const assignedClaimId of claimAssignments.keys()) {
      if (!rule.outcomeClaims.includes(assignedClaimId)) {
        errors.push(`${binding.caseId}:UNKNOWN_ASSERTION_CLAIM:${assignedClaimId}`);
      }
    }
    return [{
      caseId: binding.caseId,
      ruleId: binding.ruleId,
      ruleStatus: rule.status,
      recipeId: recipe.id,
      action: recipe.action,
      dataProfileId: binding.dataProfileId,
      ...(binding.executionContextProfile ? { executionContextProfile: binding.executionContextProfile } : {}),
      mutationMode: profile.mutationMode,
      expectationClaims,
      requiredContextGuards,
      ...(actionReadiness ? {
        requiredActionReadiness: {
          adapterId: actionReadiness.adapterId,
          contractIds: [...actionReadiness.contractIds],
          requiredIdentityKeys: [...actionReadiness.requiredIdentityKeys],
          cleanupIdentityKeys: [...actionReadiness.cleanupIdentityKeys],
        },
      } : {}),
      requiredOperationKeys: [...profile.requiredOperationKeys],
      probeAdapterIds: [...profile.probeAdapterIds],
      externalCapabilities: [...profile.externalCapabilities],
    }];
  });
  const withoutFingerprint = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'system-test-run-contract' as const,
    generatedAt: new Date().toISOString(),
    system: structuredClone(input.manifest.system),
    execution: structuredClone(input.manifest.execution),
    policies: structuredClone(input.manifest.policies),
    sourceFingerprints: {
      recipes: input.recipeCollectionFingerprint,
      rules: input.rules.fingerprint,
      adapters: fingerprintSystemTestValue(input.adapters),
      evidenceRuntime: buildSystemTestEvidenceRuntimeFingerprint(),
      executionContext: fingerprintSystemTestExecutionContext(input.manifest.system.executionContext),
    },
    summary: {
      cases: compiledCases.length,
      readOnly: compiledCases.filter((item) => item.mutationMode === 'none').length,
      mutation: compiledCases.filter((item) => item.mutationMode !== 'none').length,
      expectationClaims: compiledCases.reduce((total, item) => total + item.expectationClaims.length, 0),
    },
    cases: compiledCases.sort((left, right) => left.caseId.localeCompare(right.caseId)),
  };
  return {
    contract: {
      ...withoutFingerprint,
      fingerprint: fingerprintSystemTestValue({ ...withoutFingerprint, generatedAt: undefined }),
    },
    errors: [...new Set(errors)].sort(),
  };
}

export function fingerprintSystemTestValue(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function buildSystemTestEvidenceRuntimeFingerprint(): string {
  const files = [
    path.resolve(__dirname, 'system-test-evidence.ts'),
    path.resolve(__dirname, 'system-test-execution-grant.ts'),
    path.resolve(__dirname, 'system-test-recipe-executor.ts'),
    path.resolve(__dirname, '../../reporters/system-test-evidence.reporter.ts'),
  ];
  const missing = files.filter((filePath) => !fs.existsSync(filePath));
  if (missing.length > 0) {
    throw new Error(`SYSTEM_TEST_EVIDENCE_RUNTIME_SOURCE_MISSING:${missing.join(',')}`);
  }
  return fingerprintSystemTestValue(files.map((filePath) => ({
    path: path.relative(path.resolve(__dirname, '../..'), filePath).replaceAll(path.sep, '/'),
    sha256: createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
  })));
}

function validateSystemIdentity(
  manifest: SystemTestManifest,
  adapters: SystemTestAdapterCatalog,
  errors: string[],
): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.system.systemId)) errors.push('SYSTEM_ID_INVALID');
  if (manifest.system.systemId !== adapters.systemId) errors.push('ADAPTER_SYSTEM_ID_MISMATCH');
  if (!manifest.system.markerPrefix || /\s/.test(manifest.system.markerPrefix)) errors.push('MARKER_PREFIX_INVALID');
  errors.push(...validateSystemTestExecutionContext(manifest.system.executionContext));
  try {
    const url = new URL(manifest.system.baseURL);
    if (!['http:', 'https:'].includes(url.protocol)) errors.push('BASE_URL_INVALID');
  } catch {
    errors.push('BASE_URL_INVALID');
  }
}

function validateFingerprints(
  input: Parameters<typeof compileSystemTestRunContract>[0],
  errors: string[],
): void {
  if (input.manifest.sources.recipeCollectionFingerprint !== input.recipeCollectionFingerprint) errors.push('RECIPE_FINGERPRINT_MISMATCH');
  if (input.manifest.sources.ruleLedgerFingerprint !== input.rules.fingerprint) errors.push('RULE_FINGERPRINT_MISMATCH');
  if (input.manifest.sources.adapterCatalogFingerprint !== fingerprintSystemTestValue(input.adapters)) errors.push('ADAPTER_FINGERPRINT_MISMATCH');
}

function validateExecution(rootDir: string, manifest: SystemTestManifest, errors: string[]): void {
  for (const [code, filePath] of [
    ['PLAYWRIGHT_CONFIG_MISSING', manifest.execution.playwrightConfigPath],
    ['SETUP_SPEC_MISSING', manifest.execution.setupSpecPath],
    ['PREFLIGHT_SPEC_MISSING', manifest.execution.preflightSpecPath],
    ['EXECUTION_SPEC_MISSING', manifest.execution.specPath],
  ] as const) {
    if (!fs.existsSync(path.resolve(rootDir, filePath))) errors.push(code);
  }
  const executionSpecPath = path.resolve(rootDir, manifest.execution.specPath);
  if (fs.existsSync(executionSpecPath)) {
    const source = fs.readFileSync(executionSpecPath, 'utf8');
    const importsGovernedExecutor = /import\s*\{[^}]*\bexecuteSystemTestRecipe\b[^}]*\}\s*from\s*['"][^'"]*system-test-recipe-executor['"]/.test(source);
    const callsGovernedExecutor = /\bexecuteSystemTestRecipe(?:<[^;]+?>)?\s*\(/.test(source);
    if (!importsGovernedExecutor || !callsGovernedExecutor) errors.push('GOVERNED_EXECUTION_GUARD_MISSING');
  }
  const recoveryValues = [
    manifest.execution.recoverySpecPath,
    manifest.execution.recoveryProject,
    manifest.execution.recoveryAdapterId,
  ];
  const configuredRecoveryValues = recoveryValues.filter(Boolean).length;
  if (configuredRecoveryValues > 0 && configuredRecoveryValues < recoveryValues.length) {
    errors.push('RECOVERY_CONFIGURATION_INCOMPLETE');
  }
  if (manifest.execution.recoverySpecPath) {
    if (!fs.existsSync(path.resolve(rootDir, manifest.execution.recoverySpecPath))) errors.push('RECOVERY_SPEC_MISSING');
  }
  const audit = manifest.execution.audit;
  if (audit) {
    if (!audit.specPath || !audit.project || !audit.outputPath || !['always', 'when-required'].includes(audit.trigger)) {
      errors.push('AUDIT_CONFIGURATION_INCOMPLETE');
    } else if (!fs.existsSync(path.resolve(rootDir, audit.specPath))) {
      errors.push('AUDIT_SPEC_MISSING');
    }
  }
  if (!Number.isInteger(manifest.execution.workers) || manifest.execution.workers < 1) errors.push('WORKERS_INVALID');
  if (manifest.execution.retries !== 0) errors.push('NON_IDEMPOTENT_RETRY_FORBIDDEN');
  if (!manifest.policies.requireExplicitClaimReceipts
    || !manifest.policies.requireApiZeroResidue
    || !manifest.policies.requireUiZeroResidue
    || manifest.policies.runtimeMayPromoteRuleToFormal
    || !manifest.policies.humanApprovalRequiredForFormal) {
    errors.push('MANDATORY_POLICY_INVALID');
  }
}

function validateProfile(
  caseId: string,
  action: RecipeAction,
  profile: SystemTestDataProfile,
  adapters: ReadonlyMap<string, SystemTestAdapterDefinition>,
  catalog: SystemTestAdapterCatalog,
  errors: string[],
): void {
  for (const probeId of profile.probeAdapterIds) validateAdapter(caseId, probeId, 'probe', action, adapters, errors);
  for (const operationKey of profile.requiredOperationKeys) {
    if (!catalog.operationKeys.includes(operationKey)) errors.push(`${caseId}:OPERATION_MISSING:${operationKey}`);
  }
  for (const capability of profile.externalCapabilities) {
    if (!catalog.externalCapabilities.includes(capability)) errors.push(`${caseId}:EXTERNAL_CAPABILITY_UNDECLARED:${capability}`);
  }
  if (profile.mutationMode === 'none') return;
  validateAdapter(caseId, profile.seedAdapterId, 'seed', action, adapters, errors);
  validateAdapter(caseId, profile.cleanupAdapterId, 'cleanup', action, adapters, errors);
  validateAdapter(caseId, profile.apiResidueAdapterId, 'api-residue', action, adapters, errors);
  validateAdapter(caseId, profile.uiResidueAdapterId, 'ui-residue', action, adapters, errors);
}

function validateActionReadiness(
  caseId: string,
  contract: NonNullable<AutomationRecipe['actionReadiness']>,
  profile: SystemTestDataProfile,
  catalog: SystemTestAdapterCatalog,
  errors: string[],
): void {
  if (!['observed', 'confirmed'].includes(contract.status) || contract.generationAllowed !== true) {
    errors.push(`${caseId}:ACTION_READINESS_AUTHORITY_INVALID`);
  }
  for (const [field, values] of Object.entries({
    sourceIds: contract.sourceIds,
    contractIds: contract.contractIds,
    controlIds: contract.controlIds,
    sequence: contract.sequence,
    terminalConditionIds: contract.terminalConditionIds,
    operationKeys: contract.operationKeys,
    requiredIdentityKeys: contract.requiredIdentityKeys,
    cleanupIdentityKeys: contract.cleanupIdentityKeys,
  })) {
    if (!Array.isArray(values) || values.length === 0 || values.some((value) => !value.trim())) {
      errors.push(`${caseId}:ACTION_READINESS_FIELD_INCOMPLETE:${field}`);
    }
    if (new Set(values).size !== values.length) errors.push(`${caseId}:ACTION_READINESS_FIELD_DUPLICATE:${field}`);
  }
  for (const operationKey of contract.operationKeys) {
    if (!catalog.operationKeys.includes(operationKey) || !profile.requiredOperationKeys.includes(operationKey)) {
      errors.push(`${caseId}:ACTION_READINESS_OPERATION_UNMAPPED:${operationKey}`);
    }
  }
  const input = contract.input ?? {};
  for (const identityKey of contract.requiredIdentityKeys) {
    const value = input[identityKey];
    if (!value || typeof value !== 'object' || !('$ref' in value)) {
      errors.push(`${caseId}:ACTION_READINESS_IDENTITY_BINDING_REQUIRED:${identityKey}`);
    }
  }
  for (const cleanupKey of contract.cleanupIdentityKeys) {
    if (!contract.requiredIdentityKeys.includes(cleanupKey)) {
      errors.push(`${caseId}:ACTION_READINESS_CLEANUP_IDENTITY_UNBOUND:${cleanupKey}`);
    }
  }
}

function validateAdapter(
  caseId: string,
  adapterId: string | undefined,
  kind: SystemTestAdapterKind,
  action: RecipeAction,
  adapters: ReadonlyMap<string, SystemTestAdapterDefinition>,
  errors: string[],
): void {
  if (!adapterId) {
    errors.push(`${caseId}:${kind.toUpperCase()}_ADAPTER_REQUIRED`);
    return;
  }
  const adapter = adapters.get(adapterId);
  if (!adapter || adapter.kind !== kind) errors.push(`${caseId}:ADAPTER_INVALID:${adapterId}:${kind}`);
  else if (!adapter.actions.includes(action)) errors.push(`${caseId}:ADAPTER_ACTION_INVALID:${adapterId}:${action}`);
}

function validateAdapterImplementation(
  rootDir: string,
  adapter: SystemTestAdapterDefinition,
  errors: string[],
): void {
  try {
    const actual = fingerprintSystemTestImplementationSource(rootDir, adapter.implementation);
    if (actual !== adapter.implementation.sha256) errors.push(`ADAPTER_IMPLEMENTATION_DRIFT:${adapter.id}`);
  } catch (error) {
    errors.push(`ADAPTER_IMPLEMENTATION_INVALID:${adapter.id}:${error instanceof Error ? error.message : String(error)}`);
  }
  for (const dependency of adapter.implementation.dependencies ?? []) {
    try {
      const actual = fingerprintSystemTestImplementationSource(rootDir, dependency);
      if (actual !== dependency.sha256) errors.push(`ADAPTER_DEPENDENCY_DRIFT:${adapter.id}:${dependency.path}`);
    } catch (error) {
      errors.push(`ADAPTER_DEPENDENCY_INVALID:${adapter.id}:${dependency.path}:${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export function fingerprintSystemTestImplementationSource(
  rootDir: string,
  source: Pick<SystemTestImplementationSource, 'path' | 'sourceSection'>,
): string {
  const absoluteRoot = path.resolve(rootDir);
  const absolutePath = path.resolve(absoluteRoot, source.path);
  if (path.relative(absoluteRoot, absolutePath).startsWith('..')
    || !fs.existsSync(absolutePath)
    || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`SOURCE_INVALID:${source.path}`);
  }
  const content = fs.readFileSync(absolutePath, 'utf8');
  if (!source.sourceSection) return createHash('sha256').update(content).digest('hex');
  const startMarker = `// system-test-fingerprint:start ${source.sourceSection}`;
  const endMarker = `// system-test-fingerprint:end ${source.sourceSection}`;
  const lines = content.split(/\r?\n/);
  const starts = lines.flatMap((line, index) => line.trim() === startMarker ? [index] : []);
  const ends = lines.flatMap((line, index) => line.trim() === endMarker ? [index] : []);
  if (starts.length !== 1 || ends.length !== 1 || starts[0] >= ends[0]) {
    throw new Error(`SOURCE_SECTION_INVALID:${source.path}:${source.sourceSection}`);
  }
  return createHash('sha256').update(lines.slice(starts[0], ends[0] + 1).join('\n')).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
