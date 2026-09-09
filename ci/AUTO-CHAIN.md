# Jenkins 自动链路

本地受控入口：`powershell -NoProfile -File ci/jenkins.ps1 submit --scope contracts --auto-chain`。
入口从 Windows 受保护凭据文件读取 Jenkins API 认证，从 MC 的 `.secrets/runtime.env` 读取运行配置，在提交前校验完整三方 SHA；无需把密码粘贴到构建页面。
运行配置只存在于提交请求内存，不写入 checkpoint。Jenkins 保留 Job 内联脚本时，脚本更新需要通过认证 API 安装并读回比对后再提交。
空请求 ID/意图 ID 由 Pipeline 生成，归档、子进程和后续阶段必须使用同一规范化身份。

必须（CI 编排）：修复本地提交遗漏三方版本、自动链路和运行配置的缺口。目的：一次提交完成三阶段；预期结果：预检在提交前完成、Jenkins 持久接续；后续影响：不改全局代理、不改其他 Job，不使已有业务收据失效，最终验收只运行既定十条试点。

`AUTO_CHAIN=true` 显式授权当前构建成功后继续 contracts → reports → pilot。默认 false，普通单阶段调用保持不变；full-regression 不参与串联。

三个阶段固定同一组完整 PCS/MC/TAP SHA 和 intent ID。请求 ID 依次添加 reports、pilot 后缀。Jenkins 在释放当前 executor 后通过持久化 Pipeline continuation 排队后继构建，不依赖本机对话在线；不对提交操作添加盲目重试。

`chain-checkpoint.json` 记录阶段决定及版本身份。只有当前 envelope 完整、选择集与终态集合一致、选择集指纹一致、Jenkins 成功以及所需 Allure 审计完整时才继续。pilot 还必须有完整标准业务收据。每阶段的归档和 Jenkins 上游构建链接用于恢复对账；失败或取消会停止后继构建。

业务凭据通过已有密码参数传递，不进入检查点或仓库。AUTO_CHAIN 必须从起始阶段提供 pilot 运行配置，防止运行到最后才缺少认证。自动运行不包括自动生成业务修复；技术故障由当前授权的执行代理分析归档后处理。

本次修改属于 CI 编排与项目适配指纹维护，目的为自动完成已授权十条只读试点并形成非空 Allure 业务报告。已有结果保持历史事实，不复用漂移指纹下的通过收据，不扩大业务范围。

本地验收：65 项 MC 合同中 64 通过、1 项原有跳过；25 项 CI 合同通过；十条试点编译零阻塞；隔离报告样本与附件审计通过。真实链路仍以 Jenkins 当前构建归档为准。
