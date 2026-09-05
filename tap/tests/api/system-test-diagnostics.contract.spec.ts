import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { resolveSystemTestCaseSelection } from '../../scripts/run-system-test';
import { buildSystemTestFailureDiagnosticDocument } from '../../src/automation/system-test/system-test-diagnostics';

test.describe('跨方案失败诊断与执行选择闸门', () => {
  test('持久化执行选择必须与显式选择使用同一授权集合', () => {
    expect(resolveSystemTestCaseSelection({
      explicitCaseIds: [],
      persistedCaseIds: ['CASE-B'],
      contractCaseIds: ['CASE-A', 'CASE-B'],
      selectionFileExists: true,
    })).toEqual({ selectedCaseIds: ['CASE-B'], noOp: false });
    expect(() => resolveSystemTestCaseSelection({
      explicitCaseIds: ['CASE-A'],
      persistedCaseIds: ['CASE-B'],
      contractCaseIds: ['CASE-A', 'CASE-B'],
      selectionFileExists: true,
    })).toThrow('SYSTEM_TEST_CASES_NOT_IN_EXECUTION_SELECTION');
  });

  test('失败诊断必须记录失败类别、页面路由、写入状态和整改闸门', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-diagnostic-'));
    const outputDir = path.join(root, 'system-test-1');
    const checkpointDir = path.join(root, 'checkpoints');
    fs.mkdirSync(checkpointDir, { recursive: true });
    fs.writeFileSync(path.join(checkpointDir, 'run_CASE-A.error.json'), JSON.stringify({
      caseId: 'CASE-A',
      url: 'https://example.test/catalog/list?token=secret',
      message: 'locator timeout; authorization=hidden',
    }));
    try {
      const document = buildSystemTestFailureDiagnosticDocument({
        outputDir,
        systemId: 'example-system',
        runId: 'run-1',
        contractFingerprint: 'c'.repeat(64),
        implementationFingerprint: 'i'.repeat(64),
        evidence: {
          cases: [{
            caseId: 'CASE-A', playwrightStatus: 'failed', failureCategory: 'locator-drift',
            runtimeEvidence: { mutationObserved: false }, evidence: { status: 'incomplete' },
          }],
        },
      });
      expect(document).toMatchObject({
        status: 'complete',
        rerunGate: 'action-chain-audit-required',
        diagnostics: [{
          caseId: 'CASE-A', failureCategory: 'locator-drift', route: '/catalog/list', mutationObserved: false,
          humanSummary: expect.stringContaining('页面控件定位发生漂移'),
        }],
      });
      expect(JSON.stringify(document)).not.toContain('authorization=hidden');
      expect(JSON.stringify(document)).not.toContain('token=secret');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
