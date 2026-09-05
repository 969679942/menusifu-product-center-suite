import type { AutomationRecipe } from './automation-recipe';

export type ProductCenterRecipePromotionReason =
  | 'RECIPE_CONTRACTS_FAILED'
  | 'UNRESOLVED_RECIPES'
  | 'FEEDBACK_FINGERPRINT_MISMATCH'
  | 'RECIPE_EXECUTION_INCOMPLETE'
  | 'INCOMPLETE_CHECKPOINTS'
  | 'SENSITIVE_ARTIFACTS'
  | 'SAVED_AUTH_STATE'
  | 'GENERATED_SPEC_FORBIDDEN_PATTERN';

export type ProductCenterRecipePromotionInput = {
  recipeFingerprint: string;
  recipes: readonly AutomationRecipe[];
  unresolvedCount: number;
  recipeContractsPassed: boolean;
  feedback: {
    fingerprint: string;
    entries: Array<{ recipeId: string; caseId: string; status: string }>;
  };
  safety: {
    incompleteCheckpoints: number;
    sensitiveArtifacts: number;
    savedAuthStates: number;
  };
  generatedSpecSource: string;
};

export type ProductCenterRecipePromotionResult = {
  schemaVersion: '1.0.0';
  recipeFingerprint: string;
  status: 'eligible' | 'blocked';
  reasons: ProductCenterRecipePromotionReason[];
  promotedCaseIds: string[];
};

const forbiddenGeneratedSpecPattern = /\.locator\(|getByRole\(|getByText\(|getByLabel\(|waitForTimeout|\.click\(|\.fill\(|switch\s*\(|if\s*\(/;

export function evaluateProductCenterRecipePromotion(
  input: ProductCenterRecipePromotionInput,
): ProductCenterRecipePromotionResult {
  const reasons: ProductCenterRecipePromotionReason[] = [];
  if (!input.recipeContractsPassed) reasons.push('RECIPE_CONTRACTS_FAILED');
  if (input.unresolvedCount > 0) reasons.push('UNRESOLVED_RECIPES');
  if (input.feedback.fingerprint !== input.recipeFingerprint) reasons.push('FEEDBACK_FINGERPRINT_MISMATCH');

  const finalFeedback = new Map(input.feedback.entries.map((entry) => [entry.recipeId, entry]));
  if (
    finalFeedback.size !== input.recipes.length
    || input.recipes.some((recipe) => {
      const feedback = finalFeedback.get(recipe.id);
      return feedback?.caseId !== recipe.caseId || feedback.status !== 'passed';
    })
  ) {
    reasons.push('RECIPE_EXECUTION_INCOMPLETE');
  }
  if (input.safety.incompleteCheckpoints > 0) reasons.push('INCOMPLETE_CHECKPOINTS');
  if (input.safety.sensitiveArtifacts > 0) reasons.push('SENSITIVE_ARTIFACTS');
  if (input.safety.savedAuthStates > 0) reasons.push('SAVED_AUTH_STATE');
  if (forbiddenGeneratedSpecPattern.test(input.generatedSpecSource)) reasons.push('GENERATED_SPEC_FORBIDDEN_PATTERN');

  const status = reasons.length === 0 ? 'eligible' : 'blocked';
  return {
    schemaVersion: '1.0.0',
    recipeFingerprint: input.recipeFingerprint,
    status,
    reasons,
    promotedCaseIds: status === 'eligible'
      ? input.recipes.map((recipe) => recipe.caseId).sort()
      : [],
  };
}

