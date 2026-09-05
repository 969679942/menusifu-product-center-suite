import { createHash } from 'node:crypto';
import { redactAuditValue } from './event-log';

/**
 * 通用变更快照：事件只引用此结构，完整内容可由适配器写入独立归档。
 * before/after 经过脱敏，不能包含密码、令牌、Cookie 或授权头。
 */
export type ChangeSnapshot = {
  schemaVersion: '1.0.0';
  beforeFingerprint: string | null;
  afterFingerprint: string | null;
  beforeContent?: unknown;
  afterContent?: unknown;
  unifiedDiff?: string;
  changedFields: string[];
  contentAvailable: { before: boolean; after: boolean };
  snapshotRef?: string;
  changedBy?: string;
  changeSource?: string;
  changeReason?: string;
};

export type ChangeSnapshotInput = {
  before?: unknown;
  after?: unknown;
  beforeFingerprint?: string | null;
  afterFingerprint?: string | null;
  changedFields?: readonly string[];
  snapshotRef?: string;
  changedBy?: string;
  changeSource?: string;
  changeReason?: string;
  maxContentBytes?: number;
};

export function createChangeSnapshot(input: ChangeSnapshotInput): ChangeSnapshot {
  const before = safeContent(input.before, input.maxContentBytes ?? 128 * 1024);
  const after = safeContent(input.after, input.maxContentBytes ?? 128 * 1024);
  const beforeFingerprint = input.beforeFingerprint ?? (before !== undefined ? sha256(stableStringify(before)) : null);
  const afterFingerprint = input.afterFingerprint ?? (after !== undefined ? sha256(stableStringify(after)) : null);
  const changedFields = [...new Set((input.changedFields ?? []).map(String))].sort();
  const unifiedDiff = buildUnifiedDiff(before, after);
  return {
    schemaVersion: '1.0.0', beforeFingerprint, afterFingerprint,
    ...(before === undefined ? {} : { beforeContent: before }),
    ...(after === undefined ? {} : { afterContent: after }),
    ...(unifiedDiff ? { unifiedDiff } : {}),
    changedFields,
    contentAvailable: { before: before !== undefined, after: after !== undefined },
    ...(input.snapshotRef ? { snapshotRef: input.snapshotRef } : {}),
    ...(input.changedBy ? { changedBy: input.changedBy } : {}),
    ...(input.changeSource ? { changeSource: input.changeSource } : {}),
    ...(input.changeReason ? { changeReason: input.changeReason } : {}),
  };
}

function safeContent(value: unknown, maxBytes: number): unknown {
  if (value === undefined) return undefined;
  const redacted = redactAuditValue(value);
  return Buffer.byteLength(JSON.stringify(redacted), 'utf8') <= maxBytes
    ? redacted
    : { truncated: true, contentFingerprint: sha256(stableStringify(redacted)), maxContentBytes: maxBytes };
}

function buildUnifiedDiff(before: unknown, after: unknown): string | undefined {
  if (before === undefined && after === undefined) return undefined;
  const left = printable(before); const right = printable(after);
  if (left === right) return undefined;
  const a = left.split('\n'); const b = right.split('\n');
  const lines = ['--- 修改前', '+++ 修改后'];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (a[i] === b[i]) lines.push(`  ${a[i] ?? ''}`);
    else {
      if (a[i] !== undefined) lines.push(`- ${a[i]}`);
      if (b[i] !== undefined) lines.push(`+ ${b[i]}`);
    }
  }
  return lines.join('\n');
}

function printable(value: unknown): string { return value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
