export type GroupHandlerCompilerInput = {
  title: string;
  module: string;
  mode: string;
};

type HandlerRule = {
  ruleId: string;
  handlerId: string;
  matches: (input: GroupHandlerCompilerInput) => boolean;
};

const isModule = (input: GroupHandlerCompilerInput, name: string): boolean => input.module.endsWith(name);
const isAnyModule = (input: GroupHandlerCompilerInput, names: readonly string[]): boolean => names.some((name) => isModule(input, name));

const handlerRules: readonly HandlerRule[] = [
  rule('attribute-set-list', 'attribute-set-list-structure', (input) => isModule(input, '属性集管理') && input.title.includes('列表页结构展示正确')),
  rule('attribute-set-row-menu', 'attribute-set-row-menu', (input) => isModule(input, '属性集管理') && input.title.includes('行更多菜单')),
  rule('combo-v2-list', 'combo-v2-list-contract', (input) => isModule(input, '套餐组')
    && input.mode === 'read-only'
    && input.title.includes('统一列表展示三种类型合同')),
  rule('group-list', 'group-list-structure', (input) => input.mode === 'read-only'
    && !isAnyModule(input, ['属性集管理', '套餐组'])),
  rule('multilang-query', 'group-multilang-query', (input) => input.mode === 'query-reset' && input.title.includes('第二语言')),
  rule('combo-v2-query', 'combo-v2-query-contract', (input) => isModule(input, '套餐组')
    && input.title === '套餐组按名称和类型筛选及清空条件正确'),
  rule('query-reset', 'group-query-reset', (input) => input.mode === 'query-reset'
    && !input.title.includes('第二语言')
    && !isModule(input, '套餐组')),
  rule('group-create-cancel', 'group-create-cancel', (input) => input.mode === 'cancel' && /^新增(?:规格|口味|做法|加料)组页/.test(input.title)),
  rule('existing-detail-cancel', 'existing-detail-cancel', (input) => input.mode === 'cancel'
    && isAnyModule(input, ['规格组', '口味组', '做法组'])
    && /^编辑.+组添加明细后点击取消不保存$/.test(input.title)),
  rule('existing-detail-required', 'existing-detail-required-validation', (input) => input.mode === 'form-validation' && /^已有.+组新增明细缺必填项/.test(input.title)),
  rule('method-name-uniqueness', 'method-group-and-detail-duplicate-validation', (input) => isModule(input, '做法组') && input.title.includes('组及明细名称唯一性')),
  rule('detail-name-duplicate', 'existing-detail-duplicate-validation', (input) => input.mode === 'form-validation' && input.title.includes('明细组内重名')),
  rule('spec-cross-group-option-duplicate', 'spec-cross-group-option-duplicate-validation', (input) => isModule(input, '规格组') && input.title.includes('规格子项名称品牌内重复')),
  rule('product-backed-group-duplicate', 'product-backed-group-duplicate-validation', (input) => input.mode === 'form-validation'
    && isAnyModule(input, ['加料组', '套餐组'])
    && /组名称.+(?:重复|不可重复)/.test(input.title)),
  rule('group-name-duplicate', 'group-name-duplicate-validation', (input) => input.mode === 'form-validation'
    && isAnyModule(input, ['规格组', '口味组', '做法组'])
    && /组名称.+重复/.test(input.title)),
  rule('addon-single-surcharge-format', 'addon-single-surcharge-format', (input) => isModule(input, '加料组')
    && input.mode === 'form-validation'
    && input.title.includes('单次加价')
    && input.title.includes('超过两位小数')),
  rule('addon-empty-items', 'group-empty-options-validation', (input) => isModule(input, '加料组')
    && input.mode === 'form-validation'
    && input.title.includes('无加料明细')),
  rule('named-empty-option', 'group-empty-options-validation', (input) => input.mode === 'form-validation'
    && isAnyModule(input, ['规格组', '口味组', '做法组'])
    && (/组内.+名称为空/.test(input.title) || /无.+明细/.test(input.title))),
  rule('addon-validation', 'addon-group-validation', (input) => isModule(input, '加料组')
    && input.mode === 'form-validation'
    && (input.title.includes('必填项缺失') || input.title.includes('最少大于最多'))),
  rule('required-validation', 'group-required-validation', (input) => input.mode === 'form-validation'
    && isAnyModule(input, ['规格组', '口味组', '做法组', '套餐组'])
    && (input.title.includes('必填项缺失') || input.title.includes('名称缺失') || input.title.includes('名称为空'))
    && !/组内.+名称为空/.test(input.title)),
  rule('combo-empty-items', 'combo-empty-items-validation', (input) => isModule(input, '套餐组') && input.title.includes('无商品保存失败')),
  rule('empty-group-delete', 'empty-group-delete', (input) => input.mode === 'mutation-probe' && /^无.+组可删除成功$/.test(input.title)),
  rule('single-detail-delete-boundary', 'single-detail-delete-boundary', (input) => input.mode === 'mutation-probe'
    && !isModule(input, '加料组')
    && input.title.includes('仅剩一个子项时删除该子项失败')),
  rule('addon-product-row-delete', 'addon-product-row-delete', (input) => isModule(input, '加料组')
    && (input.title.includes('未被引用加料组内商品经确认变更后删除成功')
      || input.title.includes('仅剩一个组内商品时删除失败'))),
  rule('unreferenced-option-delete', 'unreferenced-option-detail-delete', (input) => input.mode === 'mutation-probe'
    && isAnyModule(input, ['规格组', '口味组', '做法组'])
    && /未被引用.*(?:明细|选项).*删除成功/.test(input.title)),
  rule('referenced-option-delete-blocked', 'referenced-option-detail-delete-blocked', (input) => input.mode === 'dependency-probe'
    && isAnyModule(input, ['规格组', '口味组', '做法组'])
    && /(?:删除.*明细.*失败|明细.*删除.*失败)/.test(input.title)),
  rule('referenced-option-delete-confirmed', 'referenced-option-detail-delete-confirmed', (input) => input.mode === 'mutation-probe'
    && isAnyModule(input, ['口味组', '做法组'])
    && /被引用.+明细经二次确认后删除成功/.test(input.title)),
  rule('unreferenced-spec-detail-add', 'unreferenced-spec-detail-add', (input) => isModule(input, '规格组') && input.title.includes('未被引用的组新增子项保存成功')),
  rule('spec-full-field-create', 'spec-full-field-create', (input) => isModule(input, '规格组') && input.title.includes('新增规格组填写全部字段保存成功')),
  rule('spec-twenty-character-boundary', 'spec-option-twenty-character-boundary', (input) => isModule(input, '规格组') && input.title.includes('20字符')),
  rule('option-group-boundary', 'option-group-boundary-create', (input) => input.mode === 'mutation-probe'
    && isAnyModule(input, ['规格组', '口味组', '做法组'])
    && input.title.includes('超长')),
  rule('option-group-required-only', 'option-group-create-required-only', (input) => input.mode === 'mutation-probe'
    && isAnyModule(input, ['规格组', '口味组'])
    && input.title.includes('仅填必填项保存成功')),
  rule('method-required-only', 'method-create-required-only', (input) => isModule(input, '做法组') && input.title.includes('仅填必填项保存成功')),
  rule('addon-product-selection', 'addon-product-selection', (input) => isModule(input, '加料组') && input.mode === 'selection-probe'),
  rule('combo-product-selection', 'combo-product-selection', (input) => isModule(input, '套餐组') && input.mode === 'selection-probe'),
  rule('combo-product-selection-cancel', 'combo-product-selection-cancel', (input) => isModule(input, '套餐组')
    && input.mode === 'cancel'
    && input.title.includes('选择商品后点击取消不保存')),
  rule('addon-group-create', 'addon-group-create', (input) => isModule(input, '加料组') && input.mode === 'mutation-probe'
    && !input.title.includes('删除')),
  rule('combo-cross-type-name', 'combo-cross-type-name-create', (input) => isModule(input, '套餐组') && /组名允许.*重复/.test(input.title)),
  rule('combo-multi-sku', 'combo-multi-sku-create', (input) => isModule(input, '套餐组') && input.title.includes('多规格商品')),
  rule('combo-group-create', 'combo-group-create', (input) => isModule(input, '套餐组')
    && input.mode === 'mutation-probe'
    && /^(?:新增固定搭配仅填必填项保存成功|新增可选搭配仅填必填项保存成功|新增固定搭配填写全部字段保存成功)$/.test(input.title)),
  rule('combo-v2-form-contract', 'combo-v2-form-contract', (input) => isModule(input, '套餐组')
    && /^(?:三种套餐组选择数量字段分布正确|新增套餐组页展示固定搭配可选搭配随心配及说明|新增套餐组类型切换后字段随类型更新|固定搭配商品行仅配置数量且由套餐统一定价|可选搭配展示选择数量加价默认与两个组级开关|随心配展示总数量规则与价格来源字段|可选搭配开启组内重复选择后显示子项最小最大数量|可选搭配相同商品合并开关可独立配置|随心配组内重复选择开关控制子项最大数量列)$/.test(input.title)),
  rule('combo-v2-pkg030-validation', 'combo-v2-pkg030-validation', (input) => isModule(input, '套餐组')
    && input.title === '随心配最少选择数量大于最多选择数量时保存失败'),
  rule('combo-v2-create-contract', 'combo-v2-create-contract', (input) => isModule(input, '套餐组')
    && /^(?:随心配默认数量合计超过最多选择数量仍可保存|随心配选择数量输入归一化且最少最多相同时保存成功|可选搭配默认选中数超过选择数量时保存失败|三种套餐组名称按100字符含空格长度规则处理|随心配最少和最多选择数量输入0时自动补为1|随心配子项默认数量超过最多选择时仍可保存|随心配最多选择数量小于最少选择数量时保存失败|新增随心配填写必填字段和商品保存成功)$/.test(input.title)),
  rule('combo-v2-price-source-contract', 'combo-v2-price-source-contract', (input) => isModule(input, '套餐组')
    && input.title === '随心配支持默认和自定义两种价格来源'),
  rule('combo-v2-reference-contract', 'combo-v2-reference-contract', (input) => isModule(input, '套餐组')
    && /^(?:被引用可选搭配新增商品后同步引用套餐商品|移除可选搭配商品后仍满足选择数量时引用商品同步更新|移除可选搭配商品后不足选择数量仍可保存并同步|下调可选搭配选择数量后移除商品可保存并同步|编辑套餐组基础信息后引用商品同步|编辑可选搭配子项非价格规则后引用商品同步|移除可选搭配默认商品后仍满足选择数量可保存)$/.test(input.title)),
  rule('addon-referenced-group-sync', 'addon-nonprice-field-sync', (input) => isModule(input, '加料组')
    && input.title === '编辑加料组后引用商品同步更新'),
  rule('referenced-group-sync', 'referenced-attribute-group-sync', (input) => input.mode === 'crud-sop'
    && !isModule(input, '加料组')
    && input.title.includes('引用商品同步更新')),
  rule('detached-reference-delete', 'detached-reference-group-delete', (input) => input.mode === 'dependency-probe'
    && isAnyModule(input, ['规格组', '口味组', '做法组', '加料组'])
    && input.title.startsWith('解除引用后')),
  rule('added-option-not-propagated', 'added-option-not-propagated', (input) => input.mode === 'terminal-probe'
    && isAnyModule(input, ['规格组', '口味组', '做法组'])
    && input.title.includes('新增')
    && input.title.includes('不自动同步')),
  rule('renamed-option-propagated', 'renamed-option-propagated', (input) => input.mode === 'terminal-probe'
    && isAnyModule(input, ['规格组', '口味组', '做法组'])
    && input.title.startsWith('编辑被引用')
    && !input.title.includes('默认选中')),
  rule('default-price-not-propagated', 'group-default-price-not-propagated', (input) => input.mode === 'terminal-probe'
    && /默认(?:项|选中).*(?:加价|价格)|(?:加价|价格).*默认(?:项|选中)/.test(input.title)),
  rule('addon-added-option-not-propagated', 'addon-added-option-not-propagated', (input) => isModule(input, '加料组')
    && input.title.includes('新增明细不自动同步')),
  rule('addon-referenced-option-delete-sync', 'addon-referenced-option-delete-sync', (input) => isModule(input, '加料组')
    && input.mode === 'dependency-probe'
    && input.title.includes('明细删除时弹出确认变更')),
  rule('addon-nonprice-sync', 'addon-nonprice-field-sync', (input) => isModule(input, '加料组')
    && input.mode === 'terminal-probe'
    && input.title.includes('商品侧同步（价格除外）')),
  rule('referenced-group-delete-blocked', 'referenced-group-delete-blocked', (input) => isAnyModule(input, ['规格组', '加料组'])
    && input.mode === 'dependency-probe'
    && /被商品引用.*组删除失败|规格组删除失败/.test(input.title)),
  rule('referenced-taste-group-delete-confirmed', 'referenced-group-delete-confirmed', (input) => isModule(input, '口味组')
    && input.mode === 'mutation-probe'
    && input.title.includes('被引用口味组确认后删除成功')),
  rule('unreferenced-method-group-delete-confirmed', 'unreferenced-group-delete-confirmed', (input) => isModule(input, '做法组')
    && input.mode === 'mutation-probe'
    && input.title.includes('未被商品引用的做法组经二次确认后删除成功')),
  rule('combo-nonempty-delete', 'combo-nonempty-delete', (input) => isModule(input, '套餐组')
    && input.mode === 'mutation-probe'
    && input.title.includes('有商品时可直接删除组')),
];

export function compileProductCenterGroupHandler(input: GroupHandlerCompilerInput): string | null {
  const matches = handlerRules.filter((item) => item.matches(input));
  if (matches.length > 1) {
    throw new Error(`组 handler 语义规则冲突：${input.module} / ${input.title} -> ${matches.map((item) => item.ruleId).join(', ')}`);
  }
  return matches[0]?.handlerId ?? null;
}

export function matchingProductCenterGroupHandlerRules(input: GroupHandlerCompilerInput): string[] {
  return handlerRules.filter((item) => item.matches(input)).map((item) => item.ruleId);
}

function rule(ruleId: string, handlerId: string, matches: HandlerRule['matches']): HandlerRule {
  return { ruleId, handlerId, matches };
}
