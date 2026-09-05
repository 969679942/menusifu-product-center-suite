# Jenkins 执行时实时审计记录

商品中心使用公共平台的 `SYSTEM_TEST_AUDIT_EVENT_LOG` 环境变量启用执行时事件写入。测试步骤完成一个 API/UI operation 后，`finishExecutableOperation` 会立即向 JSONL 追加一条 `operation.called` 事件；Jenkins 不需要等待测试结束再扫描报告。

## Pipeline 示例（PowerShell）

```powershell
$env:SYSTEM_TEST_AUDIT_EVENT_LOG = "$env:WORKSPACE\Merchant Center UITest\output\audit\jenkins-$env:BUILD_TAG-events.jsonl"
$env:SYSTEM_TEST_RUN_ID = "jenkins-$env:BUILD_TAG"
$env:SYSTEM_TEST_APPLICATION_ID = "merchant-center"
$env:SYSTEM_TEST_BUSINESS_DOMAIN_ID = "product-center"
$env:SYSTEM_TEST_PLAN_ID = "merchant-center-product-center"
$env:SYSTEM_TEST_LOGICAL_RUN_ID = "jenkins-$env:JOB_NAME"
$env:SYSTEM_TEST_RUN_TYPE = "业务执行"
$env:SYSTEM_TEST_TRIGGER_TYPE = "Jenkins 构建触发"
$env:SYSTEM_TEST_TRIGGER_SOURCE = "Jenkins/$env:JOB_NAME"
$env:SYSTEM_TEST_TRIGGER_ACTOR = "Jenkins"
$env:SYSTEM_TEST_SCOPE = "商品中心 / 本次选择的用例"
$env:SYSTEM_TEST_PURPOSE = "记录每个流程步骤、调用、断言、清理和证据，支持运行复盘"

Push-Location "$env:WORKSPACE\Merchant Center UITest"
try {
  npm run test:system -- --manifest=systems/merchant-center-product-center-seasoning/manifest.json --case-ids=$env:CASE_IDS --audit-event-log=$env:SYSTEM_TEST_AUDIT_EVENT_LOG
}
finally {
  npm run build:product-center:audit-report -- --event-log=$env:SYSTEM_TEST_AUDIT_EVENT_LOG --output-dir=deliverables/product-center-audit/$env:BUILD_TAG
  Pop-Location
}
```

## v1.1 审计完整性门禁

标准执行完成后，必须使用公共门禁检查本批 `evidence-ledger.json`，不能用报告首页、用例总数或历史收据数量替代审计适用分母：

```powershell
npx tsx "../../Test Automation Platform/scripts/verify-system-test-audit-completeness.ts" --ledger="<evidence-ledger.json>"
```

门禁校验审计合同版本为 `1.1.0`，并强制满足：

```text
planned = auditEligible + classifiedExclusions
auditEligible = auditComplete + auditIncomplete
```

- `exit 0`：`audit-complete`，审计适用用例的调用、结构化 Diff、对象级清理等合同要求均完整。
- `exit 2`：`audit-incomplete`，表示审计证据不完整或分母守恒失败；这是证据/自动化诊断，**不等同于产品失败**，不得将其自动登记为产品缺陷。
- 缺少 v1.1 合同的历史收据只可显示为 `provisional` 临时观察值，不能计入正式覆盖率或授权当前通过。

Jenkins 可在报告生成后追加门禁阶段，并始终归档门禁输出、事件 JSONL、JSON 报告和 HTML 报告。若门禁返回 `2`，保留业务执行原始结果，但将构建标为“审计不完整/需补证据”；不得据此重跑全部已通过用例，只有当前用例、实现、上下文或观测产品发生影响性变化时才进入增量重验。

推荐将 `output/audit` 和 `deliverables/product-center-audit` 配置为 Jenkins artifact，供构建完成后下载。不要把密码、Token、Cookie 或授权头写入环境日志；公共事件存储会对事件 `details` 做递归脱敏。

## 实时性与恢复

运行开始时会先追加 `run.started`，每个可见业务步骤和 API/UI operation 会分别追加开始与终态事件，运行收口时追加 `run.completed`、`run.failed` 或 `run.blocked`。`logicalRunId` 用于把同一次业务运行的技术重试归并展示，`SYSTEM_TEST_RUN_ID` 仍保留 Jenkins 构建的技术定位；两者都不会覆盖历史运行。

- 事件在 operation 完成时立即追加，不依赖最终 `evidence-ledger.json`。
- JSONL 使用文件锁、事件 ID 幂等和哈希链；Jenkins 重试同一 operation 不会重复计数。
- 构建中断后保留已写入事件；下一次构建应使用新的 `runId`，报告命令可以继续读取同一日志文件或按构建标签分文件。
- `operation.called` 只证明调用事实；用例是否 `passed` 仍必须由完整标准执行收据和清理证据裁决。
- 变更类用例由 v1.1 合同要求结构化 `changeReceipts`，或在 operation receipt 中提供 `beforeFingerprint + afterFingerprint + changedFields`。
- 需要清理的用例必须提供对象级收据，包括 `entityType`、服务端 `serverId`、唯一业务身份、清理尝试次数、API/UI 残留数及终态；仅有全局 `zeroResidue=true` 不能满足新门禁。
- 报告中的 `latestReceipt` 与 `receiptHistory` 是事实投影；当前通过裁决仍由公共 arbiter 根据当前用例和实现指纹完成，旧失败不得覆盖后续当前收据。

## 验收检查

```powershell
Get-Content $env:SYSTEM_TEST_AUDIT_EVENT_LOG -Wait
npm run build:product-center:audit-report -- --event-log=$env:SYSTEM_TEST_AUDIT_EVENT_LOG
```

实时日志适用于 Jenkins 控制台观察和构建后归档；长期在线查询、权限和通知中心暂不建设，待流程和事件模型稳定后再产品化。
