# 商品中心 Recipe 编译器设计

## 目标

把已有测试用例、SOP 描述符、UI 审计证据、API 合同和已确认业务规则编译成机器可执行 Recipe，再由通用 Flow 调用 Page 能力执行。首批迁移商品分类编辑/删除、做法组编辑/删除和统计标签第二语言边界场景，不替换现有 45 条正式 SOP。

## 分层边界

- Recipe 是执行合同，只保存路由、数据绑定、能力 ID、网络预期、断言、清理和来源，不保存 CSS/XPath/Playwright locator。
- Flow 解释 Recipe，按 `API Seed -> UI Action -> API Verify -> UI Verify -> API Cleanup` 执行并管理运行上下文。
- Page 是唯一 DOM 合同所有者，能力适配器只把稳定 capability ID 映射到已有 Page 方法。
- Compiler 从已验证输入生成 Recipe；无法唯一映射能力、数据或网络操作时写入 unresolved，不推测实现。

## Recipe 合同

每条 Recipe 包含稳定 `id`、`caseId`、中文标题、路由、动作、来源、生成许可、可选 seed、能力步骤、可选 mutation、断言和可选 cleanup。值通过 `$record.*`、`$case.*` 等显式绑定引用运行上下文。

校验器必须拒绝：空来源、未知能力、动作不匹配、缺少必填输入、无效值绑定、重复能力、原始 selector 字段、编辑/删除缺 mutation、写场景缺 seed/cleanup、边界场景包含 mutation。稳定指纹不受对象键顺序影响。

## 能力注册表

能力元数据包括 ID、适用动作、必填输入和执行器。首批能力：

- `category.open`、`category.editIdentity`、`category.deleteIdentity`
- `method.open`、`method.editIdentity`、`method.deleteIdentity`
- `statisticTag.openCreateDialog`、`statisticTag.readSecondLanguageBoundary`、`statisticTag.closeCreateDialog`

适配器复用现有 Page 方法，不复制 locator。做法组二次确认由 Page 的真实 DOM 操作封装负责，Recipe 只表达业务能力。

## 编译与未决分流

编译器只接受白名单映射表和现有目录定义。输入经过标准化后生成候选 Recipe，再通过注册表和合同校验。通过项写入 pilot recipes；失败项写入 unresolved，包含 case ID、来源和结构化 reason code，不包含凭据、页面存储或响应体。

## 执行与清理

通用 Flow 为每条 Recipe 建立上下文。写场景先 API seed 并立即登记清理，逐步解析值绑定并执行能力，等待声明的 mutation 响应，再调用 API/UI 断言。cleanup 始终由 fixture `finally` 执行；删除场景不盲目重放，API 验证目标不存在后，cleanup 只清理仍存在的数据。

边界场景不产生 mutation，不需要 seed/cleanup，只读取输入在 50/51 或 10/11 字符下的 UI 状态。

## 生成物与反馈闭环

- `contracts/product-center/recipes/product-center-pilot-recipes.json`：可执行合同。
- `contracts/product-center/recipes/product-center-recipe-unresolved.json`：禁止生成项。
- `tests/generated/product-center-recipe-pilot.generated.spec.ts`：薄 Spec，只参数化调用通用 Flow。
- `output/recipes/product-center-pilot-feedback.json`：按 Recipe/能力记录脱敏执行结果和失败分类。

反馈不得自动修改 Page locator 或业务规则；能力漂移、规则冲突和网络不一致回到 unresolved，审核后再重新编译。

## 验收标准

- Recipe 合同、注册表、编译器、执行器均有先失败后通过的合同测试。
- 试点 Recipe 无 selector，全部有来源，未决项可解释且不被生成。
- 生成薄 Spec 覆盖商品分类编辑/删除、做法组编辑/删除、统计标签第二语言边界。
- 试点 UI 通过，API/UI 终态一致，零残留、零未完成检查点、零认证状态和零敏感生成物。
- 现有 46 条正式 UI、合同套件与 34 路残留扫描不回归。

