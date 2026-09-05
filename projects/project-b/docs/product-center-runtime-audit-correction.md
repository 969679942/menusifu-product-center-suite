# 测试方案运行时审计校正流程

## 目标

所有测试方案在生成用例、技术绑定和自动化 Recipe 前，必须先消费本方案作用域内的运行时审计证据。审计不只校验中文提示，还覆盖路由、页面模式、控件和字段状态、类型切换、弹窗、API 操作、写请求、UI/API 终态、角色、环境和应用版本。默认由 AI 按预授权策略自动裁决并落地，只有证据或规则异常才转人工处理。

## 强制顺序

1. 将截图、视频、DOM、网络和 API 查询结果放入本方案专属 `evidenceDiscovery.rootPaths`。
2. 为目录内每个证据登记 SHA-256、观测时间、应用版本、环境、角色、语言和处置状态。
3. 所有证据必须是 `consumed`、`not-applicable`、`stale`、`conflict` 或 `review-required`；未登记文件直接阻断。
4. 从证据建立 route/control/field/dialog/validation/api-operation/state 覆盖分母。
5. AI 对受影响用例给出 `no-change/correct-case/add-case/delete-case/split-case/merge-cases/block-case` 决策，并记录决策引擎、策略 ID、时间和理由。
6. 业务规则、技术绑定或覆盖发生变化时，必须分别提供 `businessRuleChanges`、`technicalBindingChanges`、`coverageChanges`。
7. 每条 assertion 同时声明机器可比对的 `expectedValue` 和正式用例中的 `text`；两者任一不匹配都阻断。
8. 校正器同步用例文本、来源、Claim 运行时证据、路由、capability、断言适配器、验证信号和覆盖 ID。
9. 最终报告必须列出证据消费、用例增删改、业务规则更新、技术绑定更新、覆盖变化和未解决冲突。

## V2 门禁

- `planFingerprint` 和每条 `reviewedCaseFingerprint` 防止旧审核结论套用到新方案。
- 证据路径必须位于项目根目录内，文件必须存在且 SHA-256 一致。
- 证据超过 `maxEvidenceAgeDays`、执行环境/角色/语言/路由不一致，或已观测到影响性发布、配置、功能开关变化时阻断或触发重验；发布身份不可用本身不阻断本次完整执行通过。
- `stale/conflict/review-required` 证据不能用于正式生成。
- `required` 覆盖项必须关联校正后的有效用例；删除旧覆盖时必须写明原因。
- 运行时事实与正式 PRD 冲突时标记 `impacts.*=conflict`，不得自动把产品缺陷改写成业务规则。

## 自动裁决

- `autoApprovalPolicy` 是一次性预授权策略，明确允许的用例动作、业务规则/技术绑定/覆盖变化、最少消费证据数和写请求安全要求。
- 满足策略的校正使用 `status=auto-confirmed-runtime` 和 `automatedDecision`，不再要求逐条填写人工审核人。
- 自动裁决必须同时通过方案与用例指纹、证据哈希和时效、环境/角色/语言/路由、逐字提示、断言事实、覆盖闭环和策略权限校验；发布身份若可用则用于复用和变更判断，不作为本次执行通过的必填条件。
- 已发送写请求时，必须存在带 `operationKey` 的写操作收据；成功落库还必须提供 API/UI 双端零残留清理证明，失败未落库则必须证明 UI/API 均查询不到。
- 策略未授权、证据不足或未登记、来源冲突、指纹漂移、危险写入证据不完整、`block-case` 等情况自动返回 `RUNTIME_AUDIT_AUTO_APPROVAL_DENIED`，进入人工异常队列。
- `human-confirmed-runtime` 仅保留给异常裁决和历史合同；运行时用例自动校正不等于自动晋级跨版本 formal 业务规则。

## 命令

```powershell
npm run reconcile:test-plan:runtime-audit -- --cases <方案.json> --audit <V2审计合同.json> --root <项目根目录> --output <校正后方案.json>
```

商品中心生成和输入入口默认读取各自的 V2 严格合同，也可显式指定：

```powershell
npm run build:product-center:test-plan-generation-v1 -- --runtime-audit=<V2审计合同.json>
npm run build:product-center:test-plan-intake-v1 -- --runtime-audit <V2审计合同.json>
```

标准 `system-test-plan` 可直接嵌入 `runtimeAudit`，编译器在 Recipe、候选规则和绑定生成前执行同一门禁。

## 兼容边界

`schemaVersion=1.0.0` 仅用于已有历史合同兼容，不具备证据目录发现、文件哈希、方案指纹、覆盖分母和多类增删改强门禁。所有新增测试方案必须使用 `2.0.0`。
