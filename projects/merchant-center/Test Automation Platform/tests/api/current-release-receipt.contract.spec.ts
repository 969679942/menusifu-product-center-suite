import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fingerprintExecutionContext } from '../../src/utils/test-execution-state';
import { fingerprintReceiptEvidence } from '../../src/utils/playwright-execution-receipt';
import { readPlaywrightRuntimeReceiptCandidates } from '../../src/utils/playwright-execution-receipt';
import { qualifyCurrentReleaseReceipt, type CurrentReleaseCaseContract } from '../../src/governance/current-release-receipt';

function fixture() {
  const context = { applicationVersionFingerprint: 'd'.repeat(64), environmentId: 'neutral', tenantScope: 'synthetic', locale: 'en', roleId: 'operator', route: '/records' };
  const contract: CurrentReleaseCaseContract = { caseId: 'CASE-001', caseFingerprint: 'a'.repeat(64), semanticCaseFingerprint: 'b'.repeat(64), implementationFingerprint: 'c'.repeat(64), executionContextFingerprint: fingerprintExecutionContext(context), requiredOperationKeys: ['create'], requiredAssertionIds: ['visible'], cleanupRequired: true };
  const receipt = { receiptVersion: '4.0.0', caseId: contract.caseId, caseFingerprint: contract.caseFingerprint, semanticCaseFingerprint: contract.semanticCaseFingerprint, implementationFingerprint: contract.implementationFingerprint,
    executionContext: context, claims: { required: ['visible'], observed: ['visible'], verified: ['visible'] },
    operationReceipts: [{ operationKey: 'create', method: 'Port.create', observed: true, status: 'passed', startedAt: '2026-09-08T00:00:00Z', finishedAt: '2026-09-08T00:00:01Z' }],
    assertionReceipts: [{ claimId: 'visible', status: 'verified', expectedValue: 1, actualValue: 1, actualStatus: 'observed', observationChannel: 'ui', authority: 'user-visible', comparison: 'matched' }],
    cleanup: { apiZeroResidue: true, uiZeroResidue: true, apiIdentityCounts: { entity: 0 }, uiIdentityCounts: { entity: 0 } }, evidenceFingerprint: '',
  };
  const qualify = (candidate: unknown = receipt) => qualifyCurrentReleaseReceipt(contract, candidate);
  const seal = () => { receipt.evidenceFingerprint = fingerprintReceiptEvidence(receipt as Parameters<typeof fingerprintReceiptEvidence>[0]); };
  seal();
  return { contract, receipt, qualify, seal };
}

test('当前完整逐操作断言上下文与清理收据可以取得发布资格', () => {
  expect(fixture().qualify()).toEqual({ accepted: true, reasons: [] });
});

test('当前显式调用映射可接受嵌套辅助记录，缺步骤或未声明记录仍拒绝', () => {
  const f = fixture();
  f.contract.requiredOperationKeys = ['first', 'second'];
  f.contract.operationMapping = { schemaVersion: '1.0.0', sourceStepIds: ['step-1', 'step-2'],
    business: [{ operationKey: 'first', sourceStepId: 'step-1', executableOperationKey: 'Port.click', occurrence: 1 },
      { operationKey: 'second', sourceStepId: 'step-2', executableOperationKey: 'Port.click', occurrence: 2 }],
    supporting: [{ executableOperationKey: 'Flow.execute', occurrence: 1, required: true }] };
  const base = f.receipt.operationReceipts[0];
  const operations = [{ ...base, sequence: 2, operationKey: 'Port.click' }, { ...base, sequence: 3, operationKey: 'Port.click' },
    { ...base, sequence: 1, operationKey: 'Flow.execute' }];
  f.receipt.operationReceipts = operations; f.seal();
  expect(f.qualify()).toEqual({ accepted: true, reasons: [] });
  operations.push({ ...base, sequence: 4, operationKey: 'Undeclared.read' }); f.seal();
  expect(f.qualify().reasons).toContain('UNDECLARED_OPERATION_OCCURRENCE');
  operations.pop(); operations.splice(1, 1); f.seal();
  expect(f.qualify().reasons).toContain('BUSINESS_OPERATION_OCCURRENCE_MISSING');
});

test('历史通过摘要和缺失收据不能取得当前发布资格', () => {
  const f = fixture();
  for (const candidate of [null, { remainingFailedCaseIds: [] }, { status: 'runtime-passed', observed: true }, { ...f.receipt, operationReceipts: [], assertionReceipts: [] }]) {
    expect(f.qualify(candidate).accepted).toBe(false);
  }
});

test('指纹或上下文变化必须拒绝收据，重新自报哈希不能绕过当前合同', () => {
  for (const key of ['caseFingerprint', 'semanticCaseFingerprint', 'implementationFingerprint'] as const) {
    const f = fixture(); f.receipt[key] = 'f'.repeat(64); f.seal();
    expect(f.qualify().accepted).toBe(false);
  }
  const f = fixture(); f.receipt.executionContext.tenantScope = 'other'; f.seal();
  expect(f.qualify().reasons).toContain('EXECUTION_CONTEXT_MISMATCH');
});

test('缺失或重复操作、空实际值和不匹配断言不能取得发布资格', () => {
  const duplicate = fixture(); duplicate.receipt.operationReceipts.push({ ...duplicate.receipt.operationReceipts[0] }); duplicate.seal();
  expect(duplicate.qualify().reasons).toContain('OPERATION_RECEIPT_CARDINALITY_INVALID');
  const actual = fixture(); delete (actual.receipt.assertionReceipts[0] as { actualValue?: number }).actualValue; actual.seal();
  expect(actual.qualify().reasons).toContain('ASSERTION_ACTUAL_MISSING');
  const mismatch = fixture(); mismatch.receipt.assertionReceipts[0].comparison = 'mismatched'; mismatch.seal();
  expect(mismatch.qualify().accepted).toBe(false);
});

test('清理布尔自报或未执行操作必须拒绝，不能以完整摘要代替明细', () => {
  const f = fixture(); f.receipt.cleanup.apiIdentityCounts = {} as { entity: number }; f.seal();
  expect(f.qualify().reasons).toContain('CLEANUP_OBSERVATION_MISSING');
  const identities = fixture(); identities.receipt.cleanup.uiIdentityCounts = { unrelated: 0 } as unknown as { entity: number }; identities.seal();
  expect(identities.qualify().reasons).toContain('CLEANUP_IDENTITY_SET_MISMATCH');
  const operation = fixture(); operation.receipt.operationReceipts[0].startedAt = ''; operation.seal();
  expect(operation.qualify().reasons).toContain('OPERATION_EXECUTION_EVIDENCE_INCOMPLETE');
  const claims = fixture(); claims.receipt.claims.required = []; claims.seal();
  expect(claims.qualify().reasons).toContain('DECLARED_ASSERTION_SET_MISMATCH');
});

test('原始报告按实际时间保留最近失败，时间未知不能回退旧成功', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'current-release-attempt-'));
  try {
    const file = path.join(root, 'report.json');
    const results = [
      { status: 'passed', startTime: '2026-09-08T08:00:00+08:00' },
      { status: 'failed', startTime: '2026-09-08T00:01:00Z' },
    ];
    const write = () => fs.writeFileSync(file, JSON.stringify({ suites: [{ specs: [{ tests: [{ annotations: [{ type: 'case-id', description: 'CASE-001' }], results }] }] }] }));
    write();
    expect(readPlaywrightRuntimeReceiptCandidates(file)[0].status).toBe('failed');
    results.push({ status: 'passed', startTime: 'unknown' }); write();
    expect(readPlaywrightRuntimeReceiptCandidates(file)[0].startedAt).toBe('unknown');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
