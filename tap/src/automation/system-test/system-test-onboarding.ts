import type {
  SystemTestAdapterCatalog,
  SystemTestManifest,
  SystemTestRunContract,
} from './system-test-contract';

export type SystemTestOnboardingReport = {
  systemId: string;
  status: 'blocked' | 'contract-ready' | 'read-only-ready' | 'mutation-ready';
  contractReady: boolean;
  readOnlyReady: boolean;
  mutationReady: boolean;
  blockers: string[];
  requiredEngineeringAdapters: string[];
  requiredExternalCapabilities: string[];
};

export function evaluateSystemTestOnboarding(input: {
  manifest: SystemTestManifest;
  contract: SystemTestRunContract;
  adapters: SystemTestAdapterCatalog;
  compileErrors: readonly string[];
  availableExternalCapabilities?: readonly string[];
}): SystemTestOnboardingReport {
  const blockers = [...input.compileErrors];
  const adapterIds = new Set(input.adapters.adapters.map((adapter) => adapter.id));
  if (!adapterIds.has(input.manifest.execution.authAdapterId)) blockers.push('AUTH_ADAPTER_MISSING');
  const requiredEngineeringAdapters = unique([
    input.manifest.execution.authAdapterId,
    ...input.contract.cases.flatMap((item) => item.probeAdapterIds),
    ...input.contract.cases.flatMap((item) => item.expectationClaims.map((claim) => claim.assertionAdapterId)),
  ].filter((adapterId) => adapterId && !adapterIds.has(adapterId)));
  const availableExternalCapabilities = new Set(input.availableExternalCapabilities ?? []);
  const requiredExternalCapabilities = unique(input.contract.cases
    .flatMap((item) => item.externalCapabilities)
    .filter((capability) => !availableExternalCapabilities.has(capability)));
  blockers.push(...requiredEngineeringAdapters.map((adapterId) => `ADAPTER_MISSING:${adapterId}`));
  blockers.push(...requiredExternalCapabilities.map((capability) => `EXTERNAL_CAPABILITY_MISSING:${capability}`));
  const contractReady = input.compileErrors.length === 0;
  const readOnlyCases = input.contract.cases.filter((item) => item.mutationMode === 'none');
  const readOnlyReady = contractReady
    && adapterIds.has(input.manifest.execution.authAdapterId)
    && readOnlyCases.every((item) => item.probeAdapterIds.every((adapterId) => adapterIds.has(adapterId)))
    && requiredExternalCapabilities.length === 0;
  const hasMutationCases = input.contract.cases.some((item) => item.mutationMode !== 'none');
  const mutationReady = hasMutationCases && readOnlyReady
    && input.contract.cases.every((item) => item.mutationMode === 'none' || item.expectationClaims.every((claim) => adapterIds.has(claim.assertionAdapterId)))
    && blockers.length === 0;
  return {
    systemId: input.manifest.system.systemId,
    status: mutationReady
      ? 'mutation-ready'
      : readOnlyReady ? 'read-only-ready' : contractReady ? 'contract-ready' : 'blocked',
    contractReady,
    readOnlyReady,
    mutationReady,
    blockers: unique(blockers),
    requiredEngineeringAdapters,
    requiredExternalCapabilities,
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
