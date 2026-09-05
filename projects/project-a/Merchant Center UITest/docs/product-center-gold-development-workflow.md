# 商品中心 Gold 开发执行流程

每次新增或修改 Gold 用例只按以下顺序执行：

1. 开发调试阶段只运行目标单例：`npm run test:product-center:test-plan-gold-set:single -- --case-id=<caseId>`。
2. 单例通过且 runtime acceptance 为 accepted 后，仅执行一次：`npm run onboard:product-center:gold -- --case-id=<caseId>`。
3. onboarding 的 single repeat=3、impacted、full 由阶段 checkpoint 管理；中断后重新执行同一命令只恢复首个未完成阶段，已完成流程再次执行不会重跑。
4. onboarding 完整通过后，仅执行一次最终维护：`npm run maintain:local`。

禁止在开发调试阶段运行 impacted、full 或 repeat=3。确定性 locator、strict mode、uniqueness 失败必须先修复，不得通过 transient 重试掩盖。
