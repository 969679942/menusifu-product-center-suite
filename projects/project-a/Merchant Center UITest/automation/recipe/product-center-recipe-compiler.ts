import {
  productCenterRecipeCapabilityContracts,
} from '../../adapters/product-center/product-center-recipe-capabilities';
import type { ProductCenterCreateSopDefinition } from '../../sop/product-center/product-center-create-sop.catalog';
import type { HighDependencySopDefinition } from '../../sop/product-center/product-center-high-dependency-sop.catalog';
import type { LowDependencySopDefinition } from '../../sop/product-center/product-center-low-dependency-sop.catalog';
import type { ProductCenterNegativeCase } from '../../sop/product-center/product-center-negative-sop.catalog';
import type { ProductCenterSopDefinition } from '../../sop/product-center/product-center-sop.types';
import { coverageIdsForProductCenterCase } from '../../sop/product-center/product-center-test-case-coverage.catalog';
import type { ProductCenterTestContract } from '../../utils/product-center-test-contract';
import type {
  AutomationRecipe,
  RecipeCapabilityContract,
} from './automation-recipe';
import { recipeFingerprint, validateAutomationRecipe } from './recipe-validator';
import {
  buildProductCenterRecipeSourceIndex,
  type ProductCenterRecipeSourceEntry,
} from './product-center-recipe-source-index';
import { sidebarNavigationCapability } from './sidebar-navigation-capability';

export const productCenterRecipeCaseIds = [
  'create:category',
  'create:method',
  'create:material',
  'create:seasoning',
  'create:bom',
  'edit:category',
  'delete:category',
  'edit:method',
  'delete:method',
  'edit:material',
  'delete:material',
  'edit:seasoning',
  'delete:seasoning',
  'edit:bom',
  'delete:bom',
  'edit:material-category',
  'delete:material-category',
  'edit:taste',
  'delete:taste',
  'edit:spec',
  'delete:spec',
  'edit:addon',
  'delete:addon',
  'delete:print-stall',
  'edit:tax',
  'delete:tax',
  'delete:description-tag',
  'delete:statistic-tag',
  'edit:recipe-ingredient',
  'delete:recipe-ingredient',
  'edit:menu',
  'delete:menu',
  'edit:printer',
  'delete:combo',
  'negative:category-required',
  'negative:category-max-length',
  'negative:method-required',
  'negative:method-max-length',
  'negative:addon-prerequisite',
  'negative:printer-required',
  'negative:category-cancel-delete',
  'negative:category-child-blocked-by-product',
  'negative:statistic-tag-second-language-max',
  'negative:statistic-tag-group-second-language-max',
  'negative:description-tag-second-language-max',
  'negative:description-tag-group-second-language-max',
] as const;

export const productCenterPilotCaseIds = productCenterRecipeCaseIds;

export type ProductCenterRecipeUnresolved = {
  caseId: string;
  sourceIds: string[];
  reasonCode:
    | 'SOURCE_NOT_FOUND'
    | 'SOURCE_INDEX_UNRESOLVED'
    | 'AMBIGUOUS_SOURCE'
    | 'GENERATION_NOT_ALLOWED'
    | 'TEST_CASE_GATE_REJECTED'
    | 'CONTRACT_INVALID';
  message: string;
};

export type ProductCenterRecipeCompileResult = {
  schemaVersion: '1.0.0';
  fingerprint: string;
  recipes: AutomationRecipe[];
  unresolved: ProductCenterRecipeUnresolved[];
};

type ProductCenterRecipeCompilerInput = {
  core: readonly ProductCenterSopDefinition[];
  create: readonly ProductCenterCreateSopDefinition[];
  lowDependency: readonly LowDependencySopDefinition[];
  highDependency: readonly HighDependencySopDefinition[];
  negative: readonly ProductCenterNegativeCase[];
  contract: ProductCenterTestContract;
  claimIdsByCaseId?: ReadonlyMap<string, readonly string[]>;
  sourceIdsByCaseId?: ReadonlyMap<string, readonly string[]>;
  generatedCaseIds?: ReadonlySet<string>;
};

export function compileProductCenterPilotRecipes(
  input: ProductCenterRecipeCompilerInput,
  capabilityContracts: readonly RecipeCapabilityContract[] = productCenterRecipeCapabilityContracts,
): ProductCenterRecipeCompileResult {
  const recipes: AutomationRecipe[] = [];
  const unresolved: ProductCenterRecipeUnresolved[] = [];
  const sourceIndex = buildProductCenterRecipeSourceIndex(input.contract);

  for (const caseId of productCenterRecipeCaseIds) {
    if (input.generatedCaseIds && !input.generatedCaseIds.has(caseId)) {
      const source = sourceIndex.entries.find((entry) => entry.caseId === caseId);
      unresolved.push({
        caseId,
        sourceIds: source?.sourceIds ?? [],
        reasonCode: 'TEST_CASE_GATE_REJECTED',
        message: `测试用例生成门禁未放行：${caseId}`,
      });
      continue;
    }
    const source = sourceIndex.entries.find((entry) => entry.caseId === caseId);
    if (!source) {
      const sourceIssue = sourceIndex.unresolved.find((item) => item.caseId === caseId);
      unresolved.push({
        caseId,
        sourceIds: sourceIssue?.sourceIds ?? [],
        reasonCode: sourceIssue ? 'SOURCE_INDEX_UNRESOLVED' : 'SOURCE_NOT_FOUND',
        message: sourceIssue?.message ?? `统一合同未找到 Recipe 来源：${caseId}`,
      });
      continue;
    }

    const preciseSourceIds = input.sourceIdsByCaseId?.get(caseId);
    const unknownSourceIds = preciseSourceIds?.filter((sourceId) => !source.sourceIds.includes(sourceId)) ?? [];
    if (unknownSourceIds.length > 0) {
      unresolved.push({
        caseId,
        sourceIds: unknownSourceIds,
        reasonCode: 'CONTRACT_INVALID',
        message: `用例级来源不在统一合同追溯中：${unknownSourceIds.join(', ')}`,
      });
      continue;
    }
    const candidateSource = preciseSourceIds?.length
      ? { ...source, sourceIds: [...preciseSourceIds] }
      : source;
    const compiledCandidate = compileCandidate(caseId, input, candidateSource);
    if ('reasonCode' in compiledCandidate) {
      unresolved.push(compiledCandidate);
      continue;
    }
    const claimIds = input.claimIdsByCaseId?.get(caseId);
    const candidate = claimIds?.length
      ? { ...compiledCandidate, claimIds: [...claimIds] }
      : compiledCandidate;

    const issues = validateAutomationRecipe(candidate, capabilityContracts);
    if (issues.length > 0) {
      unresolved.push({
        caseId,
        sourceIds: candidate.sourceIds,
        reasonCode: 'CONTRACT_INVALID',
        message: issues.map((issue) => `${issue.code}:${issue.path}`).join(', '),
      });
      continue;
    }
    recipes.push(candidate);
  }

  return {
    schemaVersion: '1.0.0',
    fingerprint: recipeFingerprint(createResultFingerprintRecipe(recipes, unresolved)),
    recipes,
    unresolved,
  };
}

function compileCandidate(
  caseId: typeof productCenterRecipeCaseIds[number],
  input: ProductCenterRecipeCompilerInput,
  source: ProductCenterRecipeSourceEntry,
): AutomationRecipe | ProductCenterRecipeUnresolved {
  if (caseId.startsWith('create:')) return compileCreateCandidate(caseId, input.create, source);
  if (caseId.startsWith('negative:')) return compileNegativeCandidate(caseId, input.negative, source);
  const entityKey = caseId.split(':')[1];
  if (input.core.some((item) => item.entityKey === entityKey)) {
    return compileCoreCandidate(caseId, input.core, source);
  }
  if (input.lowDependency.some((item) => item.entityKey === entityKey)) {
    return compileDependencyCandidate(caseId, input.lowDependency, 'low', source);
  }
  return compileDependencyCandidate(caseId, input.highDependency, 'high', source);
}

function compileCreateCandidate(
  caseId: string,
  catalog: readonly ProductCenterCreateSopDefinition[],
  source: ProductCenterRecipeSourceEntry,
): AutomationRecipe | ProductCenterRecipeUnresolved {
  const entityKey = caseId.replace(/^create:/, '');
  const matches = catalog.filter((item) => item.entityKey === entityKey);
  if (matches.length === 0) return sourceNotFound(caseId);
  if (matches.length > 1) return ambiguousSource(caseId, matches.length, source.sourceIds);
  const definition = matches[0];
  return {
    schemaVersion: '1.0.0',
    id: `product-center:${definition.entityKey}:create`,
    caseId,
    title: `${definition.entityName}应通过 Recipe 完成 UI 创建并验证双终态`,
    tags: ['@recipe', '@generated', '@sop', '@create', ...(definition.entityKey === 'category' ? ['@fast'] : [])],
    route: definition.route as `/${string}`,
    action: 'create',
    traceabilityId: source.traceabilityId as `trace:sop:${string}`,
    sourceIds: source.sourceIds,
    coverageIds: coverageIdsForProductCenterCase(caseId),
    generationAllowed: true,
    capabilities: [
      sidebarNavigationCapability(definition.route),
      { id: 'coreCreate.execute', input: { record: { $ref: '$record' } } },
    ],
    seed: { adapterId: 'productCenter.prepareCreate', input: { entityKey: definition.entityKey } },
    mutation: { method: 'POST', operationKey: `${definition.entityKey}.create` },
    assertions: [
      { adapterId: 'productCenter.verifyCreatedApi' },
      { adapterId: 'productCenter.verifyCreatedUi' },
    ],
    cleanup: { adapterId: 'productCenter.cleanupSeed' },
  };
}

function compileCoreCandidate(
  caseId: string,
  catalog: readonly ProductCenterSopDefinition[],
  source: ProductCenterRecipeSourceEntry,
): AutomationRecipe | ProductCenterRecipeUnresolved {
  const [action, entityKey] = caseId.split(':') as ['edit' | 'delete', ProductCenterSopDefinition['entityKey']];
  const matches = catalog.filter((item) => item.entityKey === entityKey);
  if (matches.length === 0) return sourceNotFound(caseId);
  if (matches.length > 1) return ambiguousSource(caseId, matches.length, source.sourceIds);
  const definition = matches[0];
  const actionName = action === 'edit' ? '编辑' : '删除';
  return {
    schemaVersion: '1.0.0',
    id: `product-center:${entityKey}:${action}`,
    caseId,
    title: `${definition.entityName}应通过 Recipe 完成 UI ${actionName}并验证终态`,
    tags: [
      '@recipe', '@generated', '@sop', '@hybrid', '@core-crud',
      ...((entityKey === 'method' && action === 'edit') || (entityKey === 'material' && action === 'delete') ? ['@fast'] : []),
    ],
    route: definition.route as `/${string}`,
    action,
    traceabilityId: source.traceabilityId as `trace:sop:${string}`,
    sourceIds: source.sourceIds,
    coverageIds: coverageIdsForProductCenterCase(caseId),
    generationAllowed: true,
    seed: { adapterId: 'productCenter.seedCore', input: { entityKey } },
    capabilities: [
      sidebarNavigationCapability(definition.route),
      { id: `${entityKey}.open`, input: { record: { $ref: '$record' } } },
      { id: `${entityKey}.${action === 'edit' ? 'editIdentity' : 'deleteIdentity'}`, input: { record: { $ref: '$record' } } },
    ],
    mutation: { method: action === 'edit' ? 'PUT' : 'DELETE', operationKey: `${entityKey}.${action === 'edit' ? 'update' : 'delete'}` },
    assertions: [
      { adapterId: `productCenter.verify${action === 'edit' ? 'Edited' : 'Absent'}Api` },
      { adapterId: `productCenter.verify${action === 'edit' ? 'Edited' : 'Deleted'}Ui` },
    ],
    cleanup: { adapterId: 'productCenter.cleanupSeed' },
  };
}

type DependencyDefinition = LowDependencySopDefinition | HighDependencySopDefinition;

function compileDependencyCandidate(
  caseId: string,
  catalog: readonly DependencyDefinition[],
  dependency: 'low' | 'high',
  source: ProductCenterRecipeSourceEntry,
): AutomationRecipe | ProductCenterRecipeUnresolved {
  const [action, entityKey] = caseId.split(':') as ['edit' | 'delete', string];
  const matches = catalog.filter((item) =>
    item.entityKey === entityKey && (item.actions as readonly string[]).includes(action));
  if (matches.length === 0) return sourceNotFound(caseId);
  if (matches.length > 1) return ambiguousSource(caseId, matches.length, source.sourceIds);
  const definition = matches[0];
  const actionName = action === 'edit' ? '编辑' : '删除';
  return {
    schemaVersion: '1.0.0',
    id: `product-center:${entityKey}:${action}`,
    caseId,
    title: `${definition.entityName}应通过 Recipe 完成 UI ${actionName}并验证双终态`,
    tags: ['@recipe', '@generated', '@sop', '@hybrid', `@${dependency}-dependency`],
    route: definition.route as `/${string}`,
    action,
    traceabilityId: source.traceabilityId as `trace:sop:${string}`,
    sourceIds: source.sourceIds,
    coverageIds: coverageIdsForProductCenterCase(caseId),
    generationAllowed: true,
    seed: { adapterId: `productCenter.seed${dependency === 'low' ? 'Low' : 'High'}Dependency`, input: { entityKey } },
    capabilities: [
      sidebarNavigationCapability(definition.route),
      { id: `${dependency}Dependency.execute`, input: { record: { $ref: '$record' } } },
    ],
    mutation: { method: action === 'edit' ? 'PUT' : 'DELETE', operationKey: `${entityKey}.${action}` },
    assertions: [
      { adapterId: `productCenter.verify${action === 'edit' ? 'Edited' : 'Absent'}Api` },
      { adapterId: `productCenter.verify${action === 'edit' ? 'Edited' : 'Deleted'}Ui` },
    ],
    cleanup: { adapterId: 'productCenter.cleanupSeed' },
  };
}

function compileNegativeCandidate(
  caseId: string,
  catalog: readonly ProductCenterNegativeCase[],
  source: ProductCenterRecipeSourceEntry,
): AutomationRecipe | ProductCenterRecipeUnresolved {
  const id = caseId.replace(/^negative:/, '');
  const matches = catalog.filter((item) => item.id === id);
  if (matches.length === 0) return sourceNotFound(caseId);
  if (matches.length > 1) return ambiguousSource(caseId, matches.length, source.sourceIds);
  const definition = matches[0];
  if (!definition.generationAllowed) {
    return { caseId, sourceIds: source.sourceIds, reasonCode: 'GENERATION_NOT_ALLOWED', message: `来源禁止生成：${caseId}` };
  }
  if (definition.scenario === 'max-length' && !definition.boundary) {
    return { caseId, sourceIds: source.sourceIds, reasonCode: 'CONTRACT_INVALID', message: `边界定义缺失：${caseId}` };
  }
  const action = definition.scenario === 'max-length' ? 'boundary' : 'negative';
  if (definition.scenario === 'relation-blocked') {
    return {
      schemaVersion: '1.0.0',
      id: `product-center:${definition.id}:negative`,
      caseId,
      title: definition.testTitle,
      tags: ['@recipe', '@generated', '@sop', '@fast', '@contract-impact', '@negative'],
      route: definition.route as `/${string}`,
      action: 'negative',
      traceabilityId: source.traceabilityId as `trace:sop:${string}`,
      sourceIds: source.sourceIds,
      coverageIds: coverageIdsForProductCenterCase(caseId),
      generationAllowed: true,
      seed: { adapterId: 'productCenter.seedCategoryWithProduct' },
      capabilities: [
        sidebarNavigationCapability(definition.route),
        {
          id: 'category.attemptAddChildBlockedByProduct',
          input: { record: { $ref: '$record' } },
        },
      ],
      assertions: [
        { adapterId: 'productCenter.verifyCategoryChildBlockedApi' },
        { adapterId: 'productCenter.verifyCategoryChildBlockedUi' },
      ],
      cleanup: { adapterId: 'productCenter.cleanupSeed' },
    };
  }
  return {
    schemaVersion: '1.0.0',
    id: `product-center:${definition.id}:${action}`,
    caseId,
    title: definition.testTitle,
    tags: ['@recipe', '@generated', '@sop', '@fast', '@contract-impact', '@negative'],
    route: definition.route as `/${string}`,
    action,
    traceabilityId: source.traceabilityId as `trace:sop:${string}`,
    sourceIds: source.sourceIds,
    coverageIds: coverageIdsForProductCenterCase(caseId),
    generationAllowed: true,
    ...(definition.scenario === 'cancel-delete'
      ? { seed: { adapterId: 'productCenter.seedCore', input: { entityKey: 'category' } } }
      : {}),
    capabilities: [
      sidebarNavigationCapability(definition.route),
      {
        id: 'negative.execute',
        saveAs: 'negative',
        input: {
          definitionId: definition.id,
          ...(definition.scenario === 'cancel-delete' ? { record: { $ref: '$record' } } : {}),
        },
      },
    ],
    assertions: definition.boundary ? [{
      adapterId: 'productCenter.verifyBoundary',
      input: {
        result: { $ref: '$result.negative' },
        maxLength: definition.boundary.maxLength,
        acceptedLength: definition.boundary.acceptedLength,
      },
    }] : [{
      adapterId: 'productCenter.verifyNegative',
      input: { result: { $ref: '$result.negative' } },
    }],
    ...(definition.scenario === 'cancel-delete'
      ? { cleanup: { adapterId: 'productCenter.cleanupSeed' } }
      : {}),
  };
}

function sourceNotFound(caseId: string): ProductCenterRecipeUnresolved {
  return { caseId, sourceIds: [], reasonCode: 'SOURCE_NOT_FOUND', message: `未找到候选来源：${caseId}` };
}

function ambiguousSource(caseId: string, count: number, sourceIds: string[]): ProductCenterRecipeUnresolved {
  return { caseId, sourceIds, reasonCode: 'AMBIGUOUS_SOURCE', message: `发现 ${count} 条候选来源：${caseId}` };
}

function createResultFingerprintRecipe(
  recipes: readonly AutomationRecipe[],
  unresolved: readonly ProductCenterRecipeUnresolved[],
): AutomationRecipe {
  return {
    schemaVersion: '1.0.0',
    id: 'product-center:pilot:compile-result',
    caseId: 'compile-result',
    title: '商品中心 Recipe 编译结果',
    tags: [],
    route: '/',
    action: 'boundary',
    traceabilityId: 'trace:sop:compile-result',
    sourceIds: recipes.flatMap((recipe) => recipe.sourceIds),
    coverageIds: recipes.flatMap((recipe) => recipe.coverageIds),
    generationAllowed: unresolved.length === 0,
    capabilities: [],
    assertions: [{ adapterId: 'compile.result', input: { recipes: JSON.stringify(recipes), unresolved: JSON.stringify(unresolved) } }],
  };
}


