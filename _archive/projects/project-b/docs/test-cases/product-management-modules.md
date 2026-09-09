# 商品管理子模块 - 测试用例详案

> 探索时间：2026-05-31  
> 最后更新：2026-05-31  
> 环境：https://cc-fe.balamxqa.com  
> 商户：Menusifu SCH Restaurant  
> 关联 PRD：`docs/prd/product-management.md`  
> 冒烟自动化：`tests/smoke/product-management.smoke.spec.ts`（9 页 × direct + sidebar = 18 项 + 商品页）  
> 说明：Playwright 以英文 DOM 为准；下表「英文契约」列来自 `test-data/product-management.ts`。

---

## 模块索引

| 章节 | 子模块 | Path | 用例编号 |
|------|--------|------|----------|
| §1 | 多语言管理 | `/pp/language-manage` | TC-PM-010~012 |
| §2 | 分类 | `/pp/brand/category` | TC-PM-020~023 |
| §3 | 规格组 | `/pp/brand/spec` | TC-PM-030~033 |
| §4 | 排序规则 | `/pp/brand/modify-sort` | TC-PM-040~042 |
| §5 | 口味组 | `/pp/brand/taste` | TC-PM-050~052 |
| §6 | 做法组 | `/pp/brand/method` | TC-PM-060~062 |
| §7 | 加料组 | `/pp/brand/additional` | TC-PM-070~072 |
| §8 | 套餐组 | `/pp/brand/combo` | TC-PM-080~082 |
| §9 | 侧边栏导航 | — | TC-PM-090~091 |

商品（Item）详案见 [item-list.md](./item-list.md)，PRD 见 [item-management.md](../prd/item-management.md)。

---

## 1. 多语言管理

**英文契约**

| 元素 | 值 |
|------|-----|
| 侧边栏 | Language Management |
| 搜索 placeholder | Item |
| 按钮 | Edit、Reset |
| 批量 | Bulk Operation(n) |
| 表头锚点 | Field Information |

### TC-PM-010 页面加载
**步骤：**
1. 登录并选择商户
2. 进入 Language Management /「多语言管理」

**预期：**
- URL 为 `/pp/language-manage`
- 搜索框 placeholder 为 `Item`
- 显示 Edit、Reset、Bulk Operation(0)
- 表格含 Field Information 列

**自动化**：✅ smoke `expectLoaded()`

### TC-PM-011 多语言列表展示
**步骤：**
1. 查看列表区域

**预期：**
- 展示商品多语言字段行（Item Name、POS Name、Kitchen Name 等）
- 分页显示 Total N items

**自动化**：⬜ 手工（smoke 仅验证表头）

### TC-PM-012 编辑多语言
**步骤：**
1. 勾选一条或多条记录
2. 点击 Edit

**预期：**
- 进入编辑态，可修改 English / 中文简体 列

**自动化**：⬜ 手工

---

## 2. 分类

**英文契约**

| 元素 | 值 |
|------|-----|
| 侧边栏 | Category |
| 搜索 placeholder | Category Name |
| 主操作 | Add Category |
| 树表头 | Category |

### TC-PM-020 页面加载
**步骤：**
1. 进入 Category /「分类」

**预期：**
- URL 为 `/pp/brand/category`
- 搜索框 placeholder 为 `Category Name`
- 显示 Add Category
- 分类树表头含 Category

**自动化**：✅ smoke

### TC-PM-021 分类树展示
**步骤：**
1. 查看分类树

**预期：**
- 一/二级层级正确（如 Special Offer、Launch、Dinner）
- 节点含「添加分类到 xxx」/ Add category to xxx 入口

**自动化**：⬜ 手工

### TC-PM-022 搜索分类
**步骤：**
1. 输入已有分类名搜索

**预期：**
- 树过滤展示匹配节点

**自动化**：⬜ 手工

### TC-PM-023 新增商品分类
**步骤：**
1. 点击 Add Category

**预期：**
- 打开新增分类表单/弹窗

**自动化**：⬜ 手工（smoke 未点击 Add）

---

## 3. 规格组

**英文契约**：placeholder `Specification Group Name` · button `Add` · 表头 `Specification Group Name`

### TC-PM-030 页面加载
**预期**：URL `/pp/brand/spec`；搜索、Add、表头可见  
**自动化**：✅ smoke

### TC-PM-031 规格组列表
**预期**：展示 Regular Size(M) 等组及规格项明细  
**自动化**：⬜ 手工

### TC-PM-032 搜索规格组
**预期**：按组名过滤列表  
**自动化**：⬜ 手工

### TC-PM-033 添加规格组
**步骤**：点击 Add  
**预期**：打开新增规格组表单/弹窗  
**自动化**：⬜ 手工

---

## 4. 排序规则

**英文契约**：heading `Sort order` · placeholder `Rule name` · button `Add sorting rule`

### TC-PM-040 页面加载
**预期**：URL `/pp/brand/modify-sort`；heading、搜索、Add sorting rule 可见  
**自动化**：✅ smoke

### TC-PM-041 空状态展示
**预期**：无规则时显示 No results / 没有结果  
**自动化**：⬜ 手工

### TC-PM-042 新增排序规则
**步骤**：点击 Add sorting rule  
**预期**：打开新增表单/弹窗  
**自动化**：⬜ 手工

---

## 5. 口味组

**英文契约**：placeholder `Flavor Group Name` · button `Add` · 表头 `Flavor Group Name`

### TC-PM-050 页面加载
**预期**：URL `/pp/brand/taste`  
**自动化**：✅ smoke

### TC-PM-051 口味组列表
**预期**：Sugar level、Fruit Tea Ice Level 等  
**自动化**：⬜ 手工

### TC-PM-052 添加口味组
**自动化**：⬜ 手工

---

## 6. 做法组

**英文契约**：placeholder `Preparation Group Name` · button `Add` · 表头 `Preparation Group Name`

### TC-PM-060 ~ TC-PM-062
同组列表通用模式；示例数据：做法组1  
**030 页面加载**：✅ smoke

---

## 7. 加料组

**英文契约**：placeholder `Add-On Group Name` · button `Add` · 表头 `Add-On Group Name`

### TC-PM-070 ~ TC-PM-072
**070 页面加载**：✅ smoke · 示例：Topping Choice

---

## 8. 套餐组

**英文契约**：placeholder `Enter Combo Group Name` · button `Add` · 表头 `Combo Group Name`

### TC-PM-080 ~ TC-PM-082
**080 页面加载**：✅ smoke · 示例：组22、组合1

---

## 9. 侧边栏导航

### TC-PM-090 商品管理菜单展开
**步骤**：点击侧边栏 Product / 商品管理  
**预期**：展开上述 9 个二级菜单项  
**自动化**：✅ smoke（各页 `@navigation` 用例隐含验证）

### TC-PM-091 侧边栏顺序导航
**步骤**：从 Item 依次导航至 Combos  
**预期**：每次 URL 切换正确；`expectLoaded()` 通过  
**自动化**：✅ smoke `@navigation` × 9

---

## 自动化映射汇总

| 用例 | Smoke | E2E | 说明 |
|------|-------|-----|------|
| TC-PM-010 | ✅ | — | Language Management |
| TC-PM-020 | ✅ | — | Category |
| TC-PM-030 | ✅ | — | Specifications |
| TC-PM-040 | ✅ | — | Sort order |
| TC-PM-050 | ✅ | — | Flavors |
| TC-PM-060 | ✅ | — | Preparations |
| TC-PM-070 | ✅ | — | Add-Ons |
| TC-PM-080 | ✅ | — | Combos |
| TC-PM-090~091 | ✅ | — | 每页 direct + sidebar |
| TC-PM-011~012 | ⬜ | — | 多语言业务 |
| TC-PM-021~023 | ⬜ | — | 分类业务 |
| TC-PM-031~033 等 | ⬜ | — | 各组 CRUD / 搜索 |

**追溯 PRD**：`docs/prd/product-management.md` §15
