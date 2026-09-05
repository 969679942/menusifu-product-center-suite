import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  fingerprintPipelinePlan,
  runCheckpointedPipeline,
  type CheckpointedPipelineStage,
} from '../../utils/pipeline/checkpointed-pipeline';

function checkpointPath(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'checkpointed-pipeline-')), 'checkpoint.json');
}

test.describe('阶段级可恢复流水线', () => {
  test('失败后显式恢复应跳过已通过阶段并从首个未完成阶段继续', async () => {
    const filePath = checkpointPath();
    let firstRuns = 0;
    let secondRuns = 0;
    const firstExecution: CheckpointedPipelineStage[] = [
      stage('source-gate', async () => {
        firstRuns += 1;
        return { success: true };
      }),
      stage('runtime-gate', async () => {
        secondRuns += 1;
        return { success: false, diagnostic: 'contract mismatch' };
      }),
    ];
    const planFingerprint = fingerprintPipelinePlan('product-center-quality', firstExecution);

    const failed = await runCheckpointedPipeline({
      pipelineId: 'product-center-quality',
      planFingerprint,
      checkpointPath: filePath,
      stages: firstExecution,
    });
    expect(failed.status).toBe('failed');

    const resumed = await runCheckpointedPipeline({
      pipelineId: 'product-center-quality',
      planFingerprint,
      checkpointPath: filePath,
      resume: true,
      stages: [
        stage('source-gate', async () => {
          firstRuns += 1;
          return { success: true };
        }),
        stage('runtime-gate', async () => {
          secondRuns += 1;
          return { success: true };
        }),
      ],
    });

    expect(resumed.status).toBe('passed');
    expect(firstRuns).toBe(1);
    expect(secondRuns).toBe(2);
    expect(resumed.stages.map((item) => [item.id, item.state])).toEqual([
      ['source-gate', 'passed'],
      ['runtime-gate', 'passed'],
    ]);
    expect(resumed.stages.every((item) => typeof item.durationMs === 'number' && item.durationMs >= 0)).toBe(true);
  });

  test('幂等阶段的 transient failure 应按有界延迟自动重试并保存恢复证据', async () => {
    const delays: number[] = [];
    let attempts = 0;
    const stages = [stage('contract-tests', async () => {
      attempts += 1;
      return attempts < 3
        ? { success: false, transient: true, diagnostic: 'HTTP 429 Too Many Requests token=secret-token' }
        : { success: true };
    })];

    const report = await runCheckpointedPipeline({
      pipelineId: 'product-center-quality',
      planFingerprint: fingerprintPipelinePlan('product-center-quality', stages),
      checkpointPath: checkpointPath(),
      stages,
      retryDelaysMs: [5_000, 15_000],
      sleep: async (delayMs) => { delays.push(delayMs); },
    });

    expect(report.status).toBe('passed');
    expect(report.stages[0]).toMatchObject({ state: 'passed', attempts: 3 });
    expect(report.stages[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(report.stages[0].retries.map((item) => item.delayMs)).toEqual([5_000, 15_000]);
    expect(JSON.stringify(report)).not.toContain('secret-token');
    expect(delays).toEqual([5_000, 15_000]);
  });

  test('真实 UI 阶段即使 transient 也不得盲目重放', async () => {
    const filePath = checkpointPath();
    let attempts = 0;
    const stages = [stage('main-ui', async () => {
      attempts += 1;
      return { success: false, transient: true, diagnostic: 'connection reset' };
    }, 'state-verification-required')];

    const report = await runCheckpointedPipeline({
      pipelineId: 'product-center-quality',
      planFingerprint: fingerprintPipelinePlan('product-center-quality', stages),
      checkpointPath: filePath,
      stages,
      retryDelaysMs: [5_000, 15_000],
      sleep: async () => undefined,
    });

    expect(attempts).toBe(1);
    expect(report.status).toBe('failed');
    expect(report.stages[0]).toMatchObject({
      state: 'failed',
      requiresStateVerification: true,
    });

    await expect(runCheckpointedPipeline({
      pipelineId: 'product-center-quality',
      planFingerprint: fingerprintPipelinePlan('product-center-quality', stages),
      checkpointPath: filePath,
      resume: true,
      stages,
      sleep: async () => undefined,
    })).rejects.toThrow('UI 阶段恢复前必须完成状态核验：main-ui');

    const resumed = await runCheckpointedPipeline({
      pipelineId: 'product-center-quality',
      planFingerprint: fingerprintPipelinePlan('product-center-quality', stages),
      checkpointPath: filePath,
      resume: true,
      stateVerifiedStageIds: ['main-ui'],
      stages: [stage('main-ui', async () => ({ success: true }), 'state-verification-required')],
      sleep: async () => undefined,
    });
    expect(resumed.status).toBe('passed');
    expect(resumed.stages[0].stateVerificationAcknowledgedAt).toBeTruthy();
  });

  test('恢复时计划指纹变化必须拒绝复用旧检查点', async () => {
    const filePath = checkpointPath();
    const stages = [stage('contracts', async () => ({ success: true }))];
    await runCheckpointedPipeline({
      pipelineId: 'product-center-quality',
      planFingerprint: fingerprintPipelinePlan('product-center-quality', stages),
      checkpointPath: filePath,
      stages,
    });

    await expect(runCheckpointedPipeline({
      pipelineId: 'product-center-quality',
      planFingerprint: 'changed-plan',
      checkpointPath: filePath,
      resume: true,
      stages,
    })).rejects.toThrow('流水线计划已变化，禁止复用旧检查点');
  });
});

function stage(
  id: string,
  execute: CheckpointedPipelineStage['execute'],
  retryMode: CheckpointedPipelineStage['retryMode'] = 'idempotent',
): CheckpointedPipelineStage {
  return { id, retryMode, execute };
}
