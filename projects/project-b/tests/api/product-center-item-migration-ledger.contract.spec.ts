import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterItemMigrationLedger } from '../../scripts/build-product-center-item-migration-ledger';
import { buildProductCenterItemStrictBatchPlan } from '../../scripts/build-product-center-item-strict-batch-plan';

const root = path.resolve(__dirname, '../..');
const ledgerPath = path.resolve(root, '..', 'deliverables/product-center-item/migration-ledger.json');
const planPath = path.resolve(root, '..', 'deliverables/product-center-item/strict-batch-plan.json');
const manifestPath = path.resolve(root, 'contracts/product-center/test-manifests/product-center-item-strict-revalidation-v1.json');

test.describe('商品管理迁移台账与严格批次合同', () => {
  test('台账必须拆分历史通过、严格通过、延期和补充观察', () => {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const statusCounts = ledger.cases.reduce((counts: Record<string, number>, item: { status: string }) => {
      counts[item.status] = (counts[item.status] ?? 0) + 1;
      return counts;
    }, {});
    expect(ledger.summary).toMatchObject({
      formalCases: 216,
      executableCases: 213,
      strictPassed: 17,
      productFinding: 5,
      legacyPassed: 180,
      deferred: 11,
      notApplicable: 3,
      supplementalReviewed: 16,
      unresolved: 0,
      strictRevalidationRemaining: 180,
    });
    expect((Object.values(statusCounts) as number[]).reduce((sum, value) => sum + value, 0)).toBe(232);
    expect(statusCounts['strict-passed']).toBe(17);
    expect(statusCounts['product-finding']).toBe(5);
    expect(statusCounts['legacy-passed']).toBe(180);
  });

  test('严格批次计划必须覆盖台账剩余且不包含延期或补充观察', () => {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    const ids = plan.batches.flatMap((batch: { caseIds: string[] }) => batch.caseIds);
    const remaining = ledger.cases.filter((item: { status: string }) => item.status === 'legacy-passed').map((item: { caseId: string }) => item.caseId);
    expect(plan.totalCases).toBe(180);
    expect(ids).toHaveLength(180);
    expect(new Set(ids).size).toBe(180);
    expect(new Set(ids)).toEqual(new Set(remaining));
    expect(ids.some((caseId: string) => caseId.startsWith('TC-ITEM-UI-'))).toBe(false);
  });

  test('严格 manifest 必须绑定当前发布指纹和完整批次用例', () => {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.sourceRelease.executableFingerprint).toBe(ledger.source.executableFingerprint);
    expect(manifest.caseBindings).toHaveLength(180);
    expect(new Set(manifest.caseBindings.map((item: { caseId: string }) => item.caseId)).size).toBe(180);
    expect(manifest.caseBindings.every((item: { ruleId: string; caseId: string; dataProfile: string }) => (
      item.ruleId === item.caseId.replace(/^TC-/, 'CBR-')
      && /^item-(standard|package|addon)-/.test(item.dataProfile)
    ))).toBe(true);
  });

  test('批次计划构建必须拒绝非正整数批次大小', () => {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    expect(() => buildProductCenterItemStrictBatchPlan(ledger, 0)).toThrow();
    expect(() => buildProductCenterItemStrictBatchPlan(ledger, 1.5)).toThrow();
    expect(buildProductCenterItemMigrationLedger(root).summary.strictRevalidationRemaining).toBe(180);
  });

  test('严格重验证调度器必须继续独立批次并保留发现状态', () => {
    const source = fs.readFileSync(path.resolve(root, 'scripts/run-product-center-item-strict-revalidation.ts'), 'utf8');
    expect(source).toContain("'completed-with-findings'");
    expect(source).toContain('readBatchRunReport');
    expect(source).toContain('continue;');
    expect(source).toContain("report.status === 'blocked' || report.status === 'circuit-broken'");
  });
});
