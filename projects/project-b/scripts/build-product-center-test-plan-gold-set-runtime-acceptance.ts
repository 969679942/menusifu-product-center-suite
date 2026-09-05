import {
  buildProductCenterRuntimeAcceptanceArtifactForCollection,
  type ProductCenterRuntimeAcceptanceBuildOptions,
} from './build-product-center-runtime-acceptance';
import fs from 'node:fs';
import path from 'node:path';
import { appendProductCenterAcceptanceRun } from '../utils/product-center-run-artifacts';

export async function buildProductCenterTestPlanGoldSetRuntimeAcceptanceArtifact(
  rootDir = process.cwd(),
  options: ProductCenterRuntimeAcceptanceBuildOptions = {},
): Promise<string> {
  const outputPath = await buildProductCenterRuntimeAcceptanceArtifactForCollection(rootDir, {
    collectionId: 'product-center-test-plan-gold-set',
    recipesPath: 'contracts/product-center/recipes/product-center-test-plan-gold-set-recipes.json',
    feedbackPath: 'output/recipes/product-center-test-plan-gold-set-feedback.json',
    evidencePath: 'output/recipes/product-center-test-plan-gold-set-evidence.json',
    specPath: 'tests/generated/product-center-test-plan-gold-set.generated.spec.ts',
    outputPath: 'output/recipes/product-center-test-plan-gold-set-acceptance.json',
    stageId: 'gold-ui',
  }, options);
  appendGoldAcceptanceHistory(rootDir, outputPath);
  return outputPath;
}

function appendGoldAcceptanceHistory(rootDir: string, acceptancePath: string): void {
  const acceptance = JSON.parse(fs.readFileSync(acceptancePath, 'utf8')) as {
    runId: string;
    scope: string;
    generatedAt: string;
    caseAcceptance: Array<{ caseId: string; accepted: boolean }>;
    observationAcceptance: Array<{
      observationId: string;
      caseId: string;
      accepted: boolean;
    }>;
  };
  const gold = JSON.parse(fs.readFileSync(path.join(
    rootDir,
    'contracts/product-center/test-cases/pilots/product-center-test-plan-gold-set.json',
  ), 'utf8')) as { cases: Array<{ id: string; module: string }> };
  const modules = new Map(gold.cases.map((item) => [item.id, item.module]));
  const observations = acceptance.observationAcceptance ?? [];
  const repeatIndexes = [...new Set(observations.map((item) => (
    item.observationId.match(/:repeat-(\d+):/)?.[1] ?? '0'
  )))].sort((left, right) => Number(left) - Number(right));
  const groups = observations.length > 0
    ? repeatIndexes.map((repeatIndex) => ({
        runId: repeatIndexes.length === 1
          ? acceptance.runId
          : `${acceptance.runId}:repeat-${repeatIndex}`,
        entries: observations.filter((item) => (
          (item.observationId.match(/:repeat-(\d+):/)?.[1] ?? '0') === repeatIndex
        )),
      }))
    : [{ runId: acceptance.runId, entries: acceptance.caseAcceptance }];
  for (const group of groups) {
    appendProductCenterAcceptanceRun(rootDir, {
      runId: group.runId,
      scope: acceptance.scope,
      generatedAt: acceptance.generatedAt,
      accepted: group.entries.length > 0 && group.entries.every((item) => item.accepted),
      entries: group.entries.map((item) => {
        const module = modules.get(item.caseId);
        if (!module) throw new Error(`Gold 验收历史缺少模块映射：${item.caseId}`);
        return {
          caseId: item.caseId,
          module,
          status: item.accepted ? 'passed' as const : 'failed' as const,
        };
      }),
    });
  }
}

async function main(): Promise<void> {
  const outputPath = await buildProductCenterTestPlanGoldSetRuntimeAcceptanceArtifact();
  process.stdout.write(`商品中心真实测试方案金标集运行验收产物已生成：${outputPath}\n`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
