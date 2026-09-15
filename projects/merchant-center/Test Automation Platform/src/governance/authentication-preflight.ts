export type AuthenticationCapability = { id: string; configured: boolean };
export type AuthenticationPreflightPolicy = {
  mode: string;
  credentialAlternatives: string[][];
  requiredContext: string[];
};

/** Consumes only sanitized capability booleans. Configuration is not authentication evidence or an execution grant. */
export function evaluateAuthenticationPreflight(policy: AuthenticationPreflightPolicy, capabilities: AuthenticationCapability[]) {
  const ids = capabilities.map((item) => item.id);
  const references = [...policy.credentialAlternatives.flat(), ...policy.requiredContext];
  if (!policy.mode?.trim() || !policy.credentialAlternatives.length
    || policy.credentialAlternatives.some((group) => !group.length || new Set(group).size !== group.length)
    || ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length
    || capabilities.some((item) => typeof item.configured !== 'boolean')
    || references.some((id) => !ids.includes(id))) throw new Error('AUTHENTICATION_PREFLIGHT_CONTRACT_INVALID');
  const configured = new Map(capabilities.map((item) => [item.id, item.configured]));
  const credentialsConfigured = policy.credentialAlternatives.some((group) => group.every((id) => configured.get(id)));
  const missingContext = policy.requiredContext.filter((id) => !configured.get(id));
  return { mode: policy.mode, credentialsConfigured, missingContext,
    status: credentialsConfigured && !missingContext.length ? 'ready-for-readonly-probe' as const : 'external-authorization-blocked' as const,
    authenticationVerified: false, executionAuthorized: false };
}
