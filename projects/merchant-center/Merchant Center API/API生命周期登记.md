# API 生命周期登记

> 本文件由 `Merchant Center API/api-lifecycle-registry.json` 自动生成，请勿手工维护。原始供应方接口文档保持不变；活动测试目录由生命周期登记过滤。

| 接口 | 状态 | 替代接口 | 说明 | 决策日期 |
| --- | --- | --- | --- | --- |
| brand-menu:POST /ops-brand/menu-import/upload | deprecated | brand-menu:POST /ops-brand/menu-import-tasks-files | 商品中心商品导入页实际文件上传调用 /item/v1/ops-brand/menu-import-tasks-files；未发现页面调用本接口。原文档将二进制 file 错误声明在 application/json 下。 | 2026-08-23 |
| brand-menu:GET /ops-brand/sched/jobs | not-applicable | 无 | 品牌调度内部运维接口，不属于当前商品中心业务接口测试范围；保留原始文档和历史探测结果，不进入活动接口测试目录。 | 2026-08-23 |
| brand-menu:POST /ops-brand/sched/jobs | not-applicable | 无 | 品牌调度内部运维接口，不属于当前商品中心业务接口测试范围；保留原始文档和历史探测结果，不进入活动接口测试目录。 | 2026-08-23 |
| brand-menu:GET /ops-brand/sched/jobs/{jobId} | not-applicable | 无 | 品牌调度内部运维接口，不属于当前商品中心业务接口测试范围；保留原始文档和历史探测结果，不进入活动接口测试目录。 | 2026-08-23 |
| brand-menu:GET /ops-brand/sched/jobs/{jobId}/tasks | not-applicable | 无 | 品牌调度内部运维接口，不属于当前商品中心业务接口测试范围；保留原始文档和历史探测结果，不进入活动接口测试目录。 | 2026-08-23 |
| brand-menu:POST /ops-brand/sched/jobs/{jobId}/tasks | not-applicable | 无 | 品牌调度内部运维接口，不属于当前商品中心业务接口测试范围；保留原始文档和历史探测结果，不进入活动接口测试目录。 | 2026-08-23 |

## 状态规则

- `deprecated`：已废弃，不生成活动接口测试，不进入活动阻断清单；历史结果保留并标记生命周期排除。
- `superseded`：已由新接口替代，处理方式同废弃，但必须登记替代接口。
- `blocked-review`：来源或业务用途待复核，不得自动执行真实请求。
- `not-applicable`：经范围确认不属于当前业务测试，不生成活动接口测试；原始文档和历史结果保留。
- 未登记接口默认按 `active` 处理。
