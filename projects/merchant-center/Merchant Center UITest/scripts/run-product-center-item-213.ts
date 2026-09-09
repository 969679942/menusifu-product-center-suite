import { spawnSync } from 'node:child_process';
import { createProductCenterAuthBatchSession } from '../utils/product-center-auth-batch-session';
import { writeProductCenterItemProgress } from '../utils/product-center-item-progress';
import {
  assertProductCenterRemediationRound,
  productCenterRemediationPolicy,
  resolveProductCenterItemWorkerCap,
  resolveProductCenterRemediationWorkers,
} from '../utils/product-center-remediation-policy';
import { assertSystemTestExecutionGrant } from '../automation/system-test/system-test-execution-grant';
import fs from 'node:fs';

const itemSpecPath = 'tests/generated/product-center-item-216.generated.spec.ts';
const requiredRoutes = [
  '/pp/brand/list',
  '/pp/brand/create/standard',
  '/pp/brand/create/combo',
] as const;

export type ProductCenterItem213RunOptions = {
  rootDir?: string;
  shardCount?: number;
  caseIds?: readonly string[];
  workerCount?: number;
  round?: number;
  execute?: (rootDir: string, args: readonly string[], env: NodeJS.ProcessEnv) => number;
};

export function runProductCenterItem213(
  options: ProductCenterItem213RunOptions = {},
): number {
  const rootDir = options.rootDir ?? process.cwd();
  const shardCount = options.shardCount ?? positiveInteger(process.env.PC_ITEM_SHARDS, 1);
  const caseIds = options.caseIds ?? parseCsv(process.env.PC_ITEM_SELECTED_CASE_IDS);
  const workerCap = resolveProductCenterItemWorkerCap(caseIds);
  const requestedWorkers = options.workerCount ?? optionalPositiveInteger(process.env.PC_ITEM_WORKERS);
  const workerCount = resolveProductCenterRemediationWorkers(
    caseIds.length,
    Math.min(requestedWorkers ?? workerCap, workerCap),
  );
  const round = options.round ?? positiveInteger(process.env.PC_REMEDIATION_ROUND, 1);
  const runId = process.env.PC_ITEM_RUN_ID ?? `item-${Date.now()}`;
  assertProductCenterRemediationRound(round);
  if (!options.execute) {
    if (caseIds.length === 0) throw new Error('GOVERNED_EXECUTION_CASE_IDS_REQUIRED:item');
    for (const caseId of caseIds) {
      assertSystemTestExecutionGrant({
        rootDir,
        applicationId: 'merchant-center-product-center',
        caseId,
      });
    }
  }
  const sharedAuthStatePath = process.env.MC_STORAGE_STATE_PATH;
  const reuseBatchAuth = process.env.PC_BATCH_AUTH_VERIFIED === '1'
    && Boolean(sharedAuthStatePath)
    && fs.existsSync(sharedAuthStatePath as string);
  const session = reuseBatchAuth ? undefined : createProductCenterAuthBatchSession('pc-item-213-auth-');
  const execute = options.execute ?? executePlaywright;
  let exitCode = 0;

  try {
    const baseEnv = session?.env({ requiredRoutes }) ?? {
      ...process.env,
      MC_STORAGE_STATE_PATH: sharedAuthStatePath as string,
      PC_PRESERVE_AUTH_STATE: '1',
      PC_AUTH_REQUIRED_ROUTES: requiredRoutes.join(','),
      PC_BATCH_AUTH_VERIFIED: '1',
      PC_BATCH_AUTH_ONCE: '1',
      PC_AUTH_NO_DEPENDENCIES: '1',
    };
    const authEnv = { ...baseEnv };
    authEnv.PC_ITEM_LEAN_REPORTING = '1';
    delete authEnv.ALLURE_RESULTS_DIR;
    delete authEnv.PC_SOURCE_GOVERNED_ALLURE_DIR;
    let authResult = 0;
    if (reuseBatchAuth) {
      writeProductCenterItemProgress({ runId, caseId: '__setup__', phase: 'completed', status: 'reused' });
    } else {
      writeProductCenterItemProgress({ runId, caseId: '__setup__', phase: 'started' });
      authResult = execute(rootDir, [
        require.resolve('@playwright/test/cli'),
        'test',
        'tests/setup/auth.setup.ts',
        '--project=setup',
        '--workers=1',
        '--reporter=line',
      ], authEnv);
      writeProductCenterItemProgress({
        runId,
        caseId: '__setup__',
        phase: authResult === 0 ? 'completed' : 'failed',
        status: authResult === 0 ? 'passed' : 'failed',
      });
      if (authResult !== 0) return authResult;
    }

    for (let shardIndex = 1; shardIndex <= shardCount; shardIndex += 1) {
      const args = [
        require.resolve('@playwright/test/cli'),
        'test',
        itemSpecPath,
        '--project=chrome',
        `--workers=${workerCount}`,
        ...(shardCount > 1 ? [`--shard=${shardIndex}/${shardCount}`] : []),
        // Cross-type duplicate coverage provisions four independent records
        // and performs two edit/readback cycles. Give that bounded flow a
        // 3-minute case budget so a slow page-query response is not reported
        // as a product result before its evidence can be collected.
        ...(caseIds.includes('TC-ITEM-PKG-079') ? ['--timeout=180000'] : []),
         '--no-deps',
      ];
      const result = execute(rootDir, args, {
        ...(session?.env({ noDependencies: true, requiredRoutes }) ?? baseEnv),
         ...(process.env.PC_SOURCE_GOVERNED_ALLURE_DIR ? { PC_ITEM_LEAN_REPORTING: '0' } : { PC_ITEM_LEAN_REPORTING: '1' }),
        PC_ITEM_RUN_ID: runId,
        PC_REMEDIATION_POLICY_VERSION: productCenterRemediationPolicy.schemaVersion,
        PC_REMEDIATION_ROUND: String(round),
        PC_REMEDIATION_MAX_ROUNDS: String(productCenterRemediationPolicy.maxRounds),
        PC_RECIPE_RUN_SCOPE: caseIds.length > 0 ? 'impacted' : 'full',
        PC_ITEM_SELECTED_CASE_IDS: caseIds.join(','),
        PC_ITEM_SHARD_INDEX: String(shardIndex),
        PC_ITEM_SHARD_COUNT: String(shardCount),
      });
      if (result !== 0) exitCode = result;
    }
  } finally {
    session?.cleanup();
  }
  return exitCode;
}

function executePlaywright(rootDir: string, args: readonly string[], env: NodeJS.ProcessEnv): number {
  const result = spawnSync(process.execPath, args, {
    cwd: rootDir,
    env,
    stdio: 'inherit',
    shell: false,
  });
  return result.status ?? 1;
}

function parseCsv(value: string | undefined): string[] {
  return value?.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean) ?? [];
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function optionalPositiveInteger(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

if (require.main === module) {
  const caseIds = process.argv.find((arg) => arg.startsWith('--case-ids='))
    ?.slice('--case-ids='.length);
  const shards = process.argv.find((arg) => arg.startsWith('--shards='))
    ?.slice('--shards='.length);
  const round = process.argv.find((arg) => arg.startsWith('--round='))
    ?.slice('--round='.length);
  const workers = process.argv.find((arg) => arg.startsWith('--workers='))
    ?.slice('--workers='.length);
  process.exitCode = runProductCenterItem213({
    caseIds: caseIds === undefined ? undefined : parseCsv(caseIds),
    shardCount: positiveInteger(shards, positiveInteger(process.env.PC_ITEM_SHARDS, 1)),
    workerCount: optionalPositiveInteger(workers),
    round: positiveInteger(round, positiveInteger(process.env.PC_REMEDIATION_ROUND, 1)),
  });
}
