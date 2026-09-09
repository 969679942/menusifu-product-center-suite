export type SystemTestReferenceBaselineEvidence = {
  applicationId: string;
  businessDomainId: string;
  planned: number;
  executionEligible: number;
  classifiedExclusions: number;
  classifiedBlockers: number;
  executed: number;
  passed: number;
  failed: number;
  automationGap: number;
  evidenceVerified: number;
  evidenceMissing: number;
  evidenceCoverageFingerprint: string;
  responsibilityBreakdown: Record<string, number>;
  responsibilityClassified: boolean;
  apiUiZeroResidue: boolean;
};

export type SystemTestProductBaselineEvidence = SystemTestReferenceBaselineEvidence;

export type SystemTestPilotEvidence = {
  pilotId: string;
  applicationId: string;
  businessDomainId: string;
  authenticationFamilyId: string;
  validationAuthority: 'target-system' | 'self-controlled-reference';
  authenticated: boolean;
  reversibleCrud: boolean;
  runtimePassed: boolean;
  evidenceComplete: boolean;
  apiUiZeroResidue: boolean;
  securityFindings: number;
};

export type SystemTestPlatformReadiness = {
  schemaVersion: '1.0.0';
  status: 'candidate' | 'eligible-for-human-platform-review';
  commonImplementationReady: boolean;
  adapterImplementationReady: boolean;
  referenceBaselineReady: boolean;
  /** @deprecated 仅供旧消费方兼容，平台核心使用 referenceBaselineReady。 */
  productBaselineReady: boolean;
  qualifiedCrossDomainPilotIds: string[];
  qualifiedCrossApplicationPilotIds: string[];
  blockers: string[];
  automaticFormalPromotionAllowed: false;
};

export function evaluateSystemTestPlatformReadiness(input: {
  referenceBaseline?: SystemTestReferenceBaselineEvidence;
  /** @deprecated 仅供旧调用方兼容。 */
  productBaseline?: SystemTestProductBaselineEvidence;
  pilots: readonly SystemTestPilotEvidence[];
  commonImplementationReady?: boolean;
  adapterImplementationReady?: boolean;
}): SystemTestPlatformReadiness {
  const referenceBaseline = input.referenceBaseline ?? input.productBaseline;
  if (!referenceBaseline) throw new Error('缺少平台参考基线');
  const referenceBaselineReady = referenceBaseline.responsibilityClassified
    && referenceBaseline.automationGap === 0
    && referenceBaseline.classifiedBlockers === 0
    && referenceBaseline.planned === referenceBaseline.executionEligible
      + referenceBaseline.classifiedExclusions
      + referenceBaseline.classifiedBlockers
    && referenceBaseline.executionEligible > 0
    && referenceBaseline.executionEligible === referenceBaseline.executed
    && referenceBaseline.executed === referenceBaseline.passed + referenceBaseline.failed
    && referenceBaseline.passed === referenceBaseline.evidenceVerified
    && referenceBaseline.evidenceMissing === 0
    && referenceBaseline.failed === 0
    && referenceBaseline.apiUiZeroResidue;
  const qualifiedPilots = input.pilots.filter(isQualifiedPilot);
  const commonImplementationReady = input.commonImplementationReady ?? true;
  const adapterImplementationReady = input.adapterImplementationReady ?? true;
  const qualifiedCrossDomainPilotIds = qualifiedPilots
    .filter((pilot) => pilot.businessDomainId !== referenceBaseline.businessDomainId)
    .map((pilot) => pilot.pilotId)
    .sort();
  const qualifiedCrossApplicationPilotIds = qualifiedPilots
    .filter((pilot) => pilot.applicationId !== referenceBaseline.applicationId)
    .map((pilot) => pilot.pilotId)
    .sort();
  const blockers: string[] = [];
  if (!commonImplementationReady) blockers.push('COMMON_IMPLEMENTATION_REQUIRED');
  if (!adapterImplementationReady) blockers.push('DOMAIN_ADAPTER_REQUIRED');
  if (!referenceBaselineReady) blockers.push('REFERENCE_BASELINE_NOT_READY');
  if (qualifiedCrossDomainPilotIds.length === 0) blockers.push('CROSS_DOMAIN_PILOT_REQUIRED');
  if (qualifiedCrossApplicationPilotIds.length === 0) blockers.push('CROSS_APPLICATION_PILOT_REQUIRED');
  return {
    schemaVersion: '1.0.0',
    status: blockers.length === 0 ? 'eligible-for-human-platform-review' : 'candidate',
    commonImplementationReady,
    adapterImplementationReady,
    referenceBaselineReady,
    productBaselineReady: referenceBaselineReady,
    qualifiedCrossDomainPilotIds,
    qualifiedCrossApplicationPilotIds,
    blockers,
    automaticFormalPromotionAllowed: false,
  };
}

function isQualifiedPilot(pilot: SystemTestPilotEvidence): boolean {
  return pilot.validationAuthority === 'target-system'
    && pilot.authenticated
    && pilot.reversibleCrud
    && pilot.runtimePassed
    && pilot.evidenceComplete
    && pilot.apiUiZeroResidue
    && pilot.securityFindings === 0;
}
