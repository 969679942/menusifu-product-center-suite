import fs from 'node:fs';
import path from 'node:path';
import { productCenterEntities } from '../test-data/product-center/entity-matrix';
import { productCenterCreateSopCatalog } from '../sop/product-center/product-center-create-sop.catalog';
import { productCenterSopCatalog } from '../sop/product-center/product-center-sop.catalog';
import { lowDependencySopCatalog } from '../sop/product-center/product-center-low-dependency-sop.catalog';
import { highDependencySopCatalog } from '../sop/product-center/product-center-high-dependency-sop.catalog';
import { productCenterNegativeSopCatalog } from '../sop/product-center/product-center-negative-sop.catalog';

type Action = 'create' | 'edit' | 'delete';
type Coverage = 'ui-and-api' | 'api-only' | 'review-required';

type CoverageRow = {
  entity: string;
  route: string;
  uiActions: Action[];
  apiOnlyActions: Action[];
  apiLifecycle: string[];
  negativeScenarios: string[];
  notApplicable: Array<{ action: Action; reason: string }>;
  coverage: Coverage;
  gaps: string[];
};

const actionOrder: Action[] = ['create', 'edit', 'delete'];
const uiActionsByRoute = new Map<string, Set<Action>>();
const notApplicableByRoute = new Map<string, Array<{ action: Action; reason: string }>>();

function addActions(route: string, actions: readonly Action[]): void {
  const current = uiActionsByRoute.get(route) ?? new Set<Action>();
  actions.forEach((action) => current.add(action));
  uiActionsByRoute.set(route, current);
}

for (const definition of productCenterCreateSopCatalog) addActions(definition.route, ['create']);
for (const definition of productCenterSopCatalog) addActions(definition.route, ['edit', 'delete']);
for (const definition of lowDependencySopCatalog) {
  addActions(definition.route, definition.actions);
  notApplicableByRoute.set(definition.route, [...(notApplicableByRoute.get(definition.route) ?? []), ...definition.notApplicable]);
}
for (const definition of highDependencySopCatalog) {
  addActions(definition.route, definition.actions);
  notApplicableByRoute.set(definition.route, [...(notApplicableByRoute.get(definition.route) ?? []), ...definition.notApplicable]);
}

const negativeByRoute = new Map<string, string[]>();
for (const scenario of productCenterNegativeSopCatalog) {
  const current = negativeByRoute.get(scenario.route) ?? [];
  current.push(scenario.scenario);
  negativeByRoute.set(scenario.route, current);
}

const entities: CoverageRow[] = productCenterEntities.map(([entity, route]) => {
  const uiActions = actionOrder.filter((action) => uiActionsByRoute.get(route)?.has(action));
  const reviewRequired = entity === '门店调味';
  const apiOnlyActions = reviewRequired ? [] : actionOrder.filter((action) => action === 'create' && !uiActions.includes(action));
  const gaps: string[] = [];
  if (apiOnlyActions.length > 0) gaps.push('创建场景使用 API Seed，尚无 UI 创建用例');
  if (reviewRequired) gaps.push('当前 API/UI 证据不足，保留评审项');
  const notApplicable = notApplicableByRoute.get(route) ?? [];
  if (notApplicable.length > 0) gaps.push('部分动作经运行时证据标记为不适用');

  return {
    entity,
    route,
    uiActions,
    apiOnlyActions,
    apiLifecycle: uiActions.length > 0 ? ['seed', 'verify', 'cleanup'] : [],
    negativeScenarios: negativeByRoute.get(route) ?? [],
    notApplicable,
    coverage: reviewRequired ? 'review-required' : uiActions.length > 0 ? 'ui-and-api' : 'api-only',
    gaps,
  };
});

const summary = {
  totalEntities: entities.length,
  uiAndApi: entities.filter((item) => item.coverage === 'ui-and-api').length,
  apiOnly: entities.reduce((count, item) => count + item.apiOnlyActions.length, 0),
  notApplicable: entities.reduce((count, item) => count + item.notApplicable.length, 0),
  reviewRequired: entities.filter((item) => item.coverage === 'review-required').length,
  uncovered: entities.filter((item) => item.coverage === 'review-required' && item.apiLifecycle.length === 0).length,
};

const matrix = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  sourceCatalogs: [
    'test-data/product-center/entity-matrix.ts',
    'sop/product-center/product-center-create-sop.catalog.ts',
    'sop/product-center/product-center-sop.catalog.ts',
    'sop/product-center/product-center-low-dependency-sop.catalog.ts',
    'sop/product-center/product-center-high-dependency-sop.catalog.ts',
    'sop/product-center/product-center-negative-sop.catalog.ts',
  ],
  summary,
  entities,
};

const contractDirectory = path.resolve('contracts/product-center');
fs.mkdirSync(contractDirectory, { recursive: true });
fs.writeFileSync(
  path.join(contractDirectory, 'product-center-coverage-matrix.json'),
  `${JSON.stringify(matrix, null, 2)}\n`,
  'utf8',
);

const markdown = [
  '# 商品中心自动化覆盖矩阵',
  '',
  `生成时间：${matrix.generatedAt}`,
  '',
  `实体总数：${summary.totalEntities}；UI + API：${summary.uiAndApi}；API-only 动作：${summary.apiOnly}；不适用动作：${summary.notApplicable}；评审项：${summary.reviewRequired}。`,
  '',
  '| 实体 | 路由 | UI动作 | API生命周期 | 反向场景 | 覆盖结论 | 缺口 |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...entities.map((item) => `| ${item.entity} | \`${item.route}\` | ${item.uiActions.join(', ') || '-'} | ${item.apiLifecycle.join(', ') || '-'} | ${item.negativeScenarios.join(', ') || '-'} | ${item.coverage} | ${item.gaps.join('；') || '-'} |`),
  '',
].join('\n');
fs.writeFileSync(path.join(contractDirectory, 'product-center-coverage-matrix.md'), markdown, 'utf8');

process.stdout.write(`商品中心覆盖矩阵已生成：${path.join(contractDirectory, 'product-center-coverage-matrix.json')}\n`);
