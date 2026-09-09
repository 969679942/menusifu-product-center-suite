import path from 'node:path';

export const productCenterTestPlanModuleDirectories = {
  item: '商品中心-商品管理-商品',
  group: '商品中心-商品管理-组',
  seasoning: '商品中心-商品管理-调味管理',
  tag: '商品中心-商品管理-标签管理',
  image: '商品中心-商品管理-图片管理',
} as const;

export type ProductCenterTestPlanModule = keyof typeof productCenterTestPlanModuleDirectories;

export function productCenterTestPlanIntakeRoot(infoRoot: string): string {
  return path.join(infoRoot, '00-待转换测试方案');
}

export function productCenterCanonicalTestCaseRoot(infoRoot: string): string {
  return path.join(productCenterTestPlanIntakeRoot(infoRoot), '用例库');
}

export function productCenterSourceMaterialRoot(infoRoot: string): string {
  return path.join(productCenterTestPlanIntakeRoot(infoRoot), '来源资料');
}

export function productCenterCompletedTestPlanRoot(infoRoot: string): string {
  return path.join(productCenterTestPlanIntakeRoot(infoRoot), '已完成');
}

export function productCenterUnlandedTestPlanRoot(infoRoot: string): string {
  return path.join(productCenterTestPlanIntakeRoot(infoRoot), '未落地');
}

export function productCenterTestPlanModuleRoot(
  infoRoot: string,
  module: ProductCenterTestPlanModule,
): string {
  return path.join(productCenterCanonicalTestCaseRoot(infoRoot), productCenterTestPlanModuleDirectories[module]);
}

export function productCenterSourceMaterialModuleRoot(
  infoRoot: string,
  module: ProductCenterTestPlanModule,
): string {
  return path.join(productCenterSourceMaterialRoot(infoRoot), productCenterTestPlanModuleDirectories[module]);
}
