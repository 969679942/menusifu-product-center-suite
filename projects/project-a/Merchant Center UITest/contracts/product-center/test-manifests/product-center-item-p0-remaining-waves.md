# 商品中心剩余 P0 共享波次

- 状态：executed-with-reconciled-conflicts-and-terminal-gate
- 用例：65
- 波次：9
- 商品类型：标准=25；加料=21；套餐=19
- 执行结果：accepted=45；canonical-conflict=19；blocked=1；harness-error=0
- 决策后结果：effective-accepted=54；reconciled=9；unresolved=10；product-defect=6；needs-PRD=4
- 执行原则：禁止逐条运行；所有写操作必须对账、登记 ID、finally cleanup、UI/API 双零残留。

## W1 列表、类型选择与三类创建页结构

- 数量：7
- 安全等级：L0-read-only
- 就绪状态：executed
- 结果：accepted=5；canonical-conflict=2；blocked=0；harness-error=0
- 决策后：effective-accepted=6；reconciled=1；unresolved=1；product-defect=0；needs-PRD=1
- 证据：output/audit/product-center-item-p0-w1-20260731/audit.json (b6dc015fcf4581dc30e43f1683ad3b883b807032a97b90e7d2f7fac8f6232986)
- 共享链：登录一次，依次进入商品列表、商品类型选择及三类创建页，只观察可见字段与入口，不提交。
- 用例：TC-ITEM-STD-002、TC-ITEM-ADD-001、TC-ITEM-ADD-029、TC-ITEM-ADD-030、TC-ITEM-ADD-031、TC-ITEM-ADD-032、TC-ITEM-PKG-001
- 所需证据：route、页面状态、可见字段和入口的当前 DOM/截图证据
- 清理：关闭未提交页面并确认没有商品创建 mutation

## W2 必填、格式、数值与分类拒绝矩阵

- 数量：19
- 安全等级：L1-controlled-negative
- 就绪状态：executed
- 结果：accepted=14；canonical-conflict=5；blocked=0；harness-error=0
- 决策后：effective-accepted=14；reconciled=0；unresolved=5；product-defect=3；needs-PRD=2
- 证据：output/audit/product-center-item-p0-remaining-w2-AUTO_AUDIT_P0_REMAINING_W2_20260731_02.json (5e26829c2b2b5b879181409aa327c5c763ec7279ba02a56abc0269b822e9df06)
- 共享链：每种商品复用一个创建页会话，原位切换无效输入并逐项提交，记录前端与后端拒绝终态。
- 用例：TC-ITEM-STD-039、TC-ITEM-STD-093、TC-ITEM-STD-021、TC-ITEM-STD-022、TC-ITEM-STD-023、TC-ITEM-STD-097、TC-ITEM-STD-043、TC-ITEM-ADD-006、TC-ITEM-ADD-008、TC-ITEM-ADD-047、TC-ITEM-ADD-010、TC-ITEM-ADD-048、TC-ITEM-ADD-016、TC-ITEM-PKG-015、TC-ITEM-PKG-019、TC-ITEM-PKG-077、TC-ITEM-PKG-026、TC-ITEM-PKG-076、TC-ITEM-PKG-013
- 所需证据：字段输入、提交意图、校验文案、mutation 是否发生、列表/API 前后不变
- 清理：每次提交后按唯一身份与响应 ID 对账；若意外落库则按 ID 删除并验证 UI/API 双零残留

## W3 编码、同名与跨类型重复约束

- 数量：6
- 安全等级：L3-shared-seed-mutation
- 就绪状态：executed
- 结果：accepted=5；canonical-conflict=1；blocked=0；harness-error=0
- 决策后：effective-accepted=5；reconciled=0；unresolved=1；product-defect=0；needs-PRD=1
- 证据：output/audit/product-center-item-p0-remaining-w3-AUTO_AUDIT_P0_REMAINING_W3_20260731_03.json (53258ef6f7eee640b8f2017887906c442d436990f7989909d81368488cff9f56)
- 共享链：建立一次共享分类与最少 seed，跨三类创建页验证重复约束，严禁操作现存固定记录。
- 用例：TC-ITEM-STD-010、TC-ITEM-STD-044、TC-ITEM-ADD-014、TC-ITEM-ADD-015、TC-ITEM-PKG-024、TC-ITEM-PKG-025
- 所需证据：seed 服务端 ID、重复提交请求、拒绝终态、原 seed 保持不变
- 清理：先清理引用，再按服务端 ID 删除 seed；UI/API 搜索全部身份变体并证明零残留

## W4 标准商品正向创建、格式化、多规格与称重

- 数量：6
- 安全等级：L3-create-mutation
- 就绪状态：executed
- 结果：accepted=5；canonical-conflict=1；blocked=0；harness-error=0
- 决策后：effective-accepted=6；reconciled=1；unresolved=0；product-defect=0；needs-PRD=0
- 证据：output/audit/product-center-item-p0-remaining-w4-AUTO_AUDIT_P0_REMAINING_W4_20260731_09.json (8e990418023ba44d4b6bcb83cf6ea23b996b2116dd900c8b2792d3ce96122b45)
- 共享链：共享一个自建规格组，连续完成六个独立商品结果，最后在列表和 API 集中回查。
- 用例：TC-ITEM-STD-036、TC-ITEM-STD-037、TC-ITEM-STD-008、TC-ITEM-STD-016、TC-ITEM-STD-017、TC-ITEM-STD-018
- 所需证据：创建请求与响应 ID、格式化终态、规格/称重配置、列表/API 一致性
- 清理：按服务端 ID 删除六个商品；删除自建规格组；验证 UI/API 双零残留

## W5 图片、标签、角标与默认选中边界

- 数量：8
- 安全等级：L3-resource-mutation
- 就绪状态：executed
- 结果：accepted=6；canonical-conflict=2；blocked=0；harness-error=0
- 决策后：effective-accepted=7；reconciled=1；unresolved=1；product-defect=1；needs-PRD=0
- 证据：output/audit/product-center-item-p0-remaining-w5-AUTO_AUDIT_P0_REMAINING_W5_20260731_06.json (e1235890658437775a93c5ff6192a4beafa2c32ee8ecbad818355c927fcfdddf)
- 共享链：三类商品各使用一个临时商品，共享标签、角标和选项资源，仅在需要持久化时保存。
- 用例：TC-ITEM-STD-081、TC-ITEM-STD-090、TC-ITEM-STD-091、TC-ITEM-STD-089、TC-ITEM-ADD-046、TC-ITEM-PKG-073、TC-ITEM-PKG-074、TC-ITEM-PKG-075
- 所需证据：资源选择/上传、边界配置、保存响应、编辑页和列表回显
- 清理：先解除商品资源引用；删除临时商品与自建资源；验证图片、资源、商品 UI/API 双零残留

## W6 三类商品编辑与组内配置隔离

- 数量：8
- 安全等级：L3-update-mutation
- 就绪状态：executed
- 结果：accepted=3；canonical-conflict=5；blocked=0；harness-error=0
- 决策后：effective-accepted=6；reconciled=3；unresolved=2；product-defect=2；needs-PRD=0
- 证据：output/audit/product-center-item-p0-remaining-w6-AUTO_AUDIT_P0_REMAINING_W6_20260731_05.json (9a00932cbc3ea3fe067f8053c8131e6b8c502fd5078dd7390958f687dd88fb30)
- 共享链：共享口味、做法、加料组和三类临时商品，编辑后验证商品内配置与主数据隔离。
- 用例：TC-ITEM-STD-032、TC-ITEM-STD-087、TC-ITEM-STD-088、TC-ITEM-ADD-024、TC-ITEM-PKG-035、TC-ITEM-PKG-069、TC-ITEM-PKG-071、TC-ITEM-PKG-072
- 所需证据：创建/更新 ID、编辑前后差异、主数据未变、列表/API 回查
- 清理：先删除商品引用；再删除组与资源；验证原名、编辑名及 ID 的 UI/API 双零残留

## W7 加料与套餐删除、引用阻断和确认弹窗

- 数量：7
- 安全等级：L3-delete-mutation
- 就绪状态：executed
- 结果：accepted=7；canonical-conflict=0；blocked=0；harness-error=0
- 决策后：effective-accepted=7；reconciled=0；unresolved=0；product-defect=0；needs-PRD=0
- 证据：output/audit/product-center-item-p0-remaining-w7-AUTO_AUDIT_P0_REMAINING_W7_20260731_03.json (23145783dd5935e9275b9a0a2fa0324c024c59ae079f8759d8c8ec820fa928de)
- 共享链：在一个列表会话中使用临时商品共享菜单、加料组和标准商品引用，依次观察阻断与最终删除。
- 用例：TC-ITEM-ADD-026、TC-ITEM-ADD-027、TC-ITEM-ADD-028、TC-ITEM-ADD-034、TC-ITEM-ADD-036、TC-ITEM-PKG-037、TC-ITEM-PKG-038
- 所需证据：删除预检、二次确认、最终 DELETE、引用阻断、UI/API 终态
- 清理：禁止删除现存记录；先解除引用再删除临时实体；对全部身份变体与 ID 做联合零残留扫描

## W8 三类商品停用、下发与渠道不可见

- 数量：3
- 安全等级：L3-cross-channel-mutation
- 就绪状态：executed
- 结果：accepted=0；canonical-conflict=3；blocked=0；harness-error=0
- 决策后：effective-accepted=3；reconciled=3；unresolved=0；product-defect=0；needs-PRD=0
- 证据：output/audit/product-center-item-p0-remaining-w8-AUTO_AUDIT_P0_REMAINING_W8_20260731_05.json (f664955e8381cbd52f7eb647ca8b1fd15ec9ae1e2fac9ac360025de2019cbbd7)
- 共享链：共享一个测试菜单绑定三类临时商品，逐一探测停用；若命中菜单引用阻断则记录 canonical conflict 并跳过下发。
- 用例：TC-ITEM-STD-067、TC-ITEM-ADD-044、TC-ITEM-PKG-039
- 所需证据：状态更新响应、目标商品 ID、BITEM-2013 引用阻断、API/UI 状态保持启用、下发跳过原因
- 清理：删除菜单引用后清理商品；验证 Merchant Center、UI 与渠道三侧零残留

## W9 称重商品终端皮重边界

- 数量：1
- 安全等级：L3-external-terminal-transaction
- 就绪状态：blocked-until-terminal-access
- 结果：accepted=0；canonical-conflict=0；blocked=1；harness-error=0
- 决策后：effective-accepted=0；reconciled=0；unresolved=0；product-defect=0；needs-PRD=0
- 证据：output/audit/product-center-item-p0-remaining-w9-blocked.json (a6754e31c1a4ca0d3674ed3994979f93cd7f1bd7fc7d2500ecb911c0c6c3113e)
- 共享链：创建唯一称重商品，在可控终端输入小于皮重的重量，核对金额为零并取消交易。
- 用例：TC-ITEM-STD-080
- 所需证据：商品 ID、终端交易输入、金额终态、取消交易结果、订单与商品残留扫描
- 清理：取消终端交易并验证无订单残留；按服务端 ID 删除称重商品；Merchant Center、终端及 API 联合零残留
