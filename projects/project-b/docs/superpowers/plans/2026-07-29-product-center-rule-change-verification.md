# Product Center Rule Change Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fail-closed L1-L4 rule-change impact analyzer and static verification runner that never starts UI automatically.

**Architecture:** A pure utility computes associations and level selection from structured confirmations plus explicit changed paths. A JSON manifest owns allowed static commands, while a thin CLI validates, reports, and executes the selected profile with `shell=false`.

**Tech Stack:** TypeScript, Node.js, Playwright API contracts, JSON manifests, npm scripts.

---

### Task 1: Define RED contracts

**Files:**
- Create: `tests/api/product-center-rule-change-verification.contract.spec.ts`
- Modify: `contracts/product-center/test-manifests/product-center-contract-tests.json`

- [ ] Write contracts for L1, grouped L2, shared-file L3, UI-risk L4, manifest command safety and `TC-ITEM-STD-007` replay.
- [ ] Run `npx playwright test tests/api/product-center-rule-change-verification.contract.spec.ts --project=api --reporter=line` and confirm failure because the analyzer and manifest do not exist.

### Task 2: Implement the pure analyzer

**Files:**
- Create: `utils/product-center-rule-change-impact.ts`
- Modify: `contracts/product-center/reviews/product-center-item-rule-confirmations.json`

- [ ] Add `ruleGroupId` to the two independently confirmed category rules.
- [ ] Implement exact rule-group closure, path-based escalation and fail-closed input validation.
- [ ] Re-run the contract and confirm analyzer cases pass while runner/manifest cases remain RED.

### Task 3: Implement the manifest and runner

**Files:**
- Create: `contracts/product-center/test-manifests/product-center-rule-change-verification.json`
- Create: `scripts/verify-product-center-rule-change.ts`
- Modify: `package.json`

- [ ] Define static-only commands for L1, L2 and L3; define no commands for L4.
- [ ] Implement CLI parsing, atomic report writing, `--plan-only`, `spawnSync` execution and L4 authorization blocking.
- [ ] Add `verify:product-center:rule-change` npm entry.
- [ ] Re-run the contract to GREEN.

### Task 4: Verify the real replay and regression boundary

**Files:**
- Modify: `.memory/product-center-current-state.md`
- Modify: `.memory/product-center-recovery-point.md`

- [ ] Run `npm run verify:product-center:rule-change -- --rule-id=BR-ITEM-CATEGORY-LEAF-SELECTION --plan-only` and verify L2 association without UI commands.
- [ ] Run `npx tsc --noEmit` and the new contract.
- [ ] Run `git diff --check` and update memory with the exact outcome.
- [ ] Do not create a branch, commit, push, UI Probe, Gold run or main Recipe run.

