import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  fingerprintSystemTestExecutionContext,
  validateSystemTestExecutionContext,
  validateSystemTestSourceRegistry,
  type SystemTestSourceRegistry,
} from '../../src/automation/system-test/system-test-governance';
import { fingerprintReceiptEvidence, readPlaywrightExecutionReceipts } from '../../src/utils/playwright-execution-receipt';

test.describe('通用测试治理门禁', () => {
  test('来源 ID 不可解析时必须在生成阶段阻断', () => {
    const registry = sourceRegistry();
    const errors = validateSystemTestSourceRegistry({
      registry,
      caseId: 'CASE-SOURCE-001',
      route: '/items',
      sourceIds: ['missing-source'],
      contractIds: ['ui:items'],
      expectations: [{
        expected: '列表可见', assertionAdapterId: 'assert.ui', observationChannel: 'ui',
        authority: 'user-visible', terminalCondition: '列表稳定可见', sourceIds: ['missing-source'], contractIds: ['ui:items'],
      }],
    });
    expect(errors).toContain('CASE-SOURCE-001:SOURCE_UNRESOLVED:missing-source');
  });

  test('API 观察不能声明用户可见权威', () => {
    const errors = validateSystemTestSourceRegistry({
      registry: sourceRegistry(), caseId: 'CASE-CHANNEL-001', route: '/items', sourceIds: ['formal:items'],
      contractIds: ['api:items'], expectations: [{
        expected: 'API 返回记录', assertionAdapterId: 'assert.api', observationChannel: 'api',
        authority: 'user-visible', terminalCondition: '响应稳定返回', sourceIds: ['formal:items'], contractIds: ['api:items'],
      }],
    });
    expect(errors).toContain('CASE-CHANNEL-001:expectation-1:OBSERVATION_AUTHORITY_MISMATCH:user-visible:api');
  });

  test('执行上下文必须包含可验证的功能开关指纹', () => {
    expect(validateSystemTestExecutionContext(undefined)).toContain('EXECUTION_CONTEXT_REQUIRED');
    const context = {
      environmentId: 'qa', locale: 'zh-CN', roleId: 'operator', tenantScope: 'merchant',
      featureFlagFingerprint: createHash('sha256').update('flags').digest('hex'),
    };
    expect(validateSystemTestExecutionContext(context)).toEqual([]);
    expect(fingerprintSystemTestExecutionContext(context)).toMatch(/^[a-f0-9]{64}$/);
  });

  test('旧版或伪造 complete 收据不能导入严格通过账本', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-governance-'));
    try {
      const reportPath = path.join(root, 'report.json');
      const payload = {
        caseId: 'CASE-RECEIPT-001', caseFingerprint: 'a'.repeat(64), complete: true,
        applicationVersionFingerprint: 'b'.repeat(64),
      };
      const report = { suites: [{ specs: [{ title: '收据测试', tags: ['@case-CASE-RECEIPT-001'], tests: [{ results: [{
        status: 'passed', startTime: '2026-08-20T00:00:00.000Z', duration: 1, attachments: [{
          name: 'test-execution-receipt', contentType: 'application/json', body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        }],
      }] }] }] }] };
      fs.writeFileSync(reportPath, JSON.stringify(report));
      const result = readPlaywrightExecutionReceipts({ reportPath, workspaceRoot: root });
      expect(result.records).toEqual([]);
      expect(result.diagnostics).toContain('CASE-RECEIPT-001:RUNTIME_RECEIPT_VERSION_UNSUPPORTED');
      expect(result.diagnostics).toContain('CASE-RECEIPT-001:RUNTIME_RECEIPT_CLAIMS_INCOMPLETE');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('没有发布身份但证据完整的本次执行可以通过且不得自动复用', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-no-release-'));
    try {
      const reportPath = path.join(root, 'report.json');
      const receipt = {
        receiptVersion: '2.0.0',
        caseId: 'CASE-NO-RELEASE-001',
        caseFingerprint: 'a'.repeat(64),
        executionEpochId: 'epoch-001',
        executionContext: {
          environmentId: 'qa', locale: 'zh-CN', roleId: 'operator', route: '/items',
        },
        releaseObservation: {
          status: 'unavailable' as const, fingerprint: null, source: 'unavailable', stable: false,
          observedAt: '2026-08-20T00:00:00.000Z',
        },
        claims: { required: ['ui:list'], observed: ['ui:list'], verified: ['ui:list'] },
        operationReceipts: [],
        cleanup: { apiZeroResidue: true, uiZeroResidue: true },
      };
      const payload = { ...receipt, evidenceFingerprint: fingerprintReceiptEvidence(receipt) };
      const report = { suites: [{ specs: [{
        title: '无发布身份收据', tags: ['@case-CASE-NO-RELEASE-001'], tests: [{ results: [{
          status: 'passed', startTime: '2026-08-20T00:00:00.000Z', duration: 1, attachments: [{
            name: 'test-execution-receipt', contentType: 'application/json',
            body: Buffer.from(JSON.stringify(payload)).toString('base64'),
          }],
        }] }],
      }] }] };
      fs.writeFileSync(reportPath, JSON.stringify(report));
      const result = readPlaywrightExecutionReceipts({ reportPath, workspaceRoot: root });
      expect(result.records).toHaveLength(1);
      expect(result.records[0]).toMatchObject({
        status: 'passed', evidenceStatus: 'complete', reuseStatus: 'run-only',
        applicationVersionFingerprint: null,
        releaseObservation: { status: 'unavailable' },
        cleanupEvidence: { apiZeroResidue: true, uiZeroResidue: true },
      });
      expect(result.records[0].receiptEvidenceFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(result.records[0].evidenceFileFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(result.diagnostics).toContain('CASE-NO-RELEASE-001:RUNTIME_RECEIPT_RELEASE_IDENTITY_UNAVAILABLE');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('4.0.0 当前正式收据按原始上下文导入，不回退兼容记录', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-v4-'));
    try {
      const reportPath = path.join(root, 'report.json');
      const receipt = {
        receiptVersion: '4.0.0', caseId: 'CASE-RECEIPT-V4-001', caseFingerprint: 'a'.repeat(64),
        semanticCaseFingerprint: 'b'.repeat(64), implementationFingerprint: 'c'.repeat(64),
        executionEpochId: 'epoch-v4-001',
        executionContext: { applicationVersionFingerprint: 'd'.repeat(64), environmentId: 'qa', tenantScope: 'merchant', locale: 'zh-CN', roleId: 'operator', route: '/items' },
        releaseObservation: { status: 'derived' as const, fingerprint: 'd'.repeat(64), source: 'browser-runtime', stable: false },
        claims: { required: ['claim:1'], observed: ['claim:1'], verified: ['claim:1'] },
        operationReceipts: [{ operationKey: 'items.create', observed: true, method: 'POST' }],
        cleanup: { apiZeroResidue: true, uiZeroResidue: true },
      };
      const payload = { ...receipt, evidenceFingerprint: fingerprintReceiptEvidence(receipt) };
      const report = { suites: [{ specs: [{ title: '4.0 收据', tags: ['@case-CASE-RECEIPT-V4-001'], tests: [{ results: [{
        status: 'passed', startTime: '2026-09-03T00:00:00.000Z', duration: 1, attachments: [{
          name: 'test-execution-receipt', contentType: 'application/json', body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        }],
      }] }] }] }] };
      fs.writeFileSync(reportPath, JSON.stringify(report));
      const result = readPlaywrightExecutionReceipts({ reportPath, workspaceRoot: root });
      expect(result.records).toHaveLength(1);
      expect(result.records[0].implementationFingerprint).toBe('c'.repeat(64));
      expect(result.records[0].executionContextFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(result.diagnostics).not.toContain('CASE-RECEIPT-V4-001:RUNTIME_RECEIPT_VERSION_UNSUPPORTED');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('3.1 正式收据必须包含真实观察到的可执行步骤', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-operation-gate-'));
    try {
      const reportPath = path.join(root, 'report.json');
      const receipt = {
        receiptVersion: '3.1.0',
        caseId: 'CASE-OPERATION-001',
        caseFingerprint: 'a'.repeat(64),
        implementationFingerprint: 'b'.repeat(64),
        executionEpochId: 'epoch-operation-001',
        executionContext: { environmentId: 'qa', locale: 'zh-CN', roleId: 'operator', route: '/items' },
        releaseObservation: { status: 'unavailable' as const, fingerprint: null, source: 'unavailable', stable: false },
        claims: { required: ['ui:list'], observed: ['ui:list'], verified: ['ui:list'] },
        operationReceipts: [],
        cleanup: { apiZeroResidue: true, uiZeroResidue: true },
      };
      const payload = { ...receipt, evidenceFingerprint: fingerprintReceiptEvidence(receipt) };
      const report = { suites: [{ specs: [{
        title: '正式步骤收据', tags: ['@case-CASE-OPERATION-001'], tests: [{ results: [{
          status: 'passed', startTime: '2026-08-20T00:00:00.000Z', duration: 1, attachments: [{
            name: 'test-execution-receipt', contentType: 'application/json',
            body: Buffer.from(JSON.stringify(payload)).toString('base64'),
          }],
        }] }],
      }] }] };
      fs.writeFileSync(reportPath, JSON.stringify(report));
      const result = readPlaywrightExecutionReceipts({ reportPath, workspaceRoot: root });
      expect(result.records).toEqual([]);
      expect(result.diagnostics).toContain('CASE-OPERATION-001:RUNTIME_RECEIPT_EXECUTABLE_OPERATIONS_INCOMPLETE');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('新版组收据清理明细全量验证后可兼容归一为标准零残留字段', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-group-cleanup-adapter-'));
    try {
      const reportPath = path.join(root, 'report.json');
      const standardReceipt = {
        receiptVersion: '2.0.0', caseId: 'TC-GRP-MTH-010', caseFingerprint: 'c'.repeat(64),
        executionEpochId: 'epoch-group-001',
        executionContext: { environmentId: 'qa', locale: 'zh-CN', roleId: 'operator', route: '/method' },
        releaseObservation: { status: 'unavailable' as const, fingerprint: null, source: 'unavailable', stable: false },
        claims: { required: ['claim:1'], observed: ['claim:1'], verified: ['claim:1'] },
        operationReceipts: [], cleanup: { apiZeroResidue: true, uiZeroResidue: true },
      };
      const payload = {
        ...standardReceipt,
        evidenceFingerprint: fingerprintReceiptEvidence(standardReceipt),
        handlerId: 'unreferenced-group-delete-confirmed', complete: true,
        requiredEvidence: ['navigation', 'cleanup'], observedEvidence: ['navigation', 'cleanup'],
        requiredAssertionIds: ['claim:1'], observedAssertionIds: ['claim:1'],
        cleanup: { entries: [{ phase: 'residue-verified' }] },
      };
      const report = { suites: [{ specs: [{
        title: '组收据兼容', tags: ['@case-TC-GRP-MTH-010'], tests: [{ results: [{
          status: 'passed', startTime: '2026-08-20T00:00:00.000Z', duration: 1, attachments: [{
            name: 'legacy-runtime-evidence', contentType: 'application/json',
            body: Buffer.from(JSON.stringify(payload)).toString('base64'),
          }],
        }] }],
      }] }] };
      fs.writeFileSync(reportPath, JSON.stringify(report));
      const result = readPlaywrightExecutionReceipts({ reportPath, workspaceRoot: root, attachmentNames: ['legacy-runtime-evidence'] });
      expect(result.records).toHaveLength(1);
      expect(result.diagnostics).not.toContain('TC-GRP-MTH-010:RUNTIME_RECEIPT_CLEANUP_INCOMPLETE');
      expect(result.diagnostics).not.toContain('TC-GRP-MTH-010:RUNTIME_RECEIPT_EVIDENCE_FINGERPRINT_MISMATCH');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

function sourceRegistry(): SystemTestSourceRegistry {
  return {
    schemaVersion: '1.0.0',
    sources: [{
      sourceId: 'formal:items', kind: 'formal-case', path: 'cases/items.md', fingerprint: 'c'.repeat(64), verified: true,
      routes: ['/items'], contractIds: ['ui:items', 'api:items'], observationChannels: ['ui', 'api'],
    }],
  };
}
