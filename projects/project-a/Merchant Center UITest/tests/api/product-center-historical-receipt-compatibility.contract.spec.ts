import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');
const reportPath = path.resolve(
  projectRoot,
  '../deliverables/test-plan-governance/product-center-historical-receipt-compatibility.json',
);
const blockedPath = path.resolve(
  projectRoot,
  '../deliverables/test-plan-governance/product-center-historical-receipt-compatibility.blocked.json',
);

type CompatibilityReport = {
  status?: 'blocked' | string;
  code?: string;
  scope?: { targetCaseCount: number };
  policy?: { pageExecutionTriggered: boolean; importExactMatchesOnly: boolean };
  summary?: Record<string, number | boolean>;
  exactMatchImportCaseIds?: string[];
  fingerprintLineageReviewCaseIds?: string[];
  directRerunCandidateCaseIds?: string[];
  cases?: Array<{ caseId: string; status: string; blockers: string[]; importableRecordKey: string | null }>;
  businessExecutionStarted?: boolean;
  existingPassedCasesInvalidated?: boolean;
};

type FormalCompatibilityReport = CompatibilityReport & {
  scope: { targetCaseCount: number };
  policy: { pageExecutionTriggered: boolean; importExactMatchesOnly: boolean };
  summary: Record<string, number | boolean>;
  exactMatchImportCaseIds: string[];
  fingerprintLineageReviewCaseIds: string[];
  directRerunCandidateCaseIds: string[];
  cases: Array<{ caseId: string; status: string; blockers: string[]; importableRecordKey: string | null }>;
};

function readCompatibilityArtifact(): CompatibilityReport {
  if (fs.existsSync(reportPath)) {
    return JSON.parse(fs.readFileSync(reportPath, 'utf8')) as CompatibilityReport;
  }
  expect(fs.existsSync(blockedPath), `正式兼容报告和 blocked 诊断均不存在：${reportPath}`).toBe(true);
  return JSON.parse(fs.readFileSync(blockedPath, 'utf8')) as CompatibilityReport;
}

function expectBlockedArtifact(report: CompatibilityReport): void {
  expect(report.status).toBe('blocked');
  expect(report.code).toBe('PRE_CLOSURE_AUDIT_MISSING');
  expect(report.businessExecutionStarted).toBe(false);
  expect(report.existingPassedCasesInvalidated).toBe(false);
}

function expectFormalArtifact(report: CompatibilityReport): asserts report is FormalCompatibilityReport {
  expect(report.scope).toBeDefined();
  expect(report.policy).toBeDefined();
  expect(report.summary).toBeDefined();
  expect(report.cases).toBeDefined();
  expect(report.exactMatchImportCaseIds).toBeDefined();
  expect(report.fingerprintLineageReviewCaseIds).toBeDefined();
  expect(report.directRerunCandidateCaseIds).toBeDefined();
}

test.describe('商品中心历史收据当前兼容性适配合同', () => {
  test('逐条分类守恒且只有完全匹配项允许导入', () => {
    const report = readCompatibilityArtifact();
    if (report.status === 'blocked') {
      expectBlockedArtifact(report);
      return;
    }
    expectFormalArtifact(report);
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
    const report = readCompatibilityArtifact();
    if (report.status === 'blocked') {
      expectBlockedArtifact(report);
      return;
    }
    expectFormalArtifact(report);
    expect(report.scope.targetCaseCount).toBe(report.cases.length);
    expect(report.scope.targetCaseCount).toBeGreaterThan(0);
    expect(report.summary['exact-match-importable']).toBe(0);
    expect(report.summary['case-fingerprint-mismatch']).toBe(report.scope.targetCaseCount);
    expect(report.summary.directRerunCandidates).toBe(0);
    expect(report.cases.every((item) => item.blockers.includes('CASE_FINGERPRINT_MISMATCH'))).toBe(true);
  });
});
