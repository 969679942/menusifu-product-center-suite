# 本地系统测试审计入口

当前审计流程不依赖 Jenkins。公共平台提供本地、Jenkins、GitHub Actions 或其他调度器均可复用的同一入口；商品中心只保留项目命令别名和领域适配器。

## 无业务参考验收

```powershell
npm run verify:system-test:audit-reference
```

该命令不访问商品中心页面和 API，不创建业务数据。它使用 `applicationId=system-test-audit-reference` 生成：

- `deliverables/system-test-audit-reference/audit-events.jsonl`
- `deliverables/system-test-audit-reference/evidence-ledger.json`
- `deliverables/system-test-audit-reference/audit-pipeline-result.json`
- `deliverables/system-test-audit-reference/audit-pipeline-report.html`
- `deliverables/system-test-audit-reference/audit-pipeline-report.csv`
- `deliverables/system-test-audit-reference/audit-pipeline-report-print.html`
- `deliverables/system-test-audit-reference/audit-pipeline-report.pdf`（由打印版 HTML 生成的归档文件）
- `deliverables/system-test-audit-reference/audit-events-readable.jsonl`（中文可读日志；机器日志仍保留原始字段以兼容程序）

验收条件为 v1.1 门禁退出码 0、`auditIncomplete=0`，并同时满足：

```text
planned = auditEligible + classifiedExclusions
auditEligible = auditComplete + auditIncomplete
```

## 正式方案入口

默认只编译，不执行页面：

```powershell
npm run audit:system-test:local -- --plan=<plan.json> --manifest=<manifest.json>
```

只有经过增量选择和明确批准后才追加 `--execute`：

```powershell
npm run audit:system-test:local -- --plan=<plan.json> --manifest=<manifest.json> --execute
```

执行模式会对每个标准 evidence ledger 应用 v1.1 完整性门禁，并生成通用 HTML/JSON 报告。`audit-incomplete` 是审计证据或自动化诊断，不等同于产品失败，也不会自动使历史通过结果失效。

## HTML 报告阅读方式

HTML 报告是离线单文件，可直接用 Chrome、Edge 或 Firefox 打开，不需要启动服务，也不依赖 Jenkins。新版报告按以下顺序阅读：

1. **执行总览**：先看审计状态、完整率、数据守恒校验和清理残留。
2. **用例矩阵**：按 `caseId`、审计状态、是否发生变更筛选；每行对应一个计划用例。
3. **用例详情**：展开后查看操作时间、结构化 Diff、API/UI 清理和缺失项。
4. **操作与审计时间线**：按事件发生时间复盘 `run.started`、操作、断言、清理和结束事件。
5. **断言与清理汇总**：查看断言逐条明细、清理对象独立明细和残留结果。
6. **纠正事件**：查看纠正 ID、影响用例、原因/动作、前后指纹和变更字段。
7. **历史趋势与运行对比**：比较最近运行的事件数、数据变更、失败事件和耗时。
8. **日志健康**：核对全量哈希链、当前运行事件数量、eventId 唯一性和操作生命周期配对。
9. **证据产物**：回到 JSON、JSONL、CSV 和 evidence ledger 做机器级核对。

报告支持两种离线导出方式：点击“下载 CSV”生成当前筛选结果；点击“打印 / 另存为 PDF”，或打开 `audit-pipeline-report-print.html` 后使用浏览器打印功能保存为 PDF。打印和导出只读取报告数据，不改变业务状态或执行收据。

日志分为两份：`audit-events.jsonl` 是供程序校验、追踪和哈希链验证的机器日志，字段名保持稳定；`audit-events-readable.jsonl` 是给业务人员阅读的中文日志，事件类型、结果和常用字段均已翻译。两份日志一一对应，不应手工修改中文日志来替代机器日志。

报告中的“审计完整”不等同于“业务通过”；最终通过资格仍由公共状态裁决器根据当前标准执行收据决定。HTML 只展示脱敏数据，不能作为绕过收据门禁的替代证据。

## 实时步骤日志

受治理的 Playwright 运行配置已经接入公共步骤审计器。设置 `SYSTEM_TEST_AUDIT_EVENT_LOG` 后，每个显式 `test.step(...)` 或 `@step(...)` 可见步骤都会追加：

```text
step.started
→ step.completed / step.failed / step.interrupted
```

商品中心适配器只负责把中文步骤分类为：

- `business-operation`
- `assertion`
- `cleanup`
- `context-guard`
- `technical`

公共审计器负责时间、耗时、运行身份、用例身份、失败终态、脱敏和哈希链。内部 `pw:api`、locator、fixture 和 hook 不按步骤逐条落盘，避免用底层框架噪声淹没业务时间线；它们仍可通过 Trace 或失败诊断查看。

步骤事件固定带有 `authorizesPass=false`。它们用于复盘执行过程，不能替代业务操作收据、断言收据、上下文守卫收据或清理收据。直接运行未设置审计日志路径时不会产生 JSONL；正式运行必须从公共 `flow:system-test` 入口启动，由公共 runner 注入日志路径和 `applicationId + runId + caseId` 上下文。
