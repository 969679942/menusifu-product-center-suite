import type { ProductCenterTestCaseInput } from '../../../utils/product-center-test-case-ir';
import type {
  ProductCenterGenerationDecision,
} from '../../../utils/product-center-generation-quality';
import type {
  ProductCenterGenerationCohort,
  ProductCenterGenerationScenario,
} from '../../../utils/product-center-quality-program';

type HoldoutSample = {
  candidate: ProductCenterTestCaseInput;
  expectedDecision: ProductCenterGenerationDecision;
  cohort: ProductCenterGenerationCohort;
  scenario: ProductCenterGenerationScenario;
  productArchetype: ProductArchetype;
  labelSource: 'human-reviewed-holdout';
};

type ProductArchetype = 'standard' | 'combo' | 'addon';

const sourceRef = 'PRD明确：商品中心独立生成评测样本';

export const productCenterGenerationHoldout = {
  schemaVersion: '1.0.0',
  collectionId: 'product-center-generation-holdout',
  policy: {
    participatesInRelease: false,
    labelSource: 'human-reviewed-holdout',
    minimumSamples: 36,
    requiredDecisions: ['generated', 'review-required'],
    requiredProductArchetypes: ['standard', 'combo', 'addon'],
    requiredScenarios: ['positive', 'boundary', 'blocked', 'review-required', 'format-drift'],
  },
  samples: [
    sample({
      id: 'read:holdout-standard-search', productArchetype: 'standard', scenario: 'positive',
      title: '按名称查询标准商品时仅展示匹配记录',
    }),
    sample({
      id: 'negative:holdout-standard-required-name', productArchetype: 'standard', scenario: 'boundary',
      title: '标准商品名称为空时提交显示必填校验',
    }),
    sample({
      id: 'create:holdout-standard-valid', productArchetype: 'standard', scenario: 'positive',
      title: '标准商品具备正式来源和清理合同时允许生成', mutatesData: true, cleanupComplete: true,
    }),
    sample({
      id: 'edit:holdout-standard-price-boundary', productArchetype: 'standard', scenario: 'boundary',
      title: '标准商品价格命中已定义边界时允许生成', mutatesData: true, cleanupComplete: true,
    }),
    sample({
      id: 'create:holdout-standard-legacy', productArchetype: 'standard', scenario: 'review-required',
      title: '仅有旧规则线索的标准商品用例不得生成', expectedDecision: 'review-required',
      basisKind: 'legacy-baseline',
    }),
    sample({
      id: 'edit:holdout-standard-no-sidebar', productArchetype: 'standard', scenario: 'blocked',
      title: '缺少侧边栏入口的标准商品用例不得生成', expectedDecision: 'review-required',
      capabilityIds: ['coreEdit.execute'],
    }),
    sample({
      id: 'delete:holdout-standard-no-cleanup', productArchetype: 'standard', scenario: 'blocked',
      title: '缺少清理合同的标准商品删除用例不得生成', expectedDecision: 'review-required',
      mutatesData: true,
    }),
    sample({
      id: 'read:holdout-standard-format', productArchetype: 'standard', scenario: 'format-drift',
      title: '测试', expectedDecision: 'review-required',
    }),
    sample({
      id: 'read:holdout-combo-groups', productArchetype: 'combo', scenario: 'positive',
      title: '套餐商品创建页展示已配置套餐分组',
    }),
    sample({
      id: 'negative:holdout-combo-required-group', productArchetype: 'combo', scenario: 'boundary',
      title: '套餐商品未添加套餐分组时提交被拒绝',
    }),
    sample({
      id: 'create:holdout-combo-valid', productArchetype: 'combo', scenario: 'positive',
      title: '套餐商品具备正式来源和清理合同时允许生成', mutatesData: true, cleanupComplete: true,
    }),
    sample({
      id: 'edit:holdout-combo-selection-boundary', productArchetype: 'combo', scenario: 'boundary',
      title: '套餐商品选搭配规则命中已定义边界时允许生成', mutatesData: true, cleanupComplete: true,
    }),
    sample({
      id: 'create:holdout-combo-conflict', productArchetype: 'combo', scenario: 'review-required',
      title: '来源冲突的套餐商品用例不得直接生成', expectedDecision: 'review-required',
      evidenceLevel: 'conflicting',
    }),
    sample({
      id: 'edit:holdout-combo-no-source', productArchetype: 'combo', scenario: 'review-required',
      title: '缺少逐项来源的套餐商品用例不得生成', expectedDecision: 'review-required', omitClaims: true,
    }),
    sample({
      id: 'delete:holdout-combo-no-cleanup', productArchetype: 'combo', scenario: 'blocked',
      title: '缺少清理合同的套餐商品删除用例不得生成', expectedDecision: 'review-required',
      mutatesData: true,
    }),
    sample({
      id: 'read:holdout-combo-format', productArchetype: 'combo', scenario: 'format-drift',
      title: '功能测试', expectedDecision: 'review-required',
    }),
    sample({
      id: 'read:holdout-addon-search', productArchetype: 'addon', scenario: 'positive',
      title: '按名称查询加料商品时仅展示匹配记录',
    }),
    sample({
      id: 'negative:holdout-addon-required-price', productArchetype: 'addon', scenario: 'boundary',
      title: '加料商品价格为空时提交显示必填校验',
    }),
    sample({
      id: 'create:holdout-addon-valid', productArchetype: 'addon', scenario: 'positive',
      title: '加料商品具备正式来源和清理合同时允许生成', mutatesData: true, cleanupComplete: true,
    }),
    sample({
      id: 'edit:holdout-addon-price-boundary', productArchetype: 'addon', scenario: 'boundary',
      title: '加料商品价格命中已定义边界时允许生成', mutatesData: true, cleanupComplete: true,
    }),
    sample({
      id: 'create:holdout-addon-invalid-inference', productArchetype: 'addon', scenario: 'review-required',
      title: '无一步推导依据的加料商品用例不得生成', expectedDecision: 'review-required',
      basisKind: 'single-step-inference', invalidInference: true,
    }),
    sample({
      id: 'publish:holdout-addon-unknown-action', productArchetype: 'addon', scenario: 'blocked',
      title: '未知动作类型的加料商品用例不得生成', expectedDecision: 'review-required',
    }),
    sample({
      id: 'delete:holdout-addon-no-cleanup', productArchetype: 'addon', scenario: 'blocked',
      title: '缺少清理合同的加料商品删除用例不得生成', expectedDecision: 'review-required',
      mutatesData: true,
    }),
    sample({
      id: 'read:holdout-addon-format', productArchetype: 'addon', scenario: 'format-drift',
      title: '页面正常', expectedDecision: 'review-required',
    }),
    sample({
      id: 'edit:holdout-standard-format-normalizable', productArchetype: 'standard', scenario: 'format-drift',
      title: '标准商品编号格式可正规化时仍允许生成', numberedLists: true,
    }),
    sample({
      id: 'read:holdout-standard-partial-source-trace', productArchetype: 'standard', scenario: 'review-required',
      title: '部分 Claim 缺少来源追溯的标准商品用例不得生成', expectedDecision: 'review-required',
      omitSourceTraceForExpectation: true,
    }),
    sample({
      id: 'create:holdout-standard-unknown-module', productArchetype: 'standard', scenario: 'blocked',
      title: '未知模块的标准商品用例不得生成', expectedDecision: 'review-required', module: 'unknown-item-module',
    }),
    sample({
      id: 'draft:holdout-standard-structural-gap', productArchetype: 'standard', scenario: 'blocked',
      title: '结构缺失的标准商品草稿不得生成', expectedDecision: 'review-required', emptyStructure: true,
    }),
    sample({
      id: 'edit:holdout-combo-format-normalizable', productArchetype: 'combo', scenario: 'format-drift',
      title: '套餐商品编号格式可正规化时仍允许生成', numberedLists: true,
    }),
    sample({
      id: 'create:holdout-combo-invalid-inference', productArchetype: 'combo', scenario: 'review-required',
      title: '无一步推导依据的套餐商品用例不得生成', expectedDecision: 'review-required',
      basisKind: 'single-step-inference', invalidInference: true,
    }),
    sample({
      id: 'read:holdout-combo-unparseable-br-ref', productArchetype: 'combo', scenario: 'review-required',
      title: '无法解析正式规则编号的套餐商品用例不得生成', expectedDecision: 'review-required',
      basisKind: 'business-rule-explicit',
    }),
    sample({
      id: 'edit:holdout-combo-no-sidebar', productArchetype: 'combo', scenario: 'blocked',
      title: '再次缺少侧边栏入口的套餐商品用例不得生成', expectedDecision: 'review-required',
      capabilityIds: ['coreEdit.execute'],
    }),
    sample({
      id: 'edit:holdout-addon-format-normalizable', productArchetype: 'addon', scenario: 'format-drift',
      title: '加料商品编号格式可正规化时仍允许生成', numberedLists: true,
    }),
    sample({
      id: 'create:holdout-addon-legacy', productArchetype: 'addon', scenario: 'review-required',
      title: '仅有旧规则线索的加料商品用例不得生成', expectedDecision: 'review-required',
      basisKind: 'legacy-baseline',
    }),
    sample({
      id: 'edit:holdout-addon-conflict', productArchetype: 'addon', scenario: 'review-required',
      title: '来源冲突的加料商品用例不得直接生成', expectedDecision: 'review-required',
      evidenceLevel: 'conflicting',
    }),
    sample({
      id: 'read:holdout-addon-structural-gap', productArchetype: 'addon', scenario: 'blocked',
      title: '未知模块且结构缺失的加料商品用例不得生成', expectedDecision: 'review-required',
      module: 'unknown-addon-module', emptyStructure: true,
    }),
  ],
} as const satisfies {
  schemaVersion: '1.0.0';
  collectionId: string;
  policy: Record<string, unknown>;
  samples: readonly HoldoutSample[];
};

function sample(input: {
  id: string;
  productArchetype: ProductArchetype;
  title: string;
  expectedDecision?: ProductCenterGenerationDecision;
  scenario: ProductCenterGenerationScenario;
  basisKind?: 'prd-explicit' | 'business-rule-explicit' | 'legacy-baseline' | 'single-step-inference';
  capabilityIds?: string[];
  evidenceLevel?: 'confirmed' | 'conflicting';
  mutatesData?: boolean;
  cleanupComplete?: boolean;
  omitClaims?: boolean;
  invalidInference?: boolean;
  module?: string;
  emptyStructure?: boolean;
  numberedLists?: boolean;
  omitSourceTraceForExpectation?: boolean;
}): HoldoutSample {
  const expectedDecision = input.expectedDecision ?? 'generated';
  const cohort = expectedDecision === 'generated' ? 'real-source' : 'negative-fixture';
  const precondition = `${input.numberedLists ? '1. ' : ''}已登录 Merchant Center QA 环境并选择测试商户`;
  const action = `${input.numberedLists ? '2. ' : ''}对${productLabel(input.productArchetype)}执行${input.id.split(':')[0]}场景操作`;
  const expectation = `${input.numberedLists ? '3. ' : ''}${productLabel(input.productArchetype)}页面展示与正式来源一致的可观测结果`;
  const statements = [
    { kind: 'precondition' as const, text: precondition },
    { kind: 'action' as const, text: action },
    { kind: 'expectation' as const, text: expectation },
  ];
  const candidate: ProductCenterTestCaseInput = {
    id: input.id,
    module: input.module ?? 'brand-item',
    route: input.id.startsWith('read:') ? '/pp/brand/list' : '/pp/brand/create',
    title: input.title,
    priority: 'P1',
    sourceIds: ['holdout:product-center-generation'],
    sourceRefs: [sourceRef],
    preconditions: input.emptyStructure ? [] : [precondition],
    actions: input.emptyStructure ? [] : [action],
    expectedResults: input.emptyStructure ? [] : [expectation],
    mutatesData: input.mutatesData ?? false,
    cleanup: input.cleanupComplete ? ['按服务端 ID 清理本次 AUTO_AUDIT 数据并核验 UI/API 零残留'] : [],
    claims: input.omitClaims ? [] : statements.map((statement, index) => ({
      id: `${input.id}:${statement.kind}-${index + 1}`,
      kind: statement.kind,
      text: statement.text,
      sourceIds: ['holdout:product-center-generation'],
      sourceRefs: [sourceRef],
      evidenceLevel: input.evidenceLevel ?? 'confirmed',
      sourceTrace: input.omitSourceTraceForExpectation && statement.kind === 'expectation' ? undefined : {
        businessBasis: {
          kind: input.basisKind ?? 'prd-explicit',
          refs: [sourceRef],
          ...(input.basisKind === 'single-step-inference' && !input.invalidInference
            ? { rationale: '正式字段约束的一步直接结果', hopCount: 1 as const }
            : {}),
        },
        executionEvidence: [],
      },
    })),
    execution: {
      roleIds: ['merchant-center-product-admin'],
      environmentIds: ['balamxqa'],
      capabilityIds: input.capabilityIds ?? ['navigation.sidebar.open', 'coreRead.execute'],
      mutationMode: input.mutatesData ? 'ui-create' : 'none',
      verificationSignals: ['ui'],
      seedAdapterIds: [],
      cleanupAdapterIds: input.cleanupComplete ? ['productCenter.cleanupHoldoutFixture'] : [],
      asyncPolicy: 'none',
    },
  };
  return {
    candidate,
    expectedDecision,
    cohort,
    scenario: input.scenario,
    productArchetype: input.productArchetype,
    labelSource: 'human-reviewed-holdout',
  };
}

function productLabel(productArchetype: ProductArchetype): string {
  return productArchetype === 'standard'
    ? '标准商品'
    : productArchetype === 'combo' ? '套餐商品' : '加料商品';
}
