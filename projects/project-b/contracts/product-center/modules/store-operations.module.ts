import type { ProductCenterContractModule } from './product-center-module.types';

export const storeOperationsModule = {
  id: 'store-operations',
  name: '门店税务配方打印',
  levelOne: '门店商品管理',
  description: '门店税种、商品税、配方列表和打印档口。',
  routes: ['/poi/tax/tax-types', '/poi/tax/product-tax', '/poi/bom/list', '/poi/printer-stall/list'],
  entities: ['税种', '打印机'],
  ruleModulePrefixes: ['门店商品管理 / 税种管理', '门店商品管理 / 配方列表', '门店商品管理 / 打印档口'],
  requirementAliases: {
    '税种': ['税种'],
    '打印机': ['商品与分类', '打印'],
  },
  routeAliases: {},
  maintenance: { maintainer: 'codex', reviewer: 'human' },
} as const satisfies ProductCenterContractModule;
