import type { ProductCenterContractModule } from './product-center-module.types';

export const brandTagModule = {
  id: 'brand-tag',
  name: '品牌标签管理',
  levelOne: '商品管理',
  description: '描述标签、商品角标和统计标签。',
  routes: ['/pp/brand/tag/description', '/pp/brand/tag/badge', '/pp/brand/tag/statistic'],
  entities: ['描述标签', '统计标签'],
  ruleModulePrefixes: ['商品管理 / 标签管理'],
  requirementAliases: {
    '描述标签': ['标签管理'],
    '统计标签': ['标签管理'],
  },
  routeAliases: {},
  maintenance: { maintainer: 'codex', reviewer: 'human' },
} as const satisfies ProductCenterContractModule;
