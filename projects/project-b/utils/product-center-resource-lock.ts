import path from 'node:path';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import { productCenterRecipeResourceClaims } from '../automation/recipe/product-center-gold-run-optimization';
import {
  cleanupStaleSystemTestResourceLeases,
  findSystemTestResourceLeases,
  withSystemTestResourceClaims,
} from '../../../Test Automation Platform/src/automation/system-test/system-test-resource-lock';
import { isInfrastructureOnlyPlaywrightRun } from './playwright-project-scope';

export async function withProductCenterRecipeResourceLocks<T>(
  recipe: AutomationRecipe,
  operation: () => Promise<T>,
  rootDir = path.resolve(process.env.PC_RUNTIME_LOCK_ROOT || 'output/runtime-locks'),
): Promise<T> {
  return withSystemTestResourceClaims(productCenterRecipeResourceClaims(recipe), operation, {
    rootDir,
    timeoutMs: 240_000,
    leaseTtlMs: 5 * 60_000,
    pollIntervalMs: 100,
    ownerScopeId: process.env.SYSTEM_TEST_RUN_ID,
  });
}

export function findProductCenterRuntimeLocks(
  rootDir = path.resolve(process.env.PC_RUNTIME_LOCK_ROOT || 'output/runtime-locks'),
  ownerScopeId?: string,
): string[] {
  const currentScopeId = ownerScopeId ?? process.env.SYSTEM_TEST_RUN_ID;
  if (!currentScopeId && isInfrastructureOnlyPlaywrightRun(process.argv)) return [];
  return findSystemTestResourceLeases(rootDir, currentScopeId);
}

export function cleanupStaleProductCenterRuntimeLocks(
  rootDir = path.resolve(process.env.PC_RUNTIME_LOCK_ROOT || 'output/runtime-locks'),
): string[] {
  return cleanupStaleSystemTestResourceLeases(rootDir);
}
