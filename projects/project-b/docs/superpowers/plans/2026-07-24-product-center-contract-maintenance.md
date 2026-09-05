# Product Center Contract Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build AI-maintained modular contract sources with indexed reads and human-reviewed baseline promotion.

**Architecture:** TypeScript module definitions own route and entity boundaries. The existing canonical contract remains generated, while module views, compact indexes, review output, snapshots, and release history are derived artifacts.

**Tech Stack:** TypeScript, Node.js filesystem and crypto APIs, Playwright Test, JSON artifacts.

---

### Task 1: Module Registry

**Files:** `contracts/product-center/modules/*.module.ts`, `contracts/product-center/modules/index.ts`

- [x] Define the module contract type.
- [x] Add nine module definitions covering every audited route once.
- [x] Validate duplicate routes and descriptor ownership.

### Task 2: Artifact Compiler

**Files:** `utils/product-center-contract-maintenance.ts`, `scripts/build-product-center-test-contract.ts`

- [x] Compile per-module and shared contract views.
- [x] Generate manifest and ID, route, entity, module, API indexes.
- [x] Replace verbose snapshot payloads with SHA256 record hashes.

### Task 3: Query And Review CLI

**Files:** `scripts/product-center-contract-cli.ts`, `package.json`

- [x] Query by module, route, entity, ID, and operation key.
- [x] Filter review queue by priority and category.
- [x] Report change impact from the current diff.

### Task 4: Human Promotion Gate

**Files:** `scripts/product-center-contract-cli.ts`, `contracts/product-center/reviews/product-center-release-history.json`

- [x] Reject promotion without reviewer or matching version.
- [x] Verify contract and traceability before promotion.
- [x] Record the promoted fingerprint and review summary.

### Task 5: Verification

**Files:** `tests/api/product-center-module-maintenance.contract.spec.ts`

- [x] Verify route and SOP ownership.
- [x] Verify indexes and targeted query behavior.
- [x] Verify compact snapshot hashes and promotion validation.
- [x] Run contract, TypeScript, diff, and safety acceptance.
