import type { ProductCenterContractModule } from './product-center-module.types';

export const brandGroupModule = {
  id: 'brand-group',
  name: '品牌组管理',
  levelOne: '商品管理',
  description: '规格、属性、口味、做法、加料和套餐组。',
  routes: [
    '/pp/brand/spec', '/pp/brand/option-group/attribute-group-set', '/pp/brand/option-group/taste',
    '/pp/brand/option-group/method', '/pp/brand/option-group/additional', '/pp/brand/combo',
  ],
  entities: ['规格组', '口味组', '做法组', '加料组', '套餐组'],
  ruleModulePrefixes: [
    '商品管理 / 规格组', '商品管理 / 排序规则', '商品管理 / 口味组',
    '商品管理 / 做法组', '商品管理 / 加料组', '商品管理 / 套餐组',
  ],
  requirementAliases: {
    '规格组': ['规格组'],
    '口味组': ['口味组'],
    '做法组': ['做法组'],
    '加料组': ['加料组'],
    '套餐组': ['套餐组'],
  },
  routeAliases: {},
  maintenance: { maintainer: 'codex', reviewer: 'human' },
} as const satisfies ProductCenterContractModule;
