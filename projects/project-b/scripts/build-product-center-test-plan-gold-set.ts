import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  productCenterSourceMaterialModuleRoot,
  productCenterTestPlanModuleRoot,
} from '../utils/product-center-test-plan-source';
import contractDocument from '../contracts/product-center/product-center-test-contract.json';
import { productCenterCoverageCuration } from '../contracts/product-center/test-cases/product-center-coverage-curation';
import { productCenterContractModules } from '../contracts/product-center/modules';
import { compileProductCenterPilotRecipes } from '../automation/recipe/product-center-recipe-compiler';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import { productCenterRecipeCapabilityContracts } from '../adapters/product-center/product-center-recipe-capabilities';
import { productCenterCreateSopCatalog } from '../sop/product-center/product-center-create-sop.catalog';
import { highDependencySopCatalog } from '../sop/product-center/product-center-high-dependency-sop.catalog';
import { lowDependencySopCatalog } from '../sop/product-center/product-center-low-dependency-sop.catalog';
import { productCenterNegativeSopCatalog } from '../sop/product-center/product-center-negative-sop.catalog';
import { productCenterSopCatalog } from '../sop/product-center/product-center-sop.catalog';
import { buildProductCenterCoverageDenominator } from '../utils/product-center-coverage-denominator';
import {
  processProductCenterTestCaseIntake,
  type ProductCenterClaimSourceTrace,
  type ProductCenterTestCaseDraft,
  type ProductCenterTestCaseDraftClaim,
  type ProductCenterTestCaseGenerationGate,
  type ProductCenterTestCaseSourceBinding,
} from '../utils/product-center-test-case-ir';
import {
  productCenterContractCollections,
  type ProductCenterTestContract,
} from '../utils/product-center-test-contract';
import { parseProductCenterMarkdownTestCase } from '../utils/product-center-test-plan-markdown';
import {
  verifyProductCenterBusinessRuleCitation,
  verifyProductCenterXmindCitation,
  type ProductCenterSourceCitationVerification,
} from '../utils/product-center-source-citation';
import { evaluateProductCenterGenerationQuality } from '../utils/product-center-generation-quality';
import { buildProductCenterTestCaseReviewQueue } from '../utils/product-center-test-case-review-queue';
import { buildProductCenterCategoryTestPlanPilotArtifacts } from './build-product-center-category-test-plan-pilot';
import { generateProductCenterTestPlanGoldSetRecipeSpec } from './generate-product-center-recipe-spec';

const seasoningCaseId = 'create:seasoning';
const seasoningExternalCaseId = 'TC-FLV-SEA-018';
const seasoningRoute = '/pp/brand/seasoning/list';
const seasoningRouteSourceId = 'route:a8e0b800fdf2';
const seasoningCreateControlId = '/pp/brand/seasoning/list#control-3';
const seasoningCreateOperationId = 'operation:brand-menu:POST /ops-brand/brand-modifiers';
const seasoningReadOperationId = 'operation:brand-menu:GET /ops-brand/brand-modifiers/page';
const seasoningTestPlanFileName = '3.商品中心-商品管理-调味管理-正式测试用例.md';
const seasoningXmindFileName = '3.商品中心-商品管理-调味管理.xmind';
const methodDetailCaseId = 'review:method-detail-max-length';
const methodDetailExternalCaseId = 'TC-需求4-018';
const methodDetailTestPlanFileName = '4.需求做法组-测试用例.md';
const methodRoute = '/pp/brand/option-group/method';
const methodRouteSourceId = 'route:b0c3b84b758f';
const methodDetailCapabilityId = 'methodDetail.enforceNameMaxLength';
const methodCreateOperationId = 'operation:brand-menu:POST /ops-brand/brand-modifiers';
const methodDetailOperationId = 'operation:brand-menu:GET /ops-brand/brand-modifiers/{id}';
const groupTestPlanFileName = '2.商品中心-商品管理-组-正式测试用例.md';
const groupXmindFileName = '2.商品中心-商品管理-组.xmind';
const descriptionTagCaseId = 'delete:description-tag';
const descriptionTagExternalCaseId = 'TC-TAG-DESC-017';
const descriptionTagRoute = '/pp/brand/tag/description';
const descriptionTagRouteSourceId = 'route:e2cf16e67e4c';
const descriptionTagDeleteControlId = '/pp/brand/tag/description#control-1';
const tagTestPlanFileName = '4.商品中心-商品管理-标签管理-正式测试用例.md';
const tagXmindFileName = '4.商品中心-商品管理-标签管理.xmind';
const bomCaseId = 'create:bom';
const printStallCaseId = 'delete:print-stall';
const menuCaseId = 'delete:menu';
const taxCaseId = 'delete:tax';
const storeProductCaseId = 'read:store-product-search';
const storeProductRoute = '/poi/location/prod-list';
const storeProductRouteSourceId = 'route:2a967315eebe';
const storeProductSearchOperationId = 'operation:brand-menu:POST /ops-poi/poi-items/pageQuery';
const itemStandardZeroPriceCaseId = 'create:item-standard-single-zero-price';
const itemStandardZeroPriceExternalCaseId = 'TC-ITEM-STD-015';
const itemComboRequiredOnlyCaseId = 'create:item-combo-required-only';
const itemComboRequiredOnlyExternalCaseId = 'TC-ITEM-PKG-009';
const itemRoute = '/pp/brand/list';
const itemRouteSourceId = 'route:cc612d39a954';
const itemCreateControlId = '/pp/brand/list#control-3';
const itemCreateOperationId = 'operation:brand-menu:POST /ops-brand/brand-items/standard';
const itemComboCreateOperationId = 'operation:brand-menu:POST /ops-brand/brand-items/combo';
const comboGroupCreateOperationId = 'operation:brand-menu:POST /ops-brand/brand-sections';
const comboGroupListOperationId = 'operation:brand-menu:GET /ops-brand/brand-sections/list';
const comboGroupDeleteOperationId = 'operation:brand-menu:DELETE /ops-brand/brand-sections/{id}';
const itemReadOperationId = 'operation:brand-menu:POST /ops-brand/brand-items/pageQuery';
const itemDetailOperationId = 'operation:brand-menu:GET /ops-brand/brand-items/{id}';
const itemDeleteOperationId = 'operation:brand-menu:DELETE /ops-brand/brand-items/delete';
const itemTestPlanFileName = '1.商品中心-商品管理-商品-正式测试用例.md';
const itemXmindFileName = '1.商品中心-商品管理-商品.xmind';
const knownRecipeCapabilityIds = new Set(
  productCenterRecipeCapabilityContracts.map((capability) => capability.id),
);
const goldGenerationExpectations = [
  { caseId: 'negative:category-child-blocked-by-product', expectedDecision: 'generated' as const },
  { caseId: seasoningCaseId, expectedDecision: 'generated' as const },
  { caseId: methodDetailCaseId, expectedDecision: 'generated' as const },
  { caseId: descriptionTagCaseId, expectedDecision: 'generated' as const },
  { caseId: bomCaseId, expectedDecision: 'generated' as const },
  { caseId: printStallCaseId, expectedDecision: 'generated' as const },
  { caseId: menuCaseId, expectedDecision: 'generated' as const },
  { caseId: taxCaseId, expectedDecision: 'generated' as const },
  { caseId: storeProductCaseId, expectedDecision: 'generated' as const },
  { caseId: itemStandardZeroPriceCaseId, expectedDecision: 'generated' as const },
  { caseId: itemComboRequiredOnlyCaseId, expectedDecision: 'generated' as const },
];

export async function buildProductCenterTestPlanGoldSetArtifacts(
  rootDir = process.cwd(),
): Promise<{
  documentPath: string;
  bindingsPath: string;
  reportPath: string;
  recipesPath: string;
  reviewQueuePath: string;
  specPath: string;
}> {
  const categoryPaths = await buildProductCenterCategoryTestPlanPilotArtifacts(rootDir);
  const [categoryDocument, categoryBindings, categoryReport, categoryRecipe] = await Promise.all([
    readJson(categoryPaths.inputPath),
    readJson(categoryPaths.bindingsPath),
    readJson(categoryPaths.reportPath),
    readJson(categoryPaths.recipePath),
  ]);
  const seasoning = await buildSeasoningPilot();
  const methodDetail = await buildMethodDetailBoundaryReview();
  const descriptionTag = await buildDescriptionTagDeleteGold();
  const runtimeProof = await loadMainRuntimeProof();
  const [bom, printStall, menu, tax] = await Promise.all([
    buildBomCreateGold(runtimeProof),
    buildPrintStallDeleteGold(runtimeProof),
    buildMenuDeleteGold(runtimeProof),
    buildTaxDeleteGold(runtimeProof),
  ]);
  const storeProduct = await buildStoreProductSearchGold();
  const itemStandardZeroPrice = await buildItemStandardSingleZeroPriceGold();
  const itemComboRequiredOnly = await buildItemComboRequiredOnlyGold();
  const formalSopGold = [bom, printStall, menu, tax];
  const cases = [
    categoryDocument.cases[0],
    seasoning.draft,
    methodDetail.draft,
    descriptionTag.draft,
    ...formalSopGold.map((item) => item.draft),
    storeProduct.draft,
    itemStandardZeroPrice.draft,
    itemComboRequiredOnly.draft,
  ];
  const bindings = [
    ...categoryBindings.bindings,
    ...seasoning.bindings,
    ...methodDetail.bindings,
    ...descriptionTag.bindings,
    ...formalSopGold.flatMap((item) => item.bindings),
    ...storeProduct.bindings,
    ...itemStandardZeroPrice.bindings,
    ...itemComboRequiredOnly.bindings,
  ];
  const recipes = [
    categoryRecipe,
    seasoning.recipe,
    methodDetail.recipe,
    descriptionTag.recipe,
    ...formalSopGold.map((item) => item.recipe),
    storeProduct.recipe,
    itemStandardZeroPrice.recipe,
    itemComboRequiredOnly.recipe,
  ]
    .filter((recipe): recipe is AutomationRecipe => recipe !== undefined)
    .map((recipe) => ({
      ...recipe,
      id: `product-center:test-plan-gold-set:${recipe.caseId}`,
    }));
  const sourceArtifacts = uniqueByPath([
    ...categoryReport.sourceArtifacts,
    ...seasoning.sourceArtifacts,
    ...methodDetail.sourceArtifacts,
    ...descriptionTag.sourceArtifacts,
    ...formalSopGold.flatMap((item) => item.sourceArtifacts),
    ...storeProduct.sourceArtifacts,
    ...itemStandardZeroPrice.sourceArtifacts,
    ...itemComboRequiredOnly.sourceArtifacts,
    ...runtimeProof.sourceArtifacts,
  ]);
  const sourceCitationVerifications = [
    ...categoryReport.sourceCitationVerifications,
    seasoning.sourceCitationVerification,
    ...methodDetail.sourceCitationVerifications,
    descriptionTag.sourceCitationVerification,
    ...formalSopGold.flatMap((item) => item.sourceCitationVerifications),
    storeProduct.sourceCitationVerification,
    itemStandardZeroPrice.sourceCitationVerification,
    itemComboRequiredOnly.sourceCitationVerification,
  ];
  const generationGate = mergeGenerationGates([
    categoryReport.generationGate,
    seasoning.intake.generationGate,
    methodDetail.intake.generationGate,
    descriptionTag.intake.generationGate,
    ...formalSopGold.map((item) => item.intake.generationGate),
    storeProduct.intake.generationGate,
    itemStandardZeroPrice.intake.generationGate,
    itemComboRequiredOnly.intake.generationGate,
  ]);
  const normalizedCases = [
    ...categoryReport.normalizedCases,
    ...seasoning.intake.normalizedCases,
    ...methodDetail.intake.normalizedCases,
    ...descriptionTag.intake.normalizedCases,
    ...formalSopGold.flatMap((item) => item.intake.normalizedCases),
    ...storeProduct.intake.normalizedCases,
    ...itemStandardZeroPrice.intake.normalizedCases,
    ...itemComboRequiredOnly.intake.normalizedCases,
  ];
  const recipeMappings = recipes.map((recipe) => ({
    recipeId: recipe.id,
    caseId: recipe.caseId,
    capabilityIds: recipe.capabilities.map((item: { id: string }) => item.id),
  }));
  const fingerprint = createHash('sha256').update(JSON.stringify({
    sourceArtifacts,
    sourceCitationVerifications,
    cases,
    recipes,
  })).digest('hex');
  const reviewQueue = buildProductCenterTestCaseReviewQueue({
    collectionId: 'product-center-test-plan-gold-set',
    fingerprint,
    reviewRequired: generationGate.reviewRequired,
    cases: normalizedCases,
    knownCapabilityIds: knownRecipeCapabilityIds,
  });
  const generationQuality = evaluateProductCenterGenerationQuality({
    expectations: goldGenerationExpectations,
    actualDecisions: [
      ...generationGate.generated.map((item) => ({
        caseId: item.caseId,
        decision: 'generated' as const,
      })),
      ...generationGate.reviewRequired.map((item) => ({
        caseId: item.caseId,
        decision: 'review-required' as const,
      })),
    ],
  });

  const documentPath = path.join(
    rootDir,
    'contracts/product-center/test-cases/pilots/product-center-test-plan-gold-set.json',
  );
  const bindingsPath = path.join(
    rootDir,
    'contracts/product-center/test-cases/pilots/product-center-test-plan-gold-set-source-bindings.json',
  );
  const reportPath = path.join(
    rootDir,
    'output/test-case-audit/product-center/test-plan-gold-set-latest.json',
  );
  const recipesPath = path.join(
    rootDir,
    'contracts/product-center/recipes/product-center-test-plan-gold-set-recipes.json',
  );
  const reviewQueuePath = path.join(
    rootDir,
    'output/test-case-audit/product-center/test-plan-gold-set-review-queue.json',
  );
  const generatedAt = new Date().toISOString();
  await Promise.all([
    writeJson(documentPath, { schemaVersion: '1.0.0', fingerprint, cases }),
    writeJson(bindingsPath, { schemaVersion: '1.0.0', fingerprint, bindings }),
    writeJson(recipesPath, { schemaVersion: '1.0.0', fingerprint, recipes }),
    writeJson(reviewQueuePath, { ...reviewQueue, generatedAt }),
    writeJson(reportPath, {
      schemaVersion: '1.0.0',
      fingerprint,
      generatedAt,
      status: generationGate.status,
      sourceArtifacts,
      sourceCitationVerifications,
      normalizedCases,
      generationGate,
      generationQuality,
      normalizationDecisions: [
        itemStandardZeroPrice.normalizationDecision,
        itemComboRequiredOnly.normalizationDecision,
      ],
      reviewQueueSummary: reviewQueue.summary,
      recipeMappings,
    }),
  ]);
  const specPath = await generateProductCenterTestPlanGoldSetRecipeSpec(rootDir);
  return { documentPath, bindingsPath, reportPath, recipesPath, reviewQueuePath, specPath };
}

async function buildItemStandardSingleZeroPriceGold() {
  const projectRoot = path.resolve(__dirname, '..');
  const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info');
  const sourceRoot = productCenterTestPlanModuleRoot(infoRoot, 'item');
  const sourceMaterialRoot = productCenterSourceMaterialModuleRoot(infoRoot, 'item');
  const testPlanPath = path.join(sourceRoot, itemTestPlanFileName);
  const xmindPath = path.join(sourceMaterialRoot, itemXmindFileName);
  const [testPlanContent, xmindContent] = await Promise.all([
    readFile(testPlanPath),
    readFile(xmindPath),
  ]);
  const parsed = parseProductCenterMarkdownTestCase(
    testPlanContent.toString('utf8'),
    itemStandardZeroPriceExternalCaseId,
  );
  const xmindCitation = parsed.sourceCitations.find((item) => item.kind === 'xmind-existing');
  if (!xmindCitation || parsed.sourceCitations.length !== 1) {
    throw new Error('单规格零元商品真实样本必须只有一条 XMind 来源');
  }
  const sourceCitationVerification = verifyProductCenterXmindCitation(xmindContent, {
    citation: xmindCitation.citation,
    expectedPath: [
      '标准商品',
      '新增',
      '不同规格商品新建',
      '新建价格为0的单规格商品，新建成功',
    ],
  });
  const testPlanRef = `TEST-PLAN:${itemTestPlanFileName}#${itemStandardZeroPriceExternalCaseId}`;
  const xmindRef = `XMIND:${itemXmindFileName}#${xmindCitation.citation}`;
  const businessRefs = [testPlanRef, xmindRef];
  const preconditions = [
    '已通过安全配置登录商品中心并选择目标商户，进入商品中心首页',
    '当前品牌下不存在与本次冲突的同名审计商品',
  ];
  const actions = [
    '通过侧边栏商品管理进入商品列表页',
    '从新增商品入口进入标准商品创建页',
    '填写唯一审计商品名称，选择单规格，起售数量填写 1，标准价填写 0',
    '保存商品并等待列表刷新后按唯一商品名称查询',
  ];
  const expectedResults = [
    '页面展示可见的提交成功提示',
    '商品列表中唯一展示本次创建的商品记录',
    '商品 API 详情与列表中的标准价均为 0',
  ];
  const claims = buildItemStandardZeroPriceClaims(
    { preconditions, actions, expectedResults },
    businessRefs,
  );
  const draft: ProductCenterTestCaseDraft = {
    id: itemStandardZeroPriceCaseId,
    module: 'brand-item',
    route: itemRoute,
    title: parsed.title,
    priority: parsed.priority,
    sourceRefs: businessRefs,
    preconditions,
    actions,
    expectedResults,
    mutatesData: true,
    cleanup: ['通过服务端 ID 删除本用例创建的商品并验证 API 零残留'],
    automationPreference: 'candidate',
    claims,
    coverageIds: [
      `coverage:route:${itemRouteSourceId}`,
      `coverage:control:${itemCreateControlId}`,
    ],
    execution: {
      roleIds: ['merchant-center-product-admin'],
      environmentIds: ['balamxqa'],
      capabilityIds: ['navigation.sidebar.open', 'item.createStandard'],
      mutationMode: 'ui-create',
      verificationSignals: ['api', 'ui', 'network'],
      seedAdapterIds: ['productCenter.prepareItemStandardSingleZeroPrice'],
      cleanupAdapterIds: ['productCenter.cleanupSeed'],
      asyncPolicy: 'eventual-consistency',
    },
  };
  const sourceIds = [
    itemRouteSourceId,
    itemCreateControlId,
    itemCreateOperationId,
    itemReadOperationId,
    itemDetailOperationId,
    itemDeleteOperationId,
  ];
  const bindings: ProductCenterTestCaseSourceBinding[] = businessRefs.map((ref) => ({ ref, sourceIds }));
  const contract = contractDocument as unknown as ProductCenterTestContract;
  const knownSourceIds = new Set(productCenterContractCollections
    .filter((collection) => collection !== 'traceability')
    .flatMap((collection) => (contract[collection] ?? []).map((record) => record.id)));
  for (const sourceId of sourceIds) {
    if (!knownSourceIds.has(sourceId)) throw new Error(`单规格零元商品样本缺少统一合同来源：${sourceId}`);
  }
  const denominator = buildProductCenterCoverageDenominator(contract, {
    moduleForRoute: resolveModule,
    coverageGroups: productCenterCoverageCuration,
  });
  const intake = processProductCenterTestCaseIntake(
    { schemaVersion: '1.0.0', cases: [draft] },
    bindings,
    {
      scope: 'case-only',
      knownSourceIds,
      denominator: denominator.items,
      knownRoleIds: new Set(draft.execution.roleIds),
      knownEnvironmentIds: new Set(draft.execution.environmentIds),
      knownCapabilityIds: knownRecipeCapabilityIds,
      requireSourceTrace: true,
    },
  );
  if (intake.status !== 'passed' || !intake.generationGate?.generated.some((item) =>
    item.caseId === itemStandardZeroPriceCaseId)) {
    throw new Error(`单规格零元商品样本未通过生成门禁：${JSON.stringify(intake.generationGate)}`);
  }
  const normalized = intake.normalizedCases[0];
  const recipe: AutomationRecipe = {
    schemaVersion: '1.0.0',
    id: `product-center:${itemStandardZeroPriceCaseId}`,
    caseId: itemStandardZeroPriceCaseId,
    title: draft.title,
    tags: ['@recipe', '@generated', '@gold-set', '@item', '@create'],
    route: itemRoute,
    action: 'create',
    traceabilityId: `trace:sop:${itemStandardZeroPriceCaseId}`,
    sourceIds: normalized.sourceIds,
    claimIds: claims.map((claim) => claim.id),
    coverageIds: [...draft.coverageIds],
    generationAllowed: true,
    seed: { adapterId: 'productCenter.prepareItemStandardSingleZeroPrice' },
    capabilities: [
      {
        id: 'navigation.sidebar.open',
        saveAs: 'navigation',
        input: { targetPath: itemRoute },
      },
      {
        id: 'item.createStandard',
        saveAs: 'itemStandardSingleZeroPrice',
        input: {
          record: { $ref: '$record' },
          specification: 'single',
          price: '0',
          minimumOrderQuantity: '1',
        },
      },
    ],
    mutation: { method: 'POST', operationKey: 'brand-menu:POST /ops-brand/brand-items/standard' },
    assertions: [
      { adapterId: 'productCenter.verifyItemStandardSingleZeroPriceApi' },
      {
        adapterId: 'productCenter.verifyItemStandardSingleZeroPriceUi',
        input: { result: { $ref: '$result.itemStandardSingleZeroPrice' } },
      },
    ],
    cleanup: { adapterId: 'productCenter.cleanupSeed' },
  };
  return {
    draft,
    bindings,
    intake,
    recipe,
    sourceCitationVerification,
    sourceArtifacts: [
      artifact(infoRoot, testPlanPath, testPlanContent),
      artifact(infoRoot, xmindPath, xmindContent),
    ],
    normalizationDecision: {
      caseId: itemStandardZeroPriceCaseId,
      status: 'accepted-with-source-scope',
      retainedAssertions: ['提交成功提示', '唯一商品记录', '标准价为 0'],
      reviewRequiredAssertions: ['对应分类列表最上方', '主图展示为设置的主图'],
      reason: '正式步骤未设置分类或主图，禁止将未执行动作对应的预期伪装为自动化断言',
    },
  };
}

async function buildItemComboRequiredOnlyGold() {
  const projectRoot = path.resolve(__dirname, '..');
  const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info');
  const sourceRoot = productCenterTestPlanModuleRoot(infoRoot, 'item');
  const sourceMaterialRoot = productCenterSourceMaterialModuleRoot(infoRoot, 'item');
  const testPlanPath = path.join(sourceRoot, itemTestPlanFileName);
  const xmindPath = path.join(sourceMaterialRoot, itemXmindFileName);
  const [testPlanContent, xmindContent] = await Promise.all([
    readFile(testPlanPath),
    readFile(xmindPath),
  ]);
  const xmindCitation = '套餐商品 / 套餐商品特有：添加套餐分组 / 选择已有套餐组 / 选择固定搭配';
  const normalizedMarkdown = testPlanContent.toString('utf8').replaceAll(
    '来源：BR-ITEM-028、BR-ITEM-022、BR-ITEM-027；XMind已有',
    `来源：BR-ITEM-028、BR-ITEM-022、BR-ITEM-027；XMind已有 ← ${xmindCitation}`,
  );
  const parsed = parseProductCenterMarkdownTestCase(
    normalizedMarkdown,
    itemComboRequiredOnlyExternalCaseId,
  );
  const sourceCitationVerification = verifyProductCenterXmindCitation(xmindContent, {
    citation: xmindCitation,
    expectedPath: [
      '套餐商品',
      '套餐商品特有：添加套餐分组',
      '选择已有套餐组',
      '选择固定搭配',
    ],
  });
  const testPlanRef = `TEST-PLAN:${itemTestPlanFileName}#${itemComboRequiredOnlyExternalCaseId}`;
  const xmindRef = `XMIND:${itemXmindFileName}#${xmindCitation}`;
  const ruleRefs = ['BR-ITEM-028', 'BR-ITEM-022', 'BR-ITEM-027'].map(
    (ruleId) => `BUSINESS-RULE:商品中心业务规则.md#${ruleId}`,
  );
  const businessRefs = [testPlanRef, xmindRef, ...ruleRefs];
  const preconditions = [
    '已通过安全配置登录商品中心并选择目标商户，进入商品中心首页',
    '当前品牌下不存在与本次冲突的同名审计套餐商品',
    '已通过 API 创建一个有效固定搭配套餐组及其审计依赖商品',
  ];
  const actions = [
    '通过侧边栏商品管理进入商品列表页',
    '从新增商品入口进入套餐商品创建页',
    '填写唯一审计商品名称、起售数量 1、选择已准备的固定搭配套餐组并填写标准价 10.00',
    '保存商品并等待列表刷新后按唯一商品名称查询',
  ];
  const expectedResults = [
    '页面展示可见的提交成功提示',
    '商品列表中唯一展示本次创建的套餐商品记录',
    '商品 API 详情与列表中的标准价均为 10.00',
  ];
  const claims = buildItemComboRequiredOnlyClaims(
    { preconditions, actions, expectedResults },
    businessRefs,
  );
  const draft: ProductCenterTestCaseDraft = {
    id: itemComboRequiredOnlyCaseId,
    module: 'brand-item',
    route: itemRoute,
    title: parsed.title,
    priority: parsed.priority,
    sourceRefs: businessRefs,
    preconditions,
    actions,
    expectedResults,
    mutatesData: true,
    cleanup: [
      '通过服务端 ID 删除本用例创建的套餐商品、固定搭配套餐组及依赖商品，并验证 API 零残留',
    ],
    automationPreference: 'candidate',
    claims,
    coverageIds: [
      `coverage:route:${itemRouteSourceId}`,
      `coverage:control:${itemCreateControlId}`,
    ],
    execution: {
      roleIds: ['merchant-center-product-admin'],
      environmentIds: ['balamxqa'],
      capabilityIds: ['navigation.sidebar.open', 'item.createComboRequiredOnly'],
      mutationMode: 'api-seeded-ui-action',
      verificationSignals: ['api', 'ui', 'network'],
      seedAdapterIds: ['productCenter.prepareItemComboRequiredOnly'],
      cleanupAdapterIds: ['productCenter.cleanupSeed'],
      asyncPolicy: 'eventual-consistency',
    },
  };
  const sourceIds = [
    itemRouteSourceId,
    itemCreateControlId,
    itemCreateOperationId,
    itemComboCreateOperationId,
    itemReadOperationId,
    itemDetailOperationId,
    itemDeleteOperationId,
    comboGroupCreateOperationId,
    comboGroupListOperationId,
    comboGroupDeleteOperationId,
  ];
  const bindings: ProductCenterTestCaseSourceBinding[] = businessRefs.map((ref) => ({ ref, sourceIds }));
  const contract = contractDocument as unknown as ProductCenterTestContract;
  const knownSourceIds = new Set(productCenterContractCollections
    .filter((collection) => collection !== 'traceability')
    .flatMap((collection) => (contract[collection] ?? []).map((record) => record.id)));
  for (const sourceId of sourceIds) {
    if (!knownSourceIds.has(sourceId)) throw new Error(`仅必填套餐商品样本缺少统一合同来源：${sourceId}`);
  }
  const denominator = buildProductCenterCoverageDenominator(contract, {
    moduleForRoute: resolveModule,
    coverageGroups: productCenterCoverageCuration,
  });
  const intake = processProductCenterTestCaseIntake(
    { schemaVersion: '1.0.0', cases: [draft] },
    bindings,
    {
      scope: 'case-only',
      knownSourceIds,
      denominator: denominator.items,
      knownRoleIds: new Set(draft.execution.roleIds),
      knownEnvironmentIds: new Set(draft.execution.environmentIds),
      knownCapabilityIds: knownRecipeCapabilityIds,
      requireSourceTrace: true,
    },
  );
  if (intake.status !== 'passed' || !intake.generationGate?.generated.some((item) =>
    item.caseId === itemComboRequiredOnlyCaseId)) {
    throw new Error(`仅必填套餐商品样本未通过生成门禁：${JSON.stringify(intake.generationGate)}`);
  }
  const normalized = intake.normalizedCases[0];
  const recipe: AutomationRecipe = {
    schemaVersion: '1.0.0',
    id: `product-center:${itemComboRequiredOnlyCaseId}`,
    caseId: itemComboRequiredOnlyCaseId,
    title: draft.title,
    tags: ['@recipe', '@generated', '@gold-set', '@item', '@combo', '@create'],
    route: itemRoute,
    action: 'create',
    traceabilityId: `trace:sop:${itemComboRequiredOnlyCaseId}`,
    sourceIds: normalized.sourceIds,
    claimIds: claims.map((claim) => claim.id),
    coverageIds: [...draft.coverageIds],
    generationAllowed: true,
    seed: { adapterId: 'productCenter.prepareItemComboRequiredOnly' },
    capabilities: [
      {
        id: 'navigation.sidebar.open',
        saveAs: 'navigation',
        input: { targetPath: itemRoute },
      },
      {
        id: 'item.createComboRequiredOnly',
        saveAs: 'itemComboRequiredOnly',
        input: {
          record: { $ref: '$record' },
          price: '10.00',
          minimumOrderQuantity: '1',
          comboGroupName: { $ref: '$record.comboGroupName' },
        },
      },
    ],
    mutation: { method: 'POST', operationKey: 'brand-menu:POST /ops-brand/brand-items/combo' },
    assertions: [
      { adapterId: 'productCenter.verifyItemComboRequiredOnlyApi' },
      {
        adapterId: 'productCenter.verifyItemComboRequiredOnlyUi',
        input: { result: { $ref: '$result.itemComboRequiredOnly' } },
      },
    ],
    cleanup: { adapterId: 'productCenter.cleanupSeed' },
  };
  return {
    draft,
    bindings,
    intake,
    recipe,
    sourceCitationVerification,
    sourceArtifacts: [
      artifact(infoRoot, testPlanPath, testPlanContent),
      artifact(infoRoot, xmindPath, xmindContent),
    ],
    normalizationDecision: {
      caseId: itemComboRequiredOnlyCaseId,
      externalCaseId: itemComboRequiredOnlyExternalCaseId,
      status: 'accepted-by-explicit-gold-authorization',
      retainedAssertions: ['提交成功提示', '唯一套餐商品记录', '标准价为 10.00'],
      deferredSourceGovernance: true,
      reason: '仅对用户明确指定的 Gold 样本使用正式测试方案与精确 XMind 节点；不批量解除原来源治理阻塞',
    },
  };
}

type MainRuntimeEvidenceEntry = {
  caseId?: string;
  claimCoverageComplete?: boolean;
  sidebarEntryVerified?: boolean;
  expectedClaimIds?: string[];
  verifiedClaimIds?: string[];
  execution?: {
    capabilityIds?: string[];
    assertionAdapterIds?: string[];
  };
};

type MainRuntimeProof = {
  acceptance: {
    fingerprint?: string;
    accepted?: boolean;
    acceptedCaseIds?: string[];
    issues?: unknown[];
    safety?: Record<string, number>;
  };
  evidenceFingerprint?: string;
  entriesByCaseId: Map<string, MainRuntimeEvidenceEntry>;
  sourceArtifacts: Array<{ path: string; fingerprint: string }>;
};

type FormalSopGoldConfig = {
  caseId: string;
  module: string;
  route: string;
  title: string;
  xmindPath: string;
  xmindRoot: string;
  citation: string;
  expectedPath: string[];
  preconditions: string[];
  actions: string[];
  expectedResults: string[];
  sourceIds: string[];
  coverageIds: string[];
  capabilityIds: string[];
  seedAdapterIds: string[];
  verificationSignals: Array<'api' | 'ui' | 'network'>;
  mutationMode: 'ui-create' | 'api-seeded-ui-action';
  businessRule?: {
    path: string;
    root: string;
    citation: string;
    sectionHeading: string;
    ruleId: string;
    expectedText: string;
  };
};

async function loadMainRuntimeProof(): Promise<MainRuntimeProof> {
  const projectRoot = path.resolve(__dirname, '..');
  const acceptancePath = path.join(
    projectRoot,
    'output/recipes/product-center-pilot-acceptance.json',
  );
  const evidencePath = path.join(
    projectRoot,
    'output/recipes/product-center-pilot-evidence.json',
  );
  const [acceptanceContent, evidenceContent] = await Promise.all([
    readFile(acceptancePath),
    readFile(evidencePath),
  ]);
  const acceptance = JSON.parse(acceptanceContent.toString('utf8')) as MainRuntimeProof['acceptance'];
  const evidence = JSON.parse(evidenceContent.toString('utf8')) as {
    fingerprint?: string;
    entries?: MainRuntimeEvidenceEntry[];
  };
  const safetyValues = Object.values(acceptance.safety ?? {});
  if (
    acceptance.accepted !== true
    || (acceptance.issues?.length ?? 0) !== 0
    || safetyValues.length === 0
    || safetyValues.some((count) => count !== 0)
    || !acceptance.fingerprint
    || acceptance.fingerprint !== evidence.fingerprint
  ) {
    throw new Error('主集合运行证据未通过 Gold 复用门禁');
  }
  return {
    acceptance,
    evidenceFingerprint: evidence.fingerprint,
    entriesByCaseId: new Map((evidence.entries ?? []).map((entry) => [entry.caseId ?? '', entry])),
    sourceArtifacts: [
      artifact(projectRoot, acceptancePath, acceptanceContent),
      artifact(projectRoot, evidencePath, evidenceContent),
    ],
  };
}

async function buildBomCreateGold(runtimeProof: MainRuntimeProof) {
  const projectRoot = path.resolve(__dirname, '..');
  const aiqaRoot = path.resolve(projectRoot, '..', '..', 'AIQA');
  return buildFormalSopGold({
    caseId: bomCaseId,
    module: 'brand-material-recipe',
    route: '/pp/bom/list',
    title: '新增配方单在非失败场景下保存成功',
    xmindPath: path.join(aiqaRoot, '商品中心PRD', '测试方案', '商品中心_2', 'BOM管理.xmind'),
    xmindRoot: aiqaRoot,
    citation: 'BOM管理 / 功能 / 创建BOM / 新增BOM / 保存 / 除去失败的场景，都能成功',
    expectedPath: ['BOM管理', '功能', '创建BOM', '新增BOM', '保存', '除去失败的场景，都能成功'],
    preconditions: ['新增配方单已填写保存所需内容，且不属于该节点列出的失败场景。'],
    actions: ['从侧边栏进入配方列表，新增配方单并点击保存。'],
    expectedResults: ['配方单保存成功，列表与查询接口均可取得本次记录。'],
    sourceIds: ['route:235400d77dbb', '/pp/bom/list#control-1', 'mapping:0311d6a76a32'],
    coverageIds: ['coverage:route:route:235400d77dbb', 'coverage:control:/pp/bom/list#control-1'],
    capabilityIds: ['navigation.sidebar.open', 'coreCreate.execute'],
    seedAdapterIds: ['productCenter.prepareCreate'],
    verificationSignals: ['api', 'ui'],
    mutationMode: 'ui-create',
  }, runtimeProof);
}

async function buildPrintStallDeleteGold(runtimeProof: MainRuntimeProof) {
  const projectRoot = path.resolve(__dirname, '..');
  const aiqaRoot = path.resolve(projectRoot, '..', '..', 'AIQA');
  return buildFormalSopGold({
    caseId: printStallCaseId,
    module: 'brand-print',
    route: '/pp/printer-stall/list',
    title: '删除未关联商品的打印档口成功',
    xmindPath: path.join(aiqaRoot, '商品中心PRD', '测试方案', '商品中心_2', '打印档口.xmind'),
    xmindRoot: aiqaRoot,
    citation: '打印档口 / 打印档口管理 / 操作 / 删除 / 档口未关联商品',
    expectedPath: ['打印档口', '打印档口管理', '操作', '删除', '档口未关联商品'],
    preconditions: ['目标打印档口未关联商品。'],
    actions: ['从侧边栏进入打印档口管理，删除目标档口并确认。'],
    expectedResults: ['目标档口删除成功，列表与查询接口均不再返回该档口。'],
    sourceIds: ['route:973f08f8ed79', '/pp/printer-stall/list#control-1', 'mapping:313a81df5aea'],
    coverageIds: [
      'coverage:route:route:973f08f8ed79',
      'coverage:control:/pp/printer-stall/list#control-1',
    ],
    capabilityIds: ['navigation.sidebar.open', 'lowDependency.execute'],
    seedAdapterIds: ['productCenter.seedLowDependency'],
    verificationSignals: ['api', 'ui'],
    mutationMode: 'api-seeded-ui-action',
  }, runtimeProof);
}

async function buildMenuDeleteGold(runtimeProof: MainRuntimeProof) {
  const projectRoot = path.resolve(__dirname, '..');
  const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info');
  return buildFormalSopGold({
    caseId: menuCaseId,
    module: 'menu',
    route: '/bm/menu/list',
    title: '删除未被门店使用的菜单成功',
    xmindPath: path.join(
      infoRoot,
      '坎昆商品中心PRD测试方案',
      '菜单管理',
      '商品中心-菜单管理-菜单.xmind',
    ),
    xmindRoot: infoRoot,
    citation: '商品中心-菜单 / 菜单 / 菜单管理 / 删除 / 删除不在使用的菜单，删除成功 / 菜单1没有门店使用',
    expectedPath: [
      '商品中心-菜单',
      '菜单',
      '菜单管理',
      '删除',
      '删除不在使用的菜单，删除成功',
      '菜单1没有门店使用',
    ],
    preconditions: ['目标菜单没有门店使用。'],
    actions: ['从侧边栏进入菜单管理，在目标菜单的操作菜单中执行删除。'],
    expectedResults: ['目标菜单删除成功，列表与查询接口均不再返回该菜单。'],
    sourceIds: ['route:3cc726e3e217', '/bm/menu/list#control-1', 'mapping:367f32739210'],
    coverageIds: ['coverage:route:route:3cc726e3e217', 'coverage:control:/bm/menu/list#control-1'],
    capabilityIds: ['navigation.sidebar.open', 'highDependency.execute'],
    seedAdapterIds: ['productCenter.seedHighDependency'],
    verificationSignals: ['api', 'ui'],
    mutationMode: 'api-seeded-ui-action',
  }, runtimeProof);
}

async function buildTaxDeleteGold(runtimeProof: MainRuntimeProof) {
  const projectRoot = path.resolve(__dirname, '..');
  const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info');
  return buildFormalSopGold({
    caseId: taxCaseId,
    module: 'store-operations',
    route: '/poi/tax/tax-types',
    title: '删除未关联商品的自定义税种成功',
    xmindPath: path.join(
      infoRoot,
      '坎昆商品中心PRD测试方案',
      '门店商品管理',
      '商品中心-门店商品管理-税种管理.xmind',
    ),
    xmindRoot: infoRoot,
    citation: '税种测试方案 / 功能 / 税种相关验证 / 未关联商品税种 / 税种删除 / 自定义税种删除',
    expectedPath: [
      '税种测试方案',
      '功能',
      '税种相关验证',
      '未关联商品税种',
      '税种删除',
      '自定义税种删除',
    ],
    preconditions: ['目标自定义税种未关联商品。'],
    actions: ['从侧边栏进入税种管理，删除目标自定义税种。'],
    expectedResults: ['目标自定义税种删除成功，列表与查询接口均不再返回该税种。'],
    sourceIds: ['route:5b574e851f6f', '/poi/tax/tax-types#control-1', 'mapping:f5882e6ace12'],
    coverageIds: [
      'coverage:route:route:5b574e851f6f',
      'coverage:control:/poi/tax/tax-types#control-1',
    ],
    capabilityIds: ['navigation.sidebar.open', 'lowDependency.execute'],
    seedAdapterIds: ['productCenter.seedLowDependency'],
    verificationSignals: ['api', 'ui'],
    mutationMode: 'api-seeded-ui-action',
    businessRule: {
      path: path.join(infoRoot, '商品中心业务规则.md'),
      root: infoRoot,
      citation: 'BR-TAX-007',
      sectionHeading: '5.5.1 税种管理',
      ruleId: 'BR-TAX-007',
      expectedText: '[现网] 删除：税种可直接删除；若有关联商品，删除后自动解绑。',
    },
  }, runtimeProof);
}

async function buildStoreProductSearchGold() {
  const projectRoot = path.resolve(__dirname, '..');
  const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info');
  const xmindPath = path.join(
    infoRoot,
    '坎昆商品中心PRD测试方案',
    '门店商品管理',
    '商品中心-门店商品管理-门店菜单.xmind',
  );
  const auditPath = path.join(
    projectRoot,
    'output/test-case-audit/product-center/store-product-search-audit-latest.json',
  );
  const [xmindContent, auditContent] = await Promise.all([
    readFile(xmindPath),
    readFile(auditPath),
  ]);
  const citation = '门店商品管理 / 门店商品 / 查询 / 单条件查询 / 通过商品名称，可按照输入的内容模糊查找到符合条件的商品';
  const sourceCitationVerification = verifyProductCenterXmindCitation(xmindContent, {
    citation,
    expectedPath: [
      '门店商品管理',
      '门店商品',
      '查询',
      '单条件查询',
      '通过商品名称，可按照输入的内容模糊查找到符合条件的商品',
    ],
  });
  const auditReport = JSON.parse(auditContent.toString('utf8')) as StoreProductAuditReport;
  assertStoreProductAuditReport(auditReport);
  const xmindRef = `XMIND:${path.basename(xmindPath)}#${citation}`;
  const sourceRefs = [xmindRef];
  const sourceIds = [storeProductRouteSourceId, storeProductSearchOperationId];
  const claims = [
    formalSopClaim(
      storeProductCaseId,
      'precondition',
      '门店商品列表中存在可通过名称片段查询的商品。',
      0,
      sourceRefs,
      [storeProductRouteSourceId],
    ),
    formalSopClaim(
      storeProductCaseId,
      'action',
      '从侧边栏进入门店商品，在名称查询框输入商品名称片段。',
      0,
      sourceRefs,
      sourceIds,
    ),
    formalSopClaim(
      storeProductCaseId,
      'expectation',
      '列表唯一展示符合输入内容的门店商品。',
      0,
      sourceRefs,
      sourceIds,
    ),
  ];
  const draft: ProductCenterTestCaseDraft = {
    id: storeProductCaseId,
    module: 'store-product',
    route: storeProductRoute,
    title: '通过商品名称片段查询符合条件的门店商品',
    priority: 'P0',
    sourceRefs,
    preconditions: ['门店商品列表中存在可通过名称片段查询的商品。'],
    actions: ['从侧边栏进入门店商品，在名称查询框输入商品名称片段。'],
    expectedResults: ['列表唯一展示符合输入内容的门店商品。'],
    mutatesData: false,
    cleanup: [],
    automationPreference: 'candidate',
    claims,
    coverageIds: ['coverage:route:route:2a967315eebe'],
    execution: {
      roleIds: ['merchant-center-product-admin'],
      environmentIds: ['balamxqa'],
      capabilityIds: ['navigation.sidebar.open', 'storeProduct.searchByName'],
      mutationMode: 'none',
      verificationSignals: ['api', 'ui', 'network'],
      seedAdapterIds: [],
      cleanupAdapterIds: [],
      asyncPolicy: 'none',
    },
  };
  const contract = contractDocument as unknown as ProductCenterTestContract;
  const knownSourceIds = new Set(productCenterContractCollections
    .filter((collection) => collection !== 'traceability')
    .flatMap((collection) => (contract[collection] ?? []).map((record) => record.id)));
  for (const sourceId of sourceIds) {
    if (!knownSourceIds.has(sourceId)) {
      throw new Error(`门店商品查询真实样本缺少统一合同来源：${sourceId}`);
    }
  }
  const denominator = buildProductCenterCoverageDenominator(contract, {
    moduleForRoute: resolveModule,
    coverageGroups: productCenterCoverageCuration,
  });
  const bindings: ProductCenterTestCaseSourceBinding[] = [{ ref: xmindRef, sourceIds }];
  const intake = processProductCenterTestCaseIntake(
    { schemaVersion: '1.0.0', cases: [draft] },
    bindings,
    {
      scope: 'case-only',
      knownSourceIds,
      denominator: denominator.items,
      knownRoleIds: new Set(draft.execution.roleIds),
      knownEnvironmentIds: new Set(draft.execution.environmentIds),
      knownCapabilityIds: knownRecipeCapabilityIds,
      requireSourceTrace: true,
    },
  );
  if (!intake.generationGate?.generated.some((item) => item.caseId === storeProductCaseId)) {
    throw new Error(`门店商品查询真实样本未通过生成门禁：${JSON.stringify(intake.generationGate)}`);
  }
  const recipe: AutomationRecipe = {
    schemaVersion: '1.0.0',
    id: `product-center:test-plan-gold-set:${storeProductCaseId}`,
    caseId: storeProductCaseId,
    title: draft.title,
    tags: ['@gold', '@store-product'],
    route: storeProductRoute,
    action: 'read',
    traceabilityId: `trace:sop:${storeProductCaseId}`,
    sourceIds,
    claimIds: claims.map((claim) => claim.id),
    coverageIds: draft.coverageIds,
    generationAllowed: true,
    capabilities: [
      {
        id: 'navigation.sidebar.open',
        input: { targetPath: storeProductRoute },
        saveAs: 'navigation',
      },
      { id: 'storeProduct.searchByName', saveAs: 'storeProductSearch' },
    ],
    assertions: [{
      adapterId: 'productCenter.verifyStoreProductSearch',
      input: { result: { $ref: '$result.storeProductSearch' } },
    }],
  };
  return {
    draft,
    bindings,
    intake,
    recipe,
    sourceCitationVerification,
    sourceArtifacts: [
      artifact(infoRoot, xmindPath, xmindContent),
      artifact(projectRoot, auditPath, auditContent),
    ],
  };
}

type StoreProductAuditReport = {
  status?: string;
  mutationAttempted?: boolean;
  navigation?: { mode?: string; arrivedPath?: string };
  textboxes?: Array<{ placeholder?: string; visible?: boolean; enabled?: boolean }>;
  searchRequestContract?: { method?: string; path?: string; status?: number; queryField?: string };
  search?: { trigger?: string; locatorCount?: number; resultCount?: number; responseMethod?: string; responsePath?: string; responseStatus?: number };
  cleanup?: { verified?: boolean; apiResidueCount?: number; queryStateCleared?: boolean };
};

function assertStoreProductAuditReport(report: StoreProductAuditReport): void {
  const textbox = report.textboxes?.[0];
  if (
    report.status !== 'passed'
    || report.mutationAttempted !== false
    || report.navigation?.mode !== 'sidebar'
    || report.navigation.arrivedPath !== storeProductRoute
    || report.textboxes?.length !== 1
    || textbox?.placeholder !== 'Item Name/Code'
    || textbox.visible !== true
    || textbox.enabled !== true
    || report.searchRequestContract?.method !== 'POST'
    || report.searchRequestContract.path !== '/ops-poi/poi-items/pageQuery'
    || report.searchRequestContract.status !== 200
    || report.searchRequestContract.queryField !== 'allName'
    || report.search?.trigger !== 'input-change'
    || report.search.locatorCount !== 1
    || report.search.resultCount !== 1
    || report.search.responseMethod !== 'POST'
    || report.search.responsePath !== '/ops-poi/poi-items/pageQuery'
    || report.search.responseStatus !== 200
    || report.cleanup?.verified !== true
    || report.cleanup.apiResidueCount !== 0
    || report.cleanup.queryStateCleared !== true
  ) {
    throw new Error('门店商品查询真实样本缺少侧边栏、唯一命中或只读清理证据');
  }
}

async function buildFormalSopGold(
  config: FormalSopGoldConfig,
  runtimeProof: MainRuntimeProof,
) {
  const [xmindContent, businessRuleContent] = await Promise.all([
    readFile(config.xmindPath),
    config.businessRule ? readFile(config.businessRule.path) : Promise.resolve(undefined),
  ]);
  const xmindVerification = verifyProductCenterXmindCitation(xmindContent, {
    citation: config.citation,
    expectedPath: config.expectedPath,
  });
  const xmindRef = `XMIND:${path.basename(config.xmindPath)}#${config.citation}`;
  const businessRuleVerification = config.businessRule && businessRuleContent
    ? verifyProductCenterBusinessRuleCitation(businessRuleContent.toString('utf8'), {
      citation: config.businessRule.citation,
      sectionHeading: config.businessRule.sectionHeading,
      ruleId: config.businessRule.ruleId,
      expectedText: config.businessRule.expectedText,
    })
    : undefined;
  const businessRuleRef = config.businessRule
    ? `BUSINESS-RULE:${path.basename(config.businessRule.path)}#${config.businessRule.citation}`
    : undefined;
  const sourceRefs = [xmindRef, ...(businessRuleRef ? [businessRuleRef] : [])];
  const claims = [
    ...config.preconditions.map((text, index) => formalSopClaim(
      config.caseId,
      'precondition',
      text,
      index,
      [xmindRef],
      config.sourceIds.slice(0, 1),
    )),
    ...config.actions.map((text, index) => formalSopClaim(
      config.caseId,
      'action',
      text,
      index,
      [xmindRef],
      config.sourceIds.slice(0, 2),
    )),
    ...config.expectedResults.map((text, index) => formalSopClaim(
      config.caseId,
      'expectation',
      text,
      index,
      businessRuleRef ? [businessRuleRef] : [xmindRef],
      config.sourceIds,
      businessRuleRef ? 'business-rule-explicit' : 'xmind-existing',
    )),
  ];
  const draft: ProductCenterTestCaseDraft = {
    id: config.caseId,
    module: config.module,
    route: config.route,
    title: config.title,
    priority: 'P0',
    sourceRefs,
    preconditions: config.preconditions,
    actions: config.actions,
    expectedResults: config.expectedResults,
    mutatesData: true,
    cleanup: ['通过服务端 ID 清理本用例创建的数据并验证 UI 与 API 零残留'],
    automationPreference: 'candidate',
    claims,
    coverageIds: config.coverageIds,
    execution: {
      roleIds: ['merchant-center-product-admin'],
      environmentIds: ['balamxqa'],
      capabilityIds: config.capabilityIds,
      mutationMode: config.mutationMode,
      verificationSignals: config.verificationSignals,
      seedAdapterIds: config.seedAdapterIds,
      cleanupAdapterIds: ['productCenter.cleanupSeed'],
      asyncPolicy: 'none',
    },
  };
  if (resolveModule(config.route) !== config.module) {
    throw new Error(`真实样本模块与路由归属不一致：${config.caseId}`);
  }
  const contract = contractDocument as unknown as ProductCenterTestContract;
  const knownSourceIds = new Set(productCenterContractCollections
    .filter((collection) => collection !== 'traceability')
    .flatMap((collection) => (contract[collection] ?? []).map((record) => record.id)));
  for (const sourceId of config.sourceIds) {
    if (!knownSourceIds.has(sourceId)) throw new Error(`真实样本缺少统一合同来源：${sourceId}`);
  }
  const denominator = buildProductCenterCoverageDenominator(contract, {
    moduleForRoute: resolveModule,
    coverageGroups: productCenterCoverageCuration,
  });
  const bindings: ProductCenterTestCaseSourceBinding[] = sourceRefs.map((ref) => ({
    ref,
    sourceIds: config.sourceIds,
  }));
  const intake = processProductCenterTestCaseIntake(
    { schemaVersion: '1.0.0', cases: [draft] },
    bindings,
    {
      scope: 'case-only',
      knownSourceIds,
      denominator: denominator.items,
      knownRoleIds: new Set(draft.execution.roleIds),
      knownEnvironmentIds: new Set(draft.execution.environmentIds),
      knownCapabilityIds: knownRecipeCapabilityIds,
      requireSourceTrace: true,
    },
  );
  if (!intake.generationGate?.generated.some((item) => item.caseId === config.caseId)) {
    throw new Error(`正式来源样本未通过生成门禁：${config.caseId}`);
  }
  const recipe = compileProductCenterPilotRecipes({
    core: productCenterSopCatalog,
    create: productCenterCreateSopCatalog,
    lowDependency: lowDependencySopCatalog,
    highDependency: highDependencySopCatalog,
    negative: productCenterNegativeSopCatalog,
    contract,
    generatedCaseIds: new Set([config.caseId]),
    claimIdsByCaseId: new Map([[config.caseId, claims.map((claim) => claim.id)]]),
  }).recipes.find((item) => item.caseId === config.caseId);
  if (!recipe) throw new Error(`正式来源样本未映射到现有 Recipe：${config.caseId}`);
  assertMainRuntimeProof(config.caseId, claims.map((claim) => claim.id), recipe, runtimeProof);
  return {
    draft,
    bindings,
    intake,
    recipe,
    sourceCitationVerifications: [
      xmindVerification,
      ...(businessRuleVerification ? [businessRuleVerification] : []),
    ] as ProductCenterSourceCitationVerification[],
    sourceArtifacts: [
      artifact(config.xmindRoot, config.xmindPath, xmindContent),
      ...(config.businessRule && businessRuleContent
        ? [artifact(config.businessRule.root, config.businessRule.path, businessRuleContent)]
        : []),
    ],
  };
}

function formalSopClaim(
  caseId: string,
  kind: ProductCenterTestCaseDraftClaim['kind'],
  text: string,
  index: number,
  businessRefs: string[],
  executionSourceIds: string[],
  businessKind: 'xmind-existing' | 'business-rule-explicit' = 'xmind-existing',
): ProductCenterTestCaseDraftClaim {
  return {
    id: `claim:${caseId}:${kind}:${index + 1}`,
    kind,
    text,
    sourceRefs: businessRefs,
    evidenceLevel: 'confirmed',
    sourceTrace: {
      businessBasis: { kind: businessKind, refs: businessRefs },
      executionEvidence: [{ kind: 'contract-observed', sourceIds: executionSourceIds }],
    },
  };
}

function assertMainRuntimeProof(
  caseId: string,
  claimIds: string[],
  recipe: AutomationRecipe,
  runtimeProof: MainRuntimeProof,
): void {
  const entry = runtimeProof.entriesByCaseId.get(caseId);
  const accepted = runtimeProof.acceptance.acceptedCaseIds?.includes(caseId) === true;
  const sameClaims = (actual: string[] | undefined) =>
    JSON.stringify([...(actual ?? [])].sort()) === JSON.stringify([...claimIds].sort());
  if (
    !accepted
    || entry?.claimCoverageComplete !== true
    || entry.sidebarEntryVerified !== true
    || !sameClaims(entry.expectedClaimIds)
    || !sameClaims(entry.verifiedClaimIds)
    || JSON.stringify(entry.execution?.capabilityIds) !== JSON.stringify(
      recipe.capabilities.map((item) => item.id),
    )
    || JSON.stringify(entry.execution?.assertionAdapterIds) !== JSON.stringify(
      recipe.assertions.map((item) => item.adapterId),
    )
    || recipe.capabilities[0]?.id !== 'navigation.sidebar.open'
    || recipe.cleanup?.adapterId !== 'productCenter.cleanupSeed'
  ) {
    throw new Error(`正式来源样本缺少匹配的真实运行与清理证据：${caseId}`);
  }
}

async function buildSeasoningPilot() {
  const projectRoot = path.resolve(__dirname, '..');
  const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info');
  const sourceRoot = productCenterTestPlanModuleRoot(infoRoot, 'seasoning');
  const sourceMaterialRoot = productCenterSourceMaterialModuleRoot(infoRoot, 'seasoning');
  const testPlanPath = path.join(sourceRoot, seasoningTestPlanFileName);
  const xmindPath = path.join(sourceMaterialRoot, seasoningXmindFileName);
  const [testPlanContent, xmindContent] = await Promise.all([
    readFile(testPlanPath),
    readFile(xmindPath),
  ]);
  const parsed = parseProductCenterMarkdownTestCase(
    testPlanContent.toString('utf8'),
    seasoningExternalCaseId,
  );
  const xmindCitation = parsed.sourceCitations.find((item) => item.kind === 'xmind-existing');
  if (!xmindCitation || parsed.sourceCitations.length !== 1) {
    throw new Error('品牌调味真实样本必须只有一条 XMind 来源');
  }
  const sourceCitationVerification = verifyProductCenterXmindCitation(xmindContent, {
    citation: xmindCitation.citation,
    expectedPath: [
      '功能',
      '商品管理-调味管理',
      '操作',
      '新增',
      '新增',
      '新增调味组，只填必填参数，能新增成功',
    ],
  });
  const testPlanRef = `TEST-PLAN:${seasoningTestPlanFileName}#${seasoningExternalCaseId}`;
  const xmindRef = `XMIND:${seasoningXmindFileName}#${xmindCitation.citation}`;
  const businessRefs = [testPlanRef, xmindRef];
  const claims = buildSeasoningClaims(parsed, businessRefs);
  const draft: ProductCenterTestCaseDraft = {
    id: seasoningCaseId,
    module: 'brand-seasoning',
    route: seasoningRoute,
    title: parsed.title,
    priority: parsed.priority,
    sourceRefs: businessRefs,
    preconditions: parsed.preconditions,
    actions: parsed.actions,
    expectedResults: parsed.expectedResults,
    mutatesData: true,
    cleanup: ['通过 API 删除本用例创建的调味组并验证 UI 与 API 零残留'],
    automationPreference: 'candidate',
    claims,
    coverageIds: [
      'coverage:route:route:a8e0b800fdf2',
      'coverage:control:/pp/brand/seasoning/list#control-3',
    ],
    execution: {
      roleIds: ['merchant-center-product-admin'],
      environmentIds: ['balamxqa'],
      capabilityIds: ['navigation.sidebar.open', 'coreCreate.execute'],
      mutationMode: 'ui-create',
      verificationSignals: ['api', 'ui', 'network'],
      seedAdapterIds: ['productCenter.prepareCreate'],
      cleanupAdapterIds: ['productCenter.cleanupSeed'],
      asyncPolicy: 'none',
    },
  };
  const sourceIds = [
    seasoningRouteSourceId,
    seasoningCreateControlId,
    seasoningCreateOperationId,
    seasoningReadOperationId,
  ];
  const bindings: ProductCenterTestCaseSourceBinding[] = businessRefs.map((ref) => ({
    ref,
    sourceIds,
  }));
  const contract = contractDocument as unknown as ProductCenterTestContract;
  const knownSourceIds = new Set(productCenterContractCollections
    .filter((collection) => collection !== 'traceability')
    .flatMap((collection) => (contract[collection] ?? []).map((record) => record.id)));
  for (const sourceId of sourceIds) {
    if (!knownSourceIds.has(sourceId)) throw new Error(`品牌调味真实样本缺少统一合同来源：${sourceId}`);
  }
  const denominator = buildProductCenterCoverageDenominator(contract, {
    moduleForRoute: resolveModule,
    coverageGroups: productCenterCoverageCuration,
  });
  const intake = processProductCenterTestCaseIntake(
    { schemaVersion: '1.0.0', cases: [draft] },
    bindings,
    {
      scope: 'case-only',
      knownSourceIds,
      denominator: denominator.items,
      knownRoleIds: new Set(draft.execution.roleIds),
      knownEnvironmentIds: new Set(draft.execution.environmentIds),
      knownCapabilityIds: knownRecipeCapabilityIds,
      requireSourceTrace: true,
    },
  );
  if (!intake.generationGate) throw new Error('品牌调味真实样本缺少生成门禁结果');
  const generationAllowed = intake.generationGate.generated.some((item) =>
    item.caseId === seasoningCaseId);
  const recipe = generationAllowed
    ? compileProductCenterPilotRecipes({
      core: productCenterSopCatalog,
      create: productCenterCreateSopCatalog,
      lowDependency: lowDependencySopCatalog,
      highDependency: highDependencySopCatalog,
      negative: productCenterNegativeSopCatalog,
      contract,
      generatedCaseIds: new Set([seasoningCaseId]),
      claimIdsByCaseId: new Map([[seasoningCaseId, claims.map((claim) => claim.id)]]),
    }).recipes.find((item) => item.caseId === seasoningCaseId)
    : undefined;
  if (generationAllowed && !recipe) throw new Error('品牌调味真实样本未映射到现有 Recipe');

  return {
    draft,
    bindings,
    intake,
    recipe,
    sourceCitationVerification,
    sourceArtifacts: [
      artifact(infoRoot, testPlanPath, testPlanContent),
      artifact(infoRoot, xmindPath, xmindContent),
    ],
  };
}

async function buildMethodDetailBoundaryReview() {
  const projectRoot = path.resolve(__dirname, '..');
  const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info');
  const sourceRoot = path.join(infoRoot, 'PRD与对应测试用例');
  const testPlanPath = path.join(sourceRoot, methodDetailTestPlanFileName);
  const xmindPath = path.join(
    productCenterSourceMaterialModuleRoot(infoRoot, 'group'),
    groupXmindFileName,
  );
  const businessRulePath = path.join(infoRoot, '商品中心业务规则.md');
  const auditReportPath = path.join(
    projectRoot,
    'output/test-case-audit/product-center/method-detail-boundary-latest.json',
  );
  const [testPlanContent, xmindContent, businessRuleContent, auditReportContent] = await Promise.all([
    readFile(testPlanPath),
    readFile(xmindPath),
    readFile(businessRulePath),
    readFile(auditReportPath),
  ]);
  const auditReport = JSON.parse(auditReportContent.toString('utf8')) as {
    caseId?: string;
    status?: string;
    navigation?: { capabilityId?: string };
    maxLengthAttribute?: string;
    responseStatus?: number;
    storedMatchesFirst100?: boolean;
    cleanup?: { verified?: boolean; apiResidueCount?: number };
  };
  if (
    auditReport.caseId !== methodDetailCaseId
    || auditReport.status !== 'passed'
    || auditReport.navigation?.capabilityId !== 'navigation.sidebar.open'
    || auditReport.maxLengthAttribute !== '100'
    || auditReport.responseStatus !== 200
    || auditReport.storedMatchesFirst100 !== true
    || auditReport.cleanup?.verified !== true
    || auditReport.cleanup.apiResidueCount !== 0
  ) {
    throw new Error('做法明细边界 capability 缺少完整真实运行证据');
  }
  const parsed = parseProductCenterMarkdownTestCase(
    testPlanContent.toString('utf8'),
    methodDetailExternalCaseId,
  );
  const xmindCitation = parsed.sourceCitations.find((item) => item.kind === 'xmind-existing');
  const businessRuleCitation = parsed.sourceCitations.find((item) =>
    item.kind === 'business-rule-explicit');
  if (
    !xmindCitation
    || businessRuleCitation?.citation !== 'BR-FMT-001'
    || parsed.sourceCitations.length !== 2
  ) {
    throw new Error('做法明细边界样本必须包含一条 XMind 来源和 BR-FMT-001');
  }
  const sourceCitationVerification = verifyProductCenterXmindCitation(xmindContent, {
    citation: xmindCitation.citation,
    expectedPath: [
      '做法组',
      '新增',
      '字符格式化处理',
      '新增做法明细，做法名称等字符输入超过100个字符，并且字符输入中有特殊字符，保存之后，自动截断前100个有效字符',
    ],
  });
  const businessRuleCitationVerification = verifyProductCenterBusinessRuleCitation(
    businessRuleContent.toString('utf8'),
    {
      citation: businessRuleCitation.citation,
      sectionHeading: '2.2 全局格式与输入（B 端规范）',
      ruleId: 'BR-FMT-001',
      expectedText: '[B端] 名称类字段（商品名、组名、菜单名等）：最长 **100** 字符；**首尾禁止空格**（输入含首尾空格时**保存失败**，页面拦截并提示格式校验，**不可**保存成功后自动去除）；字符间允许单空格；**禁止 emoji**；超限失去焦点飘红「内容超出限制，请重新输入」。',
    },
  );
  const testPlanRef = `TEST-PLAN:${methodDetailTestPlanFileName}#${methodDetailExternalCaseId}`;
  const xmindRef = `XMIND:${groupXmindFileName}#${xmindCitation.citation}`;
  const businessRuleRef = `BUSINESS-RULE:商品中心业务规则.md#${businessRuleCitation.citation}`;
  const businessRefs = [testPlanRef, xmindRef, businessRuleRef];
  const claims = buildMethodDetailClaims(parsed, businessRefs);
  const draft: ProductCenterTestCaseDraft = {
    id: methodDetailCaseId,
    module: 'brand-group',
    route: methodRoute,
    title: parsed.title,
    priority: parsed.priority,
    sourceRefs: businessRefs,
    preconditions: parsed.preconditions,
    actions: parsed.actions,
    expectedResults: parsed.expectedResults,
    mutatesData: true,
    cleanup: ['通过 API 删除本用例创建的做法组和明细并验证 UI 与 API 零残留'],
    automationPreference: 'candidate',
    claims,
    coverageIds: ['coverage:route:route:b0c3b84b758f'],
    execution: {
      roleIds: ['merchant-center-product-admin'],
      environmentIds: ['balamxqa'],
      capabilityIds: ['navigation.sidebar.open', methodDetailCapabilityId],
      mutationMode: 'ui-create',
      verificationSignals: ['api', 'ui'],
      seedAdapterIds: [],
      cleanupAdapterIds: ['productCenter.cleanupSeed'],
      asyncPolicy: 'none',
    },
  };
  const bindings: ProductCenterTestCaseSourceBinding[] = businessRefs.map((ref) => ({
    ref,
    sourceIds: [methodRouteSourceId, methodCreateOperationId, methodDetailOperationId],
  }));
  const contract = contractDocument as unknown as ProductCenterTestContract;
  const knownSourceIds = new Set(productCenterContractCollections
    .filter((collection) => collection !== 'traceability')
    .flatMap((collection) => (contract[collection] ?? []).map((record) => record.id)));
  for (const sourceId of [methodRouteSourceId, methodCreateOperationId, methodDetailOperationId]) {
    if (!knownSourceIds.has(sourceId)) {
      throw new Error(`做法明细边界样本缺少统一合同来源：${sourceId}`);
    }
  }
  const denominator = buildProductCenterCoverageDenominator(contract, {
    moduleForRoute: resolveModule,
    coverageGroups: productCenterCoverageCuration,
  });
  const intake = processProductCenterTestCaseIntake(
    { schemaVersion: '1.0.0', cases: [draft] },
    bindings,
    {
      scope: 'case-only',
      knownSourceIds,
      denominator: denominator.items,
      knownRoleIds: new Set(draft.execution.roleIds),
      knownEnvironmentIds: new Set(draft.execution.environmentIds),
      knownCapabilityIds: knownRecipeCapabilityIds,
      requireSourceTrace: true,
    },
  );
  if (intake.status !== 'passed' || !intake.generationGate?.generated.some((item) =>
    item.caseId === methodDetailCaseId)) {
    throw new Error(
      `做法明细边界样本具备真实 capability 后必须通过生成门禁：${JSON.stringify({
        status: intake.status,
        generationGate: intake.generationGate,
      })}`,
    );
  }
  const normalized = intake.normalizedCases[0];
  const recipe: AutomationRecipe = {
    schemaVersion: '1.0.0',
    id: 'product-center:method-detail-max-length:boundary',
    caseId: methodDetailCaseId,
    title: draft.title,
    tags: ['@recipe', '@generated', '@gold-set', '@boundary'],
    route: methodRoute,
    action: 'boundary',
    traceabilityId: 'trace:sop:review:method-detail-max-length',
    sourceIds: normalized.sourceIds,
    claimIds: claims.map((claim) => claim.id),
    coverageIds: [...draft.coverageIds],
    generationAllowed: true,
    seed: { adapterId: 'productCenter.prepareCreate', input: { entityKey: 'method' } },
    capabilities: [
      {
        id: 'navigation.sidebar.open',
        saveAs: 'navigation',
        input: { targetPath: methodRoute },
      },
      {
        id: methodDetailCapabilityId,
        saveAs: 'methodDetailBoundary',
        input: {
          record: { $ref: '$record' },
          maxLength: 100,
          rejectedLength: 101,
        },
      },
    ],
    mutation: { method: 'POST', operationKey: 'method.create' },
    assertions: [
      { adapterId: 'productCenter.verifyCreatedApi' },
      {
        adapterId: 'productCenter.verifyMethodDetailBoundary',
        input: { result: { $ref: '$result.methodDetailBoundary' }, maxLength: 100 },
      },
    ],
    cleanup: { adapterId: 'productCenter.cleanupSeed' },
  };
  return {
    draft,
    bindings,
    intake,
    recipe,
    sourceCitationVerifications: [sourceCitationVerification, businessRuleCitationVerification],
    sourceArtifacts: [
      artifact(infoRoot, testPlanPath, testPlanContent),
      artifact(infoRoot, xmindPath, xmindContent),
      artifact(infoRoot, businessRulePath, businessRuleContent),
      artifact(projectRoot, auditReportPath, auditReportContent),
    ],
  };
}

async function buildDescriptionTagDeleteGold() {
  const projectRoot = path.resolve(__dirname, '..');
  const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info');
  const sourceRoot = productCenterTestPlanModuleRoot(infoRoot, 'tag');
  const sourceMaterialRoot = productCenterSourceMaterialModuleRoot(infoRoot, 'tag');
  const testPlanPath = path.join(sourceRoot, tagTestPlanFileName);
  const xmindPath = path.join(sourceMaterialRoot, tagXmindFileName);
  const [testPlanContent, xmindContent] = await Promise.all([
    readFile(testPlanPath),
    readFile(xmindPath),
  ]);
  const parsed = parseProductCenterMarkdownTestCase(
    testPlanContent.toString('utf8'),
    descriptionTagExternalCaseId,
  );
  const xmindCitation = parsed.sourceCitations.find((item) => item.kind === 'xmind-existing');
  if (!xmindCitation || parsed.sourceCitations.length !== 1) {
    throw new Error('描述标签删除真实样本必须只有一条 XMind 来源');
  }
  const sourceCitationVerification = verifyProductCenterXmindCitation(xmindContent, {
    citation: xmindCitation.citation,
    expectedPath: [
      '描述标签',
      '删除',
      '标签删除',
      '标签未被引用，未被引用的标签可删除成功',
    ],
  });
  const testPlanRef = `TEST-PLAN:${tagTestPlanFileName}#${descriptionTagExternalCaseId}`;
  const xmindRef = `XMIND:${tagXmindFileName}#${xmindCitation.citation}`;
  const businessRefs = [testPlanRef, xmindRef];
  const claims = buildDescriptionTagClaims(parsed, businessRefs);
  const draft: ProductCenterTestCaseDraft = {
    id: descriptionTagCaseId,
    module: 'brand-tag',
    route: descriptionTagRoute,
    title: parsed.title,
    priority: parsed.priority,
    sourceRefs: businessRefs,
    preconditions: parsed.preconditions,
    actions: parsed.actions,
    expectedResults: parsed.expectedResults,
    mutatesData: true,
    cleanup: ['通过服务端 ID 清理描述标签测试数据并验证 UI 与 API 零残留'],
    automationPreference: 'candidate',
    claims,
    coverageIds: [
      `coverage:route:${descriptionTagRouteSourceId}`,
      `coverage:control:${descriptionTagDeleteControlId}`,
    ],
    execution: {
      roleIds: ['merchant-center-product-admin'],
      environmentIds: ['balamxqa'],
      capabilityIds: ['navigation.sidebar.open', 'lowDependency.execute'],
      mutationMode: 'api-seeded-ui-action',
      verificationSignals: ['api', 'ui', 'network'],
      seedAdapterIds: ['productCenter.seedDescriptionTagDeletionScenario'],
      cleanupAdapterIds: ['productCenter.cleanupSeed'],
      asyncPolicy: 'none',
    },
  };
  const sourceIds = [descriptionTagRouteSourceId, descriptionTagDeleteControlId];
  const bindings: ProductCenterTestCaseSourceBinding[] = businessRefs.map((ref) => ({
    ref,
    sourceIds,
  }));
  const contract = contractDocument as unknown as ProductCenterTestContract;
  const knownSourceIds = new Set(productCenterContractCollections
    .filter((collection) => collection !== 'traceability')
    .flatMap((collection) => (contract[collection] ?? []).map((record) => record.id)));
  for (const sourceId of sourceIds) {
    if (!knownSourceIds.has(sourceId)) {
      throw new Error(`描述标签删除真实样本缺少统一合同来源：${sourceId}`);
    }
  }
  const denominator = buildProductCenterCoverageDenominator(contract, {
    moduleForRoute: resolveModule,
    coverageGroups: productCenterCoverageCuration,
  });
  const intake = processProductCenterTestCaseIntake(
    { schemaVersion: '1.0.0', cases: [draft] },
    bindings,
    {
      scope: 'case-only',
      knownSourceIds,
      denominator: denominator.items,
      knownRoleIds: new Set(draft.execution.roleIds),
      knownEnvironmentIds: new Set(draft.execution.environmentIds),
      knownCapabilityIds: knownRecipeCapabilityIds,
      requireSourceTrace: true,
    },
  );
  if (intake.status !== 'passed' || !intake.generationGate?.generated.some((item) =>
    item.caseId === descriptionTagCaseId)) {
    throw new Error(`描述标签删除真实样本未通过生成门禁：${JSON.stringify(intake.generationGate)}`);
  }
  const compiledRecipe = compileProductCenterPilotRecipes({
    core: productCenterSopCatalog,
    create: productCenterCreateSopCatalog,
    lowDependency: lowDependencySopCatalog,
    highDependency: highDependencySopCatalog,
    negative: productCenterNegativeSopCatalog,
    contract,
    generatedCaseIds: new Set([descriptionTagCaseId]),
    claimIdsByCaseId: new Map([[descriptionTagCaseId, claims.map((claim) => claim.id)]]),
  }).recipes.find((item) => item.caseId === descriptionTagCaseId);
  if (!compiledRecipe) throw new Error('描述标签删除真实样本未映射到现有 Recipe');
  const recipe: AutomationRecipe = {
    ...compiledRecipe,
    seed: { adapterId: 'productCenter.seedDescriptionTagDeletionScenario' },
  };

  return {
    draft,
    bindings,
    intake,
    recipe,
    sourceCitationVerification,
    sourceArtifacts: [
      artifact(infoRoot, testPlanPath, testPlanContent),
      artifact(infoRoot, xmindPath, xmindContent),
    ],
  };
}

function buildSeasoningClaims(
  parsed: ReturnType<typeof parseProductCenterMarkdownTestCase>,
  businessRefs: string[],
): ProductCenterTestCaseDraftClaim[] {
  return [
    ...parsed.preconditions.map((text, index) => seasoningClaim(
      'precondition', text, index, businessRefs, [seasoningRouteSourceId],
    )),
    ...parsed.actions.map((text, index) => seasoningClaim(
      'action',
      text,
      index,
      businessRefs,
      index === 0
        ? [seasoningRouteSourceId]
        : [seasoningCreateControlId, seasoningCreateOperationId],
    )),
    ...parsed.expectedResults.map((text, index) => seasoningClaim(
      'expectation',
      text,
      index,
      businessRefs,
      [seasoningCreateOperationId, seasoningReadOperationId],
    )),
  ];
}

function buildItemStandardZeroPriceClaims(
  input: { preconditions: string[]; actions: string[]; expectedResults: string[] },
  businessRefs: string[],
): ProductCenterTestCaseDraftClaim[] {
  return [
    ...input.preconditions.map((text, index) => itemStandardZeroPriceClaim(
      'precondition', text, index, businessRefs, [itemRouteSourceId],
    )),
    ...input.actions.map((text, index) => itemStandardZeroPriceClaim(
      'action',
      text,
      index,
      businessRefs,
      index === 0
        ? [itemRouteSourceId]
        : [itemCreateControlId, itemCreateOperationId],
    )),
    ...input.expectedResults.map((text, index) => itemStandardZeroPriceClaim(
      'expectation',
      text,
      index,
      businessRefs,
      index === 0
        ? [itemCreateOperationId]
        : [itemReadOperationId, itemDetailOperationId],
    )),
  ];
}

function itemStandardZeroPriceClaim(
  kind: ProductCenterTestCaseDraftClaim['kind'],
  text: string,
  index: number,
  businessRefs: string[],
  executionSourceIds: string[],
): ProductCenterTestCaseDraftClaim {
  return {
    id: `claim:${itemStandardZeroPriceCaseId}:${kind}:${index + 1}`,
    kind,
    text,
    sourceRefs: businessRefs,
    evidenceLevel: 'confirmed',
    sourceTrace: {
      businessBasis: { kind: 'xmind-existing', refs: businessRefs },
      executionEvidence: [{ kind: 'contract-observed', sourceIds: executionSourceIds }],
    },
  };
}

function buildItemComboRequiredOnlyClaims(
  input: { preconditions: string[]; actions: string[]; expectedResults: string[] },
  businessRefs: string[],
): ProductCenterTestCaseDraftClaim[] {
  return [
    ...input.preconditions.map((text, index) => itemComboRequiredOnlyClaim(
      'precondition',
      text,
      index,
      businessRefs,
      index === 2
        ? [comboGroupCreateOperationId, comboGroupListOperationId]
        : [itemRouteSourceId],
    )),
    ...input.actions.map((text, index) => itemComboRequiredOnlyClaim(
      'action',
      text,
      index,
      businessRefs,
      index === 0
        ? [itemRouteSourceId]
        : [itemCreateControlId, itemComboCreateOperationId],
    )),
    ...input.expectedResults.map((text, index) => itemComboRequiredOnlyClaim(
      'expectation',
      text,
      index,
      businessRefs,
      index === 0
        ? [itemComboCreateOperationId]
        : [itemReadOperationId, itemDetailOperationId],
    )),
  ];
}

function itemComboRequiredOnlyClaim(
  kind: ProductCenterTestCaseDraftClaim['kind'],
  text: string,
  index: number,
  businessRefs: string[],
  executionSourceIds: string[],
): ProductCenterTestCaseDraftClaim {
  return {
    id: `claim:${itemComboRequiredOnlyCaseId}:${kind}:${index + 1}`,
    kind,
    text,
    sourceRefs: businessRefs,
    evidenceLevel: 'confirmed',
    sourceTrace: {
      businessBasis: { kind: 'xmind-existing', refs: businessRefs },
      executionEvidence: [{ kind: 'contract-observed', sourceIds: executionSourceIds }],
    },
  };
}

function buildDescriptionTagClaims(
  parsed: ReturnType<typeof parseProductCenterMarkdownTestCase>,
  businessRefs: string[],
): ProductCenterTestCaseDraftClaim[] {
  return [
    ...parsed.preconditions.map((text, index) => descriptionTagClaim(
      'precondition', text, index, businessRefs, [descriptionTagRouteSourceId],
    )),
    ...parsed.actions.map((text, index) => descriptionTagClaim(
      'action', text, index, businessRefs,
      index === 0 ? [descriptionTagRouteSourceId] : [descriptionTagDeleteControlId],
    )),
    ...parsed.expectedResults.map((text, index) => descriptionTagClaim(
      'expectation', text, index, businessRefs,
      [descriptionTagRouteSourceId, descriptionTagDeleteControlId],
    )),
  ];
}

function descriptionTagClaim(
  kind: ProductCenterTestCaseDraftClaim['kind'],
  text: string,
  index: number,
  businessRefs: string[],
  executionSourceIds: string[],
): ProductCenterTestCaseDraftClaim {
  return {
    id: `claim:${descriptionTagCaseId}:${kind}:${index + 1}`,
    kind,
    text,
    sourceRefs: businessRefs,
    evidenceLevel: 'confirmed',
    sourceTrace: {
      businessBasis: { kind: 'xmind-existing', refs: businessRefs },
      executionEvidence: [{ kind: 'contract-observed', sourceIds: executionSourceIds }],
    },
  };
}

function seasoningClaim(
  kind: ProductCenterTestCaseDraftClaim['kind'],
  text: string,
  index: number,
  businessRefs: string[],
  executionSourceIds: string[],
): ProductCenterTestCaseDraftClaim {
  const sourceTrace: ProductCenterClaimSourceTrace = {
    businessBasis: {
      kind: 'xmind-existing',
      refs: businessRefs,
    },
    executionEvidence: [{
      kind: 'contract-observed',
      sourceIds: executionSourceIds,
    }],
  };
  return {
    id: `claim:${seasoningCaseId}:${kind}:${index + 1}`,
    kind,
    text,
    sourceRefs: businessRefs,
    evidenceLevel: 'confirmed',
    sourceTrace,
  };
}

function buildMethodDetailClaims(
  parsed: ReturnType<typeof parseProductCenterMarkdownTestCase>,
  businessRefs: string[],
): ProductCenterTestCaseDraftClaim[] {
  return [
    ...parsed.preconditions.map((text, index) => methodDetailClaim(
      'precondition', text, index, businessRefs, [methodRouteSourceId],
    )),
    ...parsed.actions.map((text, index) => methodDetailClaim(
      'action', text, index, businessRefs,
      index === 0 ? [methodRouteSourceId, methodCreateOperationId] : [methodDetailOperationId],
    )),
    ...parsed.expectedResults.map((text, index) => methodDetailClaim(
      'expectation', text, index, businessRefs,
      index === 0 ? [methodCreateOperationId] : [methodDetailOperationId],
    )),
  ];
}

function methodDetailClaim(
  kind: ProductCenterTestCaseDraftClaim['kind'],
  text: string,
  index: number,
  businessRefs: string[],
  executionSourceIds: string[],
): ProductCenterTestCaseDraftClaim {
  return {
    id: `claim:${methodDetailCaseId}:${kind}:${index + 1}`,
    kind,
    text,
    sourceRefs: businessRefs,
    evidenceLevel: 'confirmed',
    sourceTrace: {
      businessBasis: {
        kind: 'xmind-existing',
        refs: businessRefs,
      },
      executionEvidence: executionSourceIds.length > 0
        ? [{ kind: 'contract-observed', sourceIds: executionSourceIds }]
        : [],
    },
  };
}

function mergeGenerationGates(
  gates: ProductCenterTestCaseGenerationGate[],
): ProductCenterTestCaseGenerationGate {
  const summary = gates.reduce((result, gate) => ({
    totalCases: result.totalCases + gate.summary.totalCases,
    generated: result.generated + gate.summary.generated,
    reviewRequired: result.reviewRequired + gate.summary.reviewRequired,
    blocked: result.blocked + gate.summary.blocked,
    intentionallyOmitted: result.intentionallyOmitted + gate.summary.intentionallyOmitted,
  }), {
    totalCases: 0,
    generated: 0,
    reviewRequired: 0,
    blocked: 0,
    intentionallyOmitted: 0,
  });
  return {
    status: gates.some((gate) => gate.status === 'blocked')
      ? 'blocked'
      : gates.some((gate) => gate.status === 'review-required')
        ? 'review-required'
        : 'passed',
    summary,
    generated: gates.flatMap((gate) => gate.generated),
    reviewRequired: gates.flatMap((gate) => gate.reviewRequired),
    blocked: gates.flatMap((gate) => gate.blocked),
    intentionallyOmitted: gates.flatMap((gate) => gate.intentionallyOmitted),
    modules: gates.flatMap((gate) => gate.modules),
  };
}

function uniqueByPath<T extends { path: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.path, item])).values()];
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
  if (matches.length !== 1) throw new Error(`真实样本路由必须唯一归属模块：${route}`);
  return matches[0].id;
}

async function readJson(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const paths = await buildProductCenterTestPlanGoldSetArtifacts();
  process.stdout.write(
    `商品中心真实测试方案金标集已生成：\n${paths.documentPath}\n${paths.bindingsPath}\n${paths.reportPath}\n${paths.recipesPath}\n${paths.reviewQueuePath}\n${paths.specPath}\n`,
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
