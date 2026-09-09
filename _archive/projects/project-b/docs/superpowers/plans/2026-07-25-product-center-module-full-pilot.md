# Product Center Module Full Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable module-scoped full coverage gates and prove them with a category route pilot from formal test materials.

**Architecture:** Keep semantic, coverage, and executability auditors pure. Add an explicit coverage curation layer between raw UI evidence and the stable denominator, then propagate stable coverage IDs through Recipe and TestCase IR artifacts. Generate a deterministic category pilot package and execute only automation-eligible Recipe cases.

**Tech Stack:** TypeScript, Playwright Test, JSON contracts, existing Recipe compiler and product-center fixtures.

---

### Task 1: Scope And Coverage Contracts

**Files:**
- Modify: `utils/product-center-coverage-denominator.ts`
- Modify: `utils/product-center-test-case-ir.ts`
- Test: `tests/api/product-center-test-case-preflight.contract.spec.ts`

- [ ] Add failing tests for explicit-only coverage and module-route target filtering.
- [ ] Run the focused contract test and confirm expected failures.
- [ ] Implement coverage matching mode and `module-full` target selection.
- [ ] Re-run the focused contract test.

### Task 2: Stable Coverage Curation

**Files:**
- Create: `contracts/product-center/test-cases/product-center-coverage-curation.ts`
- Modify: `scripts/build-product-center-test-case-ir.ts`
- Test: `tests/api/product-center-test-case-preflight.contract.spec.ts`

- [ ] Add a failing test that collapses duplicate raw controls into stable coverage items.
- [ ] Implement source-consuming coverage groups.
- [ ] Curate the category route to seven stable denominator items.
- [ ] Rebuild and verify the denominator.

### Task 3: Recipe Coverage Propagation

**Files:**
- Create: `sop/product-center/product-center-test-case-coverage.catalog.ts`
- Modify: `automation/recipe/automation-recipe.ts`
- Modify: `automation/recipe/product-center-recipe-compiler.ts`
- Modify: `sop/product-center/product-center-test-case-ir.catalog.ts`
- Test: `tests/api/product-center-recipe-compiler.contract.spec.ts`

- [ ] Add a failing test for category Recipe coverage IDs.
- [ ] Add explicit coverage IDs to compiled Recipe artifacts.
- [ ] Carry Recipe coverage IDs into TestCase IR.
- [ ] Rebuild Recipe artifacts and run compiler contracts.

### Task 4: Formal Case Intake Pilot

**Files:**
- Modify: `contracts/product-center/modules/brand-item.module.ts`
- Create: `scripts/build-product-center-category-pilot.ts`
- Create: generated pilot input, bindings, and audit JSON under `contracts/product-center/test-cases/pilots` and `output/test-case-audit/product-center`.
- Test: `tests/api/product-center-category-pilot.contract.spec.ts`

- [ ] Add a failing test for seven cases, seven covered items, six executable and one manual.
- [ ] Add the formal business rule with exact file and case source.
- [ ] Build deterministic pilot input and source bindings.
- [ ] Run `module-full` audit for `brand-item` and `/pp/brand/category`.

### Task 5: CLI And Documentation

**Files:**
- Modify: `scripts/audit-product-center-test-case-input.ts`
- Modify: `package.json`
- Modify: `docs/product-center-test-case-intake.md`

- [ ] Add `module-full`, `--module`, and optional `--route` parsing.
- [ ] Add category pilot build and UI execution commands.
- [ ] Document scope behavior and pilot outputs.

### Task 6: Execution And Acceptance

**Files:**
- Modify: `contracts/product-center/product-center-production-sop-acceptance.json`
- Modify: `tests/api/product-center-production-sop-acceptance.contract.spec.ts`

- [ ] Build contract, denominator, Recipe, and category pilot artifacts.
- [ ] Run six category Recipe UI cases with existing API lifecycle handling.
- [ ] Verify zero failed cases and no incomplete cleanup checkpoint.
- [ ] Run TypeScript and complete production contract aggregation.
