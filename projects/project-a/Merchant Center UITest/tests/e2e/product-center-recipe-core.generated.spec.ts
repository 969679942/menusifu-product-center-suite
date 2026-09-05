import type { AutomationRecipe } from '../../automation/recipe/automation-recipe';
import recipesDocument from '../../contracts/product-center/recipes/product-center-pilot-recipes.json';
import { test } from '../../fixtures/product-center.fixture';
import {
  createProductCenterRecipeFlowPort,
  ProductCenterRecipeFlow,
} from '../../flows/product-center/product-center-recipe.flow';

const recipes = (recipesDocument as unknown as { recipes: AutomationRecipe[] }).recipes;

test.describe('商品中心 Recipe 正式核心套件', () => {
  test.describe.configure({ mode: 'parallel', timeout: 240_000 });

  for (const recipe of recipes) {
    test(
      recipe.title,
      {
        tag: recipe.tags,
        annotation: [
          { type: 'recipe-id', description: recipe.id },
          { type: 'recipe-case-id', description: recipe.caseId },
        ],
      },
      async ({ page, productCenterApi, cleanupRegistry, executionLedger }) => {
        const flow = new ProductCenterRecipeFlow(createProductCenterRecipeFlowPort({
          page,
          api: productCenterApi,
          cleanupRegistry,
          executionLedger,
        }));

        await test.step('按编译后的 Recipe 执行正向与反向 SOP', async () => {
          await flow.execute(recipe);
        });
      },
    );
  }
});
