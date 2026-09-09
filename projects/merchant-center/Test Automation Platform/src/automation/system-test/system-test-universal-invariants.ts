import type { AutomationRecipe } from '../recipe/automation-recipe';
import type {
  SystemTestAdapterCatalog,
  SystemTestDataProfile,
  SystemTestManifest,
  SystemTestRuleLedger,
} from './system-test-contract';

/**
 * Cross-plan safety invariants. Domain adapters provide the behavior; this
 * module only rejects unsafe contracts before a system-test run can start.
 */
export function validateSystemTestUniversalInvariants(input: {
  manifest: SystemTestManifest;
  recipes: readonly AutomationRecipe[];
  rules: SystemTestRuleLedger;
  adapters: SystemTestAdapterCatalog;
}): string[] {
  const errors: string[] = [];
  const recipes = new Map(input.recipes.map((recipe) => [recipe.id, recipe]));
  const rules = new Map(input.rules.rules.map((rule) => [rule.ruleId, rule]));
  const adapters = new Map(input.adapters.adapters.map((adapter) => [adapter.id, adapter]));

  // Authentication and context must be represented by the governed entrypoint
  // and by both context-guard phases on every executable recipe.
  if (!input.manifest.execution.authAdapterId) errors.push('UNIVERSAL_AUTH_ENTRYPOINT_REQUIRED');
  for (const binding of input.manifest.cases) {
    const recipe = recipes.get(binding.recipeId);
    const rule = rules.get(binding.ruleId);
    const profile = input.manifest.dataProfiles[binding.dataProfileId];
    if (!recipe || !rule || !profile) continue;
    const guards = recipe.contextGuards ?? [];
    for (const phase of ['before-action', 'before-assertion'] as const) {
      const phaseGuards = guards.filter((guard) => guard.input?.phase === phase);
      if (phaseGuards.length !== 1) errors.push(`${binding.caseId}:UNIVERSAL_CONTEXT_GUARD_REQUIRED:${phase}`);
      for (const guard of phaseGuards) {
        if (adapters.get(guard.adapterId)?.kind !== 'context-guard') {
          errors.push(`${binding.caseId}:UNIVERSAL_CONTEXT_GUARD_ADAPTER_INVALID:${guard.adapterId}`);
        }
        const expectedContext = guard.input ?? {};
        const requiredContextValues: Record<string, string> = {
          expectedRoute: recipe.route,
          expectedLocale: input.manifest.system.executionContext.locale,
          expectedRoleId: input.manifest.system.executionContext.roleId,
          expectedTenantScope: input.manifest.system.executionContext.tenantScope,
        };
        for (const [key, expected] of Object.entries(requiredContextValues)) {
          if (typeof expectedContext[key] !== 'string' || expectedContext[key] !== expected) {
            errors.push(`${binding.caseId}:UNIVERSAL_CONTEXT_GUARD_INPUT_INVALID:${phase}:${key}`);
          }
        }
        if (typeof expectedContext.businessIdentityStrategy !== 'string'
          || !expectedContext.businessIdentityStrategy.trim()) {
          errors.push(`${binding.caseId}:UNIVERSAL_CONTEXT_GUARD_INPUT_INVALID:${phase}:businessIdentityStrategy`);
        }
      }
    }

    // UI claims must be proven by user-visible evidence; API persistence is
    // complementary and cannot replace the UI assertion surface.
    for (const contract of recipe.assertionContracts ?? []) {
      if (contract.observationChannel === 'ui' && contract.authority !== 'user-visible') {
        errors.push(`${binding.caseId}:UNIVERSAL_UI_AUTHORITY_INVALID:${contract.claimId}`);
      }
      if (contract.observationChannel === 'api' && contract.authority !== 'persistence') {
        errors.push(`${binding.caseId}:UNIVERSAL_API_AUTHORITY_INVALID:${contract.claimId}`);
      }
      if (!contract.terminalCondition.trim()) {
        errors.push(`${binding.caseId}:UNIVERSAL_TERMINAL_CONDITION_REQUIRED:${contract.claimId}`);
      }
    }

    // Every mutation is reversible and must declare both residue channels.
    if (profile.mutationMode !== 'none') {
      if (!profile.cleanupAdapterId) errors.push(`${binding.caseId}:UNIVERSAL_CLEANUP_ADAPTER_REQUIRED`);
      if (!profile.apiResidueAdapterId) errors.push(`${binding.caseId}:UNIVERSAL_API_RESIDUE_ADAPTER_REQUIRED`);
      if (!profile.uiResidueAdapterId) errors.push(`${binding.caseId}:UNIVERSAL_UI_RESIDUE_ADAPTER_REQUIRED`);
      if (profile.mutationMode === 'reversible' && !recipe.mutation) errors.push(`${binding.caseId}:UNIVERSAL_MUTATION_CONTRACT_REQUIRED`);
      if (profile.mutationMode === 'fixture-reversible' && recipe.mutation) errors.push(`${binding.caseId}:UNIVERSAL_FIXTURE_MUTATION_FORBIDDEN`);
      if (!profile.requiredOperationKeys.length) errors.push(`${binding.caseId}:UNIVERSAL_OPERATION_RECEIPT_REQUIRED`);
    }
  }

  // A retry policy that can replay a non-idempotent action is never accepted.
  if (input.manifest.execution.retries !== 0) errors.push('UNIVERSAL_NON_IDEMPOTENT_RETRY_FORBIDDEN');
  return [...new Set(errors)].sort();
}

export function universalInvariantNames(): readonly string[] {
  return ['execution-selection', 'auth-context', 'evidence-authority', 'cleanup-ledger'];
}
