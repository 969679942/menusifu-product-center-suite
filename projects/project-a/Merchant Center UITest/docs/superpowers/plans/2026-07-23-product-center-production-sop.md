# Product Center Production SOP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有五实体混合式 UI SOP 扩展为支持断线恢复、API/UI 双终态、五实体 UI 创建、十二扩展实体、反向场景和高效验收的生产级黑盒自动化体系。

**Architecture:** 使用 Playwright Test + TypeScript；API 负责安全造数、服务端断言和逆序清理，Page/Flow 负责真实 UI 操作，SOP catalog 负责合同生成。所有非创建功能采用 API Seed → UI Action → API/UI Verify → finally API Cleanup；UI 创建采用 API Seed Dependencies → UI Create → API/UI Verify → API Cleanup。运行检查点和清理台账只保存 `AUTO_AUDIT_*` 身份、服务端 ID、阶段和非敏感诊断。

**Tech Stack:** TypeScript 5.9、Playwright Test 1.60、Node.js、JSON Schema/JSON checkpoint、现有 ProductCenterApi typed client。

---

### Task 1: Persistent Checkpoint And Cleanup Ledger

**Files:**
- Create: `api/product-center/execution-ledger.ts`
- Create: `api/product-center/recovery-service.ts`
- Modify: `api/product-center/cleanup-registry.ts`
- Modify: `fixtures/product-center.fixture.ts`
- Modify: `test-data/product-center/sop/product-center-sop-data.factory.ts`
- Test: `tests/api/product-center-execution-ledger.contract.spec.ts`

- [ ] **Step 1: Write failing ledger contract tests**

Test atomic creation records, phase transitions, reverse cleanup order, completed entries, redacted serialization and resume of incomplete `AUTO_AUDIT_*` work units.

- [ ] **Step 2: Verify RED**

Run: `npx playwright test tests/api/product-center-execution-ledger.contract.spec.ts --project=api --reporter=line`
Expected: FAIL because `execution-ledger.ts` does not exist.

- [ ] **Step 3: Implement minimal ledger and registry integration**

Define phases `planned | seeded | ui-triggered | mutation-observed | api-verified | ui-verified | cleaning | cleaned | residue-verified | failed`. Persist entity kind, identity variants, server ID, dependency order, phase and redacted error classification using atomic temporary-file replacement.

- [ ] **Step 4: Implement recovery service**

Load incomplete ledger entries, query by ID or exact audit identity, delete only proven `AUTO_AUDIT_*` records, process higher cleanup order first, and mark zero-residue entries complete.

- [ ] **Step 5: Verify GREEN**

Run the ledger contract test and existing API lifecycle tests. Expected: all pass and no secret fields appear in checkpoint JSON.

### Task 2: API And UI Dual Terminal State

**Files:**
- Modify: `pages/product-center/product-center-sop.page.ts`
- Modify: `flows/product-center/product-center-sop.flow.ts`
- Modify: `tests/e2e/product-center-five-hybrid-sop.spec.ts`
- Test: `tests/api/product-center-sop-generator.contract.spec.ts`

- [ ] **Step 1: Write failing assertions for UI terminal verification**

Require edit cases to reopen and show only edited identity; require delete cases to reopen and show neither original nor edited identity. Require ledger phases around trigger, mutation, API verify and UI verify.

- [ ] **Step 2: Verify RED**

Run category edit/delete cases. Expected: FAIL because current flow returns after mutation response without UI reconciliation.

- [ ] **Step 3: Implement page-level reload and identity reads**

Add exact record-presence methods using server ID where available and unique audit owner otherwise. Wait for the business list response before asserting terminal UI state.

- [ ] **Step 4: Verify GREEN**

Run all ten hybrid SOP cases and confirm API/UI dual terminal state plus finally cleanup.

### Task 3: Native UI Create For Five Core Entities

**Files:**
- Create: `sop/product-center/product-center-create-sop.catalog.ts`
- Create: `test-data/product-center/sop/product-center-create-data.factory.ts`
- Modify: `pages/product-center/product-center-sop.page.ts`
- Modify: `flows/product-center/product-center-sop.flow.ts`
- Create: `tests/e2e/product-center-five-create-sop.spec.ts`
- Test: `tests/api/product-center-create-sop.contract.spec.ts`

- [ ] **Step 1: Write failing create catalog tests**

Require five create cases, UI as creation channel, API/UI verification, dependency seed declarations and API-finally cleanup.

- [ ] **Step 2: Verify RED**

Run the create contract test. Expected: FAIL because create catalog and flow do not exist.

- [ ] **Step 3: Implement entities in dependency order**

Implement category, method, material, seasoning, then BOM. For BOM, API-create product/material/recipe-ingredient dependencies and UI-create only the BOM.

- [ ] **Step 4: Verify per entity**

Run one entity at a time, capture final POST response and server ID, verify API/UI visibility, then clean by API.

- [ ] **Step 5: Run stability gate**

Run 15 total core CRUD scenarios for three consecutive rounds. Expected: 45/45 pass and zero residue.

### Task 4: Low-Dependency Entity Hybrid SOP

**Files:**
- Extend: `sop/product-center/product-center-sop.catalog.ts`
- Extend: `test-data/product-center/sop/product-center-sop-data.factory.ts`
- Extend: `pages/product-center/product-center-sop.page.ts`
- Create: `tests/e2e/product-center-low-dependency-hybrid-sop.spec.ts`

- [ ] **Step 1: Add contract cases for material category, taste, spec, addon, print stall, tax, description tag and statistic tag**
- [ ] **Step 2: Verify RED for missing adapters**
- [ ] **Step 3: Implement API seed and reverse cleanup per entity**
- [ ] **Step 4: Verify DOM owner/action contracts with audit-only probes**
- [ ] **Step 5: Implement UI edit/delete and API/UI terminal assertions**
- [ ] **Step 6: Run 16 cases and residue scan**

### Task 5: High-Dependency Entity Hybrid SOP

**Files:**
- Extend the same catalog, factory, page and flow modules
- Create: `tests/e2e/product-center-high-dependency-hybrid-sop.spec.ts`

- [ ] **Step 1: Add recipe ingredient, menu, printer and combo dependency graphs**
- [ ] **Step 2: Write failing cleanup-order contracts**
- [ ] **Step 3: Implement API dependency creation and ID capture**
- [ ] **Step 4: Implement UI edit/delete with final mutation reconciliation**
- [ ] **Step 5: Verify eight cases and zero union residue**

### Task 6: Negative Validation And Boundary SOP

**Files:**
- Create: `sop/product-center/product-center-negative-sop.catalog.ts`
- Create: `tests/e2e/product-center-negative-sop.spec.ts`
- Reuse: `contracts/product-center/field-constraints.json`

- [ ] **Step 1: Generate sourced cases for required, duplicate, whitespace and maximum-length rules**
- [ ] **Step 2: Mark provisional or conflicting rules review-required**
- [ ] **Step 3: Verify empty submit does not emit mutation requests**
- [ ] **Step 4: Verify cancel, duplicate, relation-blocked and backend-error behavior**
- [ ] **Step 5: Clean all audit identities and run residue scan**

### Task 7: Generator, Efficiency And Acceptance

**Files:**
- Extend: `sop/product-center/product-center-sop-generator.ts`
- Modify: `package.json`
- Create: `scripts/product-center-resume-cleanup.ts`
- Modify: `docs/product-center-sop.md`
- Create: `contracts/product-center/product-center-production-sop-acceptance.json`

- [ ] **Step 1: Generate executable create/edit/delete/negative case descriptors**
- [ ] **Step 2: Add entity-sharded and failed-unit rerun commands**
- [ ] **Step 3: Add standalone recovery and cleanup command**
- [ ] **Step 4: Run TypeScript, API contracts, all SOP suites and three-round stability**
- [ ] **Step 5: Run 34-route residue and sensitive scans**
- [ ] **Step 6: Record exact passed, blocked and review-required counts**

## Final Acceptance

- All mutation data starts with `AUTO_AUDIT_*`.
- Every server ID is checkpointed immediately.
- Every non-idempotent retry first reconciles server state.
- Core five entities have create/edit/delete API/UI dual verification.
- Applicable extension entities have edit/delete hybrid SOP or explicit evidence-backed blocked status.
- Runtime interruption recovery leaves no incomplete cleanup ledger entries.
- 34/34 route residue scan has zero hits and zero errors.
- Sensitive scan has zero findings and saved browser auth state count is zero.
