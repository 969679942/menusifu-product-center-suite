export type ProductCenterNegativeCase = {
  id: string;
  entityName: string;
  route: string;
  scenario: 'required' | 'max-length' | 'prerequisite-disabled' | 'cancel-delete' | 'relation-blocked';
  sourceId: string;
  testTitle: string;
  boundary?: {
    fieldLabel: string;
    locatorKey: string;
    maxLength: number;
    acceptedLength: number;
    rejectedLength: number;
  };
  generationAllowed: true;
};

export const productCenterNegativeSopCatalog = [
  { id: 'category-required', entityName: '商品分类', route: '/pp/brand/category', scenario: 'required', sourceId: 'field-constraint:/pp/brand/category#field-1', testTitle: '商品分类空提交应保持保存禁用且不发送创建请求', generationAllowed: true },
  { id: 'category-max-length', entityName: '商品分类', route: '/pp/brand/category', scenario: 'max-length', sourceId: 'field-constraint:/pp/brand/category#field-1', testTitle: '商品分类名称应精确限制为一百字符', boundary: { fieldLabel: '商品分类名称', locatorKey: 'category-name', maxLength: 100, acceptedLength: 100, rejectedLength: 101 }, generationAllowed: true },
  { id: 'method-required', entityName: '做法组', route: '/pp/brand/option-group/method', scenario: 'required', sourceId: 'field-constraint:/pp/brand/option-group/method#field-1', testTitle: '做法组空提交应显示校验且不发送创建请求', generationAllowed: true },
  { id: 'method-max-length', entityName: '做法组', route: '/pp/brand/option-group/method', scenario: 'max-length', sourceId: 'field-constraint:/pp/brand/option-group/method#field-1', testTitle: '做法组名称应精确限制为一百字符', boundary: { fieldLabel: '做法组名称', locatorKey: 'method-name', maxLength: 100, acceptedLength: 100, rejectedLength: 101 }, generationAllowed: true },
  { id: 'addon-prerequisite', entityName: '加料组', route: '/pp/brand/option-group/additional', scenario: 'prerequisite-disabled', sourceId: 'field-constraint:/pp/brand/option-group/additional#field-1', testTitle: '加料组未配置加料项时提交应保持禁用', generationAllowed: true },
  { id: 'printer-required', entityName: '打印机', route: '/poi/printer-stall/list', scenario: 'required', sourceId: 'field-constraint:/poi/printer-stall/list#action-3#primary-1#field-44', testTitle: '打印机空提交应显示校验且不发送创建请求', generationAllowed: true },
  { id: 'category-cancel-delete', entityName: '商品分类', route: '/pp/brand/category', scenario: 'cancel-delete', sourceId: 'runtime-negative-contract:category-delete-cancel', testTitle: '取消商品分类删除应保留原记录且不发送删除请求', generationAllowed: true },
  { id: 'category-child-blocked-by-product', entityName: '商品分类', route: '/pp/brand/category', scenario: 'relation-blocked', sourceId: 'rule:category-child-blocked-by-product', testTitle: '分类下已有商品时不可继续新增子分类', generationAllowed: true },
  { id: 'statistic-tag-second-language-max', entityName: '统计标签', route: '/pp/brand/tag/statistic', scenario: 'max-length', sourceId: '/pp/brand/tag/statistic#action-1#primary-1#field-35', testTitle: '统计标签名称第二语言应允许五十字符并截断第五十一字符', boundary: { fieldLabel: '标签名称（第二语言）', locatorKey: 'tag-second-language', maxLength: 50, acceptedLength: 50, rejectedLength: 51 }, generationAllowed: true },
  { id: 'statistic-tag-group-second-language-max', entityName: '统计标签', route: '/pp/brand/tag/statistic', scenario: 'max-length', sourceId: '/pp/brand/tag/statistic#action-1#primary-1#field-37', testTitle: '统计标签组名称第二语言应允许十字符并截断第十一字符', boundary: { fieldLabel: '标签组名称（第二语言）', locatorKey: 'tag-group-second-language', maxLength: 10, acceptedLength: 10, rejectedLength: 11 }, generationAllowed: true },
  { id: 'description-tag-second-language-max', entityName: '描述标签', route: '/pp/brand/tag/description', scenario: 'max-length', sourceId: '/pp/brand/tag/description#action-1#primary-1#field-56', testTitle: '描述标签名称第二语言应允许五十字符并截断第五十一字符', boundary: { fieldLabel: '标签名称（第二语言）', locatorKey: 'tag-second-language', maxLength: 50, acceptedLength: 50, rejectedLength: 51 }, generationAllowed: true },
  { id: 'description-tag-group-second-language-max', entityName: '描述标签', route: '/pp/brand/tag/description', scenario: 'max-length', sourceId: '/pp/brand/tag/description#action-1#primary-1#field-58', testTitle: '描述标签组名称第二语言应允许十字符并截断第十一字符', boundary: { fieldLabel: '标签组名称（第二语言）', locatorKey: 'tag-group-second-language', maxLength: 10, acceptedLength: 10, rejectedLength: 11 }, generationAllowed: true },
] as const satisfies readonly ProductCenterNegativeCase[];

export const productCenterNegativeReviewRequired = [
  { scenario: 'duplicate', reason: '无 observed/confirmed 且 generationAllowed 的重复规则' },
  { scenario: 'whitespace', reason: '无 observed/confirmed 且 generationAllowed 的纯空格规则' },
  { scenario: 'backend-error', reason: '测试环境无受控故障注入合同' },
] as const;
