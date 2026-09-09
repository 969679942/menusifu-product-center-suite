import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function renderProductCenterRecipeSpec(options: {
  suiteTitle?: string;
  recipesImportPath?: string;
  stepTitle?: string;
  attachRuntimeEvidence?: boolean;
} = {}): string {
  const suiteTitle = options.suiteTitle ?? '商品中心 Recipe 编译试点';
  const recipesImportPath = options.recipesImportPath ?? '../../contracts/product-center/recipes/product-center-pilot-recipes.json';
  const stepTitle = options.stepTitle ?? '按编译后的 Recipe 执行正向与反向 SOP';
  const attachRuntimeEvidence = options.attachRuntimeEvidence ?? true;
  const evidenceImports = attachRuntimeEvidence
    ? "import { buildProductCenterRuntimeEvidenceBundle } from '../../automation/recipe/product-center-runtime-evidence';\nimport { withProductCenterRecipeResourceLocks } from '../../utils/product-center-resource-lock';\nimport { collectProductCenterSettledBrowserContractSignals, collectProductCenterSettledBrowserReleaseEvidence, type ProductCenterBrowserContractSignals, type ProductCenterReleaseEvidence } from '../../utils/product-center-release-evidence';\nimport { appConfig } from '../../test-data/env';\n"
    : '';
  const evidenceState = attachRuntimeEvidence
    ? `        let browserSignals: ProductCenterBrowserContractSignals | undefined;
        let release: ProductCenterReleaseEvidence | undefined;
`
    : '';
  const evidencePortOption = attachRuntimeEvidence
    ? `          beforeCleanup: async () => {
            browserSignals = await collectProductCenterSettledBrowserContractSignals(page);
            release = await collectProductCenterSettledBrowserReleaseEvidence(page, {
              environmentId: appConfig.environmentId,
              baseURL: appConfig.baseURL,
              runId: process.env.PC_RECIPE_RUN_ID ?? 'LOCAL_RECIPE_RUN',
            });
          },
`
    : '';
  const evidenceBody = attachRuntimeEvidence
    ? `          const context = await withProductCenterRecipeResourceLocks(\n            recipe,\n            () => flow.execute(recipe),\n          );\n          const browserSignals = await collectProductCenterSettledBrowserContractSignals(page);\n          const release = await collectProductCenterSettledBrowserReleaseEvidence(page, {\n            environmentId: appConfig.environmentId,\n            baseURL: appConfig.baseURL,\n            runId: process.env.PC_RECIPE_RUN_ID ?? 'LOCAL_RECIPE_RUN',\n          });\n          await testInfo.attach('product-center-runtime-evidence', {\n            body: Buffer.from(JSON.stringify(buildProductCenterRuntimeEvidenceBundle({\n              recipeId: recipe.id,\n              caseId: recipe.caseId,\n              results: context.results,\n              environmentId: appConfig.environmentId,\n              brandId: appConfig.brandId,\n              screenshotAttachmentName: recipe.id + '-runtime-evidence',\n              expectedClaimIds: recipe.claimIds,\n              verifiedClaimIds: context.verifiedClaimIds,\n              claimVerification: context.claimVerification,\n              action: recipe.action,\n              capabilityIds: recipe.capabilities.map((capability) => capability.id),\n              assertionAdapterIds: recipe.assertions.map((assertion) => assertion.adapterId),\n              phaseDurationsMs: context.phaseDurationsMs,\n              release,\n              browserSignals,\n              cleanupRequired: Boolean(recipe.cleanup),\n            })), 'utf8'),\n            contentType: 'application/json',\n          });`
    : '          await flow.execute(recipe);';
  const renderedEvidenceBody = attachRuntimeEvidence
    ? evidenceBody
      .replace('const browserSignals = ', 'browserSignals ??= ')
      .replace('const release = ', 'release ??= ')
    : evidenceBody;
  return `import type { AutomationRecipe } from '../../automation/recipe/automation-recipe';
import recipesDocument from '${recipesImportPath}';
import { selectProductCenterRecipesForRuntime } from '../../automation/recipe/product-center-gold-run-optimization';
import { test } from '../../fixtures/product-center.fixture';
import {
  createProductCenterRecipeFlowPort,
  ProductCenterRecipeFlow,
} from '../../flows/product-center/product-center-recipe.flow';
${evidenceImports}
const recipes = selectProductCenterRecipesForRuntime(
  (recipesDocument as unknown as { recipes: AutomationRecipe[] }).recipes,
);

test.describe('${suiteTitle}', () => {
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
${evidenceState}
        const flow = new ProductCenterRecipeFlow(createProductCenterRecipeFlowPort({
          page,
          api: productCenterApi,
          cleanupRegistry,
          executionLedger,
${evidencePortOption}        }));

        await test.step('${stepTitle}', async () => {
${renderedEvidenceBody}
        });
      },
    );
  }
});
`;
}

export async function generateProductCenterRecipeSpec(rootDir = process.cwd()): Promise<string> {
  const filePath = path.join(rootDir, 'tests', 'generated', 'product-center-recipe-pilot.generated.spec.ts');
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, renderProductCenterRecipeSpec({ attachRuntimeEvidence: true }), 'utf8');
  return filePath;
}

export async function generateProductCenterFormalRecipeSpec(rootDir = process.cwd()): Promise<string> {
  const filePath = path.join(rootDir, 'tests', 'e2e', 'product-center-recipe-core.generated.spec.ts');
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, renderProductCenterRecipeSpec({
    suiteTitle: '商品中心 Recipe 正式核心套件',
    attachRuntimeEvidence: true,
  }), 'utf8');
  return filePath;
}

export async function generateProductCenterTestPlanGoldSetRecipeSpec(
  rootDir = process.cwd(),
): Promise<string> {
  const filePath = path.join(
    rootDir,
    'tests',
    'generated',
    'product-center-test-plan-gold-set.generated.spec.ts',
  );
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, renderProductCenterRecipeSpec({
    suiteTitle: '商品中心真实测试方案金标集',
    recipesImportPath: '../../contracts/product-center/recipes/product-center-test-plan-gold-set-recipes.json',
    stepTitle: '按金标集 Recipe 执行真实 UI 与 API 验证',
    attachRuntimeEvidence: true,
  }), 'utf8');
  return filePath;
}

async function main(): Promise<void> {
  process.stdout.write(`商品中心 Recipe Spec 已生成：${await generateProductCenterRecipeSpec()}\n`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
