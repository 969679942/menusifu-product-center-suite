import type { ProductCenterContractModule } from './product-center-module.types';

export const brandItemModule = {
  id: 'brand-item',
  name: '品牌商品基础',
  levelOne: '商品管理',
  description: '品牌商品、分类、多语言和图片管理。',
  routes: ['/pp/brand/list', '/pp/language-manage', '/pp/brand/category', '/pp/brandpictrue'],
  entities: ['商品分类'],
  ruleModulePrefixes: ['商品管理 / 商品', '商品管理 / 多语言管理', '商品管理 / 分类', '商品管理 / 图片管理'],
  requirementAliases: {
    '商品分类': ['商品与分类', '分类'],
  },
  routeAliases: {},
  curations: {
    additions: [{
      collection: 'businessRules',
      record: {
        id: 'rule:category-child-blocked-by-product',
        status: 'confirmed',
        sourceType: 'confirmed-prd-formal-case',
        confidence: 1,
        generationAllowed: true,
        source: [{
          path: 'merchant-center:/Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
          locator: 'TC-ITEM-STD-035',
        }],
        verifiedAt: '2026-07-25',
        version: '1.0.0',
        route: '/pp/brand/category',
        conflictStatus: 'none',
        evidence: {
          condition: '一级分类下已存在商品',
          action: '在该一级分类下新增子分类并尝试保存',
          result: '不可成功新增二级分类且一级分类下不产生子分类数据',
          entity: '商品分类',
        },
      },
    }],
  },
  maintenance: { maintainer: 'codex', reviewer: 'human' },
} as const satisfies ProductCenterContractModule;
