export type ProductCenterEnvironmentInput = {
  environment: string;
  brandId: string;
  expectedBrandId: string;
  contractErrors: unknown[];
  incompleteCheckpoints: string[];
  residueIdentities: string[];
  sensitiveFindings: unknown[];
  secretMetadata?: { source: string; tokenLength?: number; fingerprint?: string };
};

export type ProductCenterEnvironmentReport = {
  pass: boolean;
  environment: string;
  gates: Array<{ id: string; pass: boolean; detail: string }>;
  secretMetadata?: { source: string; tokenLength?: number; fingerprint?: string };
};

export function evaluateProductCenterEnvironment(input: ProductCenterEnvironmentInput): ProductCenterEnvironmentReport {
  const gates = [
    gate('environment', Boolean(input.environment), input.environment || 'missing'),
    gate('brand-context', input.brandId === input.expectedBrandId, input.brandId === input.expectedBrandId ? 'matched' : 'mismatch'),
    gate('contract-valid', input.contractErrors.length === 0, `errors=${input.contractErrors.length}`),
    gate('checkpoint-clean', input.incompleteCheckpoints.length === 0, `incomplete=${input.incompleteCheckpoints.length}`),
    gate('residue-zero', input.residueIdentities.length === 0, `residue=${input.residueIdentities.length}`),
    gate('secret-safe', input.sensitiveFindings.length === 0, `findings=${input.sensitiveFindings.length}`),
  ];
  return {
    pass: gates.every((item) => item.pass),
    environment: input.environment,
    gates,
    ...(input.secretMetadata ? { secretMetadata: { ...input.secretMetadata } } : {}),
  };
}

function gate(id: string, pass: boolean, detail: string) {
  return { id, pass, detail };
}
