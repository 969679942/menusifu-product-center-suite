import { expect, test } from '@playwright/test';
import { reconcileSystemTestExternalDependency } from '../../src/automation/system-test/system-test-external-dependency';

test.describe('平台外部依赖状态协调', () => {
  test('必须从最终裁决刷新全部阻断且不传播到模块交付', () => {
    const result = reconcileSystemTestExternalDependency({
      existing: { status: 'deferred', blocker: 'STALE_BLOCKER', recoveryCondition: ['等待真实系统'] },
      applicationId: 'sample-app',
      businessDomainId: 'sample-domain',
      generatedAt: '2026-08-22T00:00:00.000Z',
      verdict: {
        schemaVersion: '1.0.0',
        scope: 'platform-universal-completion',
        status: 'incomplete',
        moduleDeliveryBlocked: false,
        commonImplementationReady: true,
        adapterImplementationReady: true,
        commonPlatformReady: true,
        crossPlanReady: false,
        crossSystemReady: false,
        blockers: ['CROSS_DOMAIN_PILOT_REQUIRED', 'CROSS_APPLICATION_PILOT_REQUIRED'],
      },
    });
    expect(result).toMatchObject({
      status: 'deferred',
      blocker: 'CROSS_APPLICATION_PILOT_REQUIRED',
      blockers: ['CROSS_APPLICATION_PILOT_REQUIRED', 'CROSS_DOMAIN_PILOT_REQUIRED'],
      moduleDeliveryBlocked: false,
      recoveryCondition: ['等待真实系统'],
    });
  });
});
