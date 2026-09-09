import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import { buildProductCenterGoldRunSelection } from '../automation/recipe/product-center-gold-run-optimization';
import { removeAuthState } from '../utils/product-center-run-safety';
import { buildProductCenterItemComboAuditProbeArtifacts } from './build-product-center-item-combo-audit-probe';
import { buildProductCenterItemComboAuditRuntimeAcceptanceArtifact } from './build-product-center-item-combo-audit-runtime-acceptance';
import { runProductCenterRecipeCollectionSelection } from './product-center-recipe-collection-runner';

const collectionId = 'product-center-item-combo-audit-probe';
const specPath = 'tests/generated/product-center-item-combo-audit-probe.generated.spec.ts';

export async function runProductCenterItemComboAuditProbe(
  rootDir = process.cwd(),
): Promise<{ runId: string; accepted: boolean }> {
  const built = buildProductCenterItemComboAuditProbeArtifacts(rootDir);
  const recipes = built.recipes as AutomationRecipe[];
  if (recipes.length !== 2
    || !recipes.some((recipe) => recipe.caseId === 'TC-ITEM-PKG-046')
    || !recipes.some((recipe) => recipe.caseId === 'TC-ITEM-PKG-059')) {
    throw new Error('套餐规则 Probe runner 仅允许 TC-ITEM-PKG-046 与 TC-ITEM-PKG-059');
  }
  const selection = buildProductCenterGoldRunSelection(recipes);
  const authDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-item-combo-audit-auth-'));
  const authStatePath = path.join(authDirectory, 'auth-state.json');
  try {
    const run = await runProductCenterRecipeCollectionSelection(
      rootDir,
      recipes,
      selection,
      { collectionId, specPath, runIdPrefix: 'AUTO_AUDIT_ITEM_COMBO' },
      { repeatEach: 1, workers: 1, authStatePath, noDependencies: false },
    );
    const acceptancePath = await buildProductCenterItemComboAuditRuntimeAcceptanceArtifact(rootDir, {
      runId: run.runId,
      scope: run.scope,
      selectedCaseIds: run.selectedCaseIds,
      publishLatest: true,
    });
    const acceptance = JSON.parse(fs.readFileSync(acceptancePath, 'utf8')) as { accepted?: boolean };
    if (acceptance.accepted !== true) throw new Error(`套餐规则 Probe runtime acceptance 未通过：${run.runId}`);
    return { runId: run.runId, accepted: true };
  } finally {
    removeAuthState(authStatePath);
    fs.rmSync(authDirectory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  void runProductCenterItemComboAuditProbe().then((result) => {
    process.stdout.write(`套餐规则 UI Probe 完成：${result.runId};accepted=${result.accepted}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
