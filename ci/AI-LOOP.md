# AI 闭环执行说明

## 当前运行入口

- 源码：`D:\Menusifu\Test Automation Platform` 与 `D:\Menusifu\Merchant Center`。
- Git 集成工作区：`D:\Menusifu\product-center-suite`，只从这里提交到用户创建的 GitHub 仓库。
- Jenkins 唯一可变更任务：`menusifu-product-center-suite`。不得修改其他任务或服务器全局配置。
- 本机 Jenkins 凭据：Windows 当前用户加密的 `.codex/secrets/menusifu-jenkins.credential.xml`。禁止把解密值写入文件、日志、报告或 Git。

```powershell
# 推送当前提交，按请求 ID 触发；有未完成构建则恢复同一请求
./ci/jenkins.ps1 submit --scope pilot
# 查询队列/构建，完成后拉取归档并校验精确 Git SHA、build number、request ID、选择集指纹
./ci/jenkins.ps1 poll
# 手工维护入口（先暂停 worker）：发现构建并下载
./ci/jenkins.ps1 watch
# 可选的一次性等候入口
./ci/push-trigger-analyze.ps1 -Scope pilot
```

`contracts` 是基础合同验证；`pilot` 在合同验证后执行 `business-selection.json` 固定的十条正式用例。合同测试不具有业务通过权限。十条试点使用 TAP 的运行器、执行授权、来源门禁、标准收据和清理门禁；不能直接以 Playwright `--grep` 绕过公共执行流程。

## 本机 AI 调度

Windows 计划任务 `Menusifu-ProductCenter-AI-Worker` 只收集已明确登记构建的状态和归档。当前 `collect-only` 模式不调用 AI、改源码、提交代码或触发构建；Codex 对话收到明确分析请求后才读取已收集证据。详细入口见 `ci/WORKER.md`。

协调器每 120 秒做无 AI 的空闲发现；已知构建运行期间每 30 秒探测。仅有未分析证据时才调用本机 `codex exec`，不依赖当前聊天上下文。每个构建按 Jenkins server / job / build number 唯一入队，Git SHA、request ID、runScope 固化；同 SHA 的不同构建不会相互覆盖。首次基线从构建 34 开始。

传输的 `analyzed` 只表示下载与合同校验结束。真正 AI 阅读提供的证据后返回中文结论和证据路径，协调器保存 `ai-review.json`。仅通过身份、选择集、完整性及标准收据门禁的结果才可登记审查完成。基础合同、报告样本、真实业务执行、跨系统公共平台最终验收是不同事实。

AI 接收脱敏结果及必要源码，不能执行模型生成的 shell 命令。技术修复通过精确补丁合同，应用到独立 worktree；校验前像、路径、秘密值、静态与合同检查。协调器保存补丁计划和发布检查点，再提交、快进合并、推送及触发匹配影响范围的验证。中断后恢复首个未完成阶段，不盲目重放补丁或 POST。

`reports` 只执行隔离报告样本；`contracts` 只执行合同检查；`pilot` 才执行已固化的十条真实业务用例。报告/调度变化不使已有业务收据失效，不为验证格式而重跑业务。技术失败继续自动排查；正式业务来源冲突生成具体裁决材料，禁止放宽断言、减少选择集或伪造观测。

修复提交等待后续构建验证，必须同时匹配提交、请求、范围及 AI 审查收据，且原始 TAP/MC 源码同步没有冲突，才关闭原构建待办。工作区有用户修改时保留检查点，拒绝覆盖。暂时网络、模型额度或登录问题独立分类，按有界重试和冷却恢复，不记为产品失败。

用户主动修改源码的入口：先暂停 worker，再执行 `python ci/sync-sources.py plan`，按其源/目标指纹审查 `output/jenkins/source-export-plan.json`，仅导出授权范围；应用、验证、提交后通过 `ci/jenkins.ps1 submit --scope <scope>` 触发，最后恢复 worker。原项目同时发生的修改不得被旧快照覆盖。

## 已验证的闭环基线

- Build 28：失败归档成功，本机完整下载并核验，61 合同通过、3 失败、1 跳过。
- 本机 AI 修复三个技术问题，提交 `a55c1ba`。
- Build 29：64 合同通过、0 失败、1 原有条件跳过；SUCCESS，结果回传且身份核验通过。
- Build 30：正式业务执行前指纹门禁拦截，0 条业务执行，不是产品失败。
- 修复换行格式并固定 Git 属性，提交 `4c0aadf`；原定十条业务试点继续验证。
- Build 32：十条业务执行通过，但深度审计发现旧式断言收据缺少期望与实际值，因此未授权正式接受。
- Build 33：补全观测后，严格门禁发现公共执行器追加重复收据；自动定位、修复并通过 13 条公共执行器与收据合同测试。
- Build 34：`ccd080dc716eb8e3327ce323c52cdbd617b2a9b3`，Jenkins SUCCESS；十条真实业务用例 10 通过 / 0 失败 / 0 跳过。严格收据审计 complete，10 收据导入且 0 诊断；38 份归档本机下载，身份与完整性门禁均通过。
- 本机报告：`output/jenkins/build-34/report.html`；分析：`analysis.json`；逐案审计：`receipt-audit.json`。原始期望/实际值在本次 `business/<runId>/evidence-ledger.json` 中。
- 本次十条为查询/页面读取，不产生业务数据，变更清理不适用。构建失败、缺证据和产品失败分别分类。
- 已清除本任务 Build 31 含敏感诊断的远程归档，保留本机脱敏诊断；后续 trace 采用已通过负向测试的已知秘密值及通用令牌脱敏。未修改其他 Jenkins 任务。
- Build 34 后的本机传输、报告、导出和文档维护不改变 MC/TAP 业务实现，不触发重复业务执行；这些改动使用隔离合同与静态验证。
- TAP 公共平台总门禁仍是 `FINAL_GOAL_NOT_MET:PROJECT_ADAPTER_REQUIRED`；该跨系统平台目标与本任务的 MC Jenkins 闭环验收分别记录，不伪装为通过或 MC 产品失败。

## 恢复和数据保护

GET 与幂等 Git 操作有界重试。构建 POST 在请求 ID 检查点保存后只发一次；响应不确定时先查询队列与构建参数，禁止盲目重发。结果目录按构建号隔离。会话凭据通过本任务的密码参数传入，浏览器会话文件留在构建私有目录并在结束时删除，不归档。业务证据归档使用脱敏副本。

Jenkinsfile 是本任务唯一启动配置，`ci/pipeline.groovy` 从请求指定 SHA 加载。工作目录相对于本任务 workspace 隔离；同任务禁止并发，不要求独占公司 agent。
