# 调味管理人工处理清单

无需人工提供浏览器窗口或登录。认证已由 UI OAuth 自动化流程建立，setup 与 preflight 均已通过。

## TC-FLV-REC-002

无需人工处理。当前标准收据已证明页面存在真实任务记录、按任务名称查询后展示匹配数据行，并观察到 `POST /item/v1/ops-brand/brand-modifier-sync/job/list`。

## TC-FLV-REC-005

无需人工处理。此前失败是自动化适配器遗漏正式用例要求的“先执行查询”步骤，导致测试路径与人工流程不一致。修复后已按“输入任务名称 -> 执行查询 -> 点击可见 reset -> 验证输入框为空”通过。

证据：`output/system-test/merchant-center-product-center-seasoning/system-test-1787549006592/evidence-ledger.json`。

## 外部能力恢复后执行

TPL 多门店模板、XMOD 门店上下文、POS 终端/支付/打印相关用例仍需对应环境身份和终端能力；这些是明确延期或技术阻断，不是浏览器登录问题。
