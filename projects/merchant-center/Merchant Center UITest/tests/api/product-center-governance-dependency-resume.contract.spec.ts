import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildLifecycleSnapshot } from '../../adapters/test-automation-platform/business-rule-governance-lifecycle';
import { reconcileSystemTestExternalDependency } from '../../../Test Automation Platform/src/automation/system-test/system-test-external-dependency';

const registry = JSON.parse(fs.readFileSync(path.resolve(__dirname,
  '../../contracts/product-center/governance/product-center-business-rule-governance-optimization.json'), 'utf8'));
const condition = registry.lifecycle.resumeConditions.find((item: { conditionId: string }) =>
  item.conditionId === 'CROSS_SYSTEM_PILOT_COMPLETE');

function currentDependency(blockers: string[] = []) {
  return reconcileSystemTestExternalDependency({
    applicationId: 'sample-app', businessDomainId: 'sample-domain',
    verdict: { schemaVersion: '1.0.0', scope: 'platform-universal-completion',
      status: blockers.length ? 'incomplete' : 'complete', moduleDeliveryBlocked: false,
      commonImplementationReady: true, adapterImplementationReady: true, commonPlatformReady: true,
      crossPlanReady: true, crossSystemReady: blockers.length === 0, blockers },
  });
}

function assess(dependency: unknown, extraConditions: unknown[] = []) {
  return buildLifecycleSnapshot({ ...registry.lifecycle, resumeConditions: [condition, ...extraConditions] },
    { git: { status: 'not-connected' } } as any, {}, {}, dependency as any, null, null, null);
}

test.describe('外部依赖恢复状态产消合同', () => {
  test('消费当前公共协调器 resolved，保留冻结策略且不执行业务', () => {
    expect(condition.source).toBe('platformExternalDependency.status=resolved');
    const result = assess(currentDependency());
    expect(result.conditionStatuses[0].satisfied).toBe(true);
    expect(result.resumeReady).toBe(true);
    expect(result.status).toBe('frozen');
    expect(result.onResume).toBe('prompt-and-reassess-only');
  });

  test('缺失、旧状态或矛盾阻断不得满足恢复条件', () => {
    for (const dependency of [null, {}, { status: 'complete', blockers: [] },
      currentDependency(['CROSS_APPLICATION_PILOT_REQUIRED']),
      { status: 'deferred', blockers: [] }, { status: 'resolved' },
      { status: 'resolved', blockers: ['UNRESOLVED'] },
      { status: 'resolved', blockers: [], blocker: 'UNRESOLVED' }]) {
      expect(assess(dependency).resumeReady, JSON.stringify(dependency)).toBe(false);
    }
  });

  test('外部依赖解除不能越过其他必需恢复条件', () => {
    const result = assess(currentDependency(), [{ conditionId: 'GIT_CONNECTED',
      source: 'integration.git.status=connected', required: true }]);
    expect(result.conditionStatuses.map((item) => item.satisfied)).toEqual([true, false]);
    expect(result.resumeReady).toBe(false);
  });
});
