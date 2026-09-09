import type { ProductCenterContractModule } from './product-center-module.types';

export const brandSeasoningModule = {
  id: 'brand-seasoning',
  name: '品牌调味管理',
  levelOne: '商品管理',
  description: '品牌调味及调味下发记录。',
  routes: ['/pp/brand/seasoning/list', '/pp/brand/seasoning/record'],
  entities: ['品牌调味'],
  ruleModulePrefixes: ['商品管理 / 调味管理'],
  requirementAliases: {
    '品牌调味': ['品牌调味', '调味管理'],
  },
  routeAliases: {
    '/pp/brand/seasoning/list': ['/pp/brand/seasoning/record'],
  },
  maintenance: { maintainer: 'codex', reviewer: 'human' },
} as const satisfies ProductCenterContractModule;
