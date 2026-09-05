import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterGroupFastReview } from '../../utils/product-center-group-fast-review';

const projectRoot = path.resolve(__dirname, '../..');
const ledger = JSON.parse(fs.readFileSync(
  path.resolve(projectRoot, '../deliverables/product-center-group/remaining-58-ledger.json'),
  'utf8',
)) as { cases: Array<any> };

function buildReview() {
  return buildProductCenterGroupFastReview(
    ledger.cases.filter((item) => item.classification === 'product-finding'),
  );
}

test('6 条已确认通过和 16 条套餐新版重基线用例必须移出待审批队列', () => {
  const review = buildReview();
  expect(review.summary).toEqual({
    sourceFindings: 42,
    total: 20,
    resolvedPassed: 6,
    resolvedRebaselined: 16,
    decisionPackages: 1,
    acceptCurrentUiContract: 0,
    acceptCurrentBlockingFeedback: 0,
    productFixRecommended: 20,
    packageScopeDecision: 0,
  });
  expect(review.cases).toHaveLength(20);
  expect(review.resolvedCases).toHaveLength(22);
  expect(review.decisionPackages.map((item) => String(item.decisionId))).not.toContain('GRP-DEC-FEEDBACK');
  expect(review.decisionPackages.map((item) => String(item.decisionId))).not.toContain('GRP-DEC-PACKAGE');
  expect(review.cases.some((item) => item.caseId === 'TC-GRP-ADD-003')).toBe(false);
  expect(review.resolvedCases.some((item) => item.caseId === 'TC-GRP-ADD-003' && item.result === 'passed')).toBe(true);
  expect(review.resolvedCases.some((item) => item.caseId === 'TC-GRP-PKG-008' && item.result === 'rebaselined')).toBe(true);
});

test('待审批和已通过用例必须保留预期、观察和证据哈希', () => {
  const review = buildReview();
  for (const item of [...review.cases, ...review.resolvedCases]) {
    expect(item.expected.length, item.caseId).toBeGreaterThan(0);
    expect(item.observed.length, item.caseId).toBeGreaterThan(0);
    expect(item.evidencePaths.length, item.caseId).toBeGreaterThan(0);
    expect(item.evidenceHashes.every((hash) => /^[a-f0-9]{64}$/.test(hash)), item.caseId).toBe(true);
  }
});

test('已通过用例必须应用按钮态与末项提示规则', () => {
  const review = buildReview();
  expect(review.resolvedCases.find((item) => item.caseId === 'TC-GRP-ADD-003')).toMatchObject({
    result: 'passed',
    expected: expect.arrayContaining(['必填项全部填写但未添加加料明细时，“确定”按钮保持置灰，无法提交。']),
    recommendation: '通过：符合加料组至少包含一个加料选项的前端预校验规则。',
  });
  expect(review.resolvedCases.find((item) => item.caseId === 'TC-GRP-ADD-032')).toMatchObject({
    result: 'passed',
    expected: expect.arrayContaining(['删除组内唯一加料选项时，页面提示“该组只有一个选项，不能删除”。']),
    recommendation: '通过：提示文案及末项不可删除行为均符合已确认业务规则。',
  });
});
