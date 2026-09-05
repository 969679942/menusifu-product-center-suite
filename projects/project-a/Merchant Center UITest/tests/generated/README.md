# Playwright Test Agents 测试输出目录

该目录预留给 `generator` 或 `healer` 维护的 Playwright Test 文件。

建议约束：

- 与人工维护的 `tests/smoke/`、`tests/e2e/` 分开。
- 新生成测试先在这里审查，再决定是否上移或重构进正式目录。
- 生成测试仍需遵守仓库 `AGENTS.md` 中的页面分层、中文步骤和定位器规则。
