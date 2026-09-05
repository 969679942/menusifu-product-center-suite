# Test Automation Platform Instructions

## Authority And Scope

- This file governs cross-plan and cross-system public workflow behavior. It must not contain a project's pages, APIs, business rules, test plans, product data, or default project-output paths.
- `FINAL-GOAL.md` remains the target and acceptance authority; this file defines the public implementation contracts used to reach it. Project adapters provide routes, fields, business operations, assertions, data, cleanup, and project output roots.
- A project may refine public contracts only through an adapter contract and must not copy the public state machine, report arbiter, or batch gate.

## Optimization Analysis First

- 任何流程、报告、用例、脚本或平台优化任务，必须先分析优化可行性、影响点、实施影响和成熟可用性，再决定是否执行；不得把未获明确要求的具体优化方案直接落地。
- 设计或实现代码时必须保持简洁、完整、不遗漏现有功能，并明确区分公共平台能力与项目适配能力。
- 用户仅要求将规则写入 `AGENTS.md` 时，只更新规范，不擅自修改实现、不重跑业务用例；如需实施优化，必须另行说明目的、预期结果、后续影响和验收标准。

## Recommendation And Change Impact

- Every recommendation must be labeled `必须`、`可选` or `暂不建议` and state `目的`、`预期结果`、`后续影响`.
- The impact statement must say whether existing passed cases are rerun, invalidated, or unchanged; documentation-only and report-only validation must not trigger business reruns.
- A workflow change is complete only when the public contract, an adapter contract, and a system-neutral negative contract test prove it. A domain-only workaround remains incomplete and must register the missing public capability.

## Human Intervention Boundary

- 仅已由当前 UI/API 稳定行为、正式业务来源冲突或来源/适用性缺失证明的业务偏差，才允许进入人工处理；不得把自动化代码、适配器、选择集、指纹、收据、报告、证据协调、环境诊断、清理、重试、合同测试、迁移审计或平台门禁问题转交人工。
- 非业务偏差必须由执行代理在影响可控的前提下自动完成诊断、修复、定向验证、遗漏检查和结果登记。能够通过现有配置、项目适配器、只读扫描或当前授权安全发现的信息，不得再次要求用户提供或重复确认。
- 人工业务裁决必须提供可直接执行的详细步骤，并逐项写明：`责任角色`、`待确认对象`、`现有正式来源`、`当前实际行为`、`冲突或缺口`、`互斥决策选项`、`需要提交的最小材料`、`裁决记录位置`、`裁决后的自动动作`、`验收标准`、`对已有通过用例的影响`。禁止只写“请人工确认”。
- 缺少外部系统账号、密钥、租户权限或不可由当前授权推导的目标系统时，应先穷尽安全的自动发现与可用性检查，再登记为 `external-authorization-blocked`。该状态是外部授权前置条件，不得伪装成业务偏差或技术问题，也不得要求人工执行本可自动化的测试步骤。
- 收到人工业务裁决或必要外部授权后，后续规则更新、实现修改、定向重验、证据生成、残留清理、回归门禁和闭环审计均由执行代理自动完成；除非出现新的业务冲突，不得要求用户重复同一规则或再次参与技术处理。

## Public Receipt And Report Contract

- The compiler must preserve source, case, context, assertion, operation, cleanup, and evidence traceability. A passed formal case requires a current receipt matching `caseId`, case fingerprint, implementation fingerprint, execution context, and every declared assertion surface.
- Every declared business operation must have exactly one executable operation receipt, or an explicit terminal failure/interruption receipt. `observed: true` self-reports, aggregate counts, screenshots, and shared file paths cannot authorize a pass.
- Every assertion receipt must show the expected value, actual value, observation channel, verification authority, comparison result, and final status. If actual data is unavailable, record the reason and mark evidence incomplete.
- Allure `Test body` must use a stable Chinese business hierarchy: case identity, preconditions, business operations, reads/synchronization, assertions, cleanup, and failure diagnostics. Do not emit raw Playwright names, selectors, unresolved placeholders, decorative waits, or duplicate context checks.
- Evidence must bind to the exact operation, assertion, cleanup, evidence, or failure-diagnostic step that created it. Failure screenshots and traces attach to the deepest failed business/assertion step, or to an explicit failure-diagnostic step when no such target exists.
- Failure diagnostics must include a Chinese human-readable conclusion, normalized category, phase, expected/actual observation, timeout or locator/authentication indicators, technical error details, and retained evidence. A technical stack alone is insufficient.

## State And Arbitration Contract

- Keep `formalDisposition`, `executionStatus`, `evidenceStatus`, `applicabilityStatus`, `changeObservation`, `reuseStatus`, `verificationStatus`, and `actionRequired` independent; never derive current status from an index or raw Allure `status` string.
- `completed-with-findings` means the selected execution set completed with failures or evidence gaps; `blocked` means execution was prevented or incomplete. Product failure requires stable current UI/API behavior proving the expected result is false.
- A binding, generated script, historical result, repair queue, and standard receipt are separate facts. Code, adapter, case, context, or observed-product changes invalidate reuse until a current standard receipt is accepted.

## Project Isolation And Platform Readiness

- Public readiness uses a system-neutral reference baseline and proves `planned = executionEligible + classifiedExclusions`, `executionEligible = executed`, and `executed = passed + failed`.
- Formal platform review requires a real target-system pilot with a different `applicationId`; same-application cross-domain evidence proves reuse, not cross-system portability.
- Project readiness, execution ledgers, review queues, release decisions, migration reports, and business evidence are written to the adapter-declared project output root. The public platform must reject `..` traversal and must not default outputs into its own directory.
- Platform universal completion and project delivery are separate verdicts. Missing cross-application validation keeps the platform incomplete but must not downgrade a project whose own source, binding, execution, evidence, cleanup, and index gates pass.

## Batch Remediation And Full Regression

- 每次增量整改或定向复核执行必须先构造公共 `execution intent`，同时固化目标范围、完整分区、实际选择集、执行路由、范围指纹和选择集指纹；公共 runner 必须在认证、造数和浏览器启动前校验这些集合，缺分区、漏路由、单模块退化或旧意图复用必须硬阻断。
- 每个检查点必须保存意图指纹、选择集指纹、已达终态用例和未完成用例；缺少元数据、指纹不匹配或选择集变化时不得恢复旧模块结果。最终状态必须由公共完成合同校验，只有 `selectedCaseIds = terminalCaseIds` 才能标记 `completed` 或 `completed-with-findings`。
- 项目适配器只声明模块分区和路由映射；不得在项目 runner 内用固定模块列表替代公共意图合同，也不得以汇总通过数、历史收据或报告文件存在代替用例终态收据。
- 公共运行流程必须明确区分 `incremental/repair` 与 `full-regression`；不得用一个模式同时表达整改放量和业务全量回归。
- `incremental/repair` 必须先通过静态合同和显式影响集计划；完整当前收据可直接复用，未复用的业务影响用例定向执行，`unknown-impact` 只允许在数量与比例上限内作为 sentinel。不得按结构分组自动生成金样本，也不得把静态复核结果伪装成批量业务执行。
- `full-regression` 用于获取当前执行候选的完整真实结果，不要求优化计划，不消费 `canary/batch` 结果；单条失败不得停止后续独立批次，完成后统一分类分析。
- 增量整改必须先消费公共 revalidation decision：当前用例指纹、业务实现指纹和完整标准收据匹配才允许 `reuse`；report-only/platform-only 变化不得使业务收据失效；unknown-impact 只能进入受数量和比例上限约束的 sentinel，超限必须在认证、造数和浏览器启动前阻断。
- 公共 runner 启动前必须对账计划选择集与实际 runner 选择集；任何 missing/unexpected 漂移都必须阻断并记录 selection-drift。整改会话、逐案决策、阶段耗时、重试/失败操作和可避免重复执行必须追加写入脱敏遥测账本，不能用汇总通过数替代。
- 两种模式的参数必须互斥；全量回归携带优化计划或阶段参数、增量整改伪装成全量回归时，必须在认证、造数和浏览器启动前失败。
- 每个执行批次必须保存检查点和标准收据；恢复时只复用当前执行指纹、当前选择集下已有完整收据的批次，未完成批次从首个未完成单元继续，指纹或选择集变化时拒绝复用。
- 执行完成事实、用例失败事实和通过资格必须分开记录。选中用例全部执行但存在失败或证据缺口时，流程状态为 `completed-with-findings`；执行前阻断或未完成执行才是 `blocked`。
- 公共层负责模式状态机、门禁、检查点、失败分类和批次编排；项目适配器只提供用例依赖、上下文、业务操作、断言、清理和项目字段映射，不得复制公共状态机。
- 变更完成前必须通过系统无关的模式分流、失败后继续、检查点恢复和错误混用阻断合同测试；不得通过重跑业务全量代替流程验证。

## Validation Boundary

- Report-only and workflow-contract validation must use synthetic or isolated result directories. Do not rerun domain business cases merely to validate reporter formatting, receipt binding, state arbitration, or batch control.
- `npm run verify:system-test-platform` is the final public-platform gate. A nonzero `FINAL_GOAL_NOT_MET` must remain explicitly incomplete and must not be relabeled as a module business failure.
