# 商品管理 PRD（Item Management）

> **文档类型**：由测试用例反向推导的产品需求文档  
> **上级模块**：[product-management.md](./product-management.md)  
> **来源用例**：`docs/test-cases/item-list.md`（TC-IL-001 ~ TC-IL-110）  
> **验证环境**：https://cc-fe.balamxqa.com · 商户 Menusifu SCH Restaurant  
> **最后同步**：2026-05-31  
> **自动化基线**：27 项 E2E 通过（`item-list` / `item-list-advanced` / `item-create` / `item-create-standard` / `item-create-standard-form`）

---

## 1. 背景与目标

商户中心「商品管理 > 商品」模块用于品牌级商品的查询、筛选、批量维护、导入及全生命周期管理（创建、编辑、停用、复制、删除）。系统需支持三种商品类型：**标准商品**、**套餐商品**、**加料/配菜商品**，并在列表与表单中保持类型差异一致。

**产品目标：**

- 提供可搜索、可筛选的高密度商品列表，支撑日常运营检索
- 支持批量修改商品信息、价格、属性及加入菜单
- 支持 Excel/图片批量导入及导入记录追溯
- 按类型引导用户进入对应创建/编辑表单，降低配置错误

---

## 2. 术语

| 术语 | 中文 UI | 英文 UI（自动化契约） | 说明 |
|------|---------|----------------------|------|
| 标准商品 | 标准商品 | Standard / Standard Product | 可单规格、多规格或称重 |
| 套餐商品 | 套餐商品 | Combo / Combo Product | 含套餐组配置 |
| 加料/配菜 | 加料/配菜商品 | Add-On / Side Product | 无属性排序/商品属性区块 |
| 启用/停用 | 启用 / 停用 | Enabled / Disabled | 列表筛选为单选（radio） |
| 批量操作 | 批量操作(n) | Bulk Operation(n) | 未选中时 n=0 且禁用 |

---

## 3. 用户角色

| 角色 | 权限范围 |
|------|----------|
| 商户管理员 | 商品 CRUD、批量操作、导入、停用/启用 |
| 运营人员 | 列表查询、筛选、编辑商品信息（继承商户权限） |

> 本 PRD 范围限定于已登录且已选择目标商户后的商品模块行为。

---

## 4. 功能需求

### 4.1 商品列表（FR-IL-001）

**入口**：侧边栏 Product > Item，或直接访问 `/pp/brand/list`。

**页面结构：**

1. **工具栏**
   - 搜索框：按商品名称模糊/精确搜索（placeholder：商品名称 / `Item Name`）
   - 批量操作按钮：默认 `批量操作(0)` / `Bulk Operation(0)`，未选中时禁用
   - 导入记录按钮
   - 操作下拉：图片导入、商品导入
   - 新增商品按钮

2. **筛选栏**
   - 商品类型（多选 checkbox）：标准商品 / 套餐商品 / 加料/配菜（`Standard` / `Combo` / `Add-On`）
   - 商品分类（级联选择，待完整自动化）
   - 商品状态（单选 radio）：启用 / 停用（`Enabled` / `Disabled`）
   - 重置按钮：清空搜索与全部筛选，恢复全量列表

3. **数据表格**

   列顺序（中文 → 英文）：

   | # | 中文列名 | 英文列名 |
   |---|----------|----------|
   | 1 | 商品 | Item |
   | 2 | 第二语言名称 | Item(Alt.Language) |
   | 3 | 助记码 | Mnemonic Code |
   | 4 | 商品类型 | Type |
   | 5 | 商品分类 | Category |
   | 6 | 规格 | Specification |
   | 7 | 标准价($) | Price($) |
   | 8 | 口味 | Flavor |
   | 9 | 做法 | Preparation |
   | 10 | 描述标签 | Descriptions |
   | 11 | 商品角标 | Badges |
   | 12 | 统计标签 | Stats |
   | 13 | 过敏原 | Allergens |
   | 14 | 设备编码 | Device Code |
   | 15 | 商品状态 | Status |
   | 16 | 更新时间 | Action Time |
   | 17 | 操作 | Action |

4. **分页**
   - 默认 50 条/页
   - 展示总条数（如 `Total 116 items` / 「共 116 条」）
   - 支持页码切换与每页条数选择

**验收标准：**

- 页面加载后表格、分页、工具栏均可见
- 首屏展示商品数据行，类型与状态字段正确
- 商品名称可点击跳转编辑页

---

### 4.2 搜索（FR-IL-010）

| 场景 | 输入 | 预期行为 |
|------|------|----------|
| 命中 | 已有商品名（如 Pearl） | 列表仅展示匹配行；分页反映结果数量 |
| 未命中 | 不存在名称（如 `AUTO-NOT-EXIST-99999`） | 列表无数据行；展示 `No search results found` |

搜索与筛选可叠加；重置后恢复默认全量。

---

### 4.3 筛选（FR-IL-012 ~ FR-IL-016）

**类型筛选**

- 交互：展开类型下拉 → 勾选目标类型（checkbox）
- 行为：勾选后列表异步刷新，**当前页每一行 Type 列必须与所选类型一致**
- 支持 Standard / Combo / Add-On 单独或组合勾选（组合场景见 FR-IL-015，当前仅手工覆盖）

**状态筛选**

- 交互：展开状态下拉 → 点击目标状态行（radio 单选）
- 行为：列表刷新后每行 Status 列与所选状态一致

**重置**

- 前置：至少应用一项筛选（如类型 = 标准商品），记录筛选后分页总条数
- 操作：点击「重置」
- 预期：
  - 搜索框与各筛选条件清空
  - 分页总条数恢复为全量（大于筛选后数量）
  - 列表重新展示混合类型数据

**已知 UI 行为（实现约束）**

- 类型筛选项已勾选但列表未刷新时，需重新触发勾选（uncheck → check）方可生效
- 筛选等待不得将「列表行数为 0 的加载态」误判为成功

---

### 4.4 批量操作（FR-IL-020 ~ FR-IL-023）

| 状态 | 按钮 | 行为 |
|------|------|------|
| 未选中 | `Bulk Operation(0)` 禁用 | 不可展开菜单 |
| 选中 n 条 | `Bulk Operation(n)` 可用 | 文案同步选中数量 |

**批量操作菜单项（已确认）：**

1. Edit Product Info — 批量编辑商品信息
2. Modify Sales Info — 批量修改销售信息
3. Modify Price — 批量修改价格
4. Modify Attributes — 批量修改属性
5. Add to Menu — 加入菜单

> 各菜单项的具体弹窗/表单逻辑超出当前 E2E 范围，仅验证菜单可见性。

---

### 4.5 顶部操作与导入（FR-IL-030 ~ FR-IL-040）

**操作菜单**

| 菜单项 | 中文 | 目标 |
|--------|------|------|
| 图片导入 | Import Images | `/pp/brand/file-import/upload`（Image Import Result Processing） |
| 商品导入 | Product Import | `/pp/brand/create-upload`（Product Import） |

**导入记录**

- 入口：列表页「导入记录」按钮
- 目标：`/pp/brand/file-import/record`
- 页面含 Operation Type 列及历史导入任务列表

---

### 4.6 行操作（FR-IL-050 ~ FR-IL-054）

**启用状态商品**行操作菜单：

- Disable（停用）
- Copy（复制）
- Delete（删除）

**停用状态商品**行操作菜单：

- Enable（启用）
- Copy
- Delete

**删除流程**

1. 点击 Delete
2. 弹出 `Delete Confirmation` 对话框
3. 用户确认 Delete → 商品从列表移除；Cancel 取消操作
4. 删除后按名称搜索应无结果

**复制 / 停用 / 启用**：业务逻辑存在，当前以手工用例覆盖，自动化待补。

---

### 4.7 新增商品 — 类型选择（FR-IL-060）

**路径**：列表 → Add Item → `/pp/brand/create`

**页面**：标题「选择商品类型」/ `Select Product Type`

展示三张类型卡片，每张含 Create 入口：

| 卡片 | 路由 |
|------|------|
| Standard Product | `/pp/brand/create/standard` |
| Combo Product | `/pp/brand/create/combo` |
| Side Product | `/pp/brand/create/side` |

---

### 4.8 标准商品创建（FR-IL-070 ~ FR-IL-075）

**表单区块**

| 区块 | 英文锚点 | 主要内容 |
|------|----------|----------|
| 基本信息 | Basic Info | 商品名称*、第二名称、图片、分类、描述(0/500) |
| 高级设置 | Advanced Settings（可展开） | POS 名称、送厨名称、助记码、行业商品、商品编码、单位、设备编码、最小起订量 |
| 商品价格 | Price | 是否称重、单规格/多规格、标准价*、包装费、成本 |
| 商品属性 | Attribute | 属性排序规则、添加属性（Flavor/Recipe/Additives）、互斥规则 |
| 其他设置 | More Settings | 描述标签、角标、统计标签、成分信息、详情图 |

**顶部操作**：Save、Save & New

**规格模式**

| 模式 | 行为 | 列表 Specification 列 |
|------|------|-------------------------|
| 单规格 | 填写单一标准价 | 为空 |
| 多规格 | 添加规格组 → 填写各规格价 | 展示规格名（如 Regular Size(M)） |
| 称重 | Weight-based Item = Yes | 可正常保存并在列表搜索到 |

**校验（FR-IL-071）**

- 未填必填项（商品名称、标准价等）点击 Save → 停留创建页，不跳转列表

**保存成功**

- 默认 Save → 返回列表；Save & New → 保存后清空表单继续录入（手工用例 TC-IL-074）

---

### 4.9 套餐商品创建（FR-IL-080 ~ FR-IL-082）

**路径**：`/pp/brand/create/combo`

**区块**：Basic Info、Price、Attribute、More Settings

**必填逻辑**：名称、价格、至少一个套餐组（Select Custom Combo）

**保存后**：列表 Type = Combo；可进入编辑页

---

### 4.10 加料/配菜创建（FR-IL-090 ~ FR-IL-092）

**路径**：`/pp/brand/create/side`

**区块**：Basic Info、Price、More Settings（**无** Attribute / Attribute sort rule）

**保存后**：列表 Type = Add-On；支持创建后删除

---

### 4.11 商品编辑（FR-IL-055 ~ FR-IL-057）

**入口**：列表点击商品名称

| 类型 | 路由前缀 | 页面标题 |
|------|----------|----------|
| 标准 | `/pp/brand/edit/standard` | Edit Standard Product |
| 套餐 | `/pp/brand/edit/combo` | Edit Combo Product |
| 加料/配菜 | `/pp/brand/edit/side` | Edit Side Product |

**验收**：编辑页 Item Name 与创建时一致

---

## 5. 业务规则汇总

| 编号 | 规则 |
|------|------|
| BR-01 | 三种商品类型互斥，创建时选定后进入对应表单 |
| BR-02 | 列表类型筛选为多选；状态筛选为单选 |
| BR-03 | 重置清空所有筛选与搜索，分页总条数恢复全量 |
| BR-04 | 批量操作依赖行勾选，数量实时反映在按钮文案 |
| BR-05 | 启用商品不可见 Enable 菜单项；停用商品不可见 Disable |
| BR-06 | 删除需二次确认，确认后数据不可在列表检索到 |
| BR-07 | 单规格商品列表不展示规格列内容；多规格展示规格组项 |
| BR-08 | 标准商品支持称重模式；加料/配菜不支持属性区块 |

---

## 6. 页面路由一览

| 功能 | Path |
|------|------|
| 商品列表 | `/pp/brand/list` |
| 类型选择 | `/pp/brand/create` |
| 创建标准商品 | `/pp/brand/create/standard` |
| 创建套餐 | `/pp/brand/create/combo` |
| 创建加料/配菜 | `/pp/brand/create/side` |
| 编辑标准商品 | `/pp/brand/edit/standard` |
| 编辑套餐 | `/pp/brand/edit/combo` |
| 编辑加料/配菜 | `/pp/brand/edit/side` |
| 导入记录 | `/pp/brand/file-import/record` |
| 图片导入 | `/pp/brand/file-import/upload` |
| 商品导入 | `/pp/brand/create-upload` |

---

## 7. 非功能需求

| 编号 | 要求 |
|------|------|
| NFR-01 | 筛选/搜索响应后列表应在合理时间内刷新（E2E 等待上限 15s） |
| NFR-02 | 中英文 UI 语义一致；自动化以英文 DOM 为契约 |
| NFR-03 | 测试数据使用 `AUTO-{type}-{timestamp}` 前缀隔离 |
| NFR-04 | OAuth 登录态与商户上下文在页面刷新后保持 |

---

## 8. 范围外 / 待补充

以下能力在用例中已定义，尚未纳入 E2E 自动化：

- 商品分类筛选（TC-IL-013）
- 组合筛选（TC-IL-015）
- 分页切换详细验证（TC-IL-003）
- 停用 / 启用 / 复制行操作（TC-IL-051 ~ TC-IL-053）
- 保存并新建（TC-IL-074）
- 批量操作各菜单项的后续表单流程
- 导入上传完成态与失败重试

---

## 9. 需求追溯矩阵

| PRD 章节 | 用例编号 | E2E Spec |
|----------|----------|----------|
| FR-IL-001 | TC-IL-001 | `item-list.spec.ts` |
| FR-IL-010 | TC-IL-010, TC-IL-011 | `item-list.spec.ts`, `item-list-advanced.spec.ts` |
| FR-IL-012 | TC-IL-012 | `item-list-advanced.spec.ts` |
| FR-IL-014 | TC-IL-014 | `item-list-advanced.spec.ts` |
| FR-IL-016 | TC-IL-016 | `item-list-advanced.spec.ts` |
| FR-IL-020~023 | TC-IL-020, TC-IL-021, TC-IL-023 | `item-list.spec.ts`, `item-list-advanced.spec.ts` |
| FR-IL-030~032 | TC-IL-030~032 | `item-list.spec.ts`, `item-list-advanced.spec.ts` |
| FR-IL-040 | TC-IL-040 | `item-list-advanced.spec.ts` |
| FR-IL-050, FR-IL-054 | TC-IL-050, TC-IL-054 | `item-list.spec.ts`, `item-list-advanced.spec.ts` |
| FR-IL-060~063 | TC-IL-060~063 | `item-list.spec.ts` |
| FR-IL-070~075 | TC-IL-070~075 | `item-create-standard-form.spec.ts`, `item-create-standard.spec.ts`, `item-list-advanced.spec.ts` |
| FR-IL-080~082 | TC-IL-080~082 | `item-create.spec.ts` |
| FR-IL-090~092 | TC-IL-090~092 | `item-create.spec.ts`, `item-list-advanced.spec.ts` |
| FR-IL-055~057 | TC-IL-055~057 | `item-create.spec.ts` |

---

## 10. 修订记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-05-31 | 1.0 | 由 TC-IL 测试用例及 27 项 E2E 反向生成首版 PRD |
