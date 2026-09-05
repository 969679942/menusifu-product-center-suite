import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import contractDocument from '../contracts/product-center/product-center-test-contract.json';
import existingSopCasesDocument from '../contracts/product-center/test-cases/product-center-existing-sop-cases.json';
import testCasePreflightDocument from '../output/test-case-audit/product-center/preflight-latest.json';
import { compileProductCenterPilotRecipes } from '../automation/recipe/product-center-recipe-compiler';
import { productCenterCreateSopCatalog } from '../sop/product-center/product-center-create-sop.catalog';
import { highDependencySopCatalog } from '../sop/product-center/product-center-high-dependency-sop.catalog';
import { lowDependencySopCatalog } from '../sop/product-center/product-center-low-dependency-sop.catalog';
import { productCenterNegativeSopCatalog } from '../sop/product-center/product-center-negative-sop.catalog';
import { productCenterSopCatalog } from '../sop/product-center/product-center-sop.catalog';
import type { ProductCenterTestContract } from '../utils/product-center-test-contract';

export async function buildProductCenterRecipeArtifacts(rootDir = process.cwd()): Promise<{
  fingerprint: string;
  recipePath: string;
  unresolvedPath: string;
}> {
  const result = compileProductCenterPilotRecipes({
    core: productCenterSopCatalog,
    create: productCenterCreateSopCatalog,
    lowDependency: lowDependencySopCatalog,
    highDependency: highDependencySopCatalog,
    negative: productCenterNegativeSopCatalog,
    contract: contractDocument as unknown as ProductCenterTestContract,
    claimIdsByCaseId: new Map((existingSopCasesDocument as {
      cases: Array<{ id: string; claims: Array<{ id: string }>; sourceIds: string[] }>;
    }).cases.map((item) => [item.id, item.claims.map((claim) => claim.id)])),
    sourceIdsByCaseId: new Map((existingSopCasesDocument as {
      cases: Array<{ id: string; sourceIds: string[] }>;
    }).cases.map((item) => [item.id, item.sourceIds])),
    generatedCaseIds: readGeneratedCaseIds(),
  });
  const outputDirectory = path.join(rootDir, 'contracts', 'product-center', 'recipes');
  const recipePath = path.join(outputDirectory, 'product-center-pilot-recipes.json');
  const unresolvedPath = path.join(outputDirectory, 'product-center-recipe-unresolved.json');
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeJson(recipePath, {
      schemaVersion: result.schemaVersion,
      fingerprint: result.fingerprint,
      recipes: result.recipes,
    }),
    writeJson(unresolvedPath, {
      schemaVersion: result.schemaVersion,
      fingerprint: result.fingerprint,
      unresolved: result.unresolved,
    }),
  ]);
  return { fingerprint: result.fingerprint, recipePath, unresolvedPath };
}

function readGeneratedCaseIds(): ReadonlySet<string> {
  const contract = contractDocument as unknown as ProductCenterTestContract;
  const preflight = testCasePreflightDocument as {
    schemaVersion?: string;
    contractVersion?: string;
    sourceFingerprint?: string;
    generationGate?: {
      generated?: Array<{ caseId?: string }>;
    };
  };
  if (preflight.schemaVersion !== '1.0.0'
    || preflight.contractVersion !== contract.metadata.contractVersion
    || preflight.sourceFingerprint !== contract.metadata.sourceFingerprint
    || !Array.isArray(preflight.generationGate?.generated)
    || preflight.generationGate.generated.some((item) => typeof item.caseId !== 'string')) {
    throw new Error('测试用例生成门禁与当前统一合同不一致，请先运行 build:product-center:test-case-ir');
  }
  return new Set(preflight.generationGate.generated.map((item) => item.caseId as string));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const result = await buildProductCenterRecipeArtifacts();
  process.stdout.write(`商品中心 Recipe 已生成：${result.fingerprint}\n${result.recipePath}\n${result.unresolvedPath}\n`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
