# Playwright Test Agents 中文使用文档

本文基于 Playwright 官方文档整理，读取时间为 `2026-05-07`，重点页面为 `https://playwright.dev/docs/test-agents`，并结合本仓库当前结构给出落地建议。

## 1. 功能定位

Playwright Test Agents 是 Playwright 官方提供的一组面向 LLM 的测试代理定义，用来把“探索页面、设计用例、生成测试、修复失败”串成一条自动化链路。

官方内置三个代理：

- `planner`：探索应用并输出 Markdown 测试计划。
- `generator`：把 Markdown 测试计划转换为可执行的 Playwright Test 文件。
- `healer`：运行测试并自动修复失败用例，直到通过或命中保护边界。

它们既可以独立使用，也可以按顺序串联使用。

## 2. 与 Playwright Test 模块的关系

`test-agents` 页面位于 Playwright Test 文档树下，并直接关联这些模块：`Command line`、`Configuration`、`Fixtures`、`Global setup and teardown`、`Projects`、`Parallelism`、`Reporters`、`Retries`、`UI Mode`、`Web server` 等。

对实际使用最关键的关系如下：

### 2.1 Command line

Test Agents 的入口是 CLI：

```bash
npx playwright init-agents --loop=vscode
npx playwright init-agents --loop=claude
npx playwright init-agents --loop=opencode
```

`--loop` 表示你要为哪一种代理循环环境生成定义文件。官方文档当前列出的目标是 `vscode`、`claude`、`opencode`。

### 2.2 Configuration

生成出来的依然是标准 Playwright Test。也就是说：

- 仍然受 `playwright.config.ts` 约束。
- 仍然使用 `defineConfig()` 中的 `use`、`projects`、`reporter`、`timeout` 等设置。
- 不是一套独立的新运行时。

### 2.3 Fixtures

官方明确说明：`seed.spec.ts` 可以直接使用你项目自己的自定义 fixture。  
这对本仓库非常重要，因为当前仓库已经通过 `fixtures/test.fixture.ts` 注入了 `homePage`、`licenseSelectionPage`、`employeeLoginPage` 等页面对象。

### 2.4 Global setup / Project dependencies / Hooks

官方说明里最关键的一句是：`planner` 会运行 `seed.spec.ts`，借此执行测试初始化，包括：

- `global setup`
- `project dependencies`
- 必要的 fixtures
- 必要的 hooks

这意味着 `seed.spec.ts` 不是演示文件，而是整个 agent 流程的启动样板。

### 2.5 Reporters / Retries / UI Mode

生成出的测试仍然是普通 Playwright Test，因此：

- 会进入你现有 reporter。
- 会遵守当前 `retries` 策略。
- 可以继续用 Playwright UI Mode、trace、screenshot、video 等常规调试能力。

## 3. 版本前提

这是本仓库当前最重要的现实约束。

- 官方在 `Playwright 1.56` 发布说明中引入了 `Playwright Test Agents`。
- 当前仓库 `package.json` 使用的是 `@playwright/test: ^1.55.0`。

结论：**当前仓库在升级到 `1.56+` 之前，不能直接使用 `npx playwright init-agents` 这一套官方能力。**

建议先执行：

```bash
npm install -D @playwright/test@latest
```

然后再检查：

```bash
npx playwright --version
npx playwright init-agents --help
```

## 4. 官方推荐工作流

### 4.1 第一步：生成 agent 定义

先在仓库根目录执行：

```bash
npx playwright init-agents --loop=claude
```

如果团队主要使用 VS Code Agent 或 OpenCode，则替换为对应 loop。

官方强调：**每次升级 Playwright 后，都应重新生成 agent 定义**，以便拿到最新工具和指令。

### 4.2 第二步：准备 `seed.spec.ts`

官方约定的核心启动文件是 `tests/seed.spec.ts`。  
它的职责不是覆盖业务断言，而是为代理提供一个“可复用的初始化起点”。

一个好的 seed 文件应当：

- 能稳定进入目标系统。
- 能走完最小初始化流程。
- 能复用项目已有 fixtures、setup、hooks。
- 能体现本项目的测试写法风格。

### 4.3 第三步：让 `planner` 产出 `specs/*.md`

`planner` 会探索页面，并生成结构化测试计划。  
测试计划通常写入 `specs/`，内容包括：

- 场景名称
- 前置条件
- 步骤
- 预期结果
- 测试数据
- 与 seed 的关系

这一步的产物是“人类可读、机器可生成”的中间文档。

### 4.4 第四步：让 `generator` 产出 Playwright Test

`generator` 读取 `specs/*.md`，把计划转换为 `tests/` 下的可执行测试。

官方说明它会在生成过程中做两类事情：

- 现场验证定位器是否有效
- 现场验证断言是否合理

但第一版生成结果仍可能带有初始错误，因此通常还需要 healer。

### 4.5 第五步：让 `healer` 修复失败

当测试失败时，`healer` 会：

- 回放失败步骤
- 检查当前 UI
- 定位等价元素或替代流程
- 给出补丁，例如更新 locator、调整等待、修正数据
- 重跑测试，直到通过或停止

如果 healer 判断是产品功能本身有问题，官方说明它也可能把测试处理为跳过，而不是盲目硬修。

## 5. 官方约定的产物结构

官方文档给出的基础结构如下：

```text
repo/
  .github/            # agent definitions
  specs/              # Markdown 测试计划
  tests/
    seed.spec.ts      # 初始化 seed
    ...generated tests
  playwright.config.ts
```

可把它理解为三层：

- `agent definitions`：代理本身的规则与工具声明
- `specs/`：人类可读的测试计划
- `tests/`：最终可执行的 Playwright Test

## 6. 在本仓库中的落地建议

本仓库不是通用网页项目，而是一个有明确分层约束的 POS UI 自动化仓库。因此不能直接照抄官方 TodoMVC 示例，必须结合现有规则。

### 6.1 先升级 Playwright

当前版本是 `^1.55.0`，需要先升级到 `1.56+`。

### 6.2 seed 必须走真实 POS 入口

仓库 `AGENTS.md` 已明确要求：

- 只能从 `http://192.168.0.72:22080/kpos/front2/myhome.html` 进入系统
- 不允许通过 hash 或深链接直接打开内部页面

因此本仓库的 `seed.spec.ts` 必须体现真实入口流程，而不是直接跳到点餐页或 Recall 页。

### 6.3 seed 应复用现有 flows 与 fixtures

建议 seed 优先复用：

- `fixtures/test.fixture.ts`
- `flows/home.flow.ts`
- `flows/license-selection.flow.ts`
- `flows/employee-login.flow.ts`

原因很直接：

- 可以自动继承当前仓库的页面对象分层
- 能复用中文 `@step(...)` 报告
- 能避免代理直接生成一堆散落的低层页面点击

### 6.4 建议的 seed 样板

下面这个示例更符合当前仓库约束：

```ts
import { test } from '../fixtures/test.fixture';
import { enterEmployeeContext } from '../flows/employee-login.flow';
import { openHome } from '../flows/home.flow';
import { enterWithAvailableLicense } from '../flows/license-selection.flow';

test('seed：进入 POS 首页并建立员工上下文', async ({
  homePage,
  licenseSelectionPage,
  employeeLoginPage,
}) => {
  await openHome(homePage);

  if (await licenseSelectionPage.isVisible(10_000)) {
    await enterWithAvailableLicense(licenseSelectionPage, homePage);
  }

  await enterEmployeeContext(homePage, employeeLoginPage, '11');
  await homePage.expectEmployeeReady();
});
```

这个 seed 的价值在于：

- 走的是仓库已经验证过的真实链路
- 代理能看到本项目推荐的 fixture/flow 用法
- 后续生成的测试更有机会贴合本仓库结构

### 6.5 建议把 agent 生成测试放到独立目录

官方允许把生成结果放到 `tests/`。  
结合本仓库当前结构，更建议使用：

```text
tests/generated/
specs/generated/
```

这样可以和人工维护的：

- `tests/smoke/`
- `tests/e2e/`

清楚分开，便于审查 agent 生成内容。

### 6.6 给代理的额外约束必须显式写进 prompt

本仓库有大量非官方默认约束，必须在 planner / generator 的提示里写清楚，至少包括：

- 测试标题必须用中文
- `pages/` 只做页面动作与读取
- `flows/` 只做业务编排
- 优先使用 `data-testid`
- 禁止 `waitForTimeout`
- 优先使用现有 page object / flow
- 不允许通过内部 URL 直接进入页面
- 测试步骤要能进入 Allure 中文报告

否则 agent 很容易按官方通用风格生成出“不符合本仓库规范”的测试。

## 7. 适合本仓库的 prompt 模板

### 7.1 planner 提示词示例

```text
基于 tests/seed.spec.ts 作为初始化入口，为 POS 前端生成测试计划。
必须遵守仓库 AGENTS.md 约束：
1. 所有测试标题与步骤使用中文。
2. 只能从 myhome.html 通过 UI 导航进入业务页面。
3. 优先复用现有 flows 和 pages，不要直接生成散乱的底层交互。
4. 优先使用 data-testid，其次才是语义定位器。
5. smoke 只验证稳定可用性信号，e2e 才覆盖业务细节。
请将结果输出到 specs/generated/。
```

### 7.2 generator 提示词示例

```text
根据 specs/generated/ 下的测试计划生成 Playwright Test。
必须复用 fixtures/test.fixture.ts 与已有 flows/pages。
不要使用 waitForTimeout、脆弱 CSS 链、XPath、nth-child。
所有 describe、test、test.step 文案使用中文。
生成文件输出到 tests/generated/。
```

### 7.3 healer 提示词示例

```text
仅修复 tests/generated/ 下失败的测试。
优先修正 locator、等待条件或测试数据，不要绕过真实业务流程。
如果失败根因是产品功能异常，请保留证据并停止盲修。
```

## 8. 什么时候值得用 Test Agents

适合：

- 新页面需要快速铺第一版测试覆盖
- 现有系统流程复杂，人工先写计划再让 agent 生成更高效
- 团队已经有稳定的 seed、fixtures、page objects、flows

不适合：

- 仓库规范非常重，但还没有 seed 与分层样板
- 页面定位器极不稳定
- 产品流程仍在频繁变动，healer 会反复追 UI 噪音

## 9. 对本仓库的最终建议

如果要在这个 POS 项目里真正落地 Playwright Test Agents，推荐顺序如下：

1. 先把 `@playwright/test` 升级到 `1.56+`。
2. 新增 `tests/seed.spec.ts`，复用现有 fixture 与登录流。
3. 运行 `npx playwright init-agents --loop=claude` 或团队实际使用的 loop。
4. 先只让 planner 生成 `specs/generated/`，人工审一次计划是否符合仓库边界。
5. 再让 generator 生成 `tests/generated/`。
6. 最后再启用 healer 修修补补，而不是一开始就把修复权完全交给 agent。

在这个仓库里，**最关键的不是“能不能生成测试”，而是“生成结果是否继续遵守 page / flow / fixture 的边界”**。  
只要 seed 和 prompt 设计得对，Test Agents 才会成为增效工具；否则它只会批量产出不符合仓库规范的脚本。

## 10. 官方参考链接

- [Playwright Test Agents](https://playwright.dev/docs/test-agents)
- [Playwright Release Notes](https://playwright.dev/docs/release-notes)
- [Playwright Test Configuration](https://playwright.dev/docs/test-configuration)
- [Playwright Test Fixtures](https://playwright.dev/docs/test-fixtures)
- [Playwright Global setup and teardown](https://playwright.dev/docs/test-global-setup-teardown)
- [Playwright Projects](https://playwright.dev/docs/test-projects)
- [Playwright Reporters](https://playwright.dev/docs/test-reporters)
- [Playwright UI Mode](https://playwright.dev/docs/test-ui-mode)
- [Playwright Web server](https://playwright.dev/docs/test-webserver)
