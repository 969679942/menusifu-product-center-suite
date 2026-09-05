# TC-GRP-PKG-045 已保存套餐组类型无选中状态

- `caseId`：`TC-GRP-PKG-045`
- `状态`：`product-defect`
- `发现时间`：2026-09-05
- `来源`：当前标准执行收据
- `正式预期`：已保存套餐组编辑页中三种套餐类型单选项全部禁用，且仅原套餐类型处于选中状态。
- `实际表现`：三个单选项均为 `disabled=true`，但三个单选项均为 `checked=false`；页面稳定复现。
- `影响`：已保存套餐组编辑页无法从控件状态识别原套餐类型，违反用例的单一选中不变量；当前不能判定为自动化定位或环境问题。
- `处理`：登记产品偏差，暂停同一实现下的重复页面重跑；待产品修复或业务规则确认后，更新正式用例/绑定并重新执行。
- `证据`：
  - 结果：`Merchant Center UITest/output/allure/source-governed/b6-failed-cases-revalidation-20260905-source-governed/group/allure-results/3f0bd279-aa61-415c-aa98-8a2eed2e59fe-result.json`
  - 错误上下文：`Merchant Center UITest/output/allure/source-governed/b6-failed-cases-revalidation-20260905-source-governed/group/allure-results/cf3e01dc-ca57-44f8-9095-8b5587ac0491-attachment.md`
  - 截图：`Merchant Center UITest/output/allure/source-governed/b6-failed-cases-revalidation-20260905-source-governed/group/allure-results/4344d8b1-b7ef-480f-8c7d-66438f883fbd-attachment.png`
- `现有结果影响`：B6 其余 7 条已通过结果不变；本用例保留当前失败收据，不转为 `passed`。
