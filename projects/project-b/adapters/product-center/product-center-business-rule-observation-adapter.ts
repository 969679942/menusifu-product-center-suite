import {
  observeBusinessRuleExecution,
  type BusinessRuleDocument,
  type BusinessRuleExecutionReceipt,
  type BusinessRuleObservation,
} from '../../../../Test Automation Platform/src/automation/system-test/business-rule-lifecycle';

export type ProductCenterExecutionObservationInput = {
  rule: BusinessRuleDocument;
  receipt: BusinessRuleExecutionReceipt;
  caseFingerprint: string;
  expectedCaseFingerprint: string;
  semanticCaseFingerprint?: string | null;
  expectedSemanticCaseFingerprint?: string | null;
  fingerprintMatchMode?: 'effective' | 'semantic';
  implementationFingerprint: string | null;
  expectedImplementationFingerprint: string | null;
  implementationFingerprintRequired?: boolean;
  executionContextFingerprint: string | null;
  expectedExecutionContextFingerprint: string | null;
};

export type ProductCenterRuleObservationResult = BusinessRuleObservation & {
  caseId: string;
  receiptId: string;
  contextStatus: 'matched' | 'unavailable' | 'mismatched';
  semanticChangeDetected: boolean;
};

/**
 * Converts a complete execution receipt into a rule observation. Fingerprint
 * and context mismatches stay diagnostics and never become rule candidates.
 */
export function observeProductCenterRuleExecution(
  input: ProductCenterExecutionObservationInput,
): ProductCenterRuleObservationResult {
  const fingerprintBlockers: string[] = [];
  const caseFingerprintMatched = input.fingerprintMatchMode === 'semantic'
    ? Boolean(input.expectedSemanticCaseFingerprint)
      && input.semanticCaseFingerprint === input.expectedSemanticCaseFingerprint
    : input.caseFingerprint === input.expectedCaseFingerprint;
  if (!caseFingerprintMatched) fingerprintBlockers.push('CASE_FINGERPRINT_MISMATCH');
  if (input.implementationFingerprintRequired !== false && input.expectedImplementationFingerprint
    && input.implementationFingerprint !== input.expectedImplementationFingerprint) {
    fingerprintBlockers.push('IMPLEMENTATION_FINGERPRINT_MISMATCH');
  }
  const contextStatus = input.expectedExecutionContextFingerprint === null
    || input.executionContextFingerprint === null
    ? 'unavailable'
    : input.executionContextFingerprint === input.expectedExecutionContextFingerprint ? 'matched' : 'mismatched';
  if (contextStatus === 'mismatched') fingerprintBlockers.push('EXECUTION_CONTEXT_FINGERPRINT_MISMATCH');
  const observation = observeBusinessRuleExecution({ rule: input.rule, receipt: input.receipt });
  const blockers = [...new Set([...fingerprintBlockers, ...observation.blockers])];
  const semanticChangeDetected = observation.candidate !== null
    && observation.candidate.statement !== input.rule.statement;
  return {
    ...observation,
    caseId: input.receipt.caseId,
    receiptId: input.receipt.receiptId,
    contextStatus,
    semanticChangeDetected,
    blockers,
    eligibleForCandidate: blockers.length === 0 && semanticChangeDetected,
    candidate: blockers.length === 0 && semanticChangeDetected ? observation.candidate : null,
  };
}
