import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AcceptanceProjectManifest } from '../../src/acceptance/acceptance-manifest';
import {
  runAcceptanceOrchestrator,
  type AcceptanceSafetySnapshot,
} from '../../src/acceptance/acceptance-orchestrator';

const manifest: AcceptanceProjectManifest = {
  schemaVersion: '1.0.0',
  projectId: 'orchestrator-contract',
  displayName: '编排合同',
  baseURL: 'https://example.test',
  markerPrefix: 'AUTO_AUDIT_',
  routes: [{ path: '/alpha', name: '页面甲' }],
};
const cleanSafety: AcceptanceSafetySnapshot = {
  incompleteCheckpoints: 0,
  sensitiveArtifacts: 0,
  savedAuthStates: 0,
};

function outputPath(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-orchestrator-')), 'result.json');
}

test.describe('通用验收编排器', () => {
  test('前置命令失败应阻断路由扫描', async () => {
    let scanCalled = false;
    const report = await runAcceptanceOrchestrator({
      manifest,
      commands: [{ id: 'contracts', command: 'npm', args: ['run', 'verify'] }],
      outputPath: outputPath(),
      runCommand: async () => ({ exitCode: 1, diagnostic: 'contract failed' }),
      scanRoutes: async () => {
        scanCalled = true;
        throw new Error('不得执行');
      },
      inspectSafety: async () => cleanSafety,
    });

    expect(scanCalled).toBe(false);
    expect(report.failedStage).toBe('contracts');
  });

  test('路由扫描失败应返回非通过终态', async () => {
    const report = await runAcceptanceOrchestrator({
      manifest,
      commands: [],
      outputPath: outputPath(),
      runCommand: async () => ({ exitCode: 0 }),
      scanRoutes: async () => ({
        status: 'failed',
        summary: { total: 1, passed: 0, failed: 1, uiMatches: 1, apiMatches: 0 },
      }),
      inspectSafety: async () => cleanSafety,
    });

    expect(report.status).toBe('failed');
    expect(report.failedStage).toBe('route-scan');
  });

  test('报告只保存脱敏诊断和计数证据', async () => {
    const filePath = outputPath();
    const report = await runAcceptanceOrchestrator({
      manifest,
      commands: [{ id: 'contracts', command: 'npm', args: ['run', 'verify'] }],
      outputPath: filePath,
      runCommand: async () => ({ exitCode: 0, diagnostic: 'authorization=Bearer secret-token' }),
      scanRoutes: async () => ({
        status: 'passed',
        summary: { total: 1, passed: 1, failed: 0, uiMatches: 0, apiMatches: 0 },
      }),
      inspectSafety: async () => cleanSafety,
    });

    const serialized = fs.readFileSync(filePath, 'utf8');
    expect(report.status).toBe('passed');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).toContain('<redacted>');
    expect(serialized).not.toContain('responseBody');
  });
});
