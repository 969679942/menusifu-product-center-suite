import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import {
  buildExactProductCenterGoldRunSelection,
  buildProductCenterGoldRunSelection,
  type ProductCenterGoldRunSelection,
} from '../automation/recipe/product-center-gold-run-optimization';
import { removeAuthState } from '../utils/product-center-run-safety';
import {
  runProductCenterRecipeCollectionSelection,
  type ProductCenterRecipeCollectionRunConfig,
} from './product-center-recipe-collection-runner';

export const productCenterMainRunConfig: ProductCenterRecipeCollectionRunConfig = {
  collectionId: 'product-center-pilot',
  specPath: 'tests/generated/product-center-recipe-pilot.generated.spec.ts',
  runIdPrefix: 'AUTO_AUDIT_RUN',
};

export function selectProductCenterMainRecipes(
  recipes: readonly AutomationRecipe[],
  caseIds?: readonly string[],
): ProductCenterGoldRunSelection {
  return caseIds ? buildExactProductCenterGoldRunSelection(recipes, caseIds) : buildProductCenterGoldRunSelection(recipes);
}

export async function runProductCenterMainRecipes(
  rootDir = process.cwd(),
  caseIds?: readonly string[],
) {
  const recipesDocument = readJson<{ fingerprint: string; recipes: AutomationRecipe[] }>(path.join(
    rootDir,
    'contracts/product-center/recipes/product-center-pilot-recipes.json',
  ));
  const selection = selectProductCenterMainRecipes(recipesDocument.recipes, caseIds);
  const authDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-main-auth-'));
  const authStatePath = path.join(authDirectory, 'auth-state.json');
  try {
    return await runProductCenterRecipeCollectionSelection(
      rootDir,
      recipesDocument.recipes,
      selection,
      productCenterMainRunConfig,
      {
        repeatEach: 1,
        workers: 2,
        authStatePath,
        noDependencies: false,
      },
    );
  } finally {
    removeAuthState(authStatePath);
    fs.rmSync(authDirectory, { recursive: true, force: true });
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

if (require.main === module) {
  const exactCaseIds = process.argv.find((arg) => arg.startsWith('--case-ids='))
    ?.slice('--case-ids='.length)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  void runProductCenterMainRecipes(process.cwd(), exactCaseIds).then((run) => {
    process.stdout.write(`商品中心主集合 UI 运行完成：${run.runId}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
