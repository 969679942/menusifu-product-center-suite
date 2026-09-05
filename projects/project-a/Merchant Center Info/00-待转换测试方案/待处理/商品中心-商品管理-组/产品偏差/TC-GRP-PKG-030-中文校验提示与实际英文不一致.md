# TC-GRP-PKG-030 产品偏差

- 用例：随心配最少选择数量大于最多选择数量时保存失败
- 当前正式期望：最少选择数量为 `3`、最多选择数量为 `1` 时拒绝提交，并显示 `最多选择数量不能小于最少选择数量`。
- 历史实际结果：提交被拒绝，未产生套餐组记录，但中文界面显示 `Maximum selection quantity cannot be less than minimum`。
- 当前实际结果：2026-09-03 定向黑盒复核已显示 `最多选择数量不能小于最少选择数量`，提交被拒绝且套餐组 API 零落库。
- 分类：`resolved-product-defect`，比较面为 `validation-feedback`。
- 清理：测试商品 API/UI 零残留，检查点均为 `residue-verified`。
- 当前处理：保留 canonical 中文期望，产品偏差已由当前完整收据关闭，恢复正常自动化绑定。

## 当前裁决

- 处理状态：`resolved`
- 是否需要人工重新确认业务规则：否
- 是否允许重复执行：仅在用例/实现指纹变化、运行时行为漂移或用户明确要求定向复核时进入增量执行；本次已闭环，不再重复执行。
- 是否影响其他已通过用例：否
- 产品行为结论：数量关系校验、中文提示、禁止落库和清理均符合正式规则。

## 关闭证据

- 执行批次：`product-center-group-pkg030-standard-closure-20260903-r5`（执行纪元 `source-governed-product-center-group-pkg030-standard-closure-20260903-r5-attempt-1`）。
- 用例指纹：`sha256:41adef275b59e5c34f8ba0469565b2459faf88a5b0e0e05443397440e3d54ac1`
- 实现指纹：`8c209b831382cb9cbfcab41a7b1092093c7b7f6b67fce4337310cb0d67d60d8c`；专用 handler 为 `combo-v2-pkg030-validation`。
- 执行指纹：`f04b64f186cd615502ca790aa180c21102c004ea2319882a2f126f2f97066cb5`
- 证据指纹：`da29311793e5224a8c4b9d7ddf5577d24fa93dc7d48ab2b9dd85a458616744cc`
- 执行上下文：商户/租户 `000407`、角色 `merchant-operator`、路由 `/pp/brand/combo`；环境和 locale 未取得稳定发布字段，SaaS 发布观测来自 `browser-runtime`，运行时资产指纹为 `de5bdfef50ededef73e87530b9f351a0235f3fb5db9194933d1ae8ca22e183a2`，不要求源码版本号。
- 运行证据：`D:\Menusifu\Merchant Center\Merchant Center UITest\output\product-center-group-source-governed-product-center-group-pkg030-standard-closure-20260903-r5.json`
- 结论：3/3 断言 verified；API/UI 零残留；旧英文提示偏差关闭。

## 研发修复范围

1. 中文界面触发“最多选择数量小于最少选择数量”校验时，展示正式中文提示 `最多选择数量不能小于最少选择数量`。
2. 不改变现有数量关系校验、提交拦截及零落库行为。
3. 当前证据不能证明具体代码根因；研发需核对校验错误到中文资源的映射，不得把“资源映射缺失”直接当成已确认根因。

## 修复后验收清单

1. 进入随心配新增页并添加有效商品。
2. 最少选择数量输入 `3`，核对输入框值为 `3`。
3. 最多选择数量输入 `1`，核对输入框值为 `1`。
4. 补全价格来源等必填项后点击“确定”。
5. UI 精确展示 `最多选择数量不能小于最少选择数量`，不再展示英文提示。
6. 核对提交被拒绝，按唯一组名查询套餐组 API 为零条。
7. 清理测试商品，并验证 UI/API 均为零残留。

## 恢复执行门禁

只有满足以下任一条件，才重新进入增量审计：

- 产品提供已部署的修复版本或发布标识；
- 运行时发布观测能够证明应用版本发生变化；
- 产品正式变更业务规则，并同步修改权威用例预期。
- 对无法取得源码版本号的 SaaS 服务，金将军明确授权一次当前上下文黑盒复核。

门禁满足后固定执行：重建组自动化绑定 → 闭环审计 → 仅批准 `TC-GRP-PKG-030` → 计划预检 → 定向执行 → 导入标准收据 → 刷新产品偏差索引。不得顺带重跑其他已通过用例。

运行证据：

- `D:\Menusifu\Merchant Center\Merchant Center UITest\output\product-center-group-source-governed-product-center-pkg030-product-difference-20260830-r5.json`
- `D:\Menusifu\Merchant Center\Merchant Center UITest\output\product-center-group-tc-grp-pkg-030-product-defect-evidence-v1.json`
- `D:\Menusifu\Merchant Center\Merchant Center UITest\test-results\source-governed\product-center-pkg030-product-difference-20260830-r5\group\generated-product-center-g-0a71f-用例全量-随心配最少选择数量大于最多选择数量时保存失败-chrome\test-failed-1.png`
