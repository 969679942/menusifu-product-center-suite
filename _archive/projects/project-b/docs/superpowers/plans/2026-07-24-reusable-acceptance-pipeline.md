# Reusable Acceptance Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立项目内一键最终验收、可恢复路由残留扫描、第二清单复用试点和结构化 P0 审核批次。

**Architecture:** 通用内核位于 `utils/acceptance`，只处理清单、浏览器上下文、检查点和脱敏结果；商品中心认证与路由位于 `acceptance/projects` 适配层。CLI 组合已有合同、UI、治理命令并输出统一验收结果。

**Tech Stack:** TypeScript 5.9、Playwright Test 1.60、Node.js、JSON 原子检查点、现有 `waitUntil` 与认证 flow。

---

### Task 1: 通用验收清单与路由检查点

**Files:**
- Create: `utils/acceptance/acceptance-manifest.ts`
- Create: `utils/acceptance/route-scan-checkpoint.ts`
- Test: `tests/api/reusable-acceptance-core.contract.spec.ts`

- [ ] 先写失败测试，定义项目清单校验、稳定指纹、路由唯一性和项目无关约束。
- [ ] 运行目标测试，确认模块不存在。
- [ ] 实现清单类型、校验、指纹和原子检查点，支持跳过同指纹已通过路由。
- [ ] 添加诊断脱敏和旧指纹失效测试并确认通过。

### Task 2: 通用只读路由残留扫描器

**Files:**
- Create: `utils/acceptance/route-residue-scanner.ts`
- Modify: `utils/acceptance/route-scan-checkpoint.ts`
- Test: `tests/api/reusable-route-residue-scanner.contract.spec.ts`

- [ ] 先写失败测试，覆盖零命中、API/UI 命中、单路失败后继续和断点恢复。
- [ ] 运行目标测试，确认缺少扫描器。
- [ ] 实现依赖注入式 route probe、只读有界重试、逐路原子持久化和结果聚合。
- [ ] 重跑目标测试，确认不保存响应体或敏感诊断。

### Task 3: 商品中心适配器与第二清单试点

**Files:**
- Create: `acceptance/projects/merchant-center-auth.adapter.ts`
- Create: `acceptance/projects/product-center.acceptance.ts`
- Create: `acceptance/projects/store-product.acceptance.ts`
- Create: `utils/acceptance/playwright-route-probe.ts`
- Test: `tests/api/merchant-center-acceptance-manifest.contract.spec.ts`

- [ ] 先写失败测试，要求商品中心 34 路、门店商品管理 10 路且共享同一认证适配器。
- [ ] 运行目标测试，确认清单不存在。
- [ ] 实现安全凭据认证适配器和 Playwright 页面探针，不使用固定等待或猜测定位器。
- [ ] 添加静态治理断言，确保通用核心无商品中心硬编码并确认通过。

### Task 4: 一键验收 CLI 与脱敏报告

**Files:**
- Create: `scripts/run-project-acceptance.ts`
- Create: `utils/acceptance/acceptance-orchestrator.ts`
- Modify: `package.json`
- Test: `tests/api/reusable-acceptance-orchestrator.contract.spec.ts`

- [ ] 先写失败测试，要求前置命令失败阻断、路由扫描失败返回非零和报告仅含脱敏证据。
- [ ] 运行目标测试，确认 orchestrator 不存在。
- [ ] 实现命令执行、认证上下文生命周期、扫描、后置安全门禁和统一结果文件。
- [ ] 添加 `accept:product-center`、`accept:product-center:scan`、`accept:store-product:scan` 命令并确认合同测试通过。

### Task 5: P0 审核批次生成器

**Files:**
- Create: `utils/review-batch.ts`
- Create: `scripts/build-product-center-review-batches.ts`
- Modify: `package.json`
- Test: `tests/api/product-center-review-batch.contract.spec.ts`

- [ ] 先写失败测试，要求 94 条按模块分组、每包最多 20 条且无重复遗漏。
- [ ] 运行目标测试，确认生成器不存在。
- [ ] 实现通用批次构建器和商品中心路由到模块适配。
- [ ] 生成 `contracts/product-center/reviews/batches/manifest.json` 及批次文件并验证总数 94。

### Task 6: 实际运行与文档验收

**Files:**
- Modify: `docs/product-center-contract-maintenance.md`
- Modify: `docs/product-center-sop.md`
- Modify: `contracts/product-center/product-center-production-sop-acceptance.json`

- [ ] 运行 TypeScript 与新增合同测试。
- [ ] 运行商品中心 34 路项目内扫描，确认 34/34、命中 0、错误 0。
- [ ] 运行门店商品管理 10 路试点，确认 10/10、命中 0、错误 0。
- [ ] 运行完整合同测试与 AGENTS 治理检查。
- [ ] 更新维护命令、复用边界和验收证据，不执行 `contract:promote`。

