import path from 'node:path';
import type { FullConfig } from '@playwright/test';
import { appConfig } from '../../test-data/env';
import { recoverProductCenterCheckpoints } from '../../scripts/product-center-resume-cleanup';
import { sanitizeGeneratedTestReports } from '../../scripts/sanitize-product-center-timing-reports';
import {
  findIncompleteCheckpointFiles,
  pruneCompletedCheckpoints,
  pruneTimingReports,
  removeAuthState,
  scanGeneratedArtifacts,
} from '../../utils/product-center-run-safety';
import {
  cleanupStaleProductCenterRuntimeLocks,
  findProductCenterRuntimeLocks,
} from '../../utils/product-center-resource-lock';
import { appendProductCenterAuditRunCompleted } from '../../utils/product-center-audit-runtime';

export default async function globalTeardown(config: FullConfig): Promise<void> {
  let runStatus: 'completed' | 'failed' | 'blocked' = 'completed';
  try {
    if (process.env.PC_PRESERVE_AUTH_STATE !== '1') removeAuthState(appConfig.storageStatePath);

  const isolatedContractRun = process.env.PC_CONTRACT_ISOLATED === '1';
  const checkpointRoot = path.resolve(process.env.PC_CHECKPOINT_ROOT || 'output/checkpoints');
  const runtimeLockRoot = path.resolve(process.env.PC_RUNTIME_LOCK_ROOT || 'output/runtime-locks');
  const recovery = await recoverProductCenterCheckpoints(checkpointRoot);
  if (recovery.failed > 0) {
    runStatus = 'failed';
    throw new Error(`商品中心全局清理失败：${recovery.failed}`);
  }

  const incomplete = findIncompleteCheckpointFiles(checkpointRoot);
  if (incomplete.length > 0) {
    runStatus = 'blocked';
    throw new Error(`商品中心仍有未完成检查点：${incomplete.length}`);
  }
  cleanupStaleProductCenterRuntimeLocks(runtimeLockRoot);
  let runtimeLocks = findProductCenterRuntimeLocks(runtimeLockRoot);
  // Playwright worker processes may release their leases just after teardown starts;
  // poll briefly so dead-worker locks are reclaimed deterministically.
  for (let attempt = 0; runtimeLocks.length > 0 && attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    cleanupStaleProductCenterRuntimeLocks(runtimeLockRoot);
    runtimeLocks = findProductCenterRuntimeLocks(runtimeLockRoot);
  }
  if (runtimeLocks.length > 0) {
    runStatus = 'blocked';
    throw new Error(`商品中心仍有运行资源锁：${runtimeLocks.length}`);
  }

  const modifiedAfterMs = resolveRunStartedAt(process.env.PW_RUN_STARTED_AT);
  const reportDirectories = isolatedContractRun ? [] : ['output', 'test-results'];
  if (usesReporter(config, 'allure-playwright')) reportDirectories.push('allure-results');
  reportDirectories.forEach((directory) => {
    sanitizeGeneratedTestReports(path.resolve(directory), { modifiedAfterMs });
  });

  const findings = isolatedContractRun ? [] : scanGeneratedArtifacts('output', { modifiedAfterMs });
  if (findings.length > 0) {
    runStatus = 'failed';
    throw new Error(`生成物包含敏感字段：${findings.map((finding) => finding.file).join(', ')}`);
  }

  pruneCompletedCheckpoints(checkpointRoot);
  pruneTimingReports();
  } finally {
    appendProductCenterAuditRunCompleted(runStatus);
  }
}

function usesReporter(config: FullConfig, reporterName: string): boolean {
  return config.reporter.some(([configuredReporter]) => (
    configuredReporter === reporterName
    || configuredReporter.endsWith(`/${reporterName}`)
    || configuredReporter.endsWith(`\\${reporterName}`)
  ));
}

function resolveRunStartedAt(rawValue: string | undefined): number {
  const value = Number(rawValue);
  return Number.isFinite(value) && value > 0 ? value : Date.now();
}
