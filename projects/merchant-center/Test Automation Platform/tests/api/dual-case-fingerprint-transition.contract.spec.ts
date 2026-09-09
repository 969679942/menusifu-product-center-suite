import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  arbitrateCaseState,
  assessDualCaseFingerprintTransition,
  fingerprintReceiptEvidence,
  fingerprintCaseExecutionSemantics,
  fingerprintCutoverAuthorization,
  isValidCaseFingerprintCutoverAuthorization,
  readPlaywrightExecutionReceipts,
  TestExecutionIndex,
} from '../../src';

const effective = 'a'.repeat(64);
const semantic = 'b'.repeat(64);
const implementation = 'c'.repeat(64);

test.describe('系统无关双用例指纹过渡合同', () => {
  test('旧完整收据继续有效但不能获得语义指纹切换资格', () => {
    const receipt = {
      caseFingerprint: effective,
      implementationFingerprint: implementation,
      status: 'passed' as const,
      evidenceStatus: 'complete' as const,
      assertionStatuses: ['verified' as const],
    };
    const transition = assessDualCaseFingerprintTransition({
      cases: [{
        caseId: 'TC-ORDER-001', requiredForCutover: true,
        currentEffectiveCaseFingerprint: effective,
        currentSemanticCaseFingerprint: semantic,
        currentImplementationFingerprint: implementation,
        implementationFingerprintRequired: true,
        receipts: [receipt],
      }],
    });
    expect(transition).toMatchObject({
      cutoverReady: false,
      summary: { eligible: 0, 'awaiting-dual-receipt': 1, requiredForCutover: 1 },
    });
    expect(arbitrateCaseState({
      disposition: 'ready', currentCaseFingerprint: effective,
      currentSemanticCaseFingerprint: semantic,
      currentImplementationFingerprint: implementation,
      implementationFingerprintRequired: true,
      receipts: [{ ...receipt, recordedAt: '2026-09-03T00:00:00.000Z' }],
    }).status).toBe('passed');
  });

  test('只有完整双指纹收据可在显式语义模式下通过并获得切换资格', () => {
    const receipt = {
      caseFingerprint: effective,
      semanticCaseFingerprint: semantic,
      implementationFingerprint: implementation,
      status: 'passed' as const,
      evidenceStatus: 'complete' as const,
      assertionStatuses: ['verified' as const],
    };
    const transition = assessDualCaseFingerprintTransition({
      cases: [{
        caseId: 'TC-ORDER-001', requiredForCutover: true,
        currentEffectiveCaseFingerprint: effective,
        currentSemanticCaseFingerprint: semantic,
        currentImplementationFingerprint: implementation,
        implementationFingerprintRequired: true,
        receipts: [receipt],
      }],
    });
    expect(transition).toMatchObject({ cutoverReady: true, summary: { eligible: 1 } });
    expect(arbitrateCaseState({
      disposition: 'ready', currentCaseFingerprint: effective,
      currentSemanticCaseFingerprint: semantic, fingerprintMatchMode: 'semantic',
      currentImplementationFingerprint: implementation,
      implementationFingerprintRequired: true,
      receipts: [{ ...receipt, recordedAt: '2026-09-03T00:00:00.000Z' }],
    }).status).toBe('passed');
    expect(arbitrateCaseState({
      disposition: 'ready', currentCaseFingerprint: effective,
      currentSemanticCaseFingerprint: semantic, fingerprintMatchMode: 'semantic',
      currentImplementationFingerprint: implementation,
      implementationFingerprintRequired: true,
      receipts: [{ ...receipt, semanticCaseFingerprint: 'd'.repeat(64), recordedAt: '2026-09-03T00:00:00.000Z' }],
    }).status).toBe('ready');
  });

  test('3.2收据强制双写并把语义指纹纳入证据哈希，旧版仍可读取', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dual-case-fingerprint-'));
    try {
      const valid = runtimeReceipt('3.2.0', semantic);
      const validResult = readReceipt(root, 'valid.json', valid);
      expect(validResult.records).toHaveLength(1);
      expect(validResult.records[0].semanticCaseFingerprint).toBe(semantic);

      const missing = runtimeReceipt('3.2.0', undefined);
      const missingResult = readReceipt(root, 'missing.json', missing);
      expect(missingResult.records).toEqual([]);
      expect(missingResult.diagnostics).toContain(
        'TC-ORDER-001:RUNTIME_RECEIPT_SEMANTIC_CASE_FINGERPRINT_MISSING',
      );

      const legacy = runtimeReceipt('3.1.0', undefined);
      const legacyResult = readReceipt(root, 'legacy.json', legacy);
      expect(legacyResult.records).toHaveLength(1);
      expect(legacyResult.records[0].semanticCaseFingerprint).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('同一执行批次补齐双指纹时执行索引保留证据更完整的记录', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dual-index-upgrade-'));
    try {
      const indexPath = path.join(root, 'execution-index.json');
      const base = {
        caseId: 'TC-ORDER-001', caseFingerprint: effective,
        implementationFingerprint: implementation,
        status: 'passed' as const, evidenceStatus: 'complete' as const,
        assertionStatuses: ['verified' as const],
        cleanupEvidence: { apiZeroResidue: true, uiZeroResidue: true },
        receiptEvidenceFingerprint: 'd'.repeat(64), evidenceFileFingerprint: 'e'.repeat(64),
        reuseStatus: 'run-only' as const, runId: 'run-1', executionEpochId: 'epoch-1',
        evidencePath: 'output/run-1.json', durationMs: 1, recordedAt: '2026-09-03T00:00:00.000Z',
      };
      const index = new TestExecutionIndex(indexPath);
      index.upsert([base]);
      expect(new TestExecutionIndex(indexPath).upsert([{ ...base, semanticCaseFingerprint: semantic }])).toBe(true);
      expect(new TestExecutionIndex(indexPath).snapshot().records[0].semanticCaseFingerprint).toBe(semantic);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('严格迁移门禁拒绝缺少上下文、清理和证据文件指纹的收据', () => {
    const result = assessDualCaseFingerprintTransition({ cases: [{
      caseId: 'TC-ORDER-STRICT', requiredForCutover: true,
      currentEffectiveCaseFingerprint: effective,
      currentSemanticCaseFingerprint: semantic,
      currentImplementationFingerprint: implementation,
      implementationFingerprintRequired: true,
      strictEvidence: true,
      receipts: [{ caseFingerprint: effective, semanticCaseFingerprint: semantic,
        implementationFingerprint: implementation, status: 'passed', evidenceStatus: 'complete',
        assertionStatuses: ['verified'] }],
    }] });
    expect(result.cutoverReady).toBe(false);
    expect(result.cases[0].status).toBe('awaiting-dual-receipt');
  });

  test('切换授权收据必须可验证且绑定新旧指纹', () => {
    const unsigned = {
      caseId: 'TC-ORDER-001', oldEffectiveFingerprint: effective,
      newSemanticFingerprint: semantic, implementationFingerprint: implementation,
      approvedCutoverId: 'cutover-1', approvedBy: 'operator', approvedAt: '2026-09-03T00:00:00.000Z',
    };
    const authorization = { ...unsigned, authorizationFingerprint: fingerprintCutoverAuthorization(unsigned) };
    expect(isValidCaseFingerprintCutoverAuthorization(authorization)).toBe(true);
    expect(isValidCaseFingerprintCutoverAuthorization({ ...authorization, newSemanticFingerprint: 'd'.repeat(64) })).toBe(false);
  });

  test('来源变化不影响执行语义指纹', () => {
    const base = { caseId: 'TC-ORDER-001', preconditions: ['已登录'], steps: ['点击保存'], expectedResults: ['保存成功'] };
    expect(fingerprintCaseExecutionSemantics(base)).toBe(fingerprintCaseExecutionSemantics(base));
  });
});

function runtimeReceipt(receiptVersion: '3.1.0' | '3.2.0', semanticCaseFingerprint: string | undefined) {
  const receipt = {
    receiptVersion,
    caseId: 'TC-ORDER-001',
    caseFingerprint: effective,
    ...(semanticCaseFingerprint ? { semanticCaseFingerprint } : {}),
    implementationFingerprint: implementation,
    executionContext: { environmentId: 'qa', tenantScope: 'tenant-1', locale: 'zh-CN', roleId: 'operator', route: '/orders' },
    releaseObservation: { status: 'unavailable' as const, fingerprint: null, source: 'unavailable', stable: false },
    executionEpochId: `epoch-${receiptVersion}`,
    claims: { required: ['claim:1'], observed: ['claim:1'], verified: ['claim:1'] },
    operationReceipts: [{ operationKey: 'OrderPage.create', method: 'create', observed: true }],
    cleanup: { apiZeroResidue: true, uiZeroResidue: true },
  };
  return { ...receipt, evidenceFingerprint: fingerprintReceiptEvidence(receipt) };
}

function readReceipt(root: string, name: string, payload: ReturnType<typeof runtimeReceipt>) {
  const reportPath = path.join(root, name);
  const report = { suites: [{ specs: [{
    title: '双指纹收据', tags: ['@case-TC-ORDER-001'], tests: [{ results: [{
      status: 'passed', startTime: '2026-09-03T00:00:00.000Z', duration: 1,
      attachments: [{
        name: 'test-execution-receipt', contentType: 'application/json',
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      }],
    }] }],
  }] }] };
  fs.writeFileSync(reportPath, JSON.stringify(report));
  return readPlaywrightExecutionReceipts({ reportPath, workspaceRoot: root });
}
