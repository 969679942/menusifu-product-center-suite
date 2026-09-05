import type { ProductCenterContractModule } from './product-center-module.types';

export const menuModule = {
  id: 'menu',
  name: '品牌菜单管理',
  levelOne: '菜单管理',
  description: '品牌菜单和菜单下发记录。',
  routes: ['/bm/menu/list', '/bm/menu/record/list'],
  entities: ['菜单'],
  ruleModulePrefixes: ['菜单管理'],
  requirementAliases: {
    '菜单': ['菜单', '菜单下发'],
  },
  routeAliases: {
    '/bm/menu/list': ['/bm/menu/record/list'],
  },
  curations: {
    additions: [
      confirmedMenuRule(
        'rule:menu-publish-generates-store-menu-and-products',
        '上下游关系 / 菜单引用品牌商品库商品，并通过下发生成门店菜单和门店商品。',
        '菜单引用品牌商品库商品，并通过下发生成门店菜单和门店商品。',
      ),
      confirmedMenuRule(
        'rule:menu-price-syncs-on-publish',
        '核心业务规则 / 菜单价格随菜单下发同步到门店。',
        '菜单价格随菜单下发同步到门店。',
      ),
      confirmedMenuRule(
        'rule:pos-price-change-applies-after-publish',
        '核心业务规则 / POS 端是否支持改价字段打开或关闭后，需下发后在门店 POS 生效。',
        'POS 端是否支持改价字段打开或关闭后，需下发后在门店 POS 生效。',
      ),
      confirmedMenuRule(
        'rule:client-hidden-applies-after-publish',
        '核心业务规则 / 客户端隐藏配置下发后，门店菜单只读展示，终端按配置隐藏。',
        '客户端隐藏配置下发后，门店菜单只读展示，终端按配置隐藏。',
      ),
      confirmedMenuRule(
        'rule:catalog-price-sync-respects-menu-price-override',
        '核心业务规则 / 菜单未编辑过售卖价时，商品中心价格变更可同步到菜单商品；菜单已编辑过售卖价时，商品中心价格变更不再自动覆盖菜单商品售卖价。',
        '菜单未编辑过售卖价时，商品中心价格变更可同步；菜单已编辑过售卖价时不再自动覆盖。',
      ),
      confirmedMenuRule(
        'rule:channel-and-scenario-price-fallback',
        '核心业务规则 / 渠道价优先匹配当前渠道；场景价优先匹配当前订单类型；未命中渠道价或场景价时回退标准价。',
        '渠道价和场景价优先匹配；未命中时回退标准价。',
      ),
      confirmedMenuRule(
        'rule:deleted-special-price-falls-back-after-publish',
        '核心业务规则 / 删除渠道价或场景价并下发后，终端回退展示标准价。',
        '删除渠道价或场景价并下发后，终端回退展示标准价。',
      ),
      confirmedMenuRule(
        'rule:pos-price-change-disabled-after-publish',
        '异常与生效 / POS 端是否支持改价字段从开切为关并下发 POS 后，之前可改价的商品不再允许 POS 改价。',
        'POS 改价从开切为关并下发后，之前可改价的商品不再允许 POS 改价。',
      ),
      confirmedMenuRule(
        'rule:display-time-applies-after-republish',
        '异常与生效 / 更新菜单页或区块展示时间后，需重新下发后终端按新时间展示。',
        '更新菜单页或区块展示时间后，需重新下发后终端按新时间展示。',
      ),
    ],
  },
  maintenance: { maintainer: 'codex', reviewer: 'human' },
} as const satisfies ProductCenterContractModule;

function confirmedMenuRule(id: string, locator: string, statement: string) {
  return {
    collection: 'businessRules' as const,
    record: {
      id,
      status: 'confirmed',
      sourceType: 'product-confirmed-business-rule',
      confidence: 1,
      generationAllowed: true,
      source: [{
        path: 'merchant-center:/Merchant Center Info/商品中心业务规则.md',
        locator: `## 25. 菜单管理 / 菜单 / ${locator}`,
      }],
      verifiedAt: '2026-07-28',
      version: '1.0.0',
      module: '菜单管理 / 菜单',
      entity: '菜单',
      route: '/bm/menu/list',
      conflictStatus: 'none',
      evidence: { statement },
    },
  } as const;
}
