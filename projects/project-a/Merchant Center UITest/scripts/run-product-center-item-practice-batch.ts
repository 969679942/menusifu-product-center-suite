import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { buildProductCenterItemPracticeArtifacts } from './build-product-center-item-practice-contract';
import { createProductCenterAuthBatchSession } from '../utils/product-center-auth-batch-session';
import {
  readProductCenterItemProgressHistory,
  writeProductCenterItemProgress,
} from '../utils/product-center-item-progress';
import { evaluateProductCenterItemPracticeCircuit } from '../utils/product-center-item-practice-circuit';
import {
  findIncompleteCheckpointFiles,
  scanGeneratedArtifacts,
} from '../utils/product-center-run-safety';

type EvidenceLedger = {
  contractFingerprint: string;
  summary: { selected: number; executed: number; failed: number; evidenceIncomplete: number };
};

type RunReport = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-practice-run';
  runId: string;
  generatedAt: string;
  status: 'passed' | 'blocked' | 'failed' | 'circuit-broken';
  contractFingerprint?: string;
  staticPreflight: 'passed' | 'blocked';
  onlinePreflight: 'not-run' | 'passed' | 'failed';
  circuit?: { code?: string; detail?: string };
  exitCode: number;
  evidenceLedger?: string;
  securityFindings?: number;
  incompleteCheckpoints?: number;
};

const rootDir = path.resolve(__dirname, '..');

export async function runProductCenterItemPracticeBatch(input: {
  caseIds?: readonly string[];
  runId?: string;
} = {}): Promise<number> {
  const runId = input.runId ?? process.env.PC_ITEM_RUN_ID ?? `item-practice-${Date.now()}`;
  const startedAtMs = Date.now();
  const outputRoot = path.join(rootDir, 'output', 'product-center-item-practice', runId);
  const contractPath = path.join(outputRoot, 'contract.json');
  const staticPreflightPath = path.join(outputRoot, 'static-preflight.json');
  const onlinePreflightPath = path.join(outputRoot, 'online-preflight.json');
  const evidencePath = path.join(outputRoot, 'evidence-ledger.json');
  const progressPath = path.join(outputRoot, 'progress.json');
  const progressHistoryPath = path.join(outputRoot, 'progress.jsonl');
  const reportPath = path.join(outputRoot, 'run-report.json');
  fs.mkdirSync(outputRoot, { recursive: true });

  const artifacts = buildProductCenterItemPracticeArtifacts({
    rootDir,
    selectedCaseIds: input.caseIds,
    contractPath,
    preflightPath: staticPreflightPath,
  });
  if (artifacts.preflight.status !== 'passed') {
    writeRunReport(reportPath, {
      schemaVersion: '1.0.0',
      collectionId: 'product-center-item-practice-run',
      runId,
      generatedAt: new Date().toISOString(),
      status: 'blocked',
      contractFingerprint: artifacts.contract.fingerprint,
      staticPreflight: 'blocked',
      onlinePreflight: 'not-run',
      exitCode: 2,
    });
    process.stderr.write(`商品实战静态预检阻断：${staticPreflightPath}\n`);
    return 2;
  }

  const requiredRoutes = [...new Set(artifacts.contract.cases.flatMap((item) => item.requiredRoutes))];
  const session = createProductCenterAuthBatchSession('pc-item-practice-auth-');
  const baseEnv: NodeJS.ProcessEnv = {
    ...session.env({ requiredRoutes }),
    PC_ITEM_RUN_ID: runId,
    PC_ITEM_PRACTICE_CONTRACT: contractPath,
    PC_ITEM_PROGRESS_FILE: progressPath,
    PC_ITEM_PROGRESS_HISTORY_FILE: progressHistoryPath,
    PC_ITEM_PRACTICE_EVIDENCE_OUTPUT: evidencePath,
    PC_ITEM_SELECTED_CASE_IDS: artifacts.contract.cases.map((item) => item.caseId).join(','),
    PC_ITEM_LEAN_REPORTING: '1',
  };
  try {
    writeProductCenterItemProgressWithEnv(baseEnv, { runId, caseId: '__setup__', phase: 'started' });
    const authExit = executePlaywright([
      'test', 'tests/setup/auth.setup.ts', '--project=setup', '--workers=1', '--reporter=line',
    ], baseEnv);
    writeProductCenterItemProgressWithEnv(baseEnv, {
      runId,
      caseId: '__setup__',
      phase: authExit === 0 ? 'completed' : 'failed',
      status: authExit === 0 ? 'passed' : 'failed',
      ...(authExit === 0 ? {} : { failureCategory: 'environment-auth' }),
    });
    if (authExit !== 0) {
      return finish(reportPath, {
        runId,
        status: 'blocked',
        contractFingerprint: artifacts.contract.fingerprint,
        staticPreflight: 'passed',
        onlinePreflight: 'not-run',
        exitCode: authExit,
      });
    }

    writeProductCenterItemProgressWithEnv(baseEnv, { runId, caseId: '__preflight__', phase: 'started' });
    const onlinePreflightExit = executePlaywright([
      'test', 'tests/generated/product-center-item-practice-preflight.spec.ts',
      '--project=chrome', '--workers=1', '--no-deps', '--reporter=line,json',
    ], { ...baseEnv, PLAYWRIGHT_JSON_OUTPUT_NAME: onlinePreflightPath, PC_AUTH_NO_DEPENDENCIES: '1' });
    writeProductCenterItemProgressWithEnv(baseEnv, {
      runId,
      caseId: '__preflight__',
      phase: onlinePreflightExit === 0 ? 'completed' : 'failed',
      status: onlinePreflightExit === 0 ? 'passed' : 'failed',
      ...(onlinePreflightExit === 0 ? {} : { failureCategory: 'environment-data' }),
    });
    if (onlinePreflightExit !== 0) {
      return finish(reportPath, {
        runId,
        status: 'blocked',
        contractFingerprint: artifacts.contract.fingerprint,
        staticPreflight: 'passed',
        onlinePreflight: 'failed',
        exitCode: onlinePreflightExit,
      });
    }

    const execution = await executeBusinessWithCircuit({
      env: { ...baseEnv, PC_AUTH_NO_DEPENDENCIES: '1' },
      progressHistoryPath,
      policy: artifacts.contract.circuitBreaker,
    });
    if (execution.circuit) {
      return finish(reportPath, {
        runId,
        status: 'circuit-broken',
        contractFingerprint: artifacts.contract.fingerprint,
        staticPreflight: 'passed',
        onlinePreflight: 'passed',
        circuit: execution.circuit,
        exitCode: 124,
        evidenceLedger: relative(evidencePath),
      });
    }
    const ledger = readJson<EvidenceLedger>(evidencePath);
    const evidenceValid = ledger
      && ledger.contractFingerprint === artifacts.contract.fingerprint
      && ledger.summary.selected === artifacts.contract.cases.length
      && ledger.summary.executed === artifacts.contract.cases.length
      && ledger.summary.failed === 0
      && ledger.summary.evidenceIncomplete === 0;
    const securityFindings = scanGeneratedArtifacts(outputRoot, { modifiedAfterMs: startedAtMs });
    const incompleteCheckpoints = findIncompleteCheckpointFiles(path.join(rootDir, 'output/checkpoints'), {
      updatedAfterMs: startedAtMs,
    });
    const safetyValid = securityFindings.length === 0 && incompleteCheckpoints.length === 0;
    const exitCode = execution.exitCode === 0 && evidenceValid && safetyValid
      ? 0
      : execution.exitCode || (evidenceValid ? 4 : 3);
    return finish(reportPath, {
      runId,
      status: exitCode === 0 ? 'passed' : 'failed',
      contractFingerprint: artifacts.contract.fingerprint,
      staticPreflight: 'passed',
      onlinePreflight: 'passed',
      exitCode,
      evidenceLedger: relative(evidencePath),
      securityFindings: securityFindings.length,
      incompleteCheckpoints: incompleteCheckpoints.length,
    });
  } finally {
    session.cleanup();
  }
}

async function executeBusinessWithCircuit(input: {
  env: NodeJS.ProcessEnv;
  progressHistoryPath: string;
  policy: ReturnType<typeof buildProductCenterItemPracticeArtifacts>['contract']['circuitBreaker'];
}): Promise<{ exitCode: number; circuit?: { code?: string; detail?: string } }> {
  const startedAtMs = Date.now();
  const child = spawn(process.execPath, [
    require.resolve('@playwright/test/cli'),
    'test', 'tests/generated/product-center-item-216.generated.spec.ts',
    '--project=chrome', '--workers=1', '--no-deps',
    '--reporter=line,./reporters/product-center-item-practice.reporter.ts',
  ], { cwd: rootDir, env: input.env, stdio: 'inherit', shell: false, windowsHide: true });
  return new Promise((resolve, reject) => {
    let circuit: { code?: string; detail?: string } | undefined;
    const timer = setInterval(() => {
      const decision = evaluateProductCenterItemPracticeCircuit({
        events: readProductCenterItemProgressHistory(input.progressHistoryPath),
        policy: input.policy,
        startedAtMs,
      });
      if (!decision.trip || circuit) return;
      circuit = { code: decision.code, detail: decision.detail };
      process.stderr.write(`[item-practice] circuit=${decision.code} detail=${decision.detail ?? ''}\n`);
      terminateProcessTree(child);
    }, input.policy.pollMs);
    child.once('error', (error) => {
      clearInterval(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearInterval(timer);
      resolve({ exitCode: circuit ? 124 : code ?? 1, ...(circuit ? { circuit } : {}) });
    });
  });
}

function executePlaywright(args: readonly string[], env: NodeJS.ProcessEnv): number {
  return spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), ...args], {
    cwd: rootDir,
    env,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  }).status ?? 1;
}

function terminateProcessTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    return;
  }
  child.kill('SIGTERM');
}

function writeProductCenterItemProgressWithEnv(
  env: NodeJS.ProcessEnv,
  value: Parameters<typeof writeProductCenterItemProgress>[0],
): void {
  const previousProgress = process.env.PC_ITEM_PROGRESS_FILE;
  const previousHistory = process.env.PC_ITEM_PROGRESS_HISTORY_FILE;
  process.env.PC_ITEM_PROGRESS_FILE = env.PC_ITEM_PROGRESS_FILE;
  process.env.PC_ITEM_PROGRESS_HISTORY_FILE = env.PC_ITEM_PROGRESS_HISTORY_FILE;
  try {
    writeProductCenterItemProgress(value);
  } finally {
    restoreEnv('PC_ITEM_PROGRESS_FILE', previousProgress);
    restoreEnv('PC_ITEM_PROGRESS_HISTORY_FILE', previousHistory);
  }
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function finish(reportPath: string, input: Omit<RunReport, 'schemaVersion' | 'collectionId' | 'generatedAt'>): number {
  writeRunReport(reportPath, {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-practice-run',
    generatedAt: new Date().toISOString(),
    ...input,
  });
  process.stdout.write(`商品实战运行报告：${reportPath}\n`);
  return input.exitCode;
}

function writeRunReport(filePath: string, report: RunReport): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function readJson<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function relative(filePath: string): string {
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/');
}

function parseCaseIds(): string[] {
  const value = process.argv.find((argument) => argument.startsWith('--case-ids='))?.slice('--case-ids='.length);
  return value?.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean) ?? [];
}

if (require.main === module) {
  runProductCenterItemPracticeBatch({ caseIds: parseCaseIds() })
    .then((exitCode) => { process.exitCode = exitCode; })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
