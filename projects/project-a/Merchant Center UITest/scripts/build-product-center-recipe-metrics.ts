import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import feedbackDocument from '../output/recipes/product-center-pilot-feedback.json';
import incrementalDocument from '../contracts/product-center/recipes/product-center-recipe-incremental-plan.json';
import promotionDocument from '../contracts/product-center/recipes/product-center-recipe-promotion.json';
import recipesDocument from '../contracts/product-center/recipes/product-center-pilot-recipes.json';
import unresolvedDocument from '../contracts/product-center/recipes/product-center-recipe-unresolved.json';
import contractDocument from '../contracts/product-center/product-center-test-contract.json';
import { buildProductCenterRecipeMetrics } from '../automation/recipe/product-center-recipe-metrics';
import { buildProductCenterRecipeSourceIndex } from '../automation/recipe/product-center-recipe-source-index';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import type { ProductCenterTestContract } from '../utils/product-center-test-contract';

export async function buildProductCenterRecipeMetricsArtifact(rootDir = process.cwd()): Promise<string> {
  const recipes = (recipesDocument as unknown as { recipes: AutomationRecipe[] }).recipes;
  const sourceIndex = buildProductCenterRecipeSourceIndex(
    contractDocument as unknown as ProductCenterTestContract,
  );
  const metrics = buildProductCenterRecipeMetrics({
    totalSopCases: recipes.length,
    recipes,
    unresolvedCount: (unresolvedDocument as { unresolved: unknown[] }).unresolved.length,
    manualCorrectionCaseIds: [],
    feedback: (feedbackDocument as unknown as {
      entries: Array<{ recipeId: string; status: string; durationMs: number; classification?: string; diagnostic?: string }>;
    }).entries,
    promotedCaseIds: (promotionDocument as { promotedCaseIds: string[] }).promotedCaseIds,
    incrementalSelectedCount: (incrementalDocument as { selectedCaseIds: string[] }).selectedCaseIds.length,
    incrementalUnsupportedCount: (incrementalDocument as { unsupportedCaseIds: string[] }).unsupportedCaseIds.length,
    legacySourceAliasCount: sourceIndex.entries.reduce(
      (total, entry) => total + entry.legacySourceAliases.length,
      0,
    ),
  });
  const filePath = path.join(
    rootDir,
    'contracts/product-center/recipes/product-center-recipe-metrics.json',
  );
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
  return filePath;
}

async function main(): Promise<void> {
  process.stdout.write(`商品中心 Recipe 指标已生成：${await buildProductCenterRecipeMetricsArtifact()}\n`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
