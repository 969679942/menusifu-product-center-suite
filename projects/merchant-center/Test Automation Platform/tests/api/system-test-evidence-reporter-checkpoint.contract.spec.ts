import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { TestCase, TestResult } from '@playwright/test/reporter';
import SystemTestEvidenceReporter from '../../src/reporters/system-test-evidence.reporter';
import { verifyExecutionAttemptLedger } from '../../src/governance/execution-attempt-accounting';
import { readSystemTestEvidenceLedgerReceipts } from '../../src/utils/system-test-evidence-ledger-receipt';
import { registerEvidenceInvocation, readIndexedRunEvidence } from '../../src/governance/run-evidence-index';

test.describe('系统测试证据 reporter 检查点合同', () => {
  test('独立Playwright进程绑定调用身份并保存真实失败重试序列', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'system-evidence-process-'));
    try {
      const contract = contractFixture();
      const contractPath = path.join(root, 'contract.json');
      fs.writeFileSync(contractPath, JSON.stringify(contract));
      const identity = { runId: 'process-run', selectedCaseIds: [contract.cases[0].caseId], contractFingerprint: contract.fingerprint,
        implementationFingerprint: '1'.repeat(64), executionCandidateFingerprint: '2'.repeat(64) };
      const invocation = registerEvidenceInvocation(root, identity);
      const config = path.join(root, 'playwright.config.cjs');
      fs.writeFileSync(config, `module.exports = ${JSON.stringify({ testDir: root, testMatch: 'synthetic.spec.cjs', workers: 1, retries: 1,
        outputDir: path.join(root, 'results'), reporter: [[path.resolve(__dirname, '../../src/reporters/system-test-evidence.reporter.ts')]],
      })};`);
      fs.writeFileSync(path.join(root, 'synthetic.spec.cjs'), `const { test } = require(${JSON.stringify(require.resolve('@playwright/test'))});
test('synthetic @case-TC-CHECKPOINT-001', { annotation: { type: 'system-test-case-id', description: 'TC-CHECKPOINT-001' } },
async ({}, info) => { if (info.retry === 0) throw new Error('synthetic-retry'); });`);
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('SYSTEM_TEST_')));
      const child = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', `--config=${config}`], {
        cwd: root, encoding: 'utf8', timeout: 30_000, windowsHide: true, env: { ...env,
          SYSTEM_TEST_CONTRACT: contractPath, SYSTEM_TEST_RUN_ID: identity.runId,
          SYSTEM_TEST_EVIDENCE_OUTPUT: path.join(root, 'evidence-ledger.json'), SYSTEM_TEST_EVIDENCE_INVOCATION_ID: invocation.invocationId,
          SYSTEM_TEST_IMPLEMENTATION_FINGERPRINT: identity.implementationFingerprint,
          SYSTEM_TEST_EXECUTION_CANDIDATE_FINGERPRINT: identity.executionCandidateFingerprint,
          SYSTEM_TEST_PROGRESS_LATEST: path.join(root, 'progress.json'), SYSTEM_TEST_PROGRESS_HISTORY: path.join(root, 'progress.jsonl'),
        },
      });
      expect(child.status).toBe(0);
      const indexed = readIndexedRunEvidence(root, identity.runId);
      expect(indexed.status).toBe('available');
      if (indexed.status !== 'available') throw new Error('SUBPROCESS_INDEX_UNAVAILABLE');
      expect(indexed.final).toBe(true);
      expect((indexed.ledger.attempts as Array<{ retry: number; status: string }>).map(({ retry, status }) => ({ retry, status })))
        .toEqual([{ retry: 0, status: 'failed' }, { retry: 1, status: 'passed' }]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  test('真实报告回调保留全部尝试，导入重算最新结果且跳过不作为执行收据', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'system-evidence-attempts-'));
    const env = snapshotEnv();
    try {
      const contractPath = path.join(root, 'contract.json');
      const evidencePath = path.join(root, 'evidence-ledger.json');
      const contract = contractFixture();
      const ids = ['TC-CHECKPOINT-001', 'TC-CHECKPOINT-002', 'TC-CHECKPOINT-003'];
      contract.cases = ids.map((caseId) => ({ ...contract.cases[0], caseId }));
      fs.writeFileSync(contractPath, JSON.stringify(contract));
      Object.assign(process.env, { SYSTEM_TEST_CONTRACT: contractPath, SYSTEM_TEST_EVIDENCE_OUTPUT: evidencePath,
        SYSTEM_TEST_PROGRESS_LATEST: path.join(root, 'progress.json'), SYSTEM_TEST_PROGRESS_HISTORY: path.join(root, 'progress.jsonl'),
        SYSTEM_TEST_RUN_ID: 'checkpoint-run', SYSTEM_TEST_IMPLEMENTATION_FINGERPRINT: '1'.repeat(64), SYSTEM_TEST_EXECUTION_CANDIDATE_FINGERPRINT: '2'.repeat(64) });
      process.env.SYSTEM_TEST_EVIDENCE_INVOCATION_ID = registerEvidenceInvocation(root, { runId: 'checkpoint-run', selectedCaseIds: ids,
        contractFingerprint: contract.fingerprint, implementationFingerprint: '1'.repeat(64), executionCandidateFingerprint: '2'.repeat(64) }).invocationId;
      const reporter = new SystemTestEvidenceReporter();
      const testCase = (caseId: string) => ({ id: caseId, annotations: [{ type: 'system-test-case-id', description: caseId }] } as TestCase);
      const result = (status: TestResult['status'], retry = 0, evidence = false): TestResult => ({ status, retry,
        startTime: new Date(Date.parse('2026-09-08T00:00:00Z') + retry * 1000), duration: 100,
        attachments: evidence ? [{ name: 'system-test-runtime-evidence', body: Buffer.from(JSON.stringify(runtimeEvidenceFixture())) }] : [],
      } as TestResult);
      reporter.onTestBegin(testCase(ids[2]), result('passed'));
      reporter.onTestEnd(testCase(ids[0]), result('failed'));
      reporter.onTestEnd(testCase(ids[0]), result('passed', 1, true));
      reporter.onTestEnd(testCase(ids[1]), result('skipped'));
      expect(JSON.parse(fs.readFileSync(path.join(root, 'progress.json'), 'utf8'))).toMatchObject({ phase: 'skipped', status: 'skipped' });
      let ledger = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
      expect(ledger.attempts).toHaveLength(4);
      expect(ledger.cases.map((item: { caseId: string }) => item.caseId)).toEqual([ids[0]]);
      expect(ledger.summary).toEqual({ selected: 3, executed: 2, evidenceComplete: 1, evidenceIncomplete: 1 });
      expect(ledger.executionAccounting).toMatchObject({ actualAttemptCount: 3, terminalCaseIds: [ids[0]], skippedCaseIds: [ids[1]], testAttemptWorkMs: null });
      expect(verifyExecutionAttemptLedger('checkpoint-run', ids, ledger).valid).toBe(true);
      const imported = readSystemTestEvidenceLedgerReceipts({ ledgerPath: evidencePath, contractPath, workspaceRoot: root,
        runId: 'checkpoint-run', expectedSystemId: 'checkpoint-system', expectedCaseIds: ids, allowPartial: true });
      expect(imported.diagnostics).toEqual([]);
      expect(imported.records.map((item) => [item.caseId, item.status])).toEqual([[ids[0], 'passed']]);
      reporter.onTestEnd(testCase(ids[2]), result('interrupted'));
      reporter.onTestEnd(testCase(ids[0]), result('failed', 2));
      ledger = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
      expect(ledger.cases.find((item: { caseId: string }) => item.caseId === ids[0]).playwrightStatus).toBe('failed');
      expect(ledger.attempts.filter((item: { caseId: string }) => item.caseId === ids[0])).toHaveLength(3);
      expect(verifyExecutionAttemptLedger('other-run', ids, ledger).valid).toBe(false);
      ledger.summary.executed = 99;
      expect(verifyExecutionAttemptLedger('checkpoint-run', ids, ledger).reasons).toContain('ATTEMPT_LEDGER_PROJECTION_MISMATCH');
    } finally { restoreEnv(env); fs.rmSync(root, { recursive: true, force: true }); }
  });
  test('每条用例结束时先原子写入部分账本', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'system-evidence-reporter-'));
    const env = snapshotEnv();
    try {
      const contractPath = path.join(root, 'contract.json');
      const evidencePath = path.join(root, 'evidence-ledger.json');
      const progressLatest = path.join(root, 'progress.json');
      const progressHistory = path.join(root, 'progress.jsonl');
      fs.writeFileSync(contractPath, JSON.stringify(contractFixture()));
      Object.assign(process.env, {
        SYSTEM_TEST_CONTRACT: contractPath,
        SYSTEM_TEST_EVIDENCE_OUTPUT: evidencePath,
        SYSTEM_TEST_PROGRESS_LATEST: progressLatest,
        SYSTEM_TEST_PROGRESS_HISTORY: progressHistory,
        SYSTEM_TEST_RUN_ID: 'checkpoint-run',
        SYSTEM_TEST_IMPLEMENTATION_FINGERPRINT: '1'.repeat(64),
        SYSTEM_TEST_EXECUTION_CANDIDATE_FINGERPRINT: '2'.repeat(64),
      });
      process.env.SYSTEM_TEST_EVIDENCE_INVOCATION_ID = registerEvidenceInvocation(root, { runId: 'checkpoint-run', selectedCaseIds: ['TC-CHECKPOINT-001'],
        contractFingerprint: contractFixture().fingerprint, implementationFingerprint: '1'.repeat(64), executionCandidateFingerprint: '2'.repeat(64) }).invocationId;
      const reporter = new SystemTestEvidenceReporter();
      reporter.onTestEnd({
        id: 'checkpoint-test',
        annotations: [{ type: 'system-test-case-id', description: 'TC-CHECKPOINT-001' }],
      } as TestCase, {
        status: 'passed',
        retry: 0, startTime: new Date('2026-09-08T00:00:00Z'), duration: 100,
        attachments: [{
          name: 'system-test-runtime-evidence',
          body: Buffer.from(JSON.stringify(runtimeEvidenceFixture())),
        }],
      } as TestResult);
      const ledger = JSON.parse(fs.readFileSync(evidencePath, 'utf8')) as {
        playwrightStatus: string;
        summary: { selected: number; executed: number; evidenceComplete: number };
        cases: Array<{ caseId: string }>;
      };
      expect(ledger.playwrightStatus).toBe('running');
      expect(ledger.summary).toEqual({ selected: 1, executed: 1, evidenceComplete: 1, evidenceIncomplete: 0 });
      expect(ledger.cases.map((item) => item.caseId)).toEqual(['TC-CHECKPOINT-001']);
      expect(JSON.parse(fs.readFileSync(progressLatest, 'utf8'))).toMatchObject({
        caseId: 'TC-CHECKPOINT-001', phase: 'completed', status: 'passed',
      });
    } finally {
      restoreEnv(env);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

function contractFixture() {
  return {
    schemaVersion: '1.0.0', collectionId: 'system-test-run-contract', generatedAt: '2026-09-05T00:00:00.000Z',
    system: { systemId: 'checkpoint-system', displayName: 'Checkpoint', baseURL: 'https://example.test', markerPrefix: 'AUTO_',
      executionContext: { environmentId: 'qa', locale: 'zh-CN', roleId: 'operator', tenantScope: 'tenant' } },
    execution: { playwrightConfigPath: 'playwright.config.ts', setupSpecPath: 'setup.ts', setupProject: 'setup',
      preflightSpecPath: 'preflight.ts', specPath: 'system.ts', project: 'system', workers: 1, retries: 0, authAdapterId: 'auth' },
    policies: {}, sourceFingerprints: {}, summary: { cases: 1, readOnly: 1, mutation: 0, expectationClaims: 1 },
    cases: [{
      caseId: 'TC-CHECKPOINT-001', ruleId: 'RULE-1', ruleStatus: 'provisional', recipeId: 'recipe-1', action: 'read',
      dataProfileId: 'read-only', mutationMode: 'none', requiredOperationKeys: ['checkpoint:GET /resource'],
      requiredContextGuards: [], probeAdapterIds: [], externalCapabilities: [],
      expectationClaims: [{ claimId: 'claim-1', expected: '可见', assertionAdapterId: 'assert', observationChannel: 'ui',
        authority: 'user-visible', terminalCondition: '稳定可见', fieldId: 'resource.name', assertionSurfaceId: 'ui.resource' }],
    }],
    fingerprint: '3'.repeat(64),
  };
}

function runtimeEvidenceFixture() {
  return {
    caseId: 'TC-CHECKPOINT-001',
    executionContext: { applicationVersionFingerprint: '4'.repeat(64), environmentId: 'qa', tenantScope: 'tenant',
      locale: 'zh-CN', roleId: 'operator', route: '/resource' },
    assertionReceipts: [{ claimId: 'claim-1', assertionAdapterId: 'assert', status: 'verified', expected: '可见', actual: '可见',
      observationChannel: 'ui', authority: 'user-visible' }],
    operationReceipts: [{ operationKey: 'checkpoint:GET /resource', observed: true, method: 'GET' }],
    cleanup: { apiIdentityCounts: {}, uiIdentityCounts: {} },
  };
}

function snapshotEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
}

function restoreEnv(snapshot: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) if (!(key in snapshot)) delete process.env[key];
  Object.assign(process.env, snapshot);
}
