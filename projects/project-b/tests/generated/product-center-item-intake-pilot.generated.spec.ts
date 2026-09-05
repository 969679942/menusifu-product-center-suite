import type { AutomationRecipe } from '../../automation/recipe/automation-recipe';
import recipesDocument from '../../contracts/product-center/recipes/product-center-item-intake-pilot-recipes.json';
import { test } from '../../fixtures/product-center.fixture';
import {
  createProductCenterRecipeFlowPort,
  ProductCenterRecipeFlow,
} from '../../flows/product-center/product-center-recipe.flow';
import { buildProductCenterRuntimeEvidenceBundle } from '../../automation/recipe/product-center-runtime-evidence';
import { appConfig } from '../../test-data/env';

const recipes = (recipesDocument as unknown as { recipes: AutomationRecipe[] }).recipes;

test.describe('商品管理正式用例接入试点', () => {
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
      async ({ page, productCenterApi, cleanupRegistry, executionLedger }, testInfo) => {
        const flow = new ProductCenterRecipeFlow(createProductCenterRecipeFlowPort({
          page,
          api: productCenterApi,
          cleanupRegistry,
          executionLedger,
        }));

        await test.step('按编译后的 Recipe 执行商品名称必填负向 SOP', async () => {
          const context = await flow.execute(recipe);
          await testInfo.attach('product-center-runtime-evidence', {
            body: Buffer.from(JSON.stringify(buildProductCenterRuntimeEvidenceBundle({
              recipeId: recipe.id,
              caseId: recipe.caseId,
              results: context.results,
              environmentId: 'balamxqa',
              brandId: appConfig.brandId,
              screenshotAttachmentName: recipe.id + '-runtime-evidence',
              expectedClaimIds: recipe.claimIds,
              verifiedClaimIds: context.verifiedClaimIds,
              claimVerification: context.claimVerification,
              action: recipe.action,
              capabilityIds: recipe.capabilities.map((capability) => capability.id),
              assertionAdapterIds: recipe.assertions.map((assertion) => assertion.adapterId),
            })), 'utf8'),
            contentType: 'application/json',
          });
        });
      },
    );
  }
});
