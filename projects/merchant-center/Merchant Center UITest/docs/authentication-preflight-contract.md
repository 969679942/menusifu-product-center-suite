# 商品中心认证适配

预检默认服务 UI runner：消费 `resolveAuthCredentials()` 的有效用户名、密码、商户和品牌。API token 不能替代 UI OAuth 登录。秘密文件的解析与环境变量优先级由现有运行器配置源负责；审计不保存凭据值。

`--mode=api` 消费 API 账号上下文，允许直接 token 或用户名密码；品牌仍为必需上下文。API 结果独立写入 `.api.json`，不会覆盖治理摘要消费的 UI 预检。门店级接口的 `requirePoi` 在具体操作适配器继续校验，此处不声明全部 API 均可运行。

认证预检调用公共认证合同与不可变发布合同。每次刷新保留旧报告和新报告内容快照。配置就绪不触发登录、造数、业务运行或 Jenkins 回传；源解析失败由执行代理处理。

变更范围：public-core、project-adapter、generated-evidence。既有通过业务用例不重跑、不失效。本次通过隔离子进程与合成秘密文件验证，绝不使用真实凭据测试。
