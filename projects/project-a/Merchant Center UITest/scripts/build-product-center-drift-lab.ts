import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterDriftLabReport,
  type ProductCenterDriftBenchmarkContract,
  type ProductCenterHistoricalFailureReplayContract,
  type ProductCenterInteractionProbeContract,
} from '../utils/product-center-drift-lab';
import type {
  ProductCenterPageContractObservation,
  ProductCenterPageContractRecipeInput,
} from '../utils/product-center-page-contract-observation';
import { validateProductCenterDriftContracts } from '../utils/product-center-interaction-probe';

type RecipeArtifact = {
  recipes: ProductCenterPageContractRecipeInput[];
};

export function buildProductCenterDriftLabArtifact(options: {
  projectRoot?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const goldRecipes = readJson<RecipeArtifact>(
    projectRoot,
    'contracts/product-center/recipes/product-center-test-plan-gold-set-recipes.json',
  ).recipes;
  const impactRecipes = mergeRecipeReferences([
    ...readJson<RecipeArtifact>(
      projectRoot,
      'contracts/product-center/recipes/product-center-pilot-recipes.json',
    ).recipes,
    ...goldRecipes,
    ...readJson<RecipeArtifact>(
      projectRoot,
      'contracts/product-center/recipes/product-center-approved-technical-bindings-recipes.json',
    ).recipes,
    ...readJson<RecipeArtifact>(
      projectRoot,
      'contracts/product-center/recipes/product-center-item-combo-audit-probe-recipes.json',
    ).recipes,
  ]);
  const benchmark = readJson<ProductCenterDriftBenchmarkContract>(
    projectRoot,
    'contracts/product-center/drift/product-center-drift-benchmark.json',
  );
  const historicalReplay = readJson<ProductCenterHistoricalFailureReplayContract>(
    projectRoot,
    'contracts/product-center/drift/product-center-historical-failure-replay.json',
  );
  const interactionProbes = readJson<ProductCenterInteractionProbeContract>(
    projectRoot,
    'contracts/product-center/drift/product-center-interaction-probes.json',
  );
  const schemaIssues = validateProductCenterDriftContracts({
    benchmark,
    historicalReplay,
    interactionProbes,
  });
  if (schemaIssues.length > 0) throw new Error(`漂移合同 Schema 无效：${schemaIssues.join(';')}`);
  const report = buildProductCenterDriftLabReport({
    baseline: readJson<ProductCenterPageContractObservation>(
      projectRoot,
      'contracts/product-center/snapshots/product-center-page-contract-baseline.json',
    ),
    recipes: goldRecipes,
    impactRecipes,
    benchmark,
    historicalReplay,
    interactionProbes,
    interactionProbeEvidence: readJson<{
      entries: Array<{ probeId: string; status: 'planned' | 'observed' }>;
    }>(
      projectRoot,
      'output/page-contract/product-center-interaction-probe-evidence.json',
    ),
    generatedAt: options.generatedAt,
  });
  const outputPath = path.join(
    projectRoot,
    'output/page-contract/product-center-drift-lab.json',
  );
  writeJsonAtomic(outputPath, report);
  return { outputPath, report };
}

function readJson<T>(projectRoot: string, relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')) as T;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function mergeRecipeReferences(
  recipes: readonly ProductCenterPageContractRecipeInput[],
): ProductCenterPageContractRecipeInput[] {
  const byCaseId = new Map<string, ProductCenterPageContractRecipeInput>();
  for (const recipe of recipes) {
    const current = byCaseId.get(recipe.caseId);
    byCaseId.set(recipe.caseId, current
      ? { ...current, sourceIds: [...new Set([...current.sourceIds, ...recipe.sourceIds])].sort() }
      : recipe);
  }
  return [...byCaseId.values()].sort((left, right) => left.caseId.localeCompare(right.caseId));
}

if (require.main === module) {
  try {
    const { outputPath, report } = buildProductCenterDriftLabArtifact();
    process.stdout.write(`商品中心漂移实验室：${outputPath}\n状态：${report.status}\n`);
    if (report.status !== 'accepted') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
