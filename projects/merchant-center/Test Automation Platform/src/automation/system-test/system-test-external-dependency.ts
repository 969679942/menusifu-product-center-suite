import type { SystemTestFinalGoalVerdict } from './system-test-final-goal-gate';
import type { SystemTestPilotEvidence, SystemTestReferenceBaselineEvidence } from './system-test-platform-readiness';

export type SystemTestExternalDependency = Record<string, unknown> & {
  schemaVersion: '1.0.0';
  status: 'open' | 'deferred' | 'resolved';
  scope: 'platform-universal-completion';
  applicationId: string;
  businessDomainId: string;
  blocker?: string;
  blockers: string[];
  moduleDeliveryBlocked: false;
  updatedAt: string;
};

export function reconcileSystemTestExternalDependency(input: {
  existing?: Record<string, unknown>;
  verdict: SystemTestFinalGoalVerdict;
  applicationId: string;
  businessDomainId: string;
  currentEvidence?: {
    generatedAt?: string;
    referenceBaseline?: SystemTestReferenceBaselineEvidence;
    pilots: readonly SystemTestPilotEvidence[];
    evidenceRef: string;
  };
  generatedAt?: string;
}): SystemTestExternalDependency {
  const blockers = [...new Set(input.verdict.blockers)].sort();
  const previousStatus = input.existing?.status;
  const status = blockers.length === 0
    ? 'resolved'
    : previousStatus === 'deferred' ? 'deferred' : 'open';
  const result: SystemTestExternalDependency = {
    ...(input.existing ?? {}),
    schemaVersion: '1.0.0',
    status,
    scope: 'platform-universal-completion',
    applicationId: input.applicationId,
    businessDomainId: input.businessDomainId,
    blockers,
    moduleDeliveryBlocked: false,
    updatedAt: input.generatedAt ?? new Date().toISOString(),
  };
  if (blockers.length > 0) result.blocker = blockers[0];
  else delete result.blocker;
  // Historical projections must never survive as current facts. Preserve
  // policy/authorization metadata, but derive runtime facts from readiness.
  delete result.currentSystemDelivery;
  delete result.currentSystemEvidence;
  delete result.sameApplicationCrossDomainPilot;
  delete result.sameApplicationCrossDomainPilots;
  if (input.currentEvidence) {
    const evidence = input.currentEvidence;
    result.currentSystemEvidence = {
      evidenceRef: evidence.evidenceRef,
      generatedAt: evidence.generatedAt ?? null,
      referenceBaseline: evidence.referenceBaseline ?? null,
    };
    const pilots = evidence.pilots
      .filter((pilot) => pilot.applicationId === input.applicationId
        && pilot.businessDomainId !== input.businessDomainId)
      .map((pilot) => ({
        ...pilot,
        systemId: pilot.pilotId,
        status: pilot.runtimePassed && pilot.evidenceComplete && pilot.apiUiZeroResidue
          && pilot.authenticated && pilot.securityFindings === 0 ? 'runtime-passed' : 'incomplete',
        evidenceRef: evidence.evidenceRef,
      }));
    result.sameApplicationCrossDomainPilots = pilots;
    const prior = input.existing?.sameApplicationCrossDomainPilot as { systemId?: string } | undefined;
    const current = pilots.find((pilot) => pilot.systemId === prior?.systemId);
    if (current) result.sameApplicationCrossDomainPilot = current;
  }
  return result;
}
