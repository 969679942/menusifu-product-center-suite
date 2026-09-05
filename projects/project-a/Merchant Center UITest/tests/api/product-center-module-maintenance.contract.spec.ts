import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { productCenterContractModules } from '../../contracts/product-center/modules';
import {
  buildProductCenterMaintenanceArtifacts,
  buildProductCenterReleaseRecord,
  applyProductCenterModuleCurations,
  queryProductCenterContract,
  validateProductCenterModuleRegistry,
} from '../../utils/product-center-contract-maintenance';
import type { ProductCenterTestContract } from '../../utils/product-center-test-contract';
import { generateProductCenterProductionSopCases } from '../../sop/product-center/product-center-sop-generator';
import { productCenterCreateSopCatalog } from '../../sop/product-center/product-center-create-sop.catalog';
import { productCenterSopCatalog } from '../../sop/product-center/product-center-sop.catalog';
import { highDependencySopCatalog } from '../../sop/product-center/product-center-high-dependency-sop.catalog';
import { lowDependencySopCatalog } from '../../sop/product-center/product-center-low-dependency-sop.catalog';
import { productCenterNegativeSopCatalog } from '../../sop/product-center/product-center-negative-sop.catalog';

const projectRoot = path.resolve(__dirname, '../..');
const contract = JSON.parse(fs.readFileSync(
  path.join(projectRoot, 'contracts/product-center/product-center-test-contract.json'),
  'utf8',
)) as ProductCenterTestContract;
const descriptors = generateProductCenterProductionSopCases({
  core: productCenterSopCatalog,
  create: productCenterCreateSopCatalog,
  lowDependency: lowDependencySopCatalog,
  highDependency: highDependencySopCatalog,
  negative: productCenterNegativeSopCatalog,
});

test.describe('商品中心模块化合同维护', () => {
  test('九个模块应唯一覆盖三十四条路由和四十六条 SOP', async () => {
    const errors = validateProductCenterModuleRegistry(productCenterContractModules, contract, descriptors);
    const routes = productCenterContractModules.flatMap((module) => module.routes);

    expect(productCenterContractModules).toHaveLength(9);
    expect(routes).toHaveLength(34);
    expect(new Set(routes).size).toBe(34);
    expect(errors).toEqual([]);
  });

  test('应生成模块视图共享视图和五类轻量索引', async () => {
    const artifacts = buildProductCenterMaintenanceArtifacts(contract, productCenterContractModules);

    expect(artifacts.manifest.modules).toHaveLength(9);
    expect(Object.keys(artifacts.moduleViews)).toHaveLength(9);
    expect(artifacts.sharedView.metadata.moduleId).toBe('shared');
    expect(Object.keys(artifacts.indexes.byId).length).toBeGreaterThan(1900);
    expect(Object.keys(artifacts.indexes.byRoute)).toHaveLength(34);
    expect(Object.keys(artifacts.indexes.byEntity).length).toBeGreaterThanOrEqual(18);
    expect(Object.keys(artifacts.indexes.byModule)).toHaveLength(10);
    expect(Object.keys(artifacts.indexes.byApiOperation).length).toBeGreaterThan(500);
    expect(artifacts.snapshot.records.every((record) => /^[a-f0-9]{64}$/.test(record.sha256))).toBe(true);
  });

  test('查询应只返回目标模块路由实体或操作记录', async () => {
    const artifacts = buildProductCenterMaintenanceArtifacts(contract, productCenterContractModules);

    const routeResult = queryProductCenterContract(artifacts, { route: '/pp/brand/category' });
    const entityResult = queryProductCenterContract(artifacts, { entity: '商品分类' });
    const moduleResult = queryProductCenterContract(artifacts, { moduleId: 'brand-group' });
    const operationResult = queryProductCenterContract(artifacts, { operationKey: 'brand-menu:GET /ops-brand/brand-categories/treeList' });

    expect(routeResult.moduleIds).toEqual(['brand-item']);
    expect(routeResult.records.every((record) => record.route === '/pp/brand/category')).toBe(true);
    expect(entityResult.records.some((record) => record.entity === '商品分类')).toBe(true);
    expect(moduleResult.moduleIds).toEqual(['brand-group']);
    expect(moduleResult.records.length).toBeGreaterThan(0);
    expect(operationResult.records.some((record) => record.id.startsWith('operation:'))).toBe(true);
  });

  test('发布记录必须要求人工审核人和匹配版本', async () => {
    expect(() => buildProductCenterReleaseRecord(contract, { reviewedBy: '', version: '1.0.0' }))
      .toThrow('缺少人工审核人');
    expect(() => buildProductCenterReleaseRecord(contract, { reviewedBy: 'QA', version: '2.0.0' }))
      .toThrow('发布版本与当前合同不一致');

    const record = buildProductCenterReleaseRecord(contract, { reviewedBy: 'QA', version: '1.0.0' });
    expect(record.reviewedBy).toBe('QA');
    expect(record.sourceFingerprint).toBe(contract.metadata.sourceFingerprint);
    expect(record.sensitiveDataIncluded).toBe(false);
  });

  test('模块维护应支持有来源覆盖补充和审核后墓碑删除', async () => {
    const sourceContract: ProductCenterTestContract = {
      metadata: contract.metadata,
      routes: [{
        id: 'route:test', status: 'observed', sourceType: 'ui-runtime', confidence: 1,
        generationAllowed: true, source: [{ path: 'fixture://route' }], verifiedAt: '2026-07-24',
        version: '1.0.0', route: '/test', evidence: { name: '旧名称' },
      }],
    };
    const curated = applyProductCenterModuleCurations(sourceContract, [{
      id: 'fixture', name: '测试模块', levelOne: '商品管理', description: '测试', routes: ['/test'], entities: [],
      ruleModulePrefixes: [], requirementAliases: {}, routeAliases: {}, maintenance: { maintainer: 'codex', reviewer: 'human' },
      curations: {
        overrides: [{
          collection: 'routes', id: 'route:test', reason: '人工审核后的显示名称修正',
          source: { path: 'review://route-test' }, patch: { evidence: { name: '新名称' } },
        }],
        additions: [{
          collection: 'routes', record: {
            id: 'route:new', status: 'confirmed', sourceType: 'formal-case', confidence: 1,
            generationAllowed: true, source: [{ path: 'review://route-new' }], verifiedAt: '2026-07-24',
            version: '1.0.0', route: '/new', evidence: { name: '新路由' },
          },
        }],
        tombstones: [{ collection: 'routes', id: 'route:new', reason: '确认撤销', reviewedBy: 'QA' }],
      },
    }]);

    expect(curated.routes?.find((record) => record.id === 'route:test')?.evidence.name).toBe('新名称');
    expect(curated.routes?.some((record) => record.id === 'route:new')).toBe(false);
  });

  test('人工确认后应固化标签第二语言边界并排除不支持的高权限接口', async () => {
    const resolvedP0Ids = [
      'api-unresolved:7155f5639efe',
      'api-unresolved:840e59962052',
      'field-boundary-drift:3346748f34ca',
      'field-boundary-drift:a0757da39219',
    ];
    const expectedFieldLimits = new Map([
      ['/pp/brand/tag/statistic#action-1#primary-1#field-35', ['标签名称（第二语言）', 50]],
      ['/pp/brand/tag/statistic#action-1#primary-1#field-37', ['标签组名称（第二语言）', 10]],
      ['/pp/brand/tag/description#action-1#primary-1#field-56', ['标签名称（第二语言）', 50]],
      ['/pp/brand/tag/description#action-1#primary-1#field-58', ['标签组名称（第二语言）', 10]],
    ] as const);

    expect(contract.unresolved).toHaveLength(94);
    expect(contract.unresolved?.filter((record) => resolvedP0Ids.includes(record.id))).toEqual([]);
    for (const [fieldId, [label, maxLength]] of expectedFieldLimits) {
      const field = contract.fields?.find((record) => record.id === fieldId);
      expect(field?.status, fieldId).toBe('confirmed');
      expect(field?.evidence.label, fieldId).toBe(label);
      expect(field?.evidence.semanticMaxLength, fieldId).toEqual({ exact: maxLength, source: 'human-review' });
      expect(field?.evidence.boundaryGenerationAllowed, fieldId).toBe(true);
    }

    for (const ruleId of [
      'rule:automation-exclusion:open-ad',
      'rule:automation-exclusion:open-oms',
    ]) {
      const rule = contract.businessRules?.find((record) => record.id === ruleId);
      expect(rule?.status, ruleId).toBe('confirmed');
      expect(rule?.evidence.automationPolicy, ruleId).toBe('unsupported');
      expect(rule?.evidence.operationGenerationAllowed, ruleId).toBe(false);
    }
  });
});
