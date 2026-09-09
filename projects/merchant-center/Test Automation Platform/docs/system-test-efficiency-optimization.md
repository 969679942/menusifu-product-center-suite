# System-test execution efficiency contract

## 目的

避免同一确定性失败在没有新证据或实现变化时重复启动认证、预检和浏览器业务阶段；避免页面对象、flow、清理器或 adapter 变化未触发受影响用例重跑。

## 批量整改闸门

批量整改不得直接从“发现问题”进入整批浏览器执行。统一先生成优化计划：

```powershell
npm run plan:test-plan:optimization -- --input=<适配器生成的优化输入JSON> --output=<优化计划JSON>
```

计划必须由适配器提供每条用例的 `groupKey`、当前用例指纹和实现指纹，并显式声明真实影响集；公共层不得猜测业务分组或自动挑选代表用例。公共层先检查操作、断言、上下文守卫和清理要求，静态缺口直接阻断，不启动浏览器。当前完整收据直接复用；未复用的业务影响用例定向执行，`unknown-impact` 仅在数量与比例上限内作为 sentinel，超限在认证、造数和浏览器启动前阻断。

### 验收边界

- `blocked`：存在静态合同缺口，修复前不得执行任何业务用例。
- `canary-required`：只允许执行计划中未复用的定向影响用例或 sentinel。
- `canary-blocked`：定向收据失败、证据不完整或指纹过期，只保留诊断，不得继续放量。
- `revalidation-complete`：影响集已由当前完整收据复用、分类排除或定向执行闭环；不再自动扩展为全量批次。

该门禁是公共基础设施；接入项目仅映射系统测试合同字段和适配器分组键，不复制状态机或门禁规则。

接入项目可在正式 `run` 入口强制要求 `--optimization-plan` 和 `--optimization-stage=canary|batch`；缺少计划、影响集未闭环或 sentinel 超限时，在认证、造数和业务浏览器启动前直接停止。`batch` 仅供显式授权的批次执行，不由本策略自动生成。

## 公共机制

- `scripts/run-system-test.ts` 对持久化 execution-selection 和显式 `caseIds` 使用同一整改闸门。确定性失败完成后，同一实现再次启动会在浏览器前拒绝，并保留 `repair-attempt-ledger.json`。
- 每次业务运行写出 `diagnostics.json`，记录 caseId、失败类别、脱敏页面路由、是否发生写入、证据完整性和错误附件路径。它是整改依据，不是通过证据。
- `scripts/compile-system-test-plan.ts` 写出 `compiler-state.json`，保存 adapter 实现指纹。adapter 或其依赖漂移时，只选择实际引用该 adapter 的可执行 case。
- 选择文件为空时运行器生成 `not-run` 报告，不启动 setup、preflight 或业务浏览器。

## 适配器接入要求

方案构建器必须把页面对象、flow、数据工厂、断言和清理依赖写入 adapter implementation。共享依赖发生变化时，扩大选择范围是有意的保守行为；不得通过隐藏依赖来缩小范围。

## 可验证结果

- 公共合同测试覆盖持久化选择授权、失败诊断脱敏和 adapter 影响选择。
- 失败后的下一次同实现启动必须在 setup 前得到 `IMPLEMENTATION_UNCHANGED_AFTER_DETERMINISTIC_FAILURE` 或同等整改闸门结果。
- 本机制不改变 `passed` 语义；当前标准执行收据仍必须覆盖全部 assertion、上下文、操作和 API/UI 清理证据。

## 状态边界

这是公共基础设施。调味管理只负责提供自己的 adapter、页面合同和清理实现。平台 `verify:system-test-platform` 仍需独立通过跨应用试点和迁移闭环门禁，不能由单个模块运行替代。
