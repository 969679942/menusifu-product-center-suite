# Contract-Driven Incremental Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将合同字段变化精确转换为可执行 Playwright 边界用例，并生成可复用的增量计划和结果证据。

**Architecture:** 通用影响分析只处理变更引用和用例来源引用；商品中心通过 SOP 描述符提供 `sourceIds/specFile/testTitle`。结构化人工决定编译为模块策展，增量 runner 只执行精确命中的用例并回写脱敏结果。

**Tech Stack:** TypeScript 5.9、Playwright Test 1.60、Node.js、JSON 合同与现有商品中心模块维护框架。

---

### Task 1: 通用影响分析内核

**Files:**
- Create: `utils/contract-change-impact.ts`
- Modify: `utils/product-center-contract-diff.ts`
- Test: `tests/api/product-center-contract-diff.contract.spec.ts`

- [ ] 先写失败测试，要求字段 ID 精确命中来源相同的边界用例，且 `unresolved` 变化不按路由扩散。
- [ ] 运行目标测试，确认当前实现错误命中路由下普通用例。
- [ ] 实现 `planContractChangeImpact(changes, cases, options)`，返回 `caseId/match/changeIds`。
- [ ] 将商品中心 diff 适配到通用内核，并保留无精确来源时的路由降级。
- [ ] 重跑测试确认通过。

### Task 2: 可执行边界合同与追溯

**Files:**
- Modify: `sop/product-center/product-center-negative-sop.catalog.ts`
- Modify: `sop/product-center/product-center-sop-generator.ts`
- Modify: `utils/product-center-test-contract.ts`
- Test: `tests/api/product-center-negative-sop.contract.spec.ts`
- Test: `tests/api/product-center-sop-generator.contract.spec.ts`

- [ ] 先写失败测试，要求四条标签边界定义包含 `sourceId/testTitle/maxLength/acceptedLength/rejectedLength/locatorKey`。
- [ ] 运行测试确认当前目录只有七条反向场景。
- [ ] 添加四条边界定义并让负向描述符携带 `sourceIds`。
- [ ] 将 `sourceIds` 写入 traceability，区分 UI-only 无清理场景和 API/UI 清理场景。
- [ ] 重跑目录与生成器测试确认 45 条描述符、11 条负向场景。

### Task 3: 标签边界页面对象与真实用例

**Files:**
- Create: `pages/product-center/product-center-negative.page.ts`
- Modify: `tests/e2e/product-center-negative-sop.spec.ts`

- [ ] 先写页面合同测试或目录断言，锁定 `maxlength=50/10` 的唯一定位器。
- [ ] 实现页面对象：等待 `brand-tags/page`、点击唯一“添加”、打开唯一弹窗、按 locator key 获取唯一输入框。
- [ ] 为四个字段生成中文测试标题，分别验证最大值完整保留和最大值加一被截断。
- [ ] 不点击“确定”，关闭弹窗后结束，确保无 mutation 请求。
- [ ] 运行四条目标 UI 用例确认通过。

### Task 4: 增量计划与执行结果

**Files:**
- Create: `utils/incremental-test-plan.ts`
- Create: `scripts/plan-product-center-incremental-tests.ts`
- Create: `scripts/run-product-center-incremental-tests.ts`
- Modify: `package.json`
- Test: `tests/api/product-center-incremental-test-plan.contract.spec.ts`

- [ ] 先写失败测试，要求当前合同差异只生成四条标签边界用例。
- [ ] 实现纯函数计划构建器，输出唯一 spec、精确 grep、来源变化和计划指纹。
- [ ] 添加 `plan:product-center:incremental` 与 `test:product-center:incremental` 命令。
- [ ] runner 使用 Playwright CLI 执行计划，读取本次计时报告并写入脱敏结果。
- [ ] 运行增量命令，确认四条用例及结果文件全部通过。

### Task 5: 结构化人工决定编译

**Files:**
- Create: `utils/human-review-decision-compiler.ts`
- Create: `contracts/product-center/reviews/human-review-decisions.json`
- Modify: `contracts/product-center/modules/human-review-decisions.curation.ts`
- Test: `tests/api/product-center-human-review-decision.contract.spec.ts`

- [ ] 先写失败测试，要求字段边界、自动化排除和未决项解决均由结构化决定编译。
- [ ] 实现通用决定类型与编译器，拒绝缺少审核人、日期、来源和目标 ID 的记录。
- [ ] 将当前四条人工结论迁移到 JSON，策展文件只负责调用编译器。
- [ ] 重建合同并验证 P0 仍为 94、字段边界与排除规则保持不变。

### Task 6: 全量验收与文档

**Files:**
- Modify: `scripts/verify-product-center-contract.ts`
- Modify: `contracts/product-center/product-center-production-sop-acceptance.json`
- Modify: `docs/product-center-contract-maintenance.md`
- Modify: `docs/product-center-sop.md`

- [ ] 将 traceability 验收从硬编码 41 改为当前生成目录的真实描述符数量。
- [ ] 运行 TypeScript、合同测试、反向 SOP、增量测试与全量 SOP。
- [ ] 运行路由残留、敏感信息、认证状态和检查点扫描。
- [ ] 记录 45 条描述符、四条增量边界结果、全量耗时和零残留证据。
- [ ] 不执行 `contract:promote`，继续保持人工审核门禁。
