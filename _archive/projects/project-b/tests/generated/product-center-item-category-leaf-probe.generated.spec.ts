import type { AutomationRecipe } from '../../automation/recipe/automation-recipe';
import recipesDocument from '../../contracts/product-center/recipes/product-center-item-category-leaf-probe-recipes.json';
import { selectProductCenterRecipesForRuntime } from '../../automation/recipe/product-center-gold-run-optimization';
import { buildProductCenterRuntimeEvidenceBundle } from '../../automation/recipe/product-center-runtime-evidence';
import { test } from '../../fixtures/product-center.fixture';
import {
  createProductCenterRecipeFlowPort,
  ProductCenterRecipeFlow,
} from '../../flows/product-center/product-center-recipe.flow';
import { stopProductCenterItemCategoryLeafMutationTracking } from '../../flows/product-center/product-center-item-category-leaf-probe.flow';
import { appConfig } from '../../test-data/env';
import { withProductCenterRecipeResourceLocks } from '../../utils/product-center-resource-lock';
import {
  collectProductCenterSettledBrowserContractSignals,
  collectProductCenterSettledBrowserReleaseEvidence,
} from '../../utils/product-center-release-evidence';

const recipes = selectProductCenterRecipesForRuntime(
  (recipesDocument as unknown as { recipes: AutomationRecipe[] }).recipes,
);

test.describe('商品分类叶子选择只读 Probe', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  for (const recipe of recipes) {
    test(
      `P1 ${recipe.caseId} ${recipe.title}`,
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
        try {
          const context = await withProductCenterRecipeResourceLocks(
            recipe,
            () => flow.execute(recipe),
          );
          const screenshotAttachmentName = `${recipe.caseId}-visible-ui`;
          await testInfo.attach(screenshotAttachmentName, {
            body: await page.screenshot(),
            contentType: 'image/png',
          });
          const browserSignals = await collectProductCenterSettledBrowserContractSignals(page);
          const release = await collectProductCenterSettledBrowserReleaseEvidence(page, {
            environmentId: appConfig.environmentId,
            baseURL: appConfig.baseURL,
            runId: process.env.PC_RECIPE_RUN_ID ?? 'LOCAL_ITEM_CATEGORY_LEAF_PROBE',
          });
          await attachRuntimeEvidence(testInfo, buildProductCenterRuntimeEvidenceBundle({
            recipeId: recipe.id,
            caseId: recipe.caseId,
            results: context.results,
            environmentId: appConfig.environmentId,
            brandId: appConfig.brandId,
            screenshotAttachmentName,
            expectedClaimIds: recipe.claimIds,
            verifiedClaimIds: context.verifiedClaimIds,
            claimVerification: context.claimVerification,
            action: recipe.action,
            capabilityIds: recipe.capabilities.map((capability) => capability.id),
            assertionAdapterIds: recipe.assertions.map((assertion) => assertion.adapterId),
            phaseDurationsMs: context.phaseDurationsMs,
            release,
            browserSignals,
            cleanupRequired: false,
          }));
        } finally {
          stopProductCenterItemCategoryLeafMutationTracking(page);
        }
      },
    );
  }
});

async function attachRuntimeEvidence(
  testInfo: { attach: (name: string, options: { body: Buffer; contentType: string }) => Promise<void> },
  evidence: unknown,
): Promise<void> {
  await testInfo.attach('product-center-runtime-evidence', {
    body: Buffer.from(JSON.stringify(evidence), 'utf8'),
    contentType: 'application/json',
  });
}
