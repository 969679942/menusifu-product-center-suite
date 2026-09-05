# TAP-MC Jenkins 执行架构

## 职责边界

- 本地 AI：读取 TAP 与 MC，分析 Jenkins 收据，修改用例/脚本/规则并提交 Git。
- GitHub：保存唯一版本和变更历史。
- Jenkins：只 checkout 指定 commit、安装依赖、运行 MC、归档标准收据；不修改代码、不裁决业务规则。
- TAP：作为 MC 的公共运行时与治理依赖，提供合同、收据、证据和门禁。
- MC：提供商品中心业务适配器、用例、数据、断言和清理。

## 运行闭环

1. 本地 AI 生成 execution intent 和选择集指纹。
2. AI 提交并推送 Git，随后本机通过 Jenkins API 携带精确 Git SHA 和唯一请求 ID 触发构建。当前使用这个已验证的入口；没有配置 GitHub 到内网 Jenkins 的 webhook。
3. Jenkins 在共享 Agent 的独立 workspace 执行 MC，并引用同一提交中的 TAP。
4. Jenkins 归档逐用例收据、断言、证据、日志和清理结果。
5. 本地 AI 按 build number、Git SHA 和选择集指纹拉取并分析。
6. 只有技术问题允许自动修复；业务规则冲突进入裁决队列。
7. 修复提交触发下一轮 Jenkins 验证。

## 接受结果门禁

`build finished`、Git SHA / build number / request ID 匹配、`selectedCaseIds = terminalCaseIds`、逐用例收据完整且所需清理成功，才接受为当前结果。当前十条只读试点没有造数，变更清理不适用；不能据此声称 CRUD 清理已验证。

## 已验证基线

Build 34，提交 `ccd080dc716eb8e3327ce323c52cdbd617b2a9b3`：Jenkins SUCCESS，十条真实业务用例 10 通过 / 0 失败 / 0 跳过，逐案标准断言收据完整，38 份归档回传并完成本机核验。此前真实失败已由本机 AI 分析修复并推送再验证。

本机 AI 由当前任务的五分钟 heartbeat 继续调度，执行步骤见 `ci/AI-LOOP.md`。本机和 Codex 应用需要运行。该结果证明指定 MC 试点闭环，不代表商品中心全量用例或 TAP 跨系统通用平台总验收完成。
