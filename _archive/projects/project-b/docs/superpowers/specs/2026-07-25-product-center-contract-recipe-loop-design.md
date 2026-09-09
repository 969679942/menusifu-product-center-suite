# 商品中心合同到 Recipe 增量闭环设计

## 目标

将统一合同中的稳定记录 ID 作为 Recipe 的真实来源，建立合同差异到受影响 Recipe 的增量编译、晋级门禁和质量指标。首批把核心五实体编辑/删除及统计标签两个边界场景扩展为 12 条正式 Recipe。

## 来源模型

每条 Recipe 保留一个 `traceabilityId`，用于定位统一合同中的 `trace:sop:*` 记录；`sourceIds` 保存该追溯记录引用的 route、business rule、field、control、API mapping 等稳定合同记录 ID。追溯记录是索引根，不单独作为业务真值。

来源索引必须验证：case ID 唯一、traceability 唯一、route 与 Recipe 一致、来源记录真实存在、无 `mapping-na` 作为唯一 API 证据、`stageGaps` 为空。缺失或歧义进入 unresolved。

## 增量编译

增量编译器读取 `product-center-contract-diff.json`，按 changed record ID 与 traceability source chain 精确选择 Recipe。只有无法精确匹配时才使用现有 impacted case 结果；不按同路由扩散。

输出包含合同版本、差异指纹、受影响 Recipe、未支持 case 和 unresolved。未受影响 Recipe 继续复用当前确定性合同，不重复生成。

## 核心实体扩展

能力注册表增加 material、seasoning、bom 的 open/edit/delete 能力，继续复用 `ProductCenterSopPage`。Flow 的 seed、API 验证、UI 验证和 cleanup 已支持五实体，仅放宽实体类型，不新增 locator。

生成合同包含：category、method、material、seasoning、bom 的 edit/delete，以及统计标签名称/标签组第二语言边界，共 12 条。

## 晋级门禁

晋级要求：

- Recipe 合同和治理测试通过；
- 编译结果 unresolved 为 0；
- Recipe 反馈指纹与当前合同一致；
- 12 条 UI 全部最终通过，重试只保留最终结果；
- postflight 检查点、敏感生成物和认证状态均为 0；
- 生成 Spec 无 selector、动作分支或固定等待。

满足门槛后生成正式 Recipe Spec，并在 full 套件中替换既有核心 edit/delete 与两个统计标签边界用例，正式用例总数保持 45，不重复执行。

## 质量指标

指标文件记录 45 条现有 SOP 中的 Recipe 覆盖率、来源绑定率、unresolved 数量、人工修正率、最终通过率、locator drift 数量、失败分类和总耗时。指标仅用于治理，不自动修改合同。

## 验收

- 12 条 Recipe 全部绑定真实合同记录 ID，禁止 `sop-catalog:*`。
- 差异精确命中字段边界和核心实体，不发生同路由扩散。
- 晋级门禁阻断过期反馈、失败 UI、unresolved 和安全残留。
- 正式 full 保持 46/46（45 条业务 + setup），34 路扫描命中 0。
- TypeScript、统一合同、Recipe 合同和安全门禁全部通过。

