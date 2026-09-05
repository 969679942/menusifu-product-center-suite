# 商品中心测试方案输入 v1

## 输入边界

业务输入必须是标准 Markdown 测试方案，每条用例包含唯一 canonical ID、模块、优先级、精确来源、前置条件、步骤和可观察预期。

页面路由、侧边栏 capability、断言、造数、清理和 Claim ID 必须来自显式技术绑定。系统不会根据标题、步骤、行业惯例或现有自动化脚本猜测这些信息。

## 执行

默认构建：

```powershell
npm run build:product-center:test-plan-intake-v1
```

指定测试方案与技术绑定：

```powershell
npm run build:product-center:test-plan-intake-v1 -- --input <test-plan.md> --bindings <bindings.json>
```

技术绑定使用 `product-center-test-plan-intake-v1-bindings.json` 的结构。新用例没有精确技术绑定时进入 `review-required`，命令返回非零退出码。

## 晋级门禁

- 每条来源引用都能映射到非空 source ID。
- 第一项 capability 是 `navigation.sidebar.open`。
- 至少一个 assertion adapter。
- Claim ID、类型、文本和章节内编号逐项覆盖前置、步骤和预期。
- 用例只声明明确验证目标，字段动作写明字段和值或选择目标。
- 预期结果可观测、无重复，并绑定 verification signal 与 assertion adapter。
- 写数据用例必须有 cleanup adapter。
- 数据前置明确标记为自动造数或外部前置。
- 评测准确率为 1，false promotion 为 0。

103 条缺少精确正式来源的历史用例保持 blocked，并作为当前生成产品就绪度的活动待办；不得再通过 deferred 从负责人摘要中清零。
