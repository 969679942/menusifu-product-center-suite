import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  fingerprintSystemTestValue,
  type SystemTestRunContract,
} from '../../src/automation/system-test/system-test-contract';
import {
  importSystemTestEvidenceLedgerReceipts,
  readSystemTestEvidenceLedgerReceipts,
} from '../../src/utils/system-test-evidence-ledger-receipt';
import { TestExecutionIndex } from '../../src/utils/test-execution-index';

test.describe('系统测试运行账本标准收据导入合同', () => {
  test('只导入选择集、合同身份和证据均完整的当前运行', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'system-ledger-receipt-'));
    try {
      const fixture = writeFixture(root);
      const result = importSystemTestEvidenceLedgerReceipts({
        ...fixture,
        executionIndexPath: path.join(root, 'execution-index.json'),
      });
      expect(result.diagnostics).toEqual([]);
      expect(result.records).toHaveLength(1);
      expect(result.indexChanged).toBe(true);
      expect(result.records[0]).toMatchObject({
        caseId: 'TC-ORDER-001', status: 'passed', evidenceStatus: 'complete',
        executionContextFingerprint: '3'.repeat(64),
        cleanupEvidence: { apiZeroResidue: true, uiZeroResidue: true },
      });
      expect(new TestExecutionIndex(path.join(root, 'execution-index.json')).snapshot().records).toHaveLength(1);
      expect(importSystemTestEvidenceLedgerReceipts({
        ...fixture,
        executionIndexPath: path.join(root, 'execution-index.json'),
      }).indexChanged).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('选择集不一致时整批拒绝且不污染执行索引', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'system-ledger-selection-'));
    try {
      const fixture = writeFixture(root);
      const result = readSystemTestEvidenceLedgerReceipts({
        ...fixture,
        expectedCaseIds: ['TC-ORDER-001', 'TC-ORDER-002'],
      });
      expect(result.records).toEqual([]);
      expect(result.diagnostics).toContain('CONTRACT_SELECTION_MISMATCH');
      expect(result.diagnostics).toContain('LEDGER_SELECTION_MISMATCH');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('中断运行只导入已完成子集且不授权未执行用例', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'system-ledger-partial-'));
    try {
      const fixture = writeFixture(root);
      const contract = JSON.parse(fs.readFileSync(fixture.contractPath, 'utf8')) as SystemTestRunContract;
      const secondCase = { ...contract.cases[0], caseId: 'TC-ORDER-002', recipeId: 'orders:TC-ORDER-002' };
      contract.cases.push(secondCase);
      contract.summary.cases = 2;
      fs.writeFileSync(fixture.contractPath, JSON.stringify(contract));
      const ledger = JSON.parse(fs.readFileSync(fixture.ledgerPath, 'utf8')) as {
        summary: { selected: number; executed: number };
      };
      ledger.summary.selected = 2;
      fs.writeFileSync(fixture.ledgerPath, JSON.stringify(ledger));
      const result = importSystemTestEvidenceLedgerReceipts({
        ...fixture,
        expectedCaseIds: ['TC-ORDER-001', 'TC-ORDER-002'],
        executionIndexPath: path.join(root, 'execution-index.json'),
        allowPartial: true,
      });
      expect(result.diagnostics).toEqual([]);
      expect(result.records.map((item) => item.caseId)).toEqual(['TC-ORDER-001']);
      expect(new TestExecutionIndex(path.join(root, 'execution-index.json')).snapshot().records)
        .toHaveLength(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('执行授权上下文指纹非法时整批拒绝', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'system-ledger-context-'));
    try {
      const fixture = writeFixture(root);
      const result = readSystemTestEvidenceLedgerReceipts({
        ...fixture,
        expectedExecutionContextFingerprint: 'invalid',
      });
      expect(result.records).toEqual([]);
      expect(result.diagnostics).toContain('EXECUTION_CONTEXT_FINGERPRINT_INVALID');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

function writeFixture(root: string) {
  const contractCase = {
    caseId: 'TC-ORDER-001', ruleId: 'RULE-ORDER-001', ruleStatus: 'provisional' as const,
    recipeId: 'orders:TC-ORDER-001', action: 'create' as const, dataProfileId: 'order-create',
    mutationMode: 'reversible' as const,
    expectationClaims: [{
      claimId: 'TC-ORDER-001:expectation-1', expected: '创建成功', assertionAdapterId: 'orders.assert-created',
      observationChannel: 'api' as const, authority: 'persistence' as const,
      terminalCondition: '订单可查询', fieldId: 'order.id', assertionSurfaceId: 'api.order',
    }],
    requiredContextGuards: [
      { adapterId: 'orders.context', phase: 'before-action' as const },
      { adapterId: 'orders.context', phase: 'before-assertion' as const },
    ],
    requiredOperationKeys: ['orders:POST /orders'], probeAdapterIds: [], externalCapabilities: [],
  };
  const contract = {
    schemaVersion: '1.0.0', collectionId: 'system-test-run-contract', generatedAt: '2026-09-05T00:00:00.000Z',
    system: { systemId: 'orders', displayName: 'Orders', baseURL: 'https://example.test', markerPrefix: 'AUTO_ORDERS',
      executionContext: { environmentId: 'qa', locale: 'zh-CN', roleId: 'operator', tenantScope: 'tenant-1',
        featureFlagFingerprint: '0'.repeat(64) } },
    execution: { playwrightConfigPath: 'playwright.config.ts', setupSpecPath: 'setup.ts', setupProject: 'setup',
      preflightSpecPath: 'preflight.ts', specPath: 'system.ts', project: 'system', workers: 1, retries: 0, authAdapterId: 'orders.auth' },
    policies: { stallMs: 1, maxRunMs: 1, maxConsecutiveFailures: 1, maxDuplicateFailureFingerprint: 1,
      minimumCompletedForFailureRate: 1, maximumEnvironmentFailureRate: 1, requireExplicitClaimReceipts: true,
      requireApiZeroResidue: true, requireUiZeroResidue: true, runtimeMayPromoteRuleToFormal: false,
      humanApprovalRequiredForFormal: true },
    sourceFingerprints: { recipes: 'a'.repeat(64), rules: 'b'.repeat(64), adapters: 'c'.repeat(64),
      evidenceRuntime: 'd'.repeat(64), executionContext: 'e'.repeat(64) },
    summary: { cases: 1, readOnly: 0, mutation: 1, expectationClaims: 1 }, cases: [contractCase],
    fingerprint: 'f'.repeat(64),
  } satisfies SystemTestRunContract;
  const contractPath = path.join(root, 'contract.json');
  const ledgerPath = path.join(root, 'evidence-ledger.json');
  fs.writeFileSync(contractPath, JSON.stringify(contract));
  fs.writeFileSync(ledgerPath, JSON.stringify({
    schemaVersion: '1.0.0', collectionId: 'system-test-evidence-ledger', generatedAt: '2026-09-05T00:01:00.000Z',
    systemId: 'orders', contractFingerprint: contract.fingerprint, summary: { selected: 1, executed: 1 },
    cases: [{
      receiptVersion: '3.1.0', caseId: 'TC-ORDER-001', caseFingerprint: fingerprintSystemTestValue(contractCase),
      implementationFingerprint: '1'.repeat(64), playwrightStatus: 'passed',
      runtimeEvidence: {
        executionContext: { applicationVersionFingerprint: '2'.repeat(64), environmentId: 'qa', tenantScope: 'tenant-1',
          locale: 'zh-CN', roleId: 'operator', route: '/orders' },
        assertionReceipts: [{ claimId: 'TC-ORDER-001:expectation-1', status: 'verified' }],
        operationReceipts: [{ operationKey: 'orders:POST /orders', method: 'POST', observed: true }],
        executionTimings: [{ durationMs: 12 }],
      },
      evidence: { status: 'complete', missingClaimIds: [], duplicateClaimIds: [], missingContextGuards: [],
        duplicateContextGuards: [], missingActionReadiness: [], duplicateActionReadiness: [], mismatchedClaimIds: [],
        missingOperationKeys: [], operationEvidenceComplete: true, apiZeroResidue: true, uiZeroResidue: true },
    }],
  }));
  return {
    ledgerPath, contractPath, workspaceRoot: root, runId: 'run-1', expectedSystemId: 'orders',
    expectedCaseIds: ['TC-ORDER-001'], expectedExecutionContextFingerprint: '3'.repeat(64),
  };
}
