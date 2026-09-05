import fs from 'node:fs';
import path from 'node:path';

export type ProductCenterLedgerEntityKind =
  | 'category'
  | 'method'
  | 'material'
  | 'seasoning'
  | 'bom'
  | 'bom-product'
  | 'item'
  | 'brand-image'
  | 'recipe-ingredient'
  | 'material-category'
  | 'taste'
  | 'spec'
  | 'addon'
  | 'print-stall'
  | 'tax'
  | 'description-tag'
  | 'statistic-tag'
  | 'tag-group'
  | 'corner-mark'
  | 'menu'
  | 'menu-block'
  | 'printer'
  | 'combo'
  | 'store-product'
  | 'brand-image'
  | 'corner-mark';

export type ProductCenterLedgerPhase =
  | 'planned'
  | 'seeded'
  | 'ui-triggered'
  | 'mutation-observed'
  | 'api-verified'
  | 'ui-verified'
  | 'cleaning'
  | 'cleaned'
  | 'residue-verified'
  | 'failed';

export type ProductCenterLedgerEntry = {
  entryId: string;
  intentId?: string;
  entityKind: ProductCenterLedgerEntityKind;
  entity: string;
  serverId: number | string;
  identity: string;
  identityVariants: string[];
  cleanupOrder: number;
  dependencyOf?: string;
  phase: ProductCenterLedgerPhase;
  classification?: string;
  diagnostic?: string;
  updatedAt: string;
};

export type ProductCenterLedgerSnapshot = {
  schemaVersion: '1.0.0';
  runId: string;
  updatedAt: string;
  entries: ProductCenterLedgerEntry[];
};

type LedgerOptions = {
  rootDir: string;
  runId: string;
};

type CreatedEntry = Omit<
  ProductCenterLedgerEntry,
  'phase' | 'classification' | 'diagnostic' | 'updatedAt'
>;

type FailureDiagnostic = {
  classification: string;
  message: string;
};

const terminalPhases = new Set<ProductCenterLedgerPhase>(['residue-verified']);
const sensitivePattern = /(authorization|bearer\s+|password|cookie|set-cookie|token\s*[:=]|eyJ[a-z0-9_-]{10,}\.)/i;

export class ProductCenterExecutionLedger {
  readonly filePath: string;
  private state: ProductCenterLedgerSnapshot;

  constructor(options: LedgerOptions) {
    fs.mkdirSync(options.rootDir, { recursive: true });
    const safeRunId = options.runId.replace(/[^a-zA-Z0-9_-]/g, '_');
    this.filePath = path.join(options.rootDir, `${safeRunId}.json`);
    this.state = fs.existsSync(this.filePath)
      ? JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as ProductCenterLedgerSnapshot
      : {
          schemaVersion: '1.0.0',
          runId: options.runId,
          updatedAt: new Date().toISOString(),
          entries: [],
        };
    this.persist();
  }

  recordCreated(input: CreatedEntry): void {
    assertAuditIdentity(input.identity);
    for (const identity of input.identityVariants) assertAuditIdentity(identity);
    const existing = this.state.entries.find((entry) => entry.entryId === input.entryId);
    if (existing) {
      if (
        existing.entityKind !== input.entityKind ||
        String(existing.serverId) !== String(input.serverId) ||
        existing.identity !== input.identity
      ) {
        throw new Error(`检查点冲突：${input.entryId}`);
      }
      return;
    }
    this.state.entries.push({
      ...input,
      identityVariants: [...new Set(input.identityVariants)],
      phase: 'seeded',
      updatedAt: new Date().toISOString(),
    });
    this.persist();
  }

  markPhase(entryId: string, phase: ProductCenterLedgerPhase): void {
    const entry = this.requireEntry(entryId);
    entry.phase = phase;
    entry.classification = undefined;
    entry.diagnostic = undefined;
    entry.updatedAt = new Date().toISOString();
    this.persist();
  }

  addIdentityVariant(entryId: string, identity: string): void {
    assertAuditIdentity(identity);
    const entry = this.requireEntry(entryId);
    if (entry.identityVariants.includes(identity)) return;
    entry.identityVariants.push(identity);
    entry.updatedAt = new Date().toISOString();
    this.persist();
  }

  markFailed(entryId: string, diagnostic: FailureDiagnostic): void {
    assertSafeDiagnostic(diagnostic.classification);
    assertSafeDiagnostic(diagnostic.message);
    const entry = this.requireEntry(entryId);
    entry.phase = 'failed';
    entry.classification = diagnostic.classification;
    entry.diagnostic = diagnostic.message;
    entry.updatedAt = new Date().toISOString();
    this.persist();
  }

  snapshot(): ProductCenterLedgerSnapshot {
    return structuredClone(this.state);
  }

  incompleteEntries(): ProductCenterLedgerEntry[] {
    return this.state.entries
      .filter((entry) => !terminalPhases.has(entry.phase))
      .sort((left, right) => right.cleanupOrder - left.cleanupOrder)
      .map((entry) => structuredClone(entry));
  }

  private requireEntry(entryId: string): ProductCenterLedgerEntry {
    const entry = this.state.entries.find((candidate) => candidate.entryId === entryId);
    if (!entry) throw new Error(`检查点不存在：${entryId}`);
    return entry;
  }

  private persist(): void {
    this.state.updatedAt = new Date().toISOString();
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
    const retryDelaysMs = [0, 50, 150, 300, 600];
    let lastError: unknown;
    for (const delayMs of retryDelaysMs) {
      if (delayMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
      try {
        fs.renameSync(temporaryPath, this.filePath);
        return;
      } catch (error) {
        lastError = error;
        if (!isTransientRenameError(error)) throw error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('检查点持久化重命名失败');
  }
}

function isTransientRenameError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && ['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? ''));
}

function assertAuditIdentity(identity: string): void {
  if (!identity.startsWith('AUTO_AUDIT_')) {
    throw new Error(`禁止记录非审计数据：${identity}`);
  }
}

function assertSafeDiagnostic(value: string): void {
  if (sensitivePattern.test(value)) throw new Error('检查点诊断包含敏感信息');
}
