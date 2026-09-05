import { createHash } from 'node:crypto';
import type {
  SystemTestPilotEvidence,
  SystemTestPlatformReadiness,
  SystemTestProductBaselineEvidence,
  SystemTestReferenceBaselineEvidence,
} from './system-test-platform-readiness';

export type SystemTestPlatformReviewQueue = {
  schemaVersion: '1.0.0';
  status: 'not-ready' | 'ready-for-human-review';
  candidateFingerprint: string;
  blockers: string[];
  humanApprovalRequired: true;
  approved: false;
  governanceFingerprint?: string;
  evidence: {
    referenceBaselineReady: boolean;
    /** @deprecated 仅供旧消费方兼容。 */
    productBaselineReady: boolean;
    qualifiedCrossDomainPilotIds: string[];
    qualifiedCrossApplicationPilotIds: string[];
    pilotIds: string[];
  };
};

export type SystemTestPlatformReviewDecision = {
  schemaVersion: '1.0.0';
  decisionId: string;
  decision: 'approve' | 'reject' | 'hold';
  confirmedBy: string;
  decidedAt: string;
  rationale: string;
  candidateFingerprint: string;
  governanceFingerprint?: string;
};

export type SystemTestPlatformRelease = {
  schemaVersion: '1.0.0';
  status: 'formal' | 'not-approved';
  candidateFingerprint: string;
  governanceFingerprint?: string;
  authority?: {
    sourceRole: 'human-platform-review';
    decisionId: string;
    confirmedBy: string;
    decidedAt: string;
    rationale: string;
  };
  generatedAt?: string;
};

export function assessSystemTestPlatformRelease(input: {
  release: SystemTestPlatformRelease;
  currentQueue: SystemTestPlatformReviewQueue;
}): SystemTestPlatformRelease {
  const fingerprintChanged = !input.release.governanceFingerprint
    || input.release.governanceFingerprint !== input.currentQueue.governanceFingerprint
    || input.release.candidateFingerprint !== input.currentQueue.candidateFingerprint;
  const formalReleaseInvalid = input.release.status === 'formal'
    && (fingerprintChanged || input.currentQueue.status !== 'ready-for-human-review');
  const rejectedReleaseStale = input.release.status === 'not-approved' && fingerprintChanged;
  if (formalReleaseInvalid || rejectedReleaseStale) {
    return {
      schemaVersion: '1.0.0',
      status: 'not-approved',
      candidateFingerprint: input.currentQueue.candidateFingerprint,
      ...(input.currentQueue.governanceFingerprint
        ? { governanceFingerprint: input.currentQueue.governanceFingerprint }
        : {}),
    };
  }
  return input.release;
}

export function buildSystemTestPlatformReviewQueue(input: {
  readiness: SystemTestPlatformReadiness;
  referenceBaseline?: SystemTestReferenceBaselineEvidence;
  /** @deprecated 仅供旧调用方兼容。 */
  productBaseline?: SystemTestProductBaselineEvidence;
  pilots: readonly SystemTestPilotEvidence[];
  governanceFingerprint?: string;
}): SystemTestPlatformReviewQueue {
  const referenceBaseline = input.referenceBaseline ?? input.productBaseline;
  if (!referenceBaseline) throw new Error('缺少平台参考基线');
  const pilotSummary = input.pilots.map((pilot) => ({
    pilotId: pilot.pilotId,
    applicationId: pilot.applicationId,
    businessDomainId: pilot.businessDomainId,
    authenticationFamilyId: pilot.authenticationFamilyId,
    validationAuthority: pilot.validationAuthority,
    authenticated: pilot.authenticated,
    reversibleCrud: pilot.reversibleCrud,
    runtimePassed: pilot.runtimePassed,
    evidenceComplete: pilot.evidenceComplete,
    apiUiZeroResidue: pilot.apiUiZeroResidue,
    securityFindings: pilot.securityFindings,
  })).sort((left, right) => left.pilotId.localeCompare(right.pilotId));
  const candidateFingerprint = createHash('sha256').update(JSON.stringify({
    readiness: {
      productBaselineReady: input.readiness.productBaselineReady,
      qualifiedCrossDomainPilotIds: input.readiness.qualifiedCrossDomainPilotIds,
      qualifiedCrossApplicationPilotIds: input.readiness.qualifiedCrossApplicationPilotIds,
      blockers: input.readiness.blockers,
    },
    referenceBaseline,
    pilots: pilotSummary,
    governanceFingerprint: input.governanceFingerprint,
  })).digest('hex');
  return {
    schemaVersion: '1.0.0',
    status: input.readiness.status === 'eligible-for-human-platform-review' ? 'ready-for-human-review' : 'not-ready',
    candidateFingerprint,
    ...(input.governanceFingerprint ? { governanceFingerprint: input.governanceFingerprint } : {}),
    blockers: [...input.readiness.blockers],
    humanApprovalRequired: true,
    approved: false,
    evidence: {
      referenceBaselineReady: input.readiness.referenceBaselineReady,
      productBaselineReady: input.readiness.productBaselineReady,
      qualifiedCrossDomainPilotIds: [...input.readiness.qualifiedCrossDomainPilotIds],
      qualifiedCrossApplicationPilotIds: [...input.readiness.qualifiedCrossApplicationPilotIds],
      pilotIds: pilotSummary.map((pilot) => pilot.pilotId),
    },
  };
}

export function applySystemTestPlatformReviewDecision(input: {
  queue: SystemTestPlatformReviewQueue;
  decision: SystemTestPlatformReviewDecision;
}): SystemTestPlatformRelease {
  if (input.queue.status !== 'ready-for-human-review') throw new Error('平台尚未达到人工评审条件');
  if (input.queue.approved) throw new Error('平台评审队列已处理');
  if (input.decision.candidateFingerprint !== input.queue.candidateFingerprint) throw new Error('平台候选指纹不一致');
  if (!input.decision.decisionId.trim() || !input.decision.confirmedBy.trim() || !input.decision.rationale.trim()) {
    throw new Error('平台人工评审缺少决定编号、审核人或理由');
  }
  if (input.decision.decision !== 'approve') {
    return {
      schemaVersion: '1.0.0',
      status: 'not-approved',
      candidateFingerprint: input.queue.candidateFingerprint,
      ...(input.queue.governanceFingerprint ? { governanceFingerprint: input.queue.governanceFingerprint } : {}),
    };
  }
  return {
    schemaVersion: '1.0.0',
    status: 'formal',
    candidateFingerprint: input.queue.candidateFingerprint,
    ...(input.queue.governanceFingerprint ? { governanceFingerprint: input.queue.governanceFingerprint } : {}),
    authority: {
      sourceRole: 'human-platform-review',
      decisionId: input.decision.decisionId,
      confirmedBy: input.decision.confirmedBy,
      decidedAt: input.decision.decidedAt,
      rationale: input.decision.rationale,
    },
  };
}
