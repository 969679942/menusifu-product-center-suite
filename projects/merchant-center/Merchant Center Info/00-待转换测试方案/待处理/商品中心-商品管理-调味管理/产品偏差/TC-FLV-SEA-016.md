# TC-FLV-SEA-016 规则变更关闭记录

- 原产品偏差：旧 XMind 预期要求负数保存失败并提示“输入数字异常”。
- 规则确认：2026-08-24 用户确认新增时非数字字符、负数可保存并自动纠正为 0，价格留空默认为 0；编辑时非数字字符、负数恢复原价，视为未修改，右上角确定按钮置灰。
- 处理结论：不再按产品缺陷处理；已更新正式用例、system-test 断言面和绑定，当前标准定向重跑已通过。
- 历史证据保留：`Merchant Center UITest/output/system-test/merchant-center-product-center-seasoning/system-test-1787546366478/evidence-ledger.json`。
- 当前收据：`Merchant Center UITest/output/system-test/merchant-center-product-center-seasoning/system-test-1787561427151/evidence-ledger.json`；新增三种输入均为 0，编辑两种非法输入均恢复原价、确定按钮置灰且无 PUT，API/UI 零残留。
