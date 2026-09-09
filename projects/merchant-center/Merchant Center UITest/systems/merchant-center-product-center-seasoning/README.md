# merchant-center-product-center-seasoning

- 方案编译：npm run compile:system-test-plan -- --plan=systems/merchant-center-product-center-seasoning/test-plan.json --manifest=systems/merchant-center-product-center-seasoning/manifest.json
- 合同编译：npm run build:system-test -- --manifest=systems/merchant-center-product-center-seasoning/manifest.json
- 运行：npm run test:system -- --manifest=systems/merchant-center-product-center-seasoning/manifest.json
- 登录系统需替换 setup.spec.ts 和 auth adapter 声明。
- CRUD 用例必须补充 seed、cleanup、API residue、UI residue adapter。

## 闭环口径

`landed` 只表示用例已进入绑定或结构化处置链；`passed` 只能来自当前用例指纹、实现指纹和完整执行收据。`deferred`、`blocked-source`、`blocked-technical`、`not-applicable`、`failed`、`product-defect` 和 `ready` 都是未决状态，不能从正式分母中移除。

当前调味闭环应同时满足：正式总数 `102` 守恒；`landed=76`、`unlanded=26` 只描述接入覆盖；模块完成必须 `acceptedComplete=102` 且 `unresolved=0`。权威产物为 `deliverables/system-test-platform/seasoning-module-closure.json`，其完成判定调用公共 `test-plan-landing-gate`，禁止项目脚本自行放宽口径。
