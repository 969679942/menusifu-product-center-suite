import type { ProductCenterContractModule } from './product-center-module.types';

export const brandMaterialRecipeModule = {
  id: 'brand-material-recipe',
  name: '品牌原料配方',
  levelOne: '商品管理',
  description: '品牌原料、原料分类、配方原料、配方单和记录中心。',
  routes: ['/pp/brandMaterial', '/pp/brandMaterialCategory', '/pp/bom/ingredient', '/pp/bom/list', '/pp/bom/record/list'],
  entities: ['原料', '原料分类', '配方原料', '配方单'],
  ruleModulePrefixes: ['商品管理 / 原料管理', '商品管理 / 原料分类', '商品管理 / 配方管理'],
  requirementAliases: {
    '原料': ['商品与分类', '商品管理-商品'],
    '原料分类': ['商品与分类'],
    '配方原料': ['组'],
    '配方单': ['组'],
  },
  routeAliases: {},
  maintenance: { maintainer: 'codex', reviewer: 'human' },
} as const satisfies ProductCenterContractModule;
