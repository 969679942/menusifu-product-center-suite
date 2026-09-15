# 运行证据索引

级别：必须。范围：public-core、project-adapter、generated-evidence。目的：同 runId 进程恢复后保留每次 reporter 的独立身份与证据，阻断旧成功回退。预期结果：新调用缺报告、未结束、报告绑定漂移、快照损坏或重复认领均不得授权完成。后续影响：历史通过事实保留，不执行业务重跑；校验增加文件 I/O，实际业务性能尚未测量。

runner 在启动 reporter 前通过 `registerEvidenceInvocation` 固化 runId、精确选择集、合同、实现和执行候选指纹。声明使用 UUID、序号及前一声明哈希关联，由 runner 环境传递给 reporter。每次 reporter 用 `claimEvidenceInvocation` 独占认领，终结后不可再次发布。

调用分别保存 declaration、owner、ledger、head。head 指向 `.artifact-history/objects/<sha>.bin`，公共不可变写入器保存更新前后的快照和转换记录。注册及主视图发布共用排他锁；锁竞争时失败，不移除其他进程的锁。旧进程可完成自身快照，但不能更新新调用的主视图。崩溃留下的锁必须由代理核验进程状态后处理；目前不自动抢锁。

`readIndexedRunEvidence` 校验声明链、逐调用 head、快照字节哈希、独立选择集及重算的尝试投影。历史未产出报告记录 null；当前调用未产出报告返回 incomplete，不能回退旧 head。它不将历史缺失视为执行零次。

`readRunEvidenceLedger` 是消费边界：1.2.0 或存在索引时，当前文件必须与索引快照匹配；平台试点发现与执行结果导出还要求调用终结且 run-report 绑定同 invocationId 和 snapshotHash。标准收据导入可读取经严格验证的部分检查点，但仍执行业务身份和标准收据门禁。流程完成与项目终态使用独立的 [本次执行观察](current-run-observation.md)：历史 payload 异常保留为 findings，不抹去独立有效的本次终态；观察不授予业务通过资格。

旧 1.0/1.1 无索引账本保留兼容路径；不伪造历史声明。已有索引的运行禁止 Allure 旧恢复入口覆盖账本。索引前的旧主视图在首次注册时保留原字节快照，preIndexHistory 明确记录 unindexed-evidence；它不被升级为有独立声明的调用，整体统计也不能忽略这段未知历史。

不完整索引只返回规范化错误码。新内容及被覆盖旧内容在进入快照前检查敏感内容；沿用公共敏感内容检测规则。目录解析复用路径包含及符号链接边界校验。

限制：文件哈希链不能抵御所有索引、声明、快照被协同恶意重写；没有外部签名信任根。跨调用尝试统计已由 [逐调用索引统计](indexed-run-telemetry.md) 提供；完整 runner 时间区间和非 runner 开销、多分片协调、不完整批次内避免重复执行、报告变更指纹影响仍是独立未完成工作。同系统启动互斥现由 [公共运行租约](run-execution-lease.md) 处理。每回调保存完整账本的成本尚未在业务运行中测量。

验证使用系统无关隔离合同、独立 Playwright 子进程及项目适配器夹具；不发起认证、造数、业务 UI/API 或试点。
