import type { SystemTestPlatformReadiness } from './system-test-platform-readiness';

export type SystemTestFinalGoalVerdict = {
  schemaVersion: '1.0.0';
  scope: 'platform-universal-completion';
  status: 'complete' | 'incomplete';
  moduleDeliveryBlocked: false;
  commonImplementationReady: boolean;
  adapterImplementationReady: boolean;
  commonPlatformReady: boolean;
  crossPlanReady: boolean;
  crossSystemReady: boolean;
  blockers: string[];
};

export function evaluateSystemTestFinalGoal(
  readiness: SystemTestPlatformReadiness,
): SystemTestFinalGoalVerdict {
  const blockers = [...new Set(readiness.blockers)];
  const commonImplementationReady = readiness.commonImplementationReady;
  const adapterImplementationReady = readiness.adapterImplementationReady;
  const commonPlatformReady = readiness.referenceBaselineReady
    && commonImplementationReady
    && adapterImplementationReady;
  const crossPlanReady = readiness.qualifiedCrossDomainPilotIds.length > 0;
  const crossSystemReady = readiness.qualifiedCrossApplicationPilotIds.length > 0;
  if (!commonPlatformReady && !blockers.includes('REFERENCE_BASELINE_NOT_READY')) {
    if (!readiness.referenceBaselineReady) blockers.push('REFERENCE_BASELINE_NOT_READY');
  }
  if (!commonImplementationReady && !blockers.includes('COMMON_IMPLEMENTATION_REQUIRED')) {
    blockers.push('COMMON_IMPLEMENTATION_REQUIRED');
  }
  if (!adapterImplementationReady && !blockers.includes('DOMAIN_ADAPTER_REQUIRED')) {
    blockers.push('DOMAIN_ADAPTER_REQUIRED');
  }
  if (!crossPlanReady && !blockers.includes('CROSS_DOMAIN_PILOT_REQUIRED')) {
    blockers.push('CROSS_DOMAIN_PILOT_REQUIRED');
  }
  if (!crossSystemReady && !blockers.includes('CROSS_APPLICATION_PILOT_REQUIRED')) {
    blockers.push('CROSS_APPLICATION_PILOT_REQUIRED');
  }
  const complete = readiness.status === 'eligible-for-human-platform-review'
    && commonPlatformReady
    && crossPlanReady
    && crossSystemReady
    && blockers.length === 0;
  return {
    schemaVersion: '1.0.0',
    scope: 'platform-universal-completion',
    status: complete ? 'complete' : 'incomplete',
    moduleDeliveryBlocked: false,
    commonImplementationReady,
    adapterImplementationReady,
    commonPlatformReady,
    crossPlanReady,
    crossSystemReady,
    blockers: blockers.sort(),
  };
}

export function assertSystemTestFinalGoal(readiness: SystemTestPlatformReadiness): void {
  const verdict = evaluateSystemTestFinalGoal(readiness);
  if (verdict.status !== 'complete') {
    throw new Error(`FINAL_GOAL_NOT_MET:${verdict.blockers.join(',')}`);
  }
}
