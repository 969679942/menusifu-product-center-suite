# 迁移闭环审计

- 审计 ID：`merchant-center-platform-extraction-closure`
- 应用 ID：`merchant-center`
- 迁移闭环状态：`incomplete`
- 输入指纹：`65f878178c4f9308f1870f1f7d45d7573a6ff7fafa720448207d0d9a340fe745`
- 范围说明：本报告只判定迁移和文件治理闭环，不声明跨系统平台最终完成。

## 文件归属

| 分类 | 数量 |
| --- | ---: |
| 公共核心 | 229 |
| 项目适配器 | 266 |
| 领域资产 | 1320 |
| 生成证据 | 141339 |
| 历史资产 | 57 |
| 瞬态文件 | 2 |
| 扫描总数 | 143213 |

## 闭环门禁

| 门禁 | 问题数 |
| --- | ---: |
| 未归属文件 | 0 |
| 公共桥接违规 | 0 |
| 重复公共实现 | 0 |
| 断裂引用 | 0 |
| 文档与机器引用冲突 | 0 |
| 错位瞬态文件 | 0 |
| 公共目录项目内容 | 0 |
| 禁止内容引用 | 0 |
| 必需迁移资产缺失 | 0 |
| 迁移基线缺失 | 0 |
| 迁移后缺失文件 | 0 |
| 迁移后变更文件 | 4 |
| 迁移基线接受收据无效 | 0 |
| 历史快照断裂引用（非阻断） | 0 |

## 迁移完整性基线

- `platform:scripts/run-system-test-audit-pipeline.ts`：MIGRATION_ASSET_CHANGED，基线 2a7c82bce0d01967957a563c6c6725d699e89d3c1d77ae27e8566d0b6d3046e1/33869，当前 e1ef83491b66abb440175cebcee644dac031844e08bee209d01404d48fee8e5d/35439
- `platform:src/automation/system-test/system-test-repair-attempt-guard.ts`：MIGRATION_ASSET_CHANGED，基线 675d2999d7861a7bb1aac7c3376f9ade6b06f9afb764cb2c351bdc8e53be707f/15075，当前 3f884bdb8b3280782f8fd1d89430b8f2fe7319c6668141b2202726f3f434d844/15501
- `platform:src/reporters/system-test-audit-report.ts`：MIGRATION_ASSET_CHANGED，基线 b63237f02b1e75299179ac007468eb3e8d43069544d146f04c3a862ab0724115/65482，当前 61e59bc9a7dad5d712d7a3cc48987a1b355558372f045f5b2a925964fde27c95/69232
- `workspace:Merchant Center UITest/adapters/product-center/product-center-audit-report.ts`：MIGRATION_ASSET_CHANGED，基线 9afef865726cab2ec24fc51acfa39d4f96860175be0e3647e709378b429082cf/69862，当前 4fb2a1a86af1164a72bcae25f68fd3990f5faacb413dbae5789500393e0dc83b/77253

## 历史来源

- `workspace:Merchant Center Info/99-待废弃/商品中心-商品管理-商品`：retained-with-active-references，引用文件 4 个，引用目标 7 个。

## 验收结论

- 迁移闭环未完成；必须清零全部门禁问题后才能声明本次迁移结束。

