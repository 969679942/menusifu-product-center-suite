export type ProductCenterRecipeMetricsInput = {
  totalSopCases: number;
  recipes: ReadonlyArray<{ id: string; caseId: string; sourceIds: readonly string[] }>;
  unresolvedCount: number;
  manualCorrectionCaseIds: readonly string[];
  feedback: ReadonlyArray<{
    recipeId: string;
    status: string;
    durationMs: number;
    classification?: string;
    diagnostic?: string;
  }>;
  promotedCaseIds: readonly string[];
  incrementalSelectedCount: number;
  incrementalUnsupportedCount: number;
  legacySourceAliasCount: number;
};

export function buildProductCenterRecipeMetrics(input: ProductCenterRecipeMetricsInput) {
  const compiled = input.recipes.length;
  const bound = input.recipes.filter((recipe) => recipe.sourceIds.length > 0).length;
  const manualCorrections = new Set(input.manualCorrectionCaseIds).size;
  const passed = input.feedback.filter((entry) => entry.status === 'passed').length;
  const failed = input.feedback.length - passed;
  const durationMs = input.feedback.reduce((total, entry) => total + entry.durationMs, 0);
  const failureClassifications = Object.fromEntries(
    [...new Set(input.feedback.map((entry) => entry.classification).filter((value): value is string => Boolean(value)))]
      .sort()
      .map((classification) => [
        classification,
        input.feedback.filter((entry) => entry.classification === classification).length,
      ]),
  );

  return {
    schemaVersion: '1.0.0' as const,
    generation: {
      totalSopCases: input.totalSopCases,
      compiled,
      unresolved: input.unresolvedCount,
      coverageRate: rate(compiled, input.totalSopCases),
    },
    sources: {
      bound,
      bindingRate: rate(bound, compiled),
      legacyAliases: input.legacySourceAliasCount,
    },
    review: {
      manualCorrections,
      manualCorrectionRate: rate(manualCorrections, compiled),
    },
    execution: {
      total: input.feedback.length,
      passed,
      failed,
      passRate: rate(passed, input.feedback.length),
      locatorDrift: input.feedback.filter((entry) => /locator drift/i.test(entry.diagnostic ?? '')).length,
      durationMs,
      maxDurationMs: input.feedback.reduce((maximum, entry) => Math.max(maximum, entry.durationMs), 0),
      failureClassifications,
    },
    incremental: {
      selected: input.incrementalSelectedCount,
      unsupported: input.incrementalUnsupportedCount,
    },
    promotion: {
      promoted: new Set(input.promotedCaseIds).size,
    },
  };
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}
