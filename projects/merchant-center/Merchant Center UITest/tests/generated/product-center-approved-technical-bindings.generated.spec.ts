import type { AutomationRecipe } from '../../automation/recipe/automation-recipe';
import recipesDocument from '../../contracts/product-center/recipes/product-center-approved-technical-bindings-recipes.json';
import { selectProductCenterRecipesForRuntime } from '../../automation/recipe/product-center-gold-run-optimization';
import { test } from '../../fixtures/product-center.fixture';
import {
  createProductCenterRecipeFlowPort,
  ProductCenterRecipeFlow,
} from '../../flows/product-center/product-center-recipe.flow';
import { buildProductCenterRuntimeEvidenceBundle } from '../../automation/recipe/product-center-runtime-evidence';
import { withProductCenterRecipeResourceLocks } from '../../utils/product-center-resource-lock';
import { collectProductCenterSettledBrowserContractSignals, collectProductCenterSettledBrowserReleaseEvidence, type ProductCenterBrowserContractSignals, type ProductCenterReleaseEvidence } from '../../utils/product-center-release-evidence';
import { appConfig } from '../../test-data/env';

const recipes = selectProductCenterRecipesForRuntime(
  (recipesDocument as unknown as { recipes: AutomationRecipe[] }).recipes,
);

test.describe('商品中心已审批技术绑定套件', () => {
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
        let browserSignals: ProductCenterBrowserContractSignals | undefined;
        let release: ProductCenterReleaseEvidence | undefined;

        const flow = new ProductCenterRecipeFlow(createProductCenterRecipeFlowPort({
          page,
          api: productCenterApi,
          cleanupRegistry,
          executionLedger,
          beforeCleanup: async () => {
            browserSignals = await collectProductCenterSettledBrowserContractSignals(page);
            release = await collectProductCenterSettledBrowserReleaseEvidence(page, {
              environmentId: appConfig.environmentId,
              baseURL: appConfig.baseURL,
              runId: process.env.PC_RECIPE_RUN_ID ?? 'LOCAL_RECIPE_RUN',
            });
          },
        }));

        await test.step('按已审批技术绑定执行真实 UI 与 API 验证', async () => {
          const context = await withProductCenterRecipeResourceLocks(
            recipe,
            () => flow.execute(recipe),
          );
          browserSignals ??= await collectProductCenterSettledBrowserContractSignals(page);
          release ??= await collectProductCenterSettledBrowserReleaseEvidence(page, {
            environmentId: appConfig.environmentId,
            baseURL: appConfig.baseURL,
            runId: process.env.PC_RECIPE_RUN_ID ?? 'LOCAL_RECIPE_RUN',
          });
          await testInfo.attach('product-center-runtime-evidence', {
            body: Buffer.from(JSON.stringify(buildProductCenterRuntimeEvidenceBundle({
              recipeId: recipe.id,
              caseId: recipe.caseId,
              results: context.results,
              environmentId: appConfig.environmentId,
              brandId: appConfig.brandId,
              screenshotAttachmentName: recipe.id + '-runtime-evidence',
              expectedClaimIds: recipe.claimIds,
              verifiedClaimIds: context.verifiedClaimIds,
              claimVerification: context.claimVerification,
              action: recipe.action,
              capabilityIds: recipe.capabilities.map((capability) => capability.id),
              assertionAdapterIds: recipe.assertions.map((assertion) => assertion.adapterId),
              phaseDurationsMs: context.phaseDurationsMs,
              release,
              browserSignals,
              cleanupRequired: Boolean(recipe.cleanup),
            })), 'utf8'),
            contentType: 'application/json',
          });
        });
      },
    );
  }
});
