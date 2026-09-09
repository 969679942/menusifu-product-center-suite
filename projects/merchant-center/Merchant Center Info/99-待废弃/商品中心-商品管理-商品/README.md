# 历史产物（暂不可删除）

本目录文件不再作为新方案生成、审计或自动化输入，但当前 `Merchant Center UITest/contracts/product-center/product-center-traceability.json`、`product-center-test-contract.json` 和已生成模块仍直接引用其中 7 个来源文件。

二次治理核查发现本目录共有 224 个历史 `TC-ITEM-*` 用例编号，其中 `TC-ITEM-UI-001` 至 `TC-ITEM-UI-008` 未出现在当前 216 条正式商品方案中。现阶段删除会破坏既有来源追溯，也可能丢失尚未形成正式处置决策的场景。

只有同时完成以下事项后才能删除：

1. 将仍有效的历史来源迁入权威来源目录并重建来源指纹；
2. 对 8 条 `TC-ITEM-UI-*` 逐条形成合并、替代、不适用或正式纳入决策；
3. 重建合同、追溯表和生成模块，确认不再引用 `99-待废弃`；
4. 通过来源治理合同和资产数量守恒门禁。
