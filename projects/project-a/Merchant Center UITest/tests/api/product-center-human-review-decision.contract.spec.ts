import { expect, test } from '@playwright/test';
import decisions from '../../contracts/product-center/reviews/human-review-decisions.json';
import { compileHumanReviewDecisions, type HumanReviewDecisionDocument } from '../../utils/human-review-decision-compiler';

test.describe('商品中心人工审核决定编译', () => {
  test('结构化决定应编译为四个字段覆盖两个排除规则和四个未决项解决', async () => {
    const curation = compileHumanReviewDecisions(decisions as HumanReviewDecisionDocument);

    expect(curation.curations?.overrides).toHaveLength(4);
    expect(curation.curations?.additions).toHaveLength(2);
    expect(curation.curations?.tombstones).toHaveLength(4);
    expect(curation.curations?.overrides?.map((item) => item.patch.evidence)).toEqual([
      expect.objectContaining({ semanticMaxLength: { exact: 50, source: 'human-review' } }),
      expect.objectContaining({ semanticMaxLength: { exact: 10, source: 'human-review' } }),
      expect.objectContaining({ semanticMaxLength: { exact: 50, source: 'human-review' } }),
      expect.objectContaining({ semanticMaxLength: { exact: 10, source: 'human-review' } }),
    ]);
  });

  test('缺少审核人时必须阻断编译', async () => {
    const invalid = structuredClone(decisions) as HumanReviewDecisionDocument;
    invalid.decisions[0].reviewedBy = '';

    expect(() => compileHumanReviewDecisions(invalid)).toThrow('人工审核决定缺少审核人');
  });
});
