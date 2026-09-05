import type { SystemTestCompiledCase } from './system-test-contract';
import type { SystemTestRuntimeEvidence } from './system-test-evidence';

export type SystemTestCaseAuditRequirements = {
  schemaVersion: '1.1.0';
  operationExpected: boolean;
  mutationExpected: boolean;
  structuredDiffExpected: boolean;
  cleanupExpected: boolean;
  requiredOperationKeys: string[];
  requiredEvidenceChannels: Array<'ui' | 'api' | 'downstream' | 'cleanup'>;
};

export type SystemTestAuditCompletenessCode =
  | 'missing-evidence'
  | 'missing-operation'
  | 'missing-diff'
  | 'missing-cleanup'
  | 'missing-case-id'
  | 'missing-run-id'
  | 'orphan-operation'
  | 'unfinished-operation'
  | 'missing-current-receipt';

export type SystemTestCaseAuditCompleteness = {
  caseId: string;
  status: 'complete' | 'incomplete' | 'excluded';
  requirements: SystemTestCaseAuditRequirements;
  missing: SystemTestAuditCompletenessCode[];
};

export type SystemTestAuditCompletenessSummary = {
  planned: number;
  auditEligible: number;
  classifiedExclusions: number;
  auditComplete: number;
  auditIncomplete: number;
  byMissingCode: Partial<Record<SystemTestAuditCompletenessCode, number>>;
  invariantSatisfied: boolean;
};

export function buildSystemTestCaseAuditRequirements(item: SystemTestCompiledCase): SystemTestCaseAuditRequirements {
  const mutationExpected = item.mutationMode !== 'none';
  const requiredEvidenceChannels = unique([
    ...item.expectationClaims.map((claim) => claim.observationChannel),
    ...(mutationExpected ? ['api', 'cleanup'] as const : []),
  ].filter((channel): channel is 'ui' | 'api' | 'downstream' | 'cleanup' => (
    ['ui', 'api', 'downstream', 'cleanup'] as const
  ).includes(channel as 'ui' | 'api' | 'downstream' | 'cleanup')));
  return {
    schemaVersion: '1.1.0',
    operationExpected: item.requiredOperationKeys.length > 0,
    mutationExpected,
    // A mutation also needs a before/after receipt when the expected result is "no change".
    structuredDiffExpected: mutationExpected,
    cleanupExpected: mutationExpected,
    requiredOperationKeys: [...item.requiredOperationKeys].sort(),
    requiredEvidenceChannels,
  };
}

export function evaluateSystemTestCaseAuditCompleteness(input: {
  item: SystemTestCompiledCase;
  evidence?: SystemTestRuntimeEvidence;
  runId?: string;
}): SystemTestCaseAuditCompleteness {
  const requirements = buildSystemTestCaseAuditRequirements(input.item);
  const eligible = requirements.operationExpected || requirements.mutationExpected
    || requirements.structuredDiffExpected || requirements.cleanupExpected;
  if (!eligible) return { caseId: input.item.caseId, status: 'excluded', requirements, missing: [] };
  const missing = new Set<SystemTestAuditCompletenessCode>();
  const evidence = input.evidence;
  if (!evidence) missing.add('missing-evidence');
  if (evidence && evidence.caseId !== input.item.caseId) missing.add('missing-case-id');
  if (!input.runId?.trim()) missing.add('missing-run-id');
  const operations = evidence?.operationReceipts ?? [];
  const observedOperations = new Set(operations.filter((receipt) => receipt.observed).map((receipt) => receipt.operationKey));
  if (requirements.operationExpected
    && requirements.requiredOperationKeys.some((key) => !observedOperations.has(key))) missing.add('missing-operation');
  if (operations.some((receipt) => receipt.status === 'started' || (!receipt.finishedAt && receipt.startedAt))) {
    missing.add('unfinished-operation');
  }
  if (operations.some((receipt) => !receipt.operationKey || !evidence?.caseId)) missing.add('orphan-operation');
  const structuredDiffProvided = (evidence?.changeReceipts ?? []).some(isStructuredChangeReceipt)
    || operations.some((receipt) => Boolean(receipt.beforeFingerprint && receipt.afterFingerprint && Array.isArray(receipt.changedFields)));
  if (requirements.structuredDiffExpected && !structuredDiffProvided) {
    missing.add('missing-diff');
  }
  if (requirements.cleanupExpected && !(evidence?.cleanup?.objects ?? []).some((item) => (
    item.apiResidueCount === 0 && item.uiResidueCount === 0 && item.outcome === 'verified-zero'
  ))) missing.add('missing-cleanup');
  return {
    caseId: input.item.caseId,
    status: missing.size === 0 ? 'complete' : 'incomplete',
    requirements,
    missing: [...missing].sort(),
  };
}

export function summarizeSystemTestAuditCompleteness(
  cases: readonly SystemTestCaseAuditCompleteness[],
): SystemTestAuditCompletenessSummary {
  const auditEligible = cases.filter((item) => item.status !== 'excluded');
  const classifiedExclusions = cases.length - auditEligible.length;
  const auditComplete = auditEligible.filter((item) => item.status === 'complete').length;
  const auditIncomplete = auditEligible.length - auditComplete;
  const byMissingCode: SystemTestAuditCompletenessSummary['byMissingCode'] = {};
  for (const code of auditEligible.flatMap((item) => item.missing)) byMissingCode[code] = (byMissingCode[code] ?? 0) + 1;
  return {
    planned: cases.length,
    auditEligible: auditEligible.length,
    classifiedExclusions,
    auditComplete,
    auditIncomplete,
    byMissingCode,
    invariantSatisfied: cases.length === auditEligible.length + classifiedExclusions
      && auditEligible.length === auditComplete + auditIncomplete,
  };
}

function isStructuredChangeReceipt(receipt: NonNullable<SystemTestRuntimeEvidence['changeReceipts']>[number]): boolean {
  return Boolean(receipt.entityType && receipt.entityId
    && receipt.beforeFingerprint && receipt.afterFingerprint
    && Array.isArray(receipt.changedFields));
}

function unique<T extends string>(values: readonly T[]): T[] { return [...new Set(values)].sort() as T[]; }
