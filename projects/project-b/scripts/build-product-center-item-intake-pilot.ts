import fs from 'node:fs';
import path from 'node:path';
import { productCenterRecipeCapabilityContracts } from '../adapters/product-center/product-center-recipe-capabilities';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import { sidebarNavigationCapability } from '../automation/recipe/sidebar-navigation-capability';
import { evaluateProductCenterRuntimeAcceptance } from '../automation/recipe/product-center-runtime-acceptance';
import {
  recipeCollectionFingerprint,
  validateAutomationRecipe,
} from '../automation/recipe/recipe-validator';
import contractDocument from '../contracts/product-center/product-center-test-contract.json';
import denominatorDocument from '../contracts/product-center/test-cases/product-center-coverage-denominator.json';
import {
  auditProductCenterClaimEvidence,
  type ProductCenterAssertionEvidence,
} from '../utils/product-center-claim-evidence';
import {
  auditProductCenterCoverage,
  type ProductCenterCoverageItem,
} from '../utils/product-center-coverage-denominator';
import {
  buildProductCenterItemIntakePilot,
  type ProductCenterItemPilotCapability,
} from '../utils/product-center-item-intake-pilot';
import { auditProductCenterTestCaseExecutability } from '../utils/product-center-test-case-executability';
import {
  auditProductCenterTestCases,
  type ProductCenterTestCaseInput,
} from '../utils/product-center-test-case-ir';
import { auditProductCenterTestCaseSemantics } from '../utils/product-center-test-case-semantics';
import { renderProductCenterRecipeSpec } from './generate-product-center-recipe-spec';
import {
  productCenterContractCollections,
  type ProductCenterTestContract,
} from '../utils/product-center-test-contract';

const selectedCaseIds = [
  'TC-ITEM-STD-002',
  'TC-ITEM-STD-005',
  'TC-ITEM-STD-010',
  'TC-ITEM-STD-016',
  'TC-ITEM-STD-018',
  'TC-ITEM-STD-021',
  'TC-ITEM-STD-028',
  'TC-ITEM-STD-031',
  'TC-ITEM-STD-036',
  'TC-ITEM-STD-038',
  'TC-ITEM-STD-068',
  'TC-ITEM-STD-069',
  'TC-ITEM-STD-070',
  'TC-ITEM-STD-075',
  'TC-ITEM-STD-093',
] as const;

const exactExistingScripts = new Map([
  ['TC-ITEM-STD-002', 'tests/e2e/item-list.spec.ts'],
  ['TC-ITEM-STD-005', 'tests/e2e/item-list-advanced.spec.ts'],
  ['TC-ITEM-STD-016', 'tests/e2e/item-create-standard.spec.ts'],
  ['TC-ITEM-STD-018', 'tests/e2e/item-create-standard.spec.ts'],
  ['TC-ITEM-STD-036', 'tests/e2e/item-create-standard.spec.ts'],
]);

const partialExistingScripts = new Map([
  ['TC-ITEM-STD-028', 'tests/e2e/item-list-advanced.spec.ts'],
  ['TC-ITEM-STD-068', 'tests/e2e/item-list-advanced.spec.ts'],
]);

const expectedMutations = new Set([
  'TC-ITEM-STD-016',
  'TC-ITEM-STD-018',
  'TC-ITEM-STD-031',
  'TC-ITEM-STD-036',
  'TC-ITEM-STD-068',
]);

const sourceEvidenceByCaseId: Record<string, string[]> = {
  'TC-ITEM-STD-002': ['mapping:139c6a17872d'],
  'TC-ITEM-STD-005': ['/pp/brand/list#control-3'],
  'TC-ITEM-STD-010': ['/pp/brand/list#control-3'],
  'TC-ITEM-STD-016': ['/pp/brand/list#control-3'],
  'TC-ITEM-STD-018': ['/pp/brand/list#control-3'],
  'TC-ITEM-STD-021': ['/pp/brand/list#control-3'],
  'TC-ITEM-STD-028': ['/pp/brand/list#control-4', 'mapping:139c6a17872d'],
  'TC-ITEM-STD-031': ['/pp/brand/list#control-5', 'mapping:139c6a17872d'],
  'TC-ITEM-STD-036': ['/pp/brand/list#control-3'],
  'TC-ITEM-STD-038': ['/pp/brand/list#control-3'],
  'TC-ITEM-STD-068': ['/pp/brand/list#action-6#primary-1'],
  'TC-ITEM-STD-069': ['/pp/brand/list#action-6#primary-1'],
  'TC-ITEM-STD-070': ['/pp/brand/list#action-6#primary-1'],
  'TC-ITEM-STD-075': ['/pp/brand/list#action-6#primary-1'],
  'TC-ITEM-STD-093': ['/pp/brand/list#control-3'],
};

const itemRequiredUiEvidenceId = 'ui-runtime:item-standard-name-required:2026-07-25';
const itemRequiredNetworkEvidenceId = 'network-runtime:item-standard-create-request-absent:2026-07-25';
const itemRequiredApiEvidenceId = 'api-runtime:item-total-count-unchanged:2026-07-25';

const runtimeEvidenceRecords = [
  {
    id: itemRequiredUiEvidenceId,
    caseId: 'TC-ITEM-STD-005',
    sourceType: 'ui-runtime',
    path: '/pp/brand/create/standard',
    status: 'observed',
    verifiedAt: '2026-07-25',
    evidence: { visibleText: 'Please enter product name', visibleCount: 1, ariaRequired: true },
  },
  {
    id: itemRequiredNetworkEvidenceId,
    caseId: 'TC-ITEM-STD-005',
    sourceType: 'network-runtime',
    path: 'POST /ops-brand/brand-items/standard',
    status: 'observed',
    verifiedAt: '2026-07-25',
    evidence: { requestCount: 0 },
  },
  {
    id: itemRequiredApiEvidenceId,
    caseId: 'TC-ITEM-STD-005',
    sourceType: 'api-runtime',
    path: 'brand-menu:POST /ops-brand/brand-items/pageQuery',
    status: 'observed',
    verifiedAt: '2026-07-25',
    evidence: { field: 'data.totalCount', beforeEqualsAfter: true },
  },
] as const;

const assertionEvidenceByCaseId = new Map<string, ProductCenterAssertionEvidence[]>([
  ['TC-ITEM-STD-005', [
    {
      claimId: 'claim:TC-ITEM-STD-005:precondition:1',
      evidenceType: 'visible-ui',
      semanticKey: 'merchant-center-authenticated-context',
      observableId: 'merchant-shell:product-management entry visible for brand 000407',
      observableSemanticKey: 'merchant-center-authenticated-context',
      observableVisibility: 'visible',
      sourceIds: ['route:cc612d39a954'],
      assertionAdapterId: 'context.verifyMerchantEntry',
    },
    {
      claimId: 'claim:TC-ITEM-STD-005:action:1',
      evidenceType: 'visible-ui',
      semanticKey: 'sidebar-open-item-list',
      observableId: 'sidebar:/pp/brand/list arrived',
      observableSemanticKey: 'sidebar-open-item-list',
      observableVisibility: 'visible',
      sourceIds: ['route:cc612d39a954', itemRequiredUiEvidenceId],
      capabilityId: 'navigation.sidebar.open',
      sequence: 1,
      pageState: '/pp/brand/list',
    },
    {
      claimId: 'claim:TC-ITEM-STD-005:action:2',
      evidenceType: 'visible-ui',
      semanticKey: 'open-add-item-entry',
      observableId: 'button:plus Add Item opened type selector',
      observableSemanticKey: 'open-add-item-entry',
      observableVisibility: 'visible',
      sourceIds: [itemRequiredUiEvidenceId],
      capabilityId: 'item.validateRequiredName',
      sequence: 2,
      pageState: '/pp/brand/list',
    },
    {
      claimId: 'claim:TC-ITEM-STD-005:action:3',
      evidenceType: 'visible-ui',
      semanticKey: 'open-standard-create',
      observableId: 'card:Standard Product create entry opened standard create page',
      observableSemanticKey: 'open-standard-create',
      observableVisibility: 'visible',
      sourceIds: [itemRequiredUiEvidenceId],
      capabilityId: 'item.validateRequiredName',
      sequence: 3,
      pageState: '/pp/brand/create/standard',
    },
    {
      claimId: 'claim:TC-ITEM-STD-005:action:4',
      evidenceType: 'visible-ui',
      semanticKey: 'leave-name-empty',
      observableId: 'input:product-name left empty',
      observableSemanticKey: 'leave-name-empty',
      observableVisibility: 'visible',
      sourceIds: [itemRequiredUiEvidenceId],
      capabilityId: 'item.validateRequiredName',
      sequence: 4,
      pageState: '/pp/brand/create/standard',
    },
    {
      claimId: 'claim:TC-ITEM-STD-005:action:5',
      evidenceType: 'visible-ui',
      semanticKey: 'fill-required-non-name-fields',
      observableId: 'single-spec selected and standard price 10.00 entered',
      observableSemanticKey: 'fill-required-non-name-fields',
      observableVisibility: 'visible',
      sourceIds: [itemRequiredUiEvidenceId],
      capabilityId: 'item.validateRequiredName',
      sequence: 5,
      pageState: '/pp/brand/create/standard',
    },
    {
      claimId: 'claim:TC-ITEM-STD-005:action:6',
      evidenceType: 'visible-ui',
      semanticKey: 'submit-standard-create',
      observableId: 'save clicked with empty product name',
      observableSemanticKey: 'submit-standard-create',
      observableVisibility: 'visible',
      sourceIds: [itemRequiredUiEvidenceId, itemRequiredNetworkEvidenceId],
      capabilityId: 'item.validateRequiredName',
      sequence: 6,
      pageState: '/pp/brand/create/standard',
    },
    {
      claimId: 'claim:TC-ITEM-STD-005:expectation:1',
      evidenceType: 'network',
      semanticKey: 'standard-item-save-blocked',
      observableId: 'POST /ops-brand/brand-items/standard requestCount=0 and create route retained',
      observableSemanticKey: 'standard-item-save-blocked',
      observableVisibility: 'not-applicable',
      sourceIds: [itemRequiredUiEvidenceId, itemRequiredNetworkEvidenceId],
      assertionAdapterId: 'productCenter.verifyItemRequiredValidationUi',
    },
    {
      claimId: 'claim:TC-ITEM-STD-005:expectation:2',
      evidenceType: 'visible-ui',
      semanticKey: 'product-name-required',
      observableId: 'visible-text:Please enter product name',
      observableSemanticKey: 'product-name-required',
      observableVisibility: 'visible',
      sourceIds: [itemRequiredUiEvidenceId],
      assertionAdapterId: 'productCenter.verifyItemRequiredValidationUi',
    },
    {
      claimId: 'claim:TC-ITEM-STD-005:expectation:3',
      evidenceType: 'api',
      semanticKey: 'standard-item-not-created',
      observableId: 'data.totalCount unchanged and create requestCount=0',
      observableSemanticKey: 'standard-item-not-created',
      observableVisibility: 'not-applicable',
      sourceIds: [itemRequiredNetworkEvidenceId, itemRequiredApiEvidenceId],
      assertionAdapterId: 'productCenter.verifyItemNotCreated',
    },
  ]],
]);

export async function buildProductCenterItemIntakePilotArtifacts(
  rootDir = process.cwd(),
  sourcePath = defaultSourcePath(),
): Promise<{
  casesPath: string;
  bindingsPath: string;
  sourceRegistryPath: string;
  gapsPath: string;
  reportPath: string;
  recipesPath: string;
  specPath: string;
}> {
  const contract = contractDocument as unknown as ProductCenterTestContract;
  const fileName = path.basename(sourcePath);
  const sourceRegistry = [
    ...selectedCaseIds.map((caseId) => ({
      id: sourceRecordId(caseId),
      caseId,
      sourceType: 'formal-test-case',
      path: sourcePath,
      heading: `用例编号：${caseId}`,
      status: 'confirmed',
    })),
    ...runtimeEvidenceRecords,
  ];
  const contractSourceIds = new Set(productCenterContractCollections
    .filter((collection) => collection !== 'traceability')
    .flatMap((collection) => (contract[collection] ?? []).map((record) => record.id)));
  sourceRegistry.forEach((record) => contractSourceIds.add(record.id));
  const sourceBindings = Object.fromEntries(selectedCaseIds.map((caseId) => [
    sourceRef(fileName, caseId),
    [
      sourceRecordId(caseId),
      'route:cc612d39a954',
      ...sourceEvidenceByCaseId[caseId],
      ...(caseId === 'TC-ITEM-STD-005' ? runtimeEvidenceRecords.map((record) => record.id) : []),
    ],
  ]));
  const result = buildProductCenterItemIntakePilot({
    fileName,
    markdown: fs.readFileSync(sourcePath, 'utf8'),
    selectedCaseIds: [...selectedCaseIds],
    sourceBindings,
    sourceIds: contractSourceIds,
    capabilityByCaseId: new Map<string, ProductCenterItemPilotCapability>(
      selectedCaseIds.map((caseId) => [
        caseId,
        caseId === 'TC-ITEM-STD-005'
          ? { capabilityIds: ['navigation.sidebar.open', 'item.validateRequiredName'], automationPreference: 'candidate' }
          : { capabilityIds: [], automationPreference: 'manual' },
      ]),
    ),
  });
  const cases: ProductCenterTestCaseInput[] = result.cases.map((item) => {
    const mutatesData = expectedMutations.has(item.id);
    return {
      ...item,
      mutatesData,
      cleanup: mutatesData ? ['人工执行后通过 API 按服务端 ID 清理本用例数据并验证零残留'] : [],
      coverageIds: coverageIdsFor(item.id),
      execution: {
        ...item.execution!,
        mutationMode: mutatesData ? 'api-seeded-ui-action' as const : 'none' as const,
        verificationSignals: item.id === 'TC-ITEM-STD-005'
          ? ['api', 'ui', 'network']
          : mutatesData ? ['api', 'ui'] : ['ui'],
        seedAdapterIds: mutatesData ? ['manual.prepareItemData'] : [],
        cleanupAdapterIds: mutatesData ? ['manual.cleanupItemData'] : [],
      },
    };
  });
  const knownSourceIds = contractSourceIds;
  const baseAudit = auditProductCenterTestCases(cases, { knownSourceIds });
  const semanticAudit = auditProductCenterTestCaseSemantics(cases, { knownSourceIds });
  const coverageAudit = auditProductCenterCoverage(
    cases,
    (denominatorDocument as { items: ProductCenterCoverageItem[] }).items,
  );
  const executabilityAudit = auditProductCenterTestCaseExecutability(cases, {
    roleIds: new Set(['merchant-center-product-admin']),
    environmentIds: new Set(['balamxqa']),
    capabilityIds: new Set(['navigation.sidebar.open', 'item.openList', 'item.validateRequiredName']),
  });
  const staticPromotionGates = cases.map((item) => ({
    caseId: item.id,
    ...auditProductCenterClaimEvidence(item, assertionEvidenceByCaseId.get(item.id) ?? []),
  }));
  const recipes = staticPromotionGates
    .filter((gate) => gate.compileCandidate)
    .map((gate) => {
      const testCase = cases.find((item) => item.id === gate.caseId);
      if (!testCase) throw new Error(`试点用例缺失：${gate.caseId}`);
      return buildCompileCandidateRecipe(testCase);
    });
  const recipeIssues = recipes.flatMap((recipe) => validateAutomationRecipe(
    recipe,
    productCenterRecipeCapabilityContracts,
  ));
  if (recipeIssues.length > 0) {
    throw new Error(`商品试点 Recipe 校验失败：${JSON.stringify(recipeIssues)}`);
  }
  const recipesFingerprint = recipeCollectionFingerprint(recipes);
  const runtimeAcceptedCaseIds = readRuntimeAcceptedCaseIds(rootDir, recipesFingerprint, recipes);
  const promotionGates = staticPromotionGates.map((gate) => ({
    ...gate,
    runtimeAccepted: gate.compileCandidate && runtimeAcceptedCaseIds.has(gate.caseId),
  }));
  const compileCandidates = promotionGates.filter((item) => item.compileCandidate).length;
  const runtimeAccepted = promotionGates.filter((item) => item.runtimeAccepted).length;
  const capabilityGaps = selectedCaseIds
    .filter((caseId) => !promotionGates.some((gate) => gate.caseId === caseId && gate.compileCandidate))
    .map((caseId) => capabilityGap(caseId));
  const qualityPassed = result.unresolved.length === 0
    && baseAudit.summary.reviewRequired === 0
    && semanticAudit.summary.reviewRequired === 0
    && executabilityAudit.summary.reviewRequired === 0
    && coverageAudit.unknownCoverageIds.length === 0;
  const summary = {
    total: cases.length,
    sourceBound: cases.filter((item) => item.sourceIds.length > 0).length,
    semanticPassed: semanticAudit.summary.passed,
    exactExistingScripts: exactExistingScripts.size,
    partialExistingScripts: partialExistingScripts.size,
    missingExistingScripts: cases.length - exactExistingScripts.size - partialExistingScripts.size,
    compileCandidates,
    runtimeAccepted,
    generatedRecipes: recipes.length,
    promotable: runtimeAccepted,
    excludedMalformedSourceCases: 1,
  };
  const sourceQualityExclusions = [{
    caseId: 'TC-ITEM-STD-001',
    replacementCaseId: 'TC-ITEM-STD-002',
    reason: '步骤和预期包含重复编号拼接，禁止自动猜测改写',
  }];
  const paths = {
    casesPath: artifactPath(rootDir, 'contracts/product-center/test-cases/pilots/item-intake-test-cases.json'),
    bindingsPath: artifactPath(rootDir, 'contracts/product-center/test-cases/pilots/item-intake-source-bindings.json'),
    sourceRegistryPath: artifactPath(rootDir, 'contracts/product-center/test-cases/pilots/item-intake-source-registry.json'),
    gapsPath: artifactPath(rootDir, 'contracts/product-center/test-cases/pilots/item-intake-capability-gaps.json'),
    reportPath: artifactPath(rootDir, 'output/test-case-audit/product-center/item-intake-pilot-latest.json'),
    recipesPath: artifactPath(rootDir, 'contracts/product-center/recipes/product-center-item-intake-pilot-recipes.json'),
    specPath: artifactPath(rootDir, 'tests/generated/product-center-item-intake-pilot.generated.spec.ts'),
  };
  writeJson(paths.casesPath, { schemaVersion: '1.0.0', cases });
  writeJson(paths.bindingsPath, {
    schemaVersion: '1.0.0',
    bindings: Object.entries(sourceBindings).map(([ref, sourceIds]) => ({ ref, sourceIds })),
  });
  writeJson(paths.sourceRegistryPath, { schemaVersion: '1.0.0', records: sourceRegistry });
  writeJson(paths.gapsPath, { schemaVersion: '1.0.0', gaps: capabilityGaps });
  writeJson(paths.recipesPath, {
    schemaVersion: '1.0.0',
    fingerprint: recipesFingerprint,
    recipes,
  });
  writeText(paths.specPath, renderProductCenterRecipeSpec({
    suiteTitle: '商品管理正式用例接入试点',
    recipesImportPath: '../../contracts/product-center/recipes/product-center-item-intake-pilot-recipes.json',
    stepTitle: '按编译后的 Recipe 执行商品名称必填负向 SOP',
    attachRuntimeEvidence: true,
  }));
  writeJson(paths.reportPath, {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    sourcePath,
    status: qualityPassed ? 'passed-with-capability-gaps' : 'review-required',
    summary,
    sourceQualityExclusions,
    unresolvedSources: result.unresolved,
    baseAudit,
    semanticAudit,
    coverageAudit,
    executabilityAudit,
    promotionGates,
    capabilityGaps,
  });
  return paths;
}

function buildCompileCandidateRecipe(testCase: ProductCenterTestCaseInput): AutomationRecipe {
  if (testCase.id !== 'TC-ITEM-STD-005') {
    throw new Error(`商品试点尚未声明 Recipe 编译器：${testCase.id}`);
  }
  return {
    schemaVersion: '1.0.0',
    id: 'product-center:item-required-name:negative',
    caseId: testCase.id,
    title: testCase.title,
    tags: ['@item-intake-pilot', '@negative', '@item-validation'],
    route: '/pp/brand/create/standard',
    action: 'negative',
    traceabilityId: `trace:sop:${testCase.id}`,
    sourceIds: [...testCase.sourceIds],
    claimIds: testCase.claims?.map((claim) => claim.id) ?? [],
    coverageIds: [...(testCase.coverageIds ?? [])],
    generationAllowed: true,
    capabilities: [
      sidebarNavigationCapability('/pp/brand/list'),
      { id: 'item.validateRequiredName', saveAs: 'validation' },
    ],
    assertions: [
      {
        adapterId: 'productCenter.verifyItemRequiredValidationUi',
        input: { result: { $ref: '$result.validation' } },
      },
      {
        adapterId: 'productCenter.verifyItemNotCreated',
        input: { result: { $ref: '$result.validation' } },
      },
    ],
  };
}

function capabilityGap(caseId: string) {
  const exactScript = exactExistingScripts.get(caseId);
  const partialScript = partialExistingScripts.get(caseId);
  return {
    caseId,
    disposition: 'review-required',
    evidence: exactScript ?? partialScript ?? null,
    reason: caseId === 'TC-ITEM-STD-002'
      ? '创建时间排序缺少可见字段或 API createdAt 语义映射，禁止使用隐藏 Action Time 替代'
      : exactScript
      ? '现有脚本缺少正式 Recipe 生命周期和定位器治理，禁止直接晋级'
      : partialScript
        ? '现有脚本仅覆盖部分场景，且缺少正式 Recipe 生命周期和定位器治理'
        : '当前没有与正式用例精确匹配的受治理自动化能力',
  };
}

function coverageIdsFor(caseId: string): string[] {
  const evidence = sourceEvidenceByCaseId[caseId] ?? [];
  return [
    'coverage:route:route:cc612d39a954',
    ...evidence.flatMap((sourceId) => {
      if (sourceId.startsWith('/pp/brand/list#control-')) return [`coverage:control:${sourceId}`];
      if (sourceId.startsWith('/pp/brand/list#action-')) return [`coverage:dialog:${sourceId}`];
      return [];
    }),
  ];
}

function sourceRef(fileName: string, caseId: string): string {
  return `TEST-SCHEME:${fileName}#${caseId}`;
}

function sourceRecordId(caseId: string): string {
  return `test-scheme:item:${caseId}`;
}

function readRuntimeAcceptedCaseIds(
  rootDir: string,
  fingerprint: string,
  recipes: readonly AutomationRecipe[],
): Set<string> {
  const feedbackPath = artifactPath(
    rootDir,
    'output/recipes/product-center-item-intake-pilot-feedback.json',
  );
  const evidencePath = artifactPath(
    rootDir,
    'output/recipes/product-center-item-intake-pilot-evidence.json',
  );
  if (!fs.existsSync(feedbackPath) || !fs.existsSync(evidencePath)) return new Set();
  const feedback = JSON.parse(fs.readFileSync(feedbackPath, 'utf8')) as {
    fingerprint?: string;
    entries?: Array<{ recipeId?: string; caseId?: string; status?: string }>;
  };
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8')) as {
    fingerprint?: string;
    entries?: Array<{
      recipeId?: string;
      caseId?: string;
      expectedClaimIds?: string[];
      verifiedClaimIds?: string[];
      duplicateVerifiedClaimIds?: string[];
      claimCoverageComplete?: boolean;
      sidebarEntryVerified?: boolean;
    }>;
  };
  const acceptance = evaluateProductCenterRuntimeAcceptance({
    collectionId: 'item-intake',
    fingerprint,
    recipes: recipes.map((recipe) => ({
      recipeId: recipe.id,
      claimIds: recipe.claimIds ?? [],
    })),
    feedback,
    evidence,
    safety: {
      incompleteCheckpoints: 0,
      sensitiveFindings: 0,
      authStateArtifacts: 0,
      forbiddenPatterns: 0,
    },
  });
  return new Set(acceptance.acceptedCaseIds);
}
function artifactPath(rootDir: string, relativePath: string): string {
  return path.join(rootDir, relativePath);
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

function defaultSourcePath(): string {
  return path.resolve(
    process.cwd(),
    '..',
    'Merchant Center Info',
    '00-待转换测试方案',
    '用例库',
    '商品中心-商品管理-商品',
    '1.商品中心-商品管理-商品-正式测试用例.md',
  );
}

async function main(): Promise<void> {
  const paths = await buildProductCenterItemIntakePilotArtifacts();
  process.stdout.write(`商品管理测试方案接入试点已生成：${paths.reportPath}\n`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}






