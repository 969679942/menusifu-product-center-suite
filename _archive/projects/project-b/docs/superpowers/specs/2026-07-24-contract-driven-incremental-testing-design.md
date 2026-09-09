# 合同驱动增量测试闭环设计

## 目标

将合同变更转成精确、可执行、可追溯的测试计划。商品中心作为首个适配项目，通用内核不依赖商品中心实体、路由或 Playwright 文件结构，后续项目只需提供合同变更、用例来源引用和执行适配器。

## 架构

系统分为四层：

1. 通用影响分析内核：按 `collection + record id` 精确匹配用例 `sourceIds`；只有没有精确来源时才允许路由降级匹配，`unresolved` 等治理集合不触发路由降级。
2. 商品中心合同适配层：SOP 描述符携带 `sourceIds`、测试标题、文件和运行参数；字段边界变化精确命中对应边界用例。
3. 增量计划与执行层：生成无敏感信息的 JSON 计划，执行唯一 spec/grep，采集 Playwright 计时报告并写回增量结果。
4. 人工决定编译层：结构化审核决定编译为字段覆盖、确认规则和未决项墓碑，统一保留审核人、日期和证据 URI。

## 首个验收样本

描述标签与统计标签各生成两个字段边界场景：

- 标签名称第二语言：输入 50 个字符完整保留，输入 51 个字符截断为 50。
- 标签组名称第二语言：输入 10 个字符完整保留，输入 11 个字符截断为 10。

实时 DOM 证据表明两个输入框均无 placeholder 和关联 label，分别通过弹窗内唯一的 `input[type="text"][maxlength="50"]` 与 `input[type="text"][maxlength="10"]` 定位。定位数量不为 1 时立即按 locator drift 失败，不使用 `nth()`、候选链或模糊回退。

## 数据流

```text
人工审核决定
→ 决定编译器生成模块策展
→ 重建统一合同与 traceability.sourceIds
→ 合同 diff 产生 changes
→ 通用影响分析生成 exact-source 用例清单
→ 商品中心增量计划生成 spec + grep
→ Playwright 执行
→ 计时与状态写回 incremental-test-result.json
```

## 执行与安全

- 边界场景只打开创建弹窗、填充并读取，不点击确定，不产生服务端数据，因此 `seedMode=none`、`cleanupMode=none`、`verifyModes=['ui']`。
- 其他非创建场景继续遵循 API Seed → UI Action → API/UI Verify → API Cleanup。
- 增量结果只保存合同 ID、用例 ID、状态、耗时和证据路径，不保存密码、Token、Cookie、Authorization 或 storage state。
- CI 暂不接入，只提供稳定命令和机器可读结果。

## 复用边界

通用模块只认识变更引用、用例引用和匹配策略。商品中心负责把自身合同、SOP 描述符、Playwright runner 和结果目录适配到通用接口。新项目可复用影响分析、计划构建、结果模型和人工决定编译器，无需复用商品中心页面对象。

## 验收

- 四个字段变化只命中四条边界用例，不再误命中标签删除用例。
- 四条边界用例真实通过并产生增量结果文件。
- 完整 SOP 描述符从 41 增至 45，traceability 同步为 45。
- 合同、TypeScript、API 合同测试、反向 SOP、增量执行和全量 SOP 均通过。
- 34 路由残留、敏感信息、认证状态和未完成检查点继续为零。
