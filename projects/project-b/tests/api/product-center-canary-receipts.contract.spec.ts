import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

test('Canary 收据按失败证据分类且不伪造缺失收据', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const filePath = path.join(projectRoot, 'output/system-test-optimization/product-center-non-seasoning-canary-receipts-20260830-v1.json');
  expect(fs.existsSync(filePath)).toBe(true);
  const receipts = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Array<{
    caseId: string;
    status: string;
    failureCategory?: string;
    evidenceComplete: boolean;
    operationReceiptCount: number;
    assertionReceiptCount: number;
  }>;
  expect(receipts).toHaveLength(81);
  expect(receipts.filter((item) => item.status === 'passed')).toHaveLength(77);
  expect(receipts.filter((item) => item.status === 'failed')).toHaveLength(4);
  expect(receipts.find((item) => item.caseId === 'TC-GRP-PKG-009')).toEqual(expect.objectContaining({
    status: 'failed', failureCategory: 'automation-gap', evidenceComplete: false,
  }));
  expect(receipts.find((item) => item.caseId === 'TC-ITEM-STD-031')).toEqual(expect.objectContaining({
    status: 'failed', failureCategory: 'automation-gap', evidenceComplete: false,
  }));
  expect(receipts.filter((item) => item.status === 'passed').every((item) => (
    item.evidenceComplete && item.operationReceiptCount > 0 && item.assertionReceiptCount > 0
  ))).toBe(true);
});

test('Canary 收据不得让报告内嵌指纹覆盖当前适配器指纹', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const source = fs.readFileSync(
    path.join(projectRoot, 'scripts/build-product-center-canary-optimization-receipts.ts'),
    'utf8',
  );
  expect(source).toContain('caseFingerprint: current.caseFingerprint');
  expect(source).toContain('implementationFingerprint: current.implementationFingerprint');
  expect(source).not.toContain('caseFingerprint: imported.caseFingerprint');
  expect(source).not.toContain("implementationFingerprint: imported.implementationFingerprint ?? ''");
  expect(source).toContain('readOptimizationFindingReceipt');
  expect(source).toContain("receipt.failureCategory !== 'product-failure'");
  expect(source).toContain('receipt.operationReceiptCount < 1');
});
