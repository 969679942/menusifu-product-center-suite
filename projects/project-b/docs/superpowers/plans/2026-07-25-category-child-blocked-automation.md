# TC-ITEM-STD-035 Category Child Blocked Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote `TC-ITEM-STD-035 分类下已有商品时不可继续新增子分类` from manual coverage to one evidence-backed Recipe with API seed, one-shot UI save, API/UI terminal verification, ledger recovery, and reverse-order cleanup.

**Architecture:** Add a focused category-with-product seed factory whose record owns parent category, product, and candidate child identities. Compile the confirmed rule as a negative Recipe, execute it through a dedicated semantic Page capability, verify absence through API and UI adapters, and let the existing Recipe flow run cleanup in `finally`. Keep selectors in the Page, business orchestration in adapters/flow, and cleanup ownership in the seed factory.

**Tech Stack:** TypeScript 5.9, Playwright Test 1.60, existing Product Center API client, CleanupRegistry, ExecutionLedger, Recipe compiler, and category pilot audit.

---

### Task 1: Category-with-product seed lifecycle

**Files:**
- Create: `test-data/product-center/sop/product-center-category-negative-data.factory.ts`
- Test: `tests/api/product-center-category-negative-data.factory.spec.ts`
- Reuse: `api/product-center/product-center-api.ts`

- [ ] **Step 1: Write the failing seed contract**

Add a fixture-backed API contract requiring `ProductCenterCategoryNegativeDataFactory.seedCategoryWithProduct(cleanupRegistry)` to return:

```ts
type CategoryWithProductSeedRecord = {
  parentCategoryId: number;
  parentCategoryName: string;
  productId: number;
  productName: string;
  childCategoryName: string;
  checkpointEntryId: string;
};
```

The test must assert all three identities start with `AUTO_AUDIT_`, the parent exists in `categoryTree()`, the product exists in `productPage(productName)`, the ledger contains category and product entries immediately, and `cleanupRegistry.cleanupAll()` leaves neither identity behind.

- [ ] **Step 2: Verify the seed contract fails for the missing module**

Run:

```powershell
npx playwright test tests/api/product-center-category-negative-data.factory.spec.ts --project=api --reporter=line
```

Expected: FAIL because `product-center-category-negative-data.factory.ts` does not exist.

- [ ] **Step 3: Implement the minimal seed factory**

Create `ProductCenterCategoryNegativeDataFactory` with:

```ts
export class ProductCenterCategoryNegativeDataFactory {
  constructor(private readonly api: ProductCenterApi) {}

  async seedCategoryWithProduct(
    cleanupRegistry: CleanupRegistry,
    timestamp = nextAuditTimestamp(),
  ): Promise<CategoryWithProductSeedRecord>;

  async findCategory(name: string): Promise<CategoryTreeRecord | undefined>;
  async findProduct(name: string): Promise<ProductCenterNamedRecord | undefined>;
}
```

Create the parent first with `createCategory`, resolve and register its server ID immediately, then create the standard product with `createBomProduct(productName, parentCategoryId)` and register its server ID immediately. Register cleanup tasks in creation order so reverse execution is child candidate, product, parent. The child candidate cleanup must query by unique identity and only call `deleteCategory` when it actually exists.

- [ ] **Step 4: Verify API seed and reverse cleanup pass**

Run the focused API contract again. Expected: PASS with category/product creation, immediate ledger registration, and zero residue.

### Task 2: Precise category negative Page capability

**Files:**
- Modify: `pages/product-center/product-center-negative.page.ts`
- Test: `tests/api/product-center-recipe-capability.contract.spec.ts`

- [ ] **Step 1: Write the failing Page source contract**

Extend the capability contract to require Page methods named:

```ts
openCategoryTree(): Promise<void>
attemptAddChildCategory(parentCategoryName: string, childCategoryName: string): Promise<void>
isChildCategoryVisible(parentCategoryName: string, childCategoryName: string): Promise<boolean>
```

Require the source to use `getByRole('button', { name: \`添加分类 到 ${parentCategoryName}\`, exact: true })`, centralize the parent action locator in a private factory, call `clickUnique`, wait through `waitUntil` for a single visible/enabled control, and call `waitForInputSettled()` or equivalent 200ms input-settle helper before Save. Reject `.first()`, `.last()`, `.nth()`, `.or()`, `waitForTimeout`, XPath, and broad selector guessing.

- [ ] **Step 2: Verify the Page contract fails for missing methods**

Run:

```powershell
npx playwright test tests/api/product-center-recipe-capability.contract.spec.ts --project=api --reporter=line
```

Expected: FAIL because the child-category Page methods and semantic locator are absent.

- [ ] **Step 3: Implement minimal page-level actions and read**

Add centralized locators for the category main region, child name input, Save button, and exact parent Add Category control. `openCategoryTree` must wait for `brand-categories/treeList` after navigation. `attemptAddChildCategory` must click exactly once, fill the candidate name, wait at least 200ms using the repository input-settle utility, and click Save exactly once. `isChildCategoryVisible` must scope the read to the exact parent category region and return a boolean without making business assertions.

- [ ] **Step 4: Verify the Page source contract passes**

Re-run the focused capability contract. Expected: PASS and no prohibited locator/wait patterns.

### Task 3: Recipe definition and compiler binding

**Files:**
- Modify: `sop/product-center/product-center-negative-sop.catalog.ts`
- Modify: `sop/product-center/product-center-test-case-coverage.catalog.ts`
- Modify: `automation/recipe/product-center-recipe-compiler.ts`
- Test: `tests/api/product-center-recipe-compiler.contract.spec.ts`

- [ ] **Step 1: Write the failing 46-Recipe compiler contract**

Require:

```ts
expect(productCenterRecipeCaseIds).toHaveLength(46);
expect(categoryRecipes).toHaveLength(7);
expect(childBlocked).toMatchObject({
  caseId: 'negative:category-child-blocked-by-product',
  action: 'negative',
  seed: { adapterId: 'productCenter.seedCategoryWithProduct' },
  cleanup: { adapterId: 'productCenter.cleanupSeed' },
  coverageIds: ['coverage:control:category-add-child'],
});
expect(childBlocked?.capabilities.map((item) => item.id))
  .toEqual(['category.attemptAddChildBlockedByProduct']);
expect(childBlocked?.assertions.map((item) => item.adapterId)).toEqual([
  'productCenter.verifyCategoryChildBlockedApi',
  'productCenter.verifyCategoryChildBlockedUi',
]);
```

- [ ] **Step 2: Verify compiler contract fails at 45 Recipes**

Run the focused compiler contract. Expected: FAIL with 45 instead of 46 and missing case ID.

- [ ] **Step 3: Add the confirmed catalog case and compile branch**

Extend `ProductCenterNegativeCase['scenario']` with `relation-blocked`, add catalog ID `category-child-blocked-by-product` with source ID `rule:category-child-blocked-by-product`, and remove the generic review-required entry for `relation-blocked`. Add the case ID to `productCenterRecipeCaseIds` and coverage mapping. Compile only this confirmed scenario into the dedicated seed, capability, API/UI assertions, and cleanup adapters; do not assert error copy, response status, or zero mutation requests.

- [ ] **Step 4: Verify compiler and validator contracts pass**

Run the focused compiler contract. Expected: 46 deterministic Recipes, 7 category Recipes, no unresolved entries, and exact Add Child coverage.

### Task 4: Runtime capability and terminal assertions

**Files:**
- Modify: `adapters/product-center/product-center-recipe-capabilities.ts`
- Modify: `flows/product-center/product-center-recipe.flow.ts`
- Modify: `api/product-center/execution-ledger.ts`
- Test: `tests/api/product-center-recipe-capability.contract.spec.ts`
- Test: `tests/api/product-center-recipe-flow.contract.spec.ts`
- Test: `tests/api/product-center-execution-ledger.contract.spec.ts`

- [ ] **Step 1: Write failing runtime contracts**

Require one new capability contract:

```ts
{
  id: 'category.attemptAddChildBlockedByProduct',
  actions: ['negative'],
  requiredInputs: ['record'],
}
```

Require the flow order:

```ts
[
  'seed:productCenter.seedCategoryWithProduct',
  'capability:category.attemptAddChildBlockedByProduct:407',
  'assert:productCenter.verifyCategoryChildBlockedApi',
  'assert:productCenter.verifyCategoryChildBlockedUi',
  'cleanup:productCenter.cleanupSeed',
]
```

Add a ledger contract proving a child category discovered after Save can be recorded once with `dependencyOf` pointing to the parent entry and then cleaned without replaying the Save action.

- [ ] **Step 2: Verify runtime contracts fail for missing adapter paths**

Run the three focused contracts. Expected: FAIL for missing capability, seed adapter, assertions, and runtime record type.

- [ ] **Step 3: Implement seed, UI action, and API/UI assertions**

Add `CategoryWithProductSeedRecord` to `ProductCenterRecipeRuntimeRecord`. Instantiate the new factory in `createProductCenterRecipeFlowPort`. The seed adapter returns group `negative`, the matching negative case, and the seed record. The capability calls `ProductCenterNegativePage.openCategoryTree()` and `attemptAddChildCategory(...)` exactly once.

The API assertion must query category tree and product page, verify parent and product still exist, and verify the candidate child is absent both below the parent and globally. If the child exists, register its actual server ID immediately in CleanupRegistry/ExecutionLedger with a higher cleanup order than product and parent, then throw a product-behavior assertion error. The UI assertion reopens the category route and requires `isChildCategoryVisible(...) === false`. Neither assertion may replay Save.

- [ ] **Step 4: Verify focused runtime contracts pass**

Re-run the three contracts and `npx tsc --noEmit`. Expected: PASS with 23 stable capabilities, one-shot UI mutation, assertion order preserved, and cleanup in `finally`.

### Task 5: Promote the category pilot from manual to executable

**Files:**
- Modify: `scripts/build-product-center-category-pilot.ts`
- Test: `tests/api/product-center-category-pilot.contract.spec.ts`
- Regenerate: `contracts/product-center/test-cases/pilots/category-route-test-cases.json`
- Regenerate: `contracts/product-center/test-cases/pilots/category-route-source-bindings.json`
- Regenerate: `output/test-case-audit/product-center/category-route-pilot-latest.json`

- [ ] **Step 1: Change the pilot contract to require 7 executable cases**

Require both base and executability summaries to report `manual: 0`, require `TC-ITEM-STD-035` to be `candidate`, and require execution adapters/capabilities to match the compiled Recipe.

- [ ] **Step 2: Verify the pilot contract fails on the hard-coded manual draft**

Run the focused pilot contract. Expected: FAIL with `eligible: 6`, `executable: 6`, and `manual: 1`.

- [ ] **Step 3: Remove the manual draft and source it from the Recipe catalog**

Map `negative:category-child-blocked-by-product` to formal ID `TC-ITEM-STD-035` when building category case IR, preserve the formal rule binding, and emit candidate automation metadata from the Recipe rather than hard-coded empty adapters.

- [ ] **Step 4: Build and verify pilot artifacts**

Run:

```powershell
npm run build:product-center:category-pilot
npx playwright test tests/api/product-center-category-pilot.contract.spec.ts --project=api --reporter=line
```

Expected: 7 total, 7 executable, 0 manual, 7/7 semantic and stable-control coverage.

### Task 6: Generated suite and production acceptance

**Files:**
- Regenerate: `contracts/product-center/recipes/product-center-pilot-recipes.json`
- Regenerate: `contracts/product-center/recipes/product-center-recipe-unresolved.json`
- Regenerate: `tests/generated/product-center-recipe-pilot.generated.spec.ts`
- Modify: `contracts/product-center/product-center-production-sop-acceptance.json`
- Test: `tests/api/product-center-production-sop-acceptance.contract.spec.ts`

- [ ] **Step 1: Write the failing acceptance count assertions**

Require 46 Recipe cases, 7 category executable cases, zero category manual cases, zero incomplete checkpoints, and zero API/UI residue for the new case.

- [ ] **Step 2: Verify acceptance contract fails on the previous 45-case artifact**

Run the production acceptance contract. Expected: FAIL on Recipe/category counts or stale fingerprint.

- [ ] **Step 3: Regenerate deterministic Recipe and pilot artifacts**

Run `npm run build:product-center:recipes` and `npm run build:product-center:category-pilot`. Update production acceptance only from measured test output; do not fabricate UI pass, duration, checkpoint, or residue evidence.

- [ ] **Step 4: Run the real category UI pilot**

Run:

```powershell
playwright test tests/generated/product-center-recipe-pilot.generated.spec.ts --project=chrome --workers=4 --grep "商品分类|分类名称"
```

Expected: 7/7 category business cases pass. The new case performs API Seed -> one UI Save attempt -> API/UI Verify -> API Cleanup, and cleanup leaves zero category/product/child residue.

- [ ] **Step 5: Run focused and broad acceptance gates**

Run in order:

```powershell
npx playwright test tests/api/product-center-category-negative-data.factory.spec.ts tests/api/product-center-recipe-capability.contract.spec.ts tests/api/product-center-recipe-flow.contract.spec.ts tests/api/product-center-recipe-compiler.contract.spec.ts tests/api/product-center-category-pilot.contract.spec.ts tests/api/product-center-production-sop-acceptance.contract.spec.ts --project=api --reporter=line
npm run test:product-center:recipes:contracts
npm run test:product-center:contract
npx tsc --noEmit
npm run verify:product-center:agents
```

Expected: all commands pass, generated artifacts contain no unresolved Recipe, prohibited locator/wait scans remain clean, sensitive scans contain no secrets or Fill values, and ledger incomplete entries are zero.

No Git branch, commit, push, PR, or CI integration is part of this plan.
