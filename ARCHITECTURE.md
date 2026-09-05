# TAP-MC Jenkins 执行架构

## 职责边界

- 本地 AI：读取 TAP 与 MC，分析 Jenkins 收据，修改用例/脚本/规则并提交 Git。
- GitHub：保存唯一版本和变更历史。
- Jenkins：只 checkout 指定 commit、安装依赖、运行 MC、归档标准收据；不修改代码、不裁决业务规则。
- TAP：作为 MC 的公共运行时与治理依赖，提供合同、收据、证据和门禁。
- MC：提供商品中心业务适配器、用例、数据、断言和清理。

## 运行闭环

1. 本地 AI 生成 execution intent 和选择集指纹。
2. AI 提交 Git，Jenkins webhook 触发构建。
3. Jenkins 在共享 Agent 的独立 workspace 执行 MC，并引用同一提交中的 TAP。
4. Jenkins 归档逐用例收据、断言、证据、日志和清理结果。
5. 本地 AI 按 build number、Git SHA 和选择集指纹拉取并分析。
6. 只有技术问题允许自动修复；业务规则冲突进入裁决队列。
7. 修复提交触发下一轮 Jenkins 验证。

## 接受结果门禁

`build finished`、`Git SHA matched`、`selectedCaseIds = terminalCaseIds`、逐用例收据完整且清理成功，才接受为当前结果。
