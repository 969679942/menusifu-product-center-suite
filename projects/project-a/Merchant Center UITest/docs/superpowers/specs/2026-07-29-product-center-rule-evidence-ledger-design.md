# 商品中心多源 Claim 证据与旧规则降级设计

> 2026-07-29 复核结论：`Merchant Center Info/商品中心业务规则.md` 是旧 AIQA 汇总基线，不是当前正式规则权威源。下文所有该文件引用均按 `legacy-rule-baseline` 处理，不能放行或否决 acceptance。

## 目标

以测试方案/XMind 为场景骨架，把每个前置、动作和预期拆成独立 Claim；从这些 Claim 生成候选业务规则，并用当前版本 UI/API 运行事实逐步验证。候选规则不得因一次自动化通过而自动成为正式业务规则。

## 存储边界

正式规则和候选规则使用同一数据模型，但不在同一个可编辑源文件中维护：

- `Merchant Center Info/商品中心业务规则.md`：旧规则线索，生成器只读，不自动修改。
- `contracts/product-center/business-rules/product-center-item-legacy-rule-baseline.json`：旧规则的精确章节、原文和指纹绑定，只用于差异提示。
- `contracts/product-center/business-rules/product-center-item-formal-rule-bindings.json`：当前正式规则绑定；没有正式来源时必须为空。
- `contracts/product-center/business-rules/product-center-item-candidate-rules.json`：由测试方案 Claim 推导的候选规则账本。
- `contracts/product-center/business-rules/generated/product-center-item-rule-registry.json`：统一只读视图，由构建脚本生成，禁止人工维护。
- `output/test-case-audit/product-center/item-rule-review-latest.json`：规则冲突、执行通道、验证覆盖和晋级建议报告。

这样既能统一查询，又不会通过编辑一个 `status` 字段把候选规则误改为正式规则。

## 规则模型

每条规则包含稳定 ID、条件、动作、结果、作用范围、来源 Claim、来源文件、当前状态、冲突关系、验证矩阵和执行通道。

状态集合：

- `formal`：有精确正式来源或人工批准。
- `legacy`：旧 AIQA 汇总线索；不可执行，不可形成业务断言。
- `provisional`：由测试方案明确场景推导，尚无充分运行证据。
- `observed`：至少一组完整 UI/API 运行证据支持。
- `supported`：正向、反向及规则要求的边界/作用域验证通过，且无开放冲突。
- `conflict`：测试方案、正式规则或当前行为相互矛盾。
- `blocked`：缺少可执行前置、精确来源或必要证据。
- `obsolete`：已被其他规则取代。

`observed` 和 `supported` 都不是 `formal`。自动化只能生成晋级建议，正式晋级必须具有人工批准记录和正式来源引用。

## Claim 绑定

canonical 用例仍是功能测试和自动化共同使用的唯一业务用例。每个 Claim 分别保存：

- 测试方案来源 ID。
- 候选规则 ID。
- 已对齐的正式规则绑定 ID。
- 运行证据 ID。

自动化绑定只引用 canonical ID、Claim ID、规则 ID、capability 和 assertion adapter，不复制标题、步骤或预期。所有 UI Recipe 第一项 capability 仍必须是 `navigation.sidebar.open`。

## 双执行通道

- `acceptance`：只允许无开放冲突的正式规则进入。失败可以进入产品失败判定。
- `probe`：用于 `provisional`、`observed`、`supported` 候选规则。结果只更新证据与冲突，不直接判定产品失败。
- `none`：`legacy`、`conflict`、`blocked`、`obsolete` 或证据/清理合同不完整时禁止执行。

同一 canonical 用例只保留一份内容；正向、反向、边界和作用域变体作为规则验证矩阵附着，不复制成多份业务用例。

## 运行证据与晋级

每条运行证据记录规则 ID、版本指纹、环境、角色、数据变体、验证维度、支持/反驳结果、UI/API 证据引用和清理状态。不得记录密码、令牌、Cookie、授权头或浏览器存储状态。

自动晋级上限为 `supported`：

1. 一次完整、无残留的运行可以把 `provisional` 建议为 `observed`。
2. 正向、反向及规则声明所需的边界/作用域均有独立数据支持，且没有反例时，可以建议为 `supported`。
3. 任一可靠反例或正式来源冲突都进入 `conflict`。
4. 只有人工批准和精确正式来源均存在时，才允许建议为 `formal`。

重复相同数据只能增加稳定性证据，不能替代不同条件的验证覆盖。

## 首个实施范围

本轮只处理商品 XMind canonical 的 9 条候选用例：建立来源角色、旧规则基线、候选规则、统一 registry、Claim 证据引用、覆盖分母与静态晋级门禁。4 条与旧规则不一致的场景仅标记 `legacy-discrepancy/review-required`，仍可进入 Probe；39 条原始不完整节点继续分为可复核结构缺口和 blocked。

本轮不修改正式业务规则原文、不自动分配优先级、不根据现有自动化代码反推规则、不运行冲突用例的真实写操作，也不迁移或删除旧正式/自动化用例。

## 验收标准

- 正式规则正文和候选规则物理分离，统一 registry 可完整查询。
- 9 条 canonical 用例的所有 Claim 都绑定测试方案来源和候选规则。
- 旧规则精确引用只进入 legacy registry；当前正式绑定为 0，旧规则原文和章节校验失败时构建失败。
- `formal` 只能进入 acceptance；未正式晋级规则只能进入 probe；冲突和阻塞规则不能执行。
- 自动化运行成功不能直接产生 `formal` 状态。
- 产物通过敏感扫描，所有 UI binding 第一 capability 为 `navigation.sidebar.open`。
- 定向合同、TypeScript、商品中心完整合同和 `git diff --check` 通过。
