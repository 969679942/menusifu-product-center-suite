# Merchant Center Workspace Instructions

## Rule Ownership

- For every task involving test plans, audits, test cases, automation, execution, evidence, indexes, blockers, or product defects, first read `D:\Menusifu\Merchant Center\Merchant Center Info\00-待转换测试方案\FINAL-GOAL.md` and the test-asset entry documents required below.
- `FINAL-GOAL.md` is the persistent target and acceptance authority. `D:\Menusifu\Test Automation Platform\AGENTS.md` is the authority for public analysis, execution, receipt, report, state, and platform-isolation contracts.
- This file governs Merchant Center project policy: source assets, adapter inputs, project routing, project indexes, and project-level execution safety. It must not copy the public platform state machine or report arbiter.
- When a task changes public workflow behavior, also read the public platform `AGENTS.md`; when it changes UI implementation, read the nested `Merchant Center UITest\AGENTS.md`. A nested UI rule may refine implementation details but may not weaken the final goal or public receipt contract.
- Every proposed or implemented change must identify `public-core`, `project-adapter`, `domain-asset`, or `generated-evidence` scope and must state whether existing results are rerun, invalidated, or unchanged.
- Cross-plan and cross-system reuse remains the default acceptance target. Never claim platform completion from a Merchant Center-only result; missing cross-application validation keeps the platform incomplete without blocking a separately closed Merchant Center module.
- Never invent fields, controls, prompts, APIs, or business rules absent from source, audit, or runtime evidence. Human confirmation resolves ambiguity but never replaces execution evidence.

## Recommendation Decision Contract

- Follow the public recommendation contract in `D:\Menusifu\Test Automation Platform\AGENTS.md` and the persistent target in `D:\Menusifu\Merchant Center\Merchant Center Info\00-待转换测试方案\FINAL-GOAL.md`.
- Merchant Center recommendations must be labeled `必须`、`可选` or `暂不建议`, and must state `目的`、`预期结果`、`后续影响`, including whether existing passed cases are rerun, invalidated, or unchanged.
- Prefer the smallest project action that produces the stated result. After execution, compare the actual result with the expected result and record unexpected impact; do not treat optional platform maturity work as a Merchant Center delivery blocker.

## Optimization Analysis First

- 任何 Merchant Center 流程、报告、用例或脚本优化，必须先分析可行性、影响点、实施影响和成熟可用性，再决定执行；公共流程合同遵循 `D:\Menusifu\Test Automation Platform\AGENTS.md`，不在本项目复制。
- 设计或实现代码时必须保持简洁、完整、不遗漏现有功能，并明确区分公共平台能力与项目适配能力。
- 用户仅要求更新规范时，只更新规范，不擅自修改实现或重跑业务用例；如需实施优化，必须明确目的、预期结果、后续影响和验收标准。

## System Test Adapter Requirements

- Merchant Center 适配器必须为每条用例提供基于真实依赖的 `groupKey`、当前用例指纹和实现指纹；不得按标题、经验或批次名称猜测分组。
- 适配器只负责商品中心的路由、页面、API、业务操作、断言、数据和清理映射；公共执行模式、批次门禁、失败分类和检查点统一由 `D:\Menusifu\Test Automation Platform` 提供。
- 商品中心的 `run`、`flow` 和批量命令必须透传公共模式合同；不得在 UItest 项目内重新实现 canary、batch 或 full-regression 状态机。
- 适配器合同只能证明商品中心接入正确，不能替代公共平台的系统无关合同测试或不同 `applicationId` 的跨系统试点。

## Test Asset Discovery

For every task involving test plans, test cases, audits, automation bindings, execution results, blockers, or product defects, inspect these persistent workspace assets before proposing changes or running tests:

1. `D:\Menusifu\Merchant Center\Merchant Center Info\00-待转换测试方案\README.md`
2. `D:\Menusifu\Merchant Center\Merchant Center Info\00-待转换测试方案\用例库\`
3. `D:\Menusifu\Merchant Center\Merchant Center Info\00-待转换测试方案\已完成\index.json`
4. `D:\Menusifu\Merchant Center\Merchant Center Info\00-待转换测试方案\未落地\index.json`
5. `D:\Menusifu\Merchant Center\Merchant Center Info\00-待转换测试方案\待处理\README.md`

Do not rely on conversation memory for test asset locations or case counts. Reconcile counts from the canonical files and generated indexes.

## Group Case Routing

For `商品中心-商品管理-组`, always use the following persistent handling paths:

- Product behavior conflicts requiring product confirmation or development fixes:
  `D:\Menusifu\Merchant Center\Merchant Center Info\00-待转换测试方案\待处理\商品中心-商品管理-组\产品偏差\`
- Cases explicitly deferred or skipped because required industry-product, C-side, POS, or terminal capabilities are unavailable:
  `D:\Menusifu\Merchant Center\Merchant Center Info\00-待转换测试方案\待处理\商品中心-商品管理-组\明确延期\`
- Canonical test case source:
  `D:\Menusifu\Merchant Center\Merchant Center Info\00-待转换测试方案\用例库\商品中心-商品管理-组\2.商品中心-商品管理-组-正式测试用例.md`

Before updating group case status, read both routing indexes:

- `产品偏差\index.md`
- `明确延期\index.md`

Keep the two categories separate. A deferred case is not passed, failed, deleted, or a product defect. A product defect must not be changed to passed without product correction or a confirmed business-rule update followed by rerun evidence.

## Execution Safety

- 平台级跨系统验证（尤其是不同 `applicationId` 的真实试点）一律由金将军明确启动；助手不得因推荐、门禁状态或项目流程自动启动。未收到明确启动指令时，只允许完成静态审计、合同校验、计划生成和检查点记录，并将该项保持为 `deferred`。
- `deferred` 仅表示跨系统验证暂缓，不表示商品中心模块失败或交付被阻断；不得因此修改商品中心用例状态、重跑已通过用例或生成业务失败结论。金将军明确启动后，仍必须遵守公共平台的认证、上下文、业务操作、断言、清理、收据和跨系统验收门禁，不得绕过公共合同。
- Do not rerun cases already resolved in the current application version unless the user explicitly requests a full rerun or the case fingerprint changed.
- Do not delete historical cases merely because they are not currently executable.
- Update the canonical case, automation binding, runtime ledger, and completed/unlanded indexes together when a case changes classification.
- Treat `已完成` as automation delivery/binding status, not automatically as runtime-passed status.

## State And Result Consumption

- The public platform is the only state arbiter. A binding, generated script, historical summary, repair queue, and standard execution receipt are different facts and must not be substituted for one another.
- Merchant Center indexes and closure reports consume the public arbiter result and must not reapply independent status precedence rules.
- A code, adapter, case, context, or observed-product change makes an old result historical or revalidation-required until a current standard receipt is accepted; a screenshot, shared file, or aggregate count cannot authorize `passed`.
- Product-defect routing requires complete current page/API/cleanup evidence. Locator failures, placeholders, timeouts, authentication failures, and generic assertion differences remain automation, evidence, or environment diagnostics unless a stable product state proves the expected behavior is false.
- Any remediation artifact must explicitly contain its `caseId` and successful case-level outcome. Historical failures must not override a later accepted handled result.
