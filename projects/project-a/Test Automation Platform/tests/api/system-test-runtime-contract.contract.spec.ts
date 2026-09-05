import { expect, test } from '@playwright/test';
import {
  evaluateSystemTestRuntimeContract,
  type RuntimeAssertionReceipt,
  type RuntimeOperationReceipt,
} from '../../src/automation/system-test/system-test-runtime-contract';
import { evaluateSystemTestRuntimeEvidence } from '../../src/automation/system-test/system-test-evidence';
import type { SystemTestCompiledCase } from '../../src/automation/system-test/system-test-contract';

const operation: RuntimeOperationReceipt = {
  operationKey: 'entity.update', observed: true, method: 'PUT', status: 'passed',
};

const assertion: RuntimeAssertionReceipt = {
  claimId: 'case-1:assertion-1', status: 'verified', expectedValue: '已保存', actualValue: '已保存',
  actualStatus: 'observed', observationChannel: 'ui', authority: 'user-visible', comparison: 'matched',
};

test.describe('公共运行时收据合同', () => {
  test('所有声明业务操作和断言均有结构化收据时才完整', () => {
    expect(evaluateSystemTestRuntimeContract({
      caseId: 'case-1', requiredOperationKeys: ['entity.update'], requiredAssertionIds: ['case-1:assertion-1'],
      operationReceipts: [operation], assertionReceipts: [assertion],
    })).toMatchObject({ status: 'complete', findings: [] });
  });

  test('漏操作、重复操作、孤立操作和缺少期望实际值必须阻断', () => {
    const result = evaluateSystemTestRuntimeContract({
      caseId: 'case-1', requiredOperationKeys: ['entity.update', 'entity.cleanup'], requiredAssertionIds: ['case-1:assertion-1'],
      operationReceipts: [operation, operation, { ...operation, operationKey: 'entity.extra' }],
      assertionReceipts: [{ ...assertion, expectedValue: undefined, actualValue: undefined, actualStatus: 'observed' }],
    });
    expect(result.status).toBe('incomplete');
    expect(result.missingOperationKeys).toEqual(['entity.cleanup']);
    expect(result.duplicateOperationKeys).toEqual(['entity.update']);
    expect(result.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      'OPERATION_RECEIPT_MISSING', 'OPERATION_RECEIPT_DUPLICATE', 'OPERATION_RECEIPT_ORPHAN',
      'ASSERTION_EXPECTED_MISSING', 'ASSERTION_ACTUAL_MISSING',
    ]));
  });

  test('同一业务方法的不同执行序号是合法操作序列，相同执行实例仍判重复', () => {
    const sequenced = evaluateSystemTestRuntimeContract({
      caseId: 'case-1', requiredOperationKeys: ['entity.update'], requiredAssertionIds: [],
      operationReceipts: [
        { ...operation, sequence: 1, startedAt: '2026-09-01T01:00:00.000Z', finishedAt: '2026-09-01T01:00:01.000Z' },
        { ...operation, sequence: 2, startedAt: '2026-09-01T01:00:02.000Z', finishedAt: '2026-09-01T01:00:03.000Z' },
      ],
    });
    expect(sequenced).toMatchObject({ status: 'complete', duplicateOperationKeys: [] });

    const duplicated = evaluateSystemTestRuntimeContract({
      caseId: 'case-1', requiredOperationKeys: ['entity.update'], requiredAssertionIds: [],
      operationReceipts: [{ ...operation, sequence: 1 }, { ...operation, sequence: 1 }],
    });
    expect(duplicated.status).toBe('incomplete');
    expect(duplicated.duplicateOperationKeys).toEqual(['entity.update']);
  });

  test('实际值无法观测时必须说明原因且不能成为完整收据', () => {
    const result = evaluateSystemTestRuntimeContract({
      caseId: 'case-1', requiredOperationKeys: [], requiredAssertionIds: ['case-1:assertion-1'],
      assertionReceipts: [{ ...assertion, actualValue: undefined, actualStatus: 'unobserved', unobservedReason: '' }],
    });
    expect(result.status).toBe('incomplete');
    expect(result.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      'ASSERTION_ACTUAL_UNOBSERVED', 'ASSERTION_UNOBSERVED_REASON_MISSING',
    ]));
  });

  test('观察通道和断言状态必须与验证权威及比较结果一致', () => {
    const result = evaluateSystemTestRuntimeContract({
      caseId: 'case-1', requiredOperationKeys: [], requiredAssertionIds: ['case-1:assertion-1'],
      assertionReceipts: [{
        ...assertion, status: 'verified', comparison: 'mismatched', observationChannel: 'api', authority: 'user-visible',
      }],
    });
    expect(result.status).toBe('incomplete');
    expect(result.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      'ASSERTION_OBSERVATION_INVALID', 'ASSERTION_COMPARISON_INVALID',
    ]));
  });

  test('严格合同版本接入公共证据评估器且旧证据保持兼容', () => {
    const item = {
      caseId: 'case-1', requiredOperationKeys: ['entity.update'], mutationMode: 'none',
      expectationClaims: [{ claimId: 'case-1:assertion-1' }], requiredContextGuards: [],
    } as unknown as SystemTestCompiledCase;
    const evidence = {
      caseId: 'case-1', runtimeContractVersion: '2.0.0' as const,
      operationReceipts: [{ ...operation }],
      assertionReceipts: [{ ...assertion, assertionAdapterId: 'assertion.contract' }],
    };
    expect(evaluateSystemTestRuntimeEvidence(item, evidence)).toMatchObject({
      status: 'complete', runtimeContract: { status: 'complete', findings: [] },
    });
    expect(evaluateSystemTestRuntimeEvidence(item, {
      caseId: 'case-1', assertionReceipts: [],
    })).not.toHaveProperty('runtimeContract');
  });
});
