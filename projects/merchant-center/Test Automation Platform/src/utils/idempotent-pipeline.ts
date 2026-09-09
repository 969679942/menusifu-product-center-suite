import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type IdempotentPipelineStage = {
  id: string;
  command: string[];
  inputs: string[] | (() => string[]);
  outputs: string[];
  enabled?: boolean;
  env?: NodeJS.ProcessEnv | (() => NodeJS.ProcessEnv);
};

export type PipelineCheckpoint = {
  schemaVersion: '1.0.0';
  pipelineId: string;
  stages: Record<string, {
    inputFingerprint: string;
    status: 'running' | 'completed' | 'failed';
    startedAt: string;
    completedAt?: string;
    /** Wall-clock duration of the most recent attempt, in milliseconds. */
    durationMs?: number;
    exitCode?: number;
  }>;
};

export function resolvePipelineStageInputs(stage: Pick<IdempotentPipelineStage, 'inputs'>): string[] {
  return typeof stage.inputs === 'function' ? stage.inputs() : stage.inputs;
}

export function runIdempotentPipeline(options: {
  pipelineId: string;
  rootDir: string;
  checkpointPath: string;
  stages: readonly IdempotentPipelineStage[];
}): number {
  const checkpoint = readCheckpoint(options.pipelineId, options.checkpointPath);
  const activeStageIds = new Set(options.stages.filter((item) => item.enabled !== false).map((item) => item.id));
  const staleStageIds = Object.keys(checkpoint.stages).filter((stageId) => !activeStageIds.has(stageId));
  if (staleStageIds.length > 0) {
    for (const stageId of staleStageIds) delete checkpoint.stages[stageId];
    writeCheckpoint(options.checkpointPath, checkpoint);
  }
  for (const stage of options.stages.filter((item) => item.enabled !== false)) {
    const configuredInputs = resolvePipelineStageInputs(stage);
    const commandSourceInputs = stage.command.filter((argument) => (
      !path.isAbsolute(argument) && fs.existsSync(path.resolve(options.rootDir, argument))
    ));
    const inputFingerprint = fingerprintPaths(options.rootDir, [...configuredInputs, ...commandSourceInputs]);
    const previous = checkpoint.stages[stage.id];
    const outputsExist = stage.outputs.every((outputPath) => fs.existsSync(path.resolve(options.rootDir, outputPath)));
    if (previous?.status === 'completed' && previous.inputFingerprint === inputFingerprint && outputsExist) continue;

    const stageStartedAt = Date.now();
    checkpoint.stages[stage.id] = {
      inputFingerprint,
      status: 'running',
      startedAt: new Date(stageStartedAt).toISOString(),
      durationMs: 0,
    };
    writeCheckpoint(options.checkpointPath, checkpoint);
    const result = spawnSync(stage.command[0], stage.command.slice(1), {
      cwd: options.rootDir,
      env: { ...process.env, ...(typeof stage.env === 'function' ? stage.env() : stage.env) },
      stdio: 'inherit',
      shell: false,
    });
    const exitCode = result.status ?? 1;
    checkpoint.stages[stage.id] = {
      ...checkpoint.stages[stage.id],
      status: exitCode === 0 ? 'completed' : 'failed',
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - stageStartedAt,
      exitCode,
    };
    writeCheckpoint(options.checkpointPath, checkpoint);
    if (exitCode !== 0) return exitCode;
  }
  return 0;
}

export function fingerprintPaths(rootDir: string, inputPaths: readonly string[]): string {
  const hash = createHash('sha256');
  const files = inputPaths.flatMap((inputPath) => listFiles(path.resolve(rootDir, inputPath))).sort();
  for (const filePath of files) {
    hash.update(path.relative(rootDir, filePath).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(fs.existsSync(filePath) ? fs.readFileSync(filePath) : 'MISSING');
    hash.update('\0');
  }
  return hash.digest('hex');
}

function listFiles(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [`${filePath}.missing`];
  const stat = fs.statSync(filePath);
  if (stat.isFile()) return [filePath];
  return fs.readdirSync(filePath, { withFileTypes: true }).flatMap((entry) => (
    listFiles(path.join(filePath, entry.name))
  ));
}

function readCheckpoint(pipelineId: string, checkpointPath: string): PipelineCheckpoint {
  if (!fs.existsSync(checkpointPath)) return { schemaVersion: '1.0.0', pipelineId, stages: {} };
  const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as PipelineCheckpoint;
  if (checkpoint.pipelineId !== pipelineId) throw new Error(`流水线检查点不匹配：${checkpoint.pipelineId}`);
  return checkpoint;
}

function writeCheckpoint(filePath: string, checkpoint: PipelineCheckpoint): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
