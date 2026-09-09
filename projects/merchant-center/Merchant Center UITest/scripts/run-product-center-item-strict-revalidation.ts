import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ProductCenterItemStrictBatchPlan } from './build-product-center-item-strict-batch-plan';

type BatchState = ProductCenterItemStrictBatchPlan['batches'][number] & {
  status: 'pending' | 'running' | 'passed' | 'failed';
  runId?: string;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number;
};

type Scheduler = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-strict-revalidation-scheduler';
  runId: string;
  status: 'running' | 'passed' | 'completed-with-findings' | 'failed';
  generatedAt: string;
  updatedAt: string;
  sourcePlan: string;
  totalCases: number;
  completedCases: number;
  batches: BatchState[];
};

const rootDir = path.resolve(__dirname, '..');

export async function runProductCenterItemStrictRevalidation(input: {
  planPath?: string;
  runId?: string;
  maxBatches?: number;
} = {}): Promise<number> {
  const planPath = path.resolve(input.planPath ?? path.join(rootDir, '..', 'deliverables/product-center-item/strict-batch-plan.json'));
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8')) as ProductCenterItemStrictBatchPlan;
  const runId = input.runId ?? process.env.PC_ITEM_STRICT_RUN_ID ?? `item-strict-${Date.now()}`;
  const schedulerPath = path.resolve(rootDir, '..', 'deliverables/product-center-item', `${runId}-scheduler.json`);
  const maxBatches = input.maxBatches ?? parseMaxBatches();
  if (!Number.isInteger(maxBatches) || maxBatches < 1) throw new Error('maxBatches 必须是正整数');
  const selectedBatches = plan.batches.slice(0, maxBatches);
  const batches: BatchState[] = selectedBatches.map((batch) => ({ ...batch, status: 'pending' }));
  const scheduler: Scheduler = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-strict-revalidation-scheduler',
    runId,
    status: 'running',
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourcePlan: path.relative(rootDir, planPath).replaceAll(path.sep, '/'),
    totalCases: batches.reduce((sum, batch) => sum + batch.caseIds.length, 0),
    completedCases: 0,
    batches,
  };
  let hasFindings = false;
  writeScheduler(schedulerPath, scheduler);
  for (const batch of batches) {
    batch.status = 'running';
    batch.runId = `${runId}-${batch.batchId}`;
    batch.startedAt = new Date().toISOString();
    writeScheduler(schedulerPath, scheduler);
    process.stdout.write(`[strict-revalidation] 开始 ${batch.batchId}，${batch.caseIds.length} 条\n`);
    const exitCode = await runBatch(plan, batch);
    batch.exitCode = exitCode;
    batch.completedAt = new Date().toISOString();
    batch.status = exitCode === 0 ? 'passed' : 'failed';
    if (exitCode !== 0) {
      const report = readBatchRunReport(batch.runId);
      if (!report || report.status === 'blocked' || report.status === 'circuit-broken') {
        scheduler.status = 'failed';
        writeScheduler(schedulerPath, scheduler);
        process.stderr.write(`[strict-revalidation] ${batch.batchId} 无法安全完成，已停止后续批次，状态 ${report?.status ?? 'missing-report'}，退出码 ${exitCode}\n`);
        return exitCode;
      }
      hasFindings = true;
      scheduler.completedCases += readExecutedCaseCount(batch.runId, batch.caseIds.length);
      writeScheduler(schedulerPath, scheduler);
      process.stderr.write(`[strict-revalidation] ${batch.batchId} 有发现但已完成独立执行，继续后续批次，退出码 ${exitCode}\n`);
      continue;
    }
    scheduler.completedCases += batch.caseIds.length;
    writeScheduler(schedulerPath, scheduler);
    process.stdout.write(`[strict-revalidation] 完成 ${batch.batchId}，累计 ${scheduler.completedCases}/${scheduler.totalCases}\n`);
  }
  scheduler.status = hasFindings ? 'completed-with-findings' : 'passed';
  writeScheduler(schedulerPath, scheduler);
  process.stdout.write(`商品严格重验证调度完成：${schedulerPath}\n`);
  return hasFindings ? 1 : 0;
}

function parseMaxBatches(): number | undefined {
  const value = process.argv.find((argument) => argument.startsWith('--max-batches='))?.slice('--max-batches='.length);
  return value ? Number(value) : undefined;
}

function runBatch(plan: ProductCenterItemStrictBatchPlan, batch: BatchState): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      require.resolve('tsx/cli'),
      'scripts/run-product-center-item-practice-batch.ts',
      `--case-ids=${batch.caseIds.join(',')}`,
    ], {
      cwd: rootDir,
      env: {
        ...process.env,
        PC_ITEM_RUN_ID: batch.runId,
        PC_ITEM_PRACTICE_MANIFEST: path.relative(rootDir, path.resolve(rootDir, plan.manifestPath)),
      },
      stdio: 'inherit',
      windowsHide: true,
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
}

function writeScheduler(filePath: string, scheduler: Scheduler): void {
  scheduler.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(scheduler, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function readBatchRunReport(runId: string): { status?: string } | undefined {
  const reportPath = path.join(rootDir, 'output', 'product-center-item-practice', runId, 'run-report.json');
  if (!fs.existsSync(reportPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(reportPath, 'utf8')) as { status?: string };
  } catch {
    return undefined;
  }
}

function readExecutedCaseCount(runId: string, fallback: number): number {
  const ledgerPath = path.join(rootDir, 'output', 'product-center-item-practice', runId, 'evidence-ledger.json');
  if (!fs.existsSync(ledgerPath)) return 0;
  try {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) as { summary?: { executed?: number } };
    const executed = ledger.summary?.executed;
    return Number.isInteger(executed) && executed >= 0 && executed <= fallback ? executed : 0;
  } catch {
    return 0;
  }
}

if (require.main === module) {
  runProductCenterItemStrictRevalidation()
    .then((exitCode) => { process.exitCode = exitCode; })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
