# 商品中心商品页面能力差距与补充候选

- 页面审计：ui-observed:product-center-item:2026-07-30（2026-07-30，只读）
- 正式用例：216 条，其中结构有效 123 条
- 页面能力：26 项；已覆盖 18 项；需补充 8 项；冲突 0 项
- XMind 不完整叶子：39 个；模板占位 1 个；正式方案已覆盖 38 个；仅结构可修 0 个；仍缺业务来源 0 个
- 所有补充候选均为 review-required，未进入 Recipe。

## 页面能力覆盖

- item.list.search-filter：商品名称、类型、分类、状态查询；covered；正式用例=TC-ITEM-STD-028, TC-ITEM-PKG-034, TC-ITEM-ADD-023
- item.list.reset：重置查询条件；covered；正式用例=TC-ITEM-STD-029, TC-ITEM-PKG-047, TC-ITEM-ADD-040
- item.list.import-records：导入记录入口；supplement-required；正式用例=无
- item.list.import-actions：图片导入与商品导入入口；supplement-required；正式用例=无
- item.list.column-config：列表列配置；covered；正式用例=TC-ITEM-STD-003, TC-ITEM-STD-072, TC-ITEM-STD-073
- item.list.pagination：分页与每页条数；covered；正式用例=TC-ITEM-STD-063
- item.list.lifecycle：行级启用与停用；covered；正式用例=TC-ITEM-STD-065, TC-ITEM-STD-066, TC-ITEM-PKG-061, TC-ITEM-PKG-062, TC-ITEM-ADD-042, TC-ITEM-ADD-043
- item.list.copy：行级复制；supplement-required；正式用例=无
- item.list.delete：行级删除；covered；正式用例=TC-ITEM-STD-068, TC-ITEM-STD-069, TC-ITEM-STD-070, TC-ITEM-STD-075
- item.list.batch-fields：批量编辑基础字段；supplement-required；正式用例=无
- item.list.batch-commerce：批量修改销售信息、价格与属性；supplement-required；正式用例=无
- item.list.batch-menu-delete：批量添加至菜单与删除；supplement-required；正式用例=无
- item.create.type-selection：标准、套餐、加料三类商品入口；covered；正式用例=TC-ITEM-STD-001, TC-ITEM-PKG-008, TC-ITEM-ADD-005
- item.standard.save-and-new：标准商品保存并新建入口；supplement-required；正式用例=无
- item.standard.required-fields：标准商品必填字段；covered；正式用例=TC-ITEM-STD-005, TC-ITEM-STD-038
- item.standard.advanced-fields：标准商品高级字段与长度；covered；正式用例=TC-ITEM-STD-042, TC-ITEM-STD-045, TC-ITEM-STD-046
- item.standard.spec-modes：称重、单规格与多规格；covered；正式用例=TC-ITEM-STD-047, TC-ITEM-STD-049, TC-ITEM-STD-050
- item.standard.print-stall：打印档口搜索与多选；covered；正式用例=TC-ITEM-STD-082
- item.standard.attributes：商品属性与互斥规则；covered；正式用例=TC-ITEM-STD-057, TC-ITEM-STD-058, TC-ITEM-STD-061
- item.standard.more-settings：详情图片、标签、角标、统计标签与材料信息；covered；正式用例=TC-ITEM-STD-054, TC-ITEM-STD-055, TC-ITEM-STD-056
- item.combo.save-and-new：套餐商品保存并新建入口；supplement-required；正式用例=无
- item.combo.required-fields：套餐商品必填字段；covered；正式用例=TC-ITEM-PKG-010, TC-ITEM-PKG-017, TC-ITEM-PKG-046
- item.combo.fixed-group：固定搭配新增、选择、搜索与确认；covered；正式用例=TC-ITEM-PKG-002, TC-ITEM-PKG-003, TC-ITEM-PKG-006, TC-ITEM-PKG-040, TC-ITEM-PKG-041, TC-ITEM-PKG-042
- item.combo.optional-select：可选搭配选择、搜索、移除与确认；covered；正式用例=TC-ITEM-PKG-004, TC-ITEM-PKG-040, TC-ITEM-PKG-041, TC-ITEM-PKG-043, TC-ITEM-PKG-044, TC-ITEM-PKG-045, TC-ITEM-PKG-056
- item.combo.optional-add：新增可选搭配字段、规则与组卡片边界；covered；正式用例=TC-ITEM-PKG-007, TC-ITEM-PKG-057, TC-ITEM-PKG-058, TC-ITEM-PKG-059
- item.edit.standard：标准商品编辑页；covered；正式用例=TC-ITEM-STD-031, TC-ITEM-STD-033, TC-ITEM-STD-092, TC-ITEM-STD-096

## 规则冲突

## 补充候选

### 用例编号：TC-ITEM-UI-001

用例标题：商品列表提供导入记录入口
所属模块：商品管理 → 商品 → 页面补充候选
建议优先级：P2
状态：review-required
来源：ui-observed ← 只读页面审计 2026-07-30 ← /pp/brand/list

前置条件：
1. 已登录且有商品管理权限。
2. 通过侧边栏进入商品列表。

测试步骤：
1. 查看列表顶部工具栏。

预期结果：
1. 导入记录按钮可见且处于可点击状态。

待确认项：导入记录目标页面和记录字段尚未在本轮只读审计中验证。

### 用例编号：TC-ITEM-UI-002

用例标题：商品列表操作菜单提供图片导入与商品导入入口
所属模块：商品管理 → 商品 → 页面补充候选
建议优先级：P2
状态：review-required
来源：ui-observed ← 只读页面审计 2026-07-30 ← /pp/brand/list

前置条件：
1. 已登录且有商品管理权限。
2. 通过侧边栏进入商品列表。

测试步骤：
1. 点击列表顶部「操作」。

预期结果：
1. 操作菜单同时展示「图片导入」「商品导入」。

待确认项：导入模板、校验规则、失败处理和导入结果需正式来源确认。

### 用例编号：TC-ITEM-UI-003

用例标题：复制商品时打印档口信息随商品复制
所属模块：商品管理 → 商品 → 列表操作 → 复制
建议优先级：P1
状态：review-required
来源：ui-observed ← 只读页面审计 2026-07-30 ← /pp/brand/list 行操作菜单展示“复制”；business-rule-explicit ← 商品中心业务规则 §22：商品复制时，档口信息随商品复制

前置条件：
1. 已登录且有商品管理权限。
2. 存在已绑定打印档口的 AUTO_AUDIT 标准商品。

测试步骤：
1. 通过侧边栏进入商品列表。
2. 打开 AUTO_AUDIT 商品行操作菜单并点击「复制」。
3. 为复制商品设置唯一名称并保存。
4. 在列表搜索复制后的商品并打开编辑页。

预期结果：
1. 复制流程可进入新增商品编辑状态。
2. 复制商品保存成功。
3. 复制商品的打印档口与原商品一致。

待确认项：复制流程的其他继承字段范围未有正式规则，本候选只验证打印档口。；自动化前需定义按服务端 ID 清理复制商品。

### 用例编号：TC-ITEM-UI-004

用例标题：勾选商品后批量操作菜单提供基础字段编辑入口
所属模块：商品管理 → 商品 → 页面补充候选
建议优先级：P1
状态：review-required
来源：ui-observed ← 只读页面审计 2026-07-30 ← /pp/brand/list

前置条件：
1. 已登录且有商品管理权限。
2. 通过侧边栏进入商品列表。

测试步骤：
1. 勾选一条 AUTO_AUDIT 商品。
2. 打开「批量操作(1)」。

预期结果：
1. 菜单展示图片、商品名称、第二语言、商品分类、POS名称、送厨名称、助记码、商品编码、单位、设备编码、商品描述编辑入口。

待确认项：各字段批量更新范围、覆盖策略和校验规则缺少正式业务来源。

### 用例编号：TC-ITEM-UI-005

用例标题：勾选商品后批量操作菜单提供销售信息价格与属性入口
所属模块：商品管理 → 商品 → 页面补充候选
建议优先级：P1
状态：review-required
来源：ui-observed ← 只读页面审计 2026-07-30 ← /pp/brand/list

前置条件：
1. 已登录且有商品管理权限。
2. 通过侧边栏进入商品列表。

测试步骤：
1. 勾选一条 AUTO_AUDIT 商品。
2. 打开「批量操作(1)」。

预期结果：
1. 菜单展示「修改销售信息」「修改价格」「修改属性」。

待确认项：品牌商品批量改价和批量属性规则不能沿用门店商品规则，需产品确认。

### 用例编号：TC-ITEM-UI-006

用例标题：勾选商品后批量操作菜单提供添加至菜单与删除入口
所属模块：商品管理 → 商品 → 页面补充候选
建议优先级：P1
状态：review-required
来源：ui-observed ← 只读页面审计 2026-07-30 ← /pp/brand/list

前置条件：
1. 已登录且有商品管理权限。
2. 通过侧边栏进入商品列表。

测试步骤：
1. 勾选一条 AUTO_AUDIT 商品。
2. 打开「批量操作(1)」。

预期结果：
1. 菜单展示「添加至菜单」「删除」。

待确认项：批量添加菜单范围、删除前置限制、确认弹窗和部分失败策略缺少正式业务来源。

### 用例编号：TC-ITEM-UI-007

用例标题：标准商品创建页提供保存并新建入口
所属模块：商品管理 → 商品 → 页面补充候选
建议优先级：P1
状态：review-required
来源：ui-observed ← 只读页面审计 2026-07-30 ← /pp/brand/create/standard

前置条件：
1. 已登录且有商品管理权限。
2. 通过侧边栏进入商品列表。

测试步骤：
1. 进入标准商品创建页。
2. 查看页面顶部保存操作区。

预期结果：
1. 「保存并新建」按钮可见且处于可点击状态。

待确认项：保存成功后的留页、清空字段、默认值和失败处理未验证。

### 用例编号：TC-ITEM-UI-008

用例标题：套餐商品创建页提供保存并新建入口
所属模块：商品管理 → 商品 → 页面补充候选
建议优先级：P1
状态：review-required
来源：ui-observed ← 只读页面审计 2026-07-30 ← /pp/brand/create/combo

前置条件：
1. 已登录且有商品管理权限。
2. 通过侧边栏进入商品列表。

测试步骤：
1. 进入套餐商品创建页。
2. 查看页面顶部保存操作区。

预期结果：
1. 「保存并新建」按钮可见且处于可点击状态。

待确认项：保存成功后的留页、清空字段、默认值和失败处理未验证。

## XMind 不完整叶子去重结果

- 7na7d1hgoe25l0goi2j6ftp3ms：[无标题节点]；source-template；匹配=无
- 19b3gomebq96vfr5ltm9c49qd7：4. 商品类型选择页面有三个选项，标准商品，套餐，配菜/加料 5. 商品编辑页面分为7大模块： - 导航栏 - 基础信息 行业名称的输入库置灰，不可手动输入 - 商品属性 - 展示设置 - 材料信息（这期没有） - 统计标签 - 商品描述 6. 快速定位到标签属性；already-covered；匹配=TC-ITEM-STD-001
- 4h62hherct59574922865ac6rb：4. 商品列表页面区域分为2块 左侧区域为：后台分类 右侧区域为：商品列表 4.2 分类树形结构展示，支持到三级树形结构，每一级的分类下有功能按钮：新增 修改删除 4.3 分类和商品都有查询框，默认查询条件为空，商品查询支持 商品名 商品分类 标签 商品状态等条件查询 4.4. 商品列表页展示所有的商品，一页展示20条数据，可更改为一页展示50或者100条 4.5 商品列表默认展示全部的商品，按照商品的创建顺序，后创建的展示在最上面 4.6 - 列表字段 - 选择：可多选商品 - 图片：商品主体第一张 - 商品名称（中英文） - 商品类型：单品、套餐、配菜/加料 - 后台分类 - 标准价 - 状态：可售、禁售 - 更新时间 - 操作：编辑、删除、停售/启售；already-covered；匹配=TC-ITEM-ADD-002, TC-ITEM-ADD-035, TC-ITEM-ADD-037, TC-ITEM-ADD-038, TC-ITEM-ADD-046
- 479aj7fe093g113aq50if5qn1g：4. 列表页默认展示商品的全部字段，选择”、“图片”、“商品名称”、“商品类型”、“操作”列固定展示，且锁定位置，左右滑动可看到所有的列 6. 只展示固定展示的列和分类 规格 标准价 5. 只展示固定展示的列和分类 标准价；already-covered；匹配=TC-ITEM-STD-003
- 440eac4d-0c26-4922-92e7-0ed90a959110：中英文切换后，各文本展示正确；already-covered；匹配=TC-ITEM-STD-004
- 6it6hc3v384sc0hlme4n805n6n：6. 提交失败，组名称这边高亮提示必填项缺失；already-covered；匹配=TC-ITEM-STD-005
- 498k863f58s7d5u5game0kl1l1：一级分类下有商品，不可创建二级分类；already-covered；匹配=TC-ITEM-STD-037
- 083vafg5nagslgj3perchpakvi：6.1 新增成功，输入字符自动格式化前100个有效字符，首尾空格去掉 中间连续多个空格格式化到1个空格，只保留中文数字 英文特殊字符自动去掉 7. 数据库中存储的字符信息与格式化之后的信息一致 =====；already-covered；匹配=TC-ITEM-STD-009
- 51kohmbuel2m89cq1o5ghpbgcn：6.1 新增成功，输入字符自动格式化前100个有效字符，首尾空格去掉 中间连续多个空格格式化到1个空格，只保留中文数字 英文特殊字符自动去掉 7. 数据库中存储的字符信息与格式化之后的信息一致 =====；already-covered；匹配=TC-ITEM-ADD-022, TC-ITEM-PKG-026
- 4chu03vu62t9h4fo6nojiqkvrp：6. 提交失败，提示商品编码重复；already-covered；匹配=TC-ITEM-STD-010
- 28v7p7lp0v1u86af6h0nvjsc97：6. 提交成功,类A/A1下新增一条商品记录，展示在该二级分类商品的最上面，标准价格为0，图片展示商品的主图的信息 8. 数据库中的字段信息与输入的一致；already-covered；匹配=TC-ITEM-STD-015
- 42sps6b10h8g9g8ikdukb3o5tq：6. 规格组只能单选 7. 列表页展示的规格名称正确，标准价展示该商品默认规格的价格 8. 数据库中的字段信息与输入的一致；already-covered；匹配=TC-ITEM-STD-016
- 1sipmo7825esbn565bboddll08：6. 规格组只能单选 7. 列表页展示的规格名称正确，标准价展示该商品规格中的最低价格 8. 数据库中的字段信息与输入的一致；already-covered；匹配=TC-ITEM-STD-017
- 1p6t3m66d4jdj7m22pbdafsucd：7. 新增商品成功，信息与输入一致 8. 数据库中的字段信息与输入的一致 ==== 9.；already-covered；匹配=TC-ITEM-STD-015, TC-ITEM-STD-016, TC-ITEM-STD-017, TC-ITEM-STD-018
- 1fc83c6b-2165-4f6d-8be5-9eb53aee9495：销售单位默认为lb；already-covered；匹配=TC-ITEM-STD-015, TC-ITEM-STD-016, TC-ITEM-STD-017, TC-ITEM-STD-018
- 1c57lr35i0l42fsinn29vpgqs9：6. 提交成功,类A/A1下新增一条商品记录，展示在该二级分类商品的最上面，标准价格为1.99，图片展示商品的主图的信息 8. 数据库中的字段信息与输入的一致；already-covered；匹配=TC-ITEM-STD-021
- 58i9s3djnu77jq7g47sqft1s4j：6. 提交失败，提示价格输入格式不正确；already-covered；匹配=TC-ITEM-STD-021, TC-ITEM-STD-025
- 3qarp9la09jlrdu9l44je520qg：6. 非数字提交失败，0保存之后恢复默认值1；already-covered；匹配=TC-ITEM-PKG-019, TC-ITEM-STD-042
- 5o8vmoq5gv665l3orl4g7msimu：6. 提交成功 ==== 7. 默认的点单页面的数量为2，且不可减少为1；already-covered；匹配=TC-ITEM-STD-025
- 5o94ihj2pb7cgcn317dt0nq36h：从行业商品库选择商品可继承行业商品库的信息，后进行编辑，继承过来的口味/口味等信息同步更新；already-covered；匹配=TC-ITEM-STD-035
- 29iqa2q9v8vkrikfobg8oa4ejr：基础信息编辑；already-covered；匹配=TC-ITEM-STD-032
- 3ltg95bv8ntgussasn5ve7tf5s：商品属性编辑；already-covered；匹配=TC-ITEM-ADD-042, TC-ITEM-ADD-043
- 23muoh9319l4s0a0hs9st7iegu：其他信息编辑；already-covered；匹配=TC-ITEM-STD-034
- 4tdoiiklj6a19pc6i1iilc3deu：关联的套餐组同步更新： 套餐组下的所有商品均删除，该套餐项在商品中不展示；already-covered；匹配=TC-ITEM-STD-016, TC-ITEM-STD-017
- 6q6l2f3s5o5072luo5kqee3jfn：查询；already-covered；匹配=TC-ITEM-STD-016, TC-ITEM-STD-017
- cef9714d-5718-482b-b4cb-455ea22a79a3：基本信息与标准商品一致：包含：商品名称、商品第二名称、商品分类、商品描述、POS名称、送厨名称、助记码、商品编码、单位、起售数量：默认填充为1，商品价格与标准商品也一致：标准价和包装费；already-covered；匹配=TC-ITEM-STD-016, TC-ITEM-STD-017, TC-ITEM-ADD-010, TC-ITEM-ADD-011, TC-ITEM-ADD-025
- d4915574-fbe3-4bd8-a711-86ff0a8f8e65：默认加载为套餐组已创建的所有固定搭配类型；already-covered；匹配=TC-ITEM-PKG-007, TC-ITEM-PKG-008, TC-ITEM-PKG-048, TC-ITEM-PKG-049, TC-ITEM-PKG-050
- 07161af6-2669-4fad-a199-46042a6d0611：加载的套餐列表中的套餐组，加入右侧已选套餐，右侧已选套餐可移除选择的套餐组；already-covered；匹配=TC-ITEM-PKG-007, TC-ITEM-PKG-008, TC-ITEM-PKG-048, TC-ITEM-PKG-049, TC-ITEM-PKG-050
- 5f709e7b-1ac2-4f53-8f84-9564f1850846：支持模糊搜索，按名称精确搜索，删除输入的搜索条件按照默认搜索；already-covered；匹配=TC-ITEM-PKG-007, TC-ITEM-PKG-009, TC-ITEM-PKG-050, TC-ITEM-PKG-064
- c6637439-53d1-4017-aa77-9ae801657a09：未选择套餐组，确认按钮默认不可点击，选择套餐组后确认按钮高亮可点击，点击后退出当前选择页面返回创建套餐页面；already-covered；匹配=TC-ITEM-PKG-007, TC-ITEM-PKG-008, TC-ITEM-PKG-048, TC-ITEM-PKG-049, TC-ITEM-PKG-050
- 51485e31-4f5d-4bf7-81ef-8d40facb6d73：默认加载为套餐组已创建的所有组合搭配(可选搭配)类型；already-covered；匹配=TC-ITEM-PKG-007, TC-ITEM-PKG-008, TC-ITEM-PKG-048, TC-ITEM-PKG-049, TC-ITEM-PKG-050
- 4fd929e8-afed-4206-b634-5974aa46fb92：加载的套餐列表中的套餐组，加入右侧已选套餐，右侧已选套餐可移除选择的套餐组；already-covered；匹配=TC-ITEM-PKG-007, TC-ITEM-PKG-008, TC-ITEM-PKG-048, TC-ITEM-PKG-049, TC-ITEM-PKG-050
- e3431ee9-ba9f-467b-9e96-3747018cda91：支持模糊搜索，按名称精确搜索，删除输入的搜索条件按照默认搜索；already-covered；匹配=TC-ITEM-PKG-007, TC-ITEM-PKG-008, TC-ITEM-PKG-048, TC-ITEM-PKG-049, TC-ITEM-PKG-050
- b8523b81-5b0e-4718-b3cc-a6c7ffeebe51：未选择套餐组，确认按钮默认不可点击，选择套餐组后确认按钮高亮可点击，点击后退出当前选择页面返回创建套餐页面；already-covered；匹配=TC-ITEM-PKG-007, TC-ITEM-PKG-008, TC-ITEM-PKG-048, TC-ITEM-PKG-049, TC-ITEM-PKG-050
- b39cd334-fdac-44bb-b902-02174f217ca6：借鉴套餐组新增；already-covered；匹配=TC-ITEM-PKG-007, TC-ITEM-PKG-054
- 8ba41fbd-c73a-41bf-8443-d40e65c475e2：借鉴套餐组新增；already-covered；匹配=TC-ITEM-PKG-007
- ffb61056-78cf-4b0b-8228-5a04bbc05709：其他设置也与标准商品一致：可添加详情图片，描述标签，商品角标，统计标签，材料信息；already-covered；匹配=TC-ITEM-STD-016, TC-ITEM-STD-017, TC-ITEM-ADD-010, TC-ITEM-ADD-011, TC-ITEM-ADD-026
- 0649c441-e2e1-4dea-bad4-1815740fa9ef：基本信息与标准商品一致：包含：商品名称、商品第二名称、商品分类、商品描述、POS名称、送厨名称、助记码、商品编码、单位，商品价格与标准商品也一致：标准价和包装费和成本 注意：无起售数量；already-covered；匹配=TC-ITEM-STD-016, TC-ITEM-STD-017, TC-ITEM-ADD-010, TC-ITEM-ADD-011, TC-ITEM-ADD-025
- af2e2d99-5991-4b5f-8510-ddad5ffe79c8：其他设置也与标准商品一致：可添加详情图片，描述标签，商品角标，统计标签，材料信息；already-covered；匹配=TC-ITEM-STD-016, TC-ITEM-STD-017, TC-ITEM-ADD-010, TC-ITEM-ADD-011, TC-ITEM-ADD-026
