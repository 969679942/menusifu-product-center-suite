import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { TestCase, TestResult } from '@playwright/test/reporter';
import SystemTestEvidenceReporter from '../../src/reporters/system-test-evidence.reporter';

test.describe('系统测试证据 reporter 检查点合同', () => {
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
      const reporter = new SystemTestEvidenceReporter();
      reporter.onTestEnd({
        annotations: [{ type: 'system-test-case-id', description: 'TC-CHECKPOINT-001' }],
      } as TestCase, {
        status: 'passed',
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
