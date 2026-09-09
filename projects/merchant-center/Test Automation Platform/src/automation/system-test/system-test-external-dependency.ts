import type { SystemTestFinalGoalVerdict } from './system-test-final-goal-gate';

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
  return result;
}
