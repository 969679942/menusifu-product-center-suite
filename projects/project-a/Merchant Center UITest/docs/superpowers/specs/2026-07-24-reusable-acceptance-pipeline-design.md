# Reusable Acceptance Pipeline Design

## Goal

将商品中心最终验收收敛为项目内一条命令，并把路由残留扫描、断点续跑、脱敏结果、项目清单和人工审核批次做成可复用能力。使用商品中心全量清单和门店商品管理子清单验证同一内核不依赖具体实体或路由。

## Scope

- 项目内原生路由扫描，不再调用 `TestOps/services/runner` 旧脚本。
- 复用现有安全凭据源和认证 flow，每次验收只登录一次并共享 BrowserContext。
- 每条路由独立记录结果；中断后只重跑当前清单中未通过的路由。
- 只读页面访问可按 5、15、30、60 秒有界退避重试；不执行任何写操作。
- 输出只保留路由、状态、命中数量、错误分类和脱敏诊断，不持久化响应体、Cookie、Token 或 storage state。
- 提供商品中心 34 路清单及门店商品管理 10 路试点清单。
- 将 94 条 P0 项按模块和固定批量生成审核包，人工结论继续进入现有结构化决定编译器。
- 不接入 CI，不执行 `contract:promote`，不增加无来源业务断言。

## Architecture

### Generic core

`utils/acceptance/` 只接收结构化项目清单和已认证 BrowserContext。核心包含：

- manifest 校验与稳定指纹；
- 原子 JSON 路由检查点；
- 页面及 API 响应中的审计标识检测；
- 只读瞬态重试；
- 验收结果聚合与脱敏。

核心不得导入 `product-center` 模块、商品中心实体、Brand ID 或固定路由。

### Project adapters

`acceptance/projects/` 保存项目清单和认证适配器。商品中心适配器负责读取现有模块路由、`appConfig`、安全凭据和 `establishMerchantCenterSession`。门店商品管理试点只替换路由集合，复用相同认证适配器和扫描内核。

### Orchestrator

`scripts/run-project-acceptance.ts` 按清单执行：

1. 运行配置的前置命令；
2. 检查未完成 CRUD 检查点和敏感生成物；
3. 建立一次认证上下文；
4. 从路由检查点恢复并扫描未完成路由；
5. 写入脱敏结果；
6. 再次执行安全门禁并以退出码表达通过或失败。

商品中心完整命令执行合同构建、合同验证、合同测试、全量 SOP 和 34 路扫描。门店商品管理试点命令执行相同扫描内核但只覆盖所属 10 路，用于证明清单可替换。

## Route Readiness

页面导航使用 `domcontentloaded`，随后通过 `waitUntil()` 等待以下任一明确终态：业务 API JSON 响应、页面出现可见主内容、登录页或商户选择页。禁止 `waitForTimeout`、`networkidle`、候选定位器遍历、`first/last/nth/or`。

业务响应在页面导航前挂载监听器。每个响应体只在内存中递归检测 `AUTO_AUDIT_` 标识；报告只记录命中数量和脱敏后的标识，不保存完整响应。

## Checkpoint And Recovery

检查点以 `projectId + manifestFingerprint` 标识扫描批次，每条路由包含 `pending/running/passed/failed`、尝试次数、命中数量和脱敏诊断。每个工作单元开始前写 `running`，结束后原子写终态。重连后跳过 `passed`，从第一个非通过路由继续。

旧指纹检查点不复用，避免路由集合变化后漏扫。认证失败或商户漂移阻断全部扫描；单路只读瞬态故障在本地重试耗尽后写 `failed`，其他路由继续执行。

## Review Batches

审核批次生成器读取 `p0-review-items.json` 和模块路由索引，按模块分组后每 20 条生成一个 JSON 包。每条保留稳定 ID、来源、需确认问题和建议动作；无法映射模块的记录进入 `shared`。生成器不修改合同，也不把待确认项变成自动化断言。

## Acceptance Criteria

- 通用核心静态扫描不存在商品中心路由、实体名、Brand ID 或 `product-center` 导入。
- 商品中心清单为 34 路，门店商品管理试点清单为 10 路，两个清单使用同一 runner。
- 单元测试证明路由断点恢复、指纹失效、敏感诊断脱敏、失败后继续和零命中通过。
- 实际商品中心扫描 34/34 无错误、命中 0；门店商品管理试点 10/10 无错误、命中 0。
- P0 审核包合计 94 条且无重复、无遗漏。
- TypeScript、合同测试、AGENTS 治理测试全部通过。

