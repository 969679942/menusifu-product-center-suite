export type HighDependencyEntityKey = 'recipe-ingredient' | 'menu' | 'printer' | 'combo';
export type HighDependencyAction = 'edit' | 'delete';

export type HighDependencySopDefinition = {
  entityKey: HighDependencyEntityKey;
  entityName: string;
  route: string;
  listResponse: RegExp;
  identityPrefix: `AUTO_AUDIT_${string}`;
  actions: readonly HighDependencyAction[];
  dependencies: readonly string[];
  notApplicable: readonly { action: HighDependencyAction; reason: string }[];
};

export const highDependencySopCatalog = [
  { entityKey: 'recipe-ingredient', entityName: '配方原料', route: '/pp/bom/ingredient', listResponse: /recipe-ingredients\/list/, identityPrefix: 'AUTO_AUDIT_RECIPE_INGREDIENT_', actions: ['edit', 'delete'], dependencies: ['material-category-readonly', 'material'], notApplicable: [] },
  { entityKey: 'menu', entityName: '菜单', route: '/bm/menu/list', listResponse: /brand-menus\/page/, identityPrefix: 'AUTO_AUDIT_MENU_', actions: ['edit', 'delete'], dependencies: [], notApplicable: [] },
  { entityKey: 'printer', entityName: '打印机', route: '/poi/printer-stall/list', listResponse: /print-stalls\/page/, identityPrefix: 'AUTO_AUDIT_PRINTER_', actions: ['edit'], dependencies: ['poi-print-stall-readonly'], notApplicable: [{ action: 'delete', reason: '当前 UI 二级菜单仅提供 Unlink，不提供打印机实体删除' }] },
  { entityKey: 'combo', entityName: '套餐组', route: '/pp/brand/combo', listResponse: /brand-sections\/list/, identityPrefix: 'AUTO_AUDIT_COMBO_', actions: ['delete'], dependencies: ['bom-product', 'sku'], notApplicable: [{ action: 'edit', reason: '当前 UI 操作菜单仅显示 Delete，未暴露编辑入口' }] },
] as const satisfies readonly HighDependencySopDefinition[];

export function generateHighDependencySopCases(catalog: readonly HighDependencySopDefinition[]) {
  return catalog.flatMap((definition) => definition.actions.map((action) => ({ ...definition, action })));
}