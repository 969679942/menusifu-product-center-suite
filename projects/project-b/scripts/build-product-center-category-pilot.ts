import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import contractDocument from '../contracts/product-center/product-center-test-contract.json';
import { productCenterContractModules } from '../contracts/product-center/modules';
import { productCenterCoverageCuration } from '../contracts/product-center/test-cases/product-center-coverage-curation';
import { compileProductCenterPilotRecipes } from '../automation/recipe/product-center-recipe-compiler';
import { productCenterCreateSopCatalog } from '../sop/product-center/product-center-create-sop.catalog';
import { highDependencySopCatalog } from '../sop/product-center/product-center-high-dependency-sop.catalog';
import { lowDependencySopCatalog } from '../sop/product-center/product-center-low-dependency-sop.catalog';
import { productCenterNegativeSopCatalog } from '../sop/product-center/product-center-negative-sop.catalog';
import { productCenterSopCatalog } from '../sop/product-center/product-center-sop.catalog';
import { buildProductCenterTestCaseIrCatalog } from '../sop/product-center/product-center-test-case-ir.catalog';
import { buildProductCenterCoverageDenominator } from '../utils/product-center-coverage-denominator';
import {
  productCenterContractCollections,
  type ProductCenterTestContract,
} from '../utils/product-center-test-contract';
import {
  processProductCenterTestCaseIntake,
  type ProductCenterTestCaseDraft,
  type ProductCenterTestCaseDraftDocument,
  type ProductCenterTestCaseInput,
  type ProductCenterTestCaseSourceBinding,
} from '../utils/product-center-test-case-ir';

const categoryRoute = '/pp/brand/category';
const formalCaseId = 'TC-ITEM-STD-035';
const formalRuleId = 'rule:category-child-blocked-by-product';
const formalRecipeCaseId = 'negative:category-child-blocked-by-product';

export async function buildProductCenterCategoryPilotArtifacts(rootDir = process.cwd()): Promise<{
  inputPath: string;
  bindingsPath: string;
  reportPath: string;
}> {
  const contract = contractDocument as unknown as ProductCenterTestContract;
  assertFormalRule(contract);
  const compileResult = compileProductCenterPilotRecipes({
    core: productCenterSopCatalog,
    create: productCenterCreateSopCatalog,
    lowDependency: lowDependencySopCatalog,
    highDependency: highDependencySopCatalog,
    negative: productCenterNegativeSopCatalog,
    contract,
  });
  if (compileResult.unresolved.length > 0) {
    throw new Error(`分类试点 Recipe 存在未决项：${compileResult.unresolved.map((item) => item.caseId).join(', ')}`);
  }
  const categoryCases = buildProductCenterTestCaseIrCatalog({ recipes: compileResult.recipes })
    .filter((item) => item.route === categoryRoute)
    .map(promoteFormalCategoryCase);
  const drafts = categoryCases.map(toDraft);
  const bindings = categoryCases.flatMap(toBindings);
  const document: ProductCenterTestCaseDraftDocument = { schemaVersion: '1.0.0', cases: drafts };
  const denominator = buildProductCenterCoverageDenominator(contract, {
    moduleForRoute: resolveModule,
    coverageGroups: productCenterCoverageCuration,
  });
  const knownSourceIds = new Set(productCenterContractCollections
    .filter((collection) => collection !== 'traceability')
    .flatMap((collection) => (contract[collection] ?? []).map((record) => record.id)));
  const result = processProductCenterTestCaseIntake(document, bindings, {
    scope: 'module-full',
    moduleIds: new Set(['brand-item']),
    routes: new Set([categoryRoute]),
    knownSourceIds,
    denominator: denominator.items,
    knownRoleIds: new Set(categoryCases.flatMap((item) => item.execution?.roleIds ?? [])),
    knownEnvironmentIds: new Set(categoryCases.flatMap((item) => item.execution?.environmentIds ?? [])),
    knownCapabilityIds: new Set(categoryCases.flatMap((item) => item.execution?.capabilityIds ?? [])),
  });
  const inputPath = path.join(
    rootDir,
    'contracts/product-center/test-cases/pilots/category-route-test-cases.json',
  );
  const bindingsPath = path.join(
    rootDir,
    'contracts/product-center/test-cases/pilots/category-route-source-bindings.json',
  );
  const reportPath = path.join(
    rootDir,
    'output/test-case-audit/product-center/category-route-pilot-latest.json',
  );
  await Promise.all([
    writeJson(inputPath, document),
    writeJson(bindingsPath, { schemaVersion: '1.0.0', bindings }),
    writeJson(reportPath, {
      schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      contractVersion: contract.metadata.contractVersion,
      sourceFingerprint: contract.metadata.sourceFingerprint,
      scope: 'module-full',
      modules: ['brand-item'],
      routes: [categoryRoute],
      ...result,
    }),
  ]);
  if (result.status !== 'passed') {
    throw new Error(`商品分类模块全量试点未通过，详见 ${reportPath}`);
  }
  return { inputPath, bindingsPath, reportPath };
}

function toDraft(testCase: ProductCenterTestCaseInput): ProductCenterTestCaseDraft {
  return {
    id: testCase.id,
    module: testCase.module,
    route: testCase.route,
    title: testCase.title,
    priority: testCase.priority,
    sourceRefs: [caseRef(testCase.id)],
    preconditions: testCase.preconditions,
    actions: testCase.actions,
    expectedResults: testCase.expectedResults,
    mutatesData: testCase.mutatesData,
    cleanup: testCase.cleanup,
    automationPreference: testCase.automationPreference ?? 'candidate',
    claims: (testCase.claims ?? []).map((claim, index) => ({
      id: claim.id,
      kind: claim.kind,
      text: claim.text,
      sourceRefs: [claimRef(testCase.id, index)],
      evidenceLevel: claim.evidenceLevel,
      sourceTrace: claim.sourceTrace,
    })),
    coverageIds: testCase.coverageIds ?? [],
    execution: testCase.execution!,
  };
}

function toBindings(testCase: ProductCenterTestCaseInput): ProductCenterTestCaseSourceBinding[] {
  return [
    { ref: caseRef(testCase.id), sourceIds: testCase.sourceIds },
    ...(testCase.claims ?? []).map((claim, index) => ({
      ref: claimRef(testCase.id, index),
      sourceIds: claim.sourceIds,
    })),
  ];
}

function promoteFormalCategoryCase(testCase: ProductCenterTestCaseInput): ProductCenterTestCaseInput {
  if (testCase.id !== formalRecipeCaseId) return testCase;
  if (!testCase.sourceIds.includes(formalRuleId)) {
    throw new Error(`${formalRecipeCaseId} 未绑定正式规则 ${formalRuleId}`);
  }
  return {
    ...testCase,
    id: formalCaseId,
    priority: 'P1',
    claims: testCase.claims?.map((claim) => ({
      ...claim,
      id: claim.id.replace(formalRecipeCaseId, formalCaseId),
    })),
  };
}

function caseRef(caseId: string): string {
  return `recipe:${caseId}`;
}

function claimRef(caseId: string, index: number): string {
  return `recipe:${caseId}:claim:${index + 1}`;
}

function assertFormalRule(contract: ProductCenterTestContract): void {
  if (!(contract.businessRules ?? []).some((record) => record.id === formalRuleId)) {
    throw new Error(`统一合同缺少正式用例规则：${formalRuleId}，请先运行 build:product-center:contract`);
  }
}

function resolveModule(route: string): string {
  const matches = productCenterContractModules.filter((module) => module.routes.includes(route as never));
  if (matches.length !== 1) {
    throw new Error(`覆盖分母路由必须唯一归属合同模块：${route}，实际 ${matches.length} 个`);
  }
  return matches[0].id;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const result = await buildProductCenterCategoryPilotArtifacts();
  process.stdout.write(`商品分类模块全量试点已生成：\n${result.inputPath}\n${result.bindingsPath}\n${result.reportPath}\n`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
