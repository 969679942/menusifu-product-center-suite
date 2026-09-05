import type {
  ProductCenterExecutionLedger,
  ProductCenterLedgerEntityKind,
} from './execution-ledger';

export type CleanupCheckpoint = {
  entryId: string;
  intentId?: string;
  entityKind: ProductCenterLedgerEntityKind;
  serverId: number | string;
  identityVariants: string[];
  cleanupOrder: number;
  dependencyOf?: string;
};

export type CleanupTask = {
  entity: string;
  identity: string;
  resource?: {
    entityKind: ProductCenterLedgerEntityKind;
    serverId: number | string;
    identityVariants?: string[];
    cleanupOrder?: number;
    dependencyOf?: string;
  };
  checkpoint?: CleanupCheckpoint;
  execute: () => Promise<void>;
  verify: () => Promise<boolean>;
};

export type CleanupRegistryEvidence = {
  apiIdentityCounts: Record<string, number>;
  apiIdentityKinds: Record<string, ProductCenterLedgerEntityKind | 'unknown'>;
  serverIds: Array<number | string>;
  verifiedZero: true;
  objects: CleanupObjectReceipt[];
};

export type CleanupObjectReceipt = {
  entityType: ProductCenterLedgerEntityKind | 'unknown';
  serverId?: number | string;
  businessIdentity: string;
  cleanupOperationKey?: string;
  cleanupAttempt: number;
  apiResidueCount: number;
  outcome: 'verified-zero' | 'residue' | 'failed';
  failureCategory?: 'cleanup-residue' | 'cleanup-error';
  diagnostic?: string;
};

export class CleanupRegistryFailure extends Error {
  constructor(message: string, readonly auditEvidence: {
    apiIdentityCounts: Record<string, number>;
    apiIdentityKinds: Record<string, ProductCenterLedgerEntityKind | 'unknown'>;
    serverIds: Array<number | string>;
    verifiedZero: false;
    objects: CleanupObjectReceipt[];
  }) { super(message); this.name = 'CleanupRegistryFailure'; }
}

export class CleanupRegistry {
  private readonly tasks: CleanupTask[] = [];

  constructor(private readonly ledger?: ProductCenterExecutionLedger) {}

  register(task: CleanupTask): void {
    if (!task.identity.startsWith('AUTO_AUDIT_')) throw new Error(`禁止注册非审计数据：${task.identity}`);
    const normalizedTask: CleanupTask = task.resource && !task.checkpoint
      ? {
          ...task,
          checkpoint: {
            entryId: `api-${task.resource.entityKind}-${String(task.resource.serverId)}`,
            entityKind: task.resource.entityKind,
            serverId: task.resource.serverId,
            identityVariants: task.resource.identityVariants ?? [task.identity],
            cleanupOrder: task.resource.cleanupOrder ?? 0,
            dependencyOf: task.resource.dependencyOf,
          },
        }
      : task;
    if (normalizedTask.checkpoint) {
      this.ledger?.recordCreated({
        entryId: normalizedTask.checkpoint.entryId,
        intentId: normalizedTask.checkpoint.intentId,
        entityKind: normalizedTask.checkpoint.entityKind,
        entity: normalizedTask.entity,
        serverId: normalizedTask.checkpoint.serverId,
        identity: normalizedTask.identity,
        identityVariants: normalizedTask.checkpoint.identityVariants,
        cleanupOrder: normalizedTask.checkpoint.cleanupOrder,
        dependencyOf: normalizedTask.checkpoint.dependencyOf,
      });
    }
    this.tasks.push(normalizedTask);
  }

  addIdentityVariant(entryId: string, identity: string): void {
    const task = this.tasks.find((candidate) => candidate.checkpoint?.entryId === entryId);
    if (!task?.checkpoint) throw new Error(`清理检查点不存在：${entryId}`);
    if (!task.checkpoint.identityVariants.includes(identity)) task.checkpoint.identityVariants.push(identity);
    this.ledger?.addIdentityVariant(entryId, identity);
  }

  async cleanupAll(): Promise<CleanupRegistryEvidence> {
    const failures: string[] = [];
    const failedTasks: CleanupTask[] = [];
    const apiIdentityCounts: Record<string, number> = {};
    const apiIdentityKinds: Record<string, ProductCenterLedgerEntityKind | 'unknown'> = {};
    const serverIds: Array<number | string> = [];
    const objects: CleanupObjectReceipt[] = [];
    const pendingTasks = this.tasks.splice(0);
    const groups = new Map<number, CleanupTask[]>();
    for (const task of pendingTasks) {
      const order = task.checkpoint?.cleanupOrder ?? 0;
      groups.set(order, [...(groups.get(order) ?? []), task]);
    }
    for (const [, tasks] of [...groups.entries()].sort(([left], [right]) => right - left)) {
      const hasSameLayerDependency = tasks.some((task) => (
        task.checkpoint?.dependencyOf !== undefined
        && tasks.some((candidate) => candidate.checkpoint?.entryId === task.checkpoint?.dependencyOf)
      ));
      const outcomes = hasSameLayerDependency
        ? await runSequential(tasks, (task) => this.cleanupTask(task))
        : await Promise.all(tasks.map((task) => this.cleanupTask(task)));
      for (const outcome of outcomes) {
        objects.push(outcome.receipt);
        if (outcome.failure) {
          failures.push(outcome.failure);
          failedTasks.push(outcome.task);
          continue;
        }
        if (outcome.serverId !== undefined) serverIds.push(outcome.serverId);
        for (const identity of outcome.identities) {
          apiIdentityCounts[identity] = 0;
          apiIdentityKinds[identity] = outcome.task.checkpoint?.entityKind ?? 'unknown';
        }
      }
    }
    this.tasks.unshift(...failedTasks.reverse());
    if (failures.length) throw new CleanupRegistryFailure(`清理失败：\n${failures.join('\n')}`, {
      apiIdentityCounts, apiIdentityKinds, serverIds: [...new Set(serverIds)], verifiedZero: false, objects,
    });
    return { apiIdentityCounts, apiIdentityKinds, serverIds: [...new Set(serverIds)], verifiedZero: true, objects };
  }

  private async cleanupTask(task: CleanupTask): Promise<{
    task: CleanupTask;
    failure?: string;
    serverId?: number | string;
    identities: string[];
    receipt: CleanupObjectReceipt;
  }> {
    try {
      if (task.checkpoint) this.ledger?.markPhase(task.checkpoint.entryId, 'cleaning');
      await task.execute();
      const verified = await verifyStableResidue(task.verify);
      if (!verified) {
        const failure = `${task.entity}:${task.identity}:残留验证失败`;
        if (task.checkpoint) this.ledger?.markFailed(task.checkpoint.entryId, {
          classification: 'cleanup-residue',
          message: failure,
        });
        return { task, failure, identities: [], receipt: objectReceipt(task, 'residue', 'cleanup-residue', failure) };
      }
      if (task.checkpoint) {
        this.ledger?.markPhase(task.checkpoint.entryId, 'cleaned');
        this.ledger?.markPhase(task.checkpoint.entryId, 'residue-verified');
      }
      return {
        task,
        serverId: task.checkpoint?.serverId,
        identities: task.checkpoint?.identityVariants ?? [task.identity],
        receipt: objectReceipt(task, 'verified-zero'),
      };
    } catch (error) {
      const alreadyAbsent = await verifyStableResidue(task.verify).catch(() => false);
      if (alreadyAbsent) {
        if (task.checkpoint) {
          this.ledger?.markPhase(task.checkpoint.entryId, 'cleaned');
          this.ledger?.markPhase(task.checkpoint.entryId, 'residue-verified');
        }
        return {
          task,
          serverId: task.checkpoint?.serverId,
          identities: task.checkpoint?.identityVariants ?? [task.identity],
          receipt: objectReceipt(task, 'verified-zero'),
        };
      }
      const diagnostic = `${task.entity}:${task.identity}:${safeError(error)}`;
      if (task.checkpoint) this.ledger?.markFailed(task.checkpoint.entryId, {
        classification: 'cleanup-error',
        message: diagnostic,
      });
      return { task, failure: diagnostic, identities: [], receipt: objectReceipt(task, 'failed', 'cleanup-error', diagnostic) };
    }
  }
}

function objectReceipt(
  task: CleanupTask,
  outcome: CleanupObjectReceipt['outcome'],
  failureCategory?: CleanupObjectReceipt['failureCategory'],
  diagnostic?: string,
): CleanupObjectReceipt {
  return {
    entityType: task.checkpoint?.entityKind ?? 'unknown',
    serverId: task.checkpoint?.serverId,
    businessIdentity: task.identity,
    cleanupOperationKey: task.resource ? `cleanup:${task.resource.entityKind}` : undefined,
    cleanupAttempt: 1,
    apiResidueCount: outcome === 'verified-zero' ? 0 : 1,
    outcome,
    failureCategory,
    diagnostic,
  };
}

async function runSequential<T>(items: readonly CleanupTask[], run: (item: CleanupTask) => Promise<T>): Promise<T[]> {
  const results: T[] = [];
  for (const item of items) results.push(await run(item));
  return results;
}

async function verifyStableResidue(verify: () => Promise<boolean>): Promise<boolean> {
  let consecutiveSuccesses = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await verify()) {
      consecutiveSuccesses += 1;
      if (consecutiveSuccesses >= 2) return true;
    } else {
      consecutiveSuccesses = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}
function safeError(error: unknown): string {
  return String(error)
    .replace(/eyJ[a-z0-9_-]{10,}\.[a-z0-9._-]+/gi, '<redacted-diagnostic>')
    .replace(/bearer\s+[^\s,;]+/gi, '<redacted-diagnostic>')
    .replace(/(authorization|password|set-cookie|cookie|token)\s*[:=]\s*[^,;\s]+/gi, '<redacted-diagnostic>')
    .replace(/authorization|password|set-cookie|cookie|token|bearer/gi, '<redacted-diagnostic>');
}
