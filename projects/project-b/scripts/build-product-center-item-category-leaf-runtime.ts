import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { productCenterRecipeCapabilityContracts } from '../adapters/product-center/product-center-recipe-capabilities';
import { validateAutomationRecipe } from '../automation/recipe/recipe-validator';
import type { ProductCenterCanonicalCase } from '../utils/product-center-canonical-item-test-plan';
import { buildProductCenterItemCategoryLeafRecipe } from '../utils/product-center-item-category-leaf-runtime';
import { scanGeneratedArtifacts } from '../utils/product-center-run-safety';

type ProbeObservation = {
  canonicalId: string;
  status: string;
  visibleUi: { parentName: string; leafName: string };
  locatorUniqueness: Record<string, number>;
  observableBehavior: {
    parentHasChildren: boolean;
    parentCommitted: boolean;
    leafCommitted: boolean;
  };
  network: { status: string; expectedPath: string };
  mutation: { attempted: boolean; saveAllowed: boolean };
};

export function buildProductCenterItemCategoryLeafRuntimeArtifacts(options: {
  projectRoot?: string;
  outputRoot?: string;
} = {}): { recipesPath: string } {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const canonicalRelease = readJson<{ cases: ProductCenterCanonicalCase[] }>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-canonical-release.json',
  ));
  const canonicalCase = canonicalRelease.cases.find((item) => item.canonicalId === 'TC-ITEM-STD-007');
  if (!canonicalCase) throw new Error('缺少 TC-ITEM-STD-007 canonical 用例');
  const proposal = readJson<any>(path.join(
    projectRoot,
    'output/test-case-audit/product-center/item-category-leaf-technical-proposal-latest.json',
  ));
  const observation = readJson<ProbeObservation>(path.join(
    projectRoot,
    'contracts/product-center/drift/product-center-item-category-leaf-probe-observation.json',
  ));
  validateObservation(observation);
  const recipe = buildProductCenterItemCategoryLeafRecipe({
    canonicalCase,
    proposal,
    parentName: observation.visibleUi.parentName,
    leafName: observation.visibleUi.leafName,
  });
  const issues = validateAutomationRecipe(recipe, productCenterRecipeCapabilityContracts);
  if (issues.length > 0) {
    throw new Error(`TC-ITEM-STD-007 Recipe 合同失败：${issues.map((item) => item.code).join(',')}`);
  }
  const fingerprint = createHash('sha256').update(stableStringify([recipe])).digest('hex');
  const document = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-category-leaf-probe',
    fingerprint,
    sourceObservationId: 'TC-ITEM-STD-007-current-release-read-only-probe',
    recipes: [recipe],
  };
  const recipesPath = path.join(
    outputRoot,
    'contracts/product-center/recipes/product-center-item-category-leaf-probe-recipes.json',
  );
  writeJson(recipesPath, document);
  const findings = scanGeneratedArtifacts(path.dirname(recipesPath));
  if (findings.length > 0) throw new Error(`TC-ITEM-STD-007 Recipe 敏感扫描失败：${findings.length}`);
  return { recipesPath };
}

function validateObservation(observation: ProbeObservation): void {
  if (observation.canonicalId !== 'TC-ITEM-STD-007'
    || observation.status !== 'observed-for-runtime-probe'
    || !observation.visibleUi.parentName
    || !observation.visibleUi.leafName
    || Object.values(observation.locatorUniqueness).some((count) => count !== 1)
    || observation.observableBehavior.parentHasChildren !== true
    || observation.observableBehavior.parentCommitted !== false
    || observation.observableBehavior.leafCommitted !== true
    || observation.network.status !== 'runtime-required'
    || observation.network.expectedPath !== '/ops-brand/brand-categories/treeList'
    || observation.mutation.attempted !== false
    || observation.mutation.saveAllowed !== false) {
    throw new Error('TC-ITEM-STD-007 当前页面观察合同不完整');
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const result = buildProductCenterItemCategoryLeafRuntimeArtifacts();
    process.stdout.write(`TC-ITEM-STD-007 Recipe：${result.recipesPath}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
