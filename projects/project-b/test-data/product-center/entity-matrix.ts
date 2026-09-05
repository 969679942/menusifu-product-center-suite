export const fivePilotEntities = [
  { entity: '商品分类', key: 'category', route: '/pp/brand/category', response: /brand-categories\/treeList/ },
  { entity: '做法组', key: 'method', route: '/pp/brand/option-group/method', response: /brand-modifiers\/page/ },
  { entity: '原料', key: 'material', route: '/pp/brandMaterial', response: /brand-ingredients/ },
  { entity: '配方单', key: 'bom', route: '/pp/bom/list', response: /bom\/page/ },
  { entity: '品牌调味', key: 'seasoning', route: '/pp/brand/seasoning/list', response: /global-modifier/ },
] as const;

export const productCenterEntities = [
  ['商品分类', '/pp/brand/category'], ['打印档口（品牌）', '/pp/printer-stall/list'], ['规格组', '/pp/brand/spec'], ['税种', '/poi/tax/tax-types'],
  ['口味组', '/pp/brand/option-group/taste'], ['做法组', '/pp/brand/option-group/method'], ['加料组', '/pp/brand/option-group/additional'], ['套餐组', '/pp/brand/combo'],
  ['描述标签', '/pp/brand/tag/description'], ['统计标签', '/pp/brand/tag/statistic'], ['原料', '/pp/brandMaterial'], ['原料分类', '/pp/brandMaterialCategory'],
  ['配方原料', '/pp/bom/ingredient'], ['配方单', '/pp/bom/list'], ['菜单', '/bm/menu/list'], ['打印机', '/poi/printer-stall/list'],
  ['品牌调味', '/pp/brand/seasoning/list'], ['门店调味', '/poi/location/seasoning'],
] as const;
