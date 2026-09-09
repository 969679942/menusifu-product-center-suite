# 商品中心测试用例进入标准

## 目标

将 PRD、XMind、测试方案或现有用例统一转换为可审计的 TestCase IR。Codex 默认结合正式来源和运行时证据直接完成结构化、来源绑定、用例校正、自动化资格判断及 Recipe 编译；人工只处理来源冲突、证据不足和高影响异常。

## 输入方式

人工可以直接提供 Markdown、XMind、Word 或现有用例，不需要填写 JSON。Codex 使用 `contracts/product-center/test-cases/product-center-test-case-input.template.json` 作为规范化目标。

每条用例必须包含：

- 稳定 `caseId`、模块、路由、标题和优先级。
- 来源引用；无来源的规则只能进入待确认项。
- 前置条件、业务操作和可观察预期。
- 每个前置、操作和预期的语句级 `claim`、来源及证据等级。
- 覆盖分母 ID，以及角色、环境、能力、造数、终态和清理执行合同。
- 是否改变数据；改变数据时必须声明清理方案。
- 自动化偏好：候选或人工执行。

输入中不写 selector、固定等待、账号、Token、Cookie 或存储状态。

## 审计顺序

1. 运行时结构校验，阻断缺字段或错误类型。
2. 将 `sourceRefs` 绑定为统一合同中的稳定 `sourceIds`。
3. P0.5 检查每条语句唯一绑定证据；推导或冲突语句输出纠正提案并阻断。
4. P0.6 按路由、控件、弹窗和校验建立覆盖分母，输出缺失、阻塞和不适用项。
5. P0.7 检查角色、环境、能力、API Seed、API/UI 终态、异步信号和清理适配器。
6. 读取已登记的运行时审计校正合同，按 `autoApprovalPolicy` 自动校正精确提示、控件状态、写请求、落库结论、用例结构和技术绑定；未通过确定性门禁的项目才进入人工异常队列。
7. 综合输出 `passed`、`review-required` 或 `invalid`，只有通过后才允许编译 Recipe。

运行时审计校正合同和通用命令见 `docs/product-center-runtime-audit-correction.md`。凡是已经有运行时审计证据的用例，都必须登记为校正、无变化或阻断；不能仅凭截图/视频路径放行。

## 人工截图证据

截图和视频只允许登记为 `human-rule-confirmation`，用于确认页面在采集时可见的字段、提示、按钮状态、弹窗结构和人工业务判定。证据清单必须记录文件路径、SHA-256、大小、关联 `caseId`；能够取得时还必须记录采集时间、应用版本指纹、路由和语言。

截图或视频不能单独证明写请求已发送、服务端已持久化、下游已同步、测试数据已清理，也不能签发 `passed`。缺少采集时间、应用版本、路由或语言时，只能证明文件完整性和人工确认来源，不能作为可重放运行证据。

## 人工确认后的重跑门禁

人工确认用于解除业务规则歧义，不替代自动化运行。人工确认导致以下任一内容变化时，受影响用例必须转为 `ready` 并重新执行：

- 前置条件、测试步骤、预期结果或精确提示。
- 页面控件、字段身份、弹窗顺序或 UI/API 断言面。
- 自动化绑定、handler、locator、数据工厂、API 映射或清理策略。
- 已观测的发布、配置、功能开关、执行上下文或用例指纹变化，导致既有运行证据不再适用。

只有新的执行收据同时覆盖用例要求的 UI、API、下游和清理证据后，状态才能变为 `passed`。运行失败必须先区分产品失败、自动化缺陷、环境不可用和瞬时平台失败；自动化或环境失败不得改写为产品偏差。

仅文档排版、说明文字或不参与用例指纹的元数据变化，可以复用既有结果而不重跑。发布身份可信且稳定时，结果可自动复用；发布身份不可用时，本次完整执行仍可为 `passed`，但只能标记 `run-only`，不得自动声明跨发布复用。缺少外部能力的用例保持 `deferred` 或技术阻断，并记录恢复条件，不得凭人工截图转为通过。

## 公共平台实现

上述规则由公共平台实现，模块不得自行复制状态机或放宽门禁：

- `utils/test-evidence-governance.ts` 统一证据角色，并禁止截图单独签发 `passed`。
- `utils/test-plan-runtime-audit-correction.ts` 根据业务语义、技术绑定和覆盖变化生成 `rerunCaseIds`。
- `utils/playwright-execution-receipt.ts` 只导入具备用例指纹、完整执行状态和完整证据的标准执行收据；发布身份允许不可用。
- `utils/test-plan-landing-gate.ts` 以完整收据和用例指纹判定本次结果，以明确的发布变化控制增量重验；不把缺失发布身份当成失败。
- `D:\Menusifu\Test Automation Platform\scripts\compile-system-test-plan.ts` 输出 `execution-selection.json`，供通用执行器只注册受影响用例。

商品、组等存量方案通过适配器接入同一门禁。检查接入和当前版本闭环状态：

```powershell
npm run audit:test-plan:landing
```

该命令不会执行业务用例，只导入已存在且满足标准的执行收据并生成落地审计。报告中的历史通过状态仅用于迁移核对；没有逐用例指纹和完整执行收据时，不能计入当前证据通过。人工规则变更或明确系统变化后必须执行 `execution-selection.json` 中的受影响用例，再由新收据关闭 `ready` 状态；单纯跨日期、切换对话框或重新查看报告不触发重跑。

全量用例转换完成后，通过统一入口执行：

```powershell
npm run audit:product-center:test-case-input -- --input <用例IR.json> --bindings <来源绑定.json> --scope full
```

来源绑定格式参考 `contracts/product-center/test-cases/product-center-test-case-source-bindings.template.json`。`full` 用于全量用例验收，任一覆盖缺口都会阻断；`case-only` 只审计本批用例，但未知覆盖 ID 仍会阻断。默认报告写入 `output/test-case-audit/product-center/intake-latest.json`；`invalid` 或 `review-required` 返回非零退出码并阻断后续生成。

单个模块或路由形成完整用例包后，使用 `module-full` 做阶段验收。该范围只接受显式 `coverageIds`，必须指定至少一个模块，可选指定一个或多个路由：

```powershell
npm run audit:product-center:test-case-input -- --input <用例IR.json> --bindings <来源绑定.json> --scope module-full --module brand-item --route /pp/brand/category
```

`module-full` 会先过滤覆盖分母，再要求目标范围缺口为零；目标分母为空、未知覆盖 ID 或任一前置门禁不通过都会阻断。

## 商品分类试点

商品分类路由将重复 DOM 实例归并为 7 个稳定能力。正式用例 `TC-ITEM-STD-035` 因缺少可复用 Seed/操作能力而保留人工执行，其余 6 条由 Recipe 执行：

```powershell
npm run build:product-center:category-pilot
npm run test:product-center:category-pilot
```

输出：

- `contracts/product-center/test-cases/pilots/category-route-test-cases.json`
- `contracts/product-center/test-cases/pilots/category-route-source-bindings.json`
- `output/test-case-audit/product-center/category-route-pilot-latest.json`

## 当前基线

现有 45 条已晋级 SOP 作为存量回填样本，不作为新用例的反向来源。构建命令读取当前统一合同和已晋级 Recipe，生成 IR 基线及审计报告：

```powershell
npm run build:product-center:test-case-ir
```

输出：

- `contracts/product-center/test-cases/product-center-existing-sop-cases.json`
- `contracts/product-center/test-cases/product-center-coverage-denominator.json`
- `output/test-case-audit/product-center/latest.json`
- `output/test-case-audit/product-center/preflight-latest.json`

当全量用例到达后，应先转换为输入模板，再完成来源绑定和审计；不得直接生成 Playwright Spec。
