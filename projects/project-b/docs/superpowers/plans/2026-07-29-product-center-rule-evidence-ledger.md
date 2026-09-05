# Product Center Rule Evidence Ledger Implementation Plan

> 2026-07-29 来源复核修订：原计划把旧 AIQA 汇总误列为正式规则。本轮实际实现以 `legacy=3 / formal=0 / acceptance=0` 为准；4 条旧规则差异只进入 review，不阻止 9 条 XMind 场景进入 Probe。新增场景族覆盖分母，避免节级覆盖掩盖标准编辑、套餐和加料缺口。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为商品 canonical 试点建立正式规则、候选规则、运行事实相互隔离且可统一查询的规则证据账本，并通过双执行通道阻止候选规则被误判为正式规则。

**Architecture:** 正式业务规则 Markdown 保持只读，精确绑定与候选规则分别存储；纯函数构建统一 registry、校验冲突并计算执行通道和晋级建议。canonical Claim 只保存稳定规则引用，运行证据作为独立输入，所有派生产物由脚本确定性重建。

**Tech Stack:** TypeScript、Playwright Test API 合同、JSON 合同、现有 `tsx` 构建脚本、SHA-256 指纹和安全扫描工具。

---

### Task 1: 规则账本领域合同

**Files:**
- Create: `utils/product-center-rule-evidence-ledger.ts`
- Create: `tests/api/product-center-rule-evidence-ledger.contract.spec.ts`

- [ ] **Step 1: 编写失败合同**

合同覆盖：正式/候选 ID 唯一、来源不可为空、候选规则不得自称 `formal`、正式规则必须有精确 binding、状态到执行通道映射、一次运行不得建议 `formal`、反例必须产生冲突。

- [ ] **Step 2: 运行 RED**

Run: `npx playwright test tests/api/product-center-rule-evidence-ledger.contract.spec.ts --project=api`

Expected: FAIL，提示 `product-center-rule-evidence-ledger` 模块不存在。

- [ ] **Step 3: 最小实现**

实现 `buildProductCenterRuleRegistry()`、`validateProductCenterRuleRegistry()`、`recommendProductCenterRuleStatus()` 和 `selectProductCenterRuleExecutionChannel()`。执行通道规则固定为：无冲突 `formal -> acceptance`，`provisional|observed|supported -> probe`，其余状态 `-> none`。

- [ ] **Step 4: 运行 GREEN**

Run: `npx playwright test tests/api/product-center-rule-evidence-ledger.contract.spec.ts --project=api`

Expected: PASS。

### Task 2: 正式绑定与候选规则分离

**Files:**
- Create: `contracts/product-center/business-rules/product-center-item-formal-rule-bindings.json`
- Create: `contracts/product-center/business-rules/product-center-item-candidate-rules.json`
- Create: `scripts/build-product-center-item-rule-registry.ts`
- Modify: `package.json`
- Test: `tests/api/product-center-rule-evidence-ledger.contract.spec.ts`

- [ ] **Step 1: 扩展失败合同**

要求正式 binding 精确引用 `商品中心业务规则.md` 中的章节和原文；9 条候选规则逐一引用 canonical Claim；正式源和候选源路径必须不同；统一 registry 只能由构建脚本写入 `generated` 目录。

- [ ] **Step 2: 运行 RED**

Run: `npx playwright test tests/api/product-center-rule-evidence-ledger.contract.spec.ts --project=api`

Expected: FAIL，缺少源文件或 registry 构建入口。

- [ ] **Step 3: 添加最小数据和构建器**

正式 binding 仅记录当前已精确核验的分类叶子、`BR-ITEM-010` 和行业商品继承范围；候选账本写入 9 条 XMind 场景规则。构建器校验正式原文、生成 SHA-256 指纹、统一 registry 和 review 报告，并运行敏感扫描。

- [ ] **Step 4: 添加构建命令并运行 GREEN**

Run: `npm run build:product-center:item-rule-registry`

Expected: 生成 `contracts/product-center/business-rules/generated/product-center-item-rule-registry.json` 与 `output/test-case-audit/product-center/item-rule-review-latest.json`。

### Task 3: canonical Claim 规则引用

**Files:**
- Modify: `utils/product-center-canonical-item-test-plan.ts`
- Modify: `scripts/build-product-center-item-canonical-test-plan.ts`
- Modify: `tests/api/product-center-canonical-item-test-plan.contract.spec.ts`

- [ ] **Step 1: 编写失败合同**

要求每个 Claim 具有 `candidateRuleIds`；已核验 Claim 可具有 `formalRuleBindingIds`；运行证据初始为空；case 和 automation binding 只携带规则 ID，不复制规则正文；冲突规则维持 `review-required`。

- [ ] **Step 2: 运行 RED**

Run: `npx playwright test tests/api/product-center-canonical-item-test-plan.contract.spec.ts --project=api`

Expected: FAIL，Claim 缺少规则引用。

- [ ] **Step 3: 注入 registry 绑定**

构建脚本先构建规则 registry，再按 canonical ID/Claim ID 注入规则引用。验证器拒绝未知规则、候选规则缺失、规则正文复制和第一 capability 非 `navigation.sidebar.open`。

- [ ] **Step 4: 重建并运行 GREEN**

Run: `npm run build:product-center:item-canonical`

Run: `npx playwright test tests/api/product-center-canonical-item-test-plan.contract.spec.ts --project=api`

Expected: 9 条用例 Claim 引用完整，4 条冲突仍未放行，39 条 blocked 不变。

### Task 4: Probe/Acceptance 与晋级门禁

**Files:**
- Modify: `utils/product-center-rule-evidence-ledger.ts`
- Modify: `tests/api/product-center-rule-evidence-ledger.contract.spec.ts`

- [ ] **Step 1: 编写验证矩阵失败合同**

覆盖一次支持证据只建议 `observed`、正向/反向/要求的边界与作用域全部覆盖才建议 `supported`、同一数据重复不增加维度、清理失败不计入支持证据、任何反例产生 `conflict`、没有人工批准绝不建议 `formal`。

- [ ] **Step 2: 运行 RED**

Run: `npx playwright test tests/api/product-center-rule-evidence-ledger.contract.spec.ts --project=api`

Expected: FAIL，验证矩阵或晋级建议不完整。

- [ ] **Step 3: 实现纯函数门禁**

按 `evidenceId + dataVariantId + dimension` 去重；只接受具有版本指纹、环境、角色、UI/API 引用及 `cleanupVerified=true` 的支持证据。运行证据只生成建议，不修改候选源文件。

- [ ] **Step 4: 运行 GREEN**

Run: `npx playwright test tests/api/product-center-rule-evidence-ledger.contract.spec.ts --project=api`

Expected: PASS。

### Task 5: 统一验证与恢复点

**Files:**
- Modify: `contracts/product-center/test-manifests/product-center-contract-tests.json`
- Modify: `D:/Menusifu/Merchant Center/.memory/product-center-current-state.md`
- Modify: `D:/Menusifu/Merchant Center/.memory/product-center-recovery-point.md`

- [ ] **Step 1: 注册新合同并重建派生产物**

Run: `npm run build:product-center:item-rule-registry && npm run build:product-center:item-canonical`

- [ ] **Step 2: 定向验证**

Run: `npx playwright test tests/api/product-center-rule-evidence-ledger.contract.spec.ts tests/api/product-center-canonical-item-test-plan.contract.spec.ts --project=api`

- [ ] **Step 3: 全量静态验证**

Run: `npx tsc --noEmit`

Run: `npm run test:product-center:contract`

Run: `git diff --check`

Expected: 全部退出码为 0；安全扫描、敏感项、隐藏 DOM 证据、sidebar 入口和未知规则引用均为 0。

- [ ] **Step 4: 更新恢复点**

记录新 registry 的分母、各状态数量、冲突数量、执行通道数量、未运行真实 UI 的边界和下一工作单元。按当前项目约束不创建分支、不提交、不 push。
