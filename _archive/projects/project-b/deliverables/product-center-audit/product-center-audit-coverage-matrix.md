# 商品中心流程日志产品方案覆盖矩阵

生成时间：2026-08-28；本文件为基于代码、事件日志和既有治理产物生成的派生审计结果，不是业务用例正文。

## 结论

当前已完成“公共事件模型 + 纠正状态机 + 执行收据接入 + 调用级事件适配 + 结构化 Diff 生产合同 + 对象级清理收据 + current/history 分离 + v1.1 正确分母 + Jenkins 完整性门禁 + 离线 HTML/JSON/JSONL 报告”的 MVP 能力，但不能宣称平台通用方案全部完成。现存边界是：历史收据仅产生 17 条调用级事件，现有历史输入没有结构化字段 Diff、主要清理事实仍是旧版布尔汇总；不同 `applicationId` 试点和迁移治理仍受门禁阻断。

现有报告事实：1,236 条事件、89 个运行批次、360 个关联用例、510 条执行证据，其中 17 条为调用级 `operation.called`；纠正候选 0、数据变更事件 0。历史日志未提供 v1.1 `auditEligible` 声明，因此正式调用/Diff/清理覆盖率均为 `N/A`，`6/358=1.68%` 只作为历史临时调用观察值，不能充当正式分母。两个“0”均按当前输入如实呈现，不应手工改成非零。

## 覆盖明细

| 能力 | 层级 | 状态 | 证据/当前事实 | 整改动作 |
| --- | --- | --- | --- | --- |
| 事件模型、幂等、哈希链、脱敏 | 公共平台 | 已实现 | `src/audit/event-log.ts`；事件链通过 | 持续复用 |
| 流程阶段开始/完成/失败 | 公共平台 + 适配层 | 已实现 | flow 与统一 runner 已写入 run.started/run.authorized/run.completed；批次边界由 flow 写入 | 历史日志不会倒推伪造缺失阶段；后续执行持续记录 |
| API/UI 每次调用 | 公共平台 + 适配层 | 部分实现 | 已从显式 execution-index evidencePath 导入 operationReceipts，当前新增 17 条 `operation.called`；历史收据覆盖有限 | 后续执行收据持续提供逐次 operation receipt/network observation；不得用用例事件数代替调用次数 |
| 调用次数、时间、耗时、重试 | 报告层 | 部分实现 | 已按 operationKey 统计 17 条调用级事件；当前 retries=0，部分 duration 缺失；历史收据覆盖有限 | 持续补齐 route/method/response/duration，并保留 attempt/retryOfEventId |
| 更改内容 Diff | 公共平台 + 适配层 | 已实现 | 公共 `changeReceipts` 支持实体、对象 ID、变更类型、before/after 指纹和 changedFields；operation receipt 同样可携带 Diff；当前历史数据 `dataChanges=0` | 能力已完成；历史缺失保持 `未提供结构化变更证据`，不得推断字段变化 |
| 纠正候选触发 | 公共平台 + 适配层 | 已实现 | 状态机和 runtime-audit candidate 适配 | 当前无候选，保持 0 |
| 纠正去重/触发次数 | 公共平台 | 已实现 | dedupeKey、triggerCount、重复检测 | 接入真实候选来源 |
| 纠正启动/完成/阻断漏斗 | 公共平台 + 报告 | 部分实现 | 状态机有状态，适配器不伪造执行；当前全 0 | 由受治理 runner 写入真实 transition |
| 影响 caseId 追踪 | 公共平台 + 报告 | 已实现 | CorrectionRecord/history、caseTracking | 当前无候选时为 0 |
| 标准执行收据 | 公共平台 + 适配层 | 已实现 | execution-index 510 条转 evidence.recorded | 历史收据继续协调 |
| API/UI 对象级清理收据 | 公共平台 + 报告 | 已实现 | v1.1 支持 entityType、serverId、businessIdentity、cleanupAttempt、API/UI residueCount、outcome、failureCategory 和 evidenceRefs；门禁仅接受对象级 `verified-zero` | 现有 287 条历史收据主要为旧版布尔汇总，仅保留历史统计，不能替代新门禁 |
| 正式覆盖率分母 | 公共平台 + 报告 | 已实现 | v1.1 强制 `planned = auditEligible + classifiedExclusions`、`auditEligible = auditComplete + auditIncomplete`；报告只对声明适用的 operation/Diff/cleanup 用例计算正式覆盖率 | 现有历史日志无 v1.1 声明，正式覆盖率为 N/A，1.68% 仅临时观察值 |
| current/history 收据分离 | 公共平台 + 报告 | 已实现 | 报告分别输出 latestReceipt、receiptHistory、historicalReceiptCount，且明确 `arbitrationStatus=not-provided`；公共 arbiter 仍按当前 case/implementation 指纹裁决 | 不用最新时间替代当前性裁决；旧失败不得覆盖后续当前收据 |
| Jenkins v1.1 完整性门禁 | 公共平台 + Jenkins 接入 | 已实现 | `verify-system-test-audit-completeness.ts` 校验 v1.1 版本、两个分母守恒式和 auditIncomplete；exit 0/2 语义明确 | exit 2 是审计不完整，不是产品失败；保留业务结果并补证据 |
| 状态裁决 | 公共平台 | 已实现 | handling/verification/actionRequired 与 receipt 事实分离 | 受治理门禁约束 |
| HTML/JSON/JSONL 报告 | 适配层 + 报告 | 已实现 | `deliverables/product-center-audit` 与 `output/audit` | 当前为离线静态报告，非在线中心 |
| 脱敏与权限边界 | 公共平台 | 已实现 | 递归敏感字段脱敏 | 禁止旁路写密钥 |
| 检查点/恢复/幂等重试 | 公共平台 + flow | 已实现 | flow checkpoint、文件锁、重复构建幂等 | 遵循瞬态失败恢复策略 |
| 跨系统适配 | 公共平台 + adapter | 治理阻断 | 无不同 `applicationId` 真实 pilot | 完成合格跨系统试点 |
| 迁移与资产治理 | 平台治理 | 治理阻断 | `PROJECT_MIGRATION_NOT_COMPLETE` | 处理迁移报告，不重跑既有通过用例 |

## 整改优先级

1. **必须**：后续标准执行持续产出 v1.1 operation、Diff、对象级 cleanup 收据，并在 Jenkins 执行完整性门禁。目的：把已经落地的生产能力变成当前批次可核验事实。预期结果：`auditIncomplete=0` 且两个分母守恒式成立；已有通过结果不失效、不全量重跑。后续影响：仅受影响的新执行/增量执行增加收据写入与静态门禁成本。
2. **必须**：历史数据继续标记 `provisional`，不倒推补造 Diff 或对象清理。目的：避免 17 条调用事件和 287 条旧清理布尔汇总冒充正式完整性。预期结果：正式覆盖率保持 N/A，直到有 v1.1 当前收据；历史结果保留且不失效。后续影响：不增加页面执行；需要当前性时按变化影响范围审批增量重验。
3. **可选**：建设在线查询、权限、实时通知和对象清理明细筛选。目的：提升长期运营复盘效率。预期结果：可按 run/case/entity 查询残留与变更。后续影响：新增服务和运维成本，不作为当前商品中心模块交付阻断。
4. **暂不建议**：在没有不同 `applicationId` 目标系统和迁移接受收据前宣称跨系统完成，或为填充漏斗/Diff 数字重跑已冻结业务用例。目的、结果和影响均不满足安全门禁。

机器可读版本见同目录 `product-center-audit-coverage-matrix.json`。
