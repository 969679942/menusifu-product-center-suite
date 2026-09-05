# 商品中心自动化快车道分类

- 未进入准确发布：136 条
- 自动技术流水线：120 条 / 56 组
- 绿色：59 条 / 20 组
- 黄色：61 条 / 36 组
- 人工规则审核：9 条 / 6 组
- 产品缺陷队列：6 条
- 环境阻断：1 条
- 静态语义重新审核：0 条
- 黄色策略：每组复用页面与数据链，但每条用例独立断言和留证，禁止用代表证据替代组内用例。

## 自动技术模板

- AT01 [green] 标准商品/编辑/create/L2：1 条；共享链锚点=TC-ITEM-STD-033；逐用例证据=true；人工审核=false
- AT02 [yellow] 标准商品/编辑/negative/L1：1 条；共享链锚点=TC-ITEM-STD-061；逐用例证据=true；人工审核=false
- AT03 [green] 标准商品/编辑/update/L2：1 条；共享链锚点=TC-ITEM-STD-056；逐用例证据=true；人工审核=false
- AT04 [green] 标准商品/查询筛选/search/L0：2 条；共享链锚点=TC-ITEM-STD-030；逐用例证据=true；人工审核=false
- AT05 [green] 标准商品/创建/create/L2：3 条；共享链锚点=TC-ITEM-STD-006；逐用例证据=true；人工审核=false
- AT06 [green] 标准商品/创建/negative/L1：5 条；共享链锚点=TC-ITEM-STD-035；逐用例证据=true；人工审核=false
- AT07 [yellow] 标准商品/创建/read/L0：1 条；共享链锚点=TC-ITEM-STD-041；逐用例证据=true；人工审核=false
- AT08 [green] 标准商品/创建/update/L2：4 条；共享链锚点=TC-ITEM-STD-009；逐用例证据=true；人工审核=false
- AT09 [green] 标准商品/价格规格/create/L2：5 条；共享链锚点=TC-ITEM-STD-020；逐用例证据=true；人工审核=false
- AT10 [green] 标准商品/价格规格/negative/L1：1 条；共享链锚点=TC-ITEM-STD-049；逐用例证据=true；人工审核=false
- AT11 [yellow] 标准商品/价格规格/negative/L3：1 条；共享链锚点=TC-ITEM-STD-024；逐用例证据=true；人工审核=false
- AT12 [yellow] 标准商品/价格规格/read/L3：1 条；共享链锚点=TC-ITEM-STD-083；逐用例证据=true；人工审核=false
- AT13 [yellow] 标准商品/价格规格/update/L2：3 条；共享链锚点=TC-ITEM-STD-019；逐用例证据=true；人工审核=false
- AT14 [yellow] 标准商品/套餐规则/read/L0：1 条；共享链锚点=TC-ITEM-STD-079；逐用例证据=true；人工审核=false
- AT15 [yellow] 标准商品/展示与其他/delete/L2：2 条；共享链锚点=TC-ITEM-STD-078；逐用例证据=true；人工审核=false
- AT16 [green] 标准商品/展示与其他/negative/L1：3 条；共享链锚点=TC-ITEM-STD-045；逐用例证据=true；人工审核=false
- AT17 [yellow] 标准商品/展示与其他/read/L0：3 条；共享链锚点=TC-ITEM-STD-074；逐用例证据=true；人工审核=false
- AT18 [green] 标准商品/展示与其他/update/L2：6 条；共享链锚点=TC-ITEM-STD-003；逐用例证据=true；人工审核=false
- AT19 [yellow] 标准商品/状态生命周期/read/L3：1 条；共享链锚点=TC-ITEM-STD-077；逐用例证据=true；人工审核=false
- AT20 [green] 标准商品/状态生命周期/update/L2：1 条；共享链锚点=TC-ITEM-STD-065；逐用例证据=true；人工审核=false
- AT21 [yellow] 加料商品/编辑/create/L2：1 条；共享链锚点=TC-ITEM-ADD-025；逐用例证据=true；人工审核=false
- AT22 [yellow] 加料商品/查询筛选/create/L2：1 条；共享链锚点=TC-ITEM-ADD-033；逐用例证据=true；人工审核=false
- AT23 [yellow] 加料商品/查询筛选/update/L2：1 条；共享链锚点=TC-ITEM-ADD-041；逐用例证据=true；人工审核=false
- AT24 [yellow] 加料商品/创建/create/L2：4 条；共享链锚点=TC-ITEM-ADD-007；逐用例证据=true；人工审核=false
- AT25 [yellow] 加料商品/创建/update/L2：6 条；共享链锚点=TC-ITEM-ADD-012；逐用例证据=true；人工审核=false
- AT26 [yellow] 加料商品/价格规格/update/L2：2 条；共享链锚点=TC-ITEM-ADD-011；逐用例证据=true；人工审核=false
- AT27 [green] 加料商品/扩展配置/negative/L1：1 条；共享链锚点=TC-ITEM-ADD-017；逐用例证据=true；人工审核=false
- AT28 [yellow] 加料商品/扩展配置/update/L2：1 条；共享链锚点=TC-ITEM-ADD-045；逐用例证据=true；人工审核=false
- AT29 [yellow] 加料商品/展示与其他/create/L2：1 条；共享链锚点=TC-ITEM-ADD-038；逐用例证据=true；人工审核=false
- AT30 [yellow] 加料商品/展示与其他/read/L0：1 条；共享链锚点=TC-ITEM-ADD-035；逐用例证据=true；人工审核=false
- AT31 [yellow] 加料商品/展示与其他/update/L2：1 条；共享链锚点=TC-ITEM-ADD-002；逐用例证据=true；人工审核=false
- AT32 [yellow] 加料商品/状态生命周期/read/L3：1 条；共享链锚点=TC-ITEM-ADD-037；逐用例证据=true；人工审核=false
- AT33 [yellow] 套餐商品/必填校验/delete/L2：1 条；共享链锚点=TC-ITEM-PKG-050；逐用例证据=true；人工审核=false
- AT34 [yellow] 套餐商品/编辑/create/L2：2 条；共享链锚点=TC-ITEM-PKG-036；逐用例证据=true；人工审核=false
- AT35 [yellow] 套餐商品/编辑/delete/L2：1 条；共享链锚点=TC-ITEM-PKG-065；逐用例证据=true；人工审核=false
- AT36 [yellow] 套餐商品/查询筛选/read/L0：2 条；共享链锚点=TC-ITEM-PKG-044；逐用例证据=true；人工审核=false
- AT37 [yellow] 套餐商品/查询筛选/search/L0：2 条；共享链锚点=TC-ITEM-PKG-003；逐用例证据=true；人工审核=false
- AT38 [yellow] 套餐商品/查询筛选/update/L2：1 条；共享链锚点=TC-ITEM-PKG-048；逐用例证据=true；人工审核=false
- AT39 [green] 套餐商品/价格规格/negative/L1：1 条；共享链锚点=TC-ITEM-PKG-016；逐用例证据=true；人工审核=false
- AT40 [yellow] 套餐商品/价格规格/read/L0：2 条；共享链锚点=TC-ITEM-PKG-014；逐用例证据=true；人工审核=false
- AT41 [yellow] 套餐商品/价格规格/update/L2：1 条；共享链锚点=TC-ITEM-PKG-020；逐用例证据=true；人工审核=false
- AT42 [green] 套餐商品/删除/delete/L2：1 条；共享链锚点=TC-ITEM-PKG-055；逐用例证据=true；人工审核=false
- AT43 [green] 套餐商品/套餐规则/create/L2：10 条；共享链锚点=TC-ITEM-PKG-011；逐用例证据=true；人工审核=false
- AT44 [yellow] 套餐商品/套餐规则/delete/L2：3 条；共享链锚点=TC-ITEM-PKG-042；逐用例证据=true；人工审核=false
- AT45 [green] 套餐商品/套餐规则/negative/L1：3 条；共享链锚点=TC-ITEM-PKG-021；逐用例证据=true；人工审核=false
- AT46 [green] 套餐商品/套餐规则/read/L0：1 条；共享链锚点=TC-ITEM-PKG-058；逐用例证据=true；人工审核=false
- AT47 [green] 套餐商品/套餐规则/update/L2：6 条；共享链锚点=TC-ITEM-PKG-005；逐用例证据=true；人工审核=false
- AT48 [green] 套餐商品/展示与其他/create/L2：1 条；共享链锚点=TC-ITEM-PKG-054；逐用例证据=true；人工审核=false
- AT49 [yellow] 套餐商品/展示与其他/update/L2：2 条；共享链锚点=TC-ITEM-PKG-063；逐用例证据=true；人工审核=false
- AT50 [yellow] 套餐商品/状态生命周期/negative/L3：1 条；共享链锚点=TC-ITEM-PKG-070；逐用例证据=true；人工审核=false
- AT51 [yellow] 套餐商品/状态生命周期/read/L3：1 条；共享链锚点=TC-ITEM-PKG-060；逐用例证据=true；人工审核=false
- AT52 [green] 套餐商品/状态生命周期/update/L2：3 条；共享链锚点=TC-ITEM-PKG-034；逐用例证据=true；人工审核=false
- AT53 [yellow] 页面补充/批量与导入/update/L2：1 条；共享链锚点=TC-ITEM-UI-003；逐用例证据=true；人工审核=false
- AT54 [yellow] 页面补充/展示与其他/create/L2：2 条；共享链锚点=TC-ITEM-UI-007；逐用例证据=true；人工审核=false
- AT55 [yellow] 页面补充/展示与其他/read/L0：2 条；共享链锚点=TC-ITEM-UI-001；逐用例证据=true；人工审核=false
- AT56 [yellow] 页面补充/展示与其他/update/L2：3 条；共享链锚点=TC-ITEM-UI-004；逐用例证据=true；人工审核=false

## 人工规则决策

- MR01 分类叶子规则 canonical 来源统一：TC-ITEM-STD-007
- MR02 商品名称唯一性范围 canonical 来源统一：TC-ITEM-STD-011、TC-ITEM-STD-012、TC-ITEM-STD-013、TC-ITEM-STD-014
- MR03 加料商品字段范围产品确认：TC-ITEM-ADD-001
- MR04 套餐负价格归一规则产品确认：TC-ITEM-PKG-019
- MR05 套餐分类父级选择规则产品确认：TC-ITEM-PKG-013
- MR06 跨商品类型名称唯一性产品确认：TC-ITEM-ADD-015

## 执行顺序

1. 绿色模板直接批量生成和编译。
2. 黄色模板复用共享执行链，但组内每条用例都生成独立证据，禁止代表证据继承。
3. MR01-MR06 由产品负责人批量确认，不逐条审核。
4. 产品缺陷和环境阻断独立排队，不占用用例审核工时。
