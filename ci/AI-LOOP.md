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
# 自动任务固定入口：发现本任务的新构建（含手动构建），下载并列出仍待 AI 分析的结果
./ci/jenkins.ps1 watch
# 可选的一次性等候入口
./ci/push-trigger-analyze.ps1 -Scope pilot
```

`contracts` 是基础合同验证；`pilot` 在合同验证后执行 `business-selection.json` 固定的十条正式用例。合同测试不具有业务通过权限。十条试点使用 TAP 的运行器、执行授权、来源门禁、标准收据和清理门禁；不能直接以 Playwright `--grep` 绕过公共执行流程。

## 本机 AI 调度

本机源项目发生代码变更时，先执行 `python ci/sync-sources.py plan`，读取并审查 `output/jenkins/source-export-plan.json`。确认属于本任务影响范围后由 AI 执行 `python ci/sync-sources.py apply`，再查看 Git diff。该导出拒绝目录穿越、凭据值及运行产物，且有源/目标双指纹校验防止覆盖期间发生的修改。生成的系统适配目录不能从旧快照覆盖；在集成工作区按变化重建相应 catalog/manifest，并执行静态门禁。不得将无关原始项目改动一并提交。

本任务已配置应用内 heartbeat `jenkins-ai`，每五分钟检查一次。调度依赖本机和 Codex 应用运行、网络可达及账户执行额度；不是部署在 Jenkins 的 AI 服务。Jenkins 只执行固定提交并归档，本机 AI 执行分析和修改。

用户无需在每次聊天中要求获取 Jenkins 结果。自动任务保存的指令就是每轮执行授权和入口；不能因最新消息未提 Jenkins、旧检查点已完成、或聊天处于空闲而跳过检查。仅保持 Codex 打开即可使用现有定时机制，不部署关闭应用后的后台 AI 服务。

每次唤起先运行 `watch`。它只扫描 `watch-policy.json` 指定的本任务，自构建 34 基线开始分页发现全部保留构建；独立跟踪手动构建，不覆盖已有提交检查点。`watch-checkpoint.json` 的 `collect` 表示需要下载，`review` 表示结果已下载但仍需 AI 分析，`wait` 表示运行中，`diagnose-identity` 表示参数缺失或不合法，不能据此认定产品失败。传输阶段的 `analyzed` 仅表示脚本核验完成，不等于 AI 已完成分析。

对每个待分析构建读取 `build-N/analysis.json`、`pilot-envelope.json`、`receipt-audit.json`、`business/<runId>/run-report.json`、`diagnostics.json`、`evidence-ledger.json`。AI 先读取原始 TAP 的 `AGENTS.md`、`FINAL-GOAL.md` 和相关公共合同，再读取 MC 适配器/用例/业务规则；使用 TAP 的收据验证与失败分类能力解释结果。成功且证据完整时登记结论，不重复执行业务。技术问题自动诊断和修复；只有正式业务来源冲突转业务裁决。

AI 分析与处置完成后，亲自写入该构建的 `ai-review.json`：`buildNumber`、`gitSha`、`requestId` 必须与构建一致，另含 `status`、`actionRequired`、中文 `conclusion`、本次读取的相对 `evidence` 路径数组、`reviewedAt`。仅当无需后续动作时设置 `status: complete`、`actionRequired: none`；需要修复或等待验证时保留未完成状态并记录关联修复提交/构建，不重复提交同一修复。脚本不得自动生成 AI 已分析事实。收据缺失、身份不匹配、结论为空或仍需修复的记录不能关闭待办。

传输脚本只发现、下载和核验，不会自行推理或更改业务规则。AI 必须基于这些证据作出诊断并完成修复。

1. 构建仍在队列/运行：记录状态，不重复提交。
2. 已完成且身份不匹配/选择集不完整：保留原始分类，自动修复传输或执行技术问题。
3. 产品行为尚未被当前 UI/API 证明：只能登记技术、环境、证据或合同问题，不登记产品缺陷。
4. 技术修复：先证明影响范围和来源，再做最小改动及定向验证；同步源项目和集成工作区，提交、推送、重新触发。
5. 文档/报告变化：不因新 SHA 自动重跑已通过业务用例；记录影响判定。
6. 正式来源冲突：生成可执行的业务裁决材料，不通过放宽断言、减少选择集或修改历史通过状态消除失败。
7. 无新增工作时静默；有实质变化、完成、失败或必需用户动作时报告。

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
