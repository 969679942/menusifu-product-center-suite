import { createHash } from 'node:crypto';

export type CaseFingerprintCutoverAuthorization = {
  caseId: string;
  oldEffectiveFingerprint: string;
  newSemanticFingerprint: string;
  implementationFingerprint: string;
  approvedCutoverId: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt?: string | null;
  authorizationFingerprint: string;
};

export function fingerprintCutoverAuthorization(
  value: Omit<CaseFingerprintCutoverAuthorization, 'authorizationFingerprint'>,
): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function isValidCaseFingerprintCutoverAuthorization(
  value: CaseFingerprintCutoverAuthorization | null | undefined,
  now = new Date(),
): boolean {
  if (!value || !value.caseId || !value.oldEffectiveFingerprint || !value.newSemanticFingerprint
    || !value.implementationFingerprint || !value.approvedCutoverId || !value.approvedBy
    || !value.approvedAt || !/^[a-f0-9]{64}$/i.test(value.authorizationFingerprint)) return false;
  if (value.expiresAt && new Date(value.expiresAt).getTime() <= now.getTime()) return false;
  const { authorizationFingerprint: _ignored, ...unsigned } = value;
  return fingerprintCutoverAuthorization(unsigned) === value.authorizationFingerprint;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
