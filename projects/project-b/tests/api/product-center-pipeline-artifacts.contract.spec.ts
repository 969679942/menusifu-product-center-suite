import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildProductCenterPipelineArtifactRetentionAudit,
  publishProductCenterPipelineArtifacts,
  readLatestProductCenterPipelineArtifact,
} from '../../utils/product-center-pipeline-artifacts';

test.describe('商品中心流水线不可变产物', () => {
  test('应发布不可变报告与检查点并通过 latest 指针读取', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-pipeline-artifacts-'));
    try {
      const checkpointPath = writeCheckpoint(rootDir, 'run-a', 'passed');
      const published = publishProductCenterPipelineArtifacts({
        rootDir,
        checkpointPath,
        report: report('run-a', 'full', 'passed', '2026-07-28T12:00:00.000Z'),
      });

      expect(normalize(published.reportPath)).toMatch(
        /output\/pipeline\/runs\/run-a\/[a-f0-9]{64}\/report\.json$/,
      );
      expect(normalize(published.checkpointPath)).toMatch(
        /output\/pipeline\/runs\/run-a\/[a-f0-9]{64}\/checkpoint\.json$/,
      );
      expect(fs.existsSync(published.reportPath)).toBe(true);
      expect(fs.existsSync(published.checkpointPath)).toBe(true);

      const latest = readLatestProductCenterPipelineArtifact(rootDir);
      expect(latest.pointer).toMatchObject({
        schemaVersion: '1.0.0',
        kind: 'product-center-quality-pipeline-pointer',
        runId: 'run-a',
        mode: 'full',
        status: 'passed',
        reportSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        checkpointSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(latest.report).toMatchObject({ mode: 'full', pipeline: { runId: 'run-a' } });
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('同一 run 恢复后的新报告不得覆盖旧修订', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-pipeline-resume-'));
    try {
      const checkpointPath = writeCheckpoint(rootDir, 'run-a', 'failed');
      const first = publishProductCenterPipelineArtifacts({
        rootDir,
        checkpointPath,
        report: report('run-a', 'full', 'failed', '2026-07-28T12:00:00.000Z'),
      });
      const firstContent = fs.readFileSync(first.reportPath, 'utf8');
      writeCheckpoint(rootDir, 'run-a', 'passed');
      const second = publishProductCenterPipelineArtifacts({
        rootDir,
        checkpointPath,
        report: report('run-a', 'full', 'passed', '2026-07-28T12:10:00.000Z'),
      });

      expect(second.reportPath).not.toBe(first.reportPath);
      expect(fs.readFileSync(first.reportPath, 'utf8')).toBe(firstContent);
      expect(readLatestProductCenterPipelineArtifact(rootDir).report.status).toBe('passed');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('不可变报告被修改时读取必须 fail-closed', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-pipeline-integrity-'));
    try {
      const published = publishProductCenterPipelineArtifacts({
        rootDir,
        checkpointPath: writeCheckpoint(rootDir, 'run-a', 'passed'),
        report: report('run-a', 'static', 'passed', '2026-07-28T12:00:00.000Z'),
      });
      fs.appendFileSync(published.reportPath, '\n', 'utf8');
      expect(() => readLatestProductCenterPipelineArtifact(rootDir)).toThrow(/SHA-256/);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('保留审计只能报告非 latest 的过期修订且不得自动删除', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-pipeline-retention-'));
    try {
      const old = publishProductCenterPipelineArtifacts({
        rootDir,
        checkpointPath: writeCheckpoint(rootDir, 'run-old', 'passed'),
        report: report('run-old', 'full', 'passed', '2026-01-01T00:00:00.000Z'),
      });
      const latest = publishProductCenterPipelineArtifacts({
        rootDir,
        checkpointPath: writeCheckpoint(rootDir, 'run-latest', 'passed'),
        report: report('run-latest', 'static', 'passed', '2026-07-28T12:00:00.000Z'),
      });
      const audit = buildProductCenterPipelineArtifactRetentionAudit({
        rootDir,
        now: '2026-07-28T13:00:00.000Z',
        retentionDays: 90,
        maxRevisions: 50,
      });

      expect(audit.deletionMode).toBe('report-only');
      expect(audit.expiredCandidates).toEqual([normalize(path.dirname(old.reportPath))]);
      expect(audit.protectedPaths).toContain(normalize(path.dirname(latest.reportPath)));
      expect(fs.existsSync(old.reportPath)).toBe(true);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

function report(runId: string, mode: 'static' | 'full', status: 'passed' | 'failed', generatedAt: string) {
  return {
    schemaVersion: '1.0.0',
    generatedAt,
    pipelineId: 'product-center-quality',
    mode,
    status,
    checkpoint: `output/pipeline/product-center-quality-${mode}-checkpoint.json`,
    pipeline: { runId, status, stages: [] },
    technicalReadiness: status === 'passed' ? { technicalReady: true } : null,
  };
}

function writeCheckpoint(rootDir: string, runId: string, status: string): string {
  const filePath = path.join(rootDir, 'output/pipeline/product-center-quality-full-checkpoint.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ runId, status })}\n`, 'utf8');
  return filePath;
}

function normalize(value: string): string {
  return value.replace(/\\/g, '/');
}
