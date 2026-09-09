import type { ProductCenterCreateSopDefinition } from './product-center-create-sop.catalog';
import type { HighDependencySopDefinition } from './product-center-high-dependency-sop.catalog';
import type { LowDependencySopDefinition } from './product-center-low-dependency-sop.catalog';
import type { ProductCenterNegativeCase } from './product-center-negative-sop.catalog';
import type {
  ProductCenterSopAction,
  ProductCenterSopCase,
  ProductCenterSopDefinition,
} from './product-center-sop.types';

const actions: readonly ProductCenterSopAction[] = ['edit', 'delete'];

export type ProductCenterProductionSopDescriptor = {
  id: string;
  entityKey: string;
  entityName: string;
  route: string;
  action: 'create' | 'edit' | 'delete' | 'negative';
  scenario?: ProductCenterNegativeCase['scenario'];
  sourceIds: readonly string[];
  seedMode: 'api' | 'api-dependencies' | 'none';
  cleanupMode: 'api-finally' | 'none';
  verifyModes: readonly ('api' | 'ui')[];
  specFile: string;
  testTitle: string;
  rerunGrep: string;
};

export type ProductCenterProductionSopCatalogs = {
  core: readonly ProductCenterSopDefinition[];
  create: readonly ProductCenterCreateSopDefinition[];
  lowDependency: readonly LowDependencySopDefinition[];
  highDependency: readonly HighDependencySopDefinition[];
  negative: readonly ProductCenterNegativeCase[];
};

export function generateProductCenterSopCases(
  catalog: readonly ProductCenterSopDefinition[],
): ProductCenterSopCase[] {
  return catalog.flatMap((definition) =>
    actions.map((action) => ({
      ...definition,
      action,
      seedMode: 'api' as const,
      cleanupMode: 'api-finally' as const,
      uiCreatesData: false as const,
      verifyServerState: true as const,
      verifyZeroResidue: true as const,
      forwardSteps: [
        'API 创建唯一审计数据并记录服务端 ID',
        'UI 打开实体页面并等待业务列表终态',
        action === 'edit'
          ? 'UI 精确定位唯一记录并完成编辑'
          : 'UI 精确定位唯一记录并完成删除确认',
        'API 验证服务端终态',
      ],
      reverseSteps: [
        'fixture finally 按依赖逆序执行 API 清理',
        '验证原始身份不存在',
        '验证编辑身份不存在',
        '验证依赖身份不存在',
      ],
    })),
  );
}

export function generateProductCenterProductionSopCases(
  catalogs: ProductCenterProductionSopCatalogs,
): ProductCenterProductionSopDescriptor[] {
  const createCases = catalogs.create.map((definition) => descriptor({
    id: `create:${definition.entityKey}`,
    entityKey: definition.entityKey,
    entityName: definition.entityName,
    route: definition.route,
    action: 'create',
    seedMode: definition.apiDependencies.length ? 'api-dependencies' : 'none',
    specFile: 'tests/e2e/product-center-five-create-sop.spec.ts',
    testTitle: `${definition.entityName}应通过 UI 创建并完成 API UI 双验证`,
  }));

  const coreCases = generateProductCenterSopCases(catalogs.core).map((definition) => {
    const actionName = definition.action === 'edit' ? '编辑' : '删除';
    return descriptor({
      id: `${definition.action}:${definition.entityKey}`,
      entityKey: definition.entityKey,
      entityName: definition.entityName,
      route: definition.route,
      action: definition.action,
      seedMode: 'api',
      specFile: 'tests/e2e/product-center-five-hybrid-sop.spec.ts',
      testTitle: `${definition.entityName}应使用 API 前置数据完成 UI ${actionName}并由 API 验证`,
    });
  });

  const lowDependencyCases = catalogs.lowDependency.flatMap((definition) =>
    definition.actions.map((action) => hybridDescriptor(
      definition,
      action,
      'tests/e2e/product-center-low-dependency-hybrid-sop.spec.ts',
    )),
  );

  const highDependencyCases = catalogs.highDependency.flatMap((definition) =>
    definition.actions.map((action) => hybridDescriptor(
      definition,
      action,
      'tests/e2e/product-center-high-dependency-hybrid-sop.spec.ts',
    )),
  );

  const negativeCases = catalogs.negative.map((definition) => descriptor({
    id: `negative:${definition.id}`,
    entityKey: definition.id,
    entityName: definition.entityName,
    route: definition.route,
    action: 'negative',
    scenario: definition.scenario,
    seedMode: requiresNegativeSeed(definition) ? 'api' : 'none',
    cleanupMode: requiresNegativeSeed(definition) ? 'api-finally' : 'none',
    verifyModes: requiresNegativeSeed(definition) ? ['api', 'ui'] : ['ui'],
    sourceIds: [definition.sourceId],
    specFile: 'tests/e2e/product-center-negative-sop.spec.ts',
    testTitle: definition.testTitle,
  }));

  return [
    ...createCases,
    ...coreCases,
    ...lowDependencyCases,
    ...highDependencyCases,
    ...negativeCases,
  ];
}

function requiresNegativeSeed(definition: ProductCenterNegativeCase): boolean {
  return definition.scenario === 'cancel-delete' || definition.scenario === 'relation-blocked';
}

function hybridDescriptor(
  definition: LowDependencySopDefinition | HighDependencySopDefinition,
  action: 'edit' | 'delete',
  specFile: string,
): ProductCenterProductionSopDescriptor {
  const actionName = action === 'edit' ? '编辑' : '删除';
  return descriptor({
    id: `${action}:${definition.entityKey}`,
    entityKey: definition.entityKey,
    entityName: definition.entityName,
    route: definition.route,
    action,
    seedMode: 'api',
    specFile,
    testTitle: `${definition.entityName}应使用 API 前置数据完成 UI ${actionName}并验证双终态`,
  });
}

function descriptor(
  input: Omit<ProductCenterProductionSopDescriptor, 'cleanupMode' | 'verifyModes' | 'rerunGrep' | 'sourceIds'> &
    Partial<Pick<ProductCenterProductionSopDescriptor, 'cleanupMode' | 'verifyModes' | 'sourceIds'>>,
): ProductCenterProductionSopDescriptor {
  return {
    ...input,
    cleanupMode: input.cleanupMode ?? 'api-finally',
    verifyModes: input.verifyModes ?? ['api', 'ui'],
    sourceIds: input.sourceIds ?? [],
    rerunGrep: input.testTitle,
  };
}
