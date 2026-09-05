import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildProductCenterLocalMaintenanceSummary,
  renderProductCenterLocalMaintenanceMarkdown,
} from '../../utils/product-center-local-maintenance';

test.describe('商品中心本地维护入口合同', () => {
  test('全部本地门禁通过时应输出 passed 摘要', async () => {
    const summary = buildProductCenterLocalMaintenanceSummary({
      generatedAt: '2026-07-27T10:00:00.000Z',
      allure: { status: 'passed', deletedFiles: 10, remainingFiles: 100 },
      pipeline: {
        status: 'passed',
        stages: 15,
        technicalReady: true,
        runId: 'run-a',
        mode: 'static',
        immutableReport: 'output/pipeline/runs/run-a/revision/report.json',
        retainedRevisions: 3,
        expiredCandidates: 0,
      },
      owner: { status: 'ready', technicalReady: true, blockers: 0, actions: 0 },
      safety: { sensitiveFindings: 0, incompleteCheckpoints: 0, authStateArtifacts: 0 },
    });

    expect(summary).toMatchObject({
      status: 'passed',
      generatedAt: '2026-07-27T10:00:00.000Z',
      pipeline: { stages: 15, technicalReady: true },
      safety: { sensitiveFindings: 0, incompleteCheckpoints: 0, authStateArtifacts: 0 },
    });
    expect(summary.issues).toEqual([]);
    expect(renderProductCenterLocalMaintenanceMarkdown(summary)).toContain('状态：passed');
    expect(renderProductCenterLocalMaintenanceMarkdown(summary)).toContain('不可变报告');
  });

  test('流水线、负责人或清理门禁异常时必须输出 failed', async () => {
    const summary = buildProductCenterLocalMaintenanceSummary({
      allure: { status: 'failed', deletedFiles: 0, remainingFiles: 20_000 },
      pipeline: { status: 'failed', stages: 8, technicalReady: false },
      owner: { status: 'blocked', technicalReady: false, blockers: 1, actions: 0 },
      safety: { sensitiveFindings: 1, incompleteCheckpoints: 1, authStateArtifacts: 1 },
    });

    expect(summary.status).toBe('failed');
    expect(summary.issues.map((issue) => issue.code)).toEqual([
      'ALLURE_RETENTION_FAILED',
      'PIPELINE_FAILED',
      'OWNER_SUMMARY_BLOCKED',
      'SENSITIVE_ARTIFACTS_PRESENT',
      'INCOMPLETE_CHECKPOINTS_PRESENT',
      'AUTH_STATE_RESIDUE_PRESENT',
    ]);
  });

  test('package 应提供不依赖 GitHub Actions 的单一本地维护命令', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const source = fs.readFileSync(
      path.join(projectRoot, 'scripts/run-product-center-local-maintenance.ts'),
      'utf8',
    );

    expect(packageJson.scripts['maintain:local']).toContain('run-product-center-local-maintenance.ts');
    expect(packageJson.scripts['maintain:local:summary']).toContain('--summary-only');
    expect(source).toContain("process.argv.includes('--summary-only')");
    expect(source).toContain("'maintain:allure:apply'");
    expect(source).toContain("'pipeline:product-center'");
    expect(source).toContain('buildProductCenterOwnerSummaryArtifacts');
    expect(source).toContain('scanGeneratedArtifacts');
    expect(source).toContain('readLatestProductCenterPipelineArtifact');
    expect(source).toContain('buildProductCenterPipelineArtifactRetentionAudit');
    expect(source).not.toContain('GITHUB_');
  });
});
