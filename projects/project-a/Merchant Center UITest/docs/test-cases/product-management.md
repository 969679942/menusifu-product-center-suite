# 商品管理模块 - 测试用例

> 探索时间：2026-05-31  
> 最后更新：2026-05-31  
> 环境：https://cc-fe.balamxqa.com  
> 商户：Menusifu SCH Restaurant  
> 模块 PRD：`docs/prd/product-management.md`  
> 子模块详案：`docs/test-cases/product-management-modules.md`  
> 商品详案：`docs/test-cases/item-list.md` · PRD：`docs/prd/item-management.md`  
> Smoke：`tests/smoke/product-management.smoke.spec.ts`（19/19）

---

## 1. 商品（/pp/brand/list）

> 详细用例见 [item-list.md](./item-list.md)（TC-IL-001 ~ TC-IL-101）  
> 产品需求见 [item-management.md](../prd/item-management.md)

### TC-PM-001 页面加载
**步骤：**
1. 登录并选择商户
2. 进入「商品管理 > 商品」

**预期：**
- 页面标题包含「商品」
- 显示搜索框（placeholder：商品名称）
- 显示「新增商品」「重置」「批量操作(0)」「导入记录」「操作」按钮
- 表格列包含：商品、第二语言名称、助记码、商品类型、商品分类、规格、标准价($)、口味、做法、描述标签、商品角标、统计标签、过敏原、设备编码、商品状态、更新时间、操作

### TC-PM-002 按商品名称搜索
**步骤：**
1. 在搜索框输入已有商品名（如 Pearl）
2. 观察列表结果

**预期：**
- 列表仅展示名称匹配的商品

### TC-PM-003 重置筛选
**步骤：**
1. 设置商品类型/分类/状态筛选
2. 点击「重置」

**预期：**
- 筛选条件清空，列表恢复默认展示

### TC-PM-004 新增商品入口
**步骤：**
1. 点击「新增商品」

**预期：**
- 打开新增商品表单/页面，必填字段可见

### TC-PM-005 批量操作
**步骤：**
1. 勾选一条或多条商品
2. 观察「批量操作(n)」按钮状态

**预期：**
- 未选中时按钮禁用；选中后按钮可用并显示选中数量

---

## 2~9. 子模块用例（多语言 / 分类 / 各组列表）

> 完整步骤、英文 DOM 契约与 smoke 映射见 **[product-management-modules.md](./product-management-modules.md)**。

| 模块 | 用例 | Smoke |
|------|------|-------|
| 多语言管理 | TC-PM-010~012 | ✅ 010 |
| 分类 | TC-PM-020~023 | ✅ 020 |
| 规格组 | TC-PM-030~033 | ✅ 030 |
| 排序规则 | TC-PM-040~042 | ✅ 040 |
| 口味组 | TC-PM-050~052 | ✅ 050 |
| 做法组 | TC-PM-060~062 | ✅ 060 |
| 加料组 | TC-PM-070~072 | ✅ 070 |
| 套餐组 | TC-PM-080~082 | ✅ 080 |

---

## 侧边栏导航（跨页面）

### TC-PM-090 商品管理菜单展开
**步骤：**
1. 点击侧边栏 Product /「商品管理」

**预期：**
- 展开 9 个二级菜单：Item、Language Management、Category、Specifications、Sort order、Flavors、Preparations、Add-Ons、Combos

### TC-PM-091 侧边栏顺序导航
**步骤：**
1. 依次点击上述 9 个子菜单

**预期：**
- 每次 URL 与页面主操作区正确切换
- smoke `expectLoaded()` 全部通过

---

## 自动化覆盖映射

| 层级 | 用例范围 | 自动化 | 文档 |
|------|----------|--------|------|
| 商品 E2E | TC-IL-* / TC-PM-001~005 | ✅ 31 spec | [item-list.md](./item-list.md) |
| 子模块 Smoke | TC-PM-010~080 页面加载 | ✅ 9/9 页 | [product-management-modules.md](./product-management-modules.md) |
| 侧边栏导航 | TC-PM-090~091 | ✅ @navigation × 9 | 同上 |
| 子模块业务 | 搜索 / Add / Edit 等 | ⬜ 手工 | 待探索弹窗 DOM 后补 E2E |

> **环境说明**：Playwright 以英文 DOM 为契约。模块总 PRD 见 `docs/prd/product-management.md`，商品详案见 `docs/prd/item-management.md`。
