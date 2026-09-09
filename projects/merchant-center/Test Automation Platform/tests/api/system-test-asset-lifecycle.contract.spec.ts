import { expect, test } from '@playwright/test';
import {
  buildSystemTestAssetLifecycleLedger,
  type SystemTestAssetLifecycleInput,
} from '../../src/automation/system-test/system-test-asset-lifecycle';

function asset(overrides: Partial<SystemTestAssetLifecycleInput> = {}): SystemTestAssetLifecycleInput {
  return {
    applicationId: 'app',
    businessDomainId: 'domain',
    caseId: 'TC-001',
    title: '用例',
    module: 'module',
    sourceIds: ['source'],
    canonical: {
      sourcePath: 'cases.md',
      sourceFingerprint: 'a'.repeat(64),
      caseFingerprint: 'b'.repeat(64),
      indexPresent: true,
    },
    binding: {
      status: 'bound',
      fingerprint: 'c'.repeat(64),
      scriptPath: 'case.spec.ts',
      indexStatus: 'landed',
    },
    classification: null,
    currentExecution: {
      implementationFingerprint: 'd'.repeat(64),
      contextFingerprint: 'e'.repeat(64),
    },
    execution: {
      caseFingerprint: 'b'.repeat(64),
      implementationFingerprint: 'd'.repeat(64),
      contextFingerprint: 'e'.repeat(64),
      status: 'passed',
      evidenceStatus: 'complete',
      receiptEvidenceFingerprint: 'f'.repeat(64),
      evidenceFileFingerprint: '1'.repeat(64),
      recordedAt: '2026-09-04T00:00:00.000Z',
    },
    ...overrides,
  };
}

test.describe('统一资产生命周期合同', () => {
  test('handled 不进入执行分母但保留生命周期分类', () => {
    const result = buildSystemTestAssetLifecycleLedger({
      scope: 'contract',
      applicationId: 'app',
      businessDomainId: 'domain',
      sourceManifest: [],
      cases: [asset(), asset({
        caseId: 'TC-002',
        classification: { disposition: 'handled', reason: '已处理', recoveryCondition: '标准收据迁移' },
        execution: { ...asset().execution, status: 'not-run', caseFingerprint: null },
      })],
    });
    expect(result.summary).toMatchObject({ planned: 2, executionEligible: 1, classifiedExclusions: 1, executed: 1, passed: 1 });
    expect(result.invariants.plannedEqualsEligiblePlusExclusions).toBe(true);
    expect(result.invariants.noOrphanReferenceEntries).toBe(true);
    expect(result.cases.find((item) => item.caseId === 'TC-002')?.lifecycleStatus).toBe('handled');
  });

  test('不匹配的执行指纹不能产生通过状态', () => {
    const result = buildSystemTestAssetLifecycleLedger({
      scope: 'contract',
      applicationId: 'app',
      businessDomainId: 'domain',
      sourceManifest: [],
      cases: [asset({ execution: { ...asset().execution, caseFingerprint: '9'.repeat(64) } })],
    });
    expect(result.cases[0].lifecycleStatus).toBe('invalid');
    expect(result.cases[0].reconciliation.issues).toContain('EXECUTION_CASE_FINGERPRINT_MISMATCH');
    expect(result.invariants.noPassedWithoutCompleteReceipt).toBe(true);
  });

  test('实现或上下文指纹不匹配时保留历史观察但不得计为已执行', () => {
    const result = buildSystemTestAssetLifecycleLedger({
      scope: 'contract',
      applicationId: 'app',
      businessDomainId: 'domain',
      sourceManifest: [],
      cases: [
        asset({ execution: { ...asset().execution, implementationFingerprint: '8'.repeat(64) } }),
        asset({
          caseId: 'TC-002',
          execution: { ...asset().execution, contextFingerprint: '7'.repeat(64) },
        }),
      ],
    });
    expect(result.summary.executed).toBe(0);
    expect(result.cases[0].reconciliation.issues).toContain('EXECUTION_IMPLEMENTATION_FINGERPRINT_MISMATCH');
    expect(result.cases[1].reconciliation.issues).toContain('EXECUTION_CONTEXT_FINGERPRINT_MISMATCH');
  });

  test('已分类排除用例不因历史旧收据进入适配队列', () => {
    const result = buildSystemTestAssetLifecycleLedger({
      scope: 'contract',
      applicationId: 'app',
      businessDomainId: 'domain',
      sourceManifest: [],
      cases: [asset({
        classification: { disposition: 'not-applicable', reason: '已废弃', recoveryCondition: '产品重新定义' },
        execution: { ...asset().execution, receiptEvidenceFingerprint: null, evidenceFileFingerprint: null },
      })],
    });
    expect(result.cases[0].lifecycleStatus).toBe('not-applicable');
    expect(result.cases[0].reconciliation.issues).not.toContain('PASSED_RECEIPT_INCOMPLETE');
  });
});
