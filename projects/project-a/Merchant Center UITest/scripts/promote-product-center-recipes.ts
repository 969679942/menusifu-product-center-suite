import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateProductCenterRecipePromotion } from '../automation/recipe/product-center-recipe-promotion';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import { appConfig } from '../test-data/env';
import {
  findIncompleteCheckpointFiles,
  scanGeneratedArtifacts,
} from '../utils/product-center-run-safety';
import { generateProductCenterFormalRecipeSpec } from './generate-product-center-recipe-spec';

export async function promoteProductCenterRecipes(options: {
  rootDir?: string;
  recipeContractsPassed: boolean;
}): Promise<string> {
  const rootDir = options.rootDir ?? process.cwd();
  const recipeArtifact = readJson<{ fingerprint: string; recipes: AutomationRecipe[] }>(
    path.join(rootDir, 'contracts/product-center/recipes/product-center-pilot-recipes.json'),
  );
  const unresolvedArtifact = readJson<{ unresolved: unknown[] }>(
    path.join(rootDir, 'contracts/product-center/recipes/product-center-recipe-unresolved.json'),
  );
  const feedback = readJson<{
    fingerprint: string;
    entries: Array<{ recipeId: string; caseId: string; status: string }>;
  }>(path.join(rootDir, 'output/recipes/product-center-pilot-feedback.json'));
  const generatedSpecPath = path.join(rootDir, 'tests/generated/product-center-recipe-pilot.generated.spec.ts');
  const result = evaluateProductCenterRecipePromotion({
    recipeFingerprint: recipeArtifact.fingerprint,
    recipes: recipeArtifact.recipes,
    unresolvedCount: unresolvedArtifact.unresolved.length,
    recipeContractsPassed: options.recipeContractsPassed,
    feedback,
    safety: {
      incompleteCheckpoints: findIncompleteCheckpointFiles(path.join(rootDir, 'output/checkpoints')).length,
      sensitiveArtifacts: scanGeneratedArtifacts(path.join(rootDir, 'output')).length,
      savedAuthStates: fs.existsSync(path.resolve(rootDir, appConfig.storageStatePath)) ? 1 : 0,
    },
    generatedSpecSource: fs.readFileSync(generatedSpecPath, 'utf8'),
  });
  const promotionPath = path.join(
    rootDir,
    'contracts/product-center/recipes/product-center-recipe-promotion.json',
  );
  fs.writeFileSync(promotionPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  if (result.status !== 'eligible') throw new Error(`Recipe 晋级被阻断：${result.reasons.join(', ')}`);
  await generateProductCenterFormalRecipeSpec(rootDir);
  return promotionPath;
}

function runRecipeContracts(): void {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('缺少 npm_execpath，无法验证 Recipe 合同');
  const result = spawnSync(process.execPath, [npmCli, 'run', 'test:product-center:recipes:contracts', '--', '--reporter=line'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`Recipe 合同验证失败：${result.status ?? 'unknown'}`);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

async function main(): Promise<void> {
  runRecipeContracts();
  process.stdout.write(`商品中心 Recipe 晋级完成：${await promoteProductCenterRecipes({ recipeContractsPassed: true })}\n`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
