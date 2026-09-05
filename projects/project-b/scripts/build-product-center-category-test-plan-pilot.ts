import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import contractDocument from '../contracts/product-center/product-center-test-contract.json';
import { productCenterCoverageCuration } from '../contracts/product-center/test-cases/product-center-coverage-curation';
import { productCenterContractModules } from '../contracts/product-center/modules';
import { compileProductCenterPilotRecipes } from '../automation/recipe/product-center-recipe-compiler';
import { productCenterCreateSopCatalog } from '../sop/product-center/product-center-create-sop.catalog';
import { highDependencySopCatalog } from '../sop/product-center/product-center-high-dependency-sop.catalog';
import { lowDependencySopCatalog } from '../sop/product-center/product-center-low-dependency-sop.catalog';
import { productCenterNegativeSopCatalog } from '../sop/product-center/product-center-negative-sop.catalog';
import { productCenterSopCatalog } from '../sop/product-center/product-center-sop.catalog';
import { buildProductCenterCoverageDenominator } from '../utils/product-center-coverage-denominator';
import {
  productCenterContractCollections,
  type ProductCenterTestContract,
} from '../utils/product-center-test-contract';
import {
  processProductCenterTestCaseIntake,
  type ProductCenterBusinessBasisKind,
  type ProductCenterClaimSourceTrace,
  type ProductCenterTestCaseDraft,
  type ProductCenterTestCaseDraftClaim,
  type ProductCenterTestCaseSourceBinding,
} from '../utils/product-center-test-case-ir';
import { parseProductCenterMarkdownTestCase } from '../utils/product-center-test-plan-markdown';
import {
  verifyProductCenterPrdCitation,
  verifyProductCenterXmindCitation,
} from '../utils/product-center-source-citation';

const canonicalCaseId = 'negative:category-child-blocked-by-product';
const externalCaseId = 'TC-需求1-150';
const categoryRoute = '/pp/brand/category';
const formalRuleId = 'rule:category-child-blocked-by-product';
const routeId = 'route:b0de43a7ecd9';
const categoryControlId = '/pp/brand/category#control-1';
const categoryMappingId = 'mapping:1e3f83ff2788';
const testPlanFileName = '1.需求品牌商品与分类-测试用例.md';
const prdFileName = '1.需求品牌商品与分类.md';
const xmindFileName = '1.商品中心-商品管理-商品.xmind';

export async function buildProductCenterCategoryTestPlanPilotArtifacts(
  rootDir = process.cwd(),
): Promise<{
  inputPath: string;
  bindingsPath: string;
  reportPath: string;
  recipePath: string;
}> {
  const projectRoot = path.resolve(__dirname, '..');
  const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info');
  const testPlanPath = path.join(infoRoot, 'PRD与对应测试用例', testPlanFileName);
  const prdPath = path.join(infoRoot, 'PRD与对应测试用例', prdFileName);
  const xmindPath = path.join(
    infoRoot,
    '00-待转换测试方案',
    '用例库',
    '商品中心-商品管理-商品',
    xmindFileName,
  );
  const [testPlanContent, prdContent, xmindContent] = await Promise.all([
    readFile(testPlanPath),
    readFile(prdPath),
    readFile(xmindPath),
  ]);
  const parsed = parseProductCenterMarkdownTestCase(testPlanContent.toString('utf8'), externalCaseId);
  const sourceCitationVerifications = verifySourceCitations(
    parsed.sourceCitations,
    prdContent.toString('utf8'),
    xmindContent,
  );
  const contract = contractDocument as unknown as ProductCenterTestContract;
  const knownSourceIds = new Set(productCenterContractCollections
    .filter((collection) => collection !== 'traceability')
    .flatMap((collection) => (contract[collection] ?? []).map((record) => record.id)));
  [formalRuleId, routeId, categoryControlId, categoryMappingId].forEach((sourceId) => {
    if (!knownSourceIds.has(sourceId)) throw new Error(`真实方案试点缺少统一合同来源：${sourceId}`);
  });

  const refs = sourceRefs(parsed.sourceCitations);
  const claims = buildClaims(parsed, refs);
  const draft: ProductCenterTestCaseDraft = {
    id: canonicalCaseId,
    module: 'brand-item',
    route: categoryRoute,
    title: parsed.title,
    priority: parsed.priority,
    sourceRefs: [refs.testPlan, refs.prd, refs.xmind],
    preconditions: parsed.preconditions,
    actions: parsed.actions,
    expectedResults: parsed.expectedResults,
    mutatesData: false,
    cleanup: ['通过 API 清理商品与分类测试数据并验证零残留'],
    automationPreference: 'candidate',
    claims,
    coverageIds: ['coverage:control:category-add-child'],
    execution: {
      roleIds: ['merchant-center-product-admin'],
      environmentIds: ['balamxqa'],
      capabilityIds: [
        'navigation.sidebar.open',
        'category.attemptAddChildBlockedByProduct',
      ],
      mutationMode: 'api-seeded-ui-action',
      verificationSignals: ['api', 'ui'],
      seedAdapterIds: ['productCenter.seedCategoryWithProduct'],
      cleanupAdapterIds: ['productCenter.cleanupSeed'],
      asyncPolicy: 'none',
    },
  };
  const bindings: ProductCenterTestCaseSourceBinding[] = [
    { ref: refs.testPlan, sourceIds: [formalRuleId] },
    { ref: refs.prd, sourceIds: [formalRuleId] },
    { ref: refs.xmind, sourceIds: [formalRuleId] },
  ];
  const denominator = buildProductCenterCoverageDenominator(contract, {
    moduleForRoute: resolveModule,
    coverageGroups: productCenterCoverageCuration,
  });
  const document = { schemaVersion: '1.0.0' as const, cases: [draft] };
  const result = processProductCenterTestCaseIntake(document, bindings, {
    scope: 'case-only',
    knownSourceIds,
    denominator: denominator.items,
    knownRoleIds: new Set(draft.execution.roleIds),
    knownEnvironmentIds: new Set(draft.execution.environmentIds),
    knownCapabilityIds: new Set(draft.execution.capabilityIds),
    requireSourceTrace: true,
  });
  if (result.status !== 'passed' || result.generationGate?.generated.length !== 1) {
    throw new Error('真实商品分类测试方案未通过生成门禁');
  }

  const compileResult = compileProductCenterPilotRecipes({
    core: productCenterSopCatalog,
    create: productCenterCreateSopCatalog,
    lowDependency: lowDependencySopCatalog,
    highDependency: highDependencySopCatalog,
    negative: productCenterNegativeSopCatalog,
    contract,
    generatedCaseIds: new Set(result.generationGate.generated.map((item) => item.caseId)),
    claimIdsByCaseId: new Map([[canonicalCaseId, claims.map((claim) => claim.id)]]),
  });
  const recipe = compileResult.recipes.find((item) => item.caseId === canonicalCaseId);
  if (!recipe) throw new Error('真实商品分类测试方案未映射到现有 Recipe');

  const inputPath = path.join(
    rootDir,
    'contracts/product-center/test-cases/pilots/category-test-plan-test-case.json',
  );
  const bindingsPath = path.join(
    rootDir,
    'contracts/product-center/test-cases/pilots/category-test-plan-source-bindings.json',
  );
  const reportPath = path.join(
    rootDir,
    'output/test-case-audit/product-center/category-test-plan-pilot-latest.json',
  );
  const recipePath = path.join(
    rootDir,
    'contracts/product-center/recipes/product-center-category-test-plan-pilot-recipe.json',
  );
  const sourceArtifacts = [
    artifact(infoRoot, testPlanPath, testPlanContent),
    artifact(infoRoot, prdPath, prdContent),
    artifact(infoRoot, xmindPath, xmindContent),
  ];
  await Promise.all([
    writeJson(inputPath, document),
    writeJson(bindingsPath, { schemaVersion: '1.0.0', bindings }),
    writeJson(recipePath, recipe),
    writeJson(reportPath, {
      schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      contractVersion: contract.metadata.contractVersion,
      sourceFingerprint: contract.metadata.sourceFingerprint,
      sourceArtifacts,
      sourceCitationVerifications,
      externalCaseId,
      canonicalCaseId,
      ...result,
      recipeMapping: {
        recipeId: recipe.id,
        caseId: recipe.caseId,
        capabilityIds: recipe.capabilities.map((item) => item.id),
      },
    }),
  ]);
  return { inputPath, bindingsPath, reportPath, recipePath };
}

function buildClaims(
  parsed: ReturnType<typeof parseProductCenterMarkdownTestCase>,
  refs: ReturnType<typeof sourceRefs>,
): ProductCenterTestCaseDraftClaim[] {
  return [
    ...parsed.preconditions.map((text, index) => claim(
      'precondition',
      text,
      index,
      'xmind-existing',
      [refs.testPlan, refs.xmind],
      [formalRuleId],
    )),
    ...parsed.actions.map((text, index) => claim(
      'action',
      text,
      index,
      'xmind-existing',
      [refs.testPlan, refs.xmind],
      [index === 0 ? routeId : categoryControlId],
    )),
    ...parsed.expectedResults.map((text, index) => claim(
      'expectation',
      text,
      index,
      index === 0 ? 'prd-explicit' : 'xmind-existing',
      [refs.testPlan, index === 0 ? refs.prd : refs.xmind],
      [index === 0 ? formalRuleId : categoryMappingId],
    )),
  ];
}

function claim(
  kind: ProductCenterTestCaseDraftClaim['kind'],
  text: string,
  index: number,
  basisKind: Extract<ProductCenterBusinessBasisKind, 'prd-explicit' | 'xmind-existing'>,
  businessRefs: string[],
  executionSourceIds: string[],
): ProductCenterTestCaseDraftClaim {
  const sourceTrace: ProductCenterClaimSourceTrace = {
    businessBasis: {
      kind: basisKind,
      refs: businessRefs,
    },
    executionEvidence: [{
      kind: 'contract-observed',
      sourceIds: executionSourceIds,
    }],
  };
  return {
    id: `claim:${canonicalCaseId}:${kind}:${index + 1}`,
    kind,
    text,
    sourceRefs: businessRefs,
    evidenceLevel: 'confirmed',
    sourceTrace,
  };
}

function sourceRefs(citations: ReturnType<typeof parseProductCenterMarkdownTestCase>['sourceCitations']) {
  const prd = citations.find((item) => item.kind === 'prd-explicit');
  const xmind = citations.find((item) => item.kind === 'xmind-existing');
  if (!prd || !xmind) throw new Error('真实商品分类测试方案必须同时具备 PRD 与 XMind 来源');
  return {
    testPlan: `TEST-PLAN:${testPlanFileName}#${externalCaseId}`,
    prd: `PRD:${prdFileName}#${prd.citation}`,
    xmind: `XMIND:${xmindFileName}#${xmind.citation}`,
  };
}

function verifySourceCitations(
  citations: ReturnType<typeof parseProductCenterMarkdownTestCase>['sourceCitations'],
  prdContent: string,
  xmindContent: Buffer,
) {
  const prd = citations.find((item) => item.kind === 'prd-explicit');
  const xmind = citations.find((item) => item.kind === 'xmind-existing');
  if (!prd || !xmind) throw new Error('真实商品分类测试方案必须同时具备 PRD 与 XMind 来源');
  return [
    verifyProductCenterPrdCitation(prdContent, {
      citation: prd.citation,
      sectionHeading: 'S04 分类',
      itemNumber: 3,
      itemIndent: 2,
      expectedText: '商品只能添加到叶子分类下，即分类下有商品不能再添加子分类。',
    }),
    verifyProductCenterXmindCitation(xmindContent, {
      citation: xmind.citation,
      expectedPath: [
        '标准商品',
        '新增',
        '分类相关校验（一级分类下有商品不可建二级分类/有二级分类不可建标准商品）',
        '一级分类下有商品，不可创建二级分类',
      ],
    }),
  ];
}

function artifact(root: string, filePath: string, content: Buffer) {
  return {
    path: path.relative(root, filePath).replace(/\\/g, '/'),
    fingerprint: createHash('sha256').update(content).digest('hex'),
  };
}

function resolveModule(route: string): string {
  const matches = productCenterContractModules.filter((module) =>
    module.routes.includes(route as never));
  if (matches.length !== 1) {
    throw new Error(`真实方案试点路由必须唯一归属模块：${route}`);
  }
  return matches[0].id;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const result = await buildProductCenterCategoryTestPlanPilotArtifacts();
  process.stdout.write(
    `商品分类真实测试方案试点已生成：\n${result.inputPath}\n${result.bindingsPath}\n${result.reportPath}\n${result.recipePath}\n`,
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
