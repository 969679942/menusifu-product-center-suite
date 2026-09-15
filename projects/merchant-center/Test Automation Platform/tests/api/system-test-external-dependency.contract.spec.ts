import { expect, test } from '@playwright/test';
import { reconcileSystemTestExternalDependency } from '../../src/automation/system-test/system-test-external-dependency';

test.describe('平台外部依赖状态协调', () => {
  test('当前裁决无阻断时统一输出 resolved 并移除旧阻断', () => {
    const result = reconcileSystemTestExternalDependency({
      existing: { status: 'deferred', blocker: 'STALE_BLOCKER', blockers: ['STALE_BLOCKER'] },
      applicationId: 'sample-app', businessDomainId: 'sample-domain',
      verdict: { schemaVersion: '1.0.0', scope: 'platform-universal-completion', status: 'complete',
        moduleDeliveryBlocked: false, commonImplementationReady: true, adapterImplementationReady: true,
        commonPlatformReady: true, crossPlanReady: true, crossSystemReady: true, blockers: [] },
    });
    expect(result.status).toBe('resolved');
    expect(result.blockers).toEqual([]);
    expect(result).not.toHaveProperty('blocker');
  });
  test('必须从最终裁决刷新全部阻断且不传播到模块交付', () => {
    const result = reconcileSystemTestExternalDependency({
      existing: { status: 'deferred', blocker: 'STALE_BLOCKER', recoveryCondition: ['等待真实系统'],
        currentSystemDelivery: 'frozen', currentSystemEvidence: { summary: { passed: 999 } },
        sameApplicationCrossDomainPilot: { systemId: 'sample-pilot', status: 'blocked-environment', reason: '旧认证失败' } },
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
    expect(result.currentSystemDelivery).toBeUndefined();
    expect(result.currentSystemEvidence).toBeUndefined();
    expect(result.sameApplicationCrossDomainPilot).toBeUndefined();
  });
  test('当前真实试点通过应覆盖旧失败且不得伪造跨应用或可逆资格', () => {
    const result = reconcileSystemTestExternalDependency({
      existing: { sameApplicationCrossDomainPilot: { systemId: 'sample-pilot', status: 'blocked-environment', reason: '旧失败' } },
      applicationId: 'sample-app', businessDomainId: 'sample-domain',
      verdict: { schemaVersion: '1.0.0', scope: 'platform-universal-completion', status: 'incomplete',
        moduleDeliveryBlocked: false, commonImplementationReady: true, adapterImplementationReady: true,
        commonPlatformReady: true, crossPlanReady: true, crossSystemReady: false, blockers: ['CROSS_APPLICATION_PILOT_REQUIRED'] },
      currentEvidence: { evidenceRef: 'readiness.json', pilots: [{
        pilotId: 'sample-pilot', applicationId: 'sample-app', businessDomainId: 'other-domain',
        authenticationFamilyId: 'sample-auth', validationAuthority: 'target-system', authenticated: true,
        runtimePassed: true, evidenceComplete: true, apiUiZeroResidue: true, securityFindings: 0, reversibleCrud: false,
      }] },
    });
    expect(result.sameApplicationCrossDomainPilot).toMatchObject({ status: 'runtime-passed', reversibleCrud: false });
    expect(result.sameApplicationCrossDomainPilot).not.toHaveProperty('reason');
    expect(result.blockers).toEqual(['CROSS_APPLICATION_PILOT_REQUIRED']);
  });
});
