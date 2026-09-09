# AGENTS.md

## Objective

This repository is a maintainable Playwright + TypeScript UI automation project for the MenuSifu Merchant Center (Cloud Platform) frontend. Optimize for clarity, reuse, and long-term Codex maintenance, not one-off scripts.

## Interaction

- Address the user as `金将军`.
- Use respectful Chinese throughout replies.

## Automation Rules

- Use Playwright Test as the default runner.
- Prefer `data-testid` locators first for stable elements. Only fall back to other locator strategies such as `getByRole`, `getByLabel`, or `getByText` when no reliable `data-testid` is available.
- Prefer semantic locators such as `getByRole`, `getByLabel`, and `getByText`.
- Automation does not need to cover Chinese UI business copy. Do not require multilingual locators or Chinese/English fallback selectors for application controls unless the product explicitly exposes both variants as stable DOM contracts. This does not change the requirement that test titles, report steps, and `@step(...)` descriptions use Chinese.
- Page object selectors must match the actual DOM contract of the target page. Use the one selector that the page really exposes; do not broaden scope with `.or()` chains, alias attribute lists, multilingual regexes, or parent-page fallbacks just to make a locator pass.
- Do not enumerate or traverse candidate selectors to guess the target element. If the page lacks a stable selector, add or request a `data-testid` instead of stacking fallback locators.
- Do not default to brittle CSS chains, nth-child selectors, or XPath.
- Do not use `waitForTimeout` in tests or helpers.
- Prefer `utils/wait.ts` `waitUntil()` for condition polling that may retry multiple times. Avoid `expect(...).toPass()` and `expect.poll()` in page objects, flows, helpers, and tests when they would create noisy intermediate failures in reports. Assert only the final settled result.
- Any page action that edits one or more `input` fields and then immediately confirms/submits a change that triggers an API request or saves data must wait at least `200ms` before clicking the confirm/submit button so the input state can settle.
- Every method in `pages/` and `flows/` must use Chinese `@step(...)` descriptions for report display.
- Do not keep page/flow action descriptions only in comments; convert those descriptions into executable report steps.
- Every `describe` and `test` title must be written in Chinese.
- Test-case-level report steps must also use Chinese.
- Test-case-level metadata should use Playwright native `test(title, details, body)` style.
- Jira links should be declared in the `details.annotation` field. Keep searchable issue keys such as `MC-12345` in the spec file; shared helpers may only build the full Jira URL or annotation object from that key.

## Allure Business Reporting

- Public Allure hierarchy, receipt coverage, assertion completeness, attachment binding, failure classification, and status arbitration are governed by `D:\Menusifu\Test Automation Platform\AGENTS.md`; this project must consume that contract rather than reimplement it.
- Merchant Center reports must render the source case identity, route, business wording, and runtime values in Chinese. Technical Playwright names, selectors, unresolved placeholders, and decorative wait steps must never be exposed as business steps.
- Map every declared Merchant Center business operation and assertion to the public operation/assertion receipt contract. A single receipt is not sufficient when the case declares multiple operations.
- Use the common attachment binding path for business operations, assertions, cleanup, evidence, and failure diagnostics. Failure screenshots and traces support diagnosis only and never authorize `passed`.
- For mutation, negative, boundary, distribution, duplicate, cancel, and delete cases, the adapter must expose a concrete Chinese `业务操作：` step tied to an executed UI or governed operation receipt; a generic page-read step is insufficient.
- Formal reports must show expected value, actual value, observation channel, verification authority, and final result for each assertion. If actual data is unavailable, show the reason and mark evidence incomplete; do not omit the field.

## Page And Flow Boundaries

- `pages/` only holds page structure, locators, page-level actions, and page-level reads.
- `pages/` can do things like: click a button, fill an input, switch a tab, read a table number, return a locator or page data.
- All stable selectors in `pages/` must be centralized on the page object, either as class-level locator fields or dedicated private locator factory methods.
- Centralized locators should be defined once with the page's real selector. Do not re-resolve the same element through `resolveVisibleLocator()`-style candidate lists unless the page genuinely renders equivalent controls in mutually exclusive regions.
- Do not scatter raw `getByRole(...)`, `getByText(...)`, `locator(...)`, or selector strings throughout page action/read methods when those selectors belong to the page structure.
- If a selector is reused, semantically important, or represents a stable page element such as a button, dialog, input, tab, list, or summary area, define it once and consume it through the centralized page locator API.
- Do not create a separate page object for a strongly coupled transient dialog or popup that only exists as one immediate step of its parent page flow, such as a merchant-selection dialog opened after login. Keep that dialog on the owning page object unless it can be entered, reused, and reasoned about independently.
- `pages/` must not contain business selection strategy or cross-step intent such as “select any available merchant”, “pick the first channel”, “enter the system with default merchant context”, or other business-level decisions.
- `flows/` only holds business intent, multi-step orchestration, and selection strategy.
- `flows/` can combine multiple page actions, decide which record to pick, decide fallback order, and return business-level results.
- `flows/` must not redefine page locators or duplicate low-level page interaction details that belong in `pages/`.
- Do not mix `page` and `flow` responsibilities in the same method. If a method contains business policy or selection logic, move it to `flows/`. If a method only describes a single page action or read, keep it in `pages/`.

## POM Readability

- Keep page objects small and focused. When a page file starts carrying multiple independent areas or workflows, split it by page region or capability instead of continuing to grow one class. See `docs/page-object-guidelines.md`.
- Avoid long locator fallback chains. Prefer one real DOM contract per element; if mutually exclusive render scopes exist, encapsulate the scope difference once in `pages/shared/locator-scope.ts` rather than repeating `.or(...)` guesses per method.
- Use method names with stable semantics: `click` for raw actions, `open`/`enter` for navigation, `fill`/`select` for state changes, `read` for data reads, and `expect` for assertions.
- Do not hide business strategy, retry policy, or recovery logic inside lightweight-sounding page methods. If the method contains selection policy or multi-step fallback, move that intent to `flows/` or split it into explicit page steps.
- Prefer typed page APIs over raw strings when the allowed values are finite and stable.
- Make postconditions explicit. A caller should be able to tell from the method name and return type whether the action only clicks, leaves the user on the same page, or guarantees arrival at the next page.
- Same-page actions return `Promise<void>`; cross-page actions return the destination page object after minimal load checks. Do not default to `return this` for same-page actions.
- Avoid duplicate flow entrypoints that expose the same behavior through both class methods and one-to-one wrapper functions unless there is a clear reporting or fixture need.
- Keep snapshot/read APIs narrow. Use small read methods for focused data, and let aggregate snapshot methods compose those reads instead of embedding all parsing logic in one large method.

## Recommended Test Metadata Style

```ts
test(
  '应能通过 OAuth 登录并选择商户进入商户中心',
  {
    tag: ['@smoke'],
    annotation: [
      { type: 'issue', description: 'https://devtickets.atlassian.net/browse/MC-12345' },
    ],
  },
  async ({ brandPicturePage }) => {
    // ...
  },
);
```

## Merchant Center Domain Guidance

- Treat authentication as OAuth login on `auth.menusifucloudqa.com`, followed by merchant selection when prompted.
- Prefer expressing authenticated context through flows, fixtures, and optional `storageState`.
- Credentials and default merchant come from `test-data/env.ts` or environment variables; do not hardcode secrets in spec files.
- After login, pages load as SPA content under `cc-fe.balamxqa.com`; wait for app readiness instead of fixed sleeps.

## Navigation Rules

- Prefer entering target pages through authenticated navigation from the configured entry URL.
- For deep links such as `/pp/brandpictrue`, ensure auth and merchant context are established first via flow or `storageState`.
- Do not bypass merchant selection when the application requires it for the target page.

## Test Design

- Smoke tests should validate stable availability signals only.
- E2E tests should express business intent instead of click-by-click scripts.
- Add stronger semantic locators or test ids before introducing fragile selectors.
- Data-driven test inputs should be separated from spec files when they represent reusable domain data, business samples, or case matrices.
- Prefer TypeScript files under `test-data/` for test data so literals keep type checking, `as const` narrowing, factories, and IDE refactoring support.
- Use small factory functions in `test-data/` for dynamic values such as unique image names. Do not inline `Date.now()` or other dynamic sample generation in spec bodies.
- Keep traceability metadata such as Jira issue keys in spec files so global search lands on the owning test.

## Project Structure

- Keep page objects lean. Put page-level structure and low-level actions in `pages/`.
- Put business intent and multi-step behavior in `flows/`.
- Put shared Playwright extensions in `fixtures/`.
- Put environment and sample domain data in `test-data/`.
- Put pure helpers in `utils/`.
- Put exploratory or agent-generated drafts in `tests/generated/` before promoting them to `tests/smoke/` or `tests/e2e/`.

## Test Tagging Rules

- Use Playwright native `tag` metadata for test tags.
- Tags describe business scope or stable execution intent. They must not describe a migration batch, source directory, generator, or implementation origin.
- Formal product-center cases use their stable `caseId` annotation for traceability. Do not use `@generated` as a formal-case tag.
- Prefer current business tags where applicable: `@商品`, `@规格`, `@口味`, `@做法`, `@加料`, `@套餐`, `@图片`, `@分类`.
- Broad tags may be placed on `test.describe(...)` only when every nested test shares that scope.
- Keep stable suite-purpose tags such as `@smoke` when they express execution intent.

## Executable Step Traceability

- Source-case steps, Playwright report steps, runtime operation receipts, assertions, and cleanup evidence form one traceability chain. A comment or Markdown description cannot replace an executed step.
- Formal generated cases must record at least one observed operation receipt. `operationReceipts: []` is prohibited for a passed formal case.
- Runtime operation receipts must come from actually executed `test.step(...)` or `@step(...)` operations; do not synthesize them from source-case text after execution.
- An operation receipt records a stable operation key, Chinese title, execution order, method, observed state, and final status. Failed or interrupted operations remain visible and must not be rewritten as observed success.
- Public Page and Flow methods require Chinese `@step(...)`. Private helpers require a step only when they represent an independently meaningful business operation; do not add decorative step noise to pure parsing or formatting helpers.
- UI-visible outcomes are verified through UI first when the case contract is UI-visible. API evidence may verify persistence, identity, or cleanup, but an API polling timeout must not be summarized as a UI product failure.
- Screenshots are supporting evidence only. Without a matching case, route, locale, release observation, collection time, and executable operation receipt, a screenshot cannot authorize `passed`.
- Human confirmation may correct a business rule or source contract, but the updated automation must run before the case becomes runtime-passed. Human evidence alone remains `ready` or `deferred` according to its execution capability.

## Dependency And Composition Boundaries

- `domain/` owns neutral business contracts and pure rules. It may depend only on other `domain/` modules and must not depend on Page, Flow, Fixture, API client, test-data, utils, or Playwright.
- `fixtures/product-center.fixture.ts` is the product-center composition root. Formal specs receive Page, Flow, API, execution-ledger, and cleanup capabilities from fixtures instead of constructing concrete dependencies directly.
- `pages/` must not runtime-import API clients, cleanup services, business Flows, or mutable test-data factories.
- `flows/` may orchestrate Pages and API-assisted setup, but must not own raw page locators that belong to Page objects.
- `test-data/` contains pure samples, builders, and deterministic value generation. It must not call APIs, register cleanup, navigate pages, or assert product behavior.
- `utils/` contains domain-neutral pure helpers and technical adapters. Business runners that construct Pages or Flows belong under `flows/`.
- Common architecture analyzers, receipt contracts, registries, and gates belong in `D:/Menusifu/Test Automation Platform`; Merchant Center keeps only project configuration, adapters, business contracts, and generated outputs.

## Architecture Gate

- Run `npm run lint:ui-architecture` after modifying Page, Flow, Fixture, test-data, utility, or UI spec code.
- `docs/ui-architecture-baseline.json` is a decreasing debt ceiling, not an exception that permits new debt.
- Existing debt may stay equal or decrease during an unrelated change. A remediation must never raise a baseline value to make the gate pass.
- New hard waits, locator fallback chains, direct Page/Flow construction in formal specs, Page-to-API imports, API-active test data, and business runners under `utils/` are prohibited.
- Hotspot limits record current line count, public method count, and import fan-out. A split must lower the owning hotspot limit; generated files are measured separately from handwritten implementation.
- Static architecture success does not mark business cases passed. It only proves that the implementation obeys structural contracts.

## Capability Index

- Before scanning the repository for reusable Page, Flow, Fixture, API, test-data, cleanup, evidence, or audit capabilities, consult the generated capability index under `docs/`.
- After adding, deleting, moving, or renaming governed capabilities, run `npm run capabilities:generate`.
- Run `npm run capabilities:check` to verify that committed capability outputs match the source tree.
- Capability-index outputs are generated assets and must not be edited manually.

## Formal UI Case Registry

- The formal plan and stable `caseId` are the authority. Generated spec paths, historical reports, screenshots, and old indexes are evidence or implementation assets, not independent case inventories.
- Every formal case has exactly one registry record with source path, module, status, owning spec, binding fingerprint, latest executable receipt, blocking reason, and recovery condition when blocked.
- Allowed lifecycle states are `passed`, `ready`, `deferred`, `product-defect`, `blocked-source`, and `not-applicable`. Do not infer deletion from absence in a generated file.
- Audit, draft, historical, and canonical generated specs must be distinguishable in the registry. Only the canonical owning spec may authorize formal execution coverage.
- After changing formal cases, bindings, owning specs, decisions, or runtime receipts, run `npm run ui-cases:generate` and `npm run ui-cases:check`.
- Registry outputs are written to the adapter-declared asset-index paths. For Merchant Center these are `Merchant Center Info/00-待转换测试方案/已完成` and `未落地`; do not edit them manually.

## Public Platform Boundary

- `D:\Menusifu\Merchant Center\Merchant Center Info\00-待转换测试方案\FINAL-GOAL.md` defines the project target; public execution, report, receipt, state, and platform-completion rules belong to `D:\Menusifu\Test Automation Platform`.
- Merchant Center delivery may be complete while a paused different-`applicationId` pilot keeps platform-wide validation incomplete. This project must expose that distinction as `moduleDeliveryBlocked=false` where applicable.
- Project readiness, case registry, asset indexes, business routes, fields, and adapter contracts remain project outputs. The UItest project must not copy the public canary, batch, full-regression, or state machine.
- Report-only validation uses synthetic/non-business contract tests and isolated result directories. Do not rerun domain cases solely to validate reporter formatting.

## Execution Intent Safety

- 商品中心项目级整改必须通过公共 `execution intent` 执行：适配器提供完整范围、五个业务模块分区、当前选择集、执行路由及范围/选择集指纹；runner 不得把旧的调味执行链路当作项目全面整改入口。
- 定向复核启动前必须证明计划声明的影响分区和路由覆盖实际选择集；不得要求无影响模块人为生成代表用例。缺分区、路由漏案、旧 checkpoint 缺少意图元数据或指纹不匹配时，在认证、造数和浏览器启动前阻断。
- checkpoint 必须记录 `terminalCaseIds` 与 `incompleteCaseIds`；被 repair guard 阻断的用例不是终态，不能生成 `completed-with-findings`。只有全部选中用例有当前终态收据时才允许结束执行。
- 所有项目整改、定向复核、收据合并和 finding replay 入口必须显式传入当前 `--plan`；禁止默认消费旧计划。计划必须包含 `changeId`、范围总数和选择集指纹，否则在认证、造数、浏览器或收据合并前阻断。
