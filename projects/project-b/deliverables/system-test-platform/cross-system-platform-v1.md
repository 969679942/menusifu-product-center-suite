# 跨系统测试落地平台验证报告 v1（正式发布）

生成日期：2026-08-15

## 最终目标

将商品中心实战中验证有效的合同、预检、执行、证据、清理、熔断、分类和规则治理能力抽离为领域无关平台，使下一套系统不再重建流程；商品中心既有用例、脚本和运行入口保持不变。

## 当前状态

通用骨架已完成商品中心主线和公共合同验证。商品中心当前交付已冻结，但平台通用化仍为 `incomplete`：缺少不同 `applicationId` 的真实目标系统试点。当前门禁保持 `candidate / not-ready`，不得把商品中心交付状态替代为平台完成。

当前平台阻断记录：`deliverables/system-test-platform/platform-external-dependency.json`。

## 已完成整改

- 标准化测试方案可通过 CLI 一次生成 Recipe、provisional 规则、来源指纹和 `caseId/ruleId/recipeId/dataProfileId` 绑定。
- 新系统脚手架默认生成可运行的只读样板、`test-plan.json`、manifest、adapter catalog、setup、preflight 和业务规格。
- 合同编译在浏览器启动前检查来源指纹、适配器实现漂移、Claim 唯一断言绑定、数据档案、外部能力和写入生命周期。
- 通用 Runner 执行 setup、在线预检和业务规格，并提供 JSONL 心跳、停滞熔断、证据账本、敏感信息扫描和责任分类。
- 写入证据必须同时具备真实 operation 收据、逐 Claim 断言收据、API 零残留和 UI 零残留。
- 运行通过只产生规则证据；满足多版本、多变体和四维覆盖后仅进入人工评审，不能自动升级 formal。
- 通用运行时已移除对商品中心安全工具的隐性依赖。

## 商品中心隔离证明

- 商品中心组范围继续使用独立批次调度，未切换通用 Runner。
- 当前全量运行 `current-20260815`：139 条计划，81 条可执行用例 81/81 通过，失败 0、跳过 0、未运行 0、automation-gap 0。
- 58 条未执行用例均已责任分类：外部能力 10 条、观察到的产品偏差 48 条。
- 124 个实体检查点全部 `residue-verified`，API/UI 零残留，运行锁和相关进程为 0。
- 当前业务执行指纹：`dc34cb3a3628d431a5caf1328f457ad823675c07aeac96d23a5a955bf05e5144`。

## 新系统实战证明

- `merchant-center-store-operations-tax` 使用同一 `applicationId=merchant-center`，只能证明跨业务域复用，不能证明跨应用通用。
- 该试点最近两次均在认证初始化阶段阻断，未进入业务步骤；按瞬时故障恢复规则已停止重复重试，不能记为产品失败或通过。
- 商品中心与通用平台合同回归已通过，但不替代跨应用真实试点。

## 下一系统最短路径

```powershell
npm run scaffold:system-test -- --system-id=my-system --base-url=https://example.test
npm run compile:system-test-plan -- --plan=systems/my-system/test-plan.json --manifest=systems/my-system/manifest.json
npm run build:system-test -- --manifest=systems/my-system/manifest.json
npm run test:system -- --manifest=systems/my-system/manifest.json
```

公开或无需登录的只读系统可直接进入实测。登录系统需要实现一次认证 adapter；业务页面需要能力与断言 adapter；CRUD 还需要 seed、operation、cleanup、API residue 和 UI residue adapter。以上是系统差异事实，不是流程重建，也不能可靠地凭空自动生成。

## 当前交付边界

- 商品中心模块交付不受平台跨应用阻断影响，当前闭环为 `328 evidence-passed + 2 handled + 21 deferred + 9 not-applicable`，`blocked=0`。
- 平台正式发布暂不批准，直到存在不同 `applicationId` 的真实系统试点并取得完整收据。
- 业务规则仍按 provisional → 人工审核 → formal 管理，不能因商品中心或同应用跨域通过自动升级平台正式状态。

## 结论

当前流程已从商品中心专用实践中抽取为候选可移植测试平台。商品中心现有运行链路保持隔离和兼容；下一套不同应用接入后，按标准脚手架完成真实试点，再由最终门禁决定平台是否完成。
