# 商品中心资产整改队列

- 本产物只登记整改对象，不启动页面执行，不修改历史结果。
- 孤儿绑定：0；指纹重验证：19；收据适配：0；待授权执行：0。

| 队列 | 用例数 | 处理原则 |
| --- | ---: | --- |
| orphanBinding | 0 | 不删除，等待迁移或废弃决策 |
| fingerprintRevalidation | 19 | 先核对指纹谱系，不能直接复用 |
| receiptAdaptation | 0 | 先适配历史收据，失败后才审批重跑 |
| executableReady | 0 | 需要公共 execution grant |
