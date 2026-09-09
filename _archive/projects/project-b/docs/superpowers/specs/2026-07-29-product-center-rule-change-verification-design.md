# 商品中心规则校正分级验证设计

## 目标

为单条业务规则校正提供可重复的影响分析和最小验证入口。入口必须识别规则、关联规则、canonical 用例、Claim 与共享实现的影响范围，并确保任何等级都不会自动运行真实 UI。

## 分级

- L1：单条规则、单条 canonical 用例、无冲突、未修改共享实现。执行定向合同、目标产物重建和 TypeScript。
- L2：同一规则组关联多条规则或用例，或存在来源冲突。增加关联 canonical、规则账本和来源覆盖合同。
- L3：修改共享 schema、`utils/`、`scripts/`、合同 manifest 或公共生成器。执行完整商品中心静态/API 合同，不执行 Chrome UI。
- L4：请求页面 Probe、定位器变更或 Create/Update/Delete。只输出 `authorization-required`，不自动执行。

等级按最高风险决定，不能通过减少命令参数降级。规则关联来自结构化确认记录的 `ruleGroupId` 和 `linkedCanonicalIds`，不能按标题或自动化代码猜测。

## 组件

- `utils/product-center-rule-change-impact.ts`：读取结构化输入，构建关联图并返回等级、原因、关联规则、关联用例及验证 profile。
- `contracts/product-center/test-manifests/product-center-rule-change-verification.json`：保存各 profile 的唯一命令清单；禁止出现 `--project=chrome`、Gold、主 Recipe 或 UI pipeline 命令。
- `scripts/verify-product-center-rule-change.ts`：解析 `--rule-id`、重复的 `--changed-file`、`--plan-only` 和 UI 风险标记，写入审计报告；默认执行选定静态命令，L4 fail-closed。
- `tests/api/product-center-rule-change-verification.contract.spec.ts`：覆盖 L1～L4、关联闭包、manifest 安全和 `TC-ITEM-STD-007` 回放。

## 数据流

命令接收 ruleId 与本次明确变更文件，读取产品确认记录和 manifest，计算规则组闭包，再选取最高等级 profile。分析结果先写到 `output/test-case-audit/product-center/rule-change-verification-latest.json`；只有 L1～L3 可以继续执行，L4 保留报告并返回非零状态。

## 安全与错误处理

- 未知 ruleId、空命令、重复命令、越界路径或 manifest 中出现 UI 命令时立即失败。
- changed-file 只用于升高等级，不能覆盖结构化关联结果。
- runner 使用 `spawnSync` 参数数组和 `shell=false`，不拼接 shell 命令。
- 报告不保存环境变量、凭据、cookie、认证头或浏览器状态。
- transient 平台失败由被调用的既有静态合同入口按现有恢复规则处理；runner 不把它重分类为产品失败。

## 验收标准

- 简单无关联样本输出 L1。
- 同一 `ruleGroupId` 的两条分类规则形成 L2 关联闭包，覆盖 `TC-ITEM-STD-007` 和 `TC-ITEM-STD-037`。
- 修改共享生成器时升级为 L3。
- 任意 UI/写操作标记升级为 L4 且不产生执行命令。
- `TC-ITEM-STD-007` 回放不包含 Gold、主 46 条、Chrome 或完整 UI pipeline。

