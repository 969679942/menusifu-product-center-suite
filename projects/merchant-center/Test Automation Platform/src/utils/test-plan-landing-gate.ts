import {
  normalizeReleaseObservation,
  releaseObservationAllowsReuse,
  resolveReuseStatus,
  type ReleaseObservation,
  type TestApplicabilityStatus,
  type TestEvidenceStatus,
  type TestReuseStatus,
} from './test-execution-state';
import {
  arbitrateCaseState,
  type ArbiterHandledOutcome,
  type ArbiterProductDefect,
} from '../automation/system-test/system-test-case-state-arbiter';
import type { CaseFingerprintCutoverAuthorization } from './case-fingerprint-cutover-authorization';

export type TestPlanDisposition =
  | 'ready'
  | 'deferred'
  | 'not-applicable'
  | 'product-defect'
  | 'blocked-source'
  | 'blocked-technical';

export type TestPlanLandingCase = {
  caseId: string;
  title: string;
  disposition: TestPlanDisposition;
  automationBound: boolean;
  caseFingerprint: string | null;
  semanticCaseFingerprint?: string | null;
  fingerprintMatchMode?: 'effective' | 'semantic';
  requireCutoverAuthorization?: boolean;
  cutoverAuthorization?: CaseFingerprintCutoverAuthorization | null;
  implementationFingerprint?: string | null;
  implementationFingerprintRequired?: boolean;
  productDefectEvidence?: ArbiterProductDefect | null;
  handledOutcome?: ArbiterHandledOutcome | null;
  reason?: string;
  historicalExecution?: {
    status: string;
    evidenceRefs: string[];
    handlingStatus?: 'handled' | 'unhandled';
    verificationStatus?: 'current-verified' | 'legacy-verified' | 'invalid-reference' | 'not-verified';
    handlingEvidence?: string | null;
  } | null;
};

type LandingExecutionRecord = {
  caseId: string;
  applicationVersionFingerprint?: string | null;
  releaseObservation?: Partial<ReleaseObservation> | null;
  executionEpochId?: string;
  executionContextFingerprint?: string | null;
  caseFingerprint: string;
  semanticCaseFingerprint?: string | null;
  implementationFingerprint?: string | null;
  status: 'passed' | 'failed' | 'skipped' | 'not-run';
  evidenceStatus?: TestEvidenceStatus;
  assertionStatuses?: ReadonlyArray<'verified' | 'observed-mismatch'>;
  reuseStatus?: TestReuseStatus;
  runId: string;
  evidencePath: string | null;
  durationMs: number;
  recordedAt: string;
};

export type TestPlanLandingAssessment = ReturnType<typeof assessTestPlanLanding>;

/**
 * Delivery completion is intentionally stricter than plan classification.
 * A classified case is still part of the formal denominator; it is not an
 * accepted execution outcome. Keep this calculation in the common platform
 * so project closure reports cannot silently redefine "complete".
 */
export type DeliveryCompletionInput = {
  total: number;
  acceptedComplete: number;
  unresolved: number;
  classifiedExclusions?: number;
};

export type DeliveryCompletionResult = {
  deliveryComplete: boolean;
  acceptedComplete: number;
  unresolved: number;
  classifiedExclusions: number;
};

export function evaluateDeliveryCompletion(input: DeliveryCompletionInput): DeliveryCompletionResult {
  const classifiedExclusions = input.classifiedExclusions ?? 0;
  if (input.total < 0 || input.acceptedComplete < 0 || input.unresolved < 0 || classifiedExclusions < 0) {
    throw new Error('DELIVERY_COMPLETION_COUNTS_MUST_BE_NON_NEGATIVE');
  }
  if (input.acceptedComplete > input.total || input.unresolved > input.total || classifiedExclusions > input.total) {
    throw new Error('DELIVERY_COMPLETION_COUNTS_EXCEED_DENOMINATOR');
  }
  return {
    deliveryComplete: input.total > 0
      && input.acceptedComplete === input.total
      && input.unresolved === 0
      && classifiedExclusions === 0,
    acceptedComplete: input.acceptedComplete,
    unresolved: input.unresolved,
    classifiedExclusions,
  };
}

export function assertDeliveryCompletion(result: DeliveryCompletionResult, claimedStatus: string): void {
  if (claimedStatus === 'completed' && !result.deliveryComplete) {
    throw new Error(
      `DELIVERY_COMPLETION_CONTRACT_VIOLATION:accepted=${result.acceptedComplete};unresolved=${result.unresolved};classifiedExclusions=${result.classifiedExclusions}`,
    );
  }
}

export function assessTestPlanLanding(input: {
  planId: string;
  applicationVersionFingerprint?: string | null;
  changeObservation?: Partial<ReleaseObservation> | null;
  cases: readonly TestPlanLandingCase[];
  executionRecords: readonly LandingExecutionRecord[];
}) {
  const currentRelease = normalizeReleaseObservation({
    releaseObservation: input.changeObservation,
    applicationVersionFingerprint: input.applicationVersionFingerprint,
  });
  const recordsByCase = new Map<string, LandingExecutionRecord[]>();
  for (const record of input.executionRecords) {
    const records = recordsByCase.get(record.caseId) ?? [];
    records.push(record);
    recordsByCase.set(record.caseId, records);
  }
  const seen = new Set<string>();
  const cases = input.cases.map((item) => {
    const reasons: string[] = [];
    if (seen.has(item.caseId)) reasons.push('正式方案存在重复 caseId');
    seen.add(item.caseId);
    if (item.disposition === 'ready' && !item.automationBound) reasons.push('可执行用例缺少自动化绑定');
    if (item.disposition === 'ready' && !item.caseFingerprint) reasons.push('可执行用例缺少逐条用例指纹');
    const matchingRecords = (recordsByCase.get(item.caseId) ?? [])
      .filter((record) => item.fingerprintMatchMode === 'semantic'
        ? Boolean(item.semanticCaseFingerprint)
          && record.semanticCaseFingerprint === item.semanticCaseFingerprint
        : record.caseFingerprint === item.caseFingerprint)
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
    const arbitration = arbitrateCaseState({
      caseId: item.caseId,
      disposition: item.disposition,
      currentCaseFingerprint: item.caseFingerprint,
      currentSemanticCaseFingerprint: item.semanticCaseFingerprint,
      fingerprintMatchMode: item.fingerprintMatchMode,
      requireCutoverAuthorization: item.requireCutoverAuthorization,
      cutoverAuthorization: item.cutoverAuthorization,
      currentImplementationFingerprint: item.implementationFingerprint,
      implementationFingerprintRequired: item.implementationFingerprintRequired,
      receipts: matchingRecords,
      productDefect: item.productDefectEvidence,
      handledOutcome: item.handledOutcome,
      historicalRuntimeStatus: item.historicalExecution?.status,
    });
    const completePass = arbitration.status === 'passed'
      ? matchingRecords.find((record) => record === arbitration.receipt) ?? null
      : null;
    const latestRecord = matchingRecords.find((record) => record === arbitration.receipt) ?? matchingRecords.at(-1);
    const receiptRelease = completePass ? normalizeReleaseObservation({
      releaseObservation: completePass.releaseObservation,
      applicationVersionFingerprint: completePass.applicationVersionFingerprint,
      observedAt: completePass.recordedAt,
    }) : null;
    const releaseChangeObserved = Boolean(
      releaseObservationAllowsReuse(currentRelease)
      && receiptRelease
      && releaseObservationAllowsReuse(receiptRelease)
      && currentRelease.fingerprint !== receiptRelease.fingerprint,
    );
    let status: 'passed' | 'handled' | 'ready' | Exclude<TestPlanDisposition, 'ready'> | 'invalid';
    let applicabilityStatus: TestApplicabilityStatus | null = null;
    let reuseStatus: TestReuseStatus | null = null;
    if (reasons.length > 0) status = 'invalid';
    else if (arbitration.status === 'passed' && completePass && !releaseChangeObserved) {
      status = 'passed';
      applicabilityStatus = currentRelease.fingerprint && currentRelease.fingerprint === receiptRelease?.fingerprint
        ? 'current-confirmed'
        : 'valid-at-execution';
      reuseStatus = completePass.reuseStatus ?? resolveReuseStatus({
        executionStatus: completePass.status,
        evidenceStatus: completePass.evidenceStatus ?? 'legacy-unverified',
        releaseObservation: receiptRelease!,
      });
      if (applicabilityStatus === 'valid-at-execution') {
        reasons.push('执行证据完整且历史通过有效；当前未发现可证明的发布变化，结果不会因日期或会话变化失效。');
      }
    } else {
      status = arbitration.status;
      if (releaseChangeObserved) {
        status = 'ready';
        applicabilityStatus = 'change-revalidation-required';
        reuseStatus = 'invalidated';
        reasons.push('已观测到发布身份变化，需要按影响范围重新验证。');
      } else reasons.push(arbitration.reason);
    }
    return {
      ...item,
      status,
      reasons,
      applicabilityStatus,
      reuseStatus,
      executionReceipt: completePass ?? latestRecord ?? null,
      arbitration: {
        staleProductDefect: arbitration.staleProductDefect,
        staleReceipts: arbitration.staleReceipts,
        handlingStatus: arbitration.handlingStatus,
        verificationStatus: arbitration.verificationStatus,
        actionRequired: arbitration.actionRequired,
      },
    };
  });
  const summary = {
    total: cases.length,
    passed: cases.filter((item) => item.status === 'passed').length,
    handled: cases.filter((item) => item.status === 'handled').length,
    ready: cases.filter((item) => item.status === 'ready').length,
    deferred: cases.filter((item) => item.status === 'deferred').length,
    notApplicable: cases.filter((item) => item.status === 'not-applicable').length,
    productDefect: cases.filter((item) => item.status === 'product-defect').length,
    blockedSource: cases.filter((item) => item.status === 'blocked-source').length,
    blockedTechnical: cases.filter((item) => item.status === 'blocked-technical').length,
    invalid: cases.filter((item) => item.status === 'invalid').length,
    reusable: cases.filter((item) => item.reuseStatus === 'reusable').length,
    runOnly: cases.filter((item) => item.reuseStatus === 'run-only').length,
    changeRevalidationRequired: cases.filter((item) => item.applicabilityStatus === 'change-revalidation-required').length,
  };
  const classified = summary.passed + summary.handled + summary.ready + summary.deferred + summary.notApplicable
    + summary.productDefect + summary.blockedSource + summary.blockedTechnical + summary.invalid;
  if (classified !== summary.total) throw new Error(`${input.planId}:TEST_PLAN_CLASSIFICATION_NOT_CONSERVED`);
  // Classification is a conservation fact, not delivery evidence. Deferred and
  // not-applicable cases remain in the formal denominator until they have a
  // current passed/handled outcome; otherwise a plan could close by moving work
  // into an exclusion bucket.
  const acceptedComplete = summary.passed + summary.handled;
  const unresolved = summary.ready + summary.deferred + summary.notApplicable
    + summary.productDefect + summary.blockedSource + summary.blockedTechnical + summary.invalid;
  const completion = evaluateDeliveryCompletion({
    total: summary.total,
    acceptedComplete,
    unresolved,
    classifiedExclusions: summary.deferred + summary.notApplicable
      + summary.blockedSource + summary.blockedTechnical,
  });
  return {
    schemaVersion: '2.0.0' as const,
    planId: input.planId,
    changeObservation: currentRelease,
    status: completion.deliveryComplete ? 'closed' as const : 'incomplete' as const,
    completion: {
      ...completion,
      acceptedStatuses: ['passed', 'handled'] as const,
      blockingStatuses: ['ready', 'deferred', 'not-applicable', 'product-defect', 'blocked-source', 'blocked-technical', 'invalid'] as const,
    },
    summary,
    cases,
  };
}
