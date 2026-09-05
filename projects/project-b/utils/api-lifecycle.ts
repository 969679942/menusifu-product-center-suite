import fs from 'node:fs';
import path from 'node:path';
import {
  assertApiLifecycleRegistryIntegrity,
  filterActiveApiOperations as filterPlatformActiveApiOperations,
  indexApiLifecycleRegistry,
  type ApiLifecycleEntry,
  type ApiLifecycleRegistry,
} from '../../../Test Automation Platform/src/governance/api-lifecycle';

export type { ApiLifecycleEntry, ApiLifecycleRegistry, ApiLifecycleStatus } from '../../../Test Automation Platform/src/governance/api-lifecycle';

const registryPath = path.resolve(process.cwd(), '..', 'Merchant Center API/api-lifecycle-registry.json');

export function readApiLifecycleRegistry(): ApiLifecycleRegistry {
  return JSON.parse(fs.readFileSync(registryPath, 'utf8')) as ApiLifecycleRegistry;
}

export function readApiLifecycleByOperationKey(): Map<string, ApiLifecycleEntry> {
  return indexApiLifecycleRegistry(readApiLifecycleRegistry());
}

export function filterActiveApiOperations<T extends { operationKey: string }>(operations: T[]): T[] {
  return filterPlatformActiveApiOperations(operations, readApiLifecycleRegistry());
}

export function assertLifecycleRegistryIntegrity<T extends { operationKey: string }>(operations: T[]): void {
  assertApiLifecycleRegistryIntegrity(operations, readApiLifecycleRegistry());
}
