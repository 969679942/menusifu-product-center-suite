# 商品中心统一质量流程

## 就绪状态

- `automationPlatformReady` 表示 Recipe、运行验收、安全、页面合同、漂移实验和失败分类技术门禁是否通过。
- `testGenerationProductReady` 表示独立生成评测通过，且 blocked source、Markdown 诊断和 legacy Claim 已清零。
- 平台可以技术就绪而生成产品仍有活动待办，负责人摘要必须同时展示两者。

## 生成评测

生产候选仍形成 Generation V1 发布物。评测使用不参与发布的 `product-center-generation-holdout.ts`，其期望决策来自人工标注，实际决策来自生成器真实输出。发布候选与 Holdout caseId 必须不相交，false promotion 和 false rejection 由两组决策计算，不允许固定赋值。

## 流水线顺序

1. 安全前置检查。
2. 构建 Recipe、Generation V1 与 Intake V1。
3. 执行 TypeScript、合同和 Recipe 合同测试。
4. live/full 模式先执行当前版本轻量 Probe 与页面 Diff。
5. full 模式再执行主集合、Gold 和已审批技术绑定 UI。
6. 使用同一 pipeline runId 的页面 Diff 和运行证据构建失败分析。
7. 构建质量程序并分别计算两类就绪状态。

## 漂移闭环

漂移流程固定为 `probe -> diff -> proposal -> approval -> apply-technical-repair -> impacted -> full -> baseline`。技术修复应用必须登记同 proposal 指纹、变更文件及 before/after SHA-256，并验证当前文件命中 after 哈希。clean diff 明确 no-op 成功；来源、Claim 或运行验收阻断不得通过技术审批绕过。

## 运行反向精化

运行通过只生成 `provisional` 执行配方精化候选，不直接覆盖正式业务用例、业务规则或测试意图。候选必须同时命中当前绑定指纹、用例级执行指纹和执行上下文指纹，具备逐 Claim 断言收据、可审计 Playwright 步骤轨迹；发布身份若可采集则用于变化与复用判断，不作为本次运行通过的硬条件。写用例还必须提供 API/UI 零残留证据。允许精化的范围仅包括页面路由、能力调用、数据与清理配置、断言落点和实际操作轨迹，正式业务语义仍须由批准来源或人工评审变更。

## 失败证据

存在失败时，环境与测试数据结论只从对应反馈与 evidence 的同一 runId 推导，并同时核对环境/应用指纹、API evidence、seed/cleanup 阶段和零残留。没有失败时状态为 `not-applicable`，不复用历史成功结论，也不伪造失败验证。

## 观测优先级与超时分类

1. 用户可见行为以 UI 断言为主；API 只作为持久化、结构完整性和异步同步的辅助证据。用例同时要求 UI 与 API 时，必须分别形成断言收据，不得用 API 查询替代 UI 结果。
2. 所有异步等待必须记录观测通道、操作标识、用例 ID、等待类型和最后观测值。探测请求没有返回使用 `WAIT_UNTIL_PROBE_TIMEOUT`；请求已返回但条件未满足使用 `WAIT_UNTIL_CONDITION_TIMEOUT`。
3. 只有 UI/API 均进入稳定终态且实际值与预期值不一致时，才允许形成产品行为偏差。超时、网络异常、接口未返回、字段不可观测或定位失败不得改写为“未同步”“保存失败”等业务结论。
4. UI 已验证通过而 API 辅助查询超时时，结果归类为技术观测阻断并保留 UI 证据，不得判定产品失败。UI 未通过时，必须结合 API 或审计数据核对持久化状态后再分类。
5. 失败分析、人工审核和用例更新只能消费结构化运行证据，禁止从异常堆栈或概括性错误文案反推业务规则、精确提示或产品缺陷。

## 实战批次强制门禁

1. 每条用例必须通过 `caseId -> ruleId -> dataProfile` 唯一绑定进入批次，发布指纹、运行就绪状态、规则候选状态和造数/清理适配器必须在启动浏览器前校验。
2. 静态预检区分 `automation-gap`、`environment-failure` 和 `external-dependency`；在线预检只允许执行只读 API 探针，任一预检阻断时不得进入业务写操作。
3. 每个预期必须由标题显式包含对应 `claimId` 的独立 Playwright `expect` 步骤生成收据；整体测试通过、无关断言或按顺序猜测均不能替代预期收据。
4. 写入用例必须在运行证据中同时提供 API 和 UI 零残留，`ui-verification-unavailable` 不等于零残留；任一证据缺失时即使 Playwright 通过也应返回失败。
5. 进度同时写最新 JSON 和完整 JSONL。无进展、连续失败、重复诊断指纹、环境故障率超阈值或批次超时会终止子进程，非幂等写操作不得自动重试。
6. 最终报告必须分别统计 `product-failure`、`automation-gap`、`environment-failure`、`external-dependency`，并执行敏感信息与未完成检查点扫描。
7. 测试运行证据只能推动候选规则进入 `ready-for-human-review`；`provisional -> formal` 仍要求批准来源、满足正式评审策略并记录人工决策。

## 严格重验证迁移

商品模块必须先生成唯一迁移台账，再生成批次计划，禁止根据历史报告手工推算剩余数量：

```powershell
npm run build:product-center:item-migration-ledger
npm run build:product-center:item-strict-batch-plan
npm run test:product-center:item:migration
```

台账将 `strict-passed`、`product-finding`、`legacy-passed`、`deferred`、`not-applicable` 和 `supplemental-reviewed` 分开；历史运行通过不等于严格证据通过。具备运行证据且 API/UI 零残留的产品偏差进入 `product-finding`，保留待规则决策但不重复自动重跑；没有完整清理证据的产品分类仍留在 `legacy-passed` 队列。严格重验证入口按批次落盘调度状态：业务失败或自动化缺口只记录为 `completed-with-findings` 并继续独立批次；认证、静态预检、熔断或缺少运行报告才停止后续批次：

```powershell
npm run test:product-center:item-strict-revalidation
```

调度器和每批运行报告必须同时存在，只有单条用例逐 Claim、API/UI 零残留证据完整时，才可将用例迁移为严格通过；批次整体因其他用例失败时，不得抹掉其中独立通过的用例证据。
