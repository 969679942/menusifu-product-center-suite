import { createHash } from 'node:crypto';

export type RecoverySnapshot = {
  snapshotId: string;
  createdAt: string;
  sourceKind: 'history' | 'receipt' | 'audit';
  objectCount: number;
  contentHash: string;
};

export function createRecoverySnapshot(input: {
  snapshotId: string;
  createdAt: string;
  sourceKind: RecoverySnapshot['sourceKind'];
  objects: readonly unknown[];
}): RecoverySnapshot {
  if (!input.snapshotId.trim()) throw new Error('RECOVERY_SNAPSHOT_ID_REQUIRED');
  if (!Number.isFinite(Date.parse(input.createdAt))) throw new Error('RECOVERY_SNAPSHOT_TIMESTAMP_INVALID');
  return {
    snapshotId: input.snapshotId,
    createdAt: input.createdAt,
    sourceKind: input.sourceKind,
    objectCount: input.objects.length,
    contentHash: sha256(stableStringify(input.objects)),
  };
}

export function verifyRecoverySnapshot(snapshot: RecoverySnapshot, objects: readonly unknown[]): { valid: boolean; reason: string } {
  if (snapshot.objectCount !== objects.length) return { valid: false, reason: 'object-count-mismatch' };
  if (snapshot.contentHash !== sha256(stableStringify(objects))) return { valid: false, reason: 'content-hash-mismatch' };
  return { valid: true, reason: 'verified' };
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
