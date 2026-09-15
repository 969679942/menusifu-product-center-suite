# 迁移闭环审计

- 审计 ID：`merchant-center-platform-extraction-closure`
- 应用 ID：`merchant-center`
- 迁移闭环状态：`incomplete`
- 输入指纹：`d6f21e614211b7c2d61813c0500b7d36bbbdb2f26edfae0af2f7f43518c958c0`
- 范围说明：本报告只判定迁移和文件治理闭环，不声明跨系统平台最终完成。

## 文件归属

| 分类 | 数量 |
| --- | ---: |
| 公共核心 | 239 |
| 项目适配器 | 0 |
| 领域资产 | 0 |
| 生成证据 | 0 |
| 历史资产 | 0 |
| 瞬态文件 | 0 |
| 扫描总数 | 270 |

## 闭环门禁

| 门禁 | 问题数 |
| --- | ---: |
| 未归属文件 | 31 |
| 公共桥接违规 | 85 |
| 重复公共实现 | 0 |
| 断裂引用 | 1 |
| 文档与机器引用冲突 | 0 |
| 错位瞬态文件 | 0 |
| 公共目录项目内容 | 0 |
| 禁止内容引用 | 0 |
| 必需迁移资产缺失 | 15 |
| 迁移基线缺失 | 1 |
| 迁移后缺失文件 | 1 |
| 迁移后变更文件 | 0 |
| 迁移基线接受收据无效 | 0 |
| 历史快照断裂引用（非阻断） | 0 |

## 未归属文件

- `workspace:product-center/product-center-audit-event-adapter.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:product-center/product-center-audit-report.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:product-center/product-center-business-rule-completion-review-adapter.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:product-center/product-center-business-rule-document-coverage-adapter.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:product-center/product-center-business-rule-event-adapter.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:product-center/product-center-business-rule-lifecycle-adapter.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:product-center/product-center-business-rule-observation-adapter.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:product-center/product-center-execution-intent.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:product-center/product-center-fingerprint-revalidation-impact.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:product-center/product-center-item-implementation.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:product-center/product-center-project-optimization.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:product-center/product-center-recipe-capabilities.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:product-center/product-center-seasoning-terminal-receipts.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:product-center/product-center-source-recovery-adapter.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:product-center/product-center-source-terminal-receipts.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:product-center/product-center-system-test-compatibility.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:product-center/seasoning-read-assertions.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:product-center/seasoning-reporting.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:test-automation-platform/allure-reporting.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:test-automation-platform/audit-step-reporting.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:test-automation-platform/migration-closure.manifest.json`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:test-automation-platform/playwright-concurrency.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:test-automation-platform/product-center-current-status.ts`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:test-automation-platform/product-center-reverse-scenario-map-v1.json`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:test-automation-platform/project-adapter.json`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:test-automation-platform/reports/merchant-center-extraction-audit.md`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:test-automation-platform/reports/merchant-center-file-governance-result.md`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:test-automation-platform/reports/merchant-center-integration.md`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:test-automation-platform/reports/merchant-center-migration-closure.json`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:test-automation-platform/reports/merchant-center-migration-closure.md`：UNOWNED_FILE，文件未匹配任何归属规则
- `workspace:test-automation-platform/reports/migration-inventory.baseline.json`：UNOWNED_FILE，文件未匹配任何归属规则

## 公共桥接违规

- `workspace:Merchant Center UITest/automation/recipe/automation-recipe.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/recipe/automation-recipe.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/recipe/capability-registry.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/recipe/capability-registry.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/recipe/recipe-collection-manifest.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/recipe/recipe-collection-manifest.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/recipe/recipe-feedback.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/recipe/recipe-feedback.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/recipe/recipe-validator.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/recipe/recipe-validator.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/recipe/sidebar-navigation-capability.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/recipe/sidebar-navigation-capability.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/business-rule-change-event.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/business-rule-change-event.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/business-rule-change-trigger.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/business-rule-change-trigger.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/business-rule-coverage.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/business-rule-coverage.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/business-rule-downstream-contract.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/business-rule-downstream-contract.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/business-rule-governance.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/business-rule-governance.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/business-rule-lifecycle.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/business-rule-lifecycle.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/business-rule-promotion.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/business-rule-promotion.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/business-rule-review-governance.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/business-rule-review-governance.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/requirements-change-event.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/requirements-change-event.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-artifact-lineage.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-artifact-lineage.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-asset-lifecycle.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-asset-lifecycle.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-audit-contract.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-audit-contract.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-capability-matching.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-capability-matching.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-case-state-arbiter.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-case-state-arbiter.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-circuit.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-circuit.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-concurrency.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-concurrency.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-contract.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-contract.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-correction-audit.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-correction-audit.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-diagnostics.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-diagnostics.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-evidence.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-evidence.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-execution-candidate.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-execution-candidate.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-execution-grant.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-execution-grant.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-external-dependency.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-external-dependency.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-failure.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-failure.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-final-goal-gate.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-final-goal-gate.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-governance.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-governance.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-implementation-fingerprint.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-implementation-fingerprint.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-onboarding.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-onboarding.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-plan-compiler.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-plan-compiler.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-platform-readiness.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-platform-readiness.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-platform-review.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-platform-review.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-progress.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-progress.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-recipe-executor.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-recipe-executor.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-reference-baseline.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-reference-baseline.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-repair-attempt-guard.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-repair-attempt-guard.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-repair-telemetry.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-repair-telemetry.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-report-freshness-arbiter.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-report-freshness-arbiter.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-request-correlation.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-request-correlation.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-resource-lock.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-resource-lock.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-revalidation-policy.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-revalidation-policy.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-rule-governance.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-rule-governance.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-run-state.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-run-state.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-runtime-contract.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-runtime-contract.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-safety.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-safety.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-semantic-governance.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-semantic-governance.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-source-recovery.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-source-recovery.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-source-status.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-source-status.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-stage-receipt.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-stage-receipt.ts 的兼容桥
- `workspace:Merchant Center UITest/automation/system-test/system-test-universal-invariants.ts`：BRIDGE_MISSING，缺少公共文件 src/automation/system-test/system-test-universal-invariants.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/acceptance/acceptance-manifest.ts`：BRIDGE_MISSING，缺少公共文件 src/acceptance/acceptance-manifest.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/acceptance/acceptance-orchestrator.ts`：BRIDGE_MISSING，缺少公共文件 src/acceptance/acceptance-orchestrator.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/acceptance/playwright-route-probe.ts`：BRIDGE_MISSING，缺少公共文件 src/acceptance/playwright-route-probe.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/acceptance/redaction.ts`：BRIDGE_MISSING，缺少公共文件 src/acceptance/redaction.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/acceptance/route-residue-scanner.ts`：BRIDGE_MISSING，缺少公共文件 src/acceptance/route-residue-scanner.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/acceptance/route-scan-checkpoint.ts`：BRIDGE_MISSING，缺少公共文件 src/acceptance/route-scan-checkpoint.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/allure-result-retention.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/allure-result-retention.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/business-feedback-contract.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/business-feedback-contract.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/case-fingerprint-cutover-authorization.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/case-fingerprint-cutover-authorization.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/case-semantic-fingerprint.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/case-semantic-fingerprint.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/contract-change-impact.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/contract-change-impact.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/dual-case-fingerprint-transition.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/dual-case-fingerprint-transition.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/executable-operation-receipt.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/executable-operation-receipt.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/historical-receipt-compatibility.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/historical-receipt-compatibility.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/idempotent-pipeline.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/idempotent-pipeline.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/incremental-test-plan.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/incremental-test-plan.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/playwright-batch-policy.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/playwright-batch-policy.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/playwright-execution-receipt.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/playwright-execution-receipt.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/reverse-scenario-catalog.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/reverse-scenario-catalog.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/review-batch.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/review-batch.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/runtime-audit-correction-from-receipt.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/runtime-audit-correction-from-receipt.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/runtime-audit-freshness.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/runtime-audit-freshness.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/system-test-allure-evidence-recovery.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/system-test-allure-evidence-recovery.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/system-test-evidence-ledger-receipt.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/system-test-evidence-ledger-receipt.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/test-evidence-governance.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/test-evidence-governance.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/test-execution-index.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/test-execution-index.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/test-execution-state.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/test-execution-state.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/test-plan-landing-gate.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/test-plan-landing-gate.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/test-plan-runtime-audit-correction.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/test-plan-runtime-audit-correction.ts 的兼容桥
- `workspace:Merchant Center UITest/utils/wait.ts`：BRIDGE_MISSING，缺少公共文件 src/utils/wait.ts 的兼容桥

## 断裂引用

- `workspace:Merchant Center UITest/package.json`：PACKAGE_JSON_MISSING，包命令清单不存在

## 必需迁移资产缺失

- `workspace:Merchant Center UITest/adapters/test-automation-platform/project-adapter.json`：REQUIRED_MIGRATION_ASSET_MISSING，缺少迁移目标资产，策略 merchant-center-platform-state-and-migration-reports
- `workspace:Merchant Center UITest/adapters/test-automation-platform/reports/merchant-center-extraction-audit.md`：REQUIRED_MIGRATION_ASSET_MISSING，缺少迁移目标资产，策略 merchant-center-platform-state-and-migration-reports
- `workspace:Merchant Center UITest/adapters/test-automation-platform/reports/merchant-center-file-governance-result.md`：REQUIRED_MIGRATION_ASSET_MISSING，缺少迁移目标资产，策略 merchant-center-platform-state-and-migration-reports
- `workspace:Merchant Center UITest/adapters/test-automation-platform/reports/merchant-center-integration.md`：REQUIRED_MIGRATION_ASSET_MISSING，缺少迁移目标资产，策略 merchant-center-platform-state-and-migration-reports
- `workspace:Merchant Center UITest/deliverables/system-test-platform/artifact-manifest.json`：REQUIRED_MIGRATION_ASSET_MISSING，缺少迁移目标资产，策略 merchant-center-platform-state-and-migration-reports
- `workspace:Merchant Center UITest/deliverables/system-test-platform/cross-system-platform-v1.json`：REQUIRED_MIGRATION_ASSET_MISSING，缺少迁移目标资产，策略 merchant-center-platform-state-and-migration-reports
- `workspace:Merchant Center UITest/deliverables/system-test-platform/cross-system-platform-v1.md`：REQUIRED_MIGRATION_ASSET_MISSING，缺少迁移目标资产，策略 merchant-center-platform-state-and-migration-reports
- `workspace:Merchant Center UITest/deliverables/system-test-platform/execution-index.json`：REQUIRED_MIGRATION_ASSET_MISSING，缺少迁移目标资产，策略 merchant-center-platform-state-and-migration-reports
- `workspace:Merchant Center UITest/deliverables/system-test-platform/final-goal-verdict.json`：REQUIRED_MIGRATION_ASSET_MISSING，缺少迁移目标资产，策略 merchant-center-platform-state-and-migration-reports
- `workspace:Merchant Center UITest/deliverables/system-test-platform/platform-external-dependency.json`：REQUIRED_MIGRATION_ASSET_MISSING，缺少迁移目标资产，策略 merchant-center-platform-state-and-migration-reports
- `workspace:Merchant Center UITest/deliverables/system-test-platform/platform-release.json`：REQUIRED_MIGRATION_ASSET_MISSING，缺少迁移目标资产，策略 merchant-center-platform-state-and-migration-reports
- `workspace:Merchant Center UITest/deliverables/system-test-platform/platform-review-decision-20260815.json`：REQUIRED_MIGRATION_ASSET_MISSING，缺少迁移目标资产，策略 merchant-center-platform-state-and-migration-reports
- `workspace:Merchant Center UITest/deliverables/system-test-platform/platform-review-decision.template.json`：REQUIRED_MIGRATION_ASSET_MISSING，缺少迁移目标资产，策略 merchant-center-platform-state-and-migration-reports
- `workspace:Merchant Center UITest/deliverables/system-test-platform/platform-review-queue.json`：REQUIRED_MIGRATION_ASSET_MISSING，缺少迁移目标资产，策略 merchant-center-platform-state-and-migration-reports
- `workspace:Merchant Center UITest/deliverables/system-test-platform/readiness.json`：REQUIRED_MIGRATION_ASSET_MISSING，缺少迁移目标资产，策略 merchant-center-platform-state-and-migration-reports

## 迁移完整性基线

- `workspace:Merchant Center UITest/adapters/test-automation-platform/reports/migration-inventory.baseline.json`：MIGRATION_BASELINE_MISSING，迁移前后文件哈希基线不存在

## 历史来源

- `workspace:Merchant Center Info/99-待废弃/商品中心-商品管理-商品`：eligible-for-disposition-review，引用文件 0 个，引用目标 0 个。

## 验收结论

- 迁移闭环未完成；必须清零全部门禁问题后才能声明本次迁移结束。

