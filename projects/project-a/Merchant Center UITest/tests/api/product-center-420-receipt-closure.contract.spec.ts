import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { fingerprintReceiptEvidence } from '../../utils/playwright-execution-receipt';
import { auditProductCenter420ReceiptClosure } from '../../scripts/audit-product-center-420-receipt-closure';

test('逐案闭包审计拒绝失败结果把 mismatch claim 写成 verified', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-420-receipt-'));
  const receipt = {
    receiptVersion: '3.1.0',
    caseId: 'TC-TAG-BDG-019',
    caseFingerprint: 'a'.repeat(64),
    implementationFingerprint: 'b'.repeat(64),
    executionContext: { environmentId: 'qa', tenantScope: 'brand', locale: 'zh-CN', roleId: 'operator', route: '/tags' },
    claims: { required: ['claim-1'], observed: ['claim-1'], verified: ['claim-1'] },
    operationReceipts: [{ operationKey: 'tag:update', method: 'PUT', observed: true, status: 'passed' as const }],
    assertionReceipts: [{
      claimId: 'claim-1',
      status: 'observed-mismatch' as const,
      expectedValue: '过期角标隐藏',
      actualValue: '仍显示',
      actualStatus: 'observed' as const,
      observationChannel: 'ui' as const,
      authority: 'user-visible' as const,
      comparison: 'mismatched' as const,
    }],
    cleanup: { apiZeroResidue: true, uiZeroResidue: true },
  };
  const fullReceipt = { ...receipt, evidenceFingerprint: fingerprintReceiptEvidence(receipt) };
  fs.writeFileSync(path.join(root, 'receipt.json'), JSON.stringify(fullReceipt));
  fs.writeFileSync(path.join(root, 'failure.png'), 'png');
  fs.writeFileSync(path.join(root, 'case-result.json'), JSON.stringify({
    status: 'failed',
    statusDetails: { message: '业务断言观察不一致：claim-1' },
    labels: [{ name: 'caseId', value: 'TC-TAG-BDG-019' }],
    steps: [
      { name: '[环境] 登录 → 商品中心 → 标签', status: 'passed' },
      { name: '[业务操作] 修改角标有效期', status: 'passed', attachments: [{ name: '业务操作执行收据', type: 'application/json', source: 'receipt.json' }] },
      { name: '[断言] 核对过期角标', status: 'failed', steps: [{ name: '期望：隐藏｜实际：显示｜结果：失败', status: 'failed', attachments: [{ name: '失败截图附件', type: 'image/png', source: 'failure.png' }] }] },
      { name: '[清理] API/UI 零残留', status: 'passed' },
      { name: '执行结论：失败', status: 'failed' },
    ],
  }));
  const report = auditProductCenter420ReceiptClosure({
    resultsDir: root,
    coverage: { summary: { total: 1, actualResultCases: 1, notRun: 0 }, cases: [{ caseId: 'TC-TAG-BDG-019', title: '角标过期', module: 'tag', executionStatus: 'failed', governanceStatus: 'execute' }] },
    governance: { executionCases: [{ caseId: 'TC-TAG-BDG-019', status: 'failed' }], nonExecutionTasks: [] },
    optimizationPlan: { caseFingerprints: { 'TC-TAG-BDG-019': 'a'.repeat(64) }, implementationFingerprints: { 'TC-TAG-BDG-019': 'b'.repeat(64) } },
  });
  expect(report.status).toBe('incomplete');
  expect(report.findings.map((item) => item.code)).toContain('FAILED_CLAIM_VERIFICATION_FALSE');
  expect(report.rerunPlan.requiredCaseIds).toEqual(['TC-TAG-BDG-019']);
});

test('逐案闭包审计接受完整 mismatch 收据与治理未运行 disposition', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-420-receipt-ok-'));
  const receipt = {
    receiptVersion: '3.1.0',
    caseId: 'TC-ITEM-ADD-035',
    caseFingerprint: 'c'.repeat(64),
    implementationFingerprint: 'd'.repeat(64),
    executionContext: { environmentId: 'qa', tenantScope: 'brand', locale: 'zh-CN', roleId: 'operator', route: '/items' },
    claims: { required: ['claim-1'], observed: ['claim-1'], verified: [] },
    operationReceipts: [{ operationKey: 'item:observe', method: 'click', observed: true, status: 'passed' as const }],
    assertionReceipts: [{
      claimId: 'claim-1',
      status: 'observed-mismatch' as const,
      expectedValue: '不可点击',
      actualValue: '可点击',
      actualStatus: 'observed' as const,
      observationChannel: 'ui' as const,
      authority: 'user-visible' as const,
      comparison: 'mismatched' as const,
    }],
    cleanup: { apiZeroResidue: true, uiZeroResidue: true },
  };
  const fullReceipt = { ...receipt, evidenceFingerprint: fingerprintReceiptEvidence(receipt) };
  fs.writeFileSync(path.join(root, 'receipt.json'), JSON.stringify(fullReceipt));
  fs.writeFileSync(path.join(root, 'classification.json'), JSON.stringify({ classification: 'product-defect' }));
  fs.writeFileSync(path.join(root, 'failure.png'), 'png');
  fs.writeFileSync(path.join(root, 'case-result.json'), JSON.stringify({
    status: 'failed', labels: [{ name: 'caseId', value: 'TC-ITEM-ADD-035' }],
    steps: [
      { name: '[环境] 登录 → 商品中心 → 商品', status: 'passed' },
      { name: '[业务操作] 点击主图', status: 'passed', attachments: [{ name: '业务操作执行收据', type: 'application/json', source: 'receipt.json' }] },
      { name: '[断言] 核对主图', status: 'failed', steps: [{ name: '期望：不可点击｜实际：可点击｜结果：失败', status: 'failed', attachments: [{ name: '失败截图附件', type: 'image/png', source: 'failure.png' }, { name: '失败分类', type: 'application/json', source: 'classification.json' }] }] },
      { name: '[清理] API/UI 零残留', status: 'passed' },
      { name: '执行结论：失败', status: 'failed' },
    ],
  }));
  const report = auditProductCenter420ReceiptClosure({
    resultsDir: root,
    coverage: { summary: { total: 2, actualResultCases: 1, notRun: 1 }, cases: [
      { caseId: 'TC-ITEM-ADD-035', title: '主图', module: 'item', executionStatus: 'failed', governanceStatus: 'execute' },
      { caseId: 'TC-ITEM-ADD-027', title: '删除保护', module: 'item', executionStatus: 'not-run', governanceStatus: 'handled' },
    ] },
    governance: {
      executionCases: [{ caseId: 'TC-ITEM-ADD-035', status: 'failed' }],
      nonExecutionTasks: [{ caseId: 'TC-ITEM-ADD-027', action: 'handled', reason: '已有当前处理证据', bindingFingerprint: 'e'.repeat(64) }],
    },
    optimizationPlan: { caseFingerprints: { 'TC-ITEM-ADD-035': 'c'.repeat(64) }, implementationFingerprints: { 'TC-ITEM-ADD-035': 'd'.repeat(64) } },
  });
  expect(report.status).toBe('pass');
  expect(report.summary.completeCases).toBe(1);
  expect(report.summary.classifiedCases).toBe(1);
  expect(report.rerunPlan.requiredCaseIds).toEqual([]);
});

test('平台报告层变化不使 static-verify 用例的既有业务收据过期', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-420-receipt-platform-only-'));
  const receipt = {
    receiptVersion: '3.1.0',
    caseId: 'TC-ITEM-STD-001',
    caseFingerprint: 'a'.repeat(64),
    implementationFingerprint: 'b'.repeat(64),
    executionContext: { environmentId: 'qa', tenantScope: 'brand', locale: 'zh-CN', roleId: 'operator', route: '/items' },
    claims: { required: ['claim-1'], observed: ['claim-1'], verified: ['claim-1'] },
    operationReceipts: [{ operationKey: 'item:open', sequence: 1, method: 'click', observed: true, status: 'passed' as const }],
    assertionReceipts: [{
      claimId: 'claim-1', status: 'verified' as const, expectedValue: '列表可见', actualValue: '列表可见',
      actualStatus: 'observed' as const, observationChannel: 'ui' as const,
      authority: 'user-visible' as const, comparison: 'matched' as const,
    }],
    cleanup: { apiZeroResidue: true, uiZeroResidue: true },
  };
  const fullReceipt = { ...receipt, evidenceFingerprint: fingerprintReceiptEvidence(receipt) };
  fs.writeFileSync(path.join(root, 'receipt.json'), JSON.stringify(fullReceipt));
  fs.writeFileSync(path.join(root, 'case-result.json'), JSON.stringify({
    status: 'passed', labels: [{ name: 'caseId', value: 'TC-ITEM-STD-001' }],
    steps: [
      { name: '[环境] 登录 → 商品中心 → 商品', status: 'passed' },
      { name: '[业务操作] 打开商品列表', status: 'passed', attachments: [{ name: '业务操作执行收据', type: 'application/json', source: 'receipt.json' }] },
      { name: '[断言] 核对商品列表', status: 'passed', steps: [{ name: '期望：列表可见｜实际：列表可见｜结果：通过', status: 'passed' }] },
      { name: '[清理] API/UI 零残留', status: 'passed' },
      { name: '执行结论：通过', status: 'passed' },
    ],
  }));
  const report = auditProductCenter420ReceiptClosure({
    resultsDir: root,
    coverage: { summary: { total: 1, actualResultCases: 1, notRun: 0 }, cases: [{ caseId: 'TC-ITEM-STD-001', title: '列表', module: 'item', executionStatus: 'passed', governanceStatus: 'execute' }] },
    governance: { executionCases: [{ caseId: 'TC-ITEM-STD-001', status: 'passed' }], nonExecutionTasks: [] },
    optimizationPlan: {
      caseFingerprints: { 'TC-ITEM-STD-001': 'a'.repeat(64) },
      implementationFingerprints: { 'TC-ITEM-STD-001': 'c'.repeat(64) },
      businessImplementationFingerprints: { 'TC-ITEM-STD-001': 'b'.repeat(64) },
      caseDecisions: { 'TC-ITEM-STD-001': { decision: 'static-verify', impactType: 'platform-only' } },
    },
  });
  expect(report.findings.map((item) => item.code)).not.toContain('IMPLEMENTATION_FINGERPRINT_STALE');
  expect(report.status).toBe('pass');
});
