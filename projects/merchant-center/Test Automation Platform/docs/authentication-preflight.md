# 认证配置预检

公共 `evaluateAuthenticationPreflight` 只接受能力存在性的布尔值。适配器声明目标认证方式、可替代凭据组和必需上下文。每组全部配置才有效；上下文独立校验。未知能力、重复能力、空凭据组失败。

`ready-for-readonly-probe` 只表示配置前置可用，`authenticationVerified=false`、`executionAuthorized=false` 始终保留。真实登录、权限可用性、执行意图和 execution grant 由后续独立合同证明。配置源读取/解析失败属于技术配置问题，不能伪装为外部授权缺失。
