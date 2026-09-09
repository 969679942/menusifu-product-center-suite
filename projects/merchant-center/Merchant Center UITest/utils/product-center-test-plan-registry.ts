import fs from 'node:fs';
import path from 'node:path';
import {
  productCenterSourceMaterialRoot,
  productCenterCanonicalTestCaseRoot,
} from './product-center-test-plan-source';

export type ProductCenterTestPlanRegistration = {
  planId: string;
  module: string;
  directory: string;
  formalFileName: string;
  sourceMaterialFileName: string;
  bindingProvider: string;
  runnerId: string;
};

export type ProductCenterTestPlanRegistry = {
  schemaVersion: '1.0.0';
  applicationId: string;
  plans: ProductCenterTestPlanRegistration[];
};

export function defaultProductCenterTestPlanRegistryPath(projectRoot: string): string {
  return path.join(projectRoot, 'contracts/product-center/test-plan-registry.json');
}

export function loadProductCenterTestPlanRegistry(
  projectRoot: string,
  registryPath = defaultProductCenterTestPlanRegistryPath(projectRoot),
): ProductCenterTestPlanRegistry {
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as ProductCenterTestPlanRegistry;
  validateProductCenterTestPlanRegistryShape(registry);
  return registry;
}

export function validateProductCenterTestPlanRegistry(
  registry: ProductCenterTestPlanRegistry,
  infoRoot: string,
): void {
  validateProductCenterTestPlanRegistryShape(registry);
  for (const plan of registry.plans) {
    const canonicalRoot = productCenterRegisteredTestPlanRoot(infoRoot, plan);
    const markdownFiles = fs.existsSync(canonicalRoot)
      ? fs.readdirSync(canonicalRoot).filter((fileName) => /\.md$/i.test(fileName))
      : [];
    if (markdownFiles.length !== 1 || markdownFiles[0] !== plan.formalFileName) {
      throw new Error(`测试方案 ${plan.planId} 必须且只能保留 ${plan.formalFileName}`);
    }
    const sourcePath = productCenterRegisteredSourceMaterialPath(infoRoot, plan);
    if (!fs.existsSync(sourcePath)) throw new Error(`测试方案来源资料不存在：${sourcePath}`);
  }
}

export function productCenterRegisteredTestPlanRoot(
  infoRoot: string,
  plan: ProductCenterTestPlanRegistration,
): string {
  return path.join(productCenterCanonicalTestCaseRoot(infoRoot), plan.directory);
}

export function productCenterRegisteredFormalPath(
  infoRoot: string,
  plan: ProductCenterTestPlanRegistration,
): string {
  return path.join(productCenterRegisteredTestPlanRoot(infoRoot, plan), plan.formalFileName);
}

export function productCenterRegisteredSourceMaterialPath(
  infoRoot: string,
  plan: ProductCenterTestPlanRegistration,
): string {
  return path.join(productCenterSourceMaterialRoot(infoRoot), plan.directory, plan.sourceMaterialFileName);
}

function validateProductCenterTestPlanRegistryShape(registry: ProductCenterTestPlanRegistry): void {
  if (registry.schemaVersion !== '1.0.0') throw new Error('商品中心测试方案注册表版本不受支持');
  if (!registry.applicationId.trim()) throw new Error('商品中心测试方案注册表缺少 applicationId');
  if (registry.plans.length === 0) throw new Error('商品中心测试方案注册表不得为空');
  const uniqueFields: Array<keyof Pick<ProductCenterTestPlanRegistration, 'planId' | 'module' | 'directory' | 'formalFileName'>> = [
    'planId',
    'module',
    'directory',
    'formalFileName',
  ];
  for (const field of uniqueFields) {
    const values = registry.plans.map((plan) => plan[field]);
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
    if (duplicates.length > 0) throw new Error(`商品中心测试方案注册表 ${field} 重复：${[...new Set(duplicates)].join(',')}`);
  }
  for (const plan of registry.plans) {
    for (const [field, value] of Object.entries(plan)) {
      if (typeof value !== 'string' || !value.trim()) throw new Error(`测试方案 ${plan.planId || '<unknown>'} 字段 ${field} 不能为空`);
      if (field.endsWith('FileName') && path.basename(value) !== value) {
        throw new Error(`测试方案 ${plan.planId} 的 ${field} 只能是文件名`);
      }
    }
    if (path.basename(plan.directory) !== plan.directory || plan.directory === '.' || plan.directory === '..') {
      throw new Error(`测试方案 ${plan.planId} 的目录必须是单层安全目录名`);
    }
  }
}
