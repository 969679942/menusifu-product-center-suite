export type ProductCenterPerformancePhase =
  | 'auth'
  | 'sidebar'
  | 'seed'
  | 'uiAction'
  | 'network'
  | 'apiAssertion'
  | 'uiAssertion'
  | 'cleanup'
  | 'artifact';

export type ProductCenterPerformanceBudgetInput = {
  scope: 'single' | 'impacted' | 'full' | string;
  totalDurationMs: number;
  phases: Record<ProductCenterPerformancePhase, number>;
};

export type ProductCenterPerformancePhases = ProductCenterPerformanceBudgetInput['phases'];

export function createEmptyProductCenterPerformancePhases(): ProductCenterPerformancePhases {
  return {
    auth: 0,
    sidebar: 0,
    seed: 0,
    uiAction: 0,
    network: 0,
    apiAssertion: 0,
    uiAssertion: 0,
    cleanup: 0,
    artifact: 0,
  };
}

export function normalizeProductCenterPerformancePhases(
  input: Partial<Record<ProductCenterPerformancePhase, number>> | undefined,
): ProductCenterPerformancePhases {
  const phases = createEmptyProductCenterPerformancePhases();
  for (const phase of Object.keys(phases) as ProductCenterPerformancePhase[]) {
    const value = input?.[phase];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) phases[phase] = value;
  }
  return phases;
}

export function summarizeProductCenterPerformancePhases(
  inputs: readonly ProductCenterPerformancePhases[],
): ProductCenterPerformancePhases {
  const summary = createEmptyProductCenterPerformancePhases();
  for (const input of inputs) {
    for (const phase of Object.keys(summary) as ProductCenterPerformancePhase[]) {
      summary[phase] = Math.max(summary[phase], input[phase]);
    }
  }
  return summary;
}

const scopeBudgets: Record<string, number> = {
  single: 60_000,
  impacted: 180_000,
  full: 180_000,
};

const phaseBudgets: Record<ProductCenterPerformancePhase, number> = {
  auth: 30_000,
  sidebar: 15_000,
  seed: 15_000,
  uiAction: 30_000,
  network: 10_000,
  apiAssertion: 10_000,
  uiAssertion: 15_000,
  cleanup: 30_000,
  artifact: 5_000,
};

export function evaluateProductCenterPerformanceBudget(input: ProductCenterPerformanceBudgetInput) {
  const findings: Array<{ id: string; actualMs: number; budgetMs: number }> = [];
  for (const phase of Object.keys(phaseBudgets) as ProductCenterPerformancePhase[]) {
    if (input.phases[phase] > phaseBudgets[phase]) {
      findings.push({
        id: `phase:${phase}`,
        actualMs: input.phases[phase],
        budgetMs: phaseBudgets[phase],
      });
    }
  }
  const scopeBudget = scopeBudgets[input.scope];
  if (scopeBudget !== undefined && input.totalDurationMs > scopeBudget) {
    findings.push({ id: `scope:${input.scope}`, actualMs: input.totalDurationMs, budgetMs: scopeBudget });
  }
  return {
    schemaVersion: '1.0.0' as const,
    classification: 'performance-budget' as const,
    affectsProductStatus: false as const,
    scope: input.scope,
    status: findings.length === 0 ? 'within-budget' as const : 'budget-exceeded' as const,
    totalDurationMs: input.totalDurationMs,
    phases: { ...input.phases },
    findings,
  };
}
