import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { assessGovernanceOptimizationRegistry } from '../../utils/optimization-task-registry';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from '../../scripts/build-product-center-business-rule-lifecycle-snapshot';

const projectRoot = path.resolve(__dirname, '../..');
test.describe('商品中心业务规则治理优化任务合同', () => {
  test('全部已知不足必须登记目的、预期结果、后续影响和恢复条件', () => {
    const registry = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/governance/product-center-business-rule-governance-optimization.json',
    ), 'utf8'));
    const assessment = assessGovernanceOptimizationRegistry(registry);
    expect(assessment.status).toBe('incomplete');
    expect(assessment.diagnostics).toEqual([]);
    expect(registry.tasks.map((task: { taskId: string }) => task.taskId)).toEqual([
      'BRG-OPT-001', 'BRG-OPT-002', 'BRG-OPT-003', 'BRG-OPT-004', 'BRG-OPT-005',
      'BRG-OPT-006', 'BRG-OPT-007', 'BRG-OPT-008', 'BRG-OPT-009', 'BRG-OPT-010', 'BRG-OPT-011',
      'BRG-OPT-012', 'BRG-OPT-013', 'BRG-OPT-014', 'BRG-OPT-015', 'BRG-OPT-016', 'BRG-OPT-017',
      'BRG-OPT-018', 'BRG-OPT-020', 'BRG-OPT-021', 'BRG-OPT-022',
      'BRG-OPT-023', 'BRG-OPT-024', 'BRG-OPT-025', 'BRG-OPT-026', 'BRG-OPT-019',
    ]);
    expect(assessment.mandatoryOpenTaskIds).toEqual([
      'BRG-OPT-004', 'BRG-OPT-005', 'BRG-OPT-008', 'BRG-OPT-011', 'BRG-OPT-016',
      'BRG-OPT-020', 'BRG-OPT-021', 'BRG-OPT-022', 'BRG-OPT-023', 'BRG-OPT-024', 'BRG-OPT-025', 'BRG-OPT-026',
    ]);
    expect(registry.lifecycle).toMatchObject({
      status: 'frozen',
      resumePolicy: 'all-required-conditions',
      onResume: 'prompt-and-reassess-only',
    });
    expect(registry.lifecycle.frozenTaskIds).toEqual([
      'BRG-OPT-004', 'BRG-OPT-005', 'BRG-OPT-006', 'BRG-OPT-008', 'BRG-OPT-011',
      'BRG-OPT-016',
    ]);
  });

  test('优化登记不得扩大执行范围或把平台缺口误作商品中心交付阻断', () => {
    const lifecycle = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
    const report = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'output/governance/product-center-business-rule-governance-optimization.json',
    ), 'utf8'));
    expect(report.moduleDeliveryBlocked).toBe(false);
    expect(report.observations.currentRuleTrigger.rerunCaseIds).toEqual([]);
    expect(report.tasks.find((task: { taskId: string }) => task.taskId === 'BRG-OPT-010'))
      .toMatchObject({ status: 'completed', blockers: [] });
    expect(report.lifecycle).toMatchObject({ status: 'frozen', resumeReady: false });
    expect(report.integrationPrompts).toContain('GOVERNANCE_OPTIMIZATION_FROZEN_WAITING_FOR_ALL_RESUME_CONDITIONS');
    expect(report.remainingGovernanceGaps).toMatchObject({
      timeContextAutomaticEvidenceRequired: lifecycle.rules.length,
      timeContextHumanConfirmationRequired: 0,
      productBehaviorConfirmationRequired: 0,
    });
  });

  test('GitHub触发层必须覆盖定时和PRD事件，并固定公共平台版本', () => {
    const workflow = fs.readFileSync(path.resolve(projectRoot, '../.github/workflows/product-center-quality.yml'), 'utf8');
    expect(workflow).toContain("schedule:\n    - cron: '17 19 * * 0-4'");
    expect(workflow).toContain('repository_dispatch:');
    expect(workflow).toContain('prd_published');
    expect(workflow).toContain('prd_updated');
    expect(workflow).toContain('test_automation_platform_released');
    expect(workflow).toContain('TEST_AUTOMATION_PLATFORM_REPOSITORY');
    expect(workflow).toContain('CI_PLATFORM_IMMUTABLE_REF_REQUIRED');
    expect(workflow).toContain('path: Test Automation Platform');
    expect(workflow).not.toContain('test:test-plan:approved-incremental -- --execute');
  });
});
