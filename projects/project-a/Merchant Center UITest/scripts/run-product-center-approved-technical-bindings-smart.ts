import fs from 'node:fs';
import path from 'node:path';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import { decideProductCenterRuntimeReuse } from '../utils/product-center-runtime-reuse';
import { writeProductCenterImmutableRunArtifact } from '../utils/product-center-run-artifacts';
import {
  buildProductCenterTechnicalBindingCandidateArtifacts,
  resolveProductCenterTechnicalBindingApprovalPath,
} from './build-product-center-technical-binding-candidates';
import { buildProductCenterApprovedTechnicalBindingsRuntimeAcceptanceArtifact } from './build-product-center-approved-technical-bindings-runtime-acceptance';
import { runProductCenterApprovedTechnicalBindings } from './run-product-center-approved-technical-bindings';

export async function runProductCenterApprovedTechnicalBindingsSmart(rootDir = process.cwd()) {
  const approvalsPath = resolveProductCenterTechnicalBindingApprovalPath(rootDir);
  if (!approvalsPath) throw new Error('缺少已审批技术绑定正式审批文件');
  const approvalBuild = buildProductCenterTechnicalBindingCandidateArtifacts({
    projectRoot: rootDir,
    approvalsPath,
  });
  if (approvalBuild.status !== 'approved') throw new Error(`技术绑定尚未批准：${approvalBuild.status}`);

  const goldRecipes = readJson<{ fingerprint: string; recipes: AutomationRecipe[] }>(path.join(
    rootDir,
    'contracts/product-center/recipes/product-center-test-plan-gold-set-recipes.json',
  ));
  const approvedRecipes = readJson<{ fingerprint: string; recipes: AutomationRecipe[] }>(path.join(
    rootDir,
    'contracts/product-center/recipes/product-center-approved-technical-bindings-recipes.json',
  ));
  const goldFeedback = readJson<Record<string, any>>(path.join(
    rootDir,
    'output/recipes/product-center-test-plan-gold-set-feedback.json',
  ));
  const goldEvidence = readJson<Record<string, any>>(path.join(
    rootDir,
    'output/recipes/product-center-test-plan-gold-set-evidence.json',
  ));
  const decision = decideProductCenterRuntimeReuse({
    sourceRecipes: goldRecipes.recipes,
    targetRecipes: approvedRecipes.recipes,
    sourceRun: goldFeedback,
  });
  if (!decision.reusable || goldFeedback.runId !== goldEvidence.runId) {
    const result = await runProductCenterApprovedTechnicalBindings(rootDir);
    return { ...result, mode: 'independent-ui' as const, decision };
  }

  const runId = `REUSED_GOLD_${goldFeedback.runId}`;
  const collectionId = 'product-center-approved-technical-bindings';
  const feedback = {
    ...goldFeedback,
    fingerprint: approvedRecipes.fingerprint,
    runId,
    scope: 'full',
    reusedFrom: {
      collectionId: 'product-center-test-plan-gold-set',
      runId: goldFeedback.runId,
      semanticFingerprint: decision.sourceSemanticFingerprint,
    },
  };
  const evidence = {
    ...goldEvidence,
    fingerprint: approvedRecipes.fingerprint,
    runId,
    scope: 'full',
    reusedFrom: feedback.reusedFrom,
  };
  for (const [artifactName, value, latestRelativePath] of [
    ['feedback', feedback, 'output/recipes/product-center-approved-technical-bindings-feedback.json'],
    ['evidence', evidence, 'output/recipes/product-center-approved-technical-bindings-evidence.json'],
  ] as const) {
    writeProductCenterImmutableRunArtifact({
      rootDir,
      collectionId,
      runId,
      scope: 'full',
      artifactName,
      value,
      publishLatest: true,
      latestRelativePath,
    });
  }
  const selectedCaseIds = approvedRecipes.recipes.map((recipe) => recipe.caseId).sort();
  await buildProductCenterApprovedTechnicalBindingsRuntimeAcceptanceArtifact(rootDir, {
    runId,
    scope: 'full',
    selectedCaseIds,
    publishLatest: true,
  });
  return { runId, accepted: true, mode: 'reused-gold' as const, decision };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

if (require.main === module) {
  void runProductCenterApprovedTechnicalBindingsSmart().then((result) => {
    process.stdout.write(`已审批技术绑定运行完成：mode=${result.mode};runId=${result.runId}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
