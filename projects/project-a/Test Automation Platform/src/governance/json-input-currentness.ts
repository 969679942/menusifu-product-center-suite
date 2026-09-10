import { createHash } from 'node:crypto';
import type { JsonEvidenceResult } from '../utils/json-evidence';

export type JsonInputFingerprint = { path: string; fingerprint: string };
export type CurrentJsonInput = { path: string; evidence: JsonEvidenceResult<unknown> };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const key = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.trim() === value;

/** Parsed JSON identity: preserve key/array order; whitespace and BOM are not semantic changes. */
export function fingerprintJsonInput(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('JSON_INPUT_NOT_SERIALIZABLE');
  return createHash('sha256').update(serialized).digest('hex');
}

/** The adapter supplies independently configured, freshly read and schema-validated inputs.
 * Never use the candidate's paths as a discovery/read list. Returned diagnostics contain no source values.
 */
export function verifyJsonInputCurrentness(declared: unknown, current: readonly CurrentJsonInput[]): {
  status: 'current' | 'incomplete'; reasons: string[];
} {
  const reasons = new Set<string>();
  if (!Array.isArray(current) || current.length === 0 || !current.every((item) => object(item) && key(item.path))
    || new Set(current.map((item) => item.path)).size !== current.length) {
    return { status: 'incomplete', reasons: ['CURRENT_INPUT_CONTRACT_INVALID'] };
  }
  if (!Array.isArray(declared) || declared.length === 0 || !declared.every((item) => object(item) && key(item.path)
    && typeof item.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(item.fingerprint))
    || new Set(declared.map((item) => item.path)).size !== declared.length) {
    return { status: 'incomplete', reasons: ['DECLARED_INPUT_FINGERPRINTS_INVALID'] };
  }
  const entries = declared as JsonInputFingerprint[];
  if (entries.length !== current.length || entries.some((entry) => !current.some((item) => item.path === entry.path))) reasons.add('INPUT_SET_MISMATCH');
  for (const item of current) {
    if (!object(item.evidence) || item.evidence.status !== 'available') { reasons.add('CURRENT_INPUT_UNAVAILABLE'); continue; }
    try {
      if (entries.find((entry) => entry.path === item.path)?.fingerprint !== fingerprintJsonInput(item.evidence.value)) reasons.add('INPUT_FINGERPRINT_MISMATCH');
    } catch { reasons.add('CURRENT_INPUT_NOT_SERIALIZABLE'); }
  }
  return { status: reasons.size ? 'incomplete' : 'current', reasons: [...reasons].sort() };
}
