import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { parseProductCenterItemCaseSemanticFingerprints } from '../../utils/product-center-item-case-semantic-fingerprint';

const projectRoot = path.resolve(__dirname, '../..');
const workspaceRoot = path.resolve(projectRoot, '..');
const canonicalPath = path.resolve(
  workspaceRoot,
  'Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
);
const reportPath = path.resolve(
  workspaceRoot,
  'deliverables/test-plan-governance/product-center-item-case-fingerprint-shadow.json',
);
const closureFlowPath = path.resolve(projectRoot, 'scripts/run-product-center-evidence-closure-flow.ts');

test.describe('商品用例逐用例指纹影子迁移合同', () => {
  test('218条正式用例均生成唯一逐用例语义指纹', () => {
    const cases = parseProductCenterItemCaseSemanticFingerprints(canonicalPath);
    expect(cases).toHaveLength(218);
    expect(new Set(cases.map((item) => item.caseId)).size).toBe(218);
    expect(new Set(cases.map((item) => item.fingerprint)).size).toBe(218);
  });

  test('影子报告分类守恒且绝不修改当前状态或启动页面', () => {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
      scope: { totalCases: number; historicalCompatibilityTargetCases: number };
      policy: Record<string, boolean | number | string>;
      summary: Record<string, number | boolean>;
      cases: Array<{ caseId: string; classification: string; currentStatus: string }>;
    };
    expect(report.scope).toMatchObject({
      applicationId: 'merchant-center',
      module: '商品管理-商品',
      totalCases: 218,
    });
    expect(report.scope.historicalCompatibilityTargetCases).toBeGreaterThan(0);
    expect(report.scope.historicalCompatibilityTargetCases).toBeLessThanOrEqual(report.scope.totalCases);
    expect(report.policy).toMatchObject({
      mode: 'shadow-only',
      activeFingerprintReplaced: false,
      executionStateModified: false,
      caseStatusModified: false,
      historicalReceiptModified: false,
      pageExecutionTriggered: false,
      browserExecutionCount: 0,
    });
    expect(new Set(report.cases.map((item) => item.caseId)).size).toBe(218);
    const classified = [
      'safe-lineage-mappable',
      'historical-semantic-evidence-insufficient',
      'semantic-change-detected',
      'current-passed-impact',
      'not-bound-deferred-not-applicable',
    ].reduce((total, key) => total + Number(report.summary[key]), 0);
    expect(classified).toBe(218);
    expect(Number(report.summary.currentPassedResultsPreserved)).toBeGreaterThan(0);
    expect(report.summary.recommendedImmediateCutover).toBe(false);
  });

  test('影子审计已接入证据闭环但保持静态执行', () => {
    const source = fs.readFileSync(closureFlowPath, 'utf8');
    expect(source).toContain("id: 'item-case-fingerprint-shadow'");
    expect(source).toContain("scripts/build-product-center-item-case-fingerprint-shadow.ts");
    expect(source).not.toMatch(/item-case-fingerprint-shadow[\s\S]{0,800}--execute/);
  });
});
