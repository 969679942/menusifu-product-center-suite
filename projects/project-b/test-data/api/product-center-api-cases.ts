export type ProductCenterApiCoverage = 'positive-crud' | 'deferred-external';

export type ProductCenterApiCase = {
  entity: string;
  route: string;
  coverage: ProductCenterApiCoverage;
  specFile?: string;
  operationKeys: readonly string[];
  reason?: string;
};

const brand = (method: string, path: string): string => `brand-menu:${method} ${path}`;

export const productCenterApiCases: readonly ProductCenterApiCase[] = [
  {
    entity: '商品分类', route: '/pp/brand/category', coverage: 'positive-crud',
    specFile: 'tests/api/product-center-direct-crud.spec.ts',
    operationKeys: [brand('POST', '/ops-brand/brand-categories'), brand('GET', '/ops-brand/brand-categories/treeList'), brand('PUT', '/ops-brand/brand-categories/{id}'), brand('DELETE', '/ops-brand/brand-categories/{id}')],
  },
  {
    entity: '打印档口（品牌）', route: '/pp/printer-stall/list', coverage: 'positive-crud',
    specFile: 'tests/api/product-center-p2-direct-crud.spec.ts',
    operationKeys: [brand('POST', '/ops-brand/print-stalls'), brand('GET', '/ops-brand/print-stalls'), brand('DELETE', '/ops-brand/print-stalls/{id}')],
  },
  {
    entity: '规格组', route: '/pp/brand/spec', coverage: 'positive-crud',
    specFile: 'tests/api/product-center-p2-direct-crud.spec.ts',
    operationKeys: [brand('POST', '/ops-brand/brand-specs'), brand('GET', '/ops-brand/brand-specs/page'), brand('GET', '/ops-brand/brand-specs/{id}'), brand('PUT', '/ops-brand/brand-specs/{id}'), brand('DELETE', '/ops-brand/brand-specs/{id}')],
  },
  {
    entity: '税种', route: '/poi/tax/tax-types', coverage: 'positive-crud',
    specFile: 'tests/api/product-center-p2-direct-crud.spec.ts',
    operationKeys: [brand('POST', '/ops-poi/tax-types'), brand('POST', '/ops-poi/tax-types/pageQuery'), brand('PUT', '/ops-poi/tax-types/{id}'), brand('DELETE', '/ops-poi/tax-types/{id}')],
  },
  {
    entity: '口味组', route: '/pp/brand/option-group/taste', coverage: 'positive-crud',
    specFile: 'tests/api/product-center-p2-direct-crud.spec.ts',
    operationKeys: [brand('POST', '/ops-brand/brand-modifiers'), brand('GET', '/ops-brand/brand-modifiers/page'), brand('GET', '/ops-brand/brand-modifiers/{id}'), brand('PUT', '/ops-brand/brand-modifiers/check/{id}'), brand('PUT', '/ops-brand/brand-modifiers/{id}'), brand('DELETE', '/ops-brand/brand-modifiers/{id}')],
  },
  {
    entity: '做法组', route: '/pp/brand/option-group/method', coverage: 'positive-crud',
    specFile: 'tests/api/product-center-direct-crud.spec.ts',
    operationKeys: [brand('POST', '/ops-brand/brand-modifiers'), brand('GET', '/ops-brand/brand-modifiers/page'), brand('GET', '/ops-brand/brand-modifiers/{id}'), brand('PUT', '/ops-brand/brand-modifiers/check/{id}'), brand('PUT', '/ops-brand/brand-modifiers/{id}'), brand('DELETE', '/ops-brand/brand-modifiers/{id}')],
  },
  {
    entity: '加料组', route: '/pp/brand/option-group/additional', coverage: 'positive-crud',
    specFile: 'tests/api/product-center-p2-direct-crud.spec.ts',
    operationKeys: [brand('POST', '/ops-brand/brand-addon-group'), brand('GET', '/ops-brand/brand-addon-group/list'), brand('GET', '/ops-brand/brand-addon-group/{id}'), brand('PUT', '/ops-brand/brand-addon-group/check/{id}'), brand('PUT', '/ops-brand/brand-addon-group/{id}'), brand('DELETE', '/ops-brand/brand-addon-group/{id}')],
  },
  {
    entity: '套餐组', route: '/pp/brand/combo', coverage: 'positive-crud',
    specFile: 'tests/api/product-center-p2-direct-crud.spec.ts',
    operationKeys: [brand('POST', '/ops-brand/brand-sections'), brand('GET', '/ops-brand/brand-sections/list'), brand('GET', '/ops-brand/brand-sections/{id}'), brand('DELETE', '/ops-brand/brand-sections/{id}')],
  },
  {
    entity: '描述标签', route: '/pp/brand/tag/description', coverage: 'positive-crud',
    specFile: 'tests/api/product-center-p2-direct-crud.spec.ts',
    operationKeys: [brand('POST', '/ops-brand/brand-tag-groups'), brand('GET', '/ops-brand/brand-tag-groups/list'), brand('POST', '/ops-brand/brand-tags'), brand('GET', '/ops-brand/brand-tags/page'), brand('DELETE', '/ops-brand/brand-tags/{id}'), brand('DELETE', '/ops-brand/brand-tag-groups/{id}')],
  },
  {
    entity: '统计标签', route: '/pp/brand/tag/statistic', coverage: 'positive-crud',
    specFile: 'tests/api/product-center-p2-direct-crud.spec.ts',
    operationKeys: [brand('POST', '/ops-brand/brand-tag-groups'), brand('GET', '/ops-brand/brand-tag-groups/list'), brand('POST', '/ops-brand/brand-tags'), brand('GET', '/ops-brand/brand-tags/page'), brand('DELETE', '/ops-brand/brand-tags/{id}'), brand('DELETE', '/ops-brand/brand-tag-groups/{id}')],
  },
  {
    entity: '原料', route: '/pp/brandMaterial', coverage: 'positive-crud',
    specFile: 'tests/api/product-center-direct-crud.spec.ts',
    operationKeys: [brand('POST', '/ops-brand/brand-ingredients'), brand('GET', '/ops-brand/brand-ingredients'), brand('GET', '/ops-brand/brand-ingredients/{id}'), brand('PUT', '/ops-brand/brand-ingredients/{id}'), brand('DELETE', '/ops-brand/brand-ingredients/{id}')],
  },
  {
    entity: '原料分类', route: '/pp/brandMaterialCategory', coverage: 'positive-crud',
    specFile: 'tests/api/product-center-p2-direct-crud.spec.ts',
    operationKeys: [brand('POST', '/ops-brand/brand-categories'), brand('PUT', '/ops-brand/brand-categories/{id}'), brand('DELETE', '/ops-brand/brand-categories/{id}')],
  },
  {
    entity: '配方原料', route: '/pp/bom/ingredient', coverage: 'positive-crud',
    specFile: 'tests/api/product-center-p2-direct-crud.spec.ts',
    operationKeys: [brand('POST', '/ops-brand/recipe-ingredients'), brand('POST', '/ops-brand/recipe-ingredients/list'), brand('PUT', '/ops-brand/recipe-ingredients/{id}'), brand('DELETE', '/ops-brand/recipe-ingredients/{id}')],
  },
  {
    entity: '配方单', route: '/pp/bom/list', coverage: 'positive-crud',
    specFile: 'tests/api/product-center-direct-crud.spec.ts',
    operationKeys: [brand('POST', '/ops-brand/bom/item/batch'), brand('POST', '/ops-brand/bom/page'), brand('GET', '/ops-brand/bom/{id}'), brand('PUT', '/ops-brand/bom/item/batch'), brand('DELETE', '/ops-brand/bom/{id}')],
  },
  {
    entity: '菜单', route: '/bm/menu/list', coverage: 'positive-crud',
    specFile: 'tests/api/product-center-p2-direct-crud.spec.ts',
    operationKeys: [brand('POST', '/ops-brand/brand-menus'), brand('POST', '/ops-brand/brand-menus/page'), brand('GET', '/ops-brand/brand-menus/{id}'), brand('PUT', '/ops-brand/brand-menus/{id}'), brand('DELETE', '/ops-brand/brand-menus/{id}')],
  },
  {
    entity: '打印机', route: '/poi/printer-stall/list', coverage: 'positive-crud',
    specFile: 'tests/api/product-center-p2-direct-crud.spec.ts',
    operationKeys: [brand('POST', '/ops-poi/item-printers/printers'), brand('POST', '/ops-poi/item-printers/printers/page'), brand('PUT', '/ops-poi/item-printers/printers/{printerId}'), brand('DELETE', '/ops-poi/item-printers/printers')],
  },
  {
    entity: '品牌调味', route: '/pp/brand/seasoning/list', coverage: 'positive-crud',
    specFile: 'tests/api/endpoints/seasoning/seasoning.endpoint.api.spec.ts',
    operationKeys: [brand('POST', '/ops-brand/global-modifier/batch'), brand('GET', '/ops-brand/global-modifier/list'), brand('GET', '/ops-brand/global-modifier/{id}'), brand('PUT', '/ops-brand/global-modifier/{id}'), brand('DELETE', '/ops-brand/global-modifier/{id}')],
  },
  {
    entity: '门店调味', route: '/poi/location/seasoning', coverage: 'deferred-external',
    operationKeys: [brand('GET', '/internal/pos/pull/global-modifier'), brand('GET', '/ops-poi/poi-modifiers/push')],
    reason: '当前没有安全的 AUTO_AUDIT 创建、下发、终端观测和清理链路；只保留接口合同检查，不执行写接口。',
  },
] as const;
