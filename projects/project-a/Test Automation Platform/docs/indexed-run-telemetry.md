# 逐调用索引统计

级别：必须。范围：public-core、project-adapter、generated-evidence。目的：恢复后的新 reporter 不能掩盖旧尝试，运行平均耗时不能由选择数推算。预期结果：每项统计绑定独立声明和原始账本快照，真实尝试与去重执行集合分离，未知历史保持未知。后续影响：不重跑业务，保留历史通过事实；已有旧报告不改写，新增报告的 `averageCaseDurationMs` 置为 null，真实平均值改用含义明确的 `averageTestAttemptDurationMs`。

`summarizeIndexedRunTelemetry` 消费 `readIndexedRunEvidence` 已校验的声明和快照，不使用可覆盖主报告中的汇总计数。跨调用的同 testId、同 retry 是不同尝试，不能去重掉恢复成本。跳过只属于登记结果；进行中属于已观察启动，但没有已完成耗时。

`observed` 表示现存快照中已观察的数值，历史缺失时只是已知下限。`totals` 仅在所有调用均有最终快照且索引起点明确时提供；否则所有整体指标为 null。`coverageStatus=complete` 只证明这份观察集合完整，不证明所选业务全部执行，更不授予业务通过。

`currentInvocation` 的选择、终态、跳过和未完成集合只来自最新调用，不回退旧成功。`indexedSelectedCaseIds` 是全部独立声明的选择并集。存在索引前未知历史时，完整 `historySelectedCaseIds` 及其指纹为 null。不同运行/系统不合并计数。

第一次建索引时明确记录 `preIndexHistory`：不存在旧账本为 none；有旧账本则按原字节保留快照并标记 unindexed-evidence，不伪造调用声明。旧索引没有该字段时为 unknown。两种未知历史都使整体总数不可用。旧快照损坏、否认仍存在的旧账本或主视图漂移均拒绝统计；敏感原文在保存前拒绝。

测试尝试工作耗时是全部实际尝试耗时之和，墙钟观察是尝试区间并集，重叠只计一次；平均值是工作耗时/实际尝试数。跳过不进入分母，零尝试时平均值为 null。任何未结束尝试使观察耗时未知。完整 runner 时间区间、非 runner 开销和实际浏览器成本仍未完成，分别保持 null，不从这些测试区间反推。

runner 在新报告中保存 `reporterInvocationTelemetry`。项目审计适配器只从登记系统的 manifest 和 latest-run-state 定位运行，再重新消费索引；不扫描历史目录凑数，不消费报告中的旧统计，也不据此判断发布当前性。项目生命周期阶段审计与该运行观察状态保持独立。

验收使用隔离的跨调用失败/跳过、区间重叠、缺 head、未结束、快照与主视图漂移、索引前账本及项目审计合同。未发起业务执行。
