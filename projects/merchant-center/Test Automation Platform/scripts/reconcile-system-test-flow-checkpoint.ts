import fs from 'node:fs';
import path from 'node:path';
import { classifyFlowCompletion } from './run-system-test-flow';

type Checkpoint = {
  runId: string | null;
  systemId: string;
  status: string;
  error: string | null;
  updatedAt: string;
  [key: string]: unknown;
};

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

export function reconcileSystemTestFlowCheckpoint(input: {
  checkpointPath: string;
  runReportPath: string;
  evidenceLedgerPath: string;
}): Checkpoint {
  const checkpoint = readJson<Checkpoint>(input.checkpointPath);
  if (!checkpoint.runId) throw new Error('SYSTEM_TEST_CHECKPOINT_RUN_ID_REQUIRED');
  if (!fs.existsSync(input.runReportPath) || !fs.existsSync(input.evidenceLedgerPath)) {
    throw new Error('SYSTEM_TEST_CHECKPOINT_EVIDENCE_REQUIRED');
  }
  const report = readJson<{ exitCode?: number }>(input.runReportPath);
  const completion = classifyFlowCompletion({
    rootDir: path.resolve(input.runReportPath, '../../../../../'),
    systemId: checkpoint.systemId,
    runId: checkpoint.runId,
    exitCode: report.exitCode ?? 1,
  });
  const updated = {
    ...checkpoint,
    status: completion.status,
    error: completion.error,
    updatedAt: new Date().toISOString(),
  };
  const temporaryPath = `${input.checkpointPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, input.checkpointPath);
  return updated;
}

if (require.main === module) {
  const checkpoint = argument('checkpoint');
  const runReport = argument('run-report');
  const evidenceLedger = argument('evidence-ledger');
  if (!checkpoint || !runReport || !evidenceLedger) {
    throw new Error('用法：--checkpoint=... --run-report=... --evidence-ledger=...');
  }
  const result = reconcileSystemTestFlowCheckpoint({
    checkpointPath: path.resolve(checkpoint),
    runReportPath: path.resolve(runReport),
    evidenceLedgerPath: path.resolve(evidenceLedger),
  });
  process.stdout.write(`检查点已对账：${result.status}\n`);
}
