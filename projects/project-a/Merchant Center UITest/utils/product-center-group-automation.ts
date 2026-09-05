import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hasLocalProductCenterFixtureCapability } from '../test-data/product-center/product-center-fixture-capabilities';
import { compileProductCenterGroupHandler } from './product-center-group-handler-compiler';
import {
  evaluateProductCenterGroupSemanticGate,
  loadProductCenterGroupDriftDecisionRegistry,
  qualifyProductCenterGroupDrift,
} from './product-center-group-semantic-gate';
import {
  loadProductCenterSourceGovernance,
  sourceDecisionBlocksExecution,
  sourceGovernanceReason,
  type ProductCenterSourceGovernanceRegistry,
} from './product-center-source-governance';
import type { RuntimeAssertionReceipt } from '../automation/system-test/system-test-runtime-contract';

export type GroupCase = {
  id: string;
  title: string;
  module: string;
  priority: 'P0' | 'P1' | 'P2';
  source: string;
  preconditions: string[];
  steps: string[];
  expectedResults: string[];
};

export type GroupCaseMode =
  | 'read-only'
  | 'crud-sop'
  | 'query-reset'
  | 'cancel'
  | 'form-validation'
  | 'selection-probe'
  | 'mutation-probe'
  | 'dependency-probe'
  | 'terminal-probe';

export type GroupEvidenceKind =
  | 'navigation'
  | 'ui-assertion'
  | 'api-read'
  | 'api-mutation'
  | 'no-write'
  | 'no-persist'
  | 'downstream'
  | 'cleanup';

export type GroupExecutionHandlerId =
  | 'group-list-structure'
  | 'group-query-reset'
  | 'group-multilang-query'
  | 'attribute-set-list-structure'
  | 'attribute-set-row-menu'
  | 'group-create-cancel'
  | 'existing-detail-cancel'
  | 'group-required-validation'
  | 'group-empty-options-validation'
  | 'group-name-duplicate-validation'
  | 'existing-detail-required-validation'
  | 'existing-detail-duplicate-validation'
  | 'method-group-and-detail-duplicate-validation'
  | 'empty-group-delete'
  | 'spec-cross-group-option-duplicate-validation'
  | 'spec-full-field-create'
  | 'single-detail-delete-boundary'
  | 'unreferenced-option-detail-delete'
  | 'referenced-option-detail-delete-blocked'
  | 'referenced-option-detail-delete-confirmed'
  | 'combo-empty-items-validation'
  | 'combo-v2-list-contract'
  | 'combo-v2-form-contract'
  | 'combo-v2-query-contract'
  | 'combo-v2-pkg030-validation'
  | 'combo-v2-create-contract'
  | 'combo-v2-reference-contract'
  | 'combo-v2-price-source-contract'
  | 'unreferenced-spec-detail-add'
  | 'spec-option-twenty-character-boundary'
  | 'option-group-create-required-only'
  | 'option-group-boundary-create'
  | 'method-create-required-only'
  | 'addon-product-selection'
  | 'combo-product-selection'
  | 'addon-group-create'
  | 'combo-group-create'
  | 'combo-cross-type-name-create'
  | 'combo-product-selection-cancel'
  | 'combo-multi-sku-create'
  | 'referenced-attribute-group-sync'
  | 'detached-reference-group-delete'
  | 'added-option-not-propagated'
  | 'addon-added-option-not-propagated'
  | 'addon-referenced-option-delete-sync'
  | 'addon-nonprice-field-sync'
  | 'renamed-option-propagated'
  | 'group-default-price-not-propagated'
  | 'addon-product-row-delete'
  | 'referenced-group-delete-blocked'
  | 'referenced-group-delete-confirmed'
  | 'unreferenced-group-delete-confirmed'
  | 'combo-nonempty-delete'
  | 'product-backed-group-duplicate-validation'
  | 'addon-single-surcharge-format'
  | 'addon-group-validation';

export type GroupBlockClassification =
  | 'automation-gap'
  | 'external-dependency-blocked'
  | 'observed-product-drift'
  | 'source-evidence-blocked'
  | 'case-spec-conflict'
  | 'assertion-surface-mismatch'
  | 'field-identity-ambiguous'
  | 'source-rule-conflict'
  | 'not-applicable';

export type GroupAutomationBinding = {
  caseId: string;
  title: string;
  module: string;
  route: string;
  priority: GroupCase['priority'];
  mode: GroupCaseMode;
  sourceIds: string[];
  obligationIds: string[];
  assertionIds: string[];
  bindingFingerprint: string;
  preconditions: string[];
  steps: string[];
  expectedResults: string[];
  expectedUiFeedback: GroupValidationFeedback | null;
  requiredEvidence: GroupEvidenceKind[];
  handlerId: GroupExecutionHandlerId | null;
  blockClassification: GroupBlockClassification | null;
  blockEvidencePaths: string[];
  blockedReasons: string[];
  capabilityIds: string[];
  recipeId: string;
  factoryId: string | null;
  cleanupId: string | null;
  traceabilityId: string;
  generationAllowed: boolean;
  executionProfile: GroupCaseMode;
  sourceGovernance: {
    status: 'verified' | 'blocked' | 'not-applicable' | 'untracked';
    currentGoalBlocking: boolean;
    blockCode: string | null;
    decisionGeneratedAt: string | null;
  };
};

export type GroupValidationFeedback = {
  locale: 'zh-CN' | 'en-US';
  exactMessage: string;
  evidencePaths: string[];
};

export type GroupValidationFeedbackContract = {
  cases: Array<{
    caseId: string;
    locale: GroupValidationFeedback['locale'];
    exactMessage: string;
    evidencePaths: string[];
  }>;
};

export type GroupFieldInventory = {
  absentFields: Array<{
    fieldId: string;
    module: string;
    labels: string[];
    reason: string;
    evidencePaths: string[];
  }>;
};

export const groupRouteByModule: Record<string, string> = {
  '商品管理 → 规格组': '/pp/brand/spec',
  '商品管理 → 属性集管理': '/pp/brand/option-group/attribute-group-set',
  '商品管理 → 口味组': '/pp/brand/option-group/taste',
  '商品管理 → 做法组': '/pp/brand/option-group/method',
  '商品管理 → 加料组': '/pp/brand/option-group/additional',
  '商品管理 → 套餐组': '/pp/brand/combo',
};

export const groupEntityByModule: Record<string, string> = {
  '商品管理 → 规格组': 'spec',
  '商品管理 → 属性集管理': 'attribute-set',
  '商品管理 → 口味组': 'taste',
  '商品管理 → 做法组': 'method',
  '商品管理 → 加料组': 'addon',
  '商品管理 → 套餐组': 'combo',
};

export const groupListConfig = {
  spec: {
    module: '商品管理 → 规格组',
    route: '/pp/brand/spec',
    searchPlaceholder: 'Specification Group Name',
    primaryAction: 'Add',
    tableMarker: 'Specification Group Name',
    listResponse: /brand-specs\/page/,
  },
  taste: {
    module: '商品管理 → 口味组',
    route: '/pp/brand/option-group/taste',
    searchPlaceholder: 'Flavor Group Name',
    primaryAction: 'Add',
    tableMarker: 'Flavor Group Name',
    listResponse: /brand-modifiers\/page/,
  },
  method: {
    module: '商品管理 → 做法组',
    route: '/pp/brand/option-group/method',
    searchPlaceholder: 'Preparation Group Name',
    primaryAction: 'Add',
    tableMarker: 'Preparation Group Name',
    listResponse: /brand-modifiers\/page/,
  },
  addon: {
    module: '商品管理 → 加料组',
    route: '/pp/brand/option-group/additional',
    searchPlaceholder: 'Add-On Group Name',
    primaryAction: 'Add',
    tableMarker: 'Add-On Group Name',
    listResponse: /brand-addon-group\/list/,
  },
  combo: {
    module: '商品管理 → 套餐组',
    route: '/pp/brand/combo',
    searchPlaceholder: 'Combo group name',
    primaryAction: 'Add',
    tableMarker: 'Combo Group',
    listResponse: /brand-sections\/list/,
  },
} as const;

export function readGroupCases(projectRoot: string): GroupCase[] {
  const filePath = path.join(projectRoot, '..', 'deliverables', 'product-center-group', 'test-cases.json');
  const document = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { cases?: GroupCase[] };
  if (!Array.isArray(document.cases) || document.cases.length === 0) {
    throw new Error(`组最终用例数量不正确：${document.cases?.length ?? 0}`);
  }
  const ids = new Set(document.cases.map((item) => item.id));
  if (ids.size !== document.cases.length) throw new Error(`组最终用例存在重复 ID：${document.cases.length - ids.size}`);
  return document.cases;
}

export function readGroupValidationFeedbackContract(projectRoot: string): GroupValidationFeedbackContract {
  const filePath = path.join(projectRoot, '..', 'deliverables', 'product-center-group', 'combo-v2-validation-feedback-audit.json');
  const document = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<GroupValidationFeedbackContract>;
  if (!Array.isArray(document.cases)) throw new Error('套餐组提示审计合同结构错误');
  const ids = new Set<string>();
  for (const item of document.cases) {
    if (!item.caseId || !item.exactMessage || !item.locale || !Array.isArray(item.evidencePaths)) {
      throw new Error(`套餐组提示审计合同缺少字段：${item?.caseId ?? 'unknown'}`);
    }
    if (ids.has(item.caseId)) throw new Error(`套餐组提示审计合同存在重复用例：${item.caseId}`);
    ids.add(item.caseId);
  }
  return document as GroupValidationFeedbackContract;
}

export function readGroupFieldInventory(projectRoot: string): GroupFieldInventory {
  const filePath = path.join(projectRoot, 'contracts', 'product-center', 'group', 'product-center-group-field-inventory.json');
  const document = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<GroupFieldInventory>;
  if (!Array.isArray(document.absentFields)) throw new Error('组当前字段清单结构错误');
  for (const field of document.absentFields) {
    if (!field.fieldId || !field.module || !field.reason || !Array.isArray(field.labels) || field.labels.length === 0
      || !Array.isArray(field.evidencePaths) || field.evidencePaths.length === 0) {
      throw new Error(`组当前字段清单记录不完整：${field?.fieldId ?? 'unknown'}`);
    }
  }
  return document as GroupFieldInventory;
}

export function absentFieldDecisionFor(
  testCase: GroupCase,
  inventory: GroupFieldInventory,
): GroupFieldInventory['absentFields'][number] | null {
  const lines = [testCase.title, testCase.source, ...testCase.preconditions, ...testCase.steps, ...testCase.expectedResults];
  const negativeMarkers = /不存在|不展示|不包含|不提供|不得|禁止|历史|旧规则|旧 XMind|当前版本不适用/;
  for (const field of inventory.absentFields.filter((item) => item.module === testCase.module)) {
    const mentionedLines = lines.filter((line) => field.labels.some((label) => line.includes(label)));
    if (mentionedLines.length === 0) continue;
    if (testCase.title.includes('当前版本不适用')
      || mentionedLines.some((line) => !negativeMarkers.test(line))) {
      return field;
    }
  }
  return null;
}

export function buildGroupAutomationBindings(
  cases: readonly GroupCase[],
  contract: any,
  feedbackContract: GroupValidationFeedbackContract = readGroupValidationFeedbackContract(path.resolve(__dirname, '..')),
  sourceGovernance?: ProductCenterSourceGovernanceRegistry,
  fieldInventory: GroupFieldInventory = readGroupFieldInventory(path.resolve(__dirname, '..')),
): GroupAutomationBinding[] {
  const driftRegistry = loadProductCenterGroupDriftDecisionRegistry(path.resolve(__dirname, '..'));
  const feedbackByCaseId = new Map(feedbackContract.cases.map((item) => [item.caseId, {
    locale: item.locale,
    exactMessage: item.exactMessage,
    evidencePaths: item.evidencePaths,
  }]));
  return cases.map((testCase) => {
    const route = groupRouteByModule[testCase.module];
    if (!route) throw new Error(`组用例缺少路由映射：${testCase.id}`);
    const entity = groupEntityByModule[testCase.module];
    const sourceIds = sourceIdsForRoute(testCase, route, contract);
    const obligationIds = obligationsForRoute(route, contract);
    const assertionIds = assertionsForCase(testCase, route);
    const capabilityIds = capabilitiesForCase(testCase, route);
    const crudSop = crudSopCase(testCase);
    const readOnly = isReadOnlyStructureCase(testCase);
    const mode = crudSop ? 'crud-sop' : readOnly ? 'read-only' : executionProfileFor(testCase);
    const absentFieldDecision = absentFieldDecisionFor(testCase, fieldInventory);
    const scopeNotApplicable = absentFieldDecision !== null;
    const handlerId = scopeNotApplicable ? null : implementedHandlerFor(testCase, mode);
    const requiredEvidence = requiredEvidenceFor(testCase, mode);
    const expectedUiFeedback = feedbackByCaseId.get(testCase.id) ?? null;
    const sourceDecision = sourceGovernance?.decisions.get(testCase.id);
    const sourceBlocked = sourceDecisionBlocksExecution(sourceDecision);
    const semanticIssue = evaluateProductCenterGroupSemanticGate(testCase);
    const observedProductDrift = semanticIssue || scopeNotApplicable
      ? null
      : qualifyProductCenterGroupDrift(testCase, driftRegistry);
    const bindingFingerprint = fingerprintBinding({
      testCase,
      route,
      handlerId,
      requiredEvidence,
      expectedUiFeedback,
    });
    const blockClassification = scopeNotApplicable
      ? 'not-applicable' as const
      : semanticIssue
        ? semanticIssue.kind
      : observedProductDrift
        ? 'observed-product-drift' as const
        : sourceBlocked
          ? 'source-evidence-blocked' as const
        : handlerId
          ? null
          : externalDependencyFor(testCase, mode)
            ? 'external-dependency-blocked' as const
            : 'automation-gap' as const;
    const technicalBlockedReasons = scopeNotApplicable
      ? [`当前字段证据确认场景不适用：${absentFieldDecision?.reason ?? '字段不存在'} 禁止生成执行。`]
      : semanticIssue
        ? [semanticIssue.message]
      : observedProductDrift
        ? [observedProductDrift.observedClaim]
        : handlerId
          ? []
          : blockClassification === 'external-dependency-blocked'
            ? [externalDependencyReason(testCase)]
            : [`缺少与 ${testCase.id} 业务步骤和预期逐项对应的专用执行 handler，属于自动化能力缺口，应由自动化流程继续补齐`];
    const blockedReasons = [
      ...(sourceBlocked && sourceDecision ? [sourceGovernanceReason(sourceDecision)] : []),
      ...technicalBlockedReasons,
    ];
    const generationAllowed = handlerId !== null && blockedReasons.length === 0;
    const mutation = !readOnly && entity !== 'attribute-set';
    const factoryId = mutation && entity !== 'attribute-set' ? `factory:group:${entity}` : null;
    const cleanupId = mutation && entity !== 'attribute-set' ? `cleanup:group:${entity}` : null;
    return {
      caseId: testCase.id,
      title: testCase.title,
      module: testCase.module,
      route,
      priority: testCase.priority,
      mode,
      sourceIds,
      obligationIds,
      assertionIds,
      bindingFingerprint,
      preconditions: testCase.preconditions,
      steps: testCase.steps,
      expectedResults: testCase.expectedResults,
      expectedUiFeedback,
      requiredEvidence,
      handlerId,
      blockClassification,
      blockEvidencePaths: scopeNotApplicable
        ? absentFieldDecision?.evidencePaths ?? []
        : observedProductDrift?.evidence.map((item) => item.path) ?? [],
      blockedReasons,
      capabilityIds,
      recipeId: `recipe:group:${testCase.id}`,
      factoryId,
      cleanupId,
      traceabilityId: `trace:group:${testCase.id}`,
      generationAllowed,
      executionProfile: mode,
      sourceGovernance: {
        status: scopeNotApplicable ? 'not-applicable' : sourceDecision?.status ?? 'untracked',
        currentGoalBlocking: sourceDecision?.currentGoalBlocking ?? false,
        blockCode: sourceDecision?.blockCode ?? null,
        decisionGeneratedAt: sourceGovernance?.generatedAt ?? null,
      },
    };
  });
}

export function staleProductCenterGroupBindingCaseIds(
  projectRoot: string,
  caseIds?: readonly string[],
): string[] {
  const selected = caseIds ? new Set(caseIds) : null;
  const contract = JSON.parse(fs.readFileSync(
    path.join(projectRoot, 'contracts/product-center/generated/modules/brand-group.json'),
    'utf8',
  ));
  const expected = buildGroupAutomationBindings(
    readGroupCases(projectRoot),
    contract,
    readGroupValidationFeedbackContract(projectRoot),
    loadProductCenterSourceGovernance(projectRoot),
    readGroupFieldInventory(projectRoot),
  );
  const persisted = JSON.parse(fs.readFileSync(
    path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json'),
    'utf8',
  )) as { cases: GroupAutomationBinding[] };
  const persistedById = new Map(persisted.cases.map((item) => [item.caseId, item]));
  return expected
    .filter((item) => selected === null || selected.has(item.caseId))
    .filter((item) => JSON.stringify(item) !== JSON.stringify(persistedById.get(item.caseId)))
    .map((item) => item.caseId)
    .sort();
}

export function assertProductCenterGroupBindingsCurrent(
  projectRoot: string,
  caseIds?: readonly string[],
): void {
  const staleCaseIds = staleProductCenterGroupBindingCaseIds(projectRoot, caseIds);
  if (staleCaseIds.length > 0) {
    throw new Error(`组自动化静态绑定已过期：${staleCaseIds.join(',')}；请先重建绑定并重新执行闭环审计与批准。`);
  }
}

export function evaluateGroupEvidence(
  binding: Pick<GroupAutomationBinding, 'caseId' | 'generationAllowed' | 'handlerId' | 'requiredEvidence' | 'assertionIds'>,
  observed: {
    handlerId: GroupExecutionHandlerId;
    evidence: GroupEvidenceKind[];
    assertionIds: string[];
    assertionReceipts?: RuntimeAssertionReceipt[];
    productDifference?: Record<string, unknown> | null;
  },
  options: { allowObservedProductDrift?: boolean; allowSourceRecovery?: boolean } = {},
): {
  complete: boolean;
  missingEvidence: GroupEvidenceKind[];
  missingAssertions: string[];
  unexpectedAssertions: string[];
  assertionReceipts?: RuntimeAssertionReceipt[];
  productDifference?: Record<string, unknown> | null;
} {
  const findingReplayAllowed = options.allowObservedProductDrift === true
    && binding.generationAllowed === false;
  const sourceRecoveryAllowed = options.allowSourceRecovery === true
    && binding.generationAllowed === false;
  if ((!binding.generationAllowed && !findingReplayAllowed && !sourceRecoveryAllowed) || !binding.handlerId) {
    throw new Error(`${binding.caseId} 未获得自动化生成资格`);
  }
  if (observed.handlerId !== binding.handlerId) {
    throw new Error(`${binding.caseId} 执行 handler 不匹配：expected=${binding.handlerId}, observed=${observed.handlerId}`);
  }
  const observedEvidence = new Set(observed.evidence);
  const observedAssertions = new Set(observed.assertionIds);
  const missingEvidence = binding.requiredEvidence.filter((item) => !observedEvidence.has(item));
  const mismatchedAssertions = new Set((observed.assertionReceipts ?? [])
    .filter((receipt) => receipt.status === 'observed-mismatch')
    .map((receipt) => receipt.claimId));
  const missingAssertions = binding.assertionIds.filter((item) => (
    !observedAssertions.has(item) || mismatchedAssertions.has(item)
  ));
  const unexpectedAssertions = observed.assertionIds.filter((item) => !binding.assertionIds.includes(item));
  return {
    complete: missingEvidence.length === 0 && missingAssertions.length === 0 && unexpectedAssertions.length === 0,
    missingEvidence,
    missingAssertions,
    unexpectedAssertions,
    ...(observed.assertionReceipts ? { assertionReceipts: observed.assertionReceipts } : {}),
    ...(observed.productDifference ? { productDifference: observed.productDifference } : {}),
  };
}

function executionProfileFor(testCase: GroupCase): Exclude<GroupCaseMode, 'read-only' | 'crud-sop'> {
  const title = testCase.title;
  if (title.includes('查询')) return 'query-reset';
  if (title.includes('点击') && title.includes('取消')) return 'cancel';
  if (/选择(?:页|弹层)交互/.test(title)) return 'selection-probe';
  if (title.startsWith('解除引用后')
    || (title.includes('引用') && /删除.*失败/.test(title))
    || title.includes('明细删除时弹出确认变更')
    || (isComboModule(testCase) && /移除.+(?:同步|可保存)/.test(title))) return 'dependency-probe';
  if (/行业商品|终端|C端|不自动同步|商品侧同步|引用商品同步/.test(title)
    || /^编辑被引用.+商品.*同步/.test(title)
    || /默认(?:项|选中).*(?:加价|价格)|(?:加价|价格).*默认(?:项|选中)/.test(title)) return 'terminal-probe';
  if (/保存失败|不可重复|视为重复|唯一性校验|规则校验|仅允许数字/.test(title)) return 'form-validation';
  return 'mutation-probe';
}

export function isReadOnlyStructureCase(testCase: Pick<GroupCase, 'title'>): boolean {
  return testCase.title.includes('列表页')
    || testCase.title.includes('行更多菜单')
    || testCase.title.includes('套餐组统一列表展示');
}

export function crudSopCase(testCase: Pick<GroupCase, 'module' | 'title'>): 'spec-edit' | 'taste-edit' | 'method-edit' | 'addon-edit' | 'combo-delete' | undefined {
  if (testCase.title === '清空组内商品后套餐组可删除成功') return 'combo-delete';
  if (!testCase.title.includes('引用商品同步更新')) return undefined;
  if (testCase.module.endsWith('规格组')) return 'spec-edit';
  if (testCase.module.endsWith('口味组')) return 'taste-edit';
  if (testCase.module.endsWith('做法组')) return 'method-edit';
  if (testCase.module.endsWith('加料组')) return 'addon-edit';
  return undefined;
}

function implementedHandlerFor(testCase: GroupCase, mode: GroupCaseMode): GroupExecutionHandlerId | null {
  return compileProductCenterGroupHandler({
    title: testCase.title,
    module: testCase.module,
    mode,
  }) as GroupExecutionHandlerId | null;
}

function isComboModule(testCase: Pick<GroupCase, 'module'>): boolean {
  return testCase.module.endsWith('套餐组');
}

function externalDependencyFor(testCase: GroupCase, mode: GroupCaseMode): boolean {
  if (testCase.id === 'TC-GRP-SPEC-014') return false;
  const text = `${testCase.title} ${testCase.preconditions.join(' ')} ${testCase.steps.join(' ')} ${testCase.expectedResults.join(' ')}`;
  if (/行业商品|继承/.test(text)) return true;
  if (/终端|C端/.test(text)) return true;
  if (mode === 'terminal-probe') {
    return !hasLocalProductCenterFixtureCapability('brand-product.group-reference-owner.ui');
  }
  if (mode === 'dependency-probe' || mode === 'crud-sop') {
    return !hasLocalProductCenterFixtureCapability('brand-product.group-reference-owner.ui');
  }
  if (/商品|SKU|规格|引用|同步/.test(text)) {
    return !hasLocalProductCenterFixtureCapability('brand-product.single-sku.api');
  }
  return false;
}

function externalDependencyReason(testCase: GroupCase): string {
  const text = `${testCase.title} ${testCase.preconditions.join(' ')} ${testCase.steps.join(' ')} ${testCase.expectedResults.join(' ')}`;
  if (/行业商品|继承/.test(text)) {
    return `${testCase.id} 需要受控行业商品来源及继承证据，当前仓库无法本地创建该上游对象`;
  }
  if (/终端|C端/.test(text)) {
    return `${testCase.id} 需要真实终端/C端状态观测与同步证据，品牌商品和 SKU 造数已可自动完成，但下游观测能力尚未接入`;
  }
  throw new Error(`${testCase.id} 被标记为外部依赖但没有外部能力原因`);
}

function requiredEvidenceFor(testCase: GroupCase, mode: GroupCaseMode): GroupEvidenceKind[] {
  const evidence = new Set<GroupEvidenceKind>(['navigation', 'ui-assertion']);
  const text = `${testCase.title} ${testCase.steps.join(' ')} ${testCase.expectedResults.join(' ')}`;
  if (mode === 'read-only' || mode === 'query-reset' || mode === 'selection-probe') evidence.add('api-read');
  if (mode === 'query-reset') {
    evidence.add('api-mutation');
    evidence.add('cleanup');
  }
  if (testCase.id === 'TC-GRP-SPEC-003') {
    evidence.add('api-mutation');
    evidence.add('cleanup');
  }
  if (mode === 'cancel') {
    evidence.add('no-write');
    if (['TC-GRP-SPEC-022', 'TC-GRP-TASTE-018', 'TC-GRP-MTH-017', 'TC-GRP-ADD-024'].includes(testCase.id)) evidence.add('api-read');
    if (['TC-GRP-SPEC-023', 'TC-GRP-TASTE-019', 'TC-GRP-MTH-018'].includes(testCase.id)) {
      evidence.add('api-read');
      evidence.add('api-mutation');
      evidence.add('cleanup');
    }
  }
  if (mode === 'form-validation') {
    evidence.add('no-persist');
    evidence.add('api-read');
  }
  if ([
    'TC-GRP-SPEC-008',
    'TC-GRP-SPEC-012',
    'TC-GRP-TASTE-006',
    'TC-GRP-TASTE-022',
    'TC-GRP-MTH-021',
  ].includes(testCase.id)) {
    evidence.add('api-mutation');
    evidence.add('cleanup');
  }
  if (testCase.id === 'TC-GRP-SPEC-025') {
    evidence.add('api-mutation');
    evidence.add('cleanup');
  }
  if ([
    'TC-GRP-SPEC-007',
    'TC-GRP-SPEC-009',
    'TC-GRP-TASTE-007',
    'TC-GRP-TASTE-015',
    'TC-GRP-MTH-006',
    'TC-GRP-MTH-014',
  ].includes(testCase.id)) {
    evidence.add('api-mutation');
    evidence.add('cleanup');
  }
  if (mode === 'selection-probe') evidence.add('no-write');
  if (mode === 'crud-sop' || mode === 'mutation-probe' || mode === 'dependency-probe' || mode === 'terminal-probe') {
    evidence.add('api-mutation');
    evidence.add('api-read');
    evidence.add('cleanup');
  }
  const downstreamText = text.replace(/未被(?:商品)?引用|未引用|引用商品数为\s*0|被\s*0\s*个商品使用/g, '');
  if ((/引用|同步|商品仍保持|终端|C端|行业商品|继承/.test(downstreamText)
    || ['TC-GRP-TASTE-023', 'TC-GRP-MTH-022', 'TC-GRP-ADD-028'].includes(testCase.id))
    && !['TC-GRP-SPEC-015', 'TC-GRP-TASTE-009', 'TC-GRP-MTH-009', 'TC-GRP-ADD-013'].includes(testCase.id)) evidence.add('downstream');
  if (/不发生.*写入|未发送.*写请求|数据保持不变/.test(text)) evidence.add('no-write');
  return [...evidence];
}

function sourceIdsForRoute(testCase: GroupCase, route: string, contract: any): string[] {
  const ids: string[] = [];
  const caseText = `${testCase.title} ${testCase.steps.join(' ')} ${testCase.expectedResults.join(' ')}`;
  const semanticFieldIds = [
    ...(testCase.module.endsWith('加料组') && caseText.includes('单次加价') ? ['semantic-field:addon.single-surcharge'] : []),
    ...(testCase.module.endsWith('加料组') && /(?:加料商品标准价|价格\(\$\))/.test(caseText) ? ['semantic-field:addon.product-base-price'] : []),
  ];
  const routeRecord = contract?.collections?.routes?.find((item: any) => item.route === route);
  if (routeRecord?.id) ids.push(routeRecord.id);
  for (const collection of ['controls', 'fields', 'dialogs', 'validations']) {
    if (collection === 'fields' && semanticFieldIds.length > 0) continue;
    const record = contract?.collections?.[collection]?.find((item: any) => item.route === route);
    if (record?.id) ids.push(record.id);
  }
  ids.push(...semanticFieldIds);
  if (testCase.source.includes('BR-')) {
    const matched = testCase.source.match(/BR-[A-Z0-9-]+/g) ?? [];
    ids.push(...matched);
  }
  return [...new Set(ids)].sort();
}

function obligationsForRoute(route: string, contract: any): string[] {
  return (contract?.collections?.businessRules ?? [])
    .filter((item: any) => item.route === route || item.evidence?.route === route)
    .map((item: any) => item.id)
    .filter(Boolean)
    .sort();
}

function assertionsForCase(testCase: GroupCase, route: string): string[] {
  if (testCase.expectedResults.length === 0) throw new Error(`${testCase.id} 缺少预期结果，禁止生成断言`);
  return testCase.expectedResults.map((_, index) => `assertion:group:expected:${testCase.id}:${index + 1}`);
}

function fingerprintBinding(input: {
  testCase: GroupCase;
  route: string;
  handlerId: GroupExecutionHandlerId | null;
  requiredEvidence: GroupEvidenceKind[];
  expectedUiFeedback: GroupValidationFeedback | null;
}): string {
  const canonical = JSON.stringify({
    caseId: input.testCase.id,
    title: input.testCase.title,
    module: input.testCase.module,
    priority: input.testCase.priority,
    source: input.testCase.source,
    route: input.route,
    preconditions: input.testCase.preconditions,
    steps: input.testCase.steps,
    expectedResults: input.testCase.expectedResults,
    handlerId: input.handlerId,
    requiredEvidence: [...input.requiredEvidence].sort(),
    expectedUiFeedback: input.expectedUiFeedback,
  });
  return `sha256:${crypto.createHash('sha256').update(canonical).digest('hex')}`;
}

function capabilitiesForCase(testCase: GroupCase, route: string): string[] {
  if (testCase.id === 'TC-GRP-ATTR-002') return ['navigation.sidebar.open', `group.${route}.row-menu.open`, `group.${route}.row-menu.close`];
  if (isReadOnlyStructureCase(testCase)) return ['navigation.sidebar.open', `group.${route}.open`, `group.${route}.list.read`];
  if (crudSopCase(testCase)) return ['navigation.sidebar.open', `group.${route}.open`, `group.${route}.mutation.sop`];
  const capabilities = ['navigation.sidebar.open', `group.${route}.open`, `group.${route}.${executionProfileFor(testCase)}`];
  const text = `${testCase.title} ${testCase.preconditions.join(' ')} ${testCase.steps.join(' ')} ${testCase.expectedResults.join(' ')}`;
  if (/商品|SKU|规格|引用|同步/.test(text)) capabilities.push('brand-product.single-sku.api', 'brand-product.cleanup.api-ui');
  if (testCase.module.includes('加料组')) capabilities.push('brand-product.addon-candidate.api');
  if (testCase.module.includes('套餐组')) capabilities.push('brand-product.combo-candidate.api');
  if (testCase.id === 'TC-GRP-PKG-019') capabilities.push('brand-product.multi-sku.ui');
  if (/引用|同步/.test(text) && !/终端|C端/.test(text)) capabilities.push('brand-product.group-reference-owner.ui');
  return [...new Set(capabilities)];
}
