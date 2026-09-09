# 商品中心商品 P0 技术绑定批次

- 批次状态：runtime-accepted
- 用例分母：36
- 内容审核通过：36
- 技术证据待补：0
- Recipe 漂移修复：0
- 能力包：17
- 可生成 Recipe：36
- 已生成 Recipe：36
- 已接收审计能力包：5
- 实现层 covered/partial/not-covered：1/3/1
- 认证运行验收：36
- 发布策略：锁定 36 条总分母，禁止单用例放行；允许完整波次统一生成和验收。

## 执行波次

- wave-a-combo 套餐创建与套餐规则：用例=8；能力包=5；状态=runtime-accepted
- wave-b-list 商品列表查询与生命周期：用例=12；能力包=4；状态=runtime-accepted
- wave-c-standard-create 标准商品创建配置：用例=8；能力包=5；状态=runtime-accepted
- wave-d-edit-and-rules 编辑、唯一性与分类规则：用例=8；能力包=3；状态=runtime-accepted

## 能力包

### p0-item-binding:item-combo-fixed-group

- 证据锚点：item.combo.fixed-group
- 状态：runtime-accepted
- 审计接入：partial/pending-authenticated-run
- 用例（2）：TC-ITEM-PKG-002、TC-ITEM-PKG-006
- 所需证据：

### p0-item-binding:item-combo-fixed-group-item-combo-optional-select

- 证据锚点：item.combo.fixed-group+item.combo.optional-select
- 状态：runtime-accepted
- 审计接入：partial/pending-authenticated-run
- 用例（2）：TC-ITEM-PKG-040、TC-ITEM-PKG-041
- 所需证据：

### p0-item-binding:item-combo-optional-add

- 证据锚点：item.combo.optional-add
- 状态：runtime-accepted
- 审计接入：covered/pending-authenticated-run
- 用例（1）：TC-ITEM-PKG-007
- 所需证据：

### p0-item-binding:item-combo-optional-select

- 证据锚点：item.combo.optional-select
- 状态：runtime-accepted
- 审计接入：partial/pending-authenticated-run
- 用例（1）：TC-ITEM-PKG-004
- 所需证据：

### p0-item-binding:item-combo-required-fields

- 证据锚点：item.combo.required-fields
- 状态：runtime-accepted
- 审计接入：not-covered/not-observed
- 用例（2）：TC-ITEM-PKG-010、TC-ITEM-PKG-017
- 所需证据：

### p0-item-binding:item-create-type-selection

- 证据锚点：item.create.type-selection
- 状态：runtime-accepted
- 审计接入：pending
- 用例（3）：TC-ITEM-ADD-005、TC-ITEM-PKG-008、TC-ITEM-STD-001
- 所需证据：

### p0-item-binding:item-edit-standard

- 证据锚点：item.edit.standard
- 状态：runtime-accepted
- 审计接入：pending
- 用例（3）：TC-ITEM-STD-031、TC-ITEM-STD-092、TC-ITEM-STD-096
- 所需证据：

### p0-item-binding:item-list-delete

- 证据锚点：item.list.delete
- 状态：runtime-accepted
- 审计接入：pending
- 用例（4）：TC-ITEM-STD-069、TC-ITEM-STD-068、TC-ITEM-STD-070、TC-ITEM-STD-075
- 所需证据：

### p0-item-binding:item-list-lifecycle

- 证据锚点：item.list.lifecycle
- 状态：runtime-accepted
- 审计接入：pending
- 用例（3）：TC-ITEM-STD-066、TC-ITEM-ADD-042、TC-ITEM-ADD-043
- 所需证据：

### p0-item-binding:item-list-reset

- 证据锚点：item.list.reset
- 状态：runtime-accepted
- 审计接入：pending
- 用例（3）：TC-ITEM-PKG-047、TC-ITEM-STD-029、TC-ITEM-ADD-040
- 所需证据：

### p0-item-binding:item-list-search-filter

- 证据锚点：item.list.search-filter
- 状态：runtime-accepted
- 审计接入：pending
- 用例（2）：TC-ITEM-STD-028、TC-ITEM-ADD-023
- 所需证据：

### p0-item-binding:item-standard-attributes

- 证据锚点：item.standard.attributes
- 状态：runtime-accepted
- 审计接入：pending
- 用例（2）：TC-ITEM-STD-057、TC-ITEM-STD-058
- 所需证据：

### p0-item-binding:item-standard-print-stall

- 证据锚点：item.standard.print-stall
- 状态：runtime-accepted
- 审计接入：pending
- 用例（1）：TC-ITEM-STD-082
- 所需证据：

### p0-item-binding:item-standard-required-fields

- 证据锚点：item.standard.required-fields
- 状态：runtime-accepted
- 审计接入：pending
- 用例（1）：TC-ITEM-STD-038
- 所需证据：

### p0-item-binding:item-standard-spec-modes

- 证据锚点：item.standard.spec-modes
- 状态：runtime-accepted
- 审计接入：pending
- 用例（1）：TC-ITEM-STD-047
- 所需证据：

### p0-item-binding:legacy-sidebar-only

- 证据锚点：legacy-sidebar-only
- 状态：runtime-accepted
- 审计接入：pending
- 用例（4）：TC-ITEM-STD-011、TC-ITEM-STD-013、TC-ITEM-STD-014、TC-ITEM-STD-012
- 所需证据：

### p0-item-binding:recipe-drift-repair

- 证据锚点：legacy-sidebar-only
- 状态：runtime-accepted
- 审计接入：pending
- 用例（1）：TC-ITEM-STD-007
- 所需证据：

## 用例明细

| 用例 | 场景族 | 证据 | 能力包 | 状态 | 缺失合同 |
| --- | --- | --- | --- | --- | --- |
| TC-ITEM-ADD-005 加料商品仅填写必填项时创建成功 | 必填校验 | page-observation | p0-item-binding:item-create-type-selection | runtime-accepted |  |
| TC-ITEM-STD-038 标准价缺失时创建失败 | 必填校验 | page-observation | p0-item-binding:item-standard-required-fields | runtime-accepted |  |
| TC-ITEM-PKG-010 套餐商品必填项缺失时创建失败 | 必填校验 | page-observation | p0-item-binding:item-combo-required-fields | runtime-accepted |  |
| TC-ITEM-PKG-017 套餐商品标准价缺失时创建失败 | 必填校验 | page-observation | p0-item-binding:item-combo-required-fields | runtime-accepted |  |
| TC-ITEM-STD-011 同一一级分类下新建同名商品创建失败 | 创建 | legacy-binding | p0-item-binding:legacy-sidebar-only | runtime-accepted |  |
| TC-ITEM-STD-013 同一二级分类下新建同名商品创建失败 | 创建 | legacy-binding | p0-item-binding:legacy-sidebar-only | runtime-accepted |  |
| TC-ITEM-STD-014 同一商户下不同一级分类仍不可创建同名商品 | 创建 | legacy-binding | p0-item-binding:legacy-sidebar-only | runtime-accepted |  |
| TC-ITEM-STD-047 多规格商品选择已有规格组后创建成功 | 价格规格 | page-observation | p0-item-binding:item-standard-spec-modes | runtime-accepted |  |
| TC-ITEM-PKG-002 套餐商品可选择已有固定搭配套餐组 | 套餐规则 | page-observation | p0-item-binding:item-combo-fixed-group | runtime-accepted |  |
| TC-ITEM-PKG-004 套餐商品可选择已有组合搭配套餐组 | 套餐规则 | page-observation | p0-item-binding:item-combo-optional-select | runtime-accepted |  |
| TC-ITEM-PKG-007 套餐商品可新增可选搭配套餐组 | 套餐规则 | page-observation | p0-item-binding:item-combo-optional-add | runtime-accepted |  |
| TC-ITEM-PKG-040 未选择套餐组时确认按钮不可点击 | 套餐规则 | page-observation | p0-item-binding:item-combo-fixed-group-item-combo-optional-select | runtime-accepted |  |
| TC-ITEM-PKG-041 选择套餐组后确认按钮可点击并返回创建页 | 套餐规则 | page-observation | p0-item-binding:item-combo-fixed-group-item-combo-optional-select | runtime-accepted |  |
| TC-ITEM-PKG-047 套餐商品重置查询后页面恢复初始状态 | 状态生命周期 | page-observation | p0-item-binding:item-list-reset | runtime-accepted |  |
| TC-ITEM-STD-069 被套餐组引用的标准商品不可删除 | 删除 | page-observation | p0-item-binding:item-list-delete | runtime-accepted |  |
| TC-ITEM-PKG-008 套餐商品创建页展示基础信息与套餐组配置入口 | 展示与其他 | page-observation | p0-item-binding:item-create-type-selection | runtime-accepted |  |
| TC-ITEM-STD-028 商品列表支持按名称、类型、分类、状态组合查询 | 状态生命周期 | page-observation | p0-item-binding:item-list-search-filter | runtime-accepted |  |
| TC-ITEM-STD-029 重置查询后页面恢复初始状态 | 状态生命周期 | page-observation | p0-item-binding:item-list-reset | runtime-accepted |  |
| TC-ITEM-ADD-023 加料商品列表按名称类型分类状态组合查询成功 | 状态生命周期 | page-observation | p0-item-binding:item-list-search-filter | runtime-accepted |  |
| TC-ITEM-ADD-040 加料商品重置查询后页面恢复初始状态 | 状态生命周期 | page-observation | p0-item-binding:item-list-reset | runtime-accepted |  |
| TC-ITEM-STD-031 标准商品编辑基础信息后保存成功 | 编辑 | page-observation | p0-item-binding:item-edit-standard | runtime-accepted |  |
| TC-ITEM-STD-092 点击商品名称进入编辑标准商品页加载成功 | 编辑 | page-observation | p0-item-binding:item-edit-standard | runtime-accepted |  |
| TC-ITEM-STD-096 编辑标准商品本地上传主图成功 | 编辑 | page-observation | p0-item-binding:item-edit-standard | runtime-accepted |  |
| TC-ITEM-STD-066 列表停用未被菜单引用的商品操作成功 | 状态生命周期 | page-observation | p0-item-binding:item-list-lifecycle | runtime-accepted |  |
| TC-ITEM-ADD-042 加料商品列表启用商品操作成功 | 状态生命周期 | page-observation | p0-item-binding:item-list-lifecycle | runtime-accepted |  |
| TC-ITEM-ADD-043 加料商品列表停用商品操作成功 | 状态生命周期 | page-observation | p0-item-binding:item-list-lifecycle | runtime-accepted |  |
| TC-ITEM-STD-068 无引用关系的标准商品删除成功 | 删除 | page-observation | p0-item-binding:item-list-delete | runtime-accepted |  |
| TC-ITEM-STD-070 被菜单引用的标准商品不可删除 | 删除 | page-observation | p0-item-binding:item-list-delete | runtime-accepted |  |
| TC-ITEM-STD-075 商品列表删除操作展示确认文案 | 删除 | page-observation | p0-item-binding:item-list-delete | runtime-accepted |  |
| TC-ITEM-STD-082 标准商品绑定多个打印档口保存成功 | 创建 | page-observation | p0-item-binding:item-standard-print-stall | runtime-accepted |  |
| TC-ITEM-STD-057 标准商品引用口味组整组后保存成功 | 创建 | page-observation | p0-item-binding:item-standard-attributes | runtime-accepted |  |
| TC-ITEM-STD-058 标准商品引用做法组与加料组整组后保存成功 | 创建 | page-observation | p0-item-binding:item-standard-attributes | runtime-accepted |  |
| TC-ITEM-STD-001 标准商品创建页展示商品类型入口与核心配置模块 | 展示与其他 | page-observation | p0-item-binding:item-create-type-selection | runtime-accepted |  |
| TC-ITEM-STD-007 一级分类存在二级分类时必须选择二级分类才能完成商品分类选择 | 展示与其他 | direct-recipe | p0-item-binding:recipe-drift-repair | runtime-accepted |  |
| TC-ITEM-STD-012 同一一级分类不同二级分类的标准商品同名提示 BITEM-7010 | 展示与其他 | legacy-binding | p0-item-binding:legacy-sidebar-only | runtime-accepted |  |
| TC-ITEM-PKG-006 套餐商品选择并引用已有固定搭配组 | 套餐规则 | page-observation | p0-item-binding:item-combo-fixed-group | runtime-accepted |  |
