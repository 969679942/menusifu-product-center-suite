import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import recipesDocument from '../../contracts/product-center/recipes/product-center-pilot-recipes.json';
import {
  evaluateProductCenterRecipePromotion,
  type ProductCenterRecipePromotionInput,
} from '../../automation/recipe/product-center-recipe-promotion';
import type { AutomationRecipe } from '../../automation/recipe/automation-recipe';

const recipesArtifact = recipesDocument as unknown as {
  fingerprint: string;
  recipes: AutomationRecipe[];
};

function validInput(): ProductCenterRecipePromotionInput {
  return {
    recipeFingerprint: recipesArtifact.fingerprint,
    recipes: recipesArtifact.recipes,
    unresolvedCount: 0,
    recipeContractsPassed: true,
    feedback: {
      fingerprint: recipesArtifact.fingerprint,
      entries: recipesArtifact.recipes.map((recipe) => ({
        recipeId: recipe.id,
        caseId: recipe.caseId,
        status: 'passed',
      })),
    },
    safety: { incompleteCheckpoints: 0, sensitiveArtifacts: 0, savedAuthStates: 0 },
    generatedSpecSource: 'await flow.execute(recipe);',
  };
}

test.describe('商品中心 Recipe 晋级门禁', () => {
  test('全部门槛满足时四十六条 Recipe 应允许晋级', async () => {
    const result = evaluateProductCenterRecipePromotion(validInput());

    expect(result.status).toBe('eligible');
    expect(result.reasons).toEqual([]);
    expect(result.promotedCaseIds).toHaveLength(46);
  });

  test('过期反馈失败用例和未决项必须阻断', async () => {
    const input = validInput();
    input.feedback.fingerprint = 'stale';
    input.feedback.entries[0].status = 'failed';
    input.unresolvedCount = 1;

    const result = evaluateProductCenterRecipePromotion(input);

    expect(result.status).toBe('blocked');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'FEEDBACK_FINGERPRINT_MISMATCH',
      'RECIPE_EXECUTION_INCOMPLETE',
      'UNRESOLVED_RECIPES',
    ]));
  });

  test('合同失败或安全残留必须阻断', async () => {
    const input = validInput();
    input.recipeContractsPassed = false;
    input.safety = { incompleteCheckpoints: 1, sensitiveArtifacts: 2, savedAuthStates: 1 };

    const result = evaluateProductCenterRecipePromotion(input);

    expect(result.reasons).toEqual(expect.arrayContaining([
      'RECIPE_CONTRACTS_FAILED',
      'INCOMPLETE_CHECKPOINTS',
      'SENSITIVE_ARTIFACTS',
      'SAVED_AUTH_STATE',
    ]));
  });

  test('生成 Spec 包含定位器或固定等待时必须阻断', async () => {
    const input = validInput();
    input.generatedSpecSource = "page.locator('button'); await page.waitForTimeout(1000);";

    expect(evaluateProductCenterRecipePromotion(input).reasons).toContain('GENERATED_SPEC_FORBIDDEN_PATTERN');
  });

  test('正式聚合套件应只使用晋级后的全量 Recipe Spec', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve('package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const scriptName of [
      'test:product-center:sop:all',
      'test:product-center:sop:full',
      'test:product-center:sop:stability',
      'test:product-center:sop:stability:soak',
      'test:product-center:sop:stability:serial',
    ]) {
      expect(packageJson.scripts[scriptName]).toContain('product-center-recipe-core.generated.spec.ts');
      expect(packageJson.scripts[scriptName]).not.toMatch(/five-create|low-dependency|high-dependency|negative-sop|five-hybrid/);
    }
  });
});
