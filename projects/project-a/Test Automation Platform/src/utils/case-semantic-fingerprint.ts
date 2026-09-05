import { createHash } from 'node:crypto';

export type CaseSemanticFingerprintInput = {
  caseId: string;
  preconditions: readonly string[];
  steps: readonly string[];
  expectedResults: readonly string[];
  sources: readonly string[];
};

export type CaseFingerprintLineageReceipt = {
  caseFingerprint: string;
  semanticFingerprint?: string | null;
  evidenceComplete: boolean;
};

export type CaseFingerprintLineageStatus =
  | 'safe-lineage-mappable'
  | 'historical-semantic-evidence-insufficient'
  | 'semantic-change-detected'
  | 'no-historical-receipt';

export type CaseFingerprintLineageAssessment = {
  status: CaseFingerprintLineageStatus;
  reason: string;
  matchingReceiptFingerprint: string | null;
};

/**
 * Builds a stable, case-scoped fingerprint from execution semantics only.
 * Presentation-only whitespace and ordered-list markers do not affect the result.
 */
export function fingerprintCaseSemantics(input: CaseSemanticFingerprintInput): string {
  const normalized = {
    schemaVersion: '1.0.0',
    caseId: required(input.caseId, 'CASE_ID_REQUIRED'),
    preconditions: normalizeList(input.preconditions, 'PRECONDITIONS_REQUIRED'),
    steps: normalizeList(input.steps, 'STEPS_REQUIRED'),
    expectedResults: normalizeList(input.expectedResults, 'EXPECTED_RESULTS_REQUIRED'),
    sources: normalizeList(input.sources, 'SOURCES_REQUIRED'),
  };
  return createHash('sha256').update(stableJson(normalized)).digest('hex');
}

/**
 * Fingerprint only execution semantics. Source locations are intentionally
 * excluded so file moves/renames trigger trace review, not business reruns.
 */
export function fingerprintCaseExecutionSemantics(input: Omit<CaseSemanticFingerprintInput, 'sources'>): string {
  const normalized = {
    schemaVersion: '1.0.0-execution-semantics',
    caseId: required(input.caseId, 'CASE_ID_REQUIRED'),
    preconditions: normalizeList(input.preconditions, 'PRECONDITIONS_REQUIRED'),
    steps: normalizeList(input.steps, 'STEPS_REQUIRED'),
    expectedResults: normalizeList(input.expectedResults, 'EXPECTED_RESULTS_REQUIRED'),
  };
  return createHash('sha256').update(stableJson(normalized)).digest('hex');
}

/**
 * A shared plan fingerprint is not proof that an old receipt executed today's
 * case semantics. Migration is allowed only when a receipt carries the new
 * case fingerprint itself, or an explicit historical semantic fingerprint.
 */
export function assessCaseFingerprintLineage(input: {
  currentSemanticFingerprint: string;
  receipts: readonly CaseFingerprintLineageReceipt[];
}): CaseFingerprintLineageAssessment {
  const current = required(input.currentSemanticFingerprint, 'CURRENT_SEMANTIC_FINGERPRINT_REQUIRED');
  const complete = input.receipts.filter((receipt) => receipt.evidenceComplete);
  const direct = complete.find((receipt) => receipt.caseFingerprint === current);
  if (direct) {
    return {
      status: 'safe-lineage-mappable',
      reason: 'complete-receipt-already-uses-current-case-semantic-fingerprint',
      matchingReceiptFingerprint: direct.caseFingerprint,
    };
  }
  const explicit = complete.filter((receipt) => Boolean(receipt.semanticFingerprint));
  const mapped = explicit.find((receipt) => receipt.semanticFingerprint === current);
  if (mapped) {
    return {
      status: 'safe-lineage-mappable',
      reason: 'complete-receipt-has-explicit-matching-semantic-fingerprint',
      matchingReceiptFingerprint: mapped.caseFingerprint,
    };
  }
  if (explicit.length > 0) {
    return {
      status: 'semantic-change-detected',
      reason: 'explicit-historical-semantic-fingerprint-differs-from-current',
      matchingReceiptFingerprint: null,
    };
  }
  if (input.receipts.length > 0) {
    return {
      status: 'historical-semantic-evidence-insufficient',
      reason: complete.length > 0
        ? 'complete-receipt-lacks-case-scoped-semantic-fingerprint'
        : 'historical-receipts-are-not-evidence-complete',
      matchingReceiptFingerprint: null,
    };
  }
  return {
    status: 'no-historical-receipt',
    reason: 'no-historical-receipt-available',
    matchingReceiptFingerprint: null,
  };
}

export function normalizeCaseSemanticText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/^\d+[.)、]\s*/, '').replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('\n');
}

function normalizeList(values: readonly string[], errorCode: string): string[] {
  const normalized = values.map(normalizeCaseSemanticText).filter(Boolean);
  if (normalized.length === 0) throw new Error(errorCode);
  return normalized;
}

function required(value: string, errorCode: string): string {
  const normalized = normalizeCaseSemanticText(value);
  if (!normalized) throw new Error(errorCode);
  return normalized;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
