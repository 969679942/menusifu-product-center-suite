import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import { buildProductCenterGoldRunSelection } from '../automation/recipe/product-center-gold-run-optimization';
import { assertProductCenterItemCategoryLeafProbeExecutionAuthorized } from '../utils/product-center-item-category-leaf-runtime';
import { removeAuthState } from '../utils/product-center-run-safety';
import { buildProductCenterItemCategoryLeafRuntimeArtifacts } from './build-product-center-item-category-leaf-runtime';
import { buildProductCenterItemCategoryLeafRuntimeAcceptanceArtifact } from './build-product-center-item-category-leaf-runtime-acceptance';
import { runProductCenterRecipeCollectionSelection } from './product-center-recipe-collection-runner';

const collectionId = 'product-center-item-category-leaf-probe';
const recipesPath = 'contracts/product-center/recipes/product-center-item-category-leaf-probe-recipes.json';
const specPath = 'tests/generated/product-center-item-category-leaf-probe.generated.spec.ts';

export async function runProductCenterItemCategoryLeafProbe(
  rootDir = process.cwd(),
): Promise<{ runId: string; accepted: boolean }> {
  const proposal = readJson<Parameters<
    typeof assertProductCenterItemCategoryLeafProbeExecutionAuthorized
  >[0]>(path.join(
    rootDir,
    'output/test-case-audit/product-center/item-category-leaf-technical-proposal-latest.json',
  ));
  assertProductCenterItemCategoryLeafProbeExecutionAuthorized(proposal);
  buildProductCenterItemCategoryLeafRuntimeArtifacts({ projectRoot: rootDir });
  const recipesDocument = readJson<{ recipes: AutomationRecipe[] }>(path.join(rootDir, recipesPath));
  if (recipesDocument.recipes.length !== 1
    || recipesDocument.recipes[0].caseId !== 'TC-ITEM-STD-007') {
    throw new Error('TC-ITEM-STD-007 runner 只允许一个目标用例');
  }
  const selection = buildProductCenterGoldRunSelection(recipesDocument.recipes);
  const authDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-item-category-leaf-auth-'));
  const authStatePath = path.join(authDirectory, 'auth-state.json');
  try {
    const run = await runProductCenterRecipeCollectionSelection(
      rootDir,
      recipesDocument.recipes,
      selection,
      { collectionId, specPath, runIdPrefix: 'AUTO_AUDIT_ITEM_CATEGORY_LEAF' },
      {
        repeatEach: 1,
        workers: 1,
        authStatePath,
        noDependencies: false,
      },
    );
    const acceptancePath = await buildProductCenterItemCategoryLeafRuntimeAcceptanceArtifact(
      rootDir,
      {
        runId: run.runId,
        scope: run.scope,
        selectedCaseIds: run.selectedCaseIds,
        publishLatest: true,
      },
    );
    const acceptance = readJson<{ accepted: boolean }>(acceptancePath);
    if (!acceptance.accepted) throw new Error(`TC-ITEM-STD-007 runtime acceptance 未通过：${run.runId}`);
    return { runId: run.runId, accepted: true };
  } finally {
    removeAuthState(authStatePath);
    fs.rmSync(authDirectory, { recursive: true, force: true });
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

if (require.main === module) {
  void runProductCenterItemCategoryLeafProbe().then((result) => {
    process.stdout.write(`TC-ITEM-STD-007 UI Probe 完成：${result.runId};accepted=${result.accepted}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
