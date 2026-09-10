# 正式正文与派生稿的来源对账

运行 `npm run audit:product-center:item-source-derivation`，报告写入适配项目的 `deliverables/system-test-platform/product-center-item-source-derivation-audit.json`，保留不可变前后快照。

审计按稳定 caseId 对比当前正文与重建稿的标题、来源、前置条件、动作和预期，并登记生成脚本声明的断言 ID。正文编号不重排，清理分节独立；重复编号保留结构缺口。仅忽略空白差异，字段不同只代表版本差异，不能自动判为业务规则变化、产品错误或重跑授权。

重建稿指纹按其生成算法重新计算；审核内容指纹及其 sourcePlanFingerprint 分别校验。审批绑定重建稿不表示它批准了不同的当前正文。确认文档只登记明确 canonicalCorrections 引用，不能按同 caseId 推断任意代码修订已被采纳。

STD-001 的来源链为：正式 Markdown 中重复编号；`product-center-item-review-corrections.ts` 的固定修订生成 4 条预期；完整审核审批该重建稿；现有执行声明为 3 条。当前正文、派生稿和执行合同必须在源证据约束下重新对齐，禁止以某份审批状态抹平差异。

本审计属于 project-adapter/generated-evidence：不修改正式用例、业务实现或历史收据，不执行 UI/API，不使已有通过失效。遗漏、源读取失败、内容哈希失配、重建稿独有 caseId 都保留，不能用汇总数替代逐案证据。
