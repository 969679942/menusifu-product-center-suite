# Product Center Recipe Full Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile and promote every one of the 45 contract-backed Product Center SOP cases into the shared Recipe execution model without duplicating page locators or weakening cleanup gates.

**Architecture:** The unified contract traceability index remains the only case inventory. A coverage matrix classifies every case into core create, core CRUD, low dependency CRUD, high dependency CRUD, or negative execution. The compiler emits typed Recipes for all supported catalog entries, while the Recipe flow delegates to existing page, flow, and data-factory implementations for seed, UI action, API verification, UI verification, and finally cleanup.

**Tech Stack:** TypeScript, Playwright Test, JSON contract artifacts, existing Product Center Page/Flow/DataFactory modules.

---

### Task 1: Machine-verifiable coverage matrix

**Files:**
- Create: `automation/recipe/product-center-recipe-coverage.ts`
- Test: `tests/api/product-center-recipe-coverage.contract.spec.ts`
- Modify: `package.json`

- [ ] Write a failing contract test requiring exactly 45 unique traceability cases, 12 currently compiled cases, and 33 migration candidates.
- [ ] Run `npx playwright test tests/api/product-center-recipe-coverage.contract.spec.ts --project=api --reporter=line` and confirm the missing coverage builder failure.
- [ ] Implement deterministic case classification from the source index and the four existing SOP catalogs.
- [ ] Re-run the focused contract and require zero unknown or duplicate cases.

### Task 2: Compile all catalog-backed Recipes

**Files:**
- Modify: `automation/recipe/product-center-recipe-compiler.ts`
- Modify: `automation/recipe/automation-recipe.ts`
- Test: `tests/api/product-center-recipe-compiler.contract.spec.ts`

- [ ] Extend the compiler contract test to require all 45 case IDs in contract order and source binding for every generated Recipe.
- [ ] Run the focused test and confirm it fails at 12 compiled Recipes.
- [ ] Add typed compile branches for core create, low dependency CRUD, high dependency CRUD, and all negative catalog scenarios.
- [ ] Keep unsupported runtime behavior explicit in Recipe adapter IDs; do not introduce route fallbacks or locator guessing.
- [ ] Re-run compiler and validator contracts.

### Task 3: Reuse existing execution backends

**Files:**
- Modify: `adapters/product-center/product-center-recipe-capabilities.ts`
- Modify: `flows/product-center/product-center-recipe.flow.ts`
- Test: `tests/api/product-center-recipe-capability.contract.spec.ts`
- Test: `tests/api/product-center-recipe-flow.contract.spec.ts`

- [ ] Write failing tests for create preparation/registration, low dependency seed/action/assertion, high dependency seed/action/assertion, and negative actions.
- [ ] Run the two focused contracts and confirm missing adapters/capabilities.
- [ ] Register capability IDs that delegate to existing create, low dependency, high dependency, and negative Page/Flow implementations.
- [ ] Generalize Recipe runtime context into a discriminated record/context union while preserving finally cleanup.
- [ ] Re-run the focused contracts and TypeScript checking.

### Task 4: Generate and gate the full suite

**Files:**
- Modify: `scripts/build-product-center-recipes.ts`
- Modify: `scripts/generate-product-center-recipe-spec.ts`
- Modify: `automation/recipe/product-center-recipe-promotion.ts`
- Modify: `automation/recipe/product-center-recipe-metrics.ts`
- Test: `tests/api/product-center-recipe-spec-generator.contract.spec.ts`
- Test: `tests/api/product-center-recipe-promotion.contract.spec.ts`
- Test: `tests/api/product-center-recipe-metrics.contract.spec.ts`

- [ ] Write failing tests requiring 45 compiled Recipes, no unresolved cases, and promotion only after matching 45-case feedback.
- [ ] Generate coverage, Recipe, unresolved, pilot Spec, and metrics artifacts from the same fingerprint.
- [ ] Preserve safety gates for stale feedback, failed UI, unresolved sources, forbidden generated code, and residue.
- [ ] Re-run all Recipe contracts.

### Task 5: Execute in bounded batches and promote

**Files:**
- Modify generated artifacts under `contracts/product-center/recipes/`, `tests/generated/`, and `tests/e2e/`.
- Modify: `package.json`
- Modify: `docs/product-center-sop.md`
- Modify: `contracts/product-center/product-center-production-sop-acceptance.json`

- [ ] Execute core create, low dependency, high dependency, and negative Recipe batches with existing cleanup and checkpoint recovery.
- [ ] Record every batch result in Recipe feedback without exposing credentials or authorization data.
- [ ] Promote only passed Recipes and replace legacy formal commands only when the promoted case set is complete.
- [ ] Run `npm run test:product-center:sop:all:contracts`, `npx tsc --noEmit`, and `npm run accept:product-center`.
- [ ] Verify 45 business cases, 45 promoted Recipes, 34/34 routes, zero UI/API residue, zero incomplete checkpoints, and zero sensitive artifacts.
