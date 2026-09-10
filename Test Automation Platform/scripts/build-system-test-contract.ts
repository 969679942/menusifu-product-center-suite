import fs from 'node:fs';
import path from 'node:path';
import type { AutomationRecipe } from '../src/automation/recipe/automation-recipe';
import {
  compileSystemTestRunContract,
  type SystemTestAdapterCatalog,
  type SystemTestManifest,
  type SystemTestRuleLedger,
} from '../src/automation/system-test/system-test-contract';
import { evaluateSystemTestOnboarding } from '../src/automation/system-test/system-test-onboarding';

type RecipeCollection = { fingerprint: string; recipes: AutomationRecipe[] };

export function buildSystemTestArtifacts(input: {
  rootDir?: string;
  manifestPath: string;
  outputDir?: string;
  availableExternalCapabilities?: readonly string[];
  caseIds?: readonly string[];
}) {
  const rootDir = path.resolve(input.rootDir ?? process.cwd());
  const manifestPath = path.resolve(rootDir, input.manifestPath);
  const sourceManifest = readJson<SystemTestManifest>(manifestPath);
  const selection = selectSystemTestManifestCases(sourceManifest, input.caseIds ?? []);
  const manifest = selection.manifest;
  const recipes = readJson<RecipeCollection>(path.resolve(rootDir, manifest.sources.recipeCollectionPath));
  const rules = readJson<SystemTestRuleLedger>(path.resolve(rootDir, manifest.sources.ruleLedgerPath));
  const adapters = readJson<SystemTestAdapterCatalog>(path.resolve(rootDir, manifest.sources.adapterCatalogPath));
  const result = compileSystemTestRunContract({
    rootDir,
    manifest,
    recipes: recipes.recipes,
    recipeCollectionFingerprint: recipes.fingerprint,
    rules,
    adapters,
  });
  const errors = [...new Set([...selection.errors, ...result.errors])].sort();
  const onboarding = evaluateSystemTestOnboarding({
    manifest,
    contract: result.contract,
    adapters,
    compileErrors: errors,
    availableExternalCapabilities: input.availableExternalCapabilities,
  });
  const outputDir = path.resolve(input.outputDir ?? path.join(rootDir, 'output/system-test', manifest.system.systemId, 'latest'));
  const contractPath = path.join(outputDir, 'contract.json');
  const onboardingPath = path.join(outputDir, 'onboarding.json');
  writeJson(contractPath, result.contract);
  writeJson(onboardingPath, onboarding);
  return { manifest, recipes, rules, adapters, contract: result.contract, errors, onboarding, contractPath, onboardingPath };
}

export function selectSystemTestManifestCases(
  manifest: SystemTestManifest,
  caseIds: readonly string[],
): { manifest: SystemTestManifest; errors: string[] } {
  const selectedIds = [...new Set(caseIds.map((caseId) => caseId.trim()).filter(Boolean))];
  if (selectedIds.length === 0) return { manifest: structuredClone(manifest), errors: [] };
  const knownIds = new Set(manifest.cases.map((item) => item.caseId));
  const unknownIds = selectedIds.filter((caseId) => !knownIds.has(caseId));
  return {
    manifest: {
      ...structuredClone(manifest),
      cases: manifest.cases.filter((item) => selectedIds.includes(item.caseId)).map((item) => ({ ...item })),
    },
    errors: unknownIds.map((caseId) => `CASE_SELECTION_UNKNOWN:${caseId}`),
  };
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

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

if (require.main === module) {
  const manifestPath = argument('manifest');
  if (!manifestPath) throw new Error('缺少 --manifest=<path>');
  const artifacts = buildSystemTestArtifacts({
    manifestPath,
    availableExternalCapabilities: (process.env.SYSTEM_TEST_EXTERNAL_CAPABILITIES ?? '').split(',').filter(Boolean),
  });
  process.stdout.write(`跨系统测试合同：${artifacts.contractPath}\n`);
  process.stdout.write(`接入状态：${artifacts.onboarding.status}\n`);
  if (artifacts.errors.length > 0) {
    process.stderr.write(`${artifacts.errors.join('\n')}\n`);
    process.exitCode = 2;
  }
}


