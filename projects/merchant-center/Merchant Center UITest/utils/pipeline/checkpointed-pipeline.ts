import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { redactAcceptanceDiagnostic } from '../acceptance/redaction';

export type PipelineRetryMode = 'idempotent' | 'state-verification-required';

export type CheckpointedPipelineStageResult = {
  success: boolean;
  transient?: boolean;
  diagnostic?: string;
};

export type CheckpointedPipelineStage = {
  id: string;
  retryMode: PipelineRetryMode;
  execute: () => Promise<CheckpointedPipelineStageResult>;
};

type PipelineStageState = 'pending' | 'running' | 'retrying' | 'passed' | 'failed';

export type CheckpointedPipelineStageSnapshot = {
  id: string;
  retryMode: PipelineRetryMode;
  state: PipelineStageState;
  attempts: number;
  durationMs: number;
  retries: Array<{ attempt: number; delayMs: number; diagnostic: string }>;
  transient?: boolean;
  diagnostic?: string;
  requiresStateVerification?: boolean;
  stateVerificationAcknowledgedAt?: string;
  updatedAt: string;
};

export type CheckpointedPipelineReport = {
  schemaVersion: '1.0.0';
  pipelineId: string;
  planFingerprint: string;
  runId: string;
  status: 'running' | 'passed' | 'failed';
  failedStage: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  stages: CheckpointedPipelineStageSnapshot[];
};

type RunCheckpointedPipelineInput = {
  pipelineId: string;
  planFingerprint: string;
  checkpointPath: string;
  stages: readonly CheckpointedPipelineStage[];
  resume?: boolean;
  stateVerifiedStageIds?: readonly string[];
  retryDelaysMs?: readonly number[];
  sleep?: (delayMs: number) => Promise<void>;
  onRunStart?: (report: Readonly<CheckpointedPipelineReport>) => void;
};

const defaultRetryDelaysMs = [5_000, 15_000, 30_000, 60_000] as const;

export function fingerprintPipelinePlan(
  pipelineId: string,
  stages: readonly Pick<CheckpointedPipelineStage, 'id' | 'retryMode'>[],
): string {
  return createHash('sha256').update(JSON.stringify({
    pipelineId,
    stages: stages.map((stage) => ({ id: stage.id, retryMode: stage.retryMode })),
  })).digest('hex');
}

export async function runCheckpointedPipeline(
  input: RunCheckpointedPipelineInput,
): Promise<CheckpointedPipelineReport> {
  assertStageDefinitions(input.stages);
  const retryDelaysMs = input.retryDelaysMs ?? defaultRetryDelaysMs;
  const sleep = input.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  const persisted = input.resume ? readCheckpoint(input.checkpointPath) : undefined;
  if (persisted && (
    persisted.pipelineId !== input.pipelineId
    || persisted.planFingerprint !== input.planFingerprint
  )) {
    throw new Error('流水线计划已变化，禁止复用旧检查点');
  }

  const report = persisted
    ? prepareForResume(persisted, input.stages, input.stateVerifiedStageIds ?? [])
    : createReport(input.pipelineId, input.planFingerprint, input.stages);
  const persist = () => {
    report.updatedAt = new Date().toISOString();
    writeJsonAtomic(input.checkpointPath, report);
  };
  persist();
  input.onRunStart?.(report);

  for (const definition of input.stages) {
    const stage = requireStage(report, definition.id);
    if (stage.state === 'passed') continue;

    while (true) {
      const startedAt = Date.now();
      stage.state = 'running';
      stage.attempts += 1;
      stage.diagnostic = undefined;
      stage.requiresStateVerification = undefined;
      stage.updatedAt = new Date().toISOString();
      persist();

      const result = await executeStage(definition);
      stage.durationMs += Date.now() - startedAt;
      if (result.success) {
        stage.state = 'passed';
        stage.transient = undefined;
        stage.diagnostic = undefined;
        stage.updatedAt = new Date().toISOString();
        persist();
        break;
      }

      const diagnostic = redactDiagnostic(result.diagnostic ?? '阶段执行失败');
      const retryIndex = stage.retries.length;
      if (
        result.transient === true
        && definition.retryMode === 'idempotent'
        && retryIndex < retryDelaysMs.length
      ) {
        const delayMs = retryDelaysMs[retryIndex];
        stage.state = 'retrying';
        stage.transient = true;
        stage.retries.push({ attempt: stage.attempts, delayMs, diagnostic });
        stage.updatedAt = new Date().toISOString();
        persist();
        await sleep(delayMs);
        continue;
      }

      stage.state = 'failed';
      stage.transient = result.transient === true;
      stage.diagnostic = diagnostic;
      stage.requiresStateVerification = definition.retryMode === 'state-verification-required';
      stage.updatedAt = new Date().toISOString();
      report.status = 'failed';
      report.failedStage = stage.id;
      report.finishedAt = new Date().toISOString();
      persist();
      return report;
    }
  }

  report.status = 'passed';
  report.failedStage = null;
  report.finishedAt = new Date().toISOString();
  persist();
  return report;
}

function createReport(
  pipelineId: string,
  planFingerprint: string,
  stages: readonly CheckpointedPipelineStage[],
): CheckpointedPipelineReport {
  const now = new Date().toISOString();
  return {
    schemaVersion: '1.0.0',
    pipelineId,
    planFingerprint,
    runId: randomUUID(),
    status: 'running',
    failedStage: null,
    startedAt: now,
    updatedAt: now,
    stages: stages.map((stage) => ({
      id: stage.id,
      retryMode: stage.retryMode,
      state: 'pending',
      attempts: 0,
      durationMs: 0,
      retries: [],
      updatedAt: now,
    })),
  };
}

function prepareForResume(
  report: CheckpointedPipelineReport,
  definitions: readonly CheckpointedPipelineStage[],
  stateVerifiedStageIds: readonly string[],
): CheckpointedPipelineReport {
  const expected = definitions.map((stage) => stage.id);
  const actual = report.stages.map((stage) => stage.id);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error('流水线阶段已变化，禁止复用旧检查点');
  }
  report.status = 'running';
  report.failedStage = null;
  report.finishedAt = undefined;
  const acknowledged = new Set(stateVerifiedStageIds);
  for (const stageId of acknowledged) {
    const definition = definitions.find((stage) => stage.id === stageId);
    if (!definition || definition.retryMode !== 'state-verification-required') {
      throw new Error(`状态核验确认引用非 UI 阶段：${stageId}`);
    }
  }
  for (const stage of report.stages) {
    if (stage.state === 'passed') continue;
    if (stage.requiresStateVerification) {
      if (!acknowledged.has(stage.id)) {
        throw new Error(`UI 阶段恢复前必须完成状态核验：${stage.id}`);
      }
      stage.stateVerificationAcknowledgedAt = new Date().toISOString();
      stage.requiresStateVerification = false;
    }
    stage.state = 'pending';
  }
  return report;
}

async function executeStage(
  stage: CheckpointedPipelineStage,
): Promise<CheckpointedPipelineStageResult> {
  try {
    return await stage.execute();
  } catch (error) {
    return { success: false, diagnostic: String(error) };
  }
}

function assertStageDefinitions(stages: readonly CheckpointedPipelineStage[]): void {
  if (stages.length === 0) throw new Error('流水线至少需要一个阶段');
  const ids = new Set<string>();
  for (const stage of stages) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(stage.id)) throw new Error(`流水线阶段 ID 无效：${stage.id}`);
    if (ids.has(stage.id)) throw new Error(`流水线阶段重复：${stage.id}`);
    ids.add(stage.id);
  }
}

function requireStage(
  report: CheckpointedPipelineReport,
  id: string,
): CheckpointedPipelineStageSnapshot {
  const stage = report.stages.find((candidate) => candidate.id === id);
  if (!stage) throw new Error(`流水线检查点缺少阶段：${id}`);
  return stage;
}

function redactDiagnostic(value: string): string {
  return redactAcceptanceDiagnostic(value).slice(-2_000);
}

function readCheckpoint(filePath: string): CheckpointedPipelineReport | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as CheckpointedPipelineReport;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
