# Product Center P0 W5-W9 Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete authenticated shared-wave evidence for W5-W8, preserve W9's external-terminal gate, rebuild technical status, snapshot memory, and deliver a full final-goal analysis.

**Architecture:** Each wave has one shared Playwright chain, one contract test, one atomic runtime report, and one cleanup ledger. Canonical conflicts are reconciled instead of changing business rules; mutations use unique `AUTO_AUDIT_` identities and are verified absent through API and UI.

**Tech Stack:** TypeScript, Playwright, ProductCenterApi, cleanup registry, execution ledger, mutation journal, JSON/Markdown evidence artifacts.

---

### Task 1: Freeze W5 Shared Contract

**Files:**
- Create: `tests/api/product-center-item-p0-remaining-w5.contract.spec.ts`
- Modify: `package.json`

- [x] Write a contract test requiring all eight W5 case IDs, shared-chain metadata, six-label/two-corner/two-option seeds, full case evidence, and residue verification.
- [x] Run the W5 contract test and confirm it fails because the W5 executor and capabilities do not exist.
- [x] Add only the package script needed to invoke the future W5 executor.

### Task 2: Implement W5 Resources And UI

**Files:**
- Modify: `api/product-center/product-center-api.ts`
- Modify: `test-data/product-center/sop/product-center-low-dependency-data.factory.ts`
- Modify: `pages/product-management/item/item-create-standard-locators.ts`
- Modify: `pages/product-management/item/item-create-standard.page.ts`
- Modify: `pages/product-management/item/item-create-side-locators.ts`
- Modify: `pages/product-management/item/item-create-side.page.ts`
- Modify: `pages/product-management/item/item-create-combo-locators.ts`
- Modify: `pages/product-management/item/item-create-combo.page.ts`
- Create: `tests/generated/product-center-item-p0-remaining-w5.generated.spec.ts`

- [x] Add API seed and cleanup adapters for six description tags, two corner marks, and multi-option rule groups.
- [x] Add stable UI selectors for selecting and reading description tags, corner marks, option defaults, and duplicate detail images.
- [x] Implement one W5 shared chain covering all eight canonical cases without case-level runs.
- [x] Record every server ID immediately, reconcile non-idempotent outcomes, clean in `finally`, and require UI/API zero residue.
- [x] Run the W5 contract test green, then execute one authenticated W5 run with a unique run ID.

### Task 3: Implement W6 Shared Update Wave

**Files:**
- Create: `tests/api/product-center-item-p0-remaining-w6.contract.spec.ts`
- Create: `tests/generated/product-center-item-p0-remaining-w6.generated.spec.ts`
- Modify: relevant item POM and seed adapter files only when the red contract proves a missing capability.
- Modify: `package.json`

- [x] Freeze the eight W6 case IDs and update-isolation evidence contract.
- [x] Seed shared flavor, recipe, addon groups and three temporary products.
- [x] Update base information and per-product option price/default settings, then prove master data is unchanged.
- [x] Execute W6 once and require eight complete evidence entries, zero harness errors, and zero residue.

### Task 4: Implement W7 Shared Delete Wave

**Files:**
- Create: `tests/api/product-center-item-p0-remaining-w7.contract.spec.ts`
- Create: `tests/generated/product-center-item-p0-remaining-w7.generated.spec.ts`
- Modify: relevant list, menu, addon, combo, API, and seed adapters only when required.
- Modify: `package.json`

- [x] Freeze the seven W7 case IDs and deletion/reconciliation contract.
- [x] Seed temporary unreferenced and referenced addon/combo products with shared menu/addon dependencies.
- [x] Capture confirmation text, reference blocks, final DELETE outcomes, and UI/API terminal state.
- [x] Execute W7 once and require seven complete evidence entries and zero residue.

### Task 5: Implement W8 Cross-Channel Wave

**Files:**
- Create: `tests/api/product-center-item-p0-remaining-w8.contract.spec.ts`
- Create: `tests/generated/product-center-item-p0-remaining-w8.generated.spec.ts`
- Modify: relevant publish/channel adapters only when required.
- Modify: `package.json`

- [x] Freeze the three W8 case IDs and cross-channel evidence contract.
- [x] Seed one menu/channel context and three referenced temporary product types.
- [x] Reconcile the canonical `BITEM-2013` menu-reference block for all three product types and skip unsupported publish work.
- [x] Execute W8 once and require three complete conflict evidence entries and Merchant Center/channel zero residue.

### Task 6: Preserve W9 Terminal Gate

**Files:**
- Create: `output/audit/product-center-item-p0-remaining-w9-blocked.json`
- Modify: `docs/product-center-item-final-goal-memory.md`

- [x] Detect whether a controlled external terminal is available without creating a transaction.
- [x] Emit a redacted `blocked-until-terminal-access` artifact with required evidence and resume instructions.
- [x] Confirm the transaction branch is not applicable without a controllable sales surface; create no product, transaction, or order residue.

### Task 7: Rebuild And Analyze Final State

**Files:**
- Modify: `docs/product-center-item-final-goal-memory.md`
- Create: `docs/history/memory-snapshots/2026-07-31/product-center-item-final-goal-memory.md`
- Create: `docs/history/memory-snapshots/2026-07-31/SHA256SUMS.json`
- Regenerate: canonical technical status and P0 manifest artifacts.

- [x] Aggregate W1-W9 acceptance, canonical conflicts, harness errors, cleanup state, and the W9 gate.
- [x] Rebuild current technical status from accepted evidence only.
- [x] Update memory after each accepted or blocked wave and snapshot it atomically.
- [x] Generate and verify a SHA-256 manifest for the snapshot set.
- [x] Run focused contracts, typecheck, full relevant API contracts, safety scans, and artifact consistency checks; record the isolated parallel combo-audit contract failure.
- [x] Re-read the final goal and report completion percentage, remaining gap, priority versus accurate test-plan generation, and owner-level improvements.

### Task 8: Reconcile C01-C09 Decisions

**Files:**
- Create: `contracts/product-center/reviews/product-center-item-canonical-conflict-decisions.json`
- Modify: `contracts/product-center/reviews/product-center-item-rule-confirmations.json`
- Modify: canonical rebuild, current status, remaining-wave manifest, memory and snapshot artifacts.

- [x] Record all 19 product-owner decisions as 9 update-canonical, 6 retain-canonical-file-bug, and 4 needs-prd.
- [x] Apply the 9 confirmed rule corrections without allowing older expert-review corrections to overwrite product decisions.
- [x] Rebuild the non-destructive XMind trial, 229-case review, technical status, and W1-W9 manifest.
- [x] Promote 9 reconciled cases, keep 10 unresolved cases blocked, and verify focused contracts plus typecheck.
- [x] Update the conflict register, memory snapshot, SHA-256 manifest, completion gap, and next priority.

### Task 9: Generate Accurate Eligible Cases

**Files:**
- Create: `scripts/build-product-center-item-generation-ready.ts`
- Create: `tests/api/product-center-item-generation-ready.contract.spec.ts`
- Generate: JSON, Markdown, XMind and manifest artifacts for the eligible release.

- [x] Lock the denominator to 90 generation-allowed, runtime-accepted, baseline-compatible, fully approved cases.
- [x] Preserve canonical IDs and generate detailed JSON, Markdown and an independent non-destructive XMind.
- [x] Exclude 123 non-runtime cases, 5 source reconciliations, 6 defects, 4 PRD confirmations and the W9 terminal gate.
- [x] Verify unique IDs/titles, complete source/action/expectation chains, normalized numbering and zero vague checks.
- [x] Refresh the 229-case conformance benchmark, pass the 36-case independent holdout, and update memory plus snapshot.

### Task 10: Reduce Manual Review With Fast Lanes

**Files:**
- Create: `scripts/build-product-center-item-automation-fast-lane.ts`
- Create: `tests/api/product-center-item-automation-fast-lane.contract.spec.ts`
- Generate: machine-readable and Markdown fast-lane review artifacts.

- [x] Split all 139 excluded cases into automatic technical work, rule decisions, defect handling and environment blocking.
- [x] Cluster 123 technical cases into reusable green/yellow templates instead of case-level review.
- [x] Route 65 green cases to direct generation and 58 yellow cases to 34 shared-chain automated probes.
- [x] Reduce actual human rule review to 9 cases in 6 decision groups; require zero repeated static semantic review.
- [x] Verify complete denominator coverage, uniqueness, typecheck, security scan, contracts and memory snapshot.

### Task 11: Compile Yellow Shared-Chain Recipes

**Files:**
- Create: `scripts/build-product-center-item-yellow-probe-recipes.ts`
- Create: `tests/api/product-center-item-yellow-probe-recipes.contract.spec.ts`
- Generate: yellow shared-chain Recipe, compile report and manifest artifacts.

- [x] Generate one Recipe for every yellow case while grouping setup and cleanup into 34 shared chains.
- [x] Compile 58/58 Recipes and keep case-level execution disabled outside the wave orchestrators.
- [x] Require independent evidence for every case and prohibit representative evidence inheritance.
- [x] Split execution into Y1=14/8, Y2=1/1, Y3=37/19 and Y4=6/6 blocked on controlled channels.

### Task 12: Compile Green Binding Drafts

- [x] Generate and structurally compile 65 case-level drafts across 20 shared binding groups.
- [x] Detect that coarse runtime templates do not provide exact capability and assertion bindings.
- [x] Complete exact capability/assertion bindings for the first 3 read-only cases and keep the remaining 62 drafts non-runnable.

### Task 13: Execute Yellow Y1 Read-Only Wave

- [x] Implement one checkpointed shared executor for 8 groups and 14 independent case evidences.
- [x] Resume the same AUTO_AUDIT run after transient timeout without replaying completed work.
- [x] Finish with 12 accepted, 2 canonical conflicts, zero environment blocks, zero executor errors and zero mutations.
- [x] Persist a stable runtime acceptance artifact while keeping exact Recipe binding as a separate promotion gate.

### Task 14: Execute Green Read-Only Pilot

- [x] Bind TC-ITEM-STD-064, TC-ITEM-PKG-057 and TC-ITEM-PKG-054 to real POM capabilities and assertions.
- [x] Execute the three green cases together with the two Y1 image conflicts in one checkpointed read-only chain.
- [x] Accept TC-ITEM-PKG-057, classify three missing-data cases as environment blocked, and confirm TC-ITEM-ADD-035 as a canonical conflict.
- [x] Preserve zero mutations and update memory plus the snapshot hash.

### Task 15: Execute Yellow Y2 Controlled Wave

- [x] Seed two unique multi-option flavor groups and one standard item with immediate server-ID registration.
- [x] Discover and model the inline mutually exclusive Rule1 plus both Select Attribute editors.
- [x] Save the rule, reopen the item, and record the still-enabled conflicting option as a canonical conflict.
- [x] Verify all three server objects as residue-verified and persist a stable Y2 runtime acceptance artifact.

### Task 16: Execute Yellow Y3 First Batch

- [x] Build a machine-readable matrix covering all 37 Y3 cases across 19 shared dependency groups.
- [x] Classify nine ready cases, eleven adapter gaps, fifteen controlled-fixture gaps, and two rule-evidence gaps without case-level human review.
- [x] Execute Y3-B1 as one six-group chain with nine independent evidence records and checkpointed group resume.
- [x] Accept five page capabilities, preserve four canonical conflicts, and keep executor errors at zero.
- [x] Reconcile every mutation intent and verify all cross-checkpoint temporary identities as API/UI zero residue.
- [x] Persist the stable Y3-B1 runtime acceptance artifact and update memory plus snapshot integrity.

### Task 17: Execute Yellow Y3 Adapter Batch

- [x] Freeze eleven adapter-required cases into six shared matrix groups without case-level human review.
- [x] Add weighted-unit, multi-spec order, flavor option, side price, image and other-settings adapters.
- [x] Execute Y3-B2 with independent evidence, safe checkpoint resume and interrupted-mutation reconciliation.
- [x] Accept five cases, preserve six canonical conflicts and keep executor errors at zero.
- [x] Verify forty accumulated audit identities as API/UI zero residue and all mutation intents cleanup-complete.
- [x] Persist the stable Y3-B2 runtime acceptance artifact and update memory plus snapshot integrity.

### Task 18: Execute Yellow Y3 Controlled-Fixture Batch

- [x] Freeze fifteen controlled-fixture cases into one checkpointed shared batch without case-level review.
- [x] Reuse controlled tags, corner marks, print stalls and fixed/custom combo groups with immediate server-ID registration.
- [x] Accept eight cases, preserve one canonical conflict and six environment blocks with independent evidence.
- [x] Detect and reconcile two copy-generated same-name products through exact UI row server IDs.
- [x] Verify forty-five ledger entries and seven mutation intents as residue-free and cleanup-complete.
- [x] Persist the stable Y3-B3 runtime acceptance artifact and update memory plus snapshot integrity.

### Task 19: Execute Yellow Y3 Rule-Evidence Batch

- [x] Freeze the final two rule-evidence cases into one checkpointed shared batch without case-level review.
- [x] Probe item-name and POS/kitchen-name formatting through actual save, validation and persisted-detail evidence.
- [x] Preserve both canonical conflicts as product evidence instead of harness failures.
- [x] Resume the same run after adapter and residue-query corrections without replaying completed mutations.
- [x] Verify three audit identities as API/UI zero residue, two ledger entries residue-verified and three mutation intents cleanup-complete.
- [x] Persist the stable Y3-B4 runtime acceptance artifact and update memory plus snapshot integrity.

### Task 20: Execute Green AT15 Image Replacement Batch

- [x] Bind TC-ITEM-STD-078 to exact image-replacement capability and assertion contracts.
- [x] Execute the controlled image flow and preserve the missing second-upload entry as a canonical conflict.
- [x] Verify the created item as API/UI zero residue and persist the stable AT15 acceptance artifact.

### Task 21: Execute Green AT39 Combo MOQ Batch

- [x] Correct the exact Recipe action to create without reordering historical fast-lane groups.
- [x] Execute TC-ITEM-PKG-016 with MOQ 2 and verify list plus reopened edit state.
- [x] Reconcile the interrupted first attempt and verify all five ledger entries as residue-verified.

### Task 22: Execute Green AT09 Price Specification Batch

- [x] Bind four P1 cases to exact standard-create and specification-group navigation capabilities.
- [x] Execute three controlled creates plus one read-only popup navigation in a shared checkpointed wave.
- [x] Verify price, packaging fee, cost and the exact `/pp/brand/spec/create` popup route.
- [x] Reclassify existing evidence without replaying non-idempotent mutations after correcting the route contract.
- [x] Verify three mutation intents and ledger entries as cleanup-complete and residue-verified.
- [x] Persist the stable AT09 runtime acceptance artifact and update memory plus snapshot integrity.

### Task 23: Execute Green Validation Mega Wave

- [x] Freeze eleven validation cases into one shared-wave contract without case-level human review.
- [x] Bind exact field validation, rounding, weight, category, referenced-group and detail-image capabilities.
- [x] Execute all eleven cases with independent evidence and checkpointed mutation reconciliation.
- [x] Accept four cases and isolate seven canonical conflicts without stopping the remaining cases.
- [x] Verify seventeen ledger entries and ten mutation intents as residue-free and cleanup-complete.
- [x] Persist the stable GREEN-VALIDATION-01 acceptance artifact and update memory plus snapshot integrity.

### Task 24: Execute Green Standard Product Mega Wave

- [x] Freeze seventeen standard-product cases into one shared-wave contract without case-level review.
- [x] Bind exact create, edit, list, preference, language, pagination, image and lifecycle capabilities.
- [x] Execute all seventeen cases under one AUTO_AUDIT run with independent evidence and checkpoint resume.
- [x] Promote seven cases, isolate seven canonical conflicts and retain three controlled-environment blocks.
- [x] Reclassify five missing-entry observations without replaying non-idempotent operations.
- [x] Verify eighteen ledger entries, thirteen mutation intents and UI/API/preferences as residue-free.
- [x] Persist the stable GREEN-STANDARD-MEGA acceptance artifact and update memory plus snapshot integrity.
