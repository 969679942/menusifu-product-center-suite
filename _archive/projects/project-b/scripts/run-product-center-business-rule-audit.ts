import fs from 'node:fs';
import path from 'node:path';
import { runIdempotentPipeline } from '../utils/idempotent-pipeline';
import { resolveSystemTestPlatformArtifact } from '../utils/system-test-platform-paths';
import { productCenterItemImplementationCheckpointInputs } from '../adapters/product-center/product-center-item-implementation';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const governanceRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const checkpointPath = path.join(governanceRoot, 'product-center-business-rule-audit.checkpoint.json');
const executionIndexPath = resolveSystemTestPlatformArtifact('execution-index.json');
const tsxCommand = process.execPath;
const tsxCli = path.join(projectRoot, 'node_modules/tsx/dist/cli.mjs');

export function runProductCenterBusinessRuleAudit(): number {
  const historicalReconciliationPath = '../deliverables/test-plan-governance/product-center-historical-evidence-reconciliation.json';
  return runIdempotentPipeline({
    pipelineId: 'product-center-business-rule-audit',
    rootDir: projectRoot,
    checkpointPath,
    stages: [
      {
        id: 'business-rule-lifecycle',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-lifecycle-snapshot.ts'],
        inputs: [
          'contracts/product-center/business-rules/product-center-item-formal-rule-bindings.json',
          'contracts/product-center/business-rules/product-center-business-rule-conflict-assessment.json',
          'contracts/product-center/reviews/product-center-item-rule-confirmations.json',
          'contracts/product-center/test-cases/canonical/product-center-item-authoritative-automation-bindings.json',
          'contracts/product-center/test-plan-additional-automation-bindings.json',
          'contracts/product-center/group/product-center-group-case-fingerprints.json',
          '../Merchant Center Info/商品中心业务规则.md',
          '../Merchant Center Info/00-待转换测试方案/用例库',
          ...(fs.existsSync(path.resolve(projectRoot, '../deliverables/test-plan-governance/product-center-document-rule-promotion-decisions.json'))
            ? ['../deliverables/test-plan-governance/product-center-document-rule-promotion-decisions.json'] : []),
          'adapters/product-center/product-center-business-rule-lifecycle-adapter.ts',
          'scripts/build-product-center-business-rule-lifecycle-snapshot.ts',
          '../../Test Automation Platform/src/automation/system-test/business-rule-lifecycle.ts',
        ],
        outputs: ['contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json'],
      },
      {
        id: 'landing-audit',
        command: [tsxCommand, tsxCli, 'scripts/audit-product-center-item-group-landing.ts'],
        inputs: [
          'scripts/audit-product-center-item-group-landing.ts',
          'adapters/product-center/product-center-item-implementation.ts',
          ...productCenterItemImplementationCheckpointInputs(),
          'contracts/product-center/reviews/product-center-execution-decisions.json',
          'contracts/product-center/group/product-center-group-bindings.json',
          '../deliverables/product-center-item/test-cases.json',
          '../deliverables/product-center-source-governance/execution-plan.json',
          '../deliverables/test-plan-governance/product-center-execution-repair-queue.json',
          '../Merchant Center Info/00-待转换测试方案/已完成/index.json',
          '../Merchant Center Info/00-待转换测试方案/未落地/index.json',
          '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
          '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-组/2.商品中心-商品管理-组-正式测试用例.md',
          executionIndexPath,
          '../../Test Automation Platform/src/utils/test-plan-landing-gate.ts',
          '../../Test Automation Platform/src/automation/system-test/system-test-case-state-arbiter.ts',
        ],
        outputs: ['../deliverables/test-plan-governance/product-center-item-group-landing-audit.json'],
      },
      {
        id: 'business-rule-change-trigger',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-change-trigger.ts'],
        inputs: [
          'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
          'contracts/product-center/business-rules/product-center-business-rule-verified-baseline.json',
          '../deliverables/test-plan-governance/product-center-item-group-landing-audit.json',
          executionIndexPath,
          'scripts/build-product-center-business-rule-change-trigger.ts',
          '../../Test Automation Platform/src/automation/system-test/business-rule-change-trigger.ts',
          '../../Test Automation Platform/src/automation/system-test/system-test-case-state-arbiter.ts',
        ],
        outputs: ['contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json'],
      },
      {
        id: 'business-rule-baseline-promotion',
        command: [tsxCommand, tsxCli, 'scripts/promote-product-center-business-rule-verified-baseline.ts'],
        inputs: [
          'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
          'contracts/product-center/business-rules/product-center-business-rule-verified-baseline.json',
          'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
          'scripts/promote-product-center-business-rule-verified-baseline.ts',
        ],
        outputs: ['contracts/product-center/business-rules/generated/product-center-business-rule-baseline-promotion.json'],
      },
      {
        id: 'business-rule-change-trigger-after-promotion',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-change-trigger.ts'],
        inputs: [
          'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
          'contracts/product-center/business-rules/product-center-business-rule-verified-baseline.json',
          '../deliverables/test-plan-governance/product-center-item-group-landing-audit.json',
          executionIndexPath,
          'scripts/build-product-center-business-rule-change-trigger.ts',
          '../../Test Automation Platform/src/automation/system-test/business-rule-change-trigger.ts',
        ],
        outputs: ['contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json'],
      },
      {
        id: 'business-rule-review',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-completion-review.ts'],
        inputs: [
          'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
          'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
          'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json',
          'contracts/product-center/test-cases/canonical/product-center-item-full-review.json',
          'scripts/build-product-center-business-rule-completion-review.ts',
          'adapters/product-center/product-center-business-rule-completion-review-adapter.ts',
        ],
        outputs: [
          'contracts/product-center/business-rules/generated/product-center-business-rule-completion-review-queue.json',
          'output/test-case-audit/product-center/product-center-business-rule-completion-review-queue.md',
        ],
      },
      {
        id: 'business-rule-language-audit',
        command: [tsxCommand, tsxCli, 'scripts/audit-product-center-business-rule-language.ts'],
        inputs: [
          'scripts/audit-product-center-business-rule-language.ts',
          'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
          '../../Test Automation Platform/src/automation/system-test/business-rule-downstream-contract.ts',
        ],
        outputs: [
          '../deliverables/test-plan-governance/product-center-business-rule-language-audit.json',
          '../deliverables/test-plan-governance/product-center-business-rule-language-audit.md',
        ],
      },
      {
        id: 'closure-audit',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-closure-audit.ts'],
        inputs: [
          '../deliverables/test-plan-governance/product-center-item-group-landing-audit.json',
          'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
          '../deliverables/product-center-source-governance/execution-plan.json',
          ...(fs.existsSync(path.resolve(projectRoot, historicalReconciliationPath)) ? [historicalReconciliationPath] : []),
          ...(fs.existsSync(path.resolve(projectRoot, '../deliverables/test-plan-governance/product-center-document-rule-batch-preflight.json'))
            ? ['../deliverables/test-plan-governance/product-center-document-rule-batch-preflight.json'] : []),
          ...(fs.existsSync(path.resolve(projectRoot, '../deliverables/test-plan-governance/product-center-document-rule-evidence-recovery-plan.json'))
            ? ['../deliverables/test-plan-governance/product-center-document-rule-evidence-recovery-plan.json'] : []),
          ...(fs.existsSync(path.resolve(projectRoot, '../deliverables/test-plan-governance/product-center-document-rule-promotion-decisions.json'))
            ? ['../deliverables/test-plan-governance/product-center-document-rule-promotion-decisions.json'] : []),
          executionIndexPath,
          'scripts/build-product-center-closure-audit.ts',
        ],
        outputs: [
          '../deliverables/test-plan-governance/product-center-closure-audit.json',
          '../deliverables/test-plan-governance/product-center-incremental-selection.json',
          '../deliverables/test-plan-governance/product-center-closure-audit.md',
        ],
      },
      {
        id: 'business-rule-evaluation-events',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-event-ledger.ts', '--current-only', '--source-artifact=output/product-center-item-final-status.json'],
        inputs: [
          'scripts/build-product-center-business-rule-event-ledger.ts',
          'adapters/product-center/product-center-business-rule-event-adapter.ts',
          'contracts/product-center/business-rules/product-center-business-rule-landing-history.json',
          'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
          'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
          'contracts/product-center/business-rules/product-center-business-rule-verified-baseline.json',
          'output/product-center-item-final-status.json',
          'output/audit/product-center-events.jsonl',
          executionIndexPath,
          '../../Test Automation Platform/src/automation/system-test/business-rule-change-event.ts',
        ],
        outputs: ['output/governance/product-center-business-rule-event-ledger.json', 'output/governance/product-center-business-rule-event-ledger.md'],
      },
      {
        id: 'business-rule-observation',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-observation-ledger.ts'],
        inputs: [
          'scripts/build-product-center-business-rule-observation-ledger.ts',
          'adapters/product-center/product-center-business-rule-observation-adapter.ts',
          'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
          '../deliverables/test-plan-governance/product-center-item-group-landing-audit.json',
          executionIndexPath,
          '../../Test Automation Platform/src/automation/system-test/business-rule-lifecycle.ts',
        ],
        outputs: ['output/governance/product-center-business-rule-observation-ledger.json', 'output/governance/product-center-business-rule-observation-ledger.md'],
      },
      {
        id: 'business-rule-coverage',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-coverage.ts'],
        inputs: [
          'scripts/build-product-center-business-rule-coverage.ts',
          'adapters/product-center/product-center-business-rule-document-coverage-adapter.ts',
          '../Merchant Center Info/商品中心业务规则.md',
          '../Merchant Center Info/00-待转换测试方案/用例库',
          'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
          'contracts/product-center/business-rules/generated/product-center-item-rule-registry.json',
          'contracts/product-center/business-rules/generated/product-center-item-test-plan-rule-candidates.json',
          'contracts/product-center/business-rules/generated/product-center-business-rule-completion-review-queue.json',
          'contracts/product-center/test-cases/canonical/product-center-item-authoritative-automation-bindings.json',
          'contracts/product-center/test-plan-additional-automation-bindings.json',
          'contracts/product-center/group/product-center-group-case-fingerprints.json',
          'output/governance/product-center-business-rule-event-ledger.json',
          'output/governance/product-center-business-rule-observation-ledger.json',
          'adapters/test-automation-platform/reports/merchant-center-migration-closure.json',
          '../../Test Automation Platform/src/automation/system-test/business-rule-coverage.ts',
        ],
        outputs: [
          'output/governance/product-center-business-rule-coverage.json',
          'output/governance/product-center-business-rule-coverage.md',
          'output/governance/product-center-business-rule-document-coverage.json',
          'output/governance/product-center-business-rule-document-coverage.md',
        ],
      },
      {
        id: 'business-rule-governance-catalog',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-governance-catalog.ts'],
        inputs: [
          'scripts/build-product-center-business-rule-governance-catalog.ts',
          'scripts/build-product-center-business-rule-coverage.ts',
          'adapters/product-center/product-center-business-rule-document-coverage-adapter.ts',
          '../Merchant Center Info/商品中心业务规则.md',
          'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
          'contracts/product-center/business-rules/generated/product-center-item-test-plan-rule-candidates.json',
          'output/governance/product-center-business-rule-document-coverage.json',
        ],
        outputs: [
          'output/governance/product-center-business-rule-governance-catalog.json',
          '../Merchant Center Info/业务规则治理/README.md',
          '../Merchant Center Info/业务规则治理/01-当前正式规则.md',
          '../Merchant Center Info/业务规则治理/02-待生命周期核验规则.md',
          '../Merchant Center Info/业务规则治理/03-冲突规则.md',
          '../Merchant Center Info/业务规则治理/04-历史与废弃规则.md',
          '../Merchant Center Info/业务规则治理/05-覆盖缺口与执行证据.md',
        ],
      },
      {
        id: 'business-rule-governance-operations',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-governance-operations.ts'],
        inputs: [
          'scripts/build-product-center-business-rule-governance-operations.ts',
          'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
          '../../Test Automation Platform/src/automation/system-test/business-rule-governance.ts',
          '../../Test Automation Platform/tests/api/business-rule-lifecycle.contract.spec.ts',
        ],
        outputs: [
          '../deliverables/test-plan-governance/product-center-business-rule-governance-operations.json',
          '../deliverables/test-plan-governance/product-center-business-rule-governance-operations.md',
        ],
      },
      {
        id: 'document-rule-promotion-plan',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-document-rule-promotion-plan.ts'],
        inputs: [
          'scripts/build-product-center-document-rule-promotion-plan.ts',
          'utils/product-center-document-rule-preflight.ts',
          '../Merchant Center Info/商品中心业务规则.md',
          'output/governance/product-center-business-rule-document-coverage.json',
          'contracts/product-center/business-rules/generated/product-center-item-rule-registry.json',
          'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
          'contracts/product-center/group/product-center-group-case-fingerprints.json',
          '../deliverables/test-plan-governance/product-center-item-group-landing-audit.json',
          '../Merchant Center Info/00-待转换测试方案/用例库',
          'deliverables/system-test-platform/execution-index.json',
        ],
        outputs: [
          '../deliverables/test-plan-governance/product-center-document-rule-promotion-plan.json',
          '../deliverables/test-plan-governance/product-center-document-rule-promotion-plan.md',
          '../deliverables/test-plan-governance/product-center-document-rule-batch-preflight.json',
          '../deliverables/test-plan-governance/product-center-document-rule-batch-preflight.md',
        ],
      },
      {
        id: 'document-rule-evidence-recovery-plan',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-document-rule-evidence-recovery-plan.ts'],
        inputs: () => documentRuleEvidenceRecoveryInputs(),
        outputs: [
          '../deliverables/test-plan-governance/product-center-document-rule-evidence-recovery-plan.json',
          '../deliverables/test-plan-governance/product-center-document-rule-evidence-recovery-plan.md',
        ],
      },
      {
        id: 'delegated-rule-approval-plan',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-delegated-rule-approval-plan.ts'],
        inputs: [
          'scripts/build-product-center-delegated-rule-approval-plan.ts',
          'contracts/product-center/governance/product-center-business-rule-delegated-approval-policy.json',
          '../deliverables/test-plan-governance/product-center-document-rule-batch-preflight.json',
        ],
        outputs: [
          '../deliverables/test-plan-governance/product-center-delegated-rule-approval-plan.json',
          '../deliverables/test-plan-governance/product-center-delegated-rule-approval-plan.md',
        ],
      },
      {
        id: 'document-rule-closure-refresh',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-closure-audit.ts'],
        inputs: [
          '../deliverables/test-plan-governance/product-center-item-group-landing-audit.json',
          '../deliverables/test-plan-governance/product-center-document-rule-batch-preflight.json',
          '../deliverables/test-plan-governance/product-center-document-rule-evidence-recovery-plan.json',
          ...(fs.existsSync(path.resolve(projectRoot, '../deliverables/test-plan-governance/product-center-document-rule-promotion-decisions.json'))
            ? ['../deliverables/test-plan-governance/product-center-document-rule-promotion-decisions.json'] : []),
          '../deliverables/product-center-source-governance/execution-plan.json',
          'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
          executionIndexPath,
          'scripts/build-product-center-closure-audit.ts',
        ],
        outputs: [
          '../deliverables/test-plan-governance/product-center-closure-audit.json',
          '../deliverables/test-plan-governance/product-center-incremental-selection.json',
          '../deliverables/test-plan-governance/product-center-closure-audit.md',
        ],
      },
      {
        id: 'business-rule-time-context-review',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-time-context-review.ts'],
        inputs: [
          'scripts/build-product-center-business-rule-time-context-review.ts',
          'utils/product-center-business-rule-time-context-evidence.ts',
          'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
          '../../Test Automation Platform/src/automation/system-test/business-rule-governance.ts',
        ],
        outputs: [
          '../deliverables/test-plan-governance/product-center-business-rule-time-context-review.json',
          '../deliverables/test-plan-governance/product-center-business-rule-time-context-review.md',
          '../deliverables/test-plan-governance/product-center-business-rule-time-context-evidence.json',
          '../deliverables/test-plan-governance/product-center-business-rule-time-context-evidence.md',
        ],
      },
      {
        id: 'business-rule-scenario-coverage',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-scenario-coverage.ts'],
        inputs: [
          'scripts/build-product-center-business-rule-scenario-coverage.ts',
          'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
          'contracts/product-center/business-rules/product-center-business-rule-conflict-assessment.json',
          'contracts/product-center/business-rules/product-center-item-formal-rule-bindings.json',
          'contracts/product-center/reviews/product-center-item-rule-confirmations.json',
          'output/governance/product-center-business-rule-coverage.json',
          'output/governance/product-center-business-rule-observation-ledger.json',
          '../deliverables/test-plan-governance/product-center-business-rule-governance-operations.json',
          '../deliverables/test-plan-governance/product-center-business-rule-time-context-review.json',
          '../../Test Automation Platform/src/automation/system-test/business-rule-lifecycle.ts',
          '../../Test Automation Platform/src/automation/system-test/business-rule-governance.ts',
          '../../Test Automation Platform/tests/api/business-rule-lifecycle.contract.spec.ts',
        ],
        outputs: [
          '../deliverables/test-plan-governance/product-center-business-rule-scenario-coverage.json',
          '../deliverables/test-plan-governance/product-center-business-rule-scenario-coverage.md',
        ],
      },
      {
        id: 'business-rule-confirmation-queue',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-confirmation-queue.ts'],
        inputs: [
          'scripts/build-product-center-business-rule-confirmation-queue.ts',
          '../deliverables/test-plan-governance/product-center-business-rule-scenario-coverage.json',
        ],
        outputs: [
          '../deliverables/test-plan-governance/product-center-business-rule-confirmation-queue.json',
          '../deliverables/test-plan-governance/product-center-business-rule-confirmation-queue.md',
        ],
      },
      {
        id: 'business-rule-promotion-readiness',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-promotion-readiness.ts'],
        inputs: [
          'scripts/build-product-center-business-rule-promotion-readiness.ts',
          'utils/product-center-business-rule-promotion.ts',
          'contracts/product-center/business-rules/generated/product-center-item-rule-registry.json',
          'contracts/product-center/governance/product-center-business-rule-governance-optimization.json',
          'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json',
          'contracts/product-center/test-cases/canonical/product-center-item-canonical-release.json',
          'contracts/product-center/test-cases/canonical/product-center-item-authoritative-automation-bindings.json',
          'contracts/product-center/business-rules/product-center-item-formal-rule-bindings.json',
          '../Merchant Center Info/商品中心业务规则.md',
          '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品.xmind',
          '../deliverables/test-plan-governance/product-center-item-group-landing-audit.json',
        ],
        outputs: [
          '../deliverables/test-plan-governance/product-center-business-rule-promotion-readiness.json',
          '../deliverables/test-plan-governance/product-center-business-rule-promotion-readiness.md',
        ],
      },
      {
        id: 'business-rule-promotion-batch-plan',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-promotion-batch-plan.ts'],
        inputs: [
          'scripts/build-product-center-business-rule-promotion-batch-plan.ts',
          '../deliverables/test-plan-governance/product-center-business-rule-promotion-readiness.json',
          'contracts/product-center/business-rules/generated/product-center-item-rule-registry.json',
        ],
        outputs: [
          '../deliverables/test-plan-governance/product-center-business-rule-promotion-batch-plan.json',
          '../deliverables/test-plan-governance/product-center-document-rule-promotion-plan.json',
          '../deliverables/test-plan-governance/product-center-business-rule-promotion-batch-plan.md',
        ],
      },
      {
        id: 'business-rule-review-workbench',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-review-workbench.ts'],
        inputs: [
          'scripts/build-product-center-business-rule-review-workbench.ts',
          'output/governance/product-center-business-rule-document-coverage.json',
          '../deliverables/test-plan-governance/product-center-document-rule-promotion-plan.json',
          '../deliverables/test-plan-governance/product-center-document-rule-batch-preflight.json',
          '../deliverables/test-plan-governance/product-center-document-rule-evidence-recovery-plan.json',
          '../deliverables/test-plan-governance/product-center-business-rule-promotion-batch-plan.json',
          '../deliverables/test-plan-governance/product-center-business-rule-time-context-review.json',
          '../deliverables/product-center-item/business-rules.json',
          '../Merchant Center Info/商品中心业务规则.md',
        ],
        outputs: [
          '../deliverables/test-plan-governance/product-center-business-rule-review-workbench.json',
          '../Merchant Center Info/业务规则治理/00-快速晋级工作台.md',
        ],
      },
      {
        id: 'governance-optimization-readiness',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-governance-optimization.ts'],
        inputs: [
          'contracts/product-center/governance/product-center-business-rule-governance-optimization.json',
          'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
          'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
          'adapters/test-automation-platform/reports/merchant-center-migration-closure.json',
          'deliverables/system-test-platform/platform-external-dependency.json',
          '../deliverables/test-plan-governance/product-center-business-rule-time-context-review.json',
          '../deliverables/test-plan-governance/product-center-business-rule-time-context-evidence.json',
          '../deliverables/test-plan-governance/product-center-business-rule-promotion-batch-plan.json',
          '../deliverables/test-plan-governance/product-center-business-rule-confirmation-queue.json',
          'output/governance/product-center-business-rule-observation-ledger.json',
          'scripts/build-product-center-business-rule-governance-optimization.ts',
          'scripts/validate-product-center-prd-change-event.ts',
          'scripts/build-product-center-historical-business-rule-migration.ts',
          'scripts/build-product-center-historical-business-rule-migration-acceptance.ts',
          'utils/integration-status.ts',
          'contracts/product-center/business-rules/product-center-item-legacy-rule-baseline.json',
          'contracts/product-center/business-rules/generated/product-center-item-rule-registry.json',
          'contracts/product-center/reviews/product-center-historical-business-rule-migration-acceptance.json',
          '../.github/workflows/product-center-quality.yml',
          '../../Test Automation Platform/src/governance/optimization-task-registry.ts',
          '../../Test Automation Platform/src/automation/system-test/requirements-change-event.ts',
        ],
        outputs: [
          'output/governance/product-center-business-rule-governance-optimization.json',
          'output/governance/product-center-business-rule-governance-optimization.md',
          'output/governance/product-center-historical-business-rule-migration.json',
          'output/governance/product-center-historical-business-rule-migration.md',
        ],
      },
      {
        id: 'business-rule-post-optimization-analysis',
        command: [tsxCommand, tsxCli, 'scripts/build-product-center-business-rule-post-optimization-analysis.ts'],
        inputs: [
          'scripts/build-product-center-business-rule-post-optimization-analysis.ts',
          '../deliverables/test-plan-governance/product-center-business-rule-scenario-coverage.json',
          '../deliverables/test-plan-governance/product-center-business-rule-governance-operations.json',
          '../deliverables/test-plan-governance/product-center-business-rule-time-context-review.json',
          '../deliverables/test-plan-governance/product-center-business-rule-confirmation-queue.json',
          'output/governance/product-center-business-rule-observation-ledger.json',
          'output/governance/product-center-business-rule-governance-optimization.json',
          'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
          '../deliverables/product-center-source-governance/execution-result.json',
        ],
        outputs: [
          '../deliverables/test-plan-governance/product-center-business-rule-post-optimization-analysis.json',
          '../deliverables/test-plan-governance/product-center-business-rule-post-optimization-analysis.md',
        ],
      },
    ],
  });
}

function documentRuleEvidenceRecoveryInputs(): string[] {
  const fixed = [
    'scripts/build-product-center-document-rule-evidence-recovery-plan.ts',
    'utils/product-center-document-rule-preflight.ts',
    'utils/playwright-execution-receipt.ts',
    'utils/product-center-item-case-semantic-fingerprint.ts',
    'adapters/product-center/product-center-item-implementation.ts',
    ...productCenterItemImplementationCheckpointInputs(),
    '../deliverables/test-plan-governance/product-center-document-rule-batch-preflight.json',
    '../deliverables/test-plan-governance/product-center-item-group-landing-audit.json',
    '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
    'contracts/product-center/group/product-center-group-case-fingerprints.json',
    executionIndexPath,
    '../../Test Automation Platform/src/utils/playwright-execution-receipt.ts',
    '../../Test Automation Platform/src/utils/test-execution-state.ts',
  ];
  const preflightPath = path.join(governanceRoot, 'product-center-document-rule-batch-preflight.json');
  if (!fs.existsSync(preflightPath) || !fs.existsSync(executionIndexPath)) return fixed;
  const preflight = JSON.parse(fs.readFileSync(preflightPath, 'utf8')) as {
    rules?: Array<{ obligations?: Array<{ caseClaims?: Array<{ caseId?: string; confidence?: string }> }> }>;
  };
  const caseIds = new Set((preflight.rules ?? []).flatMap((rule) => (rule.obligations ?? [])
    .flatMap((obligation) => (obligation.caseClaims ?? [])
      .filter((claim) => claim.confidence === 'high').map((claim) => claim.caseId).filter(Boolean) as string[])));
  const index = JSON.parse(fs.readFileSync(executionIndexPath, 'utf8')) as {
    records?: Array<{ caseId?: string; evidencePath?: string | null; runId?: string | null }>;
  };
  const evidenceInputs = (index.records ?? []).filter((record) => record.caseId && caseIds.has(record.caseId)).flatMap((record) => {
    const inputs: string[] = [];
    if (record.evidencePath) {
      const normalized = record.evidencePath.replace(/\\/g, '/');
      const marker = 'Merchant Center UITest/';
      inputs.push(normalized.includes(marker) ? normalized.slice(normalized.indexOf(marker) + marker.length) : normalized);
    }
    if (record.runId) inputs.push(`output/allure/source-governed/${record.runId}/group/allure-results`);
    return inputs;
  });
  return [...new Set([...fixed, ...evidenceInputs])].sort();
}

if (require.main === module) process.exitCode = runProductCenterBusinessRuleAudit();
