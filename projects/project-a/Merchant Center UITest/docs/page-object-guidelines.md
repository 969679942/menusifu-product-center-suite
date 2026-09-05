# 页面对象（POM）编写指南

本文档与 `AGENTS.md` 互补，聚焦 **locator 契约**、**方法命名**、**返回值语义** 与 **page/flow 边界**。

## Locator 契约

1. **优先 `data-testid`**，其次 `getByRole` / `getByLabel` / `getByText`。
2. **一个元素一个契约**：不要把多种猜测选择器用 `.or()` 串在一起；若 iframe 与宿主页互斥渲染，在 `pages/shared/locator-scope.ts` 封装一次作用域差异。
3. **禁止**在 action/read 方法里散落 raw selector；稳定元素应在 page 类或 `*-locators.ts` 集中定义。
4. 缺少稳定选择器时，向产品申请 `data-testid`，而不是堆 fallback。

## 方法命名

| 前缀 | 含义 | 返回值 |
|------|------|--------|
| `click` | 原始点击，不保证导航 | `Promise<void>` |
| `open` / `enter` | 进入下一区域或页面 | 跨页时返回目标 page |
| `fill` / `select` | 修改页面状态 | `Promise<void>` |
| `read` | 读取页面数据 | 明确的数据模型 |
| `expect` | 断言页面状态 | `Promise<void>` |

## 返回值与后置条件

- **同页动作**：`Promise<void>`；不要默认 `return this`。
- **跨页动作**：返回目标页面对象，并在 page 层做最小加载校验（如 `expectLoaded()`）。
- **读取动作**：返回 number、结构化对象或数组，不在 spec 里重复解析货币字符串。

## Page / Flow 边界

- `pages/`：结构、locator、单页动作与读取。
- `flows/`：业务意图、多步编排、选择策略（如「选第一张空桌」）。
- 不在 page 方法里隐藏业务策略或重试恢复逻辑。

## 大页面拆分

当单文件承载多个独立区域时，拆为：

- `pages/<feature>/<feature>.page.ts` — 薄 facade，对外稳定 API
- `pages/<feature>/*-locators.ts` — 集中 locator
- `pages/<feature>/*.(section|dialog).ts` — 按菜单、改单、加费、读取等职责拆分

参考：`pages/order-dishes/`、`pages/recall/`。

## Flow 导出

- 推荐：**类方法承载 `@step` 报告步骤** + **薄包装函数**供 fixture/smoke 直接调用。
- 避免与类方法一比一重复、且无人使用的导出。
