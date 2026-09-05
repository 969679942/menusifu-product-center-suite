# 商品中心 Recipe 编译器实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将商品中心已审核资料编译为无 selector 的可执行 Recipe，并通过通用 Flow 运行代表性 UI 自动化试点。

**Architecture:** Recipe 保存执行合同，能力注册表连接稳定 capability ID 与 Page，Compiler 只生成唯一可解析项并把歧义分流，Flow 负责 seed、执行、验证和 cleanup。现有正式 SOP 保持不变，生成 Spec 先位于 `tests/generated`。

**Tech Stack:** TypeScript 5.9、Playwright Test 1.60、现有 Page/Flow/API fixture、JSON 合同与原子反馈文件。

---

### Task 1: Recipe 合同与校验

**Files:**
- Create: `automation/recipe/automation-recipe.ts`
- Create: `automation/recipe/recipe-validator.ts`
- Test: `tests/api/automation-recipe.contract.spec.ts`

- [ ] 写失败测试，覆盖有效编辑、来源、能力、mutation、seed/cleanup、边界和 selector 禁令。
- [ ] 运行目标测试，确认模块缺失导致预期失败。
- [ ] 实现最小类型、值绑定校验、结构校验和稳定指纹。
- [ ] 重跑目标测试并确认全部通过。

### Task 2: Page 能力注册表

**Files:**
- Create: `automation/recipe/capability-registry.ts`
- Create: `adapters/product-center/product-center-recipe-capabilities.ts`
- Test: `tests/api/product-center-recipe-capability.contract.spec.ts`

- [ ] 写失败测试，定义能力唯一性、动作兼容和必填输入。
- [ ] 运行目标测试，确认注册表不存在。
- [ ] 实现通用注册表及商品分类、做法组、统计标签能力适配器。
- [ ] 重跑目标测试，确认 Recipe 不接触 locator。

### Task 3: Recipe 编译与未决分流

**Files:**
- Create: `automation/recipe/product-center-recipe-compiler.ts`
- Create: `scripts/build-product-center-recipes.ts`
- Create: `contracts/product-center/recipes/product-center-pilot-recipes.json`
- Create: `contracts/product-center/recipes/product-center-recipe-unresolved.json`
- Test: `tests/api/product-center-recipe-compiler.contract.spec.ts`

- [ ] 写失败测试，要求五条代表 Recipe、稳定来源和歧义未决分流。
- [ ] 运行目标测试，确认编译器不存在。
- [ ] 实现白名单编译映射、统一校验和脱敏 unresolved 输出。
- [ ] 运行构建脚本并校验生成物可重复、无 selector。

### Task 4: 通用 Recipe Flow

**Files:**
- Create: `flows/product-center/product-center-recipe.flow.ts`
- Test: `tests/api/product-center-recipe-flow.contract.spec.ts`

- [ ] 写失败测试，覆盖 seed、能力顺序、API/UI 验证、finally cleanup 和删除幂等清理。
- [ ] 运行目标测试，确认 Flow 不存在。
- [ ] 实现值绑定解析、能力调度和结构化反馈，不复制 Page 操作。
- [ ] 重跑目标测试，确认失败时仍清理且不盲目重放删除。

### Task 5: 生成薄 Spec 与试点

**Files:**
- Create: `scripts/generate-product-center-recipe-spec.ts`
- Create: `tests/generated/product-center-recipe-pilot.generated.spec.ts`
- Modify: `package.json`
- Test: `tests/api/product-center-recipe-spec-generator.contract.spec.ts`

- [ ] 写失败测试，要求生成 Spec 只有参数化调用且中文标题。
- [ ] 运行目标测试，确认生成器不存在。
- [ ] 实现确定性 Spec 生成器和 `build/test:product-center:recipes` 命令。
- [ ] 生成试点 Spec 并运行商品分类、做法组、统计标签边界。

### Task 6: 反馈闭环与完整验收

**Files:**
- Create: `automation/recipe/recipe-feedback.ts`
- Create: `output/recipes/product-center-pilot-feedback.json`
- Modify: `tests/api/product-center-governance.contract.spec.ts`
- Modify: `docs/product-center-sop.md`

- [ ] 写失败测试，要求反馈脱敏、稳定分类且不得自动修改合同。
- [ ] 实现反馈聚合和治理扫描，禁止 selector、固定等待与敏感字段。
- [ ] 运行 `npx tsc --noEmit`、Recipe 合同和生成试点。
- [ ] 运行现有全部合同、46 条正式 UI 和 34 路新鲜残留扫描。
- [ ] 确认零残留、零未完成检查点、零认证状态和零敏感生成物。

