import { expect, test } from '@playwright/test';
import { planAllureResultRetention, type AllureResultFile } from '../../src/utils/allure-result-retention';
import { planContractChangeImpact } from '../../src/utils/contract-change-impact';
import { buildIncrementalTestPlan } from '../../src/utils/incremental-test-plan';
import { buildReviewBatches } from '../../src/utils/review-batch';
import { buildProcessDoctorReport } from '../../src/governance/process-doctor';
import { assertExecutionIntentCheckpointMetadata } from '../../src/governance/execution-intent';

test.describe('通用流程治理内核', () => {
  test('Allure 保留计划应保留当天并清理过期完整日期', async () => {
    const files: AllureResultFile[] = [
      { relativePath: 'old.json', modifiedAt: new Date('2026-07-24T10:00:00+08:00'), sizeBytes: 20 },
      { relativePath: 'today.json', modifiedAt: new Date('2026-07-27T10:00:00+08:00'), sizeBytes: 20 },
    ];
    const plan = planAllureResultRetention(files, new Date('2026-07-27T18:00:00+08:00'), {
      retainDays: 2,
      maxFiles: 10,
      maxBytes: 1_000,
    });

    expect(plan.deleteFiles.map((item) => item.relativePath)).toEqual(['old.json']);
    expect(plan.keepFiles.map((item) => item.relativePath)).toEqual(['today.json']);
  });

  test('合同变更应优先使用来源 ID 并稳定生成增量计划', async () => {
    const impacts = planContractChangeImpact(
      [{ collection: 'fields', id: 'field:a', route: '/route/a' }],
      [{ caseId: 'case:a', route: '/route/a', sourceIds: ['field:a'] }],
    );
    const input = {
      contractVersion: '1.0.0',
      diffFingerprint: 'a'.repeat(64),
      changedRecords: [{ collection: 'fields', id: 'field:a', route: '/route/a' }],
      impactedCases: impacts,
      traceability: [{
        caseId: 'case:a',
        sourceIds: ['field:a'],
        specFile: 'tests/case-a.spec.ts',
        testTitle: '字段 A',
        rerunGrep: '字段 A',
      }],
    };

    expect(impacts).toEqual([{ caseId: 'case:a', match: 'source-id', changeIds: ['field:a'] }]);
    expect(buildIncrementalTestPlan(input)).toEqual(buildIncrementalTestPlan(input));
  });

  test('增量计划缺少追溯记录时必须阻断', async () => {
    expect(() => buildIncrementalTestPlan({
      contractVersion: '1.0.0',
      diffFingerprint: 'b'.repeat(64),
      changedRecords: [],
      impactedCases: [{ caseId: 'missing', match: 'source-id', changeIds: ['field:missing'] }],
      traceability: [],
    })).toThrow('增量用例缺少追溯记录：missing');
  });

  test('审核批次必须无重复遗漏且不超过上限', async () => {
    const items = Array.from({ length: 43 }, (_, index) => ({
      id: `review-${index + 1}`,
      group: index < 21 ? 'group-a' : 'group-b',
      payload: { question: `问题 ${index + 1}` },
    }));
    const result = buildReviewBatches(items, 20);
    const ids = result.batches.flatMap((batch) => batch.items.map((item) => item.id));

    expect(result.batches.every((batch) => batch.items.length <= 20)).toBe(true);
    expect(new Set(ids).size).toBe(43);
  });

  test('流程诊断必须保持 report-only 并隔离跨系统暂缓状态', async () => {
    const report = buildProcessDoctorReport({
      scope: 'synthetic-project',
      readiness: { status: 'candidate', crossSystemReady: false, readinessPath: 'readiness.json', verdictPath: 'verdict.json' },
      checkpointGaps: [{ file: 'checkpoint.json', gaps: ['selectionFingerprint'] }],
    });
    expect(report.executionScope).toBe('report-only');
    expect(report.guardrails.businessUiWrites).toBe(false);
    expect(report.guardrails.rerunPassedCases).toBe(false);
    expect(report.findings.map((item) => item.findingId)).toEqual(['CROSS-SYSTEM-DEFERRED', 'CHECKPOINT-METADATA']);
    expect(report.findings.find((item) => item.findingId === 'CROSS-SYSTEM-DEFERRED')?.status).toBe('deferred');
  });

  test('断点恢复缺少选择集元数据时必须硬阻断', async () => {
    expect(() => assertExecutionIntentCheckpointMetadata({
      intentFingerprint: 'intent',
      selectedFingerprint: '',
      selectedCaseIds: ['case-1'],
      terminalCaseIds: [],
      incompleteCaseIds: ['case-1'],
    })).toThrow('EXECUTION_INTENT_CHECKPOINT_METADATA_REQUIRED');
    expect(() => assertExecutionIntentCheckpointMetadata({
      intentFingerprint: 'intent',
      selectedFingerprint: 'selection',
      selectedCaseIds: ['case-1'],
      terminalCaseIds: [],
      incompleteCaseIds: ['case-1'],
    })).not.toThrow();
  });
});
