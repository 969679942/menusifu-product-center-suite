import path from 'node:path';
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { buildProductCenterGroupRemainingLedger } from '../../utils/product-center-group-remaining-ledger';
import { classifyProductCenterFailure } from '../../utils/product-center-failure-classifier';
import { classifyProductCenterItemResponsibility } from '../../utils/product-center-item-practice-evidence';

const root = path.resolve(__dirname, '../..');
const bindings = JSON.parse(fs.readFileSync(path.join(root, 'contracts/product-center/group/product-center-group-bindings.json'), 'utf8')) as {
  cases: Parameters<typeof buildProductCenterGroupRemainingLedger>[0]['bindings'];
};

test('原 58 条台账必须保留关闭记录且不得把产品发现记为通过', () => {
  const ledger = buildProductCenterGroupRemainingLedger({ projectRoot: root, bindings: bindings.cases });
  expect(ledger.summary.cohortTotal).toBe(58);
  expect(ledger.summary.remaining).toBe(57);
  expect(ledger.summary.automatedClosed).toBe(1);
  expect(ledger.summary.productFindings).toBe(47);
  expect(ledger.summary.industryAuthorizationRequired).toBe(3);
  expect(ledger.summary.terminalCapabilityRequired).toBe(7);
  expect(ledger.summary.automationGap).toBe(0);
  expect(ledger.cases).toHaveLength(58);
  expect(ledger.cases.filter((item) => item.classification === 'product-finding')
    .every((item) => item.expectationReceipts.every((receipt) => receipt.status !== 'verified'))).toBe(true);
  expect(ledger.cases.find((item) => item.caseId === 'TC-GRP-SPEC-018')).toMatchObject({
    classification: 'automated-pass',
    disposition: 'automated-closed',
    cleanupEvidenceComplete: true,
    productFindingEstablished: false,
  });
  const closed = ledger.cases.find((item) => item.caseId === 'TC-GRP-SPEC-018')!;
  expect(closed.evidence.map((item) => item.path)).toContain(
    'Merchant Center UITest/output/product-center-group-remaining58-current-20260815-r8.json',
  );
});

test('产品发现名单不得把 locator 超时覆盖为产品失败', () => {
  const failure = classifyProductCenterFailure({ message: 'TimeoutError: locator.innerText: Timeout 15000ms exceeded.' });
  expect(failure.category).toBe('locator-drift');
  expect(classifyProductCenterItemResponsibility(failure.category, true)).toBe('automation-gap');
  const ledger = buildProductCenterGroupRemainingLedger({ projectRoot: root, bindings: bindings.cases });
  expect(ledger.cases.find((item) => item.caseId === 'TC-GRP-ADD-022')?.disposition).toBe('evidence-complete');
});

test('每条产品发现必须有一对一预期收据和不可变证据哈希', () => {
  const ledger = buildProductCenterGroupRemainingLedger({ projectRoot: root, bindings: bindings.cases });
  for (const item of ledger.cases.filter((candidate) => candidate.classification === 'product-finding')) {
    const binding = bindings.cases.find((candidate) => candidate.caseId === item.caseId)!;
    expect(item.expectationReceipts.map((receipt) => receipt.assertionId)).toEqual(binding.assertionIds);
    expect(new Set(item.expectationReceipts.map((receipt) => receipt.receiptId)).size).toBe(binding.assertionIds.length);
    expect(item.evidence.length, item.caseId).toBeGreaterThan(0);
    expect(item.evidence.every((evidence) => /^[a-f0-9]{64}$/.test(evidence.sha256))).toBe(true);
  }
});

test('正式运行报告必须消费原 58 条处理台账而非另算一套口径', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/build-product-center-group-final-report.ts'), 'utf8');
  expect(source).toContain("const remainingLedgerPath = path.join(deliverableRoot, 'remaining-58-ledger.json')");
  expect(source).toContain("remaining58Ledger: 'deliverables/product-center-group/remaining-58-ledger.json'");
  expect(source).toContain('remainingEvidenceLedger: {');
  expect(source).toContain("item.disposition === 'automated-closed'");
});
