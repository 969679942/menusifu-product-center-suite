import type { ProductCenterSopDefinition } from './product-center-sop.types';

export const productCenterSopCatalog = [
  {
    entityKey: 'category',
    entityName: '商品分类',
    route: '/pp/brand/category',
    listResponse: /brand-categories\/treeList/,
    testIdentityPrefix: 'AUTO_AUDIT_CATEGORY_',
  },
  {
    entityKey: 'method',
    entityName: '做法组',
    route: '/pp/brand/option-group/method',
    listResponse: /brand-modifiers\/page/,
    testIdentityPrefix: 'AUTO_AUDIT_METHOD_',
  },
  {
    entityKey: 'material',
    entityName: '原料',
    route: '/pp/brandMaterial',
    listResponse: /brand-ingredients/,
    testIdentityPrefix: 'AUTO_AUDIT_MATERIAL_',
  },
  {
    entityKey: 'seasoning',
    entityName: '品牌调味',
    route: '/pp/brand/seasoning/list',
    listResponse: /global-modifier/,
    testIdentityPrefix: 'AUTO_AUDIT_SEASONING_',
  },
  {
    entityKey: 'bom',
    entityName: '配方单',
    route: '/pp/bom/list',
    listResponse: /bom\/page/,
    testIdentityPrefix: 'AUTO_AUDIT_BOM_',
  },
] as const satisfies readonly ProductCenterSopDefinition[];
