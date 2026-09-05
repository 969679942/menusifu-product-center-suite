import fs from 'node:fs';
import path from 'node:path';
import type { ProductCenterAuditSafetyLevel } from '../../utils/product-center-audit-unit';

export type MutationIntentPhase =
  | 'intent-recorded'
  | 'trigger-started'
  | 'response-observed'
  | 'reconciled-present'
  | 'reconciled-absent'
  | 'reconciled-ambiguous'
  | 'verification-complete'
  | 'cleanup-complete'
  | 'failed';

export type MutationIntentReconciliation = 'present' | 'absent' | 'ambiguous';

export type MutationIntentEntry = {
  intentId: string;
  unitId: string;
  safetyLevel: Extract<ProductCenterAuditSafetyLevel, 'L2-controlled-negative' | 'L3-crud'>;
  entity: string;
  identity: string;
  identityVariants: string[];
  operation: { method: string; path: string };
  requestFingerprint: string;
  phase: MutationIntentPhase;
  reconciliation?: MutationIntentReconciliation;
  serverId?: number | string;
  ledgerEntryId?: string;
  diagnostic?: string;
  updatedAt: string;
};

export type MutationIntentSnapshot = {
  schemaVersion: '1.0.0';
  runId: string;
  updatedAt: string;
  entries: MutationIntentEntry[];
};

type MutationIntentInput = Omit<
  MutationIntentEntry,
  'phase' | 'reconciliation' | 'serverId' | 'ledgerEntryId' | 'diagnostic' | 'updatedAt'
>;

const sensitivePattern = /(authorization|bearer\s+|password|cookie|set-cookie|token\s*[:=]|[?&]token=|eyJ[a-z0-9_-]{10,}\.)/i;

export class MutationIntentJournal {
  readonly filePath: string;
  private state: MutationIntentSnapshot;

  constructor(options: { rootDir: string; runId: string }) {
    fs.mkdirSync(options.rootDir, { recursive: true });
    const safeRunId = options.runId.replace(/[^a-zA-Z0-9_-]/g, '_');
    this.filePath = path.join(options.rootDir, `${safeRunId}.json`);
    this.state = fs.existsSync(this.filePath)
      ? JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as MutationIntentSnapshot
      : { schemaVersion: '1.0.0', runId: options.runId, updatedAt: new Date().toISOString(), entries: [] };
    this.persist();
  }

  recordIntent(input: MutationIntentInput): MutationIntentEntry {
    assertAuditIdentity(input.identity);
    for (const identity of input.identityVariants) assertAuditIdentity(identity);
    assertSafeValue(input.intentId);
    assertSafeValue(input.unitId);
    assertSafeValue(input.entity);
    assertSafeValue(input.operation.method);
    assertSafeValue(input.operation.path);
    if (!/^[a-f0-9]{64}$/i.test(input.requestFingerprint)) {
      throw new Error('Mutation Intent 请求指纹无效');
    }
    const existing = this.state.entries.find((entry) => entry.intentId === input.intentId);
    if (existing) {
      if (existing.unitId !== input.unitId || existing.identity !== input.identity
        || existing.requestFingerprint !== input.requestFingerprint) {
        throw new Error(`Mutation Intent 冲突：${input.intentId}`);
      }
      return structuredClone(existing);
    }
    const entry: MutationIntentEntry = {
      ...input,
      identityVariants: [...new Set(input.identityVariants)],
      operation: { method: input.operation.method.toUpperCase(), path: input.operation.path },
      phase: 'intent-recorded',
      updatedAt: new Date().toISOString(),
    };
    this.state.entries.push(entry);
    this.persist();
    return structuredClone(entry);
  }

  markPhase(intentId: string, phase: MutationIntentPhase, diagnostic?: string): void {
    const entry = this.requireEntry(intentId);
    if (diagnostic) assertSafeValue(diagnostic);
    entry.phase = phase;
    entry.diagnostic = diagnostic;
    entry.updatedAt = new Date().toISOString();
    this.persist();
  }

  recordReconciliation(intentId: string, reconciliation: MutationIntentReconciliation): void {
    const entry = this.requireEntry(intentId);
    entry.reconciliation = reconciliation;
    entry.phase = `reconciled-${reconciliation}`;
    entry.updatedAt = new Date().toISOString();
    this.persist();
  }

  attachServerIdentity(intentId: string, input: { serverId: number | string; ledgerEntryId?: string }): void {
    const entry = this.requireEntry(intentId);
    entry.serverId = input.serverId;
    entry.ledgerEntryId = input.ledgerEntryId;
    entry.updatedAt = new Date().toISOString();
    this.persist();
  }

  snapshot(): MutationIntentSnapshot {
    return structuredClone(this.state);
  }

  incompleteEntries(): MutationIntentEntry[] {
    return this.state.entries
      .filter((entry) => entry.phase !== 'cleanup-complete')
      .map((entry) => structuredClone(entry));
  }

  private requireEntry(intentId: string): MutationIntentEntry {
    const entry = this.state.entries.find((candidate) => candidate.intentId === intentId);
    if (!entry) throw new Error(`Mutation Intent 不存在：${intentId}`);
    return entry;
  }

  private persist(): void {
    this.state.updatedAt = new Date().toISOString();
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }
}

export function discoverIncompleteMutationIntentRunIds(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];
  const runIds: string[] = [];
  for (const fileName of fs.readdirSync(rootDir).filter((name) => name.endsWith('.json')).sort()) {
    const filePath = path.join(rootDir, fileName);
    const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8')) as MutationIntentSnapshot;
    if (typeof snapshot.runId !== 'string' || !Array.isArray(snapshot.entries)) continue;
    if (snapshot.entries.some((entry) => entry.phase !== 'cleanup-complete')) runIds.push(snapshot.runId);
  }
  return runIds;
}

function assertAuditIdentity(identity: string): void {
  if (!identity.trim().startsWith('AUTO_AUDIT_')) throw new Error(`禁止记录非审计数据：${identity}`);
}

function assertSafeValue(value: string): void {
  if (sensitivePattern.test(value)) throw new Error('Mutation Intent 包含敏感信息');
}
