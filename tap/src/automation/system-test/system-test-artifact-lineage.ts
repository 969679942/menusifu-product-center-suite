import { createHash } from 'node:crypto';

export type SystemTestArtifactLineage = {
  upstreamFingerprint: string | null;
  selectionFingerprint: string | null;
  scopeFingerprint?: string | null;
};

export type SystemTestArtifactLineageResult = {
  status: 'current' | 'stale';
  reasons: string[];
};

function normalizeForFingerprint(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('SYSTEM_TEST_ARTIFACT_FINGERPRINT_VALUE_INVALID');
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeForFingerprint);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizeForFingerprint(entry)]));
  }
  throw new Error('SYSTEM_TEST_ARTIFACT_FINGERPRINT_VALUE_INVALID');
}

export function fingerprintSystemTestArtifact(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(normalizeForFingerprint(value)))
    .digest('hex');
}

function validFingerprint(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

export function arbitrateSystemTestArtifactLineage(input: {
  expected: SystemTestArtifactLineage;
  actual: SystemTestArtifactLineage;
}): SystemTestArtifactLineageResult {
  const reasons = new Set<string>();
  if (!validFingerprint(input.expected.upstreamFingerprint)) {
    reasons.add('EXPECTED_UPSTREAM_FINGERPRINT_INVALID');
  }
  if (!validFingerprint(input.expected.selectionFingerprint)) {
    reasons.add('EXPECTED_SELECTION_FINGERPRINT_INVALID');
  }
  if (!validFingerprint(input.actual.upstreamFingerprint)) {
    reasons.add('ACTUAL_UPSTREAM_FINGERPRINT_INVALID');
  } else if (validFingerprint(input.expected.upstreamFingerprint)
    && input.actual.upstreamFingerprint !== input.expected.upstreamFingerprint) {
    reasons.add('UPSTREAM_FINGERPRINT_MISMATCH');
  }
  if (!validFingerprint(input.actual.selectionFingerprint)) {
    reasons.add('ACTUAL_SELECTION_FINGERPRINT_INVALID');
  } else if (validFingerprint(input.expected.selectionFingerprint)
    && input.actual.selectionFingerprint !== input.expected.selectionFingerprint) {
    reasons.add('SELECTION_FINGERPRINT_MISMATCH');
  }
  const scopeExpected = input.expected.scopeFingerprint !== undefined;
  const scopeActual = input.actual.scopeFingerprint !== undefined;
  if (scopeExpected || scopeActual) {
    if (!validFingerprint(input.expected.scopeFingerprint)) {
      reasons.add('EXPECTED_SCOPE_FINGERPRINT_INVALID');
    }
    if (!validFingerprint(input.actual.scopeFingerprint)) {
      reasons.add('ACTUAL_SCOPE_FINGERPRINT_INVALID');
    } else if (validFingerprint(input.expected.scopeFingerprint)
      && input.actual.scopeFingerprint !== input.expected.scopeFingerprint) {
      reasons.add('SCOPE_FINGERPRINT_MISMATCH');
    }
  }
  return {
    status: reasons.size === 0 ? 'current' : 'stale',
    reasons: [...reasons].sort(),
  };
}

export function assertSystemTestArtifactLineage(input: {
  expected: SystemTestArtifactLineage;
  actual: SystemTestArtifactLineage;
}): void {
  const result = arbitrateSystemTestArtifactLineage(input);
  if (result.status === 'stale') {
    throw new Error(`SYSTEM_TEST_ARTIFACT_STALE:${result.reasons.join(',')}`);
  }
}
