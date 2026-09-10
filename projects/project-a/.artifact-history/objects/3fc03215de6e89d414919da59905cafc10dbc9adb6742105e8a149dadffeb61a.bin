# 迁移闭环审计

- 审计 ID：`merchant-center-platform-extraction-closure`
- 应用 ID：`merchant-center`
- 迁移闭环状态：`incomplete`
- 输入指纹：`0d9d4bf4ffe21cd6187a98a80dcf647c7fe317eafbf483e15089e9eb43212bed`
- 范围说明：本报告只判定迁移和文件治理闭环，不声明跨系统平台最终完成。

## 文件归属

| 分类 | 数量 |
| --- | ---: |
| 公共核心 | 283 |
| 项目适配器 | 287 |
| 领域资产 | 1470 |
| 生成证据 | 12257 |
| 历史资产 | 57 |
| 瞬态文件 | 2 |
| 扫描总数 | 14356 |

## 闭环门禁

| 门禁 | 问题数 |
| --- | ---: |
| 未归属文件 | 0 |
| 公共桥接违规 | 0 |
| 重复公共实现 | 0 |
| 断裂引用 | 0 |
| 文档与机器引用冲突 | 0 |
| 错位瞬态文件 | 0 |
| 公共目录项目内容 | 6 |
| 禁止内容引用 | 0 |
| 必需迁移资产缺失 | 0 |
| 迁移基线缺失 | 0 |
| 迁移后缺失文件 | 0 |
| 迁移后变更文件 | 2 |
| 迁移基线接受收据无效 | 0 |
| 历史快照断裂引用（非阻断） | 0 |

## 公共目录项目内容

- `platform:deliverables/system-test-audit-reference/audit-pipeline-report-print.html`：PUBLIC_BOUNDARY_CONTENT_FORBIDDEN，公共平台文件包含禁止的项目身份或业务内容：product-center
- `platform:deliverables/system-test-audit-reference/audit-pipeline-report.html`：PUBLIC_BOUNDARY_CONTENT_FORBIDDEN，公共平台文件包含禁止的项目身份或业务内容：product-center
- `platform:deliverables/system-test-audit-reference/audit-pipeline-result.json`：PUBLIC_BOUNDARY_CONTENT_FORBIDDEN，公共平台文件包含禁止的项目身份或业务内容：product-center
- `platform:deliverables/system-test-audit-reference/runs/audit-reference-1788911853670/audit-pipeline-report-print.html`：PUBLIC_BOUNDARY_CONTENT_FORBIDDEN，公共平台文件包含禁止的项目身份或业务内容：product-center
- `platform:deliverables/system-test-audit-reference/runs/audit-reference-1788911853670/audit-pipeline-report.html`：PUBLIC_BOUNDARY_CONTENT_FORBIDDEN，公共平台文件包含禁止的项目身份或业务内容：product-center
- `platform:deliverables/system-test-audit-reference/runs/audit-reference-1788911853670/audit-pipeline-result.json`：PUBLIC_BOUNDARY_CONTENT_FORBIDDEN，公共平台文件包含禁止的项目身份或业务内容：product-center

## 迁移完整性基线

- `workspace:Merchant Center UITest/adapters/product-center/product-center-item-addon-price-specs.ts`：MIGRATION_ASSET_CHANGED，基线 564b8a7246b933d84925970da73323db942895fe0e435788f2c132a444f3e73c/1021，当前 076183044665c985605e3f75a72ce14d31cd5c13b2fd8368ca5098b2f1411872/1039
- `workspace:Merchant Center UITest/adapters/product-center/product-center-item-implementation.ts`：MIGRATION_ASSET_CHANGED，基线 cb73e31189417545a46cb36e11269d7d67eef02c105e5a28f8f58f4f108971b6/20213，当前 a3ef9d9ad16fd6665160a488d2c7e00237a8a7c0f701fe02fa969a1280da348f/20400

## 历史来源

- `workspace:Merchant Center Info/99-待废弃/商品中心-商品管理-商品`：retained-with-active-references，引用文件 4 个，引用目标 7 个。

## 验收结论

- 迁移闭环未完成；必须清零全部门禁问题后才能声明本次迁移结束。

