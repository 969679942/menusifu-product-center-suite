# 商品中心合同到 Recipe 增量闭环实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用统一合同稳定记录驱动 12 条 Recipe 的增量编译、正式晋级和质量度量。

**Architecture:** 来源索引从 traceability 展开真实合同记录；Compiler 只消费验证后的来源索引；增量计划按 changed record ID 精确选择；晋级器校验合同、UI 反馈和安全门禁后生成正式 Spec；指标聚合编译与反馈结果。

**Tech Stack:** TypeScript 5.9、Playwright Test 1.60、现有统一合同/差异 JSON、Recipe/Flow/Page、确定性 JSON 生成。

---

### Task 1: 真实合同来源索引

**Files:**
- Create: `automation/recipe/product-center-recipe-source-index.ts`
- Test: `tests/api/product-center-recipe-source-index.contract.spec.ts`

- [ ] 写失败测试，覆盖唯一追溯、真实来源展开、缺失记录和 stage gap。
- [ ] 运行目标测试，确认模块缺失。
- [ ] 实现来源索引和稳定指纹。
- [ ] 确认 45 条追溯可索引且试点来源不含合成 ID。

### Task 2: 扩展 12 条 Recipe

**Files:**
- Modify: `automation/recipe/automation-recipe.ts`
- Modify: `automation/recipe/product-center-recipe-compiler.ts`
- Modify: `adapters/product-center/product-center-recipe-capabilities.ts`
- Modify: `flows/product-center/product-center-recipe.flow.ts`
- Test: `tests/api/product-center-recipe-compiler.contract.spec.ts`
- Test: `tests/api/product-center-recipe-capability.contract.spec.ts`

- [ ] 写失败测试，要求五实体 edit/delete 与两个边界场景绑定合同来源。
- [ ] 实现 traceabilityId、来源索引输入和五实体能力。
- [ ] 生成 12 条 Recipe，unresolved 为 0。
- [ ] 重跑 Recipe 合同与 TypeScript。

### Task 3: 合同差异增量编译

**Files:**
- Create: `automation/recipe/product-center-incremental-recipe-plan.ts`
- Create: `scripts/build-product-center-incremental-recipes.ts`
- Create: `contracts/product-center/recipes/product-center-recipe-incremental-plan.json`
- Test: `tests/api/product-center-incremental-recipe.contract.spec.ts`

- [ ] 写失败测试，验证 source ID 精确命中、无关变化跳过和未知 case 分流。
- [ ] 实现增量计划与确定性构建脚本。
- [ ] 生成当前差异计划并验证无路由扩散。

### Task 4: 晋级门禁与正式迁移

**Files:**
- Create: `automation/recipe/product-center-recipe-promotion.ts`
- Create: `scripts/promote-product-center-recipes.ts`
- Create: `contracts/product-center/recipes/product-center-recipe-promotion.json`
- Create: `tests/e2e/product-center-recipe-core.generated.spec.ts`
- Modify: `scripts/generate-product-center-recipe-spec.ts`
- Modify: `tests/e2e/product-center-negative-sop.spec.ts`
- Modify: `package.json`
- Test: `tests/api/product-center-recipe-promotion.contract.spec.ts`

- [ ] 写失败测试，覆盖过期反馈、失败 UI、unresolved、安全残留和通过门槛。
- [ ] 实现晋级判定和正式 Spec 生成。
- [ ] 运行 12 条 generated Recipe，生成最新反馈。
- [ ] 晋级后替换正式核心混合 SOP 和两个统计标签边界，业务总数保持 45。

### Task 5: 质量指标

**Files:**
- Create: `automation/recipe/product-center-recipe-metrics.ts`
- Create: `scripts/build-product-center-recipe-metrics.ts`
- Create: `contracts/product-center/recipes/product-center-recipe-metrics.json`
- Test: `tests/api/product-center-recipe-metrics.contract.spec.ts`

- [ ] 写失败测试，覆盖覆盖率、来源绑定率、人工修正率、漂移率和失败分类。
- [ ] 实现指标聚合与确定性输出。
- [ ] 将指标命令接入 Recipe 构建和统一治理。

### Task 6: 全量验收

**Files:**
- Modify: `tests/api/product-center-governance.contract.spec.ts`
- Modify: `docs/product-center-sop.md`
- Modify: `contracts/product-center/product-center-production-sop-acceptance.json`

- [ ] 运行 TypeScript 和全部 Recipe/统一合同测试。
- [ ] 运行正式 full，确认 46/46 且无重复业务用例。
- [ ] 运行 34 路新鲜残留扫描和安全门禁。
- [ ] 更新 12 条 Recipe、增量、晋级和指标证据。

