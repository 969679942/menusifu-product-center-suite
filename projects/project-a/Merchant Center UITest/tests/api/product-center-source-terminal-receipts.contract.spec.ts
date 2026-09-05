import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { resolveProductCenterSourceTerminalCaseIds } from '../../adapters/product-center/product-center-source-terminal-receipts';
import { resolveProductCenterSeasoningTerminalCaseIds } from '../../adapters/product-center/product-center-seasoning-terminal-receipts';

test.describe('商品中心来源治理终态收据适配合同', () => {
  test('认证失败且报告为空时返回零终态', () => {
    withFixture(({ root, manifestPath }) => {
      writeJson(manifestPath, {
        selectedCaseIds: ['TC-A'], blockedCaseIds: [], reportPaths: [], runnerReports: [],
        authSetupStatus: 'failed', interruptionReason: 'batch-auth-setup-failed',
      });
      expect(resolve(root, manifestPath, ['TC-A'])).toEqual([]);
    });
  });

  test('部分报告只返回真实终态且不把 skipped 当终态', () => {
    withFixture(({ root, manifestPath, reportPath }) => {
      writeManifest(manifestPath, ['TC-A', 'TC-B'], 'output/report.json');
      writeJson(reportPath, report([result('TC-A', 'failed'), result('TC-B', 'skipped')]));
      expect(resolve(root, manifestPath, ['TC-A', 'TC-B'])).toEqual(['TC-A']);
    });
  });

  test('完整真实报告返回全部所选终态', () => {
    withFixture(({ root, manifestPath, reportPath }) => {
      writeManifest(manifestPath, ['TC-A', 'TC-B'], 'output/report.json');
      writeJson(reportPath, report([result('TC-A', 'passed'), result('TC-B', 'timedOut')]));
      expect(resolve(root, manifestPath, ['TC-A', 'TC-B'])).toEqual(['TC-A', 'TC-B']);
    });
  });

  test('Seasoning canary 只从当前 flow 的当前双指纹账本恢复终态', () => {
    withFixture(({ root }) => {
      const flowId = 'canary-seasoning';
      writeJson(path.join(root, 'output/system-test-flow/merchant-center-product-center-seasoning/checkpoint.json'), {
        flowId, selectedCaseIds: ['TC-A', 'TC-B'], runIds: ['run-one'],
      });
      writeJson(path.join(root, 'output/system-test/merchant-center-product-center-seasoning/run-one/evidence-ledger.json'), {
        cases: [
          { caseId: 'TC-A', caseFingerprint: 'case-a', implementationFingerprint: 'impl-a', playwrightStatus: 'failed' },
          { caseId: 'TC-B', caseFingerprint: 'old-case-b', implementationFingerprint: 'impl-b', playwrightStatus: 'passed' },
        ],
      });
      expect(resolveProductCenterSeasoningTerminalCaseIds({
        projectRoot: root,
        flowId,
        selectedCaseIds: ['TC-A', 'TC-B'],
        currentCases: [
          { caseId: 'TC-A', caseFingerprint: 'case-a', implementationFingerprint: 'impl-a' },
          { caseId: 'TC-B', caseFingerprint: 'case-b', implementationFingerprint: 'impl-b' },
        ],
      })).toEqual(['TC-A']);
    });
  });
});

function withFixture(run: (paths: { root: string; manifestPath: string; reportPath: string }) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-terminal-receipts-'));
  const manifestPath = path.join(root, 'output/manifest.json');
  const reportPath = path.join(root, 'output/report.json');
  try {
    run({ root, manifestPath, reportPath });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function resolve(root: string, manifestPath: string, selectedCaseIds: string[]): string[] {
  return resolveProductCenterSourceTerminalCaseIds({ projectRoot: root, manifestPath, selectedCaseIds });
}

function writeManifest(manifestPath: string, selectedCaseIds: string[], reportPath: string): void {
  writeJson(manifestPath, {
    selectedCaseIds, blockedCaseIds: [], reportPaths: [reportPath],
    runnerReports: [{ runnerId: 'fixture', reportPath, selectedCaseIds }], authSetupStatus: 'passed',
  });
}

function report(tests: unknown[]): object {
  return { suites: [{ specs: [{ tests }] }] };
}

function result(caseId: string, status: string): object {
  return {
    annotations: [{ type: 'canonical-case-id', description: caseId }],
    results: [{ status, startTime: '2026-09-05T00:00:00.000Z' }],
  };
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
