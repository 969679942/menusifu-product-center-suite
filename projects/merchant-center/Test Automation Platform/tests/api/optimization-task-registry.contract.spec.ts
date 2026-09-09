import { expect, test } from '@playwright/test';
import { assessGovernanceOptimizationRegistry } from '../../src/governance/optimization-task-registry';

test.describe('通用治理优化任务登记合同', () => {
  test('阻断任务必须保留恢复条件且不得伪报完成', () => {
    const result = assessGovernanceOptimizationRegistry({
      schemaVersion: '1.0.0', registryId: 'inventory-governance', applicationId: 'inventory-app', businessDomainId: 'inventory',
      tasks: [{
        taskId: 'INV-OPT-001', priority: 'must', scope: 'external-integration', status: 'blocked',
        purpose: '接收库存需求发布事件。', expectedResults: ['形成可验证事件收据。'],
        downstreamImpact: {
          passedCases: 'preserved', rerunCaseIds: [], humanWork: '配置事件源。', runtimeCost: '只运行静态审计。',
          moduleDeliveryBlocked: false, reuseImpact: '其他系统复用同一事件合同。',
        },
        evidenceRefs: [], blockers: ['REQUIREMENTS_EVENT_SOURCE_MISSING'], recoveryConditions: ['配置可信事件源。'],
      }],
    });
    expect(result).toMatchObject({ status: 'incomplete', mandatoryOpenTaskIds: ['INV-OPT-001'], diagnostics: [] });
  });

  test('缺少目的、结果或阻断恢复条件的登记必须判为无效', () => {
    const result = assessGovernanceOptimizationRegistry({
      schemaVersion: '1.0.0', registryId: 'invalid', applicationId: 'inventory-app', businessDomainId: 'inventory',
      tasks: [{
        taskId: 'INV-OPT-INVALID', priority: 'must', scope: 'migration', status: 'blocked', purpose: '', expectedResults: [],
        downstreamImpact: { passedCases: 'preserved', rerunCaseIds: [], humanWork: '', runtimeCost: '', moduleDeliveryBlocked: false, reuseImpact: '' },
        evidenceRefs: [], blockers: [], recoveryConditions: [],
      }],
    });
    expect(result.status).toBe('invalid');
    expect(result.diagnostics).toContain('OPTIMIZATION_TASK_PURPOSE_REQUIRED:INV-OPT-INVALID');
    expect(result.diagnostics).toContain('BLOCKED_OPTIMIZATION_TASK_RECOVERY_REQUIRED:INV-OPT-INVALID');
  });
});
