import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import { buildProductCenterGoldRunSelection } from '../automation/recipe/product-center-gold-run-optimization';
import { removeAuthState } from '../utils/product-center-run-safety';
import {
  buildProductCenterTechnicalBindingCandidateArtifacts,
  resolveProductCenterTechnicalBindingApprovalPath,
} from './build-product-center-technical-binding-candidates';
import { buildProductCenterApprovedTechnicalBindingsRuntimeAcceptanceArtifact } from './build-product-center-approved-technical-bindings-runtime-acceptance';
import { runProductCenterRecipeCollectionSelection } from './product-center-recipe-collection-runner';

const collectionId = 'product-center-approved-technical-bindings';
const recipesPath = 'contracts/product-center/recipes/product-center-approved-technical-bindings-recipes.json';
const specPath = 'tests/generated/product-center-approved-technical-bindings.generated.spec.ts';

export async function runProductCenterApprovedTechnicalBindings(
  rootDir = process.cwd(),
): Promise<{ runId: string; accepted: boolean }> {
  const approvalsPath = resolveProductCenterTechnicalBindingApprovalPath(rootDir);
  if (!approvalsPath) throw new Error('缺少已审批技术绑定正式审批文件');
  const build = buildProductCenterTechnicalBindingCandidateArtifacts({
    projectRoot: rootDir,
    approvalsPath,
  });
  if (build.status !== 'approved') throw new Error(`技术绑定尚未批准：${build.status}`);

  const recipesDocument = readJson<{ fingerprint: string; recipes: AutomationRecipe[] }>(path.join(
    rootDir,
    recipesPath,
  ));
  const selection = buildProductCenterGoldRunSelection(recipesDocument.recipes);
  const authDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-approved-bindings-auth-'));
  const authStatePath = path.join(authDirectory, 'auth-state.json');
  try {
    const run = await runProductCenterRecipeCollectionSelection(
      rootDir,
      recipesDocument.recipes,
      selection,
      { collectionId, specPath, runIdPrefix: 'AUTO_AUDIT_APPROVED_BINDINGS' },
      {
        repeatEach: 1,
        workers: 2,
        authStatePath,
        noDependencies: false,
      },
    );
    const acceptancePath = await buildProductCenterApprovedTechnicalBindingsRuntimeAcceptanceArtifact(
      rootDir,
      {
        runId: run.runId,
        scope: run.scope,
        selectedCaseIds: run.selectedCaseIds,
        publishLatest: true,
      },
    );
    const acceptance = readJson<{ accepted: boolean }>(acceptancePath);
    if (!acceptance.accepted) throw new Error(`已审批技术绑定运行验收失败：runId=${run.runId}`);
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
  void runProductCenterApprovedTechnicalBindings().then((result) => {
    process.stdout.write(`已审批技术绑定 UI 运行完成：${result.runId};accepted=${result.accepted}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
