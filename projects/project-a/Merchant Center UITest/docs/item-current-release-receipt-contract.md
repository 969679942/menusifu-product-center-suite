# 商品当前发布收据合同

项目发布入口消费 `contracts/product-center/test-cases/canonical/product-center-item-current-receipt-contract.json`，由项目适配器 `product-center-item-release-receipts.ts` 验证并接入公共收据资格合同。

合同结构包含 `schemaVersion: 1.0.0`、正式 Markdown 原始内容的 `canonicalSourceSha256`、逐案 `cases` 和项目内实际 Playwright JSON `reportPaths`。每个 case 采用公共 `CurrentReleaseCaseContract`：当前用例绑定、语义、实现、执行上下文指纹，完整声明操作与断言集合，以及清理要求。上下文及操作集合必须来自当前执行计划和适配合同，禁止从历史收据猜填。

适配器重新计算正式来源语义和当前实现指纹，并核对正式预期结果 ID。所有报告只读取一次，按真实时间选择最近尝试；最新失败、时间不明、重复附件或路径越界均禁止发布。通过结果来源链包含原报告哈希。最终发布与一键交付不再要求旧 31/19 整改汇总作为通过凭据；历史文件保留为历史材料。

生成器原生写入语义指纹，保存真实断言数组及 API/UI 清理观测；空断言不回填已验证集合。原后处理脚本保留为历史兼容入口，标准生成命令不再依赖它。

当前商品逐操作/上下文发布合同尚未完成准入。缺口必须逐案自动检查和补齐，本次禁止创建空合同或利用旧收据拼出通过合同。发布防误判门禁已实现，整体发布链路仍未完成；不因此重跑业务或删除既有历史通过事实。
# 正式断言编号与清理分节

正式动作使用当前正文数组顺序的 `${caseId}:action-N` 身份。直接业务收据的 requiredOperationKeys 必须覆盖该完整集合；装饰器方法记录通过公共 operationMapping 显式逐项映射，sourceStepIds 同样必须与当前正文集合一致。禁止以通用 execute 方法覆盖多个正式动作，或从历史报告枚举方法反推当前合同。

发布准入消费正文中的稳定断言编号；原编号为 2 时保留 `expectation-2`，不得按数组位置改成 1。“清理要求”分节独立校验，不增加业务断言数量。重复编号以 `FORMAL_ASSERTION_NUMBERING_AMBIGUOUS` 阻断，不能静默去重授权通过。

发布就绪审计即使缺少当前合同文件，也独立对账正文与生成声明。该调整只修正报告和准入解析；保留现有语义指纹算法和历史收据，不自动重跑业务。正文重复编号的来源追溯与正式修复仍须独立完成。

## 当前执行裁决与生成注册数量

发布就绪审计通过现有 `loadProductCenterExecutionDecisions` 消费正式执行裁决。已生成注册但当前 `not-applicable` 的用例保留逐案记录、原因及替代用例，不进入当前收据要求；`deferred` 保留恢复条件；`handled` 仍需完整当前收据，不能直接判通过。裁决文件缺失或校验失败时禁止生成成功结论。

生成注册数量独立记录在 `generatedRegistration`。当前分类满足 `formal = notApplicable + executable`、`executable = classifiedDeferred + receiptContractRequired`、`receiptContractRequired = currentQualified + incomplete`。正式断言声明不完整时，即使单独收据校验接受，也不得计入 `currentQualified`。

该变更属于 `project-adapter` 的报告消费修复，沿用公共当前收据合同，不改变执行状态机、业务实现指纹、历史结果或执行选择集，不触发业务重跑。隔离合同覆盖不适用/延期压过历史成功、handled不能压过当前失败、裁决输入变化与缺失、来源声明不完整拒绝通过。

## 纯排版后的收据协调

可选 `implementationFormatBaselines[caseId]` 保存完整旧检查点来源清单，以及有变化文件的项目内原字节快照路径。当前原始指纹不同时，适配器调用公共 `verifyImplementationFormatEquivalence` 重新验证完整集合、旧指纹及语法一致性。通过后继续使用原合同验证原始收据，并输出格式等价来源哈希；不改写收据，不刷新执行时间，不授权业务重跑。语法、依赖、上下文或断言变化仍阻断。
