# 本次执行观察与历史证据资格

级别：必须。范围：public-core、project-adapter、generated-evidence。目的：历史快照异常不能抹去本次独立有效的执行终态，也不能触发证据问题导致的重复业务执行。预期结果：执行事实、历史证据 findings 与通过资格分离。后续影响：不重跑业务，历史通过事实保留；严格通过与收据导入门禁保持原有要求。

`readCurrentIndexedRunObservation` 验证完整声明身份链、最新调用的独立声明、当前快照哈希、当前主视图、原始尝试投影及候选指纹。消费前再次检查最新调用与快照未变化。当前声明、快照、主视图、选择集或调用身份失败时仍返回 incomplete，不回退历史结果。

旧调用 payload 或索引前旧账本损坏时，可独立验证的本次观察仍返回 available，同时记录 `historicalEvidenceFinding` 和 `businessPassAuthorized=false`。声明链损坏不属于可隔离 payload 异常，仍阻断本次身份来源。严格 `readIndexedRunEvidence` 与 `readRunEvidenceLedger` 不放宽，标准收据导入、就绪评审和通过资格仍拒绝异常历史索引。

`readRunExecutionObservation` 只用于执行完成/检查点消费者。公共 flow 与项目终态适配器消费它，并保留选择和当前用例/实现指纹门禁。flow 判定本次选择全部达到终态但历史证据异常时输出 completed-with-findings；该批次的已完成执行可跳过重复运行，但未取得业务通过或发布复用资格。真实部分执行仍为 blocked。

新 run-report 的 `evidenceInvocation` 分别记录 `observationStatus`、当前快照哈希和严格 `indexStatus`。旧报告即使保存零退出码，只要当前分类发现证据异常，flow 最终退出码也必须非零。报告绑定不匹配仍阻断消费。

历史异常生成运行级 `runDiagnostics`，包含中文结论、reporting 阶段、automation-gap 分类、期望/实际与索引引用。工作队列用独立 `runItems` 登记 reconcile-run-evidence，不伪造业务 caseId、不产生产品缺陷、不授权业务重跑。当前逐案失败诊断保持独立。

跨调用遥测继续使用严格索引读取；历史异常时完整总数仍不可用。本合同没有将未知清理或历史执行覆盖标记完整，也未实现不完整批次内恢复、完整 runner 耗时或自动发布复用。

验证使用历史 hash 异常、本次有效终态、当前主视图损坏、新调用缺报告、声明链损坏、严格导入拒绝、非零 flow 退出码及项目当前指纹漂移等隔离合同。
