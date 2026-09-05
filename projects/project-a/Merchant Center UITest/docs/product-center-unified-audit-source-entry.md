# 商品中心统一审计源入口

## 目的

统一接收业务页面 URL、在线文档地址和本地测试方案文件，先形成可追溯的审计源和候选用例，再决定是否进入正式测试方案流程。

## 处理边界

1. `http/https` 地址必须通过主机白名单后进入只读页面观测待处理状态，不自动执行新增、修改、删除。
2. 本地 `.md`、`.json`、`.xmind` 文件进入结构化解析，统一映射为候选用例。
3. 本地源以内容指纹识别变化；页面观测以真实观测时间、有效期、上下文和页面/API指纹确认新鲜度。
4. 任何候选都不能直接改变正式用例、生成通过结论或启动正式执行。

## 上下游影响

- 上游：调用方只需提供 `--source=<URL或本地文件路径>`；不再要求先拥有正式 `caseId`。
- 审计层：输出来源类型、格式、指纹、候选步骤、未决项和门禁状态。
- 用例层：正式 Markdown 和 canonical JSON 保持不变；人工确认后才进入现有 intake、绑定和增量计划。
- 执行层：`executionAllowed=false`，不会触发认证、造数、浏览器或业务写操作。
- 索引层：不写入 `已完成/index.json` 或 `未落地/index.json`，避免把候选误计入正式资产。
- 历史结果：不失效、不重跑；只有正式用例、实现、上下文或观测指纹发生实质变化时，才由现有重验证流程裁决。

## 使用

```text
npm run audit:product-center:source -- --source="D:\\Menusifu\\Merchant Center\\Merchant Center Info\\00-待转换测试方案\\用例库\\商品中心-商品管理-商品\\正式测试用例.md"
npm run audit:product-center:source -- --source="https://example.test/pp/brand/list" --allowed-host=example.test
npm run audit:product-center:source -- --source="页面地址" --source="本地方案.json" --source-type=test-plan
```

产物写入 `deliverables/product-center-audit/source-intake/`，包含 JSON 机器产物和 Markdown 人工审核产物。

## Double-check 结论

- 输入覆盖：URL、本地文件、Markdown、JSON、XMind、无效路径和不支持格式。
- 安全边界：默认只读；URL 必须通过主机白名单并阻断本地主机/私网；本地源限制在项目目录及 `Merchant Center Info`；不输出源文件内容。
- 追溯性：保留 source ID、路径或 URL、内容指纹、观测时间和有效期。
- 状态隔离：候选、待确认、来源阻断与正式执行互不混淆；多来源按 caseId/语义键合并。
- 兼容性：复用既有 Markdown/XMind 解析器，不复制公共平台状态机，不修改既有正式用例。
