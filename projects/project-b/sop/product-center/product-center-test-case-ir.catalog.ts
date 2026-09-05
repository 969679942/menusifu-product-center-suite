import recipesDocument from '../../contracts/product-center/recipes/product-center-pilot-recipes.json';
import { productCenterContractModules } from '../../contracts/product-center/modules';
import type {
  ProductCenterClaimSourceTrace,
  ProductCenterTestCaseInput,
  ProductCenterVerificationSignal,
} from '../../utils/product-center-test-case-ir';

type ProductCenterRecipeArtifact = {
  caseId: string;
  title: string;
  route: string;
  action: 'create' | 'edit' | 'delete' | 'negative' | 'boundary' | 'read';
  sourceIds: string[];
  coverageIds: string[];
  seed?: { adapterId: string };
  capabilities: Array<{ id: string }>;
  assertions: Array<{ adapterId: string }>;
  cleanup?: { adapterId: string };
};

type ProductCenterRecipeDocument = {
  recipes: ProductCenterRecipeArtifact[];
};

type VerifiedBusinessBasis = ProductCenterClaimSourceTrace['businessBasis'];

const verifiedBusinessBasisByCaseId: Readonly<Record<
  string,
  Partial<Record<'action' | 'expectation', VerifiedBusinessBasis>>
>> = {
  'negative:category-child-blocked-by-product': {
    action: {
      kind: 'xmind-existing',
      refs: [
        'TEST-PLAN:1.需求品牌商品与分类-测试用例.md#TC-需求1-150',
        'XMIND:1.商品中心-商品管理-商品.xmind#标准商品 / 新增 / 分类相关校验 / 一级分类下有商品，不可创建二级分类',
      ],
    },
    expectation: {
      kind: 'prd-explicit',
      refs: [
        'TEST-PLAN:1.需求品牌商品与分类-测试用例.md#TC-需求1-150',
        'PRD:1.需求品牌商品与分类.md#5.1.1 品牌商品 / 商品分类 3',
      ],
    },
  },
  'create:seasoning': sameVerifiedBasis(
    'xmind-existing',
    [
      'TEST-PLAN:3.商品中心-商品管理-调味管理-正式测试用例.md#TC-FLV-SEA-018',
      'XMIND:3.商品中心-商品管理-调味管理.xmind#新增 / 新增 / 新增调味组，只填必填参数，能新增成功 / 新增调味组，只填必填参数，能新增成功',
    ],
  ),
  'delete:description-tag': sameVerifiedBasis(
    'xmind-existing',
    [
      'TEST-PLAN:4.商品中心-商品管理-标签管理-正式测试用例.md#TC-TAG-DESC-017',
      'XMIND:4.商品中心-商品管理-标签管理.xmind#描述标签 / 删除 / 标签删除 / 标签未被引用，未被引用的标签可删除成功',
    ],
  ),
  'create:bom': sameVerifiedBasis(
    'xmind-existing',
    ['XMIND:BOM管理.xmind#BOM管理 / 功能 / 创建BOM / 新增BOM / 保存 / 除去失败的场景，都能成功'],
  ),
  'delete:print-stall': sameVerifiedBasis(
    'xmind-existing',
    ['XMIND:打印档口.xmind#打印档口 / 打印档口管理 / 操作 / 删除 / 档口未关联商品'],
  ),
  'delete:menu': sameVerifiedBasis(
    'xmind-existing',
    ['XMIND:商品中心-菜单管理-菜单.xmind#商品中心-菜单 / 菜单 / 菜单管理 / 删除 / 删除不在使用的菜单，删除成功 / 菜单1没有门店使用'],
  ),
  'delete:tax': {
    action: {
      kind: 'xmind-existing',
      refs: [
        'XMIND:商品中心-门店商品管理-税种管理.xmind#税种测试方案 / 功能 / 税种相关验证 / 未关联商品税种 / 税种删除 / 自定义税种删除',
      ],
    },
    expectation: {
      kind: 'business-rule-explicit',
      refs: ['BUSINESS-RULE:商品中心业务规则.md#BR-TAX-007'],
    },
  },
};

export function buildProductCenterTestCaseIrCatalog(
  document: ProductCenterRecipeDocument = recipesDocument as unknown as ProductCenterRecipeDocument,
): ProductCenterTestCaseInput[] {
  return document.recipes
    .map((recipe) => toTestCase(recipe))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function toTestCase(recipe: ProductCenterRecipeArtifact): ProductCenterTestCaseInput {
  const preconditions = recipe.seed ? ['通过 API 准备审计数据与依赖'] : [];
  const actions = [`通过 UI 执行${actionName(recipe.action)}操作`];
  const expectedResults = ['验证约定的 API 或 UI 终态'];
  const mutatesData = recipe.action === 'create' || recipe.action === 'edit' || recipe.action === 'delete';
  const verificationSignals: ProductCenterVerificationSignal[] = [];
  if (recipe.assertions.some((assertion) => assertion.adapterId.endsWith('Api'))) {
    verificationSignals.push('api');
  }
  if (recipe.assertions.some((assertion) => assertion.adapterId.endsWith('Ui'))) {
    verificationSignals.push('ui');
  }
  const verifiedSourceRefs = ['action', 'expectation']
    .flatMap((kind) => verifiedBusinessBasis(recipe.caseId, kind as 'action' | 'expectation')?.refs ?? []);
  return {
    id: recipe.caseId,
    module: resolveModule(recipe.route),
    route: recipe.route,
    title: recipe.title,
    priority: 'P0',
    sourceIds: recipe.sourceIds,
    ...(verifiedSourceRefs.length > 0 ? { sourceRefs: [...new Set(verifiedSourceRefs)] } : {}),
    preconditions,
    actions,
    expectedResults,
    mutatesData,
    cleanup: recipe.cleanup ? ['通过 API 清理审计数据并验证零残留'] : [],
    claims: [
      ...preconditions.map((text, index) => claim(recipe, 'precondition', text, index)),
      ...actions.map((text, index) => claim(recipe, 'action', text, index)),
      ...expectedResults.map((text, index) => claim(recipe, 'expectation', text, index)),
    ],
    coverageIds: recipe.coverageIds,
    execution: {
      roleIds: ['merchant-center-product-admin'],
      environmentIds: ['balamxqa'],
      capabilityIds: recipe.capabilities.map((capability) => capability.id),
      mutationMode: recipe.action === 'create'
          ? 'ui-create'
          : recipe.seed
            ? 'api-seeded-ui-action'
            : mutatesData
              ? 'api-seeded-ui-action'
              : 'none',
      verificationSignals: verificationSignals.length > 0 ? verificationSignals : ['ui'],
      seedAdapterIds: recipe.seed ? [recipe.seed.adapterId] : [],
      cleanupAdapterIds: recipe.cleanup ? [recipe.cleanup.adapterId] : [],
      asyncPolicy: 'none',
    },
  };
}

function claim(
  recipe: ProductCenterRecipeArtifact,
  kind: 'precondition' | 'action' | 'expectation',
  text: string,
  index: number,
) {
  const sourceIds = claimSources(recipe.sourceIds, kind);
  const verifiedBasis = verifiedBusinessBasis(recipe.caseId, kind);
  return {
    id: `claim:${recipe.caseId}:${kind}:${index + 1}`,
    kind,
    text,
    sourceIds,
    ...(verifiedBasis ? { sourceRefs: verifiedBasis.refs } : {}),
    evidenceLevel: verifiedBasis ? 'confirmed' as const : 'observed' as const,
    sourceTrace: {
      businessBasis: verifiedBasis ?? {
        kind: 'legacy-baseline' as const,
        refs: [`LEGACY-SOP:${recipe.caseId}`],
      },
      executionEvidence: [{
        kind: 'contract-observed' as const,
        sourceIds,
      }],
    },
  };
}

function verifiedBusinessBasis(
  caseId: string,
  kind: 'precondition' | 'action' | 'expectation',
): VerifiedBusinessBasis | undefined {
  if (kind === 'precondition') return undefined;
  return verifiedBusinessBasisByCaseId[caseId]?.[kind];
}

function sameVerifiedBasis(
  kind: 'xmind-existing',
  refs: string[],
): Record<'action' | 'expectation', VerifiedBusinessBasis> {
  return {
    action: { kind, refs },
    expectation: { kind, refs },
  };
}

function claimSources(
  sourceIds: readonly string[],
  kind: 'precondition' | 'action' | 'expectation',
): string[] {
  const preferred = sourceIds.find((sourceId) => {
    if (kind === 'action') return sourceId.includes('#control-');
    if (kind === 'expectation') return sourceId.startsWith('mapping:') || sourceId.startsWith('validation:');
    return sourceId.startsWith('route:') || sourceId.startsWith('rule:');
  });
  return preferred ? [preferred] : sourceIds.slice(0, 1);
}

function resolveModule(route: string): string {
  const matches = productCenterContractModules.filter((module) =>
    (module.routes as readonly string[]).includes(route));
  if (matches.length !== 1) {
    throw new Error(`测试用例路由必须唯一归属合同模块：${route}，实际 ${matches.length} 个`);
  }
  return matches[0].id;
}

function actionName(action: ProductCenterRecipeArtifact['action']): string {
  switch (action) {
    case 'create':
      return '创建';
    case 'edit':
      return '编辑';
    case 'delete':
      return '删除';
    case 'boundary':
      return '边界校验';
    case 'read':
      return '只读检查';
    default:
      return '反向校验';
  }
}
