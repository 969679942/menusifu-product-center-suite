import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import diffDocument from '../contracts/product-center/product-center-contract-diff.json';
import recipesDocument from '../contracts/product-center/recipes/product-center-pilot-recipes.json';
import contractDocument from '../contracts/product-center/product-center-test-contract.json';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import { buildProductCenterIncrementalRecipePlan } from '../automation/recipe/product-center-incremental-recipe-plan';
import type { ProductCenterContractDiff } from '../utils/product-center-contract-diff';
import type { ProductCenterTestContract } from '../utils/product-center-test-contract';

export async function buildProductCenterIncrementalRecipeArtifact(rootDir = process.cwd()): Promise<string> {
  const recipes = (recipesDocument as unknown as { recipes: AutomationRecipe[] }).recipes;
  const contract = contractDocument as unknown as ProductCenterTestContract;
  const plan = buildProductCenterIncrementalRecipePlan(
    diffDocument as unknown as ProductCenterContractDiff,
    recipes,
    contract.metadata.contractVersion,
  );
  const filePath = path.join(
    rootDir,
    'contracts',
    'product-center',
    'recipes',
    'product-center-recipe-incremental-plan.json',
  );
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  return filePath;
}

async function main(): Promise<void> {
  process.stdout.write(`商品中心增量 Recipe 计划已生成：${await buildProductCenterIncrementalRecipeArtifact()}\n`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
