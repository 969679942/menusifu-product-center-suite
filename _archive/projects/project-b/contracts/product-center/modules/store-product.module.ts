import type { ProductCenterContractModule } from './product-center-module.types';

export const storeProductModule = {
  id: 'store-product',
  name: '门店商品运营',
  levelOne: '门店商品管理',
  description: '门店菜单、商品、调味、库存、多语言和属性组。',
  routes: [
    '/poi/location/menu', '/poi/location/prod-list', '/poi/location/seasoning',
    '/poi/location/soldout-record', '/poi/location/language-config', '/poi/location/attribute-group',
  ],
  entities: ['门店调味'],
  ruleModulePrefixes: [
    '门店商品管理 / 门店菜单', '门店商品管理 / 门店商品', '门店商品管理 / 门店调味',
    '门店商品管理 / 库存变更记录',
  ],
  requirementAliases: {
    '门店调味': ['门店调味', '调味管理'],
  },
  routeAliases: {},
  maintenance: { maintainer: 'codex', reviewer: 'human' },
} as const satisfies ProductCenterContractModule;
