export type ApiLifecycleStatus = 'active' | 'deprecated' | 'superseded' | 'blocked-review' | 'not-applicable';

export type ApiLifecycleEntry = {
  operationKey: string;
  status: ApiLifecycleStatus;
  replacementOperationKey?: string;
  automationPolicy?: 'include-in-active-catalog' | 'exclude-from-active-catalog' | 'review-before-execution';
  [key: string]: unknown;
};

export type ApiLifecycleRegistry = {
  schemaVersion: string;
  entries: ApiLifecycleEntry[];
  [key: string]: unknown;
};

export function indexApiLifecycleRegistry(registry: ApiLifecycleRegistry): Map<string, ApiLifecycleEntry> {
  return new Map(registry.entries.map((entry) => [entry.operationKey, entry]));
}

export function filterActiveApiOperations<T extends { operationKey: string }>(
  operations: T[],
  registry: ApiLifecycleRegistry,
): T[] {
  const lifecycle = indexApiLifecycleRegistry(registry);
  return operations.filter((operation) => {
    const entry = lifecycle.get(operation.operationKey);
    return !entry || entry.status === 'active' || entry.automationPolicy === 'include-in-active-catalog';
  });
}

export function assertApiLifecycleRegistryIntegrity<T extends { operationKey: string }>(
  activeOrSourceOperations: T[],
  registry: ApiLifecycleRegistry,
): void {
  if (!Array.isArray(registry.entries)) throw new Error('API 生命周期登记 entries 必须是数组');
  const operationKeys = new Set(activeOrSourceOperations.map((operation) => operation.operationKey));
  const registeredKeys = new Set<string>();
  for (const entry of registry.entries) {
    if (registeredKeys.has(entry.operationKey)) throw new Error(`API 生命周期登记重复：${entry.operationKey}`);
    registeredKeys.add(entry.operationKey);
    if (entry.status === 'deprecated' && !entry.replacementOperationKey) {
      throw new Error(`废弃接口缺少替代接口或明确无替代声明：${entry.operationKey}`);
    }
    if (entry.replacementOperationKey && !operationKeys.has(entry.replacementOperationKey)) {
      throw new Error(`API 生命周期替代接口不在活动目录：${entry.replacementOperationKey}`);
    }
    if (entry.status === 'active' && !operationKeys.has(entry.operationKey)) {
      throw new Error(`活动接口生命周期登记找不到 operation：${entry.operationKey}`);
    }
  }
}
