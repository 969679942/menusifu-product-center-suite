import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');
const reportPath = path.resolve(
  projectRoot,
  '../deliverables/test-plan-governance/product-center-historical-receipt-compatibility.json',
);

test.describe('商品中心历史收据当前兼容性适配合同', () => {
  test('逐条分类守恒且只有完全匹配项允许导入', () => {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
      scope: { targetCaseCount: number };
      policy: { pageExecutionTriggered: boolean; importExactMatchesOnly: boolean };
      summary: Record<string, number | boolean>;
      exactMatchImportCaseIds: string[];
      fingerprintLineageReviewCaseIds: string[];
      directRerunCandidateCaseIds: string[];
      cases: Array<{ caseId: string; status: string; blockers: string[]; importableRecordKey: string | null }>;
    };
    expect(report.policy).toMatchObject({ pageExecutionTriggered: false, importExactMatchesOnly: true });
    expect(report.cases).toHaveLength(report.scope.targetCaseCount);
    expect(new Set(report.cases.map((item) => item.caseId)).size).toBe(report.cases.length);
    expect(report.exactMatchImportCaseIds).toEqual(report.cases
      .filter((item) => item.status === 'exact-match-importable').map((item) => item.caseId));
    expect(report.cases.filter((item) => item.importableRecordKey)).toHaveLength(report.exactMatchImportCaseIds.length);
    expect(report.fingerprintLineageReviewCaseIds
      .filter((caseId) => report.directRerunCandidateCaseIds.includes(caseId))).toEqual([]);
  });

  test('当前历史协调集合不能因方案级指纹漂移被误导入或直接重跑', () => {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
      scope: { targetCaseCount: number };
      summary: Record<string, number>;
      cases: Array<{ status: string; blockers: string[] }>;
    };
    expect(report.scope.targetCaseCount).toBe(report.cases.length);
    expect(report.scope.targetCaseCount).toBeGreaterThan(0);
    expect(report.summary['exact-match-importable']).toBe(0);
    expect(report.summary['case-fingerprint-mismatch']).toBe(report.scope.targetCaseCount);
    expect(report.summary.directRerunCandidates).toBe(0);
    expect(report.cases.every((item) => item.blockers.includes('CASE_FINGERPRINT_MISMATCH'))).toBe(true);
  });
});
