# 测试方案统一入口

以后所有测试方案、PRD、XMind 和补充附件只从本目录接收。测试用例正文实行单一权威来源，自动化状态通过索引管理，不复制第二份用例正文。

所有测试相关任务必须先遵循 [`FINAL-GOAL.md`](./FINAL-GOAL.md) 中定义的通用测试平台最终目标、证据权限、重跑规则和验收标准。

若当前项目适配器的 `deliverables/system-test-platform/platform-external-dependency.json` 存在，后续任务还必须先读取该项目平台阻断登记。当前商品中心的实际文件为 `D:\Menusifu\Merchant Center\Merchant Center UITest\deliverables\system-test-platform\platform-external-dependency.json`。其 `status=deferred` 且恢复条件未满足时：

- 不得重跑已冻结模块或已有通过用例；
- 不得重复执行登记中 `retryBlockedPilot=false` 的阻断试点；
- 只能刷新静态门禁、补充新的真实目标系统，或在恢复条件确实满足后解除阻断；
- 平台继续保持“未完成”，但不得把平台阻断传播为模块交付失败。

## 推荐与下一步模板

任何“接下来做什么”或流程优化建议都必须按以下格式给出，缺一项不得进入执行：

```text
级别：必须 / 可选 / 暂不建议
目的：解决的具体问题及当前必要性
预期结果：可核验产物、状态变化和完成标准
后续影响：已通过结果、重跑范围、人工投入、耗时成本、模块交付、跨方案/跨系统复用
```

若目的不清、结果不可验收或影响范围未知，先调查，不执行。建议执行完成后必须对照上述三项报告实际结果和偏差。

## 目录合同

```text
00-待转换测试方案/
├─ 待处理/                    # 新收到、尚未转换或审计的原始方案
├─ 用例库/<模块>/             # 每个模块仅一份权威“正式测试用例.md”
├─ 来源资料/<模块>/           # PRD、XMind、BR 追溯等来源证据
├─ 已完成/index.md            # 已有可执行自动化绑定的用例索引
└─ 未落地/index.md            # 未绑定、技术阻断或无需自动化的用例索引
```

## 判定规则

- “已完成”表示用例已有独立可执行自动化绑定；历史通过、延后执行等运行状态单独记录。
- “未落地”不复制用例正文，只记录用例编号、原因和权威正文链接。
- 每个模块只能有一个正式 Markdown 用例文件；修订直接更新该文件。
- PRD、XMind、BR、人工审核稿和运行报告不得放入 `已完成/` 或 `用例库/`。
- 自动化脚本进入 `Merchant Center UITest/`，运行证据和派生产物进入 `deliverables/`。
- `已完成/index.*` 与 `未落地/index.*` 由 `npm run build:test-plan:asset-index` 生成，不人工编辑。

## 执行状态裁决

- 用例必须先经过执行状态裁决，再生成执行计划和注册 Playwright 用例；自动化绑定中的 `ready` 不代表本轮业务可执行。
- 当前业务确认的延期决策统一记录在 `Merchant Center UITest/contracts/product-center/reviews/product-center-execution-decisions.json`，生成器、执行计划和资产索引必须读取同一份决策。
- `deferred` 用例保留在正式方案和 `未落地/`，不得进入 fixture 注册、数据工厂初始化、Playwright 执行或“已完成”索引。
- `product-defect` 用例不得自动转为通过；必须保留页面/API/清理证据，待产品修复或业务规则确认后重跑。
- 执行计划必须满足分类守恒：执行、延期、来源阻断、技术阻断、产品偏差和不适用之和等于计划总量；冲突时构建失败。
- 标准系统接入必须先通过 `sourceRegistry`、`executionContext`、观察通道和收据合同门禁；不能只提供一组非空 `sourceIds`。
- 运行通过必须使用统一执行收据；“已完成”目录表示已绑定脚本，不表示已经运行通过。发布身份缺失不否定本次执行结果。
- 人工确认改变业务语义后，统一流程必须消费增量选择并在执行后刷新账本与索引。

## 增量闭环命令

商品中心的当前版本闭环必须先审计，再明确批准，再执行：

```text
npm run audit:test-plan:closure
npm run flow:test-plan:evidence-closure
npm run approve:test-plan:incremental -- --case-ids=TC-ITEM-STD-001,TC-GRP-SPEC-001 --approved-by=<operator>
npm run test:test-plan:approved-incremental
npm run test:test-plan:approved-incremental -- --execute
```

第一条命令只生成证据缺口和已确认变化影响；第二条命令是唯一产生 `approvedCaseIds` 的入口；第三条只打印执行计划；最后一条才允许启动页面执行。日期和对话框变化不得触发重跑，人工确认改变执行语义后必须重新审计。

闭环审计会把历史通过但缺少新版标准收据的用例列入 `evidenceReconciliationCaseIds`。该队列优先从旧 Allure、运行账本和证据引用补录，不进入 `recommendedCaseIds`；只有无可协调证据或明确变化影响的用例才可进入重跑批准。

审计触发由输入指纹自动控制：正式用例、来源合同、人工规则、绑定、执行计划、账本或已登记证据发生变化时重审；仅跨日期或切换对话框不会重审。历史证据迁移任务见 `deliverables/test-plan-governance/product-center-historical-receipt-migration-backlog.json`，该任务不等同于页面重跑。

定向修复受公共尝试账本约束：每轮最多 2 次、最长 15 分钟，同一问题最多 2 轮；确定性失败必须修改实现后才能重跑，超过单轮预算必须通过 `--repair-diagnosis=<诊断.json>` 提供结构化根因、修正动作和证据引用。当前实现已经通过时会在启动浏览器前拒绝重复运行。
