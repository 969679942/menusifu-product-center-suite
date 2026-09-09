import type { ProductCenterContractModule } from './product-center-module.types';

export const brandPrintModule = {
  id: 'brand-print',
  name: '品牌打印档口',
  levelOne: '商品管理',
  description: '品牌打印档口和下发记录。',
  routes: ['/pp/printer-stall/list', '/pp/printer-stall/record'],
  entities: ['打印档口（品牌）', '品牌打印档口'],
  ruleModulePrefixes: ['商品管理 / 打印档口'],
  requirementAliases: {
    '打印档口（品牌）': ['商品与分类', '打印档口'],
    '品牌打印档口': ['商品与分类', '打印档口'],
  },
  routeAliases: {},
  maintenance: { maintainer: 'codex', reviewer: 'human' },
} as const satisfies ProductCenterContractModule;
