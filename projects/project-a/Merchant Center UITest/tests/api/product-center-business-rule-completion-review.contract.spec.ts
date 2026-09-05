import { expect, test } from '@playwright/test';
import {
  buildProductCenterBusinessRuleCompletionReviewQueue,
  renderProductCenterBusinessRuleCompletionReviewMarkdown,
} from '../../adapters/product-center/product-center-business-rule-completion-review-adapter';
import {
  loadCurrentProductCenterSupplementalCaseEvidence,
} from '../../scripts/build-product-center-business-rule-completion-review';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from '../../scripts/build-product-center-business-rule-lifecycle-snapshot';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '../..');
const expectedRerunCaseIds: string[] = [];
const minimumPreservedCaseIds = [
  'TC-ITEM-PKG-046', 'TC-ITEM-STD-006', 'TC-ITEM-STD-007', 'TC-ITEM-STD-037',
];

function currentQueue() {
  const snapshot = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
  const trigger = JSON.parse(fs.readFileSync(path.join(
    projectRoot,
    'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
  ), 'utf8')) as { rerunCaseIds: string[]; preservedPassedCaseIds: string[] };
  return buildProductCenterBusinessRuleCompletionReviewQueue(
    {
      ...snapshot,
      executionImpact: {
        ...snapshot.executionImpact,
        existingPassedCasesInvalidated: trigger.rerunCaseIds.length > 0,
        invalidatedCaseIds: trigger.rerunCaseIds,
        rerunCaseIds: trigger.rerunCaseIds,
        preservedPassedCaseIds: trigger.preservedPassedCaseIds,
      },
    },
    loadCurrentProductCenterSupplementalCaseEvidence(snapshot.rules.flatMap((rule) => rule.linkedCaseIds)),
  );
}

test.describe('商品中心业务规则补全评审合同', () => {
  test('正式规则晋级后只保留真实技术补全项且不将历史收据升级为当前通过', () => {
    const queue = currentQueue();
    const snapshot = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
    const generationReadyRules = snapshot.rules.filter((rule) => rule.verificationStatus === 'verified').length;
    const revalidationRequiredRules = snapshot.rules.filter((rule) => rule.verificationStatus === 'revalidation-required').length;

    expect(queue.summary).toEqual({
      totalReviews: revalidationRequiredRules,
      mappedRuleCompletionReviews: revalidationRequiredRules,
      invalidBindingReviews: 0,
      generationReadyRules,
      existingPassedCasesInvalidated: expectedRerunCaseIds.length,
      rerunCasesNow: expectedRerunCaseIds.length,
    });
    expect(queue.status).toBe('technical-remediation-required');
    expect(queue.items).toHaveLength(revalidationRequiredRules);
    expect(queue.items.every((item) => item.kind === 'complete-mapped-rule')).toBe(true);
    expect(queue.items.flatMap((item) => item.kind === 'complete-mapped-rule' ? item.questions : [])
      .every((question) => question.resolutionMode === 'evidence-backed-technical-mapping')).toBe(true);
    expect(queue.rerunCaseIds).toEqual(expectedRerunCaseIds);
    expect(queue.preservedPassedCaseIds).toEqual(expect.arrayContaining(minimumPreservedCaseIds));
  });

  test('技术字段缺口不得生成人工产品确认', () => {
    const queue = currentQueue();
    expect(queue.sharedQuestions).toEqual([]);
    expect(queue.items.flatMap((item) => item.kind === 'complete-mapped-rule' ? item.questions : [])
      .filter((question) => question.resolutionMode === 'human-confirmation')).toEqual([]);
  });

  test('中文清单应展示技术补全和精确增量重验影响', () => {
    const queue = currentQueue();
    const markdown = renderProductCenterBusinessRuleCompletionReviewMarkdown(queue);

    expect(markdown).toContain('# 商品中心业务规则补全评审清单');
    expect(markdown).toContain(`待评审：${queue.summary.totalReviews} 条`);
    expect(markdown).toContain(`当前可生成用例：${queue.summary.generationReadyRules} 条`);
    expect(markdown).toContain(`当前增量重验：${expectedRerunCaseIds.length} 条`);
    expect(markdown).toContain('增量重验用例：无');
    expect(markdown).toContain('### 待自动技术补全');
    expect(markdown).not.toContain('共享产品确认');
  });
});
