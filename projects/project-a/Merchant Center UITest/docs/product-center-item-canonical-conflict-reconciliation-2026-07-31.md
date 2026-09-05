# 商品中心 Canonical Conflict 批量确认清单

- 状态：confirmed-and-rebuilt
- 用例分母：19
- 决策组：9
- generationAllowed：9 条已允许；6 条产品缺陷与 4 条待 PRD 继续阻断
- 原则：页面与 API 观察只形成技术证据；未经产品规则确认，不自动改写 canonical。

## 决策组

| 组 | 用例 | Canonical 主张 | 实时观察 | 建议决策 |
|---|---|---|---|---|
| C01 列表结构 | TC-ITEM-STD-002 | 商品列表存在左侧分类树并展示既定核心结构 | 当前商品主区域无左侧分类树，其余筛选、表格与分页入口可见 | 建议按当前页面更新 canonical，删除左侧分类树断言 |
| C02 加料字段 | TC-ITEM-ADD-001 | 加料基础字段与标准商品一致且无起售数量 | 加料页无起售数量，同时也无助记码 | 需产品确认“字段一致”是否仍成立；若否，按商品类型拆分字段合同 |
| C03 数值与分类拒绝 | TC-ITEM-STD-021、TC-ITEM-STD-023、TC-ITEM-ADD-010、TC-ITEM-PKG-019、TC-ITEM-PKG-013 | 负价格、非数字起售数量、只选有子级一级分类均应拒绝 | 标准/加料负价和非数字起售数量均成功落库；套餐负价输入被页面归一为 0.00 后成功；套餐只选一级分类也成功 | 标准/加料负价与非数字起售数量建议保留 canonical 并登记产品缺陷；套餐两条先确认最新规则，再重写为输入归一或允许一级分类的准确断言 |
| C04 跨类型同名 | TC-ITEM-ADD-015 | 加料与其他商品类型同商户同名创建失败 | 标准与加料跨类型同名均创建成功 | 建议确认名称唯一性作用域；若按商品类型隔离，则更新 canonical |
| C05 名称格式化 | TC-ITEM-STD-008 | 超长及特殊字符名称保存后自动格式化 | 输入被截断到 100 字符，连续空格触发“字符之间只允许单空格”，未创建记录 | 建议按当前边界重写 canonical：100 字符上限加连续空格拒绝，不再断言自动格式化落库 |
| C06 重复详情图 | TC-ITEM-STD-081 | 重复详情图导致保存失败并提示 BITEM-3006 | 两次上传均提示 BITEM-3006，但商品仍以空详情图成功创建 | 建议保留“不可带重复图保存”的业务规则并登记产品缺陷；用例应同时断言是否意外创建空图商品 |
| C07 套餐共享属性 | TC-ITEM-PKG-073、TC-ITEM-PKG-069、TC-ITEM-PKG-071、TC-ITEM-PKG-072 | 套餐支持共享口味/做法/加料属性组及商品内默认项/加价覆盖 | 创建页和编辑页只有 Combo Group 入口，没有共享 Attribute 添加入口 | 建议按新套餐模型废弃这 4 条旧断言，并以固定/可选搭配组规则替代 |
| C08 编辑持久化 | TC-ITEM-ADD-024、TC-ITEM-PKG-035 | 编辑基础信息后名称、价格、主图正确持久化 | PUT 返回 200，但加料名称/价格/主图均未按输入回读；套餐名称/主图未回读，价格回读成功 | 建议保留 canonical 并登记产品缺陷；修复前禁止生成“编辑成功”自动化 |
| C09 菜单引用停用 | TC-ITEM-STD-067、TC-ITEM-ADD-044、TC-ITEM-PKG-039 | 菜单引用商品仍可停用并在下发后渠道不可见 | 三类商品停用均返回 HTTP 400、BITEM-2013，API/UI 保持 Enabled | 建议按当前引用保护规则更新 canonical：引用中商品不可停用，并断言引用菜单信息 |

## 批量确认输出

产品负责人只需对 C01-C09 分别选择：

- `update-canonical`：实时产品行为是最新规则，更新或替换正式用例。
- `retain-canonical-file-bug`：正式规则正确，实时行为是产品缺陷，保留用例并阻断自动化晋级。
- `needs-prd`：现有证据不足，补充 PRD/规则后再决定。

确认完成后必须重建当前技术状态；只有 `update-canonical` 且新规则完成来源追溯，或产品缺陷修复后重新运行 accepted 的用例，才允许 `generationAllowed=true`。

## 已确认决策

- 确认人：金将军；确认日期：2026-07-31。
- `update-canonical`（9）：TC-ITEM-STD-002、TC-ITEM-STD-008、TC-ITEM-PKG-073、TC-ITEM-PKG-069、TC-ITEM-PKG-071、TC-ITEM-PKG-072、TC-ITEM-STD-067、TC-ITEM-ADD-044、TC-ITEM-PKG-039。
- `retain-canonical-file-bug`（6）：TC-ITEM-STD-021、TC-ITEM-STD-023、TC-ITEM-ADD-010、TC-ITEM-STD-081、TC-ITEM-ADD-024、TC-ITEM-PKG-035。
- `needs-prd`（4）：TC-ITEM-ADD-001、TC-ITEM-PKG-019、TC-ITEM-PKG-013、TC-ITEM-ADD-015。
- 机器可读记录：contracts/product-center/reviews/product-center-item-canonical-conflict-decisions.json。
- 重建结果：9 条产品确认校正已进入 canonical；6 条产品缺陷与 4 条待 PRD 用例保持 `generationAllowed=false`。

## 证据

- W1：output/audit/product-center-item-p0-w1-20260731/audit.json
- W2：output/audit/product-center-item-p0-remaining-w2-AUTO_AUDIT_P0_REMAINING_W2_20260731_02.json
- W3：output/audit/product-center-item-p0-remaining-w3-AUTO_AUDIT_P0_REMAINING_W3_20260731_03.json
- W4：output/audit/product-center-item-p0-remaining-w4-AUTO_AUDIT_P0_REMAINING_W4_20260731_09.json
- W5：output/audit/product-center-item-p0-remaining-w5-AUTO_AUDIT_P0_REMAINING_W5_20260731_06.json
- W6：output/audit/product-center-item-p0-remaining-w6-AUTO_AUDIT_P0_REMAINING_W6_20260731_05.json
- W8：output/audit/product-center-item-p0-remaining-w8-AUTO_AUDIT_P0_REMAINING_W8_20260731_05.json
