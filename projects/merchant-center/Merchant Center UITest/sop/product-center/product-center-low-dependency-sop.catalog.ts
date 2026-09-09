export type LowDependencyEntityKey =
  | 'material-category' | 'taste' | 'spec' | 'addon'
  | 'print-stall' | 'tax' | 'description-tag' | 'statistic-tag';
export type LowDependencyAction = 'edit' | 'delete';
export type LowDependencySopDefinition = {
  entityKey: LowDependencyEntityKey;
  entityName: string;
  route: string;
  listResponse: RegExp;
  identityPrefix: `AUTO_AUDIT_${string}`;
  actions: readonly LowDependencyAction[];
  notApplicable: readonly { action: LowDependencyAction; reason: string }[];
};

export const lowDependencySopCatalog = [
  { entityKey: 'material-category', entityName: '原料分类', route: '/pp/brandMaterialCategory', listResponse: /brand-categories\/treeList/, identityPrefix: 'AUTO_AUDIT_MATERIAL_CATEGORY_', actions: ['edit','delete'], notApplicable: [] },
  { entityKey: 'taste', entityName: '口味组', route: '/pp/brand/option-group/taste', listResponse: /brand-modifiers\/page/, identityPrefix: 'AUTO_AUDIT_TASTE_', actions: ['edit','delete'], notApplicable: [] },
  { entityKey: 'spec', entityName: '规格组', route: '/pp/brand/spec', listResponse: /brand-specs/, identityPrefix: 'AUTO_AUDIT_SPEC_', actions: ['edit','delete'], notApplicable: [] },
  { entityKey: 'addon', entityName: '加料组', route: '/pp/brand/option-group/additional', listResponse: /brand-addon-group/, identityPrefix: 'AUTO_AUDIT_ADDITIONAL_', actions: ['edit','delete'], notApplicable: [] },
  { entityKey: 'print-stall', entityName: '品牌打印档口', route: '/pp/printer-stall/list', listResponse: /print-stalls/, identityPrefix: 'AUTO_AUDIT_STALL_', actions: ['delete'], notApplicable: [{ action: 'edit', reason: '当前 API 合同无安全更新接口' }] },
  { entityKey: 'tax', entityName: '税种', route: '/poi/tax/tax-types', listResponse: /tax-types/, identityPrefix: 'AUTO_AUDIT_TAX_', actions: ['edit','delete'], notApplicable: [] },
  { entityKey: 'description-tag', entityName: '描述标签', route: '/pp/brand/tag/description', listResponse: /brand-tags\/page/, identityPrefix: 'AUTO_AUDIT_DESCRIPTION_TAG_', actions: ['delete'], notApplicable: [{ action: 'edit', reason: '当前 API 合同无安全更新接口' }] },
  { entityKey: 'statistic-tag', entityName: '统计标签', route: '/pp/brand/tag/statistic', listResponse: /brand-tags\/page/, identityPrefix: 'AUTO_AUDIT_STAT_TAG_', actions: ['delete'], notApplicable: [{ action: 'edit', reason: '当前 API 合同无安全更新接口' }] },
] as const satisfies readonly LowDependencySopDefinition[];

export function generateLowDependencySopCases(catalog: readonly LowDependencySopDefinition[]) {
  return catalog.flatMap((definition) => definition.actions.map((action) => ({ ...definition, action })));
}
