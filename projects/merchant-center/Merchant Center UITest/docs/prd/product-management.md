# 商品管理模块 PRD（Product Management Module）

> **文档类型**：由测试用例反向推导的产品需求文档  
> **来源用例**：`docs/test-cases/product-management.md`（TC-PM-001 ~ TC-PM-091）  
> **子模块详案**：商品（Item）见 [item-management.md](./item-management.md)  
> **验证环境**：https://cc-fe.balamxqa.com · 商户 Menusifu SCH Restaurant  
> **最后同步**：2026-05-31  
> **自动化基线**：Smoke 19/19（`product-management.smoke.spec.ts`）+ Item E2E 31 项

---

## 1. 模块概述

商户中心左侧 **Product**（中文：商品管理）为品牌级商品及其配套主数据的统一入口，包含 9 个二级子模块。各子模块共享 OAuth 登录态与商户上下文（如 Menusifu SCH Restaurant），通过侧边栏或深链 URL 访问。

**模块目标：**

- 维护可售商品及其分类、规格、属性组等基础数据
- 支持多语言字段维护，满足 POS / 送厨 / 顾客端展示
- 为商品创建表单提供可引用的组数据（规格组、口味组、做法组、加料组、套餐组）
- 提供属性排序规则，支撑标准商品属性展示顺序

---

## 2. 侧边栏结构（FR-PM-NAV）

| 序号 | 中文菜单 | 英文菜单 | Path | 页面类型 |
|------|----------|----------|------|----------|
| 1 | 商品 | Item | `/pp/brand/list` | 列表 + 筛选 + CRUD |
| 2 | 多语言管理 | Language Management | `/pp/language-manage` | 列表 + 批量编辑 |
| 3 | 分类 | Category | `/pp/brand/category` | 分类树 |
| 4 | 规格组 | Specifications | `/pp/brand/spec` | 组列表 |
| 5 | 排序规则 | Sort order | `/pp/brand/modify-sort` | 规则列表 |
| 6 | 口味组 | Flavors | `/pp/brand/taste` | 组列表 |
| 7 | 做法组 | Preparations | `/pp/brand/method` | 组列表 |
| 8 | 加料组 | Add-Ons | `/pp/brand/additional` | 组列表 |
| 9 | 套餐组 | Combos | `/pp/brand/combo` | 组列表 |

**导航规则（BR-NAV-01 ~ BR-NAV-03）：**

- 点击 Product 展开上述 9 项；再次点击子项跳转对应 path
- 每次切换后 URL 与主操作区同步更新
- 页面加载完成标志：搜索框/主按钮/表头或标题可见（各页 `expectLoaded()` 契约）

---

## 3. 多语言管理（FR-PM-010）

**路径**：`/pp/language-manage`

**页面结构：**

| 区域 | 中文 | 英文 DOM |
|------|------|----------|
| 搜索框 | 商品 | placeholder `Item` |
| 主操作 | 编辑 | button `Edit` |
| 辅助 | 重置 | button `Reset` |
| 批量 | 批量操作(n) | `Bulk Operation(n)` |
| 表头锚点 | 字段信息 | `Field Information` |

**表格列（中文 → 英文）：** 商品 / 字段信息 / 英语 / 中文简体 / 操作

**功能需求：**

| 编号 | 需求 | 验收 |
|------|------|------|
| FR-PM-010 | 页面加载 | 搜索框、Reset、表头 Field Information 可见 |
| FR-PM-011 | 列表展示 | 展示商品各字段的多语言行（名称、POS 名、送厨名等）；有分页 |
| FR-PM-012 | 编辑 | 选中记录后 Edit 进入编辑态，可改英语/中文简体 |

**关联用例**：TC-PM-010 ~ TC-PM-012  
**自动化**：Smoke ✅（页面加载 + 侧边栏导航）

---

## 4. 分类（FR-PM-020）

**路径**：`/pp/brand/category`

**页面结构：**

| 区域 | 中文 | 英文 DOM |
|------|------|----------|
| 搜索框 | 请输入分类名称 | placeholder `Category Name` |
| 主操作 | 新增商品分类 | text `Add Category` |
| 树表头 | 分类名称 | `Category` |

**树列（中文 → 英文）：** 分类名称 / 第二语言 / 分类编码 / 操作

**功能需求：**

| 编号 | 需求 | 验收 |
|------|------|------|
| FR-PM-020 | 页面加载 | 搜索框、Add Category、Category 表头可见 |
| FR-PM-021 | 分类树 | 一/二级层级正确；节点含「添加分类到 xxx」 |
| FR-PM-022 | 搜索 | 输入已有分类名后树过滤匹配节点 |
| FR-PM-023 | 新增 | 点击 Add Category 打开表单/弹窗 |

**示例数据（QA）：** Special Offer、Launch、Dinner 等

**关联用例**：TC-PM-020 ~ TC-PM-023  
**自动化**：Smoke ✅

---

## 5. 规格组（FR-PM-030）

**路径**：`/pp/brand/spec`

**页面结构（组列表通用模式）：**

| 区域 | 英文 DOM |
|------|----------|
| 搜索 placeholder | `Specification Group Name` |
| 添加按钮 | `Add` |
| 表头锚点 | `Specification Group Name` |

**表格列：** 规格组名称 / 规格项明细 / 关联商品 / 操作

**功能需求：**

| 编号 | 需求 | 验收 |
|------|------|------|
| FR-PM-030 | 页面加载 | 搜索、Add、表头可见 |
| FR-PM-031 | 列表 | 展示 Regular Size(M) 等组及规格项 |
| FR-PM-032 | 搜索 | 按组名过滤 |
| FR-PM-033 | 添加 | 点击 Add 打开新增表单/弹窗 |

**与商品关系（BR-SPEC-01）：** 标准商品多规格创建时通过「Select Specification Group」引用规格组。

**关联用例**：TC-PM-030 ~ TC-PM-033  
**自动化**：Smoke ✅

---

## 6. 排序规则（FR-PM-040）

**路径**：`/pp/brand/modify-sort`

**页面结构：**

| 区域 | 中文 | 英文 DOM |
|------|------|----------|
| 页面标题 | 排序规则 | heading `Sort order` |
| 搜索框 | 排序规则名称 | placeholder `Rule name` |
| 主操作 | 新增排序规则 | button `Add sorting rule` |

**功能需求：**

| 编号 | 需求 | 验收 |
|------|------|------|
| FR-PM-040 | 页面加载 | heading、搜索、Add sorting rule 可见 |
| FR-PM-041 | 空状态 | 无数据时显示「没有结果」或等价提示 |
| FR-PM-042 | 新增 | 点击 Add sorting rule 打开表单/弹窗 |

**与商品关系（BR-SORT-01）：** 标准商品属性区块通过「Select attribute sort rule」引用排序规则。

**关联用例**：TC-PM-040 ~ TC-PM-042  
**自动化**：Smoke ✅

---

## 7. 口味组（FR-PM-050）

**路径**：`/pp/brand/taste`

| 区域 | 英文 DOM |
|------|----------|
| 搜索 placeholder | `Flavor Group Name` |
| 添加按钮 | `Add` |
| 表头锚点 | `Flavor Group Name` |

**表格列：** 口味组名称 / 口味项明细 / 关联商品 / 操作

**示例数据：** Sugar level、Fruit Tea Ice Level、俄罗斯口味

**功能需求：** FR-PM-050 ~ FR-PM-052（加载、列表、Add 入口）  
**关联用例**：TC-PM-050 ~ TC-PM-052  
**与商品关系（BR-FLAV-01）：** 标准商品属性 → Add → Flavor 引用口味组

---

## 8. 做法组（FR-PM-060）

**路径**：`/pp/brand/method`

| 区域 | 英文 DOM |
|------|----------|
| 搜索 placeholder | `Preparation Group Name` |
| 添加按钮 | `Add` |
| 表头锚点 | `Preparation Group Name` |

**表格列：** 做法组名称 / 做法项明细 / 关联商品 / 操作

**示例数据：** 做法组1（做法1、做法2）

**功能需求：** FR-PM-060 ~ FR-PM-062  
**关联用例**：TC-PM-060 ~ TC-PM-062  
**与商品关系（BR-METH-01）：** 标准商品属性 → Add → Recipe 引用做法组

---

## 9. 加料组（FR-PM-070）

**路径**：`/pp/brand/additional`

| 区域 | 英文 DOM |
|------|----------|
| 搜索 placeholder | `Add-On Group Name` |
| 添加按钮 | `Add` |
| 表头锚点 | `Add-On Group Name` |

**表格列：** 加料组名称 / 加料项明细 / 关联商品 / 操作

**示例数据：** Topping Choice、加料组1

**功能需求：** FR-PM-070 ~ FR-PM-072  
**关联用例**：TC-PM-070 ~ TC-PM-072  
**与商品关系（BR-ADD-01）：** 标准商品属性 → Add → Additives 引用加料组

---

## 10. 套餐组（FR-PM-080）

**路径**：`/pp/brand/combo`

| 区域 | 英文 DOM |
|------|----------|
| 搜索 placeholder | `Enter Combo Group Name` |
| 添加按钮 | `Add` |
| 表头锚点 | `Combo Group Name` |

**表格列：** 套餐组名称 / 组名称(第二语言) / 关联商品 / 描述 / 操作

**示例数据：** 组22、组合1、block2、block-1

**功能需求：** FR-PM-080 ~ FR-PM-082  
**关联用例**：TC-PM-080 ~ TC-PM-082  
**与商品关系（BR-COMB-01）：** 套餐商品创建时 Add Combo Group → Select Custom Combo 引用套餐组

---

## 11. 商品子模块（FR-PM-001）

商品（Item）为 Product 模块核心，功能范围最大，独立 PRD 维护。

**详见**：[item-management.md](./item-management.md)

**概要能力：**

- 列表 / 搜索 / 类型·状态筛选 / 重置
- 批量操作（5 项菜单）
- 图片导入 / 商品导入 / 导入记录
- 行操作（停用、复制、删除）
- 三种类型创建与编辑
- 标准商品单规格 / 多规格 / 称重

**关联用例**：TC-PM-001 ~ TC-PM-005 → 详见 `item-list.md`（TC-IL-*）  
**自动化**：E2E 31 项 ✅

---

## 12. 组列表页通用模式（FR-PM-GROUP）

规格组、口味组、做法组、加料组、套餐组共享 **GroupListPage** 交互模式：

```
[ 搜索框 ]                    [ Add 按钮 ]
┌─────────────────────────────────────────┐
│ 组名称 │ 项明细 │ 关联商品 │ 操作      │
└─────────────────────────────────────────┘
```

| 规则 | 说明 |
|------|------|
| BR-GROUP-01 | 各页搜索 placeholder 与表头锚点唯一，用于 smoke 加载断言 |
| BR-GROUP-02 | Add 打开新增表单/弹窗（具体字段待各组 PRD 细化） |
| BR-GROUP-03 | 「关联商品」列展示引用该组的商品数量或链接 |
| BR-GROUP-04 | 组数据被商品表单引用后，删除/修改需考虑关联约束（待产品确认） |

---

## 13. 非功能需求

| 编号 | 要求 |
|------|------|
| NFR-PM-01 | 各子页 `expectLoaded()` 超时 30s |
| NFR-PM-02 | 英文 DOM 为 Playwright 自动化契约；中文为手工测试语义 |
| NFR-PM-03 | 侧边栏导航与 direct URL 两种入口行为一致 |
| NFR-PM-04 | 商品模块 AUTO 测试数据前缀 `AUTO-{type}-*` 与其他模块隔离 |

---

## 14. 范围外 / 待补充

| 模块 | 待补能力 | 对应用例 |
|------|----------|----------|
| 多语言 | Edit 保存流程、批量 Edit | TC-PM-012 |
| 分类 | 新增/编辑/删除分类、树拖拽 | TC-PM-023+ |
| 各组列表 | Add 表单字段、编辑、删除 | TC-PM-033/042/052 等 |
| 各组列表 | 搜索断言 | TC-PM-032 等 |
| 排序规则 | 规则配置详情 | TC-PM-042+ |
| 全模块 | 权限分级、操作审计 | — |

---

## 15. 需求追溯矩阵

| PRD 章节 | 用例 | 自动化 |
|----------|------|--------|
| FR-PM-001（Item） | TC-PM-001~005 → TC-IL-* | E2E ✅ |
| FR-PM-010 | TC-PM-010~012 | Smoke ✅ |
| FR-PM-020 | TC-PM-020~023 | Smoke ✅ |
| FR-PM-030 | TC-PM-030~033 | Smoke ✅ |
| FR-PM-040 | TC-PM-040~042 | Smoke ✅ |
| FR-PM-050 | TC-PM-050~052 | Smoke ✅ |
| FR-PM-060 | TC-PM-060~062 | Smoke ✅ |
| FR-PM-070 | TC-PM-070~072 | Smoke ✅ |
| FR-PM-080 | TC-PM-080~082 | Smoke ✅ |
| FR-PM-NAV | TC-PM-090~091 | Smoke ✅ `@navigation` |

**Smoke 实现**：`tests/smoke/product-management.smoke.spec.ts` × 9 页 × 2 入口 = 18 + Item 相关 = 19 项（含 setup 另计）

---

## 16. 文档索引

| 文档 | 用途 |
|------|------|
| [product-management.md](./product-management.md) | 模块总 PRD |
| [item-management.md](./item-management.md) | 商品子模块详案 |
| [product-management.md](../test-cases/product-management.md) | 模块测试用例索引 |
| [product-management-modules.md](../test-cases/product-management-modules.md) | 子模块测试用例详案 |
| [item-list.md](../test-cases/item-list.md) | 商品测试用例详案 |

---

## 17. 修订记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-05-31 | 1.0 | 由 TC-PM 及 Smoke 19/19 反向生成模块总 PRD |
