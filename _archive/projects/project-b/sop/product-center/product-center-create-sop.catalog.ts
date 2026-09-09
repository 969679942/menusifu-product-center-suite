import type { ProductCenterCoreEntityKey } from './product-center-sop.types';

export type ProductCenterCreateDependency =
  | 'bom-product'
  | 'material'
  | 'recipe-ingredient';

export type ProductCenterCreateSopDefinition = {
  entityKey: ProductCenterCoreEntityKey;
  entityName: string;
  route: string;
  listResponse: RegExp;
  createResponse: RegExp;
  testIdentityPrefix: `AUTO_AUDIT_${string}`;
  createMode: 'ui';
  verifyModes: readonly ['api', 'ui'];
  cleanupMode: 'api-finally';
  apiDependencies: readonly ProductCenterCreateDependency[];
};

export const productCenterCreateSopCatalog = [
  {
    entityKey: 'category', entityName: '商品分类', route: '/pp/brand/category',
    listResponse: /brand-categories\/treeList/, createResponse: /brand-categories$/,
    testIdentityPrefix: 'AUTO_AUDIT_CATEGORY_', createMode: 'ui', verifyModes: ['api', 'ui'],
    cleanupMode: 'api-finally', apiDependencies: [],
  },
  {
    entityKey: 'method', entityName: '做法组', route: '/pp/brand/option-group/method',
    listResponse: /brand-modifiers\/page/, createResponse: /brand-modifiers$/,
    testIdentityPrefix: 'AUTO_AUDIT_METHOD_', createMode: 'ui', verifyModes: ['api', 'ui'],
    cleanupMode: 'api-finally', apiDependencies: [],
  },
  {
    entityKey: 'material', entityName: '原料', route: '/pp/brandMaterial',
    listResponse: /brand-ingredients/, createResponse: /brand-ingredients$/,
    testIdentityPrefix: 'AUTO_AUDIT_MATERIAL_', createMode: 'ui', verifyModes: ['api', 'ui'],
    cleanupMode: 'api-finally', apiDependencies: [],
  },
  {
    entityKey: 'seasoning', entityName: '品牌调味', route: '/pp/brand/seasoning/list',
    listResponse: /global-modifier/, createResponse: /global-modifier$/,
    testIdentityPrefix: 'AUTO_AUDIT_SEASONING_', createMode: 'ui', verifyModes: ['api', 'ui'],
    cleanupMode: 'api-finally', apiDependencies: [],
  },
  {
    entityKey: 'bom', entityName: '配方单', route: '/pp/bom/list',
    listResponse: /bom\/page/, createResponse: /bom\/item\/batch$/,
    testIdentityPrefix: 'AUTO_AUDIT_BOM_', createMode: 'ui', verifyModes: ['api', 'ui'],
    cleanupMode: 'api-finally', apiDependencies: ['bom-product', 'material', 'recipe-ingredient'],
  },
] as const satisfies readonly ProductCenterCreateSopDefinition[];
